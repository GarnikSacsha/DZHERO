'use strict';

const assert = require('node:assert/strict');

const {
  fetchTikTokThumbnail,
  normalizeTikTokVideoUrl,
} = require('../backend/services/tiktokThumbnail.cjs');

(async () => {
  assert.equal(
    normalizeTikTokVideoUrl('https://m.tiktok.com/@dzhero/video/7380000000000000000?lang=uk'),
    'https://www.tiktok.com/@dzhero/video/7380000000000000000',
  );
  assert.equal(normalizeTikTokVideoUrl('https://example.com/@dzhero/video/7380000000000000000'), '');
  assert.equal(normalizeTikTokVideoUrl('javascript:alert(1)'), '');

  let requestedUrl = '';
  const thumbnailUrl = await fetchTikTokThumbnail(
    'https://www.tiktok.com/@dzhero/video/7380000000000000000',
    {
      fetcher: async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({
          thumbnail_url: 'https://p16-sign-va.tiktokcdn.com/fresh-cover.jpeg',
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  );
  assert.match(requestedUrl, /^https:\/\/www\.tiktok\.com\/oembed\?url=/);
  assert.equal(thumbnailUrl, 'https://p16-sign-va.tiktokcdn.com/fresh-cover.jpeg');

  await assert.rejects(
    () => fetchTikTokThumbnail('https://youtube.com/shorts/abc'),
    (error) => error.status === 400 && error.payload?.error === 'tiktok_video_url_required',
  );
  await assert.rejects(
    () => fetchTikTokThumbnail(
      'https://www.tiktok.com/@dzhero/video/7380000000000000000',
      { fetcher: async () => new Response('{}', { status: 200 }) },
    ),
    (error) => error.status === 404 && error.payload?.error === 'tiktok_thumbnail_unavailable',
  );

  console.log('TikTok thumbnail service tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
