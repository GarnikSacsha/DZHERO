import assert from 'node:assert/strict';
import qualityModule from '../backend/services/remixQuality.cjs';
import remixEngine from '../backend/services/remixEngine.js';

const { assessRemixQuality } = qualityModule;

const source = {
  title: 'thank you edwin!! #kpop #SmallBusiness #kpopfyp #ateez #fyp',
  hook: 'thank you edwin!!',
  script: '#kpop #SmallBusiness #kpopfyp #ateez #fyp',
};

const copied = {
  remixes: [{
    title: 'thank you edwin!!',
    hook: 'thank you edwin!!',
    visualFlow: [
      { timeframe: '0-2 c', actionDescription: 'Крупний план', onScreenText: 'thank you edwin!!', audioVoiceover: '' },
      { timeframe: '2-6 c', actionDescription: 'Покажи контраст', onScreenText: '#kpop #fyp', audioVoiceover: '' },
      { timeframe: '6-15 c', actionDescription: 'Результат', onScreenText: 'Напиши ХОЧУ', audioVoiceover: '' },
    ],
    cta: 'Напиши ХОЧУ в Direct',
  }],
};

const copiedAssessment = assessRemixQuality(copied, { globalInsight: source });
assert.equal(copiedAssessment.ok, false);
assert.match(copiedAssessment.reasons.join(' '), /source|copy|hashtag|variant/i);

const semanticPlans = [
  {
    semanticAngle: 'visible_source_conflict',
    title: 'Сюрприз у звичайній покупці',
    hook: 'Клієнт обирає товар, а випадковий бонус змінює звичайну покупку.',
    centralClaim: 'Випадковий бонус перетворює звичайну покупку на сюрприз для клієнта.',
  },
  {
    semanticAngle: 'mechanism_walkthrough',
    title: 'Вибір відкриває фінал',
    hook: 'Покажи руку клієнта, відкриття бонусу і справжню реакцію без постановки.',
    centralClaim: 'Відкриття випадкового бонусу показує механіку вибору та живу реакцію клієнта.',
  },
  {
    semanticAngle: 'viewer_decision',
    title: 'Наступний бонус вирішує глядач',
    hook: 'Після реакції клієнта залиш вибір наступної винагороди коментарям.',
    centralClaim: 'Глядач обирає наступну винагороду після реакції клієнта на бонус.',
  },
];

const strong = {
  remixes: semanticPlans.map((plan) => ({
    ...plan,
    sourceConflict: 'Звичайна покупка переходить у бонус і реакцію клієнта.',
    preservedMechanic: 'Випадковий вибір бонусу, відкриття і щира реакція клієнта.',
    brandTranslation: 'Локальний продавець показує реальний товар, бонус і відповідь клієнта.',
    productionProof: 'Телефон, полиця, товар, бонус і один клієнт у кадрі.',
    adaptationLogic: 'Звичайна покупка переходить у випадковий вибір бонусу та чесну реакцію клієнта.',
    visualFlow: [
      { timeframe: '0:00-0:03', actionDescription: 'Покажи покупця перед вибором біля полиці.', onScreenText: 'Звичайна покупка?', audioVoiceover: 'Зараз буде дещо неочікуване.' },
      { timeframe: '0:03-0:09', actionDescription: 'Продавець додає персональний бонус і показує реакцію.', onScreenText: 'Бонус обирає випадок', audioVoiceover: 'Кожне замовлення сьогодні отримує свій сюрприз.' },
      { timeframe: '0:09-0:15', actionDescription: 'Крупно покажи товар, бонус і щиру реакцію клієнта.', onScreenText: 'Завітай сьогодні', audioVoiceover: 'Напиши назву товару, який хочеш побачити наступним.' },
    ],
    cta: 'Напиши назву товару в коментарях, і ми покажемо наступний сюрприз.',
  })),
};

assert.equal(assessRemixQuality(strong, { globalInsight: source }).ok, true);

const whitespaceRequiredField = structuredClone(strong);
whitespaceRequiredField.remixes[0].title = '   ';
const whitespaceAssessment = assessRemixQuality(whitespaceRequiredField, { globalInsight: source });
assert.equal(whitespaceAssessment.ok, false);
assert.match(whitespaceAssessment.reasons.join(' '), /missing title, hook, or CTA/i);

const paraphrasedClaims = structuredClone(strong);
paraphrasedClaims.remixes[1].centralClaim = 'Випадковий бонус перетворює звичайну покупку на сюрприз для клієнта.';
paraphrasedClaims.remixes[2].centralClaim = 'Для клієнта звичайна покупка перетворюється на сюрприз через випадковий бонус.';
const paraphrasedAssessment = assessRemixQuality(paraphrasedClaims, { globalInsight: source });
assert.equal(paraphrasedAssessment.ok, false);
assert.match(paraphrasedAssessment.reasons.join(' '), /central claim|paraphrased/i);

let attempts = 0;
const meteredAttempts = [];
let retryFeedback = '';
const retriedResult = await remixEngine.generateValidatedProviderResult({
  provider: 'test-provider',
  model: 'test-model',
  globalInsight: source,
  generate: async (feedback) => {
    attempts += 1;
    retryFeedback = feedback;
    return attempts === 1 ? copied : structuredClone(strong);
  },
  beforeProviderAttempt: async (attempt) => {
    meteredAttempts.push(attempt);
  },
});
assert.equal(attempts, 2);
assert.deepEqual(meteredAttempts, [
  { provider: 'test-provider', model: 'test-model', operation: 'remix', attempt: 1 },
  { provider: 'test-provider', model: 'test-model', operation: 'remix', attempt: 2 },
]);
assert.match(retryFeedback, /source|copy|hashtag|variant/i);
assert.equal(retriedResult._generation.provider, 'test-provider');
assert.equal(retriedResult._generation.model, 'test-model');
assert.equal(retriedResult._generation.attempts, 2);
assert.equal(retriedResult._generation.fallback, false);
assert.equal(retriedResult._generation.diagnostics[0].errorCategory, 'remix_quality_rejected');
assert.equal(retriedResult._generation.diagnostics[1].retryDecision, 'accepted');
console.log('remix provider quality tests passed');
