const assert = require('node:assert/strict');

const {
  ACTIVE_AGENT_STUDIO_STATUSES,
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
} = require('../backend/services/agentStudioRun.cjs');

let tick = 0;
const now = () => new Date(Date.UTC(2026, 6, 14, 12, 0, tick++)).toISOString();
const idFactory = (prefix) => `${prefix}_fixed`;

function makeRun(mode = 'adapt_reel') {
  return createAgentStudioRun({
    workspaceId: 'ws_1',
    userId: 'user_1',
    input: mode === 'adapt_reel'
      ? { mode, objective: 'Drive morning visits', signalId: 'signal_1' }
      : { mode, objective: 'Drive morning visits' },
    now: now(),
    idFactory,
  });
}

const queued = makeRun();
assert.equal(queued.id, 'agent_run_fixed');
assert.equal(queued.status, 'queued');
assert.equal(queued.currentStage, 'queued');
assert.equal(queued.criticRevisionCount, 0);
assert.equal(queued.outputRepairCount, 0);
assert.equal(queued.trace.length, 1);

const analyzing = transitionAgentStudioRun(queued, 'analyzing_video', {
  agent: 'Jeryk Manager',
  summary: 'Started evidence collection.',
  now: now(),
  traceId: 'trace_analyzing',
});
assert.equal(analyzing.status, 'analyzing_video');
assert.equal(analyzing.trace.at(-1).summary, 'Started evidence collection.');
assert.throws(
  () => transitionAgentStudioRun(analyzing, 'producing', { now: now() }),
  /invalid_agent_studio_transition/,
);

const finding = makeRun('find_trend');
assert.equal(transitionAgentStudioRun(finding, 'selecting_signal', { now: now() }).status, 'selecting_signal');
assert.throws(
  () => transitionAgentStudioRun(finding, 'analyzing_video', { now: now() }),
  /invalid_agent_studio_transition/,
);

const needsContext = requestAgentStudioContext(analyzing, {
  question: 'What happens immediately after the cup appears?',
  reason: 'The public source did not expose playable video.',
  now: now(),
  traceId: 'trace_context',
});
assert.equal(needsContext.status, 'needs_context');
assert.equal(needsContext.contextRequest.question.includes('immediately'), true);

const resumed = resumeAgentStudioRunWithContext(needsContext, {
  userNotes: 'The barista reveals a warm croissant next to the cup.',
  now: now(),
  traceId: 'trace_resumed',
});
assert.equal(resumed.status, 'analyzing_video');
assert.equal(resumed.contextRequest, null);
assert.equal(resumed.contextHistory.length, 1);
assert.equal(resumed.contextHistory[0].sourceType, 'user_note');
assert.throws(
  () => resumeAgentStudioRunWithContext(analyzing, { userNotes: 'No pause', now: now() }),
  /agent_studio_context_not_requested/,
);

const repairedOnce = registerAgentStudioOutputRepair(resumed, {
  stage: 'analyzing_video',
  reason: 'Malformed structured output.',
  now: now(),
});
assert.equal(repairedOnce.outputRepairCount, 1);
assert.throws(
  () => registerAgentStudioOutputRepair(repairedOnce, { stage: 'analyzing_video', reason: 'Again', now: now() }),
  /agent_studio_output_repair_limit/,
);

let evaluating = transitionAgentStudioRun(resumed, 'adapting_brand', { now: now() });
evaluating = transitionAgentStudioRun(evaluating, 'producing', { now: now() });
evaluating = transitionAgentStudioRun(evaluating, 'evaluating', { now: now() });
const revision = requestAgentStudioCriticRevision(evaluating, {
  instructions: ['Remove the unsupported best-in-Kyiv claim.'],
  now: now(),
  traceId: 'trace_revision',
});
assert.equal(revision.status, 'producing');
assert.equal(revision.criticRevisionCount, 1);
let evaluatingAgain = transitionAgentStudioRun(revision, 'evaluating', { now: now() });
assert.throws(
  () => requestAgentStudioCriticRevision(evaluatingAgain, { instructions: ['Try again.'], now: now() }),
  /agent_studio_critic_revision_limit/,
);

