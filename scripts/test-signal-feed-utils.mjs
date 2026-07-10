import assert from 'node:assert/strict';
import {
  canonicalizeSignalUrl,
  compareSignalReels,
  getSignalSourceGroup,
  parseMetric,
} from '../src/signalFeedUtils.mjs';

assert.notEqual(
  canonicalizeSignalUrl('https://www.youtube.com/watch?v=AAA111&utm_source=test'),
  canonicalizeSignalUrl('https://youtube.com/watch?v=BBB222'),
  'different YouTube watch videos must keep different canonical identities',
);

assert.equal(parseMetric('1,234'), 1234);
assert.equal(parseMetric('1.2M'), 1200000);
assert.equal(parseMetric('220K views'), 220000);
assert.equal(parseMetric('9 876'), 9876);

const reels = [
  {
    title: 'TikTok signal',
    views: '88K',
    likes: '4K',
    importedMetadata: { platform: 'tiktok', url: 'https://www.tiktok.com/@brand/video/1' },
  },
  {
    title: 'YouTube signal',
    views: '1,234,567',
    likes: '12K',
    importedMetadata: { platform: 'youtube', url: 'https://youtube.com/shorts/abc' },
  },
  {
    title: 'Instagram signal',
    views: '540K',
    likes: '22K',
    importedMetadata: { platform: 'instagram', url: 'https://www.instagram.com/reel/abc/' },
  },
];

assert.deepEqual(
  reels.map(getSignalSourceGroup),
  ['tiktok', 'youtube', 'instagram'],
);

assert.equal(getSignalSourceGroup({
  title: 'at this point youtube shorts comments cannot be typed by humans',
  sourceType: 'youtube metadata',
  sourceStatus: 'metadata',
  status: ['TikTok', 'джерело', 'metadata'],
  sourceUrl: 'https://www.tiktok.com/@yt.shorts.disliker/video/123',
  importedMetadata: {
    platform: 'tiktok',
    providerPlatform: 'youtube',
  },
}), 'tiktok');

assert.deepEqual(
  [...reels].sort((left, right) => compareSignalReels(left, right, { sort: 'views' })).map((reel) => reel.title),
  ['YouTube signal', 'Instagram signal', 'TikTok signal'],
);

assert.deepEqual(
  [...reels].sort((left, right) => compareSignalReels(left, right, { sort: 'likes' })).map((reel) => reel.title),
  ['Instagram signal', 'YouTube signal', 'TikTok signal'],
);

console.log('signal feed utility tests passed');
