const selectedTrend = {
  title: 'The quiet setup and sensory reveal',
  rationale: 'A low-budget reveal mechanic fits a coffee shop and the objective of driving morning visits.',
  signalId: 'signal_coffee_reveal',
  sourceUrl: 'https://example.com/reels/coffee-reveal',
  objectiveFit: 94,
};

const evidence = {
  source: {
    kind: 'fixture',
    signalId: 'signal_coffee_reveal',
    url: 'https://example.com/reels/coffee-reveal',
    title: 'Coffee reveal fixture',
  },
  availability: 'reliable',
  summary: 'A quiet empty-cup setup is interrupted by a fast espresso and pastry reveal.',
  transferableMechanic: 'calm setup, pattern interruption, sensory product reveal, simple CTA',
  items: [
    {
      id: 'ev_cup',
      sourceType: 'video_observation',
      text: 'An empty cup sits alone on a quiet counter.',
      timestamp: '0:00-0:03',
      confidence: 0.96,
    },
    {
      id: 'ev_reveal',
      sourceType: 'video_observation',
      text: 'Espresso, steam, and a pastry enter frame in one quick movement.',
      timestamp: '0:03-0:08',
      confidence: 0.94,
    },
    {
      id: 'ev_text',
      sourceType: 'on_screen_text',
      text: 'Wait for it',
      timestamp: '0:02',
      confidence: 0.91,
    },
  ],
  unknowns: [],
  requiresContext: false,
};

const brandStrategy = {
  audienceInsight: 'Busy Kyiv professionals want a small, believable morning ritual rather than a grand lifestyle promise.',
  brandAngle: 'Position the coffee shop as a five-minute reset before the workday becomes noisy.',
  localContext: 'Use a recognizable Kyiv weekday morning and real counter service without invented rankings or claims.',
  tone: 'warm, quick, observant, lightly playful',
  mustInclude: ['real espresso preparation', 'Kyiv morning context', 'a save or visit CTA'],
  mustAvoid: ['best coffee in Kyiv', 'invented customer metrics', 'luxury production'],
  brandRefs: ['businessType', 'location', 'audience', 'toneOfVoice', 'cta'],
};

const creative = {
  heroReel: {
    id: 'hero_reset',
    title: 'The 8:05 reset',
    concept: 'A silent cup becomes a quick sensory reset before a busy Kyiv workday.',
    hook: 'Kyiv, your morning has a reset button.',
    durationSeconds: 18,
    scenes: [
      {
        timeframe: '0:00-0:03',
        action: 'Lock the phone above a quiet counter and frame one empty cup.',
        onScreenText: 'Before 8:05',
        voiceover: 'The city is already loud.',
        evidenceRefs: ['ev_cup'],
      },
      {
        timeframe: '0:03-0:09',
        action: 'Slide espresso and a warm croissant into frame as steam crosses the lens.',
        onScreenText: 'Reset',
        voiceover: 'Give us five minutes before the first meeting.',
        evidenceRefs: ['ev_reveal', 'ev_text'],
      },
      {
        timeframe: '0:09-0:18',
        action: 'Show the first sip by the window and the real shop entrance.',
        onScreenText: 'Your morning stop in Kyiv',
        voiceover: 'Save this for tomorrow and stop by before work.',
        evidenceRefs: ['ev_reveal'],
      },
    ],
    cta: 'Save this for tomorrow morning and visit before work.',
    productionNotes: ['Use a phone tripod', 'Record real steam in window light', 'Keep the shop audio for texture'],
    brandRefs: ['businessType', 'location', 'audience', 'toneOfVoice', 'cta'],
  },
  alternatives: [
    {
      id: 'alt_forecast',
      title: 'The Kyiv coffee forecast',
      concept: 'A weather forecast where the morning prediction is a very specific coffee mood.',
      hook: 'Today in Kyiv: 100% chance of needing this.',
      cta: 'Comment with your morning forecast.',
      evidenceRefs: ['ev_cup', 'ev_reveal'],
      brandRefs: ['location', 'toneOfVoice'],
    },
    {
      id: 'alt_meeting',
      title: 'The meeting before the meeting',
      concept: 'Treat the coffee ritual as the smallest and most useful meeting of the day.',
      hook: 'Your most important meeting happens before the office.',
      cta: 'Send this to your coffee partner.',
      evidenceRefs: ['ev_cup', 'ev_reveal'],
      brandRefs: ['audience', 'businessType'],
    },
  ],
};

