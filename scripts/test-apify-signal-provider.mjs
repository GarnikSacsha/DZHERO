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
}, {
  workspaceId: 'ws_test', market: 'global', createId: (prefix) => `${prefix}_ig`,
  inputType: 'profile', inputValue: '@humansofny', requestedSourceHandle: '@humansofny',
});

assert.equal(instagram.id, 'reel_ig');
assert.equal(instagram.importedMetadata.platform, 'instagram');
assert.equal(instagram.videoUrl, 'https://example.com/ig.mp4');
assert.equal(instagram.views, 908912);
assert.equal(instagram.shares, null);
assert.equal(instagram.saves, null);
assert.equal(instagram.viewsAvailable, true);
assert.equal(instagram.sharesAvailable, false);
assert.equal(instagram.savesAvailable, false);
assert.equal(instagram.rankingMetadataStatus, 'insufficient_ranking_metadata');
assert.equal(instagram.sourceRelationship, 'owner');
assert.equal(instagram.importedMetadata.rawStats.videoPlayCount, 908912);
assert.equal(instagram.importedMetadata.rawStats.videoViewCount, null);
assert.equal(getApifySignalKey(instagram.importedMetadata), 'instagram:dz-th_xmany');

const instagramExplicitZero = mapInstagramApifyItem({
  id: 'zero_metrics', shortCode: 'ZERO_METRICS', ownerUsername: 'collab_owner',
  coauthorProducers: [{ username: 'humansofny' }], taggedUsers: [{ username: 'humansofny' }],
  videoPlayCount: 0, videoViewCount: 0, sharesCount: 0, savesCount: 0, videoDuration: 0,
}, {
  inputType: 'profile', inputValue: '@humansofny', requestedSourceHandle: '@humansofny',
});
assert.equal(instagramExplicitZero.shares, 0);
assert.equal(instagramExplicitZero.saves, 0);
assert.equal(instagramExplicitZero.sharesAvailable, true);
assert.equal(instagramExplicitZero.savesAvailable, true);
assert.equal(instagramExplicitZero.viewsAvailable, true);
assert.equal(instagramExplicitZero.durationAvailable, true);
assert.equal(instagramExplicitZero.rankingMetadataStatus, 'ready');
assert.equal(instagramExplicitZero.sourceRelationship, 'coauthor');

const instagramTaggedOnly = mapInstagramApifyItem({
  id: 'tagged_only', shortCode: 'TAGGED_ONLY', ownerUsername: 'other_owner',
  taggedUsers: [{ username: 'humansofny' }], sharesCount: 1, savesCount: 1, videoPlayCount: 100,
}, {
  inputType: 'profile', inputValue: '@humansofny', requestedSourceHandle: '@humansofny',
});
assert.equal(instagramTaggedOnly.sourceRelationship, 'unrelated');

const instagramInvalid = mapInstagramApifyItem({
  id: 'invalid_metrics', shortCode: 'INVALID_METRICS', ownerUsername: 'humansofny',
  videoPlayCount: 100, sharesCount: -1, savesCount: 2, videoDuration: 30,
}, {
  inputType: 'profile', inputValue: '@humansofny', requestedSourceHandle: '@humansofny',
});
assert.equal(instagramInvalid.sharesAvailable, false);
assert.equal(instagramInvalid.rankingMetadataStatus, 'invalid_ranking_metadata');

const instagramDownloaded = mapInstagramApifyItem({
  inputUrl: 'https://www.instagram.com/reel/downloaded/',
  shortCode: 'downloaded',
  downloadedVideo: 'https://api.apify.com/v2/key-value-stores/store/records/downloaded.mp4',
  videoUrl: 'https://scontent.example.com/expiring.mp4',
});
assert.equal(instagramDownloaded.videoUrl, 'https://api.apify.com/v2/key-value-stores/store/records/downloaded.mp4');

