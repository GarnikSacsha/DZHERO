const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');

const {
  analyzeAgentStudioVideo,
  buildGeminiPrompt,
  createGeminiVideoAnalysisTool,
  normalizeGeminiVideoResult,
  parseGeminiInteractionText,
  uploadGeminiVideoBytes,
  uploadGeminiVideoFromUrl,
} = require('../backend/services/agentStudioVideoTool.cjs');
const { EvidencePackageSchema } = require('../backend/services/agentStudioSchemas.cjs');
const { safeFetchPublicBuffer } = require('../backend/services/safePublicFetch.cjs');

assert.match(buildGeminiPrompt({
  input: { objective: 'Drive visits', outputLanguage: 'en' },
  selectedTrend: { title: 'Source', rationale: 'Relevant' },
}), /natural English/);
assert.match(buildGeminiPrompt({
  input: { objective: 'Drive visits' },
  selectedTrend: { title: 'Source', rationale: 'Relevant' },
}), /natural Ukrainian/);

function response(payload, { ok = true, status = 200, headers = {}, bytes = null } = {}) {
  const headerMap = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    ok,
    status,
    headers: {
      get(name) {
        return headerMap.get(String(name).toLowerCase()) || null;
      },
    },
    async json() {
      return payload;
    },
    async arrayBuffer() {
      const data = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(String(bytes || ''));
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    },
  };
}

function offlineSafeFetch(fetchImpl) {
  return async (url, options = {}) => {
    const result = await fetchImpl(url, {
      headers: options.headers || {},
      redirect: 'manual',
    });
    return {
      ok: result.ok,
      status: result.status,
      url,
      headers: {
        'content-type': result.headers.get('content-type') || '',
        'content-length': result.headers.get('content-length') || '',
      },
      bytes: Buffer.from(await result.arrayBuffer()),
    };
  };
}

function installMockHttpResponses(responses) {
  const originalRequest = http.request;
  const calls = [];
  http.request = (url, options, callback) => {
    const next = responses.shift();
    assert.ok(next, 'unexpected public-media request');
    const request = new EventEmitter();
    request.destroy = (error) => {
      if (error) queueMicrotask(() => request.emit('error', error));
    };
    request.end = () => {};
    calls.push({ url: String(url), options });
    queueMicrotask(() => {
      options.lookup(new URL(url).hostname, { all: false }, (error) => {
        if (error) {
          request.emit('error', error);
          return;
        }
        const incoming = new EventEmitter();
        incoming.statusCode = next.statusCode ?? 200;
        incoming.headers = next.headers || { 'content-type': 'video/mp4' };
        incoming.complete = false;
        incoming.destroy = () => { incoming.complete = true; };
        incoming.resume = () => {};
        callback(incoming);
        if (!next.headers?.location) {
          const chunks = next.chunks || [next.body || Buffer.alloc(0)];
          for (const chunk of chunks) incoming.emit('data', Buffer.from(chunk));
          incoming.complete = true;
          incoming.emit('end');
        }
      });
    });
    return request;
  };
  return {
    calls,
    restore() {
      http.request = originalRequest;
    },
  };
}

