import assert from 'node:assert/strict';

const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousGeminiBase = process.env.GEMINI_API_BASE;
const previousOpenAiKey = process.env.OPENAI_API_KEY;
process.env.GEMINI_API_KEY = 'dynamic-base-test-key';
delete process.env.GEMINI_API_BASE;
delete process.env.OPENAI_API_KEY;

const requestedUrls = [];
const requestedBodies = [];
globalThis.fetch = async (url, options = {}) => {
  requestedUrls.push(String(url));
  const payload = JSON.parse(options.body || '{}');
  requestedBodies.push(payload);
  const isRemix = payload.generationConfig?.responseMimeType === 'application/json';
  const text = isRemix
    ? JSON.stringify({
        remixes: [
          ['visible_source_conflict', 'Dynamic conflict title', 'Dynamic conflict needs visible proof before explanation.', 'Dynamic conflict needs visible proof before explanation.'],
          ['mechanism_walkthrough', 'Dynamic mechanism title', 'Dynamic mechanism becomes a concrete action sequence.', 'Dynamic mechanism becomes a concrete action sequence.'],
          ['viewer_decision', 'Dynamic viewer title', 'Dynamic viewer chooses the next verification step.', 'Dynamic viewer chooses the next verification step.'],
        ].map(([semanticAngle, title, hook, centralClaim], index) => ({
          title,
          hook,
          semanticAngle,
          centralClaim,
          sourceConflict: 'Dynamic source conflict needs a visible proof.',
          preservedMechanic: 'Dynamic concrete action sequence reveals proof.',
          brandTranslation: 'Dynamic consultant translation keeps the source action without inventing a brand.',
          productionProof: 'One phone, one screen, and one concrete action.',
          adaptationLogic: 'Dynamic source conflict becomes a visible action and next verification.',
          visualFlow: Array.from({ length: 3 }, (_, beat) => ({
            timeframe: `0:0${beat}-0:0${beat + 1}`,
            actionDescription: `Dynamic concrete action sequence reveals proof for the source conflict ${index + 1}-${beat + 1}.`,
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
}, {}, { language: 'en' });
assert.equal(remixResult._generation.provider, 'gemini');
assert.equal(requestedUrls.length, 2);
assert.ok(requestedUrls.every((url) => url.startsWith(process.env.GEMINI_API_BASE)));
const remixRequest = requestedBodies.find((payload) => payload.generationConfig?.responseMimeType === 'application/json');
assert.match(remixRequest.systemInstruction.parts[0].text, /user-visible output field in natural English/);
assert.match(remixRequest.systemInstruction.parts[0].text, /do not copy non-English speech or OCR/);

if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = previousGeminiKey;
if (previousGeminiBase === undefined) delete process.env.GEMINI_API_BASE;
else process.env.GEMINI_API_BASE = previousGeminiBase;
if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = previousOpenAiKey;

console.log('dynamic AI provider base tests passed');
