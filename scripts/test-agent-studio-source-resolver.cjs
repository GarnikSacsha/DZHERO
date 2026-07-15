const assert = require('node:assert/strict');

const {
  detectAgentStudioSocialPlatform,
  INSTAGRAM_FALLBACK_ACTOR,
  resolveAgentStudioVideoSource,
} = require('../backend/services/agentStudioSourceResolver.cjs');

(async () => {
  assert.equal(detectAgentStudioSocialPlatform('https://www.instagram.com/reel/abc/'), 'instagram');
  assert.equal(detectAgentStudioSocialPlatform('https://www.tiktok.com/@demo/video/123'), 'tiktok');
  assert.equal(detectAgentStudioSocialPlatform('https://www.youtube.com/watch?v=abc'), '');

  const calls = [];
  const usage = [];
  const resolved = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.instagram.com/reel/abc/',
    workspaceId: 'ws_test',
    fetchSignals: async (options) => {
      calls.push(options);
      return Object.assign([{
        sourceUrl: options.inputValue,
        videoUrl: 'https://cdn.example.com/abc.mp4',
        importedMetadata: { provider: 'apify' },
      }], { actualCostUsd: 0.0123 });
    },
    invocationId: 'invocation-primary',
    onUsage: async (entry) => usage.push(entry),
  });
  assert.equal(resolved.videoUrl, 'https://cdn.example.com/abc.mp4');
  assert.equal(resolved.resolvedBy, 'apify-platform-actor');
  assert.equal(calls[0].platform, 'instagram');
  assert.equal(calls[0].inputType, 'url');
  assert.equal(calls[0].limit, 1);
  assert.equal(calls[0].downloadVideo, true);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].usageTotalUsd, 0.0123);
  assert.equal(usage[0].actor, 'apify/instagram-reel-scraper');

  const fallbackCalls = [];
  const fallbackUsage = [];
  const fallbackResolved = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.instagram.com/reel/fallback/',
    workspaceId: 'ws_test',
    fetchSignals: async () => [],
    runActor: async (options) => {
      fallbackCalls.push(options);
      return {
        items: [{ url: options.input.directUrls[0], videoUrl: 'https://cdn.example.com/fallback.mp4' }],
        actualCostUsd: 0.0456,
      };
    },
    invocationId: 'invocation-fallback',
    onUsage: async (entry) => fallbackUsage.push(entry),
  });
  assert.equal(fallbackResolved.videoUrl, 'https://cdn.example.com/fallback.mp4');
  assert.equal(fallbackResolved.resolvedBy, 'apify-instagram-fallback');
  assert.equal(fallbackCalls[0].actorId, INSTAGRAM_FALLBACK_ACTOR);
  assert.deepEqual(fallbackCalls[0].input.directUrls, ['https://www.instagram.com/reel/fallback/']);
  assert.equal(fallbackUsage.length, 2);
  assert.equal(fallbackUsage[0].usageTotalUsd, undefined);
  assert.equal(fallbackUsage[1].usageTotalUsd, 0.0456);

  const unresolved = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.instagram.com/reel/blocked/',
    fetchSignals: async () => [],
    runActor: async () => { throw new Error('insufficient-permissions'); },
  });
  assert.equal(unresolved.unresolved, true);
  assert.equal(unresolved.attempts.length, 2);
  assert.equal(unresolved.attempts[1].actor, INSTAGRAM_FALLBACK_ACTOR);

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
