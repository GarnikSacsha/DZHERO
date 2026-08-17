'use strict';

const fs = require('fs');

function record(event) {
  const target = String(process.env.REMIX_TEST_PROVIDER_CALLS_PATH || '').trim();
  if (target) fs.appendFileSync(target, `${JSON.stringify(event)}\n`, 'utf8');
}

async function resolveSource(savedUrl, options = {}) {
  const language = options.language === 'en' ? 'en' : 'uk';
  await options.beforeProviderAttempt?.({
    provider: 'mock-personal-url-source',
    model: 'mock-public-source-v1',
    operation: 'source_resolution',
    attempt: 1,
  });
  if (savedUrl.id === 'saved_source_failure') {
    record({ type: 'source_resolver', savedUrlId: savedUrl.id, language, mode: 'failure' });
    throw new Error('mock_source_resolver_failure');
  }
  if (savedUrl.id === 'saved_source_empty') {
    const empty = {
      sourceType: 'personal_url',
      savedUrlId: savedUrl.id,
      metadata: null,
      title: '',
      description: '',
      handle: '',
      transcript: { status: 'unavailable', text: '', segments: [] },
      videoIntelligence: null,
      analysis: { status: 'unavailable', items: [] },
      sourceStatus: 'empty_source',
      missing: ['metadata', 'title_description', 'transcript', 'video_intelligence', 'visual_observations', 'analysis'],
    };
    record({ type: 'source_resolver', savedUrlId: savedUrl.id, language, sourceContext: empty, mode: 'empty' });
    return empty;
  }
  if (savedUrl.id === 'saved_source_partial') {
    const partial = {
      sourceType: 'personal_url',
      savedUrlId: savedUrl.id,
      metadata: {
        title: 'Partial mocked source title',
        description: 'Partial source caption with one grounded mechanic.',
        handle: '@partial_creator',
        sourceStatus: 'public_metadata',
      },
      title: 'Partial mocked source title',
      description: 'Partial source caption with one grounded mechanic.',
      handle: '@partial_creator',
      transcript: { status: 'unavailable', text: '', segments: [] },
      videoIntelligence: { readiness: { status: 'limited', level: 'limited', gaps: ['captions unavailable', 'video unavailable'] }, video: { status: 'unavailable' }, visual: null },
      grounding: { status: 'unavailable', mode: 'metadata_only', videoInput: null, transcript: { status: 'unavailable', trusted: false } },
      analysis: { status: 'partial', items: [{ id: 'caption', label: 'notes', text: 'Only public caption is available.' }] },
      sourceStatus: 'partial_source',
      missing: ['transcript', 'video_intelligence', 'visual_observations', 'source_grounding'],
    };
    record({ type: 'source_resolver', savedUrlId: savedUrl.id, language, sourceContext: partial, mode: 'partial' });
    return partial;
  }
  const sourceContext = {
    sourceType: 'personal_url',
    savedUrlId: savedUrl.id,
    originalUrl: savedUrl.originalUrl,
    canonicalUrl: savedUrl.canonicalUrl,
    platform: savedUrl.platform,
    language,
    metadata: {
      title: 'Grounded mocked source title',
      description: 'A mocked source caption with a visible process and outcome.',
      handle: '@grounded_creator',
      sourceStatus: 'public_metadata',
    },
    title: 'Grounded mocked source title',
    description: 'A mocked source caption with a visible process and outcome.',
    handle: '@grounded_creator',
    transcript: {
      status: 'available',
      text: 'Show the process first, then reveal the result.',
      segments: [{ id: 'segment-1', time: '00:00', text: 'Show the process first, then reveal the result.' }],
    },
    videoIntelligence: {
      analysisLanguage: language,
      readiness: { status: 'ready', level: 'high', gaps: ['visual frames unavailable'] },
      video: {
        status: 'available',
        videoInput: { type: 'video', uri: savedUrl.canonicalUrl, source: 'mock_video_provider' },
        videoSummary: language === 'en'
          ? 'The creator demonstrates a process before revealing the result.'
          : 'Автор показує процес перед тим, як розкриває результат.',
        spokenText: 'Show the process first, then reveal the result.',
        onScreenText: 'Process → result',
        hook: language === 'en' ? 'Can you see the proof before the pitch?' : 'Чи видно доказ до пітчу?',
        contentMechanic: language === 'en' ? 'proof before explanation' : 'доказ перед поясненням',
        scenes: [{
          timeframe: '0:00-0:03',
          visualAction: language === 'en' ? 'Show the process.' : 'Покажи процес.',
          spokenContent: 'Show the process first.',
          onScreenText: 'Process',
          localizedOnScreenText: language === 'en' ? '' : 'Процес',
          soundMusicCues: language === 'en' ? 'Quiet room tone' : 'Тихий кімнатний шум',
        }],
        soundMusicCues: [language === 'en' ? 'Quiet room tone' : 'Тихий кімнатний шум'],
        confidence: language === 'en' ? 'high for observed process' : 'висока для показаного процесу',
        limitations: [language === 'en' ? 'visual frames are sampled by provider, not archived locally' : 'кадри вибрані провайдером, але локально не архівуються'],
      },
      visual: { status: 'unavailable' },
    },
    analysis: {
      status: 'partial',
      items: [{ id: 'mechanic', label: 'mechanic', text: language === 'en' ? 'Proof before explanation.' : 'Доказ перед поясненням.' }],
    },
    grounding: {
      status: 'full',
      mode: 'video',
      videoInput: { type: 'video', uri: savedUrl.canonicalUrl, source: 'mock_video_provider' },
      transcript: { status: 'available', trusted: true, source: 'mock_captions' },
    },
    missing: ['visual frames'],
    sourceStatus: 'partial_ready',
  };
  record({ type: 'source_resolver', savedUrlId: savedUrl.id, language, sourceContext });
  return sourceContext;
}

