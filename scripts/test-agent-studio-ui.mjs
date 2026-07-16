import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AGENT_STUDIO_STAGE_ORDER,
  buildAgentStudioCreatePayload,
  getAgentStudioCandidates,
  getAgentStudioCopy,
  getAgentStudioErrorMessage,
  getAgentStudioGroundingPercent,
  getAgentStudioStageState,
  getAgentStudioTraceEntries,
  isProductionReadyAgentStudioCandidate,
  shouldPollAgentStudioRun,
} from '../src/agentStudioUi.mjs';

assert.equal(AGENT_STUDIO_STAGE_ORDER.length, 7);
assert.equal(shouldPollAgentStudioRun('queued'), true);
assert.equal(shouldPollAgentStudioRun('evaluating'), true);
assert.equal(shouldPollAgentStudioRun('needs_context'), false);
assert.equal(shouldPollAgentStudioRun('awaiting_approval'), false);
assert.equal(shouldPollAgentStudioRun('completed'), false);

assert.equal(getAgentStudioStageState('producing', 'analyzing_video'), 'complete');
assert.equal(getAgentStudioStageState('producing', 'producing'), 'active');
assert.equal(getAgentStudioStageState('producing', 'planning'), 'pending');
assert.equal(getAgentStudioStageState('needs_context', 'analyzing_video'), 'active');
assert.equal(getAgentStudioStageState('completed', 'planning'), 'complete');

const payload = buildAgentStudioCreatePayload({
  mode: 'adapt_reel',
  objective: '  Bring morning visits  ',
  signalId: 'signal_1',
  sourceUrl: '',
  userNotes: '  Quiet setup, then coffee reveal.  ',
}, 'ui_test_1');
assert.deepEqual(payload, {
  mode: 'adapt_reel',
  objective: 'Bring morning visits',
  idempotencyKey: 'ui_test_1',
  signalId: 'signal_1',
  userNotes: 'Quiet setup, then coffee reveal.',
});

const candidates = getAgentStudioCandidates({
  artifacts: {
    creative: {
      heroReel: { id: 'hero', title: 'Hero' },
      alternatives: [{ id: 'alt_1' }, { id: 'alt_2' }],
    },
  },
});
assert.deepEqual(candidates.map(({ id, kind }) => ({ id, kind })), [
  { id: 'hero', kind: 'hero' },
  { id: 'alt_1', kind: 'alternative' },
  { id: 'alt_2', kind: 'alternative' },
]);

const hybridCandidates = getAgentStudioCandidates({
  artifacts: {
    hybrid: { sourceCandidateIds: ['hero', 'alt_1'] },
    creative: {
      heroReel: { id: 'hybrid_hero', title: 'Hybrid' },
      alternatives: [{ id: 'alt_1' }, { id: 'alt_2' }],
    },
  },
});
assert.equal(hybridCandidates[0].kind, 'hybrid');
assert.equal(isProductionReadyAgentStudioCandidate({
  scenes: [{ action: 'Setup' }, { action: 'Reveal' }],
  productionNotes: ['Use a phone tripod'],
}), true);
assert.equal(isProductionReadyAgentStudioCandidate({
  concept: 'Compact alternative only',
  hook: 'An idea, not a script',
}), false);
assert.equal(getAgentStudioGroundingPercent(9.5), 95);
assert.equal(getAgentStudioGroundingPercent(95), 95);
assert.equal(getAgentStudioGroundingPercent(undefined), null);
assert.equal(getAgentStudioTraceEntries([
  { id: '1', agent: 'Jeryk Manager', status: 'completed', summary: 'Ready' },
  { id: '2', agent: 'Jeryk Manager', status: 'completed', summary: 'Ready' },
  { id: '3', agent: 'Critic', status: 'started', summary: 'Started' },
]).length, 2);

assert.equal(getAgentStudioCopy('en').modes.find_trend.title, 'Find from my Signals');
assert.match(getAgentStudioCopy('uk').modes.adapt_reel.title, /Reel/);
assert.match(getAgentStudioErrorMessage({ error: 'plan_limit_reached' }, 'en'), /limit/i);
assert.match(getAgentStudioErrorMessage({ error: 'agent_studio_candidate_not_production_ready' }, 'en'), /production-ready/i);
assert.doesNotMatch(getAgentStudioErrorMessage({ error: 'agent_studio_disabled' }, 'en'), /[А-Яа-яІіЇїЄє]/);

const pageSource = readFileSync(new URL('../src/AgentStudioPage.jsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
assert.match(pageSource, /\/agent-studio`/);
assert.match(pageSource, /\/runs\/\$\{encodeURIComponent\(run\.id\)\}\/retry-source/);
assert.doesNotMatch(pageSource, /\/runs\/\$\{encodeURIComponent\(run\.id\)\}\/source-file/);
assert.match(pageSource, /copy\.chooseAnotherSource/);
assert.doesNotMatch(pageSource, /\$\{baseUrl\}\/uploads/);
assert.match(pageSource, /\/runs\/\$\{encodeURIComponent\(run\.id\)\}\/approve/);
assert.match(pageSource, /\/runs\/\$\{encodeURIComponent\(run\.id\)\}\/hybrid/);
assert.match(pageSource, /shouldPollAgentStudioRun/);
assert.match(pageSource, /addToContentPlan: true/);
assert.match(pageSource, /isProductionReadyAgentStudioCandidate/);
assert.match(pageSource, /copy\.alternativeApprovalHint/);
assert.match(pageSource, /copy\.approvalSuccessTitle/);
assert.match(pageSource, /QualityPanel/);
assert.match(pageSource, /UsagePanel/);
assert.match(pageSource, /dzhero-agent-studio-run:/);
assert.match(pageSource, /onOpenContentPlan/);
assert.doesNotMatch(pageSource, /OPENAI_API_KEY|GEMINI_API_KEY/);
assert.match(mainSource, /page === 'agent-studio'/);
assert.match(mainSource, /onOpenContentPlan=\{\(\) => setMvpPage\('plan'\)\}/);
assert.match(mainSource, /'Agent Studio · Beta'/);

console.log('agent studio UI helpers passed');
