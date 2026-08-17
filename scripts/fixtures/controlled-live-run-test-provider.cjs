'use strict';

const fs = require('node:fs');

function record(event) {
  const target = String(process.env.CONTROLLED_LIVE_RUN_PROVIDER_CALLS_PATH || '').trim();
  if (target) fs.appendFileSync(target, `${JSON.stringify(event)}\n`, 'utf8');
}

async function waitForRelease(savedUrlId) {
  const holdId = String(process.env.CONTROLLED_LIVE_RUN_HOLD_SAVED_URL_ID || '').trim();
  const releasePath = String(process.env.CONTROLLED_LIVE_RUN_RELEASE_PATH || '').trim();
  if (!releasePath || savedUrlId !== holdId) return;
  record({ kind: 'source_waiting', savedUrlId });
  while (!fs.existsSync(releasePath)) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  record({ kind: 'source_released', savedUrlId });
}

async function resolveSource(savedUrl, options = {}) {
  const savedUrlId = String(savedUrl?.id || '').trim();
  const budget = options.controlledRunBudget || {};
  record({ kind: 'source_config', savedUrlId, budget, language: options.language || '' });

  await options.beforeProviderAttempt?.({
    provider: 'apify',
    model: 'apify/instagram-reel-scraper',
    operation: 'social_source_resolution',
    attempt: 1,
  });
  record({ kind: 'apify_actor', savedUrlId, actor: 'apify/instagram-reel-scraper' });

  await options.beforeProviderAttempt?.({
    provider: 'gemini',
    model: 'gemini-3.6-flash',
    operation: 'public_video_analysis',
    attempt: 1,
  });
  record({ kind: 'video_analysis', savedUrlId, model: 'gemini-3.6-flash' });
  await waitForRelease(savedUrlId);

  return {
    sourceType: 'personal_url',
    savedUrlId,
    title: `Controlled source ${savedUrlId}`,
    description: 'Offline route-level controlled-run evidence.',
    handle: '@controlled_fixture',
    metadata: {
      title: `Controlled source ${savedUrlId}`,
      description: 'Offline route-level controlled-run evidence.',
      handle: '@controlled_fixture',
      sourceStatus: 'public_video_grounded',
      duration: 42,
    },
    transcript: {
      status: 'available',
      text: 'A bounded offline source demonstrates the mechanism.',
      segments: [{ time: '00:00', text: 'A bounded offline source demonstrates the mechanism.' }],
    },
    videoIntelligence: {
      analysisLanguage: options.language || 'uk',
      readiness: { status: 'ready', level: 'high', gaps: [] },
      video: {
        status: 'available',
        model: 'gemini-3.6-flash',
        videoSummary: 'The source shows a conflict, mechanism, and decision.',
        contentMechanic: 'show conflict, demonstrate mechanism, ask for a decision',
        scenes: [{ timeframe: '0:00-0:03', summary: 'Visible conflict.' }],
      },
      visual: { status: 'available', visualSummary: 'A visible bounded test scene.' },
    },
    analysis: {
      status: 'available',
      items: [{ id: 'summary', label: 'Summary', text: 'Localized bounded analysis.' }],
    },
    missing: [],
  };
}

async function remixProvider(globalInsight, businessBrief, options = {}) {
  const savedUrlId = String(globalInsight?.savedUrlId || '').trim();
  await options.beforeProviderAttempt?.({
    provider: 'gemini',
    model: 'gemini-3.5-flash',
    operation: 'remix',
    attempt: 1,
  });
  record({
    kind: 'remix',
    savedUrlId,
    model: 'gemini-3.5-flash',
    config: {
      maxAttempts: options.maxAttempts,
      maxOutputTokens: options.maxOutputTokens,
      maxRequestBytes: options.maxRequestBytes,
      language: options.language,
    },
  });
  return {
    deconstruction: {
      coreMechanics: 'Preserve the visible source mechanism.',
      psychologicalTriggers: ['visible proof'],
    },
    viabilityFilter: { isAdaptable: true, productionFeasibility: 'One phone and one real workflow.' },
    remixes: [0, 1, 2].map((index) => ({
      title: `Controlled adaptation ${index + 1}`,
      hook: `Bounded hook ${index + 1}`,
      visualFlow: [{
        timeframe: '0:00-0:03',
        actionDescription: 'Show the real workflow.',
        onScreenText: `ANGLE ${index + 1}`,
        audioVoiceover: `Controlled voiceover ${index + 1}.`,
      }],
      cta: 'Choose the next bounded step.',
    })),
    _generation: {
      provider: 'controlled-test-provider',
      model: 'gemini-3.5-flash',
      attempts: 1,
      fallback: false,
    },
  };
}

async function provider(...args) {
  if (args.length <= 1) {
    record({ kind: 'automatic_discovery', input: args[0] || null });
    return [];
  }
  return remixProvider(...args);
}

provider.resolveSource = resolveSource;
provider.runAgent = async function runAgent() {
  record({ kind: 'agent_studio_agent' });
  throw new Error('agent_studio_provider_must_be_blocked');
};
provider.analyzeVideo = async function analyzeVideo() {
  record({ kind: 'agent_studio_video' });
  throw new Error('agent_studio_provider_must_be_blocked');
};

module.exports = provider;
