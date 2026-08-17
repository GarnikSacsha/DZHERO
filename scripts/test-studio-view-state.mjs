import assert from 'node:assert/strict';

import { buildStudioContentPlanDraft } from '../src/contentPlanUtils.mjs';

import {
  deriveStudioAnalysis,
  deriveStudioTranscript,
  getStudioRemix,
  getStudioRemixes,
  getStudioSourceLinks,
  normalizeStudioScriptScenes,
} from '../src/studioViewState.mjs';

const signal = {
  sourceType: 'personal_url',
  personalUrl: true,
  sourceUrl: 'https://www.youtube.com/shorts/real-source',
  importedMetadata: {
    grounding: {
      status: 'full',
      mode: 'video',
      videoInput: { type: 'video', uri: 'https://www.youtube.com/shorts/real-source' },
      transcript: { status: 'available', trusted: true },
    },
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
        observations: [
          { sourceType: 'on_screen_text', timestamp: '0:02', text: 'ORIGINAL OCR', localizedText: 'ЛОКАЛІЗОВАНИЙ OCR' },
          { sourceType: 'on_screen_text', timestamp: '0:12', text: 'LATE OCR', localizedText: 'ПІЗНІЙ OCR' },
          { sourceType: 'on_screen_text', timestamp: '0:14', text: 'SAME OCR', localizedText: 'SAME OCR' },
        ],
        scenes: [
          {
            timeframe: '0:00-0:05',
            visualAction: 'Локалізований опис першої сцени.',
            spokenContent: 'Original spoken scene evidence.',
            onScreenText: 'ORIGINAL OCR',
            localizedOnScreenText: 'ЛОКАЛІЗОВАНИЙ OCR',
          },
          {
            timeframe: '0:05-0:09',
            visualAction: 'Локалізований опис другої сцени.',
            spokenContent: 'Original second spoken fragment.',
            onScreenText: 'SECOND OCR\nSEPARATE CTA',
          },
        ],
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
assert.deepEqual(transcript.ocrEntries, [
  { id: 'ocr-scene-1', sceneNumber: 1, time: '0:00-0:05', texts: ['ORIGINAL OCR'], localizedTexts: ['ЛОКАЛІЗОВАНИЙ OCR'] },
  { id: 'ocr-scene-2', sceneNumber: 2, time: '0:05-0:09', texts: ['SECOND OCR', 'SEPARATE CTA'], localizedTexts: [] },
  { id: 'ocr-observation-2', sceneNumber: null, time: '0:12', texts: ['LATE OCR'], localizedTexts: ['ПІЗНІЙ OCR'] },
  { id: 'ocr-observation-3', sceneNumber: null, time: '0:14', texts: ['SAME OCR'], localizedTexts: [] },
]);
assert.equal(deriveStudioTranscript({
  importedMetadata: { videoIntelligence: { transcript: { status: 'processing' } } },
}).status, 'generating');
assert.equal(deriveStudioTranscript({}).status, 'unavailable');
const ocrOnlyEvidence = deriveStudioTranscript({
  importedMetadata: {
    videoIntelligence: {
      transcript: { status: 'not_applicable' },
      video: { scenes: [{ timeframe: '0:03-0:06', onScreenText: 'SILENT SOURCE TEXT' }] },
    },
  },
});
assert.equal(ocrOnlyEvidence.status, 'available', 'visual OCR must remain available without inventing speech');
assert.equal(ocrOnlyEvidence.spokenText, '');
assert.deepEqual(ocrOnlyEvidence.ocrEntries[0], {
  id: 'ocr-scene-1',
  sceneNumber: 1,
  time: '0:03-0:06',
  texts: ['SILENT SOURCE TEXT'],
  localizedTexts: [],
});

const analysis = deriveStudioAnalysis(signal);
assert.equal(analysis.status, 'available');
assert.ok(analysis.items.some((item) => item.text === 'Observed source summary.'));
assert.ok(analysis.items.some((item) => item.text === 'A concrete proof point.'));
assert.ok(analysis.items.some((item) => item.text.includes('Локалізований опис першої сцени.')));
const localizedAnalysisText = analysis.items.map(({ text }) => text).join('\n');
assert.doesNotMatch(localizedAnalysisText, /A real caption segment|Original spoken scene evidence|Original second spoken fragment/);
assert.doesNotMatch(localizedAnalysisText, /ORIGINAL OCR|SECOND OCR|SEPARATE CTA|LATE OCR/);
assert.equal(deriveStudioAnalysis({ analysisStatus: 'pending' }).status, 'generating');
assert.equal(deriveStudioAnalysis({}).status, 'unavailable');
assert.equal(deriveStudioAnalysis({
  sourceType: 'personal_url',
  personalUrl: true,
  title: 'Metadata-only title',
  analysis: { items: [{ label: 'notes', text: 'This must not count as grounded.' }] },
  importedMetadata: {
    grounding: { status: 'unavailable', mode: 'metadata_only' },
    videoIntelligence: { video: { videoSummary: 'Metadata-only summary.' } },
  },
}).status, 'unavailable');
assert.equal(deriveStudioTranscript({
  importedMetadata: { videoIntelligence: { transcript: { status: 'not_applicable' } } },
}).status, 'not_applicable');

assert.equal(getStudioRemix(signal)?.title, 'Brand-ready adaptation');
assert.deepEqual(getStudioRemixes(signal).map(({ title }) => title), ['Brand-ready adaptation']);
const persistedAdaptation = {
  id: 'adaptation-1',
  result: {
    remixes: [
      { title: 'Persisted variant one', visualFlow: [{ timeframe: '0:00', actionDescription: 'One', onScreenText: '', audioVoiceover: '' }] },
      { title: 'Persisted variant two', hook: 'Two-second hook', cta: 'Write to us', visualFlow: [{ timeframe: '0:01', actionDescription: 'Two', onScreenText: '', audioVoiceover: '' }] },
    ],
  },
};
assert.deepEqual(getStudioRemixes(signal, persistedAdaptation).map(({ title }) => title), ['Persisted variant one', 'Persisted variant two']);
assert.equal(getStudioRemix(signal, persistedAdaptation)?.title, 'Persisted variant one');
assert.deepEqual(normalizeStudioScriptScenes(signal, persistedAdaptation, persistedAdaptation.result.remixes[1]), [{
  id: 'scene-0',
  time: '0:01',
  direction: 'Two',
  onScreenText: '',
  voiceover: '',
}]);
const persistedDraft = buildStudioContentPlanDraft(signal, persistedAdaptation, persistedAdaptation.result.remixes[1]);
assert.equal(persistedDraft.title, 'Persisted variant two');
assert.match(persistedDraft.body, /CTA:/);
assert.deepEqual(normalizeStudioScriptScenes(signal), [{
  id: 'scene-0',
  time: '0:00-0:03',
  direction: 'Show the product detail.',
  onScreenText: 'The detail matters',
  voiceover: 'Look closer.',
}]);
assert.deepEqual(normalizeStudioScriptScenes({}), []);

console.log('studio view state tests passed');
