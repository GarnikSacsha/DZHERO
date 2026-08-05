const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applySignalQualityPolicy,
  loadSignalQualityGateConfig,
} = require('../backend/services/signalQualityGate.cjs');
const {
  immutablePaidRun,
  getPaidCases,
} = require('./fixtures/signal-quality-v3-paid-cases.cjs');

const config = loadSignalQualityGateConfig();

test('frozen production policy remains Signal Filter v3.1', () => {
  assert.equal(config.version, 3.1);
});

const defaultScores = {
  contentValue: 80,
  adaptability: 80,
  topicClarity: 80,
  hookStrength: 80,
  payoffStrength: 80,
  brandRelevance: 80,
};

function derivedClaim(text, evidenceIds, supportLevel = 'demonstrated') {
  return { text, evidenceIds, supportLevel };
}

function assessment({
  observations,
  contentEvidenceIds = observations.map((item) => item.id),
  contentSupport = 'demonstrated',
  centralSupport = contentSupport === 'inferred' ? 'inferred' : 'explicit',
  evidenceChains = [],
  scores = defaultScores,
  pass,
}) {
  const value = {
    accessible: true,
    summary: 'Deterministic offline Signal Filter v3.1 fixture.',
    derivedClaims: {
      centralIdea: derivedClaim('A concrete idea is delivered.', contentEvidenceIds, centralSupport),
      contentMechanic: derivedClaim('A reusable content mechanic.', contentEvidenceIds, contentSupport),
      visualExecution: derivedClaim(
        'The observed visual execution.',
        observations.map((item) => item.id),
        'demonstrated',
      ),
      adaptationTemplate: derivedClaim(
        '[setup] to [payoff]',
        contentEvidenceIds,
        'inferred',
      ),
    },
    scores: { ...scores },
    evidenceConfidence: 0.9,
    slopIndicators: [],
    observations,
    evidenceChains,
    unknowns: [],
  };
  if (typeof pass === 'boolean') value.pass = pass;
  return value;
}

function evidence(id, source, kind, description = `${kind} evidence`, timestamp = '00:01') {
  return {
    id,
    timestamp,
    source,
    kind,
    description,
    confidence: 0.95,
  };
}

function evidenceChain({
  mode,
  beforeEvidenceId = 'before',
  actionEvidenceId = 'action',
  afterEvidenceId = 'after',
  subject = 'tested subject',
  beforeState = 'initial observable state',
  afterState = 'changed observable state',
  supportLevel = 'demonstrated',
  directlyObserved = true,
  ambiguityReasons = [],
} = {}) {
  return {
    mode,
    beforeEvidenceId,
    actionEvidenceId,
    afterEvidenceId,
    subject,
    beforeState,
    afterState,
    supportLevel,
    directlyObserved,
    ambiguityReasons,
  };
}

test('paid consistency-run fixture remains immutable and contains all six results', () => {
  assert.equal(immutablePaidRun.immutable, true);
  assert.equal(immutablePaidRun.evaluations.length, 6);
  assert.equal(Object.isFrozen(immutablePaidRun), true);
  assert.equal(getPaidCases('mindstudio-accept').length, 3);
  assert.equal(getPaidCases('axial-teaser-reject').length, 3);
});

for (const { raw, assessment: paidAssessment } of getPaidCases('mindstudio-accept')) {
  test(`legacy MindStudio owner annotation ${raw.repeatIndex + 1} is not auto-enriched`, (t) => {
    const actual = applySignalQualityPolicy(paidAssessment, config);
    t.diagnostic(
      `fixture=mindstudio-${raw.repeatIndex + 1}; decision=${actual.decision}; mode=${actual.admissionMode}; reasons=${actual.rejectionReasons.join(',')}`,
    );
    assert.equal(actual.decision, 'reject');
    assert.equal(actual.admittedToBank, false);
    assert.deepEqual(actual.evidenceChains, []);
  });
}

for (const { raw, assessment: paidAssessment } of getPaidCases('axial-teaser-reject')) {
  test(`Axial paid repeat ${raw.repeatIndex + 1} is rejected`, (t) => {
    const actual = applySignalQualityPolicy(paidAssessment, config);
    t.diagnostic(
      `fixture=axial-${raw.repeatIndex + 1}; decision=${actual.decision}; mode=${actual.admissionMode}; reasons=${actual.rejectionReasons.join(',')}`,
    );
    assert.equal(actual.decision, 'reject');
    assert.equal(actual.admittedToBank, false);
    assert.equal(actual.admissionMode, null);
    assert.equal(actual.rejectionReasons.includes('inferred_only_content_mechanic'), true);
    assert.equal(actual.rejectionReasons.includes('no_qualifying_evidence_mode'), true);
  });
}

