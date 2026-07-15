const assert = require('node:assert/strict');

const {
  AgentStudioInputSchema,
  EvidencePackageSchema,
  CreativeBundleSchema,
  ContentPlanSchema,
  FinalPackageSchema,
  normalizeAgentStudioInput,
  toPublicTraceEntry,
} = require('../backend/services/agentStudioSchemas.cjs');

const evidence = {
  source: {
    kind: 'signal',
    signalId: 'reel_coffee_01',
    url: 'https://example.com/reel/coffee',
    title: 'Morning reveal',
  },
  availability: 'reliable',
  summary: 'A quiet morning setup is interrupted by a fast product reveal.',
  transferableMechanic: 'calm setup, interruption, sensory reveal',
  items: [
    {
      id: 'ev_1',
      sourceType: 'video_observation',
      text: 'A barista places an empty cup in frame.',
      timestamp: '0:00-0:02',
      confidence: 0.94,
    },
    {
      id: 'ev_2',
      sourceType: 'on_screen_text',
      text: 'Wait for it',
      timestamp: '0:02',
      confidence: 0.9,
    },
  ],
  unknowns: [],
  requiresContext: false,
};

const heroReel = {
  id: 'hero_1',
  title: 'Your 8:05 reset',
  concept: 'Turn the first coffee of the day into a tiny cinematic reset.',
  hook: 'Kyiv, your morning has a reset button.',
  durationSeconds: 18,
  scenes: [
    {
      timeframe: '0:00-0:03',
      action: 'Show an empty cup and the quiet counter.',
      onScreenText: 'Before 8:05',
      voiceover: 'The city is already loud.',
      evidenceRefs: ['ev_1'],
    },
    {
      timeframe: '0:03-0:10',
      action: 'Interrupt the still frame with espresso and steam.',
      onScreenText: 'Reset',
      voiceover: 'We can fix five minutes of it.',
      evidenceRefs: ['ev_2'],
    },
    {
      timeframe: '0:10-0:18',
      action: 'Show the first sip by the window and the real shop entrance.',
      onScreenText: 'Five warm minutes',
      voiceover: 'Save this for tomorrow and stop by before work.',
      evidenceRefs: ['ev_2'],
    },
  ],
  cta: 'Save this for tomorrow morning and visit us before work.',
  productionNotes: ['Phone on a tripod', 'Capture real steam in window light'],
  brandRefs: ['businessType', 'location', 'toneOfVoice'],
};

const creativeBundle = {
  heroReel,
  alternatives: [
    {
      id: 'alt_1',
      title: 'Coffee forecast',
      concept: 'A weather forecast where the only prediction is the next coffee mood.',
      hook: 'Today in Kyiv: 100% chance of needing this.',
      cta: 'Comment your morning forecast.',
      evidenceRefs: ['ev_1'],
      brandRefs: ['location'],
    },
    {
      id: 'alt_2',
      title: 'The meeting before the meeting',
      concept: 'Show coffee as the tiny ritual before a difficult workday.',
      hook: 'The most important meeting happens before the office.',
      cta: 'Send this to your morning coffee partner.',
      evidenceRefs: ['ev_2'],
      brandRefs: ['audience'],
    },
  ],
};

const plan = {
  strategy: 'Own the small reset moments in a busy Kyiv workweek.',
  days: Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    title: `Reset moment ${index + 1}`,
    format: index % 2 === 0 ? 'Reels' : 'Stories',
    objective: index < 3 ? 'reach' : 'engagement',
    hook: `A specific morning problem for day ${index + 1}`,
    cta: index % 2 === 0 ? 'Save this idea.' : 'Vote in the story.',
  })),
};

const evaluation = {
  decision: 'accept',
  scores: {
    grounding: 92,
    brandFit: 88,
    originality: 90,
    feasibility: 95,
    language: 91,
    commercialFit: 86,
    hookStrength: 90,
    mechanicFidelity: 91,
    creativeBoldness: 86,
  },
  blockingIssues: [],
  revisionInstructions: [],
  summary: 'The concept is grounded, distinct, and simple to shoot.',
};

const legacyEvaluation = {
  ...evaluation,
  scores: {
    grounding: evaluation.scores.grounding,
    brandFit: evaluation.scores.brandFit,
    originality: evaluation.scores.originality,
    feasibility: evaluation.scores.feasibility,
    language: evaluation.scores.language,
    commercialFit: evaluation.scores.commercialFit,
  },
};

