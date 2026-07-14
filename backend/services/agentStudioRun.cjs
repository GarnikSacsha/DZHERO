const {
  normalizeAgentStudioInput,
  redactTraceSummary,
  toPublicTraceEntry,
} = require('./agentStudioSchemas.cjs');

const TERMINAL_AGENT_STUDIO_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const ACTIVE_AGENT_STUDIO_STATUSES = new Set([
  'queued',
  'selecting_signal',
  'analyzing_video',
  'adapting_brand',
  'producing',
  'evaluating',
  'planning',
]);

const ALLOWED_TRANSITIONS = {
  queued: new Set(['selecting_signal', 'analyzing_video', 'failed', 'cancelled']),
  selecting_signal: new Set(['analyzing_video', 'failed', 'cancelled']),
  analyzing_video: new Set(['adapting_brand', 'needs_context', 'failed', 'cancelled']),
  needs_context: new Set(['analyzing_video', 'failed', 'cancelled']),
  adapting_brand: new Set(['producing', 'failed', 'cancelled']),
  producing: new Set(['evaluating', 'failed', 'cancelled']),
  evaluating: new Set(['producing', 'planning', 'failed', 'cancelled']),
  planning: new Set(['awaiting_approval', 'failed', 'cancelled']),
  awaiting_approval: new Set(['completed', 'failed', 'cancelled']),
};

const PUBLIC_ARTIFACT_KEYS = new Set([
  'selectedTrend',
  'evidence',
  'brandStrategy',
  'creative',
  'evaluation',
  'contentPlan',
]);

