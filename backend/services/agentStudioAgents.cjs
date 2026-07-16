const {
  normalizeAgentStudioInput,
  EvidencePackageSchema,
  TrendBriefSchema,
  BrandStrategySchema,
  CreativeBundleSchema,
  EvaluationReportSchema,
  ContentPlanSchema,
  ManagerReviewSchema,
  FinalPackageSchema,
} = require('./agentStudioSchemas.cjs');
const {
  AGENT_STUDIO_DEFINITIONS,
  buildAgentStudioPrompt,
} = require('./agentStudioPrompts.cjs');
const {
  assessAgentStudioCreative,
  createAgentStudioRevisionContract,
  enforceAgentStudioEvaluation,
  enforceAgentStudioFinalEvaluation,
} = require('./agentStudioQuality.cjs');
const crypto = require('node:crypto');

const AGENT_STAGE = {
  trend_analyst: 'selecting_signal',
  brand_strategist: 'adapting_brand',
  creative_producer: 'producing',
  hybrid_producer: 'producing',
  critic: 'evaluating',
  content_planner: 'planning',
  jeryk_manager: 'awaiting_approval',
};

const AGENT_OUTPUT_SCHEMAS = {
  trend_analyst: TrendBriefSchema,
  brand_strategist: BrandStrategySchema,
  creative_producer: CreativeBundleSchema,
  hybrid_producer: CreativeBundleSchema,
  critic: EvaluationReportSchema,
  content_planner: ContentPlanSchema,
  jeryk_manager: ManagerReviewSchema,
};

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function parseStructuredOutput(output, schema) {
  let candidate = output;
  if (typeof candidate === 'string') {
    const text = candidate.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      candidate = JSON.parse(text);
    } catch (cause) {
      const error = new Error('Agent returned invalid JSON.');
      error.code = 'invalid_output';
      error.cause = cause;
      throw error;
    }
  }
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    const error = new Error('Agent returned output that failed schema validation.');
    error.code = 'invalid_output';
    error.issues = parsed.error.issues;
    throw error;
  }
  return parsed.data;
}

