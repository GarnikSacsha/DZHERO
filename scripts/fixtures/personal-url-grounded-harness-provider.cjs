'use strict';

const fs = require('fs');

function record(event) {
  const target = String(process.env.REMIX_TEST_PROVIDER_CALLS_PATH || '').trim();
  if (target) fs.appendFileSync(target, `${JSON.stringify(event)}\n`, 'utf8');
}

function sourceMetadata(savedUrl, title, handle) {
  return {
    title,
    description: `Deterministic metadata for ${savedUrl.id}.`,
    handle,
    profileUrl: `https://example.test/profiles/${savedUrl.id}`,
    sourceStatus: 'public_metadata',
  };
}

function groundedSource(savedUrl, { transcriptStatus = 'available' } = {}) {
  const title = `Grounded source ${savedUrl.id}`;
  const transcript = transcriptStatus === 'available'
    ? {
      status: 'available',
      source: 'mock_transcript',
      text: 'Show the process first, then reveal the result.',
      segments: [
        { id: 'transcript-1', startSeconds: 0, text: 'Show the process first.' },
        { id: 'transcript-2', startSeconds: 6, text: 'Then reveal the result.' },
      ],
    }
    : { status: transcriptStatus, source: 'mock_transcript', text: '', segments: [] };
  return {
    sourceType: 'personal_url',
    savedUrlId: savedUrl.id,
    title,
    description: `Grounded source description for ${savedUrl.id}.`,
    handle: '@grounded_creator',
    metadata: sourceMetadata(savedUrl, title, '@grounded_creator'),
    transcript,
    videoIntelligence: {
      readiness: { status: 'ready', level: 'high', gaps: ['visual frames are not archived in local tests'] },
      video: {
        status: 'available',
        videoInput: { type: 'video', uri: `mock://video/${savedUrl.id}`, source: 'mock-video-input' },
        videoSummary: 'A process is shown before the result is revealed.',
        spokenText: transcriptStatus === 'available' ? 'Show the process first, then reveal the result.' : '',
        onScreenText: 'PROCESS → RESULT',
        hook: 'Can you see the proof before the pitch?',
        contentMechanic: 'proof before explanation',
        scenes: [
          { timeframe: '0:00-0:03', visualAction: 'Show the process.', spokenContent: 'Show the process first.', onScreenText: 'PROCESS' },
          { timeframe: '0:03-0:09', visualAction: 'Reveal the result.', spokenContent: 'Then reveal the result.', onScreenText: 'RESULT' },
        ],
        soundMusicCues: ['quiet room tone', 'short reveal hit'],
        confidence: 'high for observed process and reveal',
        limitations: ['local fixture does not archive provider frames'],
      },
      visual: { status: 'unavailable' },
    },
    analysis: {
      status: 'available',
      items: [{ id: 'mechanic', label: 'mechanic', text: 'Proof before explanation.' }],
    },
    sourceStatus: 'grounded_mock',
    missing: ['visual frames'],
  };
}

async function resolveSource(savedUrl, options = {}) {
  await options.beforeProviderAttempt?.({
    provider: 'mock-personal-url-source',
    model: 'mock-personal-url-source-v1',
    operation: 'source_resolution',
    attempt: 1,
  });
  let resolved;
  if (savedUrl.id === 'saved_metadata_only') {
    const title = 'Metadata-only source';
    resolved = {
      sourceType: 'personal_url',
      savedUrlId: savedUrl.id,
      title,
      description: 'Only public metadata is available.',
      handle: '@metadata_creator',
      metadata: sourceMetadata(savedUrl, title, '@metadata_creator'),
      transcript: { status: 'unavailable', text: '', segments: [] },
      videoIntelligence: { readiness: { status: 'limited', level: 'limited', gaps: ['video unavailable'] }, video: { status: 'unavailable' } },
      analysis: { status: 'unavailable', items: [] },
      sourceStatus: 'metadata_only',
      missing: ['transcript', 'video_intelligence', 'source_grounding'],
    };
  } else if (savedUrl.id === 'saved_no_speech') {
    resolved = groundedSource(savedUrl, { transcriptStatus: 'not_applicable' });
  } else if (savedUrl.id === 'saved_transcript_unavailable') {
    resolved = groundedSource(savedUrl, { transcriptStatus: 'unavailable' });
  } else {
    resolved = groundedSource(savedUrl);
  }
  record({ type: 'source_resolver', savedUrlId: savedUrl.id, sourceContext: resolved });
  return resolved;
}

function createRemix(globalInsight, businessBrief) {
  const videoInput = globalInsight?.videoIntelligence?.video?.videoInput;
  record({
    type: 'remix_provider',
    savedUrlId: globalInsight?.savedUrlId || '',
    receivedVideoInput: videoInput || null,
    receivedSourceTitle: globalInsight?.title || '',
    receivedTranscript: globalInsight?.transcriptText || '',
  });
  if (globalInsight?.savedUrlId === 'saved_provider_failure') {
    const error = new Error('mock_provider_failure');
    error.code = 'mock_provider_failure';
    throw error;
  }
  if (globalInsight?.savedUrlId === 'saved_full' && (!videoInput || videoInput.uri !== 'mock://video/saved_full')) {
    throw new Error('video_input_missing_from_provider_payload');
  }
  const product = businessBrief?.product || businessBrief?.offer || 'workflow audit';
  return {
    deconstruction: {
      coreMechanics: 'Show observable proof before the explanation.',
      psychologicalTriggers: ['curiosity', 'visible proof'],
    },
    viabilityFilter: { isAdaptable: true, productionFeasibility: 'One phone and the real product process.' },
    remixes: [1, 2, 3].map((index) => ({
      title: `Grounded variant ${index} for ${product}`,
      hook: `Your workflow loses a handoff here — variant ${index}.`,
      visualFlow: [
        {
          timeframe: '0:00-0:03',
          actionDescription: 'Film the real task board on a laptop and point to the missed owner handoff.',
          onScreenText: 'ДЕ ГУБИТЬСЯ ЗАДАЧА?',
          audioVoiceover: 'Ось тут команда втрачає задачу між двома відповідальними.',
        },
        {
          timeframe: '0:03-0:09',
          actionDescription: 'Place the workflow-audit checklist beside the laptop and mark the duplicate approval step.',
          onScreenText: '1 ЗАЙВЕ ПОГОДЖЕННЯ',
          audioVoiceover: 'На аудиті прибираємо дубльоване погодження і залишаємо одного власника.',
        },
        {
          timeframe: '0:09-0:15',
          actionDescription: 'Refresh the cleaned task board, then hold the completed workflow-audit card toward the camera.',
          onScreenText: 'МАРШРУТ ЗАДАЧІ ГОТОВИЙ',
          audioVoiceover: 'Тепер видно весь маршрут задачі. Напиши «АУДИТ», якщо хочеш таку саму перевірку.',
        },
      ],
      cta: 'Напиши «АУДИТ» у Direct, щоб перевірити один робочий процес.',
    })),
    _generation: { provider: 'mock-grounded-remix', model: 'mock-grounded-remix-v1', attempts: 1, fallback: false },
  };
}

createRemix.resolveSource = resolveSource;

module.exports = createRemix;