(async () => {
  await assert.rejects(
    uploadGeminiVideoFromUrl({
      sourceUrl: 'http://127.0.0.1/private-video',
      apiKey: 'test-key',
    }),
    (error) => error?.code === 'public_url_private_address_denied',
    'literal loopback media must be rejected before transport',
  );
  await assert.rejects(
    uploadGeminiVideoFromUrl({
      sourceUrl: 'file:///tmp/private-video.mp4',
      apiKey: 'test-key',
    }),
    (error) => error?.code === 'public_url_protocol_denied',
    'only http/https media targets are accepted',
  );

  {
    const mock = installMockHttpResponses([{
      statusCode: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    }]);
    try {
      await assert.rejects(
        safeFetchPublicBuffer('http://public-media.audit.test/video.mp4', {
          lookup: async () => [{ address: '93.184.216.34', family: 4 }],
          maxBytes: 32,
        }),
        (error) => error?.code === 'public_url_private_address_denied',
        'redirects to link-local targets must stop before a second request',
      );
      assert.equal(mock.calls.length, 1);
    } finally {
      mock.restore();
    }
  }

  {
    const mock = installMockHttpResponses([{
      statusCode: 302,
      headers: { location: 'http://cdn.audit.test/video.mp4' },
    }, {
      body: Buffer.from([1, 2, 3]),
    }]);
    try {
      const downloaded = await safeFetchPublicBuffer('http://api.apify.com/video.mp4', {
        lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        headers: { Authorization: 'Bearer must-not-leak' },
        maxBytes: 32,
      });
      assert.equal(downloaded.bytes.length, 3);
      assert.equal(mock.calls[0].options.headers.Authorization, 'Bearer must-not-leak');
      assert.equal(mock.calls[1].options.headers.Authorization, undefined, 'credentials are stripped on redirect host changes');
    } finally {
      mock.restore();
    }
  }

  {
    const mock = installMockHttpResponses([{
      chunks: [Buffer.alloc(6), Buffer.alloc(6)],
    }]);
    try {
      await assert.rejects(
        safeFetchPublicBuffer('http://oversized.audit.test/video.mp4', {
          lookup: async () => [{ address: '93.184.216.34', family: 4 }],
          maxBytes: 10,
        }),
        (error) => error?.code === 'public_url_response_too_large',
        'chunked responses are aborted at the hard byte ceiling',
      );
    } finally {
      mock.restore();
    }
  }

  {
    const cleanupRequests = [];
    await assert.rejects(
      uploadGeminiVideoBytes({
        bytes: Buffer.from([1, 2, 3]),
        apiKey: 'test-key',
        sleepImpl: async () => {},
        fetchImpl: async (url, options = {}) => {
          cleanupRequests.push({ url, options });
          if (url.endsWith('/upload/v1beta/files')) {
            return response({}, { headers: { 'x-goog-upload-url': 'https://upload.example.test/session' } });
          }
          if (url === 'https://upload.example.test/session') {
            return response({ file: { name: 'files/cleanup-on-failure', uri: 'https://gemini.test/files/cleanup-on-failure', mimeType: 'video/mp4', state: 'PROCESSING' } });
          }
          if (url.endsWith('/v1beta/files/cleanup-on-failure') && options.method === 'DELETE') return response({});
          if (url.endsWith('/v1beta/files/cleanup-on-failure')) return response({ error: { message: 'poll failed' } }, { ok: false, status: 503 });
          throw new Error(`Unexpected cleanup URL: ${url}`);
        },
      }),
      /poll failed/,
      'the original polling failure remains visible',
    );
    assert.equal(
      cleanupRequests.some(({ url, options }) => url.endsWith('/v1beta/files/cleanup-on-failure') && options.method === 'DELETE'),
      true,
      'a known Gemini file is deleted after post-upload failure',
    );
  }

  const requests = [];
  const reliable = await analyzeAgentStudioVideo({
    input: { mode: 'adapt_reel', objective: 'Drive visits', signalId: 'signal_1' },
    selectedTrend: {
      title: 'Morning reveal',
      rationale: 'Selected by the user.',
      signalId: 'signal_1',
      sourceUrl: 'https://www.youtube.com/shorts/abc123',
    },
    signal: {
      id: 'signal_1',
      title: 'Morning reveal',
      caption: 'Wait for the coffee reveal.',
      handle: '@source',
    },
    apiKey: 'test-key',
    model: 'gemini-test',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response({
        output_text: JSON.stringify({
          accessible: true,
          summary: 'An empty cup is interrupted by espresso and pastry entering frame.',
          transferableMechanic: 'quiet setup, fast interruption, sensory reveal',
          observations: [
            {
              sourceType: 'video_observation',
              text: 'An empty cup sits alone before espresso enters frame.',
              timestamp: '0:00-0:05',
              confidence: 0.95,
            },
            {
              sourceType: 'on_screen_text',
              text: 'Wait for it',
              timestamp: '0:02',
              confidence: 0.91,
            },
          ],
          unknowns: [],
        }),
      });
    },
  });
  assert.equal(EvidencePackageSchema.safeParse(reliable).success, true);
  assert.equal(reliable.availability, 'reliable');
  assert.equal(reliable.items.some((item) => item.sourceType === 'source_metadata'), true);
  assert.equal(reliable.items.some((item) => item.sourceType === 'video_observation'), true);
  assert.equal(requests.length, 1);
  const requestBody = JSON.parse(requests[0].options.body);
  assert.equal(requestBody.model, 'gemini-test');
  assert.equal(requestBody.input[0].type, 'video');
  assert.equal(requestBody.input[0].uri, 'https://www.youtube.com/shorts/abc123');
  assert.equal(requestBody.input[1].text.includes('untrusted data'), true);
  assert.equal(requestBody.input[1].text.includes('JSON boolean true'), true);
  assert.equal(requestBody.response_format.type, 'text');
  assert.equal(requestBody.response_format.mime_type, 'application/json');
  assert.deepEqual(requestBody.response_format.schema.required, [
    'accessible',
    'summary',
    'transferableMechanic',
    'observations',
    'unknowns',
  ]);
  assert.deepEqual(
    requestBody.response_format.schema.properties.observations.items.properties.sourceType.enum,
    ['video_observation', 'audio_observation', 'on_screen_text'],
  );
  assert.equal('maxItems' in requestBody.response_format.schema.properties.observations, false);
  assert.equal('maxItems' in requestBody.response_format.schema.properties.unknowns, false);

  const instagramRequests = [];
  const instagramFetch = async (url, options = {}) => {
    instagramRequests.push({ url, options });
    if (url === 'https://cdn.example.com/source123.mp4') {
      return response({}, {
        headers: { 'content-type': 'video/mp4', 'content-length': '5' },
        bytes: new Uint8Array([1, 2, 3, 4, 5]),
      });
    }
    if (url.endsWith('/upload/v1beta/files')) {
      return response({}, { headers: { 'x-goog-upload-url': 'https://upload.example.com/session' } });
    }
    if (url === 'https://upload.example.com/session') {
      return response({ file: { name: 'files/source123', uri: 'https://gemini.example/files/source123', mimeType: 'video/mp4', state: 'PROCESSING' } });
    }
    if (url.endsWith('/v1beta/files/source123') && options.method === 'DELETE') return response({});
    if (url.endsWith('/v1beta/files/source123')) {
      return response({ name: 'files/source123', uri: 'https://gemini.example/files/source123', mimeType: 'video/mp4', state: 'ACTIVE' });
    }
    if (url.endsWith('/v1beta/interactions')) {
      return response({
        output_text: JSON.stringify({
          accessible: true,
          summary: 'Gemini inspected the Apify-resolved Instagram video.',
          transferableMechanic: 'reaction hook followed by a product reveal',
          observations: [{ sourceType: 'video_observation', text: 'A reaction cuts to a coffee reveal.', timestamp: '0:00-0:04', confidence: 0.94 }],
          unknowns: [],
        }),
      });
    }
    throw new Error(`Unexpected test URL: ${url}`);
  };
  const instagram = await analyzeAgentStudioVideo({
    input: {
      mode: 'adapt_reel',
      objective: 'Adapt this Instagram Reel',
      sourceUrl: 'https://www.instagram.com/reel/source123/',
    },
    selectedTrend: {
      title: 'Instagram source',
      rationale: 'The user supplied a Reel URL.',
      sourceUrl: 'https://www.instagram.com/reel/source123/',
    },
    apiKey: 'test-key',
    model: 'gemini-test',
    resolveSource: async ({ sourceUrl }) => ({
      sourceUrl,
      videoUrl: 'https://cdn.example.com/source123.mp4',
      caption: 'A real caption from Apify.',
      handle: '@coffee',
      importedMetadata: { provider: 'apify', videoUrl: 'https://cdn.example.com/source123.mp4' },
    }),
    sleepImpl: async () => {},
    fetchImpl: instagramFetch,
    safeFetchImpl: offlineSafeFetch(instagramFetch),
  });
  assert.equal(instagram.availability, 'reliable');
  assert.equal(instagram.source.url, 'https://www.instagram.com/reel/source123/');
  assert.equal(instagram.items.some((item) => item.text.includes('A real caption from Apify.')), true);
  const instagramInteraction = instagramRequests.find(({ url }) => url.endsWith('/v1beta/interactions'));
  const instagramBody = JSON.parse(instagramInteraction.options.body);
  assert.equal(instagramBody.input[0].uri, 'https://gemini.example/files/source123');
  assert.equal(instagramBody.input[0].mime_type, 'video/mp4');
  assert.equal(instagramBody.response_format.mime_type, 'application/json');
  assert.equal(instagramRequests.some(({ url, options }) => url.endsWith('/v1beta/files/source123') && options.method === 'DELETE'), true);

  const invalidDownloadedVideoUrl = 'https://api.apify.com/v2/key-value-stores/store/records/instagram.mp4';
  const originalInstagramVideoUrl = 'https://scontent.example.com/original-instagram.mp4';
  const instagramFallbackRequests = [];
  const instagramFallbackFetch = async (url, options = {}) => {
    instagramFallbackRequests.push({ url, options });
    if (url === invalidDownloadedVideoUrl) {
      assert.equal(options.headers.Authorization, 'Bearer test-apify-token');
      return response({}, {
        headers: { 'content-type': 'text/html', 'content-length': '18' },
        bytes: '<html>blocked</html>',
      });
    }
    if (url === originalInstagramVideoUrl) {
      return response({}, {
        headers: { 'content-type': 'video/mp4', 'content-length': '5' },
        bytes: new Uint8Array([1, 2, 3, 4, 5]),
      });
    }
    if (url.endsWith('/upload/v1beta/files')) {
      return response({}, { headers: { 'x-goog-upload-url': 'https://upload.example.com/instagram-fallback-session' } });
    }
    if (url === 'https://upload.example.com/instagram-fallback-session') {
      return response({ file: { name: 'files/instagram-fallback', uri: 'https://gemini.example/files/instagram-fallback', mimeType: 'video/mp4', state: 'PROCESSING' } });
    }
    if (url.endsWith('/v1beta/files/instagram-fallback') && options.method === 'DELETE') return response({});
    if (url.endsWith('/v1beta/files/instagram-fallback')) {
      return response({ name: 'files/instagram-fallback', uri: 'https://gemini.example/files/instagram-fallback', mimeType: 'video/mp4', state: 'ACTIVE' });
    }
    if (url.endsWith('/v1beta/interactions')) {
      return response({
        output_text: JSON.stringify({
          accessible: true,
          summary: 'Gemini inspected the original Instagram media URL after the downloaded copy failed.',
          transferableMechanic: 'fast hook followed by a product reveal',
          observations: [{ sourceType: 'video_observation', text: 'A fast hook cuts to a product reveal.', timestamp: '0:00-0:04', confidence: 0.94 }],
          unknowns: [],
        }),
      });
    }
    throw new Error(`Unexpected Instagram fallback test URL: ${url}`);
  };
  const instagramFallback = await analyzeAgentStudioVideo({
    input: {
      mode: 'adapt_reel',
      objective: 'Adapt an Instagram Reel when the downloaded copy is invalid',
      sourceUrl: 'https://www.instagram.com/reel/fallback123/',
    },
    selectedTrend: {
      title: 'Instagram fallback source',
      rationale: 'The user supplied a Reel URL.',
      sourceUrl: 'https://www.instagram.com/reel/fallback123/',
    },
    apiKey: 'test-key',
    mediaApiToken: 'test-apify-token',
    model: 'gemini-test',
    resolveSource: async ({ sourceUrl }) => ({
      sourceUrl,
      videoUrl: invalidDownloadedVideoUrl,
      importedMetadata: {
        provider: 'apify',
        videoUrl: invalidDownloadedVideoUrl,
        apify: {
          downloadedVideo: invalidDownloadedVideoUrl,
          videoUrl: originalInstagramVideoUrl,
        },
      },
    }),
    sleepImpl: async () => {},
    fetchImpl: instagramFallbackFetch,
    safeFetchImpl: offlineSafeFetch(instagramFallbackFetch),
  });
  assert.equal(instagramFallback.availability, 'reliable');
  assert.equal(instagramFallbackRequests.some(({ url }) => url === originalInstagramVideoUrl), true);

  const apifyMediaUrl = 'https://api.apify.com/v2/key-value-stores/store/records/tiktok.mp4';
  const tiktokRequests = [];
  const tiktokFetch = async (url, options = {}) => {
    tiktokRequests.push({ url, options });
    if (url === apifyMediaUrl) {
      assert.equal(options.headers.Authorization, 'Bearer test-apify-token');
      return response({}, {
        headers: { 'content-type': 'video/mp4', 'content-length': '5' },
        bytes: new Uint8Array([1, 2, 3, 4, 5]),
      });
    }
    if (url.endsWith('/upload/v1beta/files')) {
      return response({}, { headers: { 'x-goog-upload-url': 'https://upload.example.com/tiktok-session' } });
    }
    if (url === 'https://upload.example.com/tiktok-session') {
      return response({ file: { name: 'files/tiktok123', uri: 'https://gemini.example/files/tiktok123', mimeType: 'video/mp4', state: 'PROCESSING' } });
    }
    if (url.endsWith('/v1beta/files/tiktok123') && options.method === 'DELETE') return response({});
    if (url.endsWith('/v1beta/files/tiktok123')) {
      return response({ name: 'files/tiktok123', uri: 'https://gemini.example/files/tiktok123', mimeType: 'video/mp4', state: 'ACTIVE' });
    }
    if (url.endsWith('/v1beta/interactions')) {
      return response({
        output_text: JSON.stringify({
          accessible: true,
          summary: 'Gemini inspected the authenticated Apify TikTok video.',
          transferableMechanic: 'fast problem reveal followed by a product demonstration',
          observations: [{ sourceType: 'video_observation', text: 'The creator demonstrates a before-and-after workflow.', timestamp: '0:00-0:05', confidence: 0.94 }],
          unknowns: [],
        }),
      });
    }
    throw new Error(`Unexpected TikTok test URL: ${url}`);
  };
  const tiktok = await analyzeAgentStudioVideo({
    input: {
      mode: 'adapt_reel',
      objective: 'Adapt this TikTok',
      sourceUrl: 'https://www.tiktok.com/@creator/video/123',
    },
    selectedTrend: {
      title: 'TikTok source',
      rationale: 'The user supplied a TikTok URL.',
      sourceUrl: 'https://www.tiktok.com/@creator/video/123',
    },
    apiKey: 'test-key',
    mediaApiToken: 'test-apify-token',
    model: 'gemini-test',
    resolveSource: async ({ sourceUrl }) => ({
      sourceUrl,
      videoUrl: apifyMediaUrl,
      importedMetadata: { provider: 'apify', videoUrl: apifyMediaUrl },
    }),
    sleepImpl: async () => {},
    fetchImpl: tiktokFetch,
    safeFetchImpl: offlineSafeFetch(tiktokFetch),
  });
  assert.equal(tiktok.availability, 'reliable');
  const tiktokInteraction = tiktokRequests.find(({ url }) => url.endsWith('/v1beta/interactions'));
  const tiktokBody = JSON.parse(tiktokInteraction.options.body);
  assert.equal(tiktokBody.input[0].uri, 'https://gemini.example/files/tiktok123');
  assert.equal(tiktokBody.input[0].mime_type, 'video/mp4');
  assert.equal(tiktokBody.response_format.mime_type, 'application/json');

  const uploadedRequests = [];
  const uploaded = await analyzeAgentStudioVideo({
    input: { mode: 'adapt_reel', objective: 'Adapt an uploaded video', uploadId: 'agent_upload_1' },
    selectedTrend: { title: 'Uploaded source', rationale: 'The user supplied the original video file.' },
    uploadedFile: {
      name: 'files/uploaded-source',
      uri: 'https://gemini.example/files/uploaded-source',
      mimeType: 'video/mp4',
      originalName: 'saved-instagram-reel.mp4',
    },
    apiKey: 'test-key',
    model: 'gemini-test',
    fetchImpl: async (url, options = {}) => {
      uploadedRequests.push({ url, options });
      if (url.endsWith('/v1beta/interactions')) {
        return response({
          output_text: JSON.stringify({
            accessible: true,
            summary: 'Gemini inspected the user-provided original video.',
            transferableMechanic: 'fast hook followed by a visual reveal',
            observations: [{ sourceType: 'video_observation', text: 'A fast reaction opens the clip.', timestamp: '0:00-0:02', confidence: 0.96 }],
            unknowns: [],
          }),
        });
      }
      if (url.endsWith('/v1beta/files/uploaded-source') && options.method === 'DELETE') return response({});
      throw new Error(`Unexpected uploaded-file test URL: ${url}`);
    },
  });
  assert.equal(uploaded.availability, 'reliable');
  assert.equal(uploaded.source.kind, 'upload');
  assert.equal(uploaded.source.title, 'saved-instagram-reel.mp4');
  const uploadedInteraction = uploadedRequests.find(({ url }) => url.endsWith('/v1beta/interactions'));
  assert.equal(JSON.parse(uploadedInteraction.options.body).input[0].uri, 'https://gemini.example/files/uploaded-source');
  assert.equal(uploadedRequests.some(({ url, options }) => url.endsWith('/v1beta/files/uploaded-source') && options.method === 'DELETE'), true);

  const notesOnly = await analyzeAgentStudioVideo({
    input: {
      mode: 'adapt_reel',
      objective: 'Drive visits',
      userNotes: 'A barista reveals a croissant next to an espresso after a quiet setup.',
    },
    selectedTrend: {
      title: 'User-described Reel',
      rationale: 'The user supplied notes.',
    },
    apiKey: '',
  });
  assert.equal(notesOnly.availability, 'partial');
  assert.equal(notesOnly.requiresContext, false);
  assert.deepEqual(notesOnly.items.map((item) => item.sourceType), ['source_metadata', 'user_note']);
  assert.equal(notesOnly.items.some((item) => item.sourceType === 'video_observation'), false);

  const unavailable = await analyzeAgentStudioVideo({
    input: { mode: 'adapt_reel', objective: 'Drive visits', sourceUrl: 'https://example.com/reel' },
    selectedTrend: {
      title: 'Unavailable Reel',
      rationale: 'The user supplied a URL.',
      sourceUrl: 'https://example.com/reel',
    },
    apiKey: 'test-key',
    fetchImpl: async () => response({ error: { message: 'Video unavailable' } }, { ok: false, status: 400 }),
  });
  assert.equal(unavailable.availability, 'unavailable');
  assert.equal(unavailable.requiresContext, true);
  assert.equal(unavailable.items.every((item) => item.sourceType === 'source_metadata'), true);

  const directUrlWithoutSignal = await analyzeAgentStudioVideo({
    input: { mode: 'adapt_reel', objective: 'Drive visits', sourceUrl: 'https://www.youtube.com/watch?v=direct123' },
    selectedTrend: {
      title: 'Direct URL Reel',
      rationale: 'The user pasted a URL instead of selecting a saved signal.',
      sourceUrl: 'https://www.youtube.com/watch?v=direct123',
    },
    signal: null,
    apiKey: 'test-key',
    fetchImpl: async () => response({ error: { message: 'Video unavailable' } }, { ok: false, status: 400 }),
  });
  assert.equal(directUrlWithoutSignal.source.kind, 'url');
  assert.equal(directUrlWithoutSignal.requiresContext, true);

  const malformedUsage = [];
  const malformed = await analyzeAgentStudioVideo({
    input: { mode: 'adapt_reel', objective: 'Drive visits', sourceUrl: 'https://example.com/reel' },
    selectedTrend: {
      title: 'Malformed response Reel',
      rationale: 'The user supplied a URL.',
      sourceUrl: 'https://example.com/reel',
    },
    apiKey: 'test-key',
    phase: 'resume',
    invocationId: 'invocation_malformed',
    onUsage: async (entry) => malformedUsage.push(entry),
    fetchImpl: async () => response({
      model: 'gemini-test',
      output_text: 'not json',
      usage: {
        total_input_tokens: 321,
        total_output_tokens: 12,
        total_thought_tokens: 4,
        total_tokens: 337,
      },
    }),
  });
  assert.equal(malformed.availability, 'unavailable');
  assert.equal(malformed.unknowns.some((item) => item.includes('structured')), true);
  assert.equal(malformedUsage.length, 1);
  assert.equal(malformedUsage[0].status, 'completed');
  assert.equal(malformedUsage[0].usage.total_tokens, 337);
  assert.equal(Object.hasOwn(malformedUsage[0], 'payload'), false);

  assert.equal(parseGeminiInteractionText({ output_text: '{"ok":true}' }), '{"ok":true}');
  assert.equal(parseGeminiInteractionText({
    output: [{ content: [{ text: '{"from":"output"}' }] }],
  }), '{"from":"output"}');
  assert.equal(parseGeminiInteractionText({
    steps: [
      { type: 'thought', signature: 'hidden' },
      { type: 'model_output', content: [{ text: '{"from":"steps"}' }] },
    ],
  }), '{"from":"steps"}');
  assert.equal(normalizeGeminiVideoResult({
    accessible: 'The actions require training.',
    observations: [{ sourceType: 'video_observation', text: 'A flip is visible.', confidence: 0.9 }],
  }).accessible, true);
  assert.equal(normalizeGeminiVideoResult({ accessible: 'Unavailable', observations: [] }).accessible, false);

  const tool = createGeminiVideoAnalysisTool({
    analyzeVideo: async () => notesOnly,
  });
  assert.equal(tool.type, 'function');
  assert.equal(tool.name, 'gemini_video_analysis');
  assert.equal(typeof tool.invoke, 'function');

  console.log('Agent Studio Gemini video tool checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
