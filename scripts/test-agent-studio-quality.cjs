const assert = require('node:assert/strict');

const {
  AGENT_STUDIO_DEFINITIONS,
  buildAgentStudioPrompt,
} = require('../backend/services/agentStudioPrompts.cjs');
const {
  ACCEPT_THRESHOLDS,
  assessAgentStudioCreative,
  createAgentStudioRevisionContract,
  enforceAgentStudioEvaluation,
  enforceAgentStudioFinalEvaluation,
  getFirstBeatEndSeconds,
} = require('../backend/services/agentStudioQuality.cjs');
const fixture = require('./fixtures/agent-studio-coffee-shop.cjs');

const englishPrompt = buildAgentStudioPrompt('creative_producer', {
  objective: 'Drive visits',
  outputLanguage: 'en',
});
assert.match(englishPrompt, /natural, polished English/);
assert.match(englishPrompt, /Original quote:/);
const legacyPrompt = buildAgentStudioPrompt('creative_producer', { objective: 'Drive visits' });
assert.match(legacyPrompt, /natural, polished Ukrainian/);

const brandBrain = {
  businessType: 'Independent coffee shop',
  audience: 'Busy Kyiv professionals',
  product: 'Espresso and pastries',
};

const strong = assessAgentStudioCreative(fixture.creative, { brandBrain });
assert.equal(strong.ok, true, strong.issues.join('\n'));

const weakCreative = {
  ...fixture.creative,
  heroReel: {
    ...fixture.creative.heroReel,
    hook: 'Discover this',
    scenes: [{
      ...fixture.creative.heroReel.scenes[0],
      timeframe: '0:00-0:05',
      action: 'Show product',
      onScreenText: '',
      voiceover: '',
    }],
    productionNotes: ['Shoot it'],
    brandRefs: [],
  },
  alternatives: fixture.creative.alternatives.map((item) => ({
    ...item,
    hook: 'A unique solution for you',
    concept: 'Use the same generic concept.',
    brandRefs: [],
  })),
};
const weak = assessAgentStudioCreative(weakCreative, { brandBrain });
assert.equal(weak.ok, false);
assert.equal(weak.issues.some((issue) => issue.includes('at least three concrete beats')), true);
assert.equal(weak.issues.some((issue) => issue.includes('first pattern-interrupt beat')), true);
assert.equal(weak.issues.some((issue) => issue.includes('generic AI/agency phrase')), true);
assert.equal(weak.issues.some((issue) => issue.includes('different attention routes')), true);
assert.equal(weak.issues.some((issue) => issue.includes('Brand Brain')), true);

const lowScoreEvaluation = {
  ...fixture.acceptEvaluation,
  scores: {
    ...fixture.acceptEvaluation.scores,
    hookStrength: ACCEPT_THRESHOLDS.hookStrength - 1,
  },
};
const forcedRevision = enforceAgentStudioEvaluation(lowScoreEvaluation, strong);
assert.equal(forcedRevision.decision, 'revise');
assert.equal(forcedRevision.revisionInstructions.some((issue) => issue.includes('hookStrength')), true);

const enforcedRevision = enforceAgentStudioEvaluation(fixture.reviseEvaluation, strong);
assert.equal(enforcedRevision.revisionInstructions.some((issue) => issue.includes('scores.grounding')), true);
assert.equal(enforcedRevision.revisionInstructions.some((issue) => issue.includes('scores.creativeBoldness')), true);
const revisionContract = createAgentStudioRevisionContract(enforcedRevision);
assert.deepEqual(revisionContract.scoreFields.sort(), ['creativeBoldness', 'grounding']);
assert.deepEqual(revisionContract.items.map((item) => item.id), revisionContract.items.map((_, index) => `REV-${index + 1}`));
assert.equal(revisionContract.items[0].instruction, revisionContract.instructions[0]);

