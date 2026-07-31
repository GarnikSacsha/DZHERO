const assert = require('node:assert/strict');
const {
  applySignalQualityPolicy,
  buildSignalQualityPrompt,
  evaluateSignalQuality,
  isSignalQualityBorderline,
  loadSignalQualityGateConfig,
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
  console.log('signal quality gate v3.1 contract tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