test('missing evidence ID is rejected', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('spoken', 'spoken', 'claim'),
      evidence('library', 'visual', 'setup'),
    ],
    contentEvidenceIds: ['spoken', 'missing'],
  }), config);
  assert.equal(actual.decision, 'reject');
  assert.deepEqual(actual.missingEvidenceIds, ['missing']);
  assert.equal(actual.rejectionReasons.includes('missing_evidence_reference'), true);
});

test('inferred-only content claim cannot independently accept', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('spoken', 'spoken', 'claim'),
      evidence('workflow', 'visual', 'process'),
    ],
    contentSupport: 'inferred',
  }), config);
  assert.equal(actual.decision, 'reject');
  assert.equal(actual.rejectionReasons.includes('inferred_only_content_mechanic'), true);
});

test('high scores and provider pass cannot replace sufficient evidence', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('slogan', 'onscreen_text', 'claim', 'The Sims for managing AI agents'),
      evidence('office', 'visual', 'visual_device', 'A 3D isometric office with avatars and Kanban cards.'),
    ],
    scores: {
      contentValue: 100,
      adaptability: 100,
      topicClarity: 100,
      hookStrength: 100,
      payoffStrength: 100,
      brandRelevance: 100,
    },
    pass: true,
  }), config);
  assert.equal(actual.decision, 'reject');
  assert.equal(actual.providerPassIgnored, true);
  assert.equal(actual.rejectionReasons.includes('no_qualifying_evidence_mode'), true);
});

test('sufficient evidence passes with unstable low scores and any brand relevance', () => {
  const lowScores = {
    contentValue: 5,
    adaptability: 7,
    topicClarity: 9,
    hookStrength: 3,
    payoffStrength: 2,
    brandRelevance: 100,
  };
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('beginner', 'spoken', 'claim', 'Beginners can start without workflow experience.'),
      evidence('workflow', 'spoken', 'process', 'The speaker explains how ready modules form a workflow.', '00:03'),
    ],
    scores: lowScores,
    pass: false,
  }), config);
  assert.equal(actual.decision, 'accept');
  assert.equal(actual.admittedToBank, true);
  assert.equal(actual.admissionMode, 'knowledge_explainer');
  assert.equal(actual.providerPassIgnored, true);
  assert.equal(actual.qualityScore < 10, true);
});

test('empty visual spectacle is rejected', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('glow', 'visual', 'visual_device'),
      evidence('motion', 'visual', 'visual_device'),
    ],
  }), config);
  assert.equal(actual.decision, 'reject');
  assert.equal(actual.rejectionReasons.includes('empty_visual_spectacle'), true);
});

test('valid visual transformation is accepted', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('before', 'visual', 'setup', 'The original object is visible.', '00:01'),
      evidence('change', 'visual', 'transition', 'An operation changes the object.', '00:05'),
      evidence('after', 'visual', 'result', 'The changed object is visible.', '00:09'),
    ],
    evidenceChains: [evidenceChain({
      mode: 'transformation',
      actionEvidenceId: 'change',
    })],
  }), config);
  assert.equal(actual.decision, 'accept');
  assert.equal(actual.admittedToBank, true);
  assert.equal(actual.admissionMode, 'transformation');
});

test('incomplete story without payoff is rejected', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('setup', 'visual', 'setup'),
      evidence('middle', 'spoken', 'transition'),
    ],
  }), config);
  assert.equal(actual.decision, 'reject');
  assert.equal(actual.rejectionReasons.includes('no_qualifying_evidence_mode'), true);
});

test('story with payoff is accepted', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('setup', 'spoken', 'setup', 'A problem is introduced.', '00:01'),
      evidence('middle', 'spoken', 'transition', 'The situation changes.', '00:05'),
      evidence('payoff', 'spoken', 'payoff', 'The problem is resolved.', '00:09'),
    ],
    evidenceChains: [evidenceChain({
      mode: 'story_emotion',
      beforeEvidenceId: 'setup',
      actionEvidenceId: 'middle',
      afterEvidenceId: 'payoff',
      subject: 'story problem',
      beforeState: 'problem is unresolved',
      afterState: 'problem is resolved',
    })],
  }), config);
  assert.equal(actual.decision, 'accept');
  assert.equal(actual.admittedToBank, true);
  assert.equal(actual.admissionMode, 'story_emotion');
  assert.equal(actual.passedModes.includes('story_emotion'), true);
});

test('valid setup action result chain is accepted as process demo', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('before', 'visual', 'setup', 'A pending task is visible.', '00:01'),
      evidence('action', 'visual', 'action', 'The user starts the operation.', '00:04'),
      evidence('after', 'visual', 'result', 'The completed task is visible.', '00:08'),
    ],
    evidenceChains: [evidenceChain({ mode: 'process_demo' })],
  }), config);
  assert.equal(actual.decision, 'accept');
  assert.equal(actual.admissionMode, 'process_demo');
  assert.equal(actual.causalChainValidation[0].valid, true);
});

