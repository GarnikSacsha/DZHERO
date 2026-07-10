import assert from 'node:assert/strict';
import {
  createRemixAutoRequest,
  shouldRunRemixAutoRequest,
} from '../src/remixAutoGeneration.mjs';

const instagramReel = {
  id: 'instagram_terivakii',
  sourceStatus: 'apify_instagram',
  sourceUrl: 'https://www.instagram.com/reel/example/',
  title: 'thank you edwin!!',
};

const first = createRemixAutoRequest(0, instagramReel);
assert.equal(first.id, 1);
assert.equal(first.sourceKey, 'instagram_terivakii');
assert.equal(shouldRunRemixAutoRequest({ request: first, lastHandledId: 0, workspaceId: 'ws_demo_ua' }), true);
assert.equal(shouldRunRemixAutoRequest({ request: first, lastHandledId: 1, workspaceId: 'ws_demo_ua' }), false);

const youtubeRequest = createRemixAutoRequest(first.id, {
  id: 'youtube_short',
  sourceStatus: 'youtube_api',
});
assert.equal(shouldRunRemixAutoRequest({ request: youtubeRequest, lastHandledId: 1, workspaceId: 'ws_demo_ua' }), true);

assert.equal(shouldRunRemixAutoRequest({ request: first, lastHandledId: 0, workspaceId: '' }), false);
console.log('remix auto-generation tests passed');
