const assert = require('node:assert/strict');

const {
  FinalPackageSchema,
  TrendBriefSchema,
} = require('../backend/services/agentStudioSchemas.cjs');
const {
  createOpenAIAgentRunner,
  orchestrateAgentStudio,
  orchestrateAgentStudioHybrid,
} = require('../backend/services/agentStudioAgents.cjs');
const fixture = require('./fixtures/agent-studio-coffee-shop.cjs');

const workspace = {
  id: 'ws_coffee',
  name: 'Reset Coffee Kyiv',
  brief: {
    businessType: 'Independent coffee shop',
    product: 'Espresso drinks and fresh pastries',
    location: 'Kyiv, Ukraine',
    audience: 'Busy professionals walking to work',
    toneOfVoice: 'Warm, quick, lightly playful',
    cta: 'Visit before work',
  },
};

function createMockAgentRunner({ revise = false, reject = false } = {}) {
  const calls = [];
  let criticCalls = 0;
  const outputs = {
    trend_analyst: fixture.selectedTrend,
    brand_strategist: fixture.brandStrategy,
    creative_producer: fixture.creative,
    hybrid_producer: fixture.creative,
    content_planner: fixture.contentPlan,
    jeryk_manager: fixture.managerReview,
  };
  return {
    calls,
    async runAgent(request) {
      calls.push(request);
      if (request.agentId === 'critic') {
        criticCalls += 1;
        if (reject) return {
          ...fixture.acceptEvaluation,
          decision: 'reject',
          blockingIssues: ['The result cannot be grounded in the available evidence.'],
          summary: 'The result failed the evidence gate.',
        };
        if (revise && criticCalls === 1) return fixture.reviseEvaluation;
        return fixture.acceptEvaluation;
      }
      return outputs[request.agentId];
    },
  };
}

