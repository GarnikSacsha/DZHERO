import assert from 'node:assert/strict';

const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousOpenAiKey = process.env.OPENAI_API_KEY;
process.env.GEMINI_API_KEY = 'offline-test-key';
delete process.env.OPENAI_API_KEY;

const source = {
  title: 'A source with observable proof',
  hook: 'The process starts with an empty board.',
  script: 'A creator connects the steps and reveals the completed workflow.',
};
const valid = {
  deconstruction: {
    coreMechanics: 'visible setup -> process -> result',
    psychologicalTriggers: ['curiosity', 'visible proof', 'completion'],
    removedCulturalContext: ['unsupported claims'],
  },
  viabilityFilter: {
    isAdaptable: true,
    uaMentalityCheck: 'The proof is concrete and practical.',
    productionFeasibility: 'One phone and a real workflow.',
  },
  remixes: ['visible_source_conflict', 'mechanism_walkthrough', 'viewer_decision'].map((semanticAngle, index) => ({
    title: [
      'Workflow audit: порожня дошка',
      'Automation workflow: з’єднання кроків',
      'Small teams обирають наступний workflow',
    ][index],
    hook: [
      'Порожня дошка показує проблему automation для small teams.',
      'З’єднай реальні кроки workflow audit для small teams.',
      'Покажи результат automation і дай small teams обрати наступний крок.',
    ][index],
    semanticAngle,
    centralClaim: [
      'Порожня дошка показує проблему automation до workflow audit.',
      'З’єднання кроків показує workflow audit для small teams.',
      'Small teams обирають наступний крок після результату automation workflow.',
    ][index],
    sourceConflict: 'Порожня дошка не дає команді побачити зв’язок між кроками.',
    preservedMechanic: 'Автор з’єднує кроки на дошці й запускає завершений workflow.',
    brandTranslation: 'Automation workflow audit допомагає small teams перевірити реальний процес без вигаданих результатів.',
    productionProof: 'Одна дошка, телефон, реальні кроки workflow і завершений запуск у кадрі.',
    adaptationLogic: `Видимий розрив переходить у workflow audit через кут ${semanticAngle}.`,
    visualFlow: [
      {
        timeframe: '0:00-0:03',
        actionDescription: 'Покажи порожню дошку крупним планом.',
        onScreenText: 'ДО',
        audioVoiceover: 'Починаємо з порожньої системи.',
      },
      {
        timeframe: '0:03-0:10',
        actionDescription: 'З’єднай кроки та покажи реальний процес.',
        onScreenText: 'ПРОЦЕС',
        audioVoiceover: 'Ось як кроки працюють разом.',
      },
      {
        timeframe: '0:10-0:15',
        actionDescription: 'Запусти готовий сценарій і покажи результат.',
        onScreenText: 'ГОТОВО',
        audioVoiceover: 'Тепер покажи чесний наступний крок.',
      },
    ],
    cta: 'Напиши СХЕМА, щоб отримати структуру.',
  })),
};

let calls = [];
let responses = [];
globalThis.fetch = async (_url, options = {}) => {
  calls.push(JSON.parse(options.body));
  const payload = responses.shift();
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
};
const remixEngine = (await import('../backend/services/remixEngine.js')).default;

responses = [
  { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{\"remixes\":[' }] } }] },
  { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(valid) }] } }] },
];
const recovered = await remixEngine.generateRemix(source, {
  niche: 'automation',
  product: 'workflow audit',
  audience: 'small teams',
}, {
  route: 'offline_max_tokens',
  maxOutputTokens: 4096,
  retryMaxOutputTokens: 8192,
});
assert.equal(calls.length, 2, 'MAX_TOKENS gets one bounded retry');
assert.deepEqual(calls.map((body) => body.generationConfig.maxOutputTokens), [4096, 8192]);
assert.equal(calls[0].generationConfig.responseMimeType, 'application/json');
assert.equal(calls[0].generationConfig.responseSchema.type, 'OBJECT');
assert.equal(recovered._generation.diagnostics[0].errorCategory, 'output_token_limit');
assert.equal(recovered._generation.diagnostics[0].retryDecision, 'increase_output_budget');

calls = [];
responses = [{
  promptFeedback: { blockReason: 'PROHIBITED_CONTENT' },
  candidates: [{ finishReason: 'PROHIBITED_CONTENT', content: { parts: [] } }],
}];
await assert.rejects(
  remixEngine.generateRemix(source, {
    niche: 'automation',
    product: 'workflow audit',
    audience: 'small teams',
  }, { route: 'offline_content_blocked' }),
  (error) => (
    error.code === 'ai_provider_failed'
    && error.payload?.category === 'provider_content_blocked'
    && error.payload?.diagnostic?.attempts?.[0]?.retryDecision === 'no_retry'
  ),
);
assert.equal(calls.length, 1, 'content-blocked request must not receive an identical retry');

calls = [];
responses = [
  { candidates: [{ finishReason: 'STOP', content: { parts: [] } }] },
  { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(valid) }] } }] },
];
const emptyRecovered = await remixEngine.generateRemix(source, {
  niche: 'automation',
  product: 'workflow audit',
  audience: 'small teams',
}, { route: 'offline_empty_response' });
assert.equal(calls.length, 2);
assert.equal(emptyRecovered._generation.diagnostics[0].errorCategory, 'provider_empty_response');

if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = previousGeminiKey;
if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = previousOpenAiKey;

console.log('remix provider error classification tests passed');
