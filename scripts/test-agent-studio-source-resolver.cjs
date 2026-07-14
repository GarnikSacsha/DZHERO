const assert = require('node:assert/strict');

const {
  detectAgentStudioSocialPlatform,
  resolveAgentStudioVideoSource,
} = require('../backend/services/agentStudioSourceResolver.cjs');

(async () => {
  assert.equal(detectAgentStudioSocialPlatform('https://www.instagram.com/reel/abc/'), 'instagram');
  assert.equal(detectAgentStudioSocialPlatform('https://www.tiktok.com/@demo/video/123'), 'tiktok');
  assert.equal(detectAgentStudioSocialPlatform('https://www.youtube.com/watch?v=abc'), '');

  const calls = [];
  const resolved = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.instagram.com/reel/abc/',
    workspaceId: 'ws_test',
    fetchSignals: async (options) => {
      calls.push(options);
      return [{
        sourceUrl: options.inputValue,
        videoUrl: 'https://cdn.example.com/abc.mp4',
        importedMetadata: { provider: 'apify' },
      }];
    },
  });
  assert.equal(resolved.videoUrl, 'https://cdn.example.com/abc.mp4');
  assert.equal(resolved.resolvedBy, 'apify');
  assert.equal(calls[0].platform, 'instagram');
  assert.equal(calls[0].inputType, 'url');
  assert.equal(calls[0].limit, 1);
  assert.equal(calls[0].downloadVideo, true);

  const skipped = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.youtube.com/watch?v=abc',
    fetchSignals: async () => { throw new Error('should not run'); },
  });
  assert.equal(skipped, null);

  console.log('Agent Studio Apify source resolver checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
