import assert from 'node:assert/strict';

import {
  deriveStudioAnalysis,
  deriveStudioTranscript,
  getStudioRemix,
  getStudioSourceLinks,
  normalizeStudioScriptScenes,
} from '../src/studioViewState.mjs';

const signal = {
  sourceUrl: 'https://www.youtube.com/shorts/real-source',
  importedMetadata: {
    youtube: { channelId: 'UC_REAL_CHANNEL' },
    videoIntelligence: {
      transcript: {
        status: 'available',
        language: 'en',
        segments: [
          { start: 0, text: 'A real caption segment.' },
          { startSeconds: 6, text: 'A second caption segment.' },
        ],
      },
      video: {
        videoSummary: 'Observed source summary.',
        spokenText: 'Observed spoken words.',
        onScreenText: 'Observed overlay.',
        hook: 'Observed hook.',
        contentMechanic: 'Observed mechanic.',
      },
    },
  },
  analysis: {
    recommendation: 'Use the verified reveal mechanic.',
    signals: ['A concrete proof point.'],
  },
  remixResult: {
    remixes: [{
      title: 'Brand-ready adaptation',
      hook: 'Adapted hook',
      visualFlow: [{
        timeframe: '0:00-0:03',
        actionDescription: 'Show the product detail.',
        onScreenText: 'The detail matters',
        audioVoiceover: 'Look closer.',
      }],
    }],
  },
};

assert.deepEqual(getStudioSourceLinks(signal), {
  originalUrl: 'https://www.youtube.com/shorts/real-source',
  profileUrl: 'https://www.youtube.com/channel/UC_REAL_CHANNEL',
});
assert.deepEqual(getStudioSourceLinks({
  sourceUrl: 'javascript:alert(1)',
  profileUrl: 'data:text/html,unsafe',
}), { originalUrl: '', profileUrl: '' });

const transcript = deriveStudioTranscript(signal);
assert.equal(transcript.status, 'available');
assert.equal(transcript.language, 'en');
assert.deepEqual(transcript.segments.map(({ time }) => time), ['00:00', '00:06']);
assert.equal(transcript.spokenText, '');
assert.equal(transcript.onScreenText, 'Observed overlay.');
assert.equal(deriveStudioTranscript({
  importedMetadata: { videoIntelligence: { transcript: { status: 'processing' } } },
}).status, 'generating');
assert.equal(deriveStudioTranscript({}).status, 'unavailable');

const analysis = deriveStudioAnalysis(signal);
assert.equal(analysis.status, 'available');
assert.ok(analysis.items.some((item) => item.text === 'Observed source summary.'));
assert.ok(analysis.items.some((item) => item.text === 'A concrete proof point.'));
assert.equal(deriveStudioAnalysis({ analysisStatus: 'pending' }).status, 'generating');
assert.equal(deriveStudioAnalysis({}).status, 'unavailable');

assert.equal(getStudioRemix(signal)?.title, 'Brand-ready adaptation');
assert.deepEqual(normalizeStudioScriptScenes(signal), [{
  id: 'scene-0',
  time: '0:00-0:03',
  direction: 'Show the product detail.',
  onScreenText: 'The detail matters',
  voiceover: 'Look closer.',
}]);
assert.deepEqual(normalizeStudioScriptScenes({}), []);

console.log('studio view state tests passed');
