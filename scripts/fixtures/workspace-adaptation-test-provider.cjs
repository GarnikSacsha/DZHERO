'use strict';

const fs = require('fs');

function recordCall(event) {
  const target = String(process.env.REMIX_TEST_PROVIDER_CALLS_PATH || '').trim();
  if (target) fs.appendFileSync(target, `${JSON.stringify(event)}\n`, 'utf8');
}

async function waitForRelease() {
  const releasePath = String(process.env.REMIX_TEST_PROVIDER_RELEASE_PATH || '').trim();
  if (!releasePath) return;
  recordCall({ mode: 'waiting_for_release' });
  while (!fs.existsSync(releasePath)) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  recordCall({ mode: 'released' });
}

function createVariant(index, businessBrief, sourceTitle) {
  const brand = businessBrief?.product || businessBrief?.niche || 'your offer';
  return {
    title: `Mock adaptation ${index}: ${brand}`,
    hook: `Show the proof before explaining ${sourceTitle}.`,
    visualFlow: [
      {
        timeframe: '0:00-0:03',
        actionDescription: `Open with the visible mechanic from ${sourceTitle}.`,
        onScreenText: 'Start with the proof',
        audioVoiceover: 'Почни з дії, яку глядач одразу бачить.',
      },
      {
        timeframe: '0:03-0:09',
        actionDescription: `Show the ${brand} process and its constraint.`,
        onScreenText: 'Show the process',
        audioVoiceover: 'Покажи процес без вигаданих обіцянок.',
      },
      {
        timeframe: '0:09-0:15',
        actionDescription: 'Show a real next step and invite a reply.',
        onScreenText: 'Invite the next step',
        audioVoiceover: 'Запропонуй простий наступний крок.',
      },
    ],
    cta: 'Напиши нам, щоб отримати наступний крок.',
  };
}

async function resolveSource(savedUrl, options = {}) {
  await options.beforeProviderAttempt?.({
    provider: 'mock-public-source',
    model: 'mock-public-source-v1',
    operation: 'source_resolution',
    attempt: 1,
  });
  const title = `Mock source ${savedUrl.id}`;
  return {
    sourceType: 'personal_url',
    savedUrlId: savedUrl.id,
    title,
    description: `Grounded mock description for ${savedUrl.id}.`,
    handle: '@mock_source',
    metadata: { title, description: `Grounded mock description for ${savedUrl.id}.`, handle: '@mock_source', sourceStatus: 'public_metadata' },
    transcript: { status: 'available', text: `Grounded transcript for ${savedUrl.id}.`, segments: [] },
    videoIntelligence: {
      readiness: { status: 'partial', level: 'medium', gaps: ['visual frames unavailable'] },
      video: { status: 'available', videoSummary: `Grounded summary for ${savedUrl.id}.`, contentMechanic: 'proof before explanation' },
      visual: { status: 'unavailable' },
    },
    analysis: { status: 'partial', items: [{ id: 'summary', label: 'summary', text: `Grounded summary for ${savedUrl.id}.` }] },
    missing: ['visual frames'],
  };
}

async function workspaceAdaptationTestProvider(globalInsight, businessBrief, options = {}) {
  const savedUrlId = String(globalInsight?.savedUrlId || '').trim();
  const sourceTitle = String(globalInsight?.title || '').trim();
  recordCall({ sourceTitle, savedUrlId, mode: savedUrlId.includes('failure') || sourceTitle.includes('Failure') ? 'failure' : 'success' });
  await options.beforeProviderAttempt?.({
    provider: 'mock-remix',
    model: 'mock-remix-v1',
    operation: 'remix',
    attempt: 1,
  });
  if (savedUrlId.includes('race') || sourceTitle.includes('Race')) await waitForRelease();
  if (savedUrlId.includes('failure') || sourceTitle.includes('Failure')) throw new Error('mock_provider_failure');
  return {
    deconstruction: {
      coreMechanics: `Grounded in ${sourceTitle} and the persisted source evidence.`,
      psychologicalTriggers: ['visible proof', 'curiosity', 'simple next step'],
      removedCulturalContext: ['unsupported foreign context'],
    },
    viabilityFilter: {
      isAdaptable: true,
      uaMentalityCheck: 'A concrete, low-budget proof is easy to understand locally.',
      productionFeasibility: 'One phone, one speaker, and the real product process.',
    },
    remixes: [1, 2, 3].map((index) => createVariant(index, businessBrief, sourceTitle)),
    _generation: { provider: 'mock-remix', model: 'mock-remix-v1', attempts: 1, fallback: false },
  };
}

workspaceAdaptationTestProvider.resolveSource = resolveSource;

module.exports = workspaceAdaptationTestProvider;