const cancelled = cancelAgentStudioRun(analyzing, { now: now(), reason: 'User cancelled.' });
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelAgentStudioRun(cancelled, { now: now() }), cancelled);
assert.throws(
  () => transitionAgentStudioRun(cancelled, 'adapting_brand', { now: now() }),
  /agent_studio_run_terminal/,
);

assert.deepEqual(classifyAgentStudioError({ status: 401, message: 'Incorrect API key' }), {
  code: 'missing_key',
  message: 'OpenAI credentials are missing or invalid.',
  retryable: false,
});
assert.equal(classifyAgentStudioError({ status: 429, code: 'insufficient_quota' }).code, 'quota');
assert.equal(classifyAgentStudioError({ status: 429, message: 'Rate limit exceeded' }).code, 'rate_limit');
assert.equal(classifyAgentStudioError({ name: 'AbortError' }).code, 'timeout');
assert.equal(classifyAgentStudioError({ code: 'video_unavailable' }).code, 'video_unavailable');
assert.equal(classifyAgentStudioError(new Error('Unknown provider failure')).code, 'provider_error');

let awaitingApproval = transitionAgentStudioRun(evaluatingAgain, 'planning', { now: now() });
awaitingApproval = transitionAgentStudioRun(awaitingApproval, 'awaiting_approval', { now: now() });
const approved = approveAgentStudioRun(awaitingApproval, {
  candidateId: 'hero_1',
  contentPlanWriteId: 'plan_write_1',
  now: now(),
  traceId: 'trace_approved',
});
assert.equal(approved.status, 'completed');
assert.equal(approved.approval.candidateId, 'hero_1');
assert.equal(approveAgentStudioRun(approved, {
  candidateId: 'hero_1',
  contentPlanWriteId: 'plan_write_1',
  now: now(),
}), approved);
assert.throws(
  () => approveAgentStudioRun(approved, { candidateId: 'alt_1', now: now() }),
  /agent_studio_already_approved/,
);

const interrupted = recoverInterruptedAgentStudioRun(analyzing, { now: now() });
assert.equal(interrupted.status, 'failed');
assert.equal(interrupted.error.code, 'interrupted');
assert.equal(interrupted.error.retryable, true);
assert.equal(recoverInterruptedAgentStudioRun(approved, { now: now() }), approved);
assert.equal(ACTIVE_AGENT_STUDIO_STATUSES.has('analyzing_video'), true);
assert.equal(ACTIVE_AGENT_STUDIO_STATUSES.has('completed'), false);

const unsafe = {
  ...awaitingApproval,
  internal: {
    rawPrompt: 'private prompt',
    reasoning: 'private chain of thought',
    apiKey: 'sk-do-not-leak',
  },
  trace: [{
    id: 'trace_private',
    agent: 'Critic',
    stage: 'evaluating',
    status: 'completed',
    summary: 'Removed token=super-secret from the public explanation.',
    createdAt: now(),
    providerPayload: { secret: true },
  }],
  artifacts: {
    evidence: { summary: 'safe evidence' },
    providerPayload: { secret: true },
    rawPrompt: 'private',
  },
};
const publicRun = toPublicAgentStudioRun(unsafe);
const publicJson = JSON.stringify(publicRun);
assert.equal(publicJson.includes('sk-do-not-leak'), false);
assert.equal(publicJson.includes('private chain'), false);
assert.equal(publicJson.includes('super-secret'), false);
assert.equal(Object.hasOwn(publicRun, 'internal'), false);
assert.equal(Object.hasOwn(publicRun.artifacts, 'providerPayload'), false);

console.log('Agent Studio run state checks passed.');
