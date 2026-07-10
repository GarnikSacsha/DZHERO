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

const strong = {
  remixes: Array.from({ length: 3 }, (_, index) => ({
    title: `Сюрприз для клієнта ${index + 1}`,
    hook: `Клієнт обирає товар, але фінал ${index + 1} змінює звичайну покупку на маленьку подію.`,
    visualFlow: [
      { timeframe: '0:00-0:03', actionDescription: 'Покажи покупця перед вибором біля полиці.', onScreenText: 'Звичайна покупка?', audioVoiceover: 'Зараз буде дещо неочікуване.' },
      { timeframe: '0:03-0:09', actionDescription: 'Продавець додає персональний бонус і показує реакцію.', onScreenText: 'Бонус обирає випадок', audioVoiceover: 'Кожне замовлення сьогодні отримує свій сюрприз.' },
      { timeframe: '0:09-0:15', actionDescription: 'Крупно покажи товар, бонус і щиру реакцію клієнта.', onScreenText: 'Завітай сьогодні', audioVoiceover: 'Напиши назву товару, який хочеш побачити наступним.' },
    ],
    cta: 'Напиши назву товару в коментарях, і ми покажемо наступний сюрприз.',
  })),
};

assert.equal(assessRemixQuality(strong, { globalInsight: source }).ok, true);

let attempts = 0;
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
});
assert.equal(attempts, 2);
assert.match(retryFeedback, /source|copy|hashtag|variant/i);
assert.deepEqual(retriedResult._generation, {
  provider: 'test-provider', model: 'test-model', attempts: 2, fallback: false,
});
console.log('remix provider quality tests passed');
