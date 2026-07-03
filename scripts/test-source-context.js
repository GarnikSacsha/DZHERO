const assert = require('node:assert/strict');
const { sanitizeSourceContext, hasUsefulSourceContext } = require('../src/sourceContext.cjs');

assert.equal(
  sanitizeSourceContext('YouTube РЅРµ РІС–РґРґР°РІ captions #famousque #funnypranks #pranklab #shorts She wa...'),
  '',
  'mojibake and hashtag-heavy captions should be dropped',
);

assert.equal(
  sanitizeSourceContext('A prominent yellow text overlay reads "$1 MILLION" above the watermark @PRANKLAB. Several people argue near a store counter.'),
  'A prominent yellow text overlay reads "$1 MILLION" above the watermark @PRANKLAB. Several people argue near a store counter.',
  'useful visual context should be kept',
);

assert.equal(hasUsefulSourceContext('#shorts #funny #viral'), false, 'pure hashtags are not useful context');
assert.equal(hasUsefulSourceContext('Two people argue, then one gives up immediately.'), true, 'human video notes are useful context');

console.log('source context tests passed');
