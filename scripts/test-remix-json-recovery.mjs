import assert from 'node:assert/strict';

const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousOpenAiKey = process.env.OPENAI_API_KEY;
const previousFetch = globalThis.fetch;
process.env.GEMINI_API_KEY = 'test-key';
delete process.env.OPENAI_API_KEY;

const source = {
  title: 'Customer surprise mechanic',
  hook: 'The customer expects one outcome and gets a useful surprise.',
  script: 'Show the choice, reveal the bonus, capture the reaction.',
};

const strong = {
  deconstruction: {
    coreMechanics: 'choice -> surprise -> reaction',
    psychologicalTriggers: [],
    removedCulturalContext: [],
  },
  viabilityFilter: {
    isAdaptable: true,
    uaMentalityCheck: 'Works through visible proof.',
    productionFeasibility: 'Phone shoot.',
  },
  remixes: [
    ['visible_source_conflict', 'Сюрприз у звичайній покупці', 'Клієнт обирає товар, а випадковий бонус змінює звичайну покупку.', 'Випадковий бонус перетворює звичайну покупку на сюрприз для клієнта.'],
    ['mechanism_walkthrough', 'Вибір відкриває фінал', 'Покажи руку клієнта, відкриття бонусу і справжню реакцію без постановки.', 'Відкриття випадкового бонусу показує механіку вибору та живу реакцію клієнта.'],
    ['viewer_decision', 'Наступний бонус вирішує глядач', 'Після реакції клієнта залиш вибір наступної винагороди коментарям.', 'Глядач обирає наступну винагороду після реакції клієнта на бонус.'],
  ].map(([semanticAngle, title, hook, centralClaim]) => ({
    semanticAngle,
    title,
    hook,
    centralClaim,
    sourceConflict: 'Клієнт очікує звичайну покупку без додаткової винагороди.',
    preservedMechanic: 'Випадковий вибір бонусу, відкриття і щира реакція клієнта.',
    brandTranslation: 'Кафе показує десерт, бонус і відповідь клієнта у Чернівцях.',
    productionProof: 'Телефон, полиця, десерт, бонус і один клієнт у кадрі.',
    adaptationLogic: 'Звичайна покупка переходить у випадковий вибір бонусу та чесну реакцію клієнта.',
    visualFlow: [
      {
        timeframe: '0:00-0:03',
        actionDescription: 'Покажи клієнта перед простим вибором біля полиці в кафе з десертами.',
        onScreenText: 'Звичайна покупка?',
        audioVoiceover: 'Зараз буде неочікуваний поворот.',
      },
      {
        timeframe: '0:03-0:09',
        actionDescription: 'Працівник додає персональний бонус і показує реакцію.',
        onScreenText: 'Бонус обирає випадок',
        audioVoiceover: 'Кожне замовлення отримує свій сюрприз.',
      },
      {
        timeframe: '0:09-0:15',
        actionDescription: 'Крупно покажи товар, бонус і справжню реакцію клієнта.',
        onScreenText: 'Що додати далі?',
        audioVoiceover: 'Напиши наступний варіант у коментарях.',
      },
    ],
    cta: 'Напиши наступний бонус у коментарях.',
  })),
};

const validText = JSON.stringify(strong);
const responses = [
  '{"remixes":[{"title":"broken"}',
  `\`\`\`json\n${validText}\n\`\`\``,
];
let fetchCalls = 0;
let responseFinishReason = 'STOP';
const requestBodies = [];

globalThis.fetch = async (_url, options = {}) => {
  requestBodies.push(JSON.parse(options.body));
  const text = responses[fetchCalls++];
  const midpoint = Math.floor(text.length / 2);
  return {
    ok: true,
    json: async () => ({
      candidates: [{
        content: {
          parts: [
            { text: text.slice(0, midpoint) },
            { text: text.slice(midpoint) },
          ],
        },
        finishReason: responseFinishReason,
      }],
    }),
  };
};

const remixEngine = (await import('../backend/services/remixEngine.js')).default;

const recovered = await remixEngine.generateRemix(source, {
  niche: 'кафе',
  product: 'десерти',
  location: 'Чернівці',
});
assert.equal(fetchCalls, 2, 'Malformed Gemini JSON must trigger one retry');
assert.deepEqual(recovered._generation, {
  provider: 'gemini',
  model: 'gemini-3.5-flash',
  attempts: 2,
  fallback: false,
});

fetchCalls = 0;
responses.splice(0, responses.length, '{"broken":', '{"stillBroken":');
await assert.rejects(
  remixEngine.generateRemix(source, {
    niche: 'кафе',
    product: 'десерти',
    location: 'Чернівці',
  }),
  (error) => (
    error.code === 'ai_provider_failed'
    && error.status === 502
    && error.payload?.error === 'ai_provider_failed'
  ),
);
assert.equal(fetchCalls, 2, 'Configured provider must stop after two failed attempts');

fetchCalls = 0;
responses.splice(0, responses.length, '{"broken":', '{"wouldRetry":');
await assert.rejects(
  remixEngine.generateRemix(source, {
    niche: 'кафе',
    product: 'десерти',
    location: 'Чернівці',
  }, { maxAttempts: 1 }),
  (error) => error.code === 'ai_provider_failed',
);
assert.equal(fetchCalls, 1, 'Personal-flow maxAttempts=1 disables provider repair retries');

