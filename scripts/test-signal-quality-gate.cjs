const assert = require('node:assert/strict');
const {
  applySignalQualityPolicy,
  analyzeSignalQualityVideo,
  buildSignalQualityPrompt,
  evaluateSignalQuality,
  isSignalQualityBorderline,
  loadSignalQualityGateConfig,
  resolveSignalQualityRuntimeGuards,
} = require('../backend/services/signalQualityGate.cjs');

const config = loadSignalQualityGateConfig();
assert.equal(config.version, 3.1);
assert.equal(config.policy, 'evidence_first_modes_with_uncertainty');
assert.equal(config.maxVideoAnalysesPerRun, 1);

const usefulAssessment = {
  accessible: true,
  summary: 'A creator demonstrates a workflow from setup to a visible result.',
  derivedClaims: {
    centralIdea: {
      text: 'Replace repeated manual research with a supervised workflow.',
      evidenceIds: ['obs_setup', 'obs_process', 'obs_result'],
      supportLevel: 'demonstrated',
    },
    contentMechanic: {
      text: 'Show the setup, process, and visible result.',
      evidenceIds: ['obs_setup', 'obs_process', 'obs_result'],
      supportLevel: 'demonstrated',
    },
    visualExecution: {
      text: 'A narrated screen recording.',
      evidenceIds: ['obs_setup', 'obs_process', 'obs_result'],
      supportLevel: 'demonstrated',
    },
    adaptationTemplate: {
      text: '[task] to [workflow] to [result]',
      evidenceIds: ['obs_setup', 'obs_process', 'obs_result'],
      supportLevel: 'inferred',
    },
  },
  scores: {
    contentValue: 8,
    adaptability: 9,
    topicClarity: 7,
    hookStrength: 6,
    payoffStrength: 5,
    brandRelevance: 100,
  },
  evidenceConfidence: 0.92,
  slopIndicators: [],
  observations: [
    {
      id: 'obs_setup',
      timestamp: '00:02',
      source: 'visual',
      kind: 'setup',
      description: 'A manual task list is visible.',
      confidence: 0.94,
    },
    {
      id: 'obs_process',
      timestamp: '00:07-00:18',
      source: 'visual',
      kind: 'process',
      description: 'The creator configures and runs an agent workflow.',
      confidence: 0.94,
    },
    {
      id: 'obs_result',
      timestamp: '00:21',
      source: 'visual',
      kind: 'result',
      description: 'The completed output is shown.',
      confidence: 0.94,
    },
  ],
  evidenceChains: [{
    mode: 'process_demo',
    beforeEvidenceId: 'obs_setup',
    actionEvidenceId: 'obs_process',
    afterEvidenceId: 'obs_result',
    subject: 'research task',
    beforeState: 'A manual task list is pending.',
    afterState: 'A completed workflow output is visible.',
    supportLevel: 'demonstrated',
    directlyObserved: true,
    ambiguityReasons: [],
  }],
  unknowns: [],
  pass: false,
};

const usefulDecision = applySignalQualityPolicy(usefulAssessment, config);
assert.equal(usefulDecision.decision, 'accept');
assert.equal(usefulDecision.admittedToBank, true);
assert.equal(usefulDecision.admissionMode, 'process_demo');
assert.equal(usefulDecision.rejectionReasons.length, 0);
assert.equal(usefulDecision.generatedContentPolicy, 'ignore_origin');
assert.equal(usefulDecision.brandRelevance, 100);
assert.equal(usefulDecision.providerPassIgnored, true);
assert.equal(usefulDecision.transferableMechanic, usefulDecision.contentMechanic);
assert.equal(usefulDecision.qualityScore < 10, true);

