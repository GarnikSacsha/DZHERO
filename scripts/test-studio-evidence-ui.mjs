import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [component, uk, en, styles] = await Promise.all([
  readFile('src/components/ProductStudioPreview.jsx', 'utf8'),
  readFile('src/locales/uk.mjs', 'utf8'),
  readFile('src/locales/en.mjs', 'utf8'),
  readFile('src/styles.css', 'utf8'),
]);

function functionSource(name, nextName) {
  const start = component.indexOf(`function ${name}`);
  const end = component.indexOf(`function ${nextName}`, start + 1);
  assert.notEqual(start, -1, `Missing component function: ${name}`);
  assert.notEqual(end, -1, `Missing following component function: ${nextName}`);
  return component.slice(start, end);
}

const transcriptPanel = functionSource('TranscriptPanel', 'AnalysisPanel');
assert.match(transcriptPanel, /product\.studio\.transcript\.boundary/);
assert.match(transcriptPanel, /transcript\.segments\.map/);
assert.match(transcriptPanel, /transcript\.ocrEntries\.map/);
assert.match(transcriptPanel, /entry\.sceneNumber/);
assert.match(transcriptPanel, /entry\.time/);
assert.match(transcriptPanel, /entry\.texts\.map/);
assert.match(transcriptPanel, /entry\.localizedTexts\.map/);
assert.match(transcriptPanel, /!!entry\.localizedTexts\?\.length/);
assert.match(transcriptPanel, /product\.studio\.transcript\.ocrOriginal/);
assert.match(transcriptPanel, /product\.studio\.transcript\.ocrLocalized/);
assert.doesNotMatch(transcriptPanel, /<p>\{transcript\.onScreenText\}<\/p>/);

const analysisPanel = functionSource('AnalysisPanel', 'AdaptationPanel');
assert.match(analysisPanel, /product\.studio\.analysis\.localizedBoundary/);
assert.match(analysisPanel, /analysis\.items\.map/);
assert.doesNotMatch(analysisPanel, /spokenContent|onScreenText|transcript\.spokenText/);

for (const locale of [uk, en]) {
  for (const key of [
    'product.studio.transcript.boundary',
    'product.studio.transcript.spoken',
    'product.studio.transcript.onScreen',
    'product.studio.transcript.ocrDescription',
    'product.studio.transcript.ocrOriginal',
    'product.studio.transcript.ocrLocalized',
    'product.studio.transcript.scene',
    'product.studio.transcript.sourceEntry',
    'product.studio.analysis.localizedBoundary',
  ]) {
    assert.match(locale, new RegExp(`['"]${key.replaceAll('.', '\\.')}['"]`), `Missing locale key: ${key}`);
  }
}

assert.match(uk, /Докази з оригінального відео/);
assert.match(en, /Evidence from the original video/);
assert.match(styles, /\.studio-ocr-context/);
assert.match(styles, /\.studio-ocr-strings/);
assert.match(styles, /\.studio-ocr-text-block\.localized/);

console.log('Studio evidence component boundary tests passed');
