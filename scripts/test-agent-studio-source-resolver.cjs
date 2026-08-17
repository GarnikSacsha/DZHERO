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
  const attempts = [];
  const resolved = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.instagram.com/reel/abc/',
    workspaceId: 'ws_test',
    maxTotalChargeUsd: 0.05,
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
    beforeProviderAttempt: async (entry) => attempts.push(entry),
  });
  assert.equal(resolved.videoUrl, 'https://cdn.example.com/abc.mp4');
  assert.equal(resolved.resolvedBy, 'apify-platform-actor');
  assert.equal(calls[0].platform, 'instagram');
  assert.equal(calls[0].inputType, 'url');
  assert.equal(calls[0].limit, 1);
  assert.equal(calls[0].maxItems, 1);
  assert.equal(calls[0].maxTotalChargeUsd, 0.05);
  assert.equal(calls[0].downloadVideo, true);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].usageTotalUsd, 0.0123);
  assert.equal(usage[0].actor, 'apify/instagram-reel-scraper');
  assert.deepEqual(attempts.map(({ provider, model }) => ({ provider, model })), [{
    provider: 'apify',
    model: 'apify/instagram-reel-scraper',
  }]);

  const tiktokCalls = [];
  const tiktokResolved = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.tiktok.com/@demo/video/123',
    maxTotalChargeUsd: 0.50,
    fetchSignals: async (options) => {
      tiktokCalls.push(options);
      return [{ sourceUrl: options.inputValue, videoUrl: 'https://cdn.example.com/tiktok.mp4' }];
    },
  });
  assert.equal(tiktokResolved.videoUrl, 'https://cdn.example.com/tiktok.mp4');
  assert.equal(tiktokCalls.length, 1);
  assert.equal(tiktokCalls[0].maxItems, 1);
  assert.equal(tiktokCalls[0].maxTotalChargeUsd, 0.50);

  const fallbackCalls = [];
  const fallbackUsage = [];
  const fallbackAttempts = [];
  const fallbackResolved = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.instagram.com/reel/fallback/',
    workspaceId: 'ws_test',
    maxTotalChargeUsd: 0.05,
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
    beforeProviderAttempt: async (entry) => fallbackAttempts.push(entry),
  });
  assert.equal(fallbackResolved.videoUrl, 'https://cdn.example.com/fallback.mp4');
  assert.equal(fallbackResolved.resolvedBy, 'apify-instagram-fallback');
  assert.equal(fallbackCalls[0].actorId, INSTAGRAM_FALLBACK_ACTOR);
  assert.deepEqual(fallbackCalls[0].input.directUrls, ['https://www.instagram.com/reel/fallback/']);
  assert.equal(fallbackCalls[0].maxItems, 1);
  assert.equal(fallbackCalls[0].maxTotalChargeUsd, 0.05);
  assert.equal(fallbackUsage.length, 2);
  assert.equal(fallbackUsage[0].usageTotalUsd, undefined);
  assert.equal(fallbackUsage[1].usageTotalUsd, 0.0456);
  assert.deepEqual(fallbackAttempts.map(({ provider, model }) => ({ provider, model })), [{
    provider: 'apify',
    model: 'apify/instagram-reel-scraper',
  }, {
    provider: 'apify',
    model: INSTAGRAM_FALLBACK_ACTOR,
  }]);

  const aggregateCaps = [];
  await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.instagram.com/reel/aggregate-cap/',
    maxTotalChargeUsd: 0.05,
    totalMaxChargeUsd: 0.05,
    maxPaidActorStarts: 2,
    fetchSignals: async (options) => {
      aggregateCaps.push(options.maxTotalChargeUsd);
      return [];
    },
    runActor: async (options) => {
      aggregateCaps.push(options.maxTotalChargeUsd);
      return { items: [] };
    },
  });
  assert.deepEqual(aggregateCaps, [0.025, 0.025], 'aggregate exposure is divided across bounded actor starts');

  let disabledFallbackCalls = 0;
  const fallbackDisabled = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.instagram.com/reel/no-fallback/',
    maxTotalChargeUsd: 0.05,
    totalMaxChargeUsd: 0.05,
    maxPaidActorStarts: 1,
    allowInstagramFallback: false,
    fetchSignals: async (options) => {
      assert.equal(options.maxTotalChargeUsd, 0.05);
      return [];
    },
    runActor: async () => {
      disabledFallbackCalls += 1;
      return { items: [] };
    },
  });
  assert.equal(fallbackDisabled.unresolved, true);
  assert.equal(disabledFallbackCalls, 0, 'disabled Instagram fallback must never start its actor');

  const unresolved = await resolveAgentStudioVideoSource({
    token: 'test-apify-token',
    sourceUrl: 'https://www.instagram.com/reel/blocked/',
    maxTotalChargeUsd: 0.05,
    fetchSignals: async () => [],
    runActor: async () => { throw new Error('insufficient-permissions'); },
  });
  assert.equal(unresolved.unresolved, true);
  assert.equal(unresolved.attempts.length, 2);
  assert.equal(unresolved.attempts[1].actor, INSTAGRAM_FALLBACK_ACTOR);

  let uncappedProviderCalled = false;
  await assert.rejects(
    resolveAgentStudioVideoSource({
      token: 'test-apify-token',
      sourceUrl: 'https://www.tiktok.com/@demo/video/uncapped',
      fetchSignals: async () => {
        uncappedProviderCalled = true;
        return [];
      },
    }),
    (error) => error?.code === 'saved_url_social_cost_cap_required' && error?.status === 503,
  );
  assert.equal(uncappedProviderCalled, false);

  await assert.rejects(
    resolveAgentStudioVideoSource({
      token: 'test-apify-token',
      sourceUrl: 'https://www.tiktok.com/@demo/video/oversized-cap',
      maxTotalChargeUsd: 0.51,
      fetchSignals: async () => {
        uncappedProviderCalled = true;
        return [];
      },
    }),
    (error) => error?.code === 'saved_url_social_cost_cap_required',
  );
  assert.equal(uncappedProviderCalled, false);

  await assert.rejects(
    resolveAgentStudioVideoSource({
      token: 'test-apify-token',
      sourceUrl: 'https://www.instagram.com/reel/oversized-cap/',
      maxTotalChargeUsd: 100,
      fetchSignals: async () => {
        uncappedProviderCalled = true;
        return [];
      },
    }),
    (error) => error?.code === 'saved_url_social_cost_cap_required',
  );
  assert.equal(uncappedProviderCalled, false);

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