function defaultIdFactory(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultNow() {
  return new Date().toISOString();
}

function createTraceEntry({
  id,
  agent = 'Jeryk Manager',
  stage,
  status = 'started',
  summary,
  createdAt,
  idFactory = defaultIdFactory,
}) {
  return {
    id: id || idFactory('trace'),
    agent,
    stage,
    status,
    summary: redactTraceSummary(summary || `Started ${stage}.`),
    createdAt: createdAt || defaultNow(),
  };
}

function createAgentStudioRun({
  workspaceId,
  userId,
  input,
  now = defaultNow(),
  idFactory = defaultIdFactory,
}) {
  if (!workspaceId || !userId) throw new Error('agent_studio_identity_required');
  const normalizedInput = normalizeAgentStudioInput(input);
  const run = {
    id: idFactory('agent_run'),
    workspaceId: String(workspaceId),
    userId: String(userId),
    input: normalizedInput,
    status: 'queued',
    currentStage: 'queued',
    artifacts: {},
    trace: [],
    contextRequest: null,
    contextHistory: [],
    outputRepairCount: 0,
    criticRevisionCount: 0,
    approval: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  run.trace.push(createTraceEntry({
    id: idFactory('trace'),
    stage: 'queued',
    status: 'started',
    summary: 'Jeryk queued the Agent Studio run.',
    createdAt: now,
    idFactory,
  }));
  return run;
}

function assertRunMutable(run) {
  if (!run || !run.id) throw new Error('agent_studio_run_required');
  if (TERMINAL_AGENT_STUDIO_STATUSES.has(run.status)) {
    throw new Error('agent_studio_run_terminal');
  }
}

function transitionAgentStudioRun(run, nextStatus, options = {}) {
  assertRunMutable(run);
  const allowed = ALLOWED_TRANSITIONS[run.status];
  if (!allowed?.has(nextStatus)) {
    throw new Error(`invalid_agent_studio_transition:${run.status}->${nextStatus}`);
  }
  if (run.status === 'queued') {
    const expected = run.input?.mode === 'find_trend' ? 'selecting_signal' : 'analyzing_video';
    if (!['failed', 'cancelled'].includes(nextStatus) && nextStatus !== expected) {
      throw new Error(`invalid_agent_studio_transition:${run.status}->${nextStatus}`);
    }
  }
  const now = options.now || defaultNow();
  const terminal = TERMINAL_AGENT_STUDIO_STATUSES.has(nextStatus);
  const traceStatus = options.traceStatus
    || (nextStatus === 'failed' ? 'failed' : nextStatus === 'cancelled' ? 'cancelled' : 'started');
  const next = {
    ...run,
    status: nextStatus,
    currentStage: nextStatus,
    updatedAt: now,
    completedAt: terminal ? now : run.completedAt,
    error: options.error === undefined ? run.error : options.error,
    trace: [
      ...(run.trace || []),
      createTraceEntry({
        id: options.traceId,
        agent: options.agent,
        stage: nextStatus,
        status: traceStatus,
        summary: options.summary,
        createdAt: now,
        idFactory: options.idFactory,
      }),
    ],
  };
  return next;
}

function requestAgentStudioContext(run, {
  question,
  reason,
  now = defaultNow(),
  traceId,
  idFactory = defaultIdFactory,
}) {
  if (run.status !== 'analyzing_video') throw new Error('agent_studio_context_stage_invalid');
  const next = transitionAgentStudioRun(run, 'needs_context', {
    now,
    traceId,
    idFactory,
    agent: 'Gemini Video Analyst',
    traceStatus: 'needs_context',
    summary: reason || 'Reliable video evidence is missing.',
  });
  return {
    ...next,
    contextRequest: {
      question: String(question || '').trim(),
      reason: String(reason || '').trim(),
      requestedAt: now,
    },
  };
}

function resumeAgentStudioRunWithContext(run, {
  userNotes,
  now = defaultNow(),
  traceId,
  idFactory = defaultIdFactory,
}) {
  if (run.status !== 'needs_context' || !run.contextRequest) {
    throw new Error('agent_studio_context_not_requested');
  }
  const notes = String(userNotes || '').trim();
  if (!notes) throw new Error('agent_studio_context_required');
  const next = transitionAgentStudioRun(run, 'analyzing_video', {
    now,
    traceId,
    idFactory,
    agent: 'Jeryk Manager',
    summary: 'User context was labelled as a note and returned to evidence analysis.',
  });
  return {
    ...next,
    contextRequest: null,
    contextHistory: [
      ...(run.contextHistory || []),
      {
        sourceType: 'user_note',
        text: notes,
        question: run.contextRequest.question,
        createdAt: now,
      },
    ],
  };
}

function registerAgentStudioOutputRepair(run, {
  stage,
  reason,
  now = defaultNow(),
  traceId,
  idFactory = defaultIdFactory,
}) {
  assertRunMutable(run);
  if ((run.outputRepairCount || 0) >= 1) throw new Error('agent_studio_output_repair_limit');
  return {
    ...run,
    outputRepairCount: (run.outputRepairCount || 0) + 1,
    updatedAt: now,
    trace: [
      ...(run.trace || []),
      createTraceEntry({
        id: traceId,
        agent: 'Jeryk Manager',
        stage: stage || run.currentStage,
        status: 'revised',
        summary: reason || 'Requested one structured-output repair.',
        createdAt: now,
        idFactory,
      }),
    ],
  };
}

function requestAgentStudioCriticRevision(run, {
  instructions,
  now = defaultNow(),
  traceId,
  idFactory = defaultIdFactory,
}) {
  if (run.status !== 'evaluating') throw new Error('agent_studio_critic_stage_invalid');
  if ((run.criticRevisionCount || 0) >= 1) throw new Error('agent_studio_critic_revision_limit');
  const items = Array.isArray(instructions) ? instructions.map((item) => String(item).trim()).filter(Boolean) : [];
  if (items.length === 0) throw new Error('agent_studio_revision_instructions_required');
  const next = transitionAgentStudioRun(run, 'producing', {
    now,
    traceId,
    idFactory,
    agent: 'Critic',
    traceStatus: 'revised',
    summary: items.join(' '),
  });
  return {
    ...next,
    criticRevisionCount: (run.criticRevisionCount || 0) + 1,
    revisionInstructions: items,
  };
}

function cancelAgentStudioRun(run, {
  now = defaultNow(),
  reason = 'The run was cancelled by the user.',
  traceId,
  idFactory = defaultIdFactory,
} = {}) {
  if (run?.status === 'cancelled') return run;
  return transitionAgentStudioRun(run, 'cancelled', {
    now,
    traceId,
    idFactory,
    agent: 'Jeryk Manager',
    traceStatus: 'cancelled',
    summary: reason,
  });
}

function classifyAgentStudioError(error = {}) {
  const status = Number(error.status || error.statusCode || error.response?.status || 0);
  const code = String(error.code || error.error?.code || '').toLowerCase();
  const message = String(error.message || error.error?.message || '').toLowerCase();
  if (status === 401 || status === 403 || code === 'missing_key' || message.includes('api key')) {
    return { code: 'missing_key', message: 'OpenAI credentials are missing or invalid.', retryable: false };
  }
  if (code.includes('insufficient_quota') || code === 'quota' || message.includes('quota') || message.includes('billing')) {
    return { code: 'quota', message: 'The OpenAI API project has no available quota.', retryable: false };
  }
  if (status === 429 || code.includes('rate_limit') || message.includes('rate limit')) {
    return { code: 'rate_limit', message: 'The AI provider is rate limited. Try again shortly.', retryable: true };
  }
  if (error.name === 'AbortError' || code === 'timeout' || message.includes('timed out') || message.includes('timeout')) {
    return { code: 'timeout', message: 'The agent run exceeded its time limit.', retryable: true };
  }
  if (code === 'video_unavailable') {
    return { code: 'video_unavailable', message: 'The source video could not be analyzed.', retryable: true };
  }
  if (code === 'invalid_output' || code.includes('schema') || code.includes('validation')) {
    return { code: 'invalid_output', message: 'An agent returned incomplete structured output.', retryable: true };
  }
  if (code === 'quality_rejected') {
    return { code: 'quality_rejected', message: 'The result did not pass the quality gate.', retryable: false };
  }
  return { code: 'provider_error', message: 'The AI provider could not complete this run.', retryable: true };
}

function approveAgentStudioRun(run, {
  candidateId,
  contentPlanWriteId = null,
  now = defaultNow(),
  traceId,
  idFactory = defaultIdFactory,
}) {
  const selectedId = String(candidateId || '').trim();
  if (!selectedId) throw new Error('agent_studio_candidate_required');
  if (run.status === 'completed' && run.approval) {
    if (run.approval.candidateId === selectedId) return run;
    throw new Error('agent_studio_already_approved');
  }
  if (run.status !== 'awaiting_approval') throw new Error('agent_studio_not_awaiting_approval');
  const next = transitionAgentStudioRun(run, 'completed', {
    now,
    traceId,
    idFactory,
    agent: 'Jeryk Manager',
    traceStatus: 'completed',
    summary: 'The user approved the creative package.',
  });
  return {
    ...next,
    approval: {
      candidateId: selectedId,
      contentPlanWriteId: contentPlanWriteId || null,
      approvedAt: now,
    },
  };
}

function recoverInterruptedAgentStudioRun(run, {
  now = defaultNow(),
  idFactory = defaultIdFactory,
} = {}) {
  if (!run || !ACTIVE_AGENT_STUDIO_STATUSES.has(run.status)) return run;
  const error = {
    code: 'interrupted',
    message: 'The previous agent process stopped before the run completed.',
    retryable: true,
  };
  return transitionAgentStudioRun(run, 'failed', {
    now,
    idFactory,
    agent: 'Jeryk Manager',
    traceStatus: 'failed',
    summary: error.message,
    error,
  });
}

function sanitizePublicValue(value) {
  if (Array.isArray(value)) return value.map(sanitizePublicValue);
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? redactTraceSummary(value) : value;
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/prompt|reasoning|chain.?of.?thought|api.?key|token|secret|provider.?payload/i.test(key)) continue;
    result[key] = sanitizePublicValue(item);
  }
  return result;
}

