import assert from 'node:assert/strict';
import remixEngine from '../backend/services/remixEngine.js';

const { generateHighFidelityFallback, REMIX_SYSTEM_PROMPT } = remixEngine;

const sourceTitle = 'A person stretches leg over head and everyone is shocked';
const result = generateHighFidelityFallback({
  title: sourceTitle,
  hook: sourceTitle,
  script: 'A creator shows an impossible-looking flexibility move, then reveals it is a simple daily routine.',
  marketingMechanics: 'visual surprise -> proof -> simple repeatable routine -> CTA',
}, {
  niche: 'студія пілатесу',
  product: 'перше пробне тренування',
  location: 'Київ',
  toneOfVoice: 'спокійний, експертний, без хайпу',
});

assert.equal(result.remixes.length, 3);
assert.match(result.deconstruction.coreMechanics, /visual|proof|routine|механік|контраст|доказ/i);
assert.match(result.viabilityFilter.uaMentalityCheck, /студія пілатесу|пілатес|Київ|пробне тренування/i);

for (const remix of result.remixes) {
  assert.notEqual(remix.title, sourceTitle);
  assert.notEqual(remix.hook, sourceTitle);
  assert.doesNotMatch(remix.title, /person stretches leg over head/i);
  assert.doesNotMatch(remix.hook, /person stretches leg over head/i);
  assert.match(`${remix.title} ${remix.hook} ${remix.cta}`, /пілатес|пробне|тренування|Київ/i);
  assert.ok(Array.isArray(remix.visualFlow));
  assert.ok(remix.visualFlow.length >= 3);
  for (const step of remix.visualFlow) {
    assert.ok(step.actionDescription.length > 20);
    assert.ok(step.onScreenText.length > 5);
    assert.ok(step.audioVoiceover.length > 20);
  }
}

assert.match(REMIX_SYSTEM_PROMPT, /Do not copy/i);
assert.match(REMIX_SYSTEM_PROMPT, /brand/i);

console.log('remix quality tests passed');
