const assert = require('node:assert/strict');

const {
  analyzeAgentStudioVideo,
  createGeminiVideoAnalysisTool,
  parseGeminiInteractionText,
} = require('../backend/services/agentStudioVideoTool.cjs');
const { EvidencePackageSchema } = require('../backend/services/agentStudioSchemas.cjs');

function response(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
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