async function personalUrlSourceObservabilityProvider(globalInsight, businessBrief, options = {}) {
  record({ type: 'remix_provider', language: options.language === 'en' ? 'en' : 'uk', globalInsight, businessBrief });
  await options.beforeProviderAttempt?.({
    provider: 'mock-personal-url-remix',
    model: 'mock-personal-url-remix-v1',
    operation: 'remix',
    attempt: 1,
  });
  return {
    deconstruction: { coreMechanics: 'Use the grounded source mechanic.' },
    viabilityFilter: { isAdaptable: true, productionFeasibility: 'One phone and the real process.' },
    remixes: ['visible_source_conflict', 'mechanism_walkthrough', 'viewer_decision'].map((semanticAngle, index) => ({
      title: `Grounded variant ${index}`,
      hook: 'Show the proof before the explanation.',
      semanticAngle,
      centralClaim: `Grounded semantic claim ${index + 1}`,
      sourceConflict: 'The creator must prove the process before asking for trust.',
      preservedMechanic: 'Show the process, reveal the result, and invite a concrete next step.',
      brandTranslation: 'Use the saved workspace Brand Brain without changing the grounded conflict.',
      productionProof: 'One phone, one real process, and one visible result.',
      adaptationLogic: 'Preserve the grounded proof-before-explanation mechanic in the workspace context.',
      visualFlow: [0, 1, 2].map((beat) => ({
        timeframe: `0:0${beat}-0:0${beat + 1}`,
        actionDescription: `Show grounded production action ${index + 1}.${beat + 1} in frame.`,
        onScreenText: `Grounded proof ${index + 1}.${beat + 1}`,
        audioVoiceover: `Explain grounded proof beat ${index + 1}.${beat + 1}.`,
      })),
      cta: 'Напиши нам, щоб отримати наступний крок.',
    })),
    _generation: { provider: 'mock-personal-url-remix', model: 'mock-personal-url-remix-v1', attempts: 1, fallback: false },
  };
}

personalUrlSourceObservabilityProvider.resolveSource = resolveSource;

module.exports = personalUrlSourceObservabilityProvider;
