import assert from 'node:assert/strict';

const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousGeminiBase = process.env.GEMINI_API_BASE;
const previousOpenAiKey = process.env.OPENAI_API_KEY;
process.env.GEMINI_API_KEY = 'dynamic-base-test-key';
delete process.env.GEMINI_API_BASE;
delete process.env.OPENAI_API_KEY;

const requestedUrls = [];
globalThis.fetch = async (url, options = {}) => {
  requestedUrls.push(String(url));
  const payload = JSON.parse(options.body || '{}');
  const isRemix = payload.generationConfig?.responseMimeType === 'application/json';
  const text = isRemix
    ? JSON.stringify({
        remixes: Array.from({ length: 3 }, (_, index) => ({
          title: `Dynamic title ${index + 1}`,
          hook: `Dynamic hook ${index + 1}`,
          visualFlow: Array.from({ length: 3 }, (_, beat) => ({
            timeframe: `0:0${beat}-0:0${beat + 1}`,
            actionDescription: `Dynamic concrete action description ${index + 1}-${beat + 1}.`,
            onScreenText: `Dynamic text ${index + 1}-${beat + 1}`,
            audioVoiceover: `Dynamic voiceover ${index + 1}-${beat + 1}`,
          })),
          cta: `Dynamic CTA ${index + 1}`,
        })),
      })
    : 'Dynamic agent reply.';
  return {
    ok: true,
    json: async () => ({
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ text }] },
      }],
    }),
  };
};

const agentEngine = (await import('../backend/services/agentEngine.js')).default;
const remixEngine = (await import('../backend/services/remixEngine.js')).default;
process.env.GEMINI_API_BASE = 'https://dynamic-gemini.example.test/v1beta';

const agentResult = await agentEngine.generateAgentReply({
  message: 'Use the dynamic base.',
  workspace: { name: 'Dynamic workspace', brief: {} },
  snapshot: {},
});
assert.equal(agentResult.provider, 'gemini');

const remixResult = await remixEngine.generateRemix({
  title: 'Original dynamic source',
  hook: 'Original dynamic hook',
  script: 'Original dynamic script',
}, {});
assert.equal(remixResult._generation.provider, 'gemini');
assert.equal(requestedUrls.length, 2);
assert.ok(requestedUrls.every((url) => url.startsWith(process.env.GEMINI_API_BASE)));

if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = previousGeminiKey;
if (previousGeminiBase === undefined) delete process.env.GEMINI_API_BASE;
else process.env.GEMINI_API_BASE = previousGeminiBase;
if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = previousOpenAiKey;

console.log('dynamic AI provider base tests passed');
