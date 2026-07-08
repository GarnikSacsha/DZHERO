import assert from 'node:assert/strict';
import provider from '../backend/services/apifySignalProvider.js';

const {
  buildApifyActorRequest,
  getApifySignalKey,
  mapInstagramApifyItem,
  mapTikTokApifyItem,
} = provider;

const instagram = mapInstagramApifyItem({
  id: '3926661823774853592',
  type: 'Video',
  shortCode: 'DZ-Th_XMAnY',
  caption: 'Choose the people you lean on.',
  url: 'https://www.instagram.com/p/DZ-Th_XMAnY/',
  commentsCount: 429,
  displayUrl: 'https://example.com/ig.jpg',
  videoUrl: 'https://example.com/ig.mp4',
  likesCount: 22546,
  videoPlayCount: 908912,
  timestamp: '2026-06-24T15:25:39.000Z',
  ownerFullName: 'Humans of New York',
  ownerUsername: 'humansofny',
  videoDuration: 88.512,
}, { workspaceId: 'ws_test', market: 'global', createId: (prefix) => `${prefix}_ig` });

assert.equal(instagram.id, 'reel_ig');
assert.equal(instagram.importedMetadata.platform, 'instagram');
assert.equal(instagram.videoUrl, 'https://example.com/ig.mp4');
assert.equal(instagram.views, 908912);
assert.equal(getApifySignalKey(instagram.importedMetadata), 'instagram:dz-th_xmany');

const instagramProfileActorRequest = buildApifyActorRequest({
  platform: 'instagram',
  mode: 'profile',
  input: '@maverickgpt',
  limit: 2,
});

assert.equal(instagramProfileActorRequest.actorId, 'apify/instagram-scraper');
assert.deepEqual(instagramProfileActorRequest.input, {
  directUrls: ['https://www.instagram.com/maverickgpt/'],
  search: '',
  resultsType: 'posts',
  resultsLimit: 2,
});

const tiktok = mapTikTokApifyItem({
  'authorMeta.avatar': 'https://example.com/avatar.jpg',
  'authorMeta.name': 'maverickgpt',
  text: 'Claude just killed graphic designers.',
  diggCount: 9747,
  shareCount: 1974,
  playCount: 193300,
  commentCount: 411,
  collectCount: 7934,
  'videoMeta.duration': 47,
  createTimeISO: '2026-07-05T17:19:12.000Z',
  webVideoUrl: 'https://www.tiktok.com/@maverickgpt/video/7659094629786193183',
  mediaUrls: ['https://api.apify.com/v2/key-value-stores/store/records/video.mp4'],
}, { workspaceId: 'ws_test', market: 'global', createId: (prefix) => `${prefix}_tt` });

assert.equal(tiktok.id, 'reel_tt');
assert.equal(tiktok.importedMetadata.platform, 'tiktok');
assert.equal(tiktok.videoUrl, 'https://api.apify.com/v2/key-value-stores/store/records/video.mp4');
assert.equal(tiktok.shares, 1974);
assert.equal(getApifySignalKey(tiktok.importedMetadata), 'tiktok:7659094629786193183');

const instagramActorRequest = buildApifyActorRequest({
  platform: 'instagram',
  mode: 'url',
  input: 'https://www.instagram.com/reel/DZ-Th_XMAnY/',
  limit: 99,
});

assert.equal(instagramActorRequest.actorId, 'apify/instagram-scraper');
assert.deepEqual(instagramActorRequest.input, {
  directUrls: ['https://www.instagram.com/reel/DZ-Th_XMAnY/'],
  search: '',
  resultsType: 'posts',
  resultsLimit: 30,
});

const tiktokProfileActorRequest = buildApifyActorRequest({
  platform: 'tiktok',
  inputType: 'profile',
  inputValue: '@maverickgpt',
  limit: 2,
  downloadVideos: true,
});

assert.equal(tiktokProfileActorRequest.actorId, 'clockworks/tiktok-scraper');
assert.deepEqual(tiktokProfileActorRequest.input, {
  resultsPerPage: 2,
  maxItems: 2,
  shouldDownloadVideos: true,
  shouldDownloadCovers: true,
  shouldDownloadSlideshowImages: false,
  shouldDownloadSubtitles: false,
  shouldDownloadComments: false,
  profiles: ['maverickgpt'],
});

const tiktokHashtagActorRequest = buildApifyActorRequest({
  platform: 'tiktok',
  mode: 'hashtag',
  input: '#pilates',
  limit: 1,
  downloadVideo: false,
});

assert.equal(tiktokHashtagActorRequest.actorId, 'clockworks/tiktok-scraper');
assert.deepEqual(tiktokHashtagActorRequest.input, {
  resultsPerPage: 1,
  maxItems: 1,
  shouldDownloadVideos: false,
  shouldDownloadCovers: false,
  shouldDownloadSlideshowImages: false,
  shouldDownloadSubtitles: false,
  shouldDownloadComments: false,
  hashtags: ['pilates'],
});

console.log('apify signal provider mapping tests passed');