const reviseEvaluation = {
  decision: 'revise',
  scores: {
    grounding: 78,
    brandFit: 88,
    originality: 90,
    feasibility: 95,
    language: 91,
    commercialFit: 84,
  },
  blockingIssues: ['The draft calls the shop the best in Kyiv without evidence.'],
  revisionInstructions: ['Remove the unsupported superlative and use the verifiable morning-stop angle.'],
  summary: 'The mechanic works, but one claim must be grounded before approval.',
};

const acceptEvaluation = {
  decision: 'accept',
  scores: {
    grounding: 96,
    brandFit: 91,
    originality: 90,
    feasibility: 95,
    language: 92,
    commercialFit: 89,
  },
  blockingIssues: [],
  revisionInstructions: [],
  summary: 'The unsupported claim is gone; the package is grounded, specific, and easy to shoot.',
};

const contentPlan = {
  strategy: 'Own seven small reset moments across one busy Kyiv workweek.',
  days: [
    ['The 8:05 reset', 'Reels', 'reach', 'Kyiv, your morning has a reset button.', 'Save this for tomorrow.'],
    ['Choose your reset', 'Stories', 'engagement', 'Espresso or cappuccino before the first call?', 'Vote in the story.'],
    ['The sound of five quiet minutes', 'Reels', 'reach', 'Turn the sound on before your next meeting.', 'Send this to a tired colleague.'],
    ['What the barista sees at 8 AM', 'Stories', 'trust', 'Three morning moods, one counter.', 'Which one are you?'],
    ['The meeting before the meeting', 'Reels', 'engagement', 'This meeting should have been a coffee.', 'Tag your coffee partner.'],
    ['A real counter reset', 'Post', 'trust', 'No studio: this is how the morning ritual actually looks.', 'Save the address for Monday.'],
    ['Next week starts here', 'Reels', 'visits', 'Sunday planning needs one good promise.', 'Visit before work this week.'],
  ].map(([title, format, objective, hook, cta], index) => ({
    day: index + 1,
    title,
    format,
    objective,
    hook,
    cta,
  })),
};

const managerReview = {
  headline: 'One real signal became a full week of shootable coffee-shop content.',
  whyItWorks: 'The agents preserved the observed reveal mechanic, adapted it to the shop, removed an unsupported claim, and expanded one insight without repeating the same Reel seven times.',
  agentContributions: [
    { agent: 'Trend Analyst', summary: 'Matched a low-budget reveal mechanic to morning visits.' },
    { agent: 'Gemini Video Analyst', summary: 'Grounded the quiet setup, interruption, and product reveal.' },
    { agent: 'Brand Strategist', summary: 'Turned the mechanic into a Kyiv morning-reset position.' },
    { agent: 'Creative Producer', summary: 'Built one complete Reel and two distinct alternatives.' },
    { agent: 'Critic', summary: 'Removed the unsupported best-in-Kyiv claim.' },
    { agent: 'Content Planner', summary: 'Expanded the strategy into seven non-repetitive days.' },
  ],
  approvalPrompt: 'Approve the hero Reel and add this seven-day package to Content Plan?',
};

module.exports = {
  selectedTrend,
  evidence,
  brandStrategy,
  creative,
  reviseEvaluation,
  acceptEvaluation,
  contentPlan,
  managerReview,
};