function toPublicAgentStudioRun(run = {}) {
  const artifacts = {};
  for (const [key, value] of Object.entries(run.artifacts || {})) {
    if (PUBLIC_ARTIFACT_KEYS.has(key)) artifacts[key] = sanitizePublicValue(value);
  }
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    input: sanitizePublicValue(run.input || {}),
    status: run.status,
    currentStage: run.currentStage,
    artifacts,
    trace: (run.trace || []).map((entry) => toPublicTraceEntry(entry)),
    contextRequest: run.contextRequest ? sanitizePublicValue(run.contextRequest) : null,
    outputRepairCount: run.outputRepairCount || 0,
    criticRevisionCount: run.criticRevisionCount || 0,
    approval: run.approval ? sanitizePublicValue(run.approval) : null,
    error: run.error ? sanitizePublicValue(run.error) : null,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt || null,
  };
}

module.exports = {
  TERMINAL_AGENT_STUDIO_STATUSES,
  ACTIVE_AGENT_STUDIO_STATUSES,
  ALLOWED_TRANSITIONS,
  createAgentStudioRun,
  transitionAgentStudioRun,
  requestAgentStudioContext,
  resumeAgentStudioRunWithContext,
  registerAgentStudioOutputRepair,
  requestAgentStudioCriticRevision,
  cancelAgentStudioRun,
  classifyAgentStudioError,
  approveAgentStudioRun,
  recoverInterruptedAgentStudioRun,
  toPublicAgentStudioRun,
};
