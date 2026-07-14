const assert = require('node:assert/strict');

const {
  analyzeAgentStudioVideo,
  createGeminiVideoAnalysisTool,
  normalizeGeminiVideoResult,
  parseGeminiInteractionText,
} = require('../backend/services/agentStudioVideoTool.cjs');
const { EvidencePackageSchema } = require('../backend/services/agentStudioSchemas.cjs');

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

(async () => {
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

  const instagramRequests = [];
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
    fetchImpl: async (url, options = {}) => {
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
    },
  });
  assert.equal(instagram.availability, 'reliable');
  assert.equal(instagram.source.url, 'https://www.instagram.com/reel/source123/');
  assert.equal(instagram.items.some((item) => item.text.includes('A real caption from Apify.')), true);
  const instagramInteraction = instagramRequests.find(({ url }) => url.endsWith('/v1beta/interactions'));
  const instagramBody = JSON.parse(instagramInteraction.options.body);
  assert.equal(instagramBody.input[0].uri, 'https://gemini.example/files/source123');
  assert.equal(instagramBody.input[0].mime_type, 'video/mp4');
  assert.equal(instagramRequests.some(({ url, options }) => url.endsWith('/v1beta/files/source123') && options.method === 'DELETE'), true);

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

  const malformed = await analyzeAgentStudioVideo({
    input: { mode: 'adapt_reel', objective: 'Drive visits', sourceUrl: 'https://example.com/reel' },
    selectedTrend: {
      title: 'Malformed response Reel',
      rationale: 'The user supplied a URL.',
      sourceUrl: 'https://example.com/reel',
    },
    apiKey: 'test-key',
    fetchImpl: async () => response({ output_text: 'not json' }),
  });
  assert.equal(malformed.availability, 'unavailable');
  assert.equal(malformed.unknowns.some((item) => item.includes('structured')), true);

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
