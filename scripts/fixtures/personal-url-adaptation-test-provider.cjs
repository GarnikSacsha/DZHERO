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
  while (!fs.existsSync(releasePath)) await new Promise((resolve) => setTimeout(resolve, 10));
  recordCall({ mode: 'released' });
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

module.exports = async function personalUrlAdaptationTestProvider(globalInsight, businessBrief, options = {}) {
  const savedUrlId = String(globalInsight?.savedUrlId || '').trim();
  const mode = savedUrlId.includes('failure') ? 'failure' : savedUrlId.includes('race') ? 'race' : 'success';
  recordCall({ savedUrlId, mode });
  await options.beforeProviderAttempt?.({
    provider: 'mock-personal-url-remix',
    model: 'mock-personal-url-remix-v1',
    operation: 'remix',
    attempt: 1,
  });
  if (mode === 'race') await waitForRelease();
  if (mode === 'failure') throw new Error('mock_personal_url_provider_failure');
  const product = businessBrief?.product || businessBrief?.niche || 'your offer';
  return {
    deconstruction: {
      coreMechanics: 'Personal URL source context is intentionally partial until provider analysis exists.',
      psychologicalTriggers: ['visible proof', 'curiosity'],
    },
    viabilityFilter: { isAdaptable: true, productionFeasibility: 'One phone and the real product process.' },
    remixes: [0, 1, 2].map((index) => ({
      title: `Personal variant ${index + 1} for ${product}`,
      hook: `Show the real proof first (${index + 1}).`,
      visualFlow: [{ timeframe: '0:00-0:03', actionDescription: 'Show the actual process.', onScreenText: 'Start with proof', audioVoiceover: 'Покажи реальний процес.' }],
      cta: 'Напиши нам, щоб отримати наступний крок.',
    })),
    _generation: { provider: 'mock-personal-url-remix', model: 'mock-personal-url-remix-v1', attempts: 1, fallback: false },
  };
};

module.exports.resolveSource = resolveSource;