test('claim plus visual device without semantic explanation is rejected', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('claim', 'spoken', 'claim'),
      evidence('visual', 'visual', 'visual_device'),
    ],
  }), config);
  assert.equal(actual.decision, 'reject');
  assert.equal(actual.admittedToBank, false);
});

test('camera movement presented as a result is uncertain and not admitted', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('before', 'visual', 'setup', 'An interface is visible.', '00:01'),
      evidence('action', 'visual', 'action', 'The camera moves across the interface.', '00:04'),
      evidence('after', 'visual', 'result', 'The camera returns to the interface.', '00:08'),
    ],
    evidenceChains: [evidenceChain({
      mode: 'process_demo',
      directlyObserved: false,
      ambiguityReasons: ['The edit does not prove a state change.'],
    })],
  }), config);
  assert.equal(actual.decision, 'uncertain');
  assert.equal(actual.admittedToBank, false);
  assert.equal(
    actual.uncertaintyReasons.includes('ambiguous_or_invalid_evidence_chain'),
    true,
  );
});

test('high scores and speculative causal relation cannot admit', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('before', 'visual', 'setup', 'A system view is visible.', '00:01'),
      evidence('action', 'visual', 'process', 'A different panel is shown.', '00:04'),
      evidence('after', 'visual', 'result', 'The initial view returns.', '00:08'),
    ],
    evidenceChains: [evidenceChain({
      mode: 'visual_product',
      supportLevel: 'inferred',
      directlyObserved: false,
      ambiguityReasons: ['Causality is inferred from adjacent shots.'],
    })],
    scores: {
      contentValue: 100,
      adaptability: 100,
      topicClarity: 100,
      hookStrength: 100,
      payoffStrength: 100,
      brandRelevance: 100,
    },
    pass: true,
  }), config);
  assert.notEqual(actual.decision, 'accept');
  assert.equal(actual.admittedToBank, false);
});

test('one observation cannot replace three causal observations', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('single', 'visual', 'result', 'One description asserts an entire change.', '00:05'),
    ],
    evidenceChains: [evidenceChain({
      mode: 'process_demo',
      beforeEvidenceId: 'single',
      actionEvidenceId: 'single',
      afterEvidenceId: 'single',
    })],
  }), config);
  assert.equal(actual.decision, 'uncertain');
  assert.equal(actual.admittedToBank, false);
  assert.equal(
    actual.causalChainValidation[0].issues.includes('evidence_ids_not_distinct'),
    true,
  );
});

test('provider-declared ambiguity produces uncertain', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('before', 'visual', 'setup', 'An initial state is visible.', '00:01'),
      evidence('action', 'visual', 'action', 'An action is visible.', '00:04'),
      evidence('after', 'visual', 'result', 'A later state is visible.', '00:08'),
    ],
    evidenceChains: [evidenceChain({
      mode: 'process_demo',
      ambiguityReasons: ['The later state may be an unrelated edit.'],
    })],
  }), config);
  assert.equal(actual.decision, 'uncertain');
  assert.equal(actual.admittedToBank, false);
});

test('observable visual product progression is accepted', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('before', 'visual', 'setup', 'The product starts in an empty state.', '00:01'),
      evidence('action', 'visual', 'process', 'The user completes the product action.', '00:04'),
      evidence('after', 'visual', 'result', 'The populated product result is visible.', '00:08'),
    ],
    evidenceChains: [evidenceChain({
      mode: 'visual_product',
      subject: 'product workspace',
      beforeState: 'workspace is empty',
      afterState: 'workspace contains the completed result',
    })],
  }), config);
  assert.equal(actual.decision, 'accept');
  assert.equal(actual.admissionMode, 'visual_product');
});

test('comedy requires a separate observable punchline', () => {
  const actual = applySignalQualityPolicy(assessment({
    observations: [
      evidence('before', 'visual', 'setup', 'A serious expectation is established.', '00:01'),
      evidence('action', 'visual', 'action', 'The subject reacts to the setup.', '00:04'),
      evidence('after', 'visual', 'punchline', 'A visible incongruous outcome resolves the setup.', '00:08'),
    ],
    evidenceChains: [evidenceChain({
      mode: 'comedy',
      subject: 'comic situation',
      beforeState: 'serious expectation',
      afterState: 'observable incongruous resolution',
    })],
  }), config);
  assert.equal(actual.decision, 'accept');
  assert.equal(actual.admissionMode, 'comedy');
});
