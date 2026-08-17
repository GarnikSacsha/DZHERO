import assert from 'node:assert/strict';

const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousOpenAiKey = process.env.OPENAI_API_KEY;
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

globalThis.fetch = async () => {
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

console.log('remix JSON recovery tests passed');