const decorativeTeaserAssessment = {
  ...structuredClone(usefulAssessment),
  summary: 'A slogan and decorative interface are shown.',
  derivedClaims: {
    centralIdea: {
      text: 'An interface for agents.',
      evidenceIds: ['obs_slogan', 'obs_visual'],
      supportLevel: 'explicit',
    },
    contentMechanic: {
      text: 'Demystifying backend workflows.',
      evidenceIds: ['obs_slogan', 'obs_visual'],
      supportLevel: 'inferred',
    },
    visualExecution: {
      text: 'A 3D office metaphor.',
      evidenceIds: ['obs_visual'],
      supportLevel: 'demonstrated',
    },
    adaptationTemplate: {
      text: 'The Sims for [system].',
      evidenceIds: ['obs_slogan', 'obs_visual'],
      supportLevel: 'inferred',
    },
  },
  scores: {
    contentValue: 100,
    adaptability: 100,
    topicClarity: 100,
    hookStrength: 100,
    payoffStrength: 100,
    brandRelevance: 100,
  },
  observations: [
    {
      id: 'obs_slogan',
      timestamp: '00:00',
      source: 'onscreen_text',
      kind: 'claim',
      description: 'The Sims for managing AI agents.',
      confidence: 1,
    },
    {
      id: 'obs_visual',
      timestamp: '00:03-00:08',
      source: 'visual',
      kind: 'visual_device',
      description: 'Avatars move inside an isometric office beside Kanban cards.',
      confidence: 0.95,
    },
  ],
  evidenceChains: [],
  pass: true,
};

const decorativeDecision = applySignalQualityPolicy(decorativeTeaserAssessment, config);
assert.equal(decorativeDecision.decision, 'reject');
assert.equal(decorativeDecision.admittedToBank, false);
assert.equal(decorativeDecision.providerPassIgnored, true);
assert.equal(
  decorativeDecision.rejectionReasons.includes('inferred_only_content_mechanic'),
  true,
);
assert.equal(
  decorativeDecision.rejectionReasons.includes('no_qualifying_evidence_mode'),
  true,
);

const unavailableDecision = applySignalQualityPolicy({
  ...structuredClone(decorativeTeaserAssessment),
  accessible: false,
  observations: [],
  derivedClaims: {
    centralIdea: { text: '', evidenceIds: [], supportLevel: 'inferred' },
    contentMechanic: { text: '', evidenceIds: [], supportLevel: 'inferred' },
    visualExecution: { text: '', evidenceIds: [], supportLevel: 'inferred' },
    adaptationTemplate: { text: '', evidenceIds: [], supportLevel: 'inferred' },
  },
  unknowns: ['The video file was unavailable.'],
}, config);
assert.equal(unavailableDecision.decision, 'uncertain');
assert.equal(unavailableDecision.admittedToBank, false);
assert.equal(unavailableDecision.rejectionReasons.includes('video_unavailable'), true);
assert.equal(unavailableDecision.rejectionReasons.includes('insufficient_video_evidence'), true);

const prompt = buildSignalQualityPrompt({
  signal: {
    title: 'AI agent dashboard',
    caption: 'High-engagement metadata must not decide quality.',
    views: 307500,
    saves: 8780,
  },
  workspace: {
    brief: {
      businessType: 'AI tools',
      niche: 'vibe coding',
      audience: 'builders using coding agents',
    },
  },
  config,
});
assert.match(prompt, /server computes admission/i);
assert.match(prompt, /Numeric scores are ranking hints only/i);
assert.match(prompt, /server will ignore/i);
assert.match(prompt, /do not by themselves prove explanation/i);
assert.match(prompt, /explicit only/i);
assert.match(prompt, /three separate before\/action\/after observations/i);
assert.match(prompt, /directlyObserved/i);
assert.match(prompt, /camera move/i);

assert.equal(isSignalQualityBorderline(usefulDecision, config), false);