const instagramWithViewCount = mapInstagramApifyItem({
  id: '3926661823774853593',
  shortCode: 'DYpScTiNI3_',
  caption: 'If you have rizz, you have had practice.',
  commentsCount: 2034,
  displayUrl: 'https://example.com/ig-2.jpg',
  likesCount: 39598,
  videoViewCount: 358320,
  timestamp: '2026-05-22T15:00:20.000Z',
  ownerUsername: 'humansofny',
}, { workspaceId: 'ws_test', market: 'global', createId: (prefix) => `${prefix}_ig_views` });

assert.equal(instagramWithViewCount.views, 358320);

const instagramProfileActorRequest = buildApifyActorRequest({
  platform: 'instagram',
  mode: 'profile',
  input: '@maverickgpt',
  limit: 2,
});

assert.equal(instagramProfileActorRequest.actorId, 'apify/instagram-reel-scraper');
assert.deepEqual(instagramProfileActorRequest.input, {
  username: ['maverickgpt'],
  resultsLimit: 2,
  onlyPostsNewerThan: '3 months',
  skipPinnedPosts: true,
  skipTrialReels: false,
  includeDownloadedVideo: false,
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
}, {
  workspaceId: 'ws_test', market: 'global', createId: (prefix) => `${prefix}_tt`,
  inputType: 'profile', inputValue: '@maverickgpt', requestedSourceHandle: '@maverickgpt',
});

assert.equal(tiktok.id, 'reel_tt');
assert.equal(tiktok.importedMetadata.platform, 'tiktok');
assert.equal(tiktok.videoUrl, 'https://api.apify.com/v2/key-value-stores/store/records/video.mp4');
assert.equal(tiktok.shares, 1974);
assert.equal(tiktok.rankingMetadataStatus, 'ready');
assert.equal(tiktok.sourceRelationship, 'owner');
assert.equal(getApifySignalKey(tiktok.importedMetadata), 'tiktok:7659094629786193183');

const tiktokMissingShare = mapTikTokApifyItem({
  'authorMeta.name': 'maverickgpt', playCount: 1000, collectCount: 20,
  'videoMeta.duration': 30, webVideoUrl: 'https://www.tiktok.com/@maverickgpt/video/1000',
}, {
  inputType: 'profile', inputValue: '@maverickgpt', requestedSourceHandle: '@maverickgpt',
});
assert.equal(tiktokMissingShare.shares, null);
assert.equal(tiktokMissingShare.sharesAvailable, false);
assert.equal(tiktokMissingShare.savesAvailable, true);
assert.equal(tiktokMissingShare.rankingMetadataStatus, 'insufficient_ranking_metadata');

const instagramActorRequest = buildApifyActorRequest({
  platform: 'instagram',
  mode: 'url',
  input: 'https://www.instagram.com/reel/DZ-Th_XMAnY/',
  limit: 99,
});

assert.equal(instagramActorRequest.actorId, 'apify/instagram-reel-scraper');
assert.deepEqual(instagramActorRequest.input, {
  username: ['https://www.instagram.com/reel/DZ-Th_XMAnY/'],
  resultsLimit: 30,
  skipPinnedPosts: true,
  skipTrialReels: false,
  includeDownloadedVideo: false,
});

const instagramHashtagActorRequest = buildApifyActorRequest({
  platform: 'instagram',
  mode: 'hashtag',
  input: '#ai-tools!',
  limit: 4,
});

assert.equal(instagramHashtagActorRequest.actorId, 'apify/instagram-hashtag-scraper');
assert.deepEqual(instagramHashtagActorRequest.input, {
  hashtags: ['aitools'],
  resultsType: 'reels',
  resultsLimit: 4,
  keywordSearch: false,
});

const instagramSearchActorRequest = buildApifyActorRequest({
  platform: 'instagram',
  mode: 'search',
  input: 'instagram ai tools',
  limit: 9,
});

assert.equal(instagramSearchActorRequest.actorId, 'apify/instagram-hashtag-scraper');
assert.deepEqual(instagramSearchActorRequest.input, {
  hashtags: ['aitools'],
  resultsType: 'reels',
  resultsLimit: 9,
  keywordSearch: true,
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