(async () => {
  const events = [];
  const findRunner = createMockAgentRunner({ revise: true });
  const findResult = await orchestrateAgentStudio({
    runId: 'run_find',
    input: { mode: 'find_trend', objective: 'Drive morning visits' },
    workspace,
    signals: [{
      id: fixture.selectedTrend.signalId,
      title: fixture.selectedTrend.title,
      sourceUrl: fixture.selectedTrend.sourceUrl,
      score: 91,
    }],
    runAgent: findRunner.runAgent,
    analyzeVideo: async () => fixture.evidence,
    emit: (event) => events.push(event),
  });

  assert.equal(findResult.type, 'completed');
  assert.equal(FinalPackageSchema.safeParse(findResult.finalPackage).success, true);
  assert.deepEqual(findRunner.calls.map((call) => call.agentId), [
    'trend_analyst',
    'brand_strategist',
    'creative_producer',
    'critic',
    'creative_producer',
    'critic',
    'content_planner',
    'jeryk_manager',
  ]);
  assert.equal(findRunner.calls[4].input.revisionInstructions.length, 1);
  assert.equal(events.some((event) => event.agent === 'Critic' && event.status === 'revised'), true);
  assert.equal(events.at(-1).agent, 'Jeryk Manager');
  assert.equal(events.at(-1).status, 'completed');

  const adaptRunner = createMockAgentRunner();
  const adaptResult = await orchestrateAgentStudio({
    runId: 'run_adapt',
    input: {
      mode: 'adapt_reel',
      objective: 'Build a weekly coffee content system',
      signalId: 'signal_coffee_reveal',
    },
    workspace,
    signals: [{
      id: 'signal_coffee_reveal',
      title: 'The quiet setup and sensory reveal',
      sourceUrl: 'https://example.com/reels/coffee-reveal',
    }],
    runAgent: adaptRunner.runAgent,
    analyzeVideo: async () => fixture.evidence,
  });
  assert.equal(adaptResult.type, 'completed');
  assert.equal(adaptRunner.calls.some((call) => call.agentId === 'trend_analyst'), false);
  assert.equal(adaptResult.finalPackage.selectedTrend.signalId, 'signal_coffee_reveal');

  const hybridRunner = createMockAgentRunner({ revise: true });
  const hybridEvents = [];
  const hybridResult = await orchestrateAgentStudioHybrid({
    runId: 'run_hybrid',
    input: { mode: 'adapt_reel', objective: 'Build a weekly coffee content system', signalId: 'signal_coffee_reveal' },
    workspace,
    finalPackage: adaptResult.finalPackage,
    candidateIds: ['hero_reset', 'alt_forecast'],
    runAgent: hybridRunner.runAgent,
    emit: (event) => hybridEvents.push(event),
  });
  assert.equal(FinalPackageSchema.safeParse(hybridResult.finalPackage).success, true);
  assert.deepEqual(hybridResult.finalPackage.hybrid.sourceCandidateIds, ['hero_reset', 'alt_forecast']);
  assert.deepEqual(hybridRunner.calls.map((call) => call.agentId), [
    'hybrid_producer',
    'critic',
    'hybrid_producer',
    'critic',
    'content_planner',
    'jeryk_manager',
  ]);
  assert.equal(hybridEvents.some((event) => event.agent === 'Hybrid Producer' && event.status === 'completed'), true);

  const contextRunner = createMockAgentRunner();
  const contextResult = await orchestrateAgentStudio({
    runId: 'run_context',
    input: {
      mode: 'adapt_reel',
      objective: 'Drive visits',
      sourceUrl: 'https://example.com/unavailable',
    },
    workspace,
    runAgent: contextRunner.runAgent,
    analyzeVideo: async () => ({
      ...fixture.evidence,
      availability: 'unavailable',
      items: [],
      unknowns: ['The source did not expose playable video.'],
      requiresContext: true,
    }),
  });
  assert.equal(contextResult.type, 'needs_context');
  assert.equal(contextResult.contextRequest.question.length > 10, true);
  assert.equal(contextRunner.calls.length, 0);

  const rejectRunner = createMockAgentRunner({ reject: true });
  await assert.rejects(
    () => orchestrateAgentStudio({
      runId: 'run_reject',
      input: { mode: 'find_trend', objective: 'Drive morning visits' },
      workspace,
      signals: [{ id: 'signal_coffee_reveal', title: 'Reveal', sourceUrl: 'https://example.com/reel' }],
      runAgent: rejectRunner.runAgent,
      analyzeVideo: async () => fixture.evidence,
    }),
    (error) => error.code === 'quality_rejected',
  );

  const sdkCalls = [];
  class FakeAgent {
    constructor(config) {
      this.config = config;
      sdkCalls.push(['agent', config]);
    }
  }
  class FakeRunner {
    constructor(config) {
      this.config = config;
      sdkCalls.push(['runner', config]);
    }

    async run(agent, prompt, options) {
      sdkCalls.push(['run', { agent, prompt, options }]);
      return { finalOutput: fixture.selectedTrend };
    }
  }
  const sdkRunner = createOpenAIAgentRunner({
    model: 'gpt-5.6',
    maxTurns: 7,
    sdkLoader: async () => ({ Agent: FakeAgent, Runner: FakeRunner }),
    requireApiKey: false,
  });
  const sdkOutput = await sdkRunner({
    agentId: 'trend_analyst',
    input: { objective: 'Drive visits', signals: [] },
    outputSchema: TrendBriefSchema,
    groupId: 'run_sdk_test',
  });
  assert.equal(sdkOutput.title, fixture.selectedTrend.title);
  assert.equal(sdkCalls.find(([type]) => type === 'agent')[1].model, 'gpt-5.6');
  assert.equal(sdkCalls.find(([type]) => type === 'runner')[1].traceIncludeSensitiveData, false);
  assert.equal(sdkCalls.find(([type]) => type === 'run')[1].options.maxTurns, 7);
  assert.equal(sdkCalls.find(([type]) => type === 'run')[1].prompt.includes('<dzhero_data>'), true);

  console.log('Agent Studio orchestrator checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