(async () => {
  const evaluated = await evaluateSignalQuality({
    config,
    analyzeVideo: async () => decorativeTeaserAssessment,
  });
  assert.equal(evaluated.decision, 'reject');

  const interactionRequests = [];
  const longCaption = 'X'.repeat(20_000);
  let guardedAnalysis = null;
  let guardedError = null;
  try {
    guardedAnalysis = await analyzeSignalQualityVideo({
    signal: {
      videoUrl: 'https://media.invalid/video.mp4?signature=memory-only',
      title: 'Bounded signal',
      caption: longCaption,
      duration: 44,
      importedMetadata: { platform: 'tiktok', duration: 44 },
    },
    workspace: { brief: { niche: 'AI tools' } },
    config,
    apiKey: 'offline-gemini-key',
    mediaApiToken: 'offline-apify-key',
    includeAuditTrace: true,
    runtimeGuards: resolveSignalQualityRuntimeGuards(),
    fetchImpl: async (url, options = {}) => {
      const target = String(url);
      if (target.startsWith('https://media.invalid/')) {
        return new Response(Buffer.from('offline-video-bytes'), {
          status: 200,
          headers: { 'content-type': 'video/mp4', 'content-length': '19' },
        });
      }
      if (target.includes('/upload/v1beta/files')) {
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-goog-upload-url': 'https://upload.invalid/session' },
        });
      }
      if (target === 'https://upload.invalid/session') {
        return new Response(JSON.stringify({
          file: { name: 'files/offline', uri: 'https://files.invalid/offline', mimeType: 'video/mp4', state: 'ACTIVE' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (target.endsWith('/interactions')) {
        const request = JSON.parse(options.body);
        interactionRequests.push(request);
        if (Object.prototype.hasOwnProperty.call(request, 'max_output_tokens')) {
          return new Response(JSON.stringify({
            error: { message: "Unknown parameter 'max_output_tokens'." },
          }), { status: 400, headers: { 'content-type': 'application/json' } });
        }
        assert.equal(request.generation_config?.max_output_tokens, 8192);
        return new Response(JSON.stringify({
          model: 'gemini-3.5-flash',
          output_text: JSON.stringify(decorativeTeaserAssessment),
          usage: {
            total_input_tokens: 1000,
            total_output_tokens: 200,
            total_thought_tokens: 100,
            total_tokens: 1300,
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (options.method === 'DELETE') return new Response('{}', { status: 200 });
      throw new Error(`unexpected offline request ${target}`);
    },
    });
  } catch (error) {
    guardedError = error;
  }
  assert.equal(interactionRequests.length, 1);
  assert.equal(interactionRequests[0].max_output_tokens, undefined);
  assert.equal(interactionRequests[0].generation_config?.max_output_tokens, 8192);
  assert.equal(guardedError, null);
  const promptText = interactionRequests[0].input[1].text;
  assert.equal((promptText.match(/X/g) || []).length <= 6000, true);
  assert.equal(guardedAnalysis.auditTrace.model, 'gemini-3.5-flash');
  assert.equal(guardedAnalysis.auditTrace.normalizedUsage.inputTokens, 1000);
  assert.equal(guardedAnalysis.auditTrace.normalizedUsage.outputTokens, 200);
  assert.equal(guardedAnalysis.auditTrace.normalizedUsage.thoughtTokens, 100);
  assert.equal(guardedAnalysis.auditTrace.calculatedCostUsd, 0.0042);
  assert.equal(guardedAnalysis.auditTrace.httpOperations.mediaGet, 1);
  assert.equal(guardedAnalysis.auditTrace.httpOperations.generate, 1);
  assert.equal(guardedAnalysis.auditTrace.httpOperations.cleanup, 1);

  let overDurationFetches = 0;
  await assert.rejects(() => analyzeSignalQualityVideo({
    signal: { videoUrl: 'https://media.invalid/too-long.mp4', duration: 61 },
    apiKey: 'offline-key',
    config,
    fetchImpl: async () => { overDurationFetches += 1; },
  }), /duration_exceeded/);
  assert.equal(overDurationFetches, 0);

  await assert.rejects(() => analyzeSignalQualityVideo({
    signal: { videoUrl: 'https://media.invalid/too-large.mp4', duration: 44 },
    apiKey: 'offline-key',
    config,
    fetchImpl: async () => new Response('', {
      status: 200,
      headers: { 'content-type': 'video/mp4', 'content-length': String(104857601) },
    }),
  }), /too_large/);
  console.log('signal quality gate v3.1 contract tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