const managerReview = {
  headline: 'One trend, rebuilt into a week of coffee-shop content.',
  whyItWorks: 'The package preserves the reveal mechanic while grounding every claim in the source and Brand Brain.',
  agentContributions: [
    { agent: 'Trend Analyst', summary: 'Matched the reveal mechanic to the visit objective.' },
    { agent: 'Gemini Video Analyst', summary: 'Grounded the visible setup and interruption.' },
    { agent: 'Brand Strategist', summary: 'Mapped the mechanic to a Kyiv morning ritual.' },
    { agent: 'Creative Producer', summary: 'Built a shoot-ready hero Reel and two alternatives.' },
    { agent: 'Critic', summary: 'Removed an unsupported superlative.' },
    { agent: 'Content Planner', summary: 'Expanded the insight across seven non-repetitive days.' },
  ],
  approvalPrompt: 'Approve the hero Reel and add the seven-day package to Content Plan?',
};

assert.equal(AgentStudioInputSchema.safeParse({ mode: 'adapt_reel', objective: 'Drive visits' }).success, false);
assert.equal(AgentStudioInputSchema.safeParse({ mode: 'adapt_reel', objective: 'Drive visits', signalId: 'sig_1' }).success, true);
assert.equal(AgentStudioInputSchema.safeParse({ mode: 'adapt_reel', objective: 'Drive visits', uploadId: 'upload_1' }).success, true);
assert.equal(AgentStudioInputSchema.safeParse({ mode: 'find_trend', objective: 'Drive visits' }).success, true);

assert.deepEqual(
  normalizeAgentStudioInput({
    mode: 'adapt_reel',
    objective: '  Drive morning visits  ',
    sourceUrl: ' https://example.com/reel/coffee ',
    userNotes: '  The reveal is a croissant. ',
  }),
  {
    mode: 'adapt_reel',
    objective: 'Drive morning visits',
    sourceUrl: 'https://example.com/reel/coffee',
    userNotes: 'The reveal is a croissant.',
  },
);

assert.equal(EvidencePackageSchema.safeParse(evidence).success, true);
assert.equal(EvidencePackageSchema.safeParse({
  ...evidence,
  items: [{ ...evidence.items[0], sourceType: 'model_guess' }],
}).success, false);

assert.equal(CreativeBundleSchema.safeParse(creativeBundle).success, true);
assert.equal(CreativeBundleSchema.safeParse({ ...creativeBundle, alternatives: creativeBundle.alternatives.slice(0, 1) }).success, false);

assert.equal(ContentPlanSchema.safeParse(plan).success, true);
assert.equal(FinalPackageSchema.safeParse({
  evidence,
  creative: creativeBundle,
  evaluation: legacyEvaluation,
  contentPlan: plan,
  managerReview,
  selectedTrend: {
    title: 'Morning reveal',
    rationale: 'It matches the objective and is feasible for a coffee shop.',
    signalId: 'reel_coffee_01',
  },
}).success, true);
assert.equal(ContentPlanSchema.safeParse({ ...plan, days: plan.days.slice(0, 6) }).success, false);
assert.equal(ContentPlanSchema.safeParse({
  ...plan,
  days: plan.days.map((day) => ({ ...day, day: 1 })),
}).success, false);

const publicTrace = toPublicTraceEntry({
  id: 'trace_1',
  agent: 'Critic',
  stage: 'evaluating',
  status: 'completed',
  summary: 'Removed an unsupported superlative.',
  createdAt: '2026-07-14T12:00:00.000Z',
  rawPrompt: 'private system prompt',
  reasoning: 'hidden chain of thought',
  apiKey: 'sk-secret',
  providerPayload: { secret: true },
});

assert.deepEqual(publicTrace, {
  id: 'trace_1',
  agent: 'Critic',
  stage: 'evaluating',
  status: 'completed',
  summary: 'Removed an unsupported superlative.',
  createdAt: '2026-07-14T12:00:00.000Z',
});
assert.equal(JSON.stringify(publicTrace).includes('secret'), false);

assert.equal(FinalPackageSchema.safeParse({
  evidence,
  creative: creativeBundle,
  evaluation,
  contentPlan: plan,
  managerReview,
  selectedTrend: {
    title: 'Morning reveal',
    rationale: 'It matches the objective and is feasible for a coffee shop.',
    signalId: 'reel_coffee_01',
  },
}).success, true);

assert.equal(FinalPackageSchema.safeParse({
  evidence,
  creative: {
    ...creativeBundle,
    heroReel: {
      ...heroReel,
      scenes: heroReel.scenes.map((scene, index) => (
        index === 0 ? { ...scene, evidenceRefs: ['ev_missing'] } : scene
      )),
    },
  },
  evaluation,
  contentPlan: plan,
  managerReview,
  selectedTrend: {
    title: 'Morning reveal',
    rationale: 'It matches the objective and is feasible for a coffee shop.',
    signalId: 'reel_coffee_01',
  },
}).success, false);

assert.equal(FinalPackageSchema.safeParse({
  evidence,
  creative: creativeBundle,
  evaluation,
  contentPlan: plan,
  selectedTrend: {
    title: 'Morning reveal',
    rationale: 'It matches the objective and is feasible for a coffee shop.',
    signalId: 'reel_coffee_01',
  },
}).success, false);

console.log('Agent Studio schema checks passed.');
