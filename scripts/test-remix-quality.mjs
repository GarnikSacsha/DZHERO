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
assert.match(REMIX_SYSTEM_PROMPT, /CONSULTANT MODE/i);
assert.match(REMIX_SYSTEM_PROMPT, /Brand Brain is optional/i);

console.log('remix quality tests passed');

const consultantResult = generateHighFidelityFallback({
  title: 'thank you edwin!! #kpop #SmallBusiness #kpopfyp #ateez #fyp',
  hook: 'thank you edwin!!',
  script: 'A customer uses a prize machine after checkout and reacts to the surprise reward.',
  marketingMechanics: 'purchase -> playful random reward -> authentic customer reaction',
}, {});

assert.equal(consultantResult.remixes.length, 3);
for (const remix of consultantResult.remixes) {
  const output = JSON.stringify(remix);
  assert.doesNotMatch(output, /thank you edwin|#kpop|#fyp/i);
  assert.doesNotMatch(output, /продукт або послуга бренду|локальний сервісний бренд/i);
  assert.match(output, /сюрприз|винагород|реакц|покуп|клієнт/i);
  assert.ok(remix.visualFlow.every((step) => step.actionDescription.length >= 25));
}

console.log('consultant remix quality tests passed');