const safeDiagnosticCases = [];
const rawProviderMarker = 'LIVE_PROVIDER_CONTENT_MUST_NOT_ESCAPE';

function captureSafeDiagnosticAssertion(assertion) {
  try {
    assertion();
  } catch (error) {
    safeDiagnosticCases.push(error);
  }
}

async function captureSingleAttemptFailure({ label, text, finishReason }) {
  fetchCalls = 0;
  responseFinishReason = finishReason;
  responses.splice(0, responses.length, text);
  let observedError = null;
  try {
    await remixEngine.generateRemix(source, {
      niche: 'кафе',
      product: 'десерти',
      location: 'Чернівці',
    }, { maxAttempts: 1 });
  } catch (error) {
    observedError = error;
  }
  assert.ok(observedError, `${label} must be rejected instead of becoming a valid remix`);
  assert.equal(fetchCalls, 1, `${label} must use exactly one fake remix fetch`);
  return observedError;
}

const truncatedPrefix = `{"deconstruction":{"coreMechanics":"${rawProviderMarker}`;
const truncatedText = `${truncatedPrefix}${'x'.repeat(384 - Buffer.byteLength(truncatedPrefix, 'utf8'))}`;
assert.equal(
  Buffer.byteLength(truncatedText, 'utf8'),
  384,
  'MAX_TOKENS fixture must retain the live 384-byte response shape',
);
const truncatedError = await captureSingleAttemptFailure({
  label: 'MAX_TOKENS truncated JSON',
  text: truncatedText,
  finishReason: 'MAX_TOKENS',
});
captureSafeDiagnosticAssertion(() => {
  assert.equal(truncatedError.code, 'ai_provider_failed');
});
captureSafeDiagnosticAssertion(() => {
  assert.equal(
    truncatedError.cause?.code,
    'remix_output_token_limit_exceeded',
    'MAX_TOKENS must retain a distinct bounded cause classification',
  );
});
captureSafeDiagnosticAssertion(() => {
  assert.deepEqual(truncatedError.cause?.diagnostic, {
    finishReason: 'MAX_TOKENS',
    candidateCount: 1,
    responseTextLength: Buffer.byteLength(truncatedText, 'utf8'),
  });
});
captureSafeDiagnosticAssertion(() => {
  assert.equal(JSON.stringify(truncatedError).includes(rawProviderMarker), false, 'raw provider text must not escape in the public error');
});

const malformedCompleteText = `{"deconstruction":{"coreMechanics":"${rawProviderMarker}"} "remixes":[]}`;
const malformedCompleteError = await captureSingleAttemptFailure({
  label: 'STOP malformed complete JSON',
  text: malformedCompleteText,
  finishReason: 'STOP',
});
captureSafeDiagnosticAssertion(() => {
  assert.equal(malformedCompleteError.code, 'ai_provider_failed');
});
captureSafeDiagnosticAssertion(() => {
  assert.equal(malformedCompleteError.cause?.code, 'provider_invalid_json');
});
captureSafeDiagnosticAssertion(() => {
  assert.deepEqual(
    malformedCompleteError.cause?.diagnostic,
    {
      finishReason: 'STOP',
      candidateCount: 1,
      responseTextLength: malformedCompleteText.length,
    },
    'Malformed complete JSON must retain bounded parser diagnostics',
  );
});
captureSafeDiagnosticAssertion(() => {
  assert.equal(JSON.stringify(malformedCompleteError).includes(rawProviderMarker), false, 'raw malformed provider text must not escape in the public error');
});

fetchCalls = 0;
requestBodies.length = 0;
responseFinishReason = 'STOP';
responses.splice(0, responses.length, validText);
const multipartControl = await remixEngine.generateRemix(source, {
  niche: 'кафе',
  product: 'десерти',
  location: 'Чернівці',
}, { maxAttempts: 1, maxOutputTokens: 8192 });
assert.equal(fetchCalls, 1, 'Valid multipart JSON control uses exactly one fake remix fetch');
assert.equal(multipartControl.remixes.length, 3, 'Valid multipart JSON remains accepted');
assert.equal(multipartControl._generation.attempts, 1);
assert.equal(requestBodies.length, 1, 'Request-body contract must inspect the single remix request');
assert.equal(requestBodies[0].generationConfig.maxOutputTokens, 8192);
assert.equal(requestBodies[0].generationConfig.responseMimeType, 'application/json');
assert.deepEqual(
  requestBodies[0].generationConfig.thinkingConfig,
  { thinkingLevel: 'low' },
  'Gemini 3.5 Flash remix requests must use low thinking inside generationConfig',
);

assert.equal(
  safeDiagnosticCases.length,
  0,
  safeDiagnosticCases.map((error) => error.message).join('\n'),
);

delete process.env.GEMINI_API_KEY;
await assert.rejects(
  remixEngine.generateRemix(source, {
    niche: 'кафе',
    product: 'десерти',
    location: 'Чернівці',
  }),
  (error) => (
    error.code === 'ai_provider_not_configured'
    && error.status === 503
    && error.payload?.error === 'ai_provider_not_configured'
  ),
);

if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = previousGeminiKey;
if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = previousOpenAiKey;
globalThis.fetch = previousFetch;

console.log('remix JSON recovery tests passed');