const movingGoalpostsEvaluation = {
  ...fixture.acceptEvaluation,
  decision: 'revise',
  scores: {
    ...fixture.acceptEvaluation.scores,
    hookStrength: 70,
  },
  blockingIssues: ['SUGGESTION: Add a bolder visual device that was not requested before.'],
  revisionInstructions: ['SUGGESTION: Add a bolder visual device that was not requested before.'],
  summary: 'The contracted issues are fixed, but the idea could be sharper.',
};
const stableAcceptance = enforceAgentStudioFinalEvaluation(movingGoalpostsEvaluation, strong, revisionContract);
assert.equal(stableAcceptance.decision, 'accept');
assert.equal(stableAcceptance.scores.hookStrength, fixture.reviseEvaluation.scores.hookStrength);
assert.equal(stableAcceptance.blockingIssues.length, 0);

const unresolvedContract = enforceAgentStudioFinalEvaluation({
  ...fixture.acceptEvaluation,
  decision: 'revise',
  blockingIssues: [`${revisionContract.items[0].id}: The contracted issue remains after revision.`],
  revisionInstructions: [`${revisionContract.items[0].id}: The contracted issue remains after revision.`],
}, strong, revisionContract);
assert.equal(unresolvedContract.decision, 'reject');
assert.equal(unresolvedContract.blockingIssues.some((issue) => issue.startsWith('REV-1:')), true);

const paraphrasedUnresolvedContract = enforceAgentStudioFinalEvaluation({
  ...fixture.acceptEvaluation,
  decision: 'revise',
  blockingIssues: ['The unsupported superlative is still present in different wording.'],
  revisionInstructions: [],
}, strong, revisionContract);
assert.equal(paraphrasedUnresolvedContract.decision, 'reject');
assert.equal(paraphrasedUnresolvedContract.blockingIssues.some((issue) => issue.includes('different wording')), true);

const successfulFinalAccept = enforceAgentStudioFinalEvaluation({
  ...fixture.acceptEvaluation,
  decision: 'accept',
  blockingIssues: [],
  revisionInstructions: [],
}, strong, revisionContract);
assert.equal(successfulFinalAccept.decision, 'accept');
assert.equal(successfulFinalAccept.blockingIssues.length, 0);

const criticalRegression = enforceAgentStudioFinalEvaluation({
  ...fixture.acceptEvaluation,
  decision: 'reject',
  blockingIssues: ['NEW_CRITICAL: The revision introduced an unsupported award claim.'],
  revisionInstructions: [],
}, strong, revisionContract);
assert.equal(criticalRegression.decision, 'reject');
assert.equal(criticalRegression.blockingIssues.some((issue) => issue.startsWith('NEW_CRITICAL:')), true);

const legacyScores = {
  ...fixture.acceptEvaluation,
  scores: {
    grounding: 96,
    brandFit: 91,
    originality: 90,
    feasibility: 95,
    language: 92,
    commercialFit: 89,
  },
};
assert.equal(enforceAgentStudioEvaluation(legacyScores, strong).decision, 'revise');

const forcedReject = enforceAgentStudioEvaluation(fixture.acceptEvaluation, weak, { finalPass: true });
assert.equal(forcedReject.decision, 'reject');
assert.equal(forcedReject.blockingIssues.length > 0, true);

assert.equal(getFirstBeatEndSeconds('0:00-0:02'), 2);
assert.equal(getFirstBeatEndSeconds('00:00–00:03'), 3);
assert.equal(getFirstBeatEndSeconds('opening shot'), null);

const creativePrompt = AGENT_STUDIO_DEFINITIONS.creative_producer.instructions;
const criticPrompt = AGENT_STUDIO_DEFINITIONS.critic.instructions;
assert.match(creativePrompt, /FEW-SHOT QUALITY TARGETS/);
assert.match(creativePrompt, /first 2 seconds/i);
assert.match(creativePrompt, /proof before CTA/i);
assert.match(criticPrompt, /creativeBoldness/);
assert.match(criticPrompt, /bland adaptation fails/i);
assert.match(criticPrompt, /revisionContract is binding/);
assert.match(criticPrompt, /REV-1/);
assert.match(criticPrompt, /NEW_CRITICAL:/);
assert.match(criticPrompt, /SUGGESTION:/);

console.log('Agent Studio creative quality checks passed.');