function createOpenAIAgentRunner({
  model = process.env.OPENAI_AGENT_MODEL || 'gpt-5.6',
  maxTurns = clampInteger(process.env.AGENT_STUDIO_MAX_TURNS, 12, 1, 30),
  timeoutMs = clampInteger(process.env.AGENT_STUDIO_TIMEOUT_MS, 90000, 5000, 180000),
  sdkLoader = () => import('@openai/agents'),
  requireApiKey = true,
  onUsage = null,
  phase = 'initial',
  invocationId = '',
} = {}) {
  return async function runOpenAIAgent({
    agentId,
    input,
    outputSchema = AGENT_OUTPUT_SCHEMAS[agentId],
    groupId,
  }) {
    const definition = AGENT_STUDIO_DEFINITIONS[agentId];
    if (!definition || !outputSchema) throw new Error(`unknown_agent_studio_agent:${agentId}`);
    if (requireApiKey && !process.env.OPENAI_API_KEY) {
      const error = new Error('OPENAI_API_KEY is not configured.');
      error.code = 'missing_key';
      error.status = 401;
      throw error;
    }
    const sdk = await sdkLoader();
    const agent = new sdk.Agent({
      name: definition.name,
      instructions: definition.instructions,
      model,
      outputType: outputSchema,
    });
    const runner = new sdk.Runner({
      workflowName: `DZHERO Agent Studio — ${definition.name}`,
      groupId: groupId || undefined,
      traceIncludeSensitiveData: false,
      traceMetadata: {
        product: 'dzhero',
        surface: 'agent-studio-beta',
        agent: agentId,
      },
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const callId = `${invocationId || groupId || 'agent-studio'}:${agentId}:${crypto.randomUUID()}`;
    const startedAt = new Date().toISOString();
    let result = null;
    let usageReported = false;
    const reportUsage = async (status, usage) => {
      if (usageReported || typeof onUsage !== 'function') return;
      usageReported = true;
      try {
        await onUsage({
          callId,
          invocationId,
          phase,
          agentId,
          model,
          status,
          usage: usage || null,
          startedAt,
          completedAt: new Date().toISOString(),
        });
      } catch {
        // Telemetry must never turn a successful provider response into a failed product run.
      }
    };
    try {
      result = await runner.run(
        agent,
        buildAgentStudioPrompt(agentId, input),
        { maxTurns, signal: controller.signal },
      );
      const output = parseStructuredOutput(result.finalOutput, outputSchema);
      await reportUsage('completed', result.state?.usage || result.runContext?.usage);
      return output;
    } catch (error) {
      await reportUsage('failed', result?.state?.usage || result?.runContext?.usage || error?.state?.usage);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

function findSignal(signals, signalId) {
  if (!signalId) return null;
  return (Array.isArray(signals) ? signals : []).find((signal) => String(signal.id) === String(signalId)) || null;
}

function buildSelectedTrendFromInput(input, signals = []) {
  const signal = findSignal(signals, input.signalId);
  const isEnglish = input.outputLanguage === 'en';
  return TrendBriefSchema.parse({
    title: signal?.title || signal?.caption || (isEnglish ? 'Reel selected for adaptation' : 'Reel, обраний для адаптації'),
    rationale: signal
      ? (isEnglish
        ? 'The user selected this existing DZHERO signal for brand adaptation.'
        : 'Користувач обрав цей наявний сигнал DZHERO для адаптації під бренд.')
      : (isEnglish
        ? 'The user supplied this source directly for brand adaptation.'
        : 'Користувач надав це джерело безпосередньо для адаптації під бренд.'),
    signalId: input.signalId || signal?.id || undefined,
    sourceUrl: input.sourceUrl || signal?.sourceUrl || signal?.videoUrl || signal?.importedMetadata?.url || undefined,
  });
}

function getOutputSummary(agentId, output) {
  if (agentId === 'trend_analyst') return output.rationale;
  if (agentId === 'brand_strategist') return output.brandAngle;
  if (agentId === 'creative_producer') return `Prepared “${output.heroReel.title}” and two alternative concepts.`;
  if (agentId === 'hybrid_producer') return `Combined the selected directions into “${output.heroReel.title}”.`;
  if (agentId === 'critic') return output.summary;
  if (agentId === 'content_planner') return output.strategy;
  if (agentId === 'jeryk_manager') return output.headline;
  return 'Completed the assigned Agent Studio stage.';
}

async function orchestrateAgentStudio({
  runId,
  input: rawInput,
  workspace,
  signals = [],
  selectedTrend: preselectedTrend = null,
  runAgent = createOpenAIAgentRunner(),
  analyzeVideo,
  emit = () => {},
}) {
  if (typeof analyzeVideo !== 'function') throw new Error('agent_studio_video_analyzer_required');
  const input = normalizeAgentStudioInput(rawInput);
  const brandBrain = workspace?.brief || {};

  const runSpecialist = async (agentId, agentInput, options = {}) => {
    const definition = AGENT_STUDIO_DEFINITIONS[agentId];
    const stage = AGENT_STAGE[agentId];
    emit({ agent: definition.name, agentId, stage, status: 'started', summary: options.startSummary || `Started ${definition.name}.` });
    const output = await runAgent({
      agentId,
      input: { ...agentInput, outputLanguage: input.outputLanguage },
      outputSchema: AGENT_OUTPUT_SCHEMAS[agentId],
      groupId: runId,
    });
    const validated = AGENT_OUTPUT_SCHEMAS[agentId].parse(output);
    emit({
      agent: definition.name,
      agentId,
      stage,
      status: options.completedStatus || 'completed',
      summary: getOutputSummary(agentId, validated),
    });
    return validated;
  };

  const selectedTrend = preselectedTrend
    ? TrendBriefSchema.parse(preselectedTrend)
    : input.mode === 'find_trend'
    ? await runSpecialist('trend_analyst', {
      objective: input.objective,
      brandBrain,
      signals: (Array.isArray(signals) ? signals : []).slice(0, 20),
    })
    : buildSelectedTrendFromInput(input, signals);

  emit({
    agent: 'Gemini Video Analyst',
    agentId: 'gemini_video_analyst',
    stage: 'analyzing_video',
    status: 'started',
    summary: 'Started source evidence analysis.',
  });
  const evidence = EvidencePackageSchema.parse(await analyzeVideo({
    runId,
    input,
    selectedTrend,
    signal: findSignal(signals, selectedTrend.signalId),
    workspace,
  }));
  if (evidence.requiresContext || evidence.availability === 'unavailable') {
    const reason = evidence.unknowns[0] || 'The source did not provide enough reliable video evidence.';
    emit({
      agent: 'Gemini Video Analyst',
      agentId: 'gemini_video_analyst',
      stage: 'analyzing_video',
      status: 'needs_context',
      summary: reason,
    });
    return {
      type: 'needs_context',
      selectedTrend,
      evidence,
      contextRequest: {
        reason,
        question: 'In one or two sentences, what happens in the Reel and what is the key reveal?',
      },
    };
  }
  emit({
    agent: 'Gemini Video Analyst',
    agentId: 'gemini_video_analyst',
    stage: 'analyzing_video',
    status: 'completed',
    summary: evidence.summary,
  });

  const brandStrategy = await runSpecialist('brand_strategist', {
    objective: input.objective,
    selectedTrend,
    evidence,
    brandBrain,
  });

  let creative = await runSpecialist('creative_producer', {
    objective: input.objective,
    selectedTrend,
    evidence,
    brandBrain,
    brandStrategy,
  });
  let creativeQuality = assessAgentStudioCreative(creative, { brandBrain });

  let evaluation = await runSpecialist('critic', {
    objective: input.objective,
    selectedTrend,
    evidence,
    brandBrain,
    brandStrategy,
    creative,
    creativeQualityGate: creativeQuality,
    revisionNumber: 0,
  });
  evaluation = enforceAgentStudioEvaluation(evaluation, creativeQuality);

  if (evaluation.decision === 'revise') {
    const revisionContract = createAgentStudioRevisionContract(evaluation);
    emit({
      agent: 'Critic',
      agentId: 'critic',
      stage: 'evaluating',
      status: 'revised',
      summary: evaluation.revisionInstructions.join(' '),
    });
    creative = await runSpecialist('creative_producer', {
      objective: input.objective,
      selectedTrend,
      evidence,
      brandBrain,
      brandStrategy,
      previousCreative: creative,
      revisionInstructions: evaluation.revisionInstructions,
      revisionContract,
    }, { startSummary: 'Started the single permitted creative revision.' });
    creativeQuality = assessAgentStudioCreative(creative, { brandBrain });
    evaluation = await runSpecialist('critic', {
      objective: input.objective,
      selectedTrend,
      evidence,
      brandBrain,
      brandStrategy,
      creative,
      creativeQualityGate: creativeQuality,
      revisionNumber: 1,
      revisionContract,
    });
    evaluation = enforceAgentStudioFinalEvaluation(evaluation, creativeQuality, revisionContract);
  }

  if (evaluation.decision !== 'accept') {
    const error = new Error(evaluation.summary || 'The result did not pass the quality gate.');
    error.code = 'quality_rejected';
    error.evaluation = evaluation;
    throw error;
  }

  const contentPlan = await runSpecialist('content_planner', {
    objective: input.objective,
    selectedTrend,
    evidence,
    brandBrain,
    brandStrategy,
    creative,
    evaluation,
  });

  const managerReview = await runSpecialist('jeryk_manager', {
    objective: input.objective,
    selectedTrend,
    evidence,
    brandBrain,
    brandStrategy,
    creative,
    evaluation,
    contentPlan,
  });

  const finalPackage = FinalPackageSchema.parse({
    selectedTrend,
    evidence,
    brandStrategy,
    creative,
    evaluation,
    contentPlan,
    managerReview,
  });
  return { type: 'completed', finalPackage };
}

function getCreativeCandidates(creative = {}) {
  return [creative.heroReel, ...(creative.alternatives || [])].filter(Boolean);
}

async function orchestrateAgentStudioHybrid({
  runId,
  input: rawInput,
  workspace,
  finalPackage: rawFinalPackage,
  candidateIds,
  runAgent = createOpenAIAgentRunner(),
  emit = () => {},
}) {
  const input = normalizeAgentStudioInput(rawInput);
  const finalPackage = FinalPackageSchema.parse(rawFinalPackage);
  const selectedIds = [...new Set((candidateIds || []).map((value) => String(value).trim()).filter(Boolean))];
  if (selectedIds.length !== 2) throw new Error('agent_studio_hybrid_candidates_required');
  const candidates = getCreativeCandidates(finalPackage.creative);
  const selectedCandidates = selectedIds.map((candidateId) => candidates.find((candidate) => candidate.id === candidateId));
  if (selectedCandidates.some((candidate) => !candidate)) throw new Error('agent_studio_candidate_not_found');

  const brandBrain = workspace?.brief || {};
  const runSpecialist = async (agentId, agentInput, options = {}) => {
    const definition = AGENT_STUDIO_DEFINITIONS[agentId];
    const stage = AGENT_STAGE[agentId];
    emit({ agent: definition.name, agentId, stage, status: 'started', summary: options.startSummary || `Started ${definition.name}.` });
    const output = await runAgent({
      agentId,
      input: { ...agentInput, outputLanguage: input.outputLanguage },
      outputSchema: AGENT_OUTPUT_SCHEMAS[agentId],
      groupId: `${runId}:hybrid`,
    });
    const validated = AGENT_OUTPUT_SCHEMAS[agentId].parse(output);
    emit({
      agent: definition.name,
      agentId,
      stage,
      status: 'completed',
      summary: getOutputSummary(agentId, validated),
    });
    return validated;
  };

  let creative = await runSpecialist('hybrid_producer', {
    objective: input.objective,
    selectedTrend: finalPackage.selectedTrend,
    evidence: finalPackage.evidence,
    brandBrain,
    brandStrategy: finalPackage.brandStrategy,
    selectedCandidates,
  });
  let creativeQuality = assessAgentStudioCreative(creative, { brandBrain });
  let evaluation = await runSpecialist('critic', {
    objective: input.objective,
    selectedTrend: finalPackage.selectedTrend,
    evidence: finalPackage.evidence,
    brandBrain,
    brandStrategy: finalPackage.brandStrategy,
    creative,
    creativeQualityGate: creativeQuality,
    revisionNumber: 0,
    hybridSourceCandidateIds: selectedIds,
  });
  evaluation = enforceAgentStudioEvaluation(evaluation, creativeQuality);

  if (evaluation.decision === 'revise') {
    const revisionContract = createAgentStudioRevisionContract(evaluation);
    emit({
      agent: 'Critic',
      agentId: 'critic',
      stage: 'evaluating',
      status: 'revised',
      summary: evaluation.revisionInstructions.join(' '),
    });
    creative = await runSpecialist('hybrid_producer', {
      objective: input.objective,
      selectedTrend: finalPackage.selectedTrend,
      evidence: finalPackage.evidence,
      brandBrain,
      brandStrategy: finalPackage.brandStrategy,
      selectedCandidates,
      previousCreative: creative,
      revisionInstructions: evaluation.revisionInstructions,
      revisionContract,
    }, { startSummary: 'Started the single permitted hybrid revision.' });
    creativeQuality = assessAgentStudioCreative(creative, { brandBrain });
    evaluation = await runSpecialist('critic', {
      objective: input.objective,
      selectedTrend: finalPackage.selectedTrend,
      evidence: finalPackage.evidence,
      brandBrain,
      brandStrategy: finalPackage.brandStrategy,
      creative,
      creativeQualityGate: creativeQuality,
      revisionNumber: 1,
      hybridSourceCandidateIds: selectedIds,
      revisionContract,
    });
    evaluation = enforceAgentStudioFinalEvaluation(evaluation, creativeQuality, revisionContract);
  }
  if (evaluation.decision !== 'accept') {
    const error = new Error(evaluation.summary || 'The hybrid result did not pass the quality gate.');
    error.code = 'quality_rejected';
    error.evaluation = evaluation;
    throw error;
  }

  const contentPlan = await runSpecialist('content_planner', {
    objective: input.objective,
    selectedTrend: finalPackage.selectedTrend,
    evidence: finalPackage.evidence,
    brandBrain,
    brandStrategy: finalPackage.brandStrategy,
    creative,
    evaluation,
    hybridSourceCandidateIds: selectedIds,
  });
  const managerReview = await runSpecialist('jeryk_manager', {
    objective: input.objective,
    selectedTrend: finalPackage.selectedTrend,
    evidence: finalPackage.evidence,
    brandBrain,
    brandStrategy: finalPackage.brandStrategy,
    creative,
    evaluation,
    contentPlan,
    hybridSourceCandidateIds: selectedIds,
  });

  return {
    type: 'completed',
    finalPackage: FinalPackageSchema.parse({
      selectedTrend: finalPackage.selectedTrend,
      evidence: finalPackage.evidence,
      brandStrategy: finalPackage.brandStrategy,
      creative,
      evaluation,
      contentPlan,
      managerReview,
      hybrid: { sourceCandidateIds: selectedIds },
    }),
  };
}

module.exports = {
  AGENT_STAGE,
  AGENT_OUTPUT_SCHEMAS,
  parseStructuredOutput,
  createOpenAIAgentRunner,
  buildSelectedTrendFromInput,
  orchestrateAgentStudio,
  orchestrateAgentStudioHybrid,
};
