const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_GEMINI_TEXT_MODEL = 'gemini-3.5-flash';
const {
  normalizeBrandBrain,
  buildBrandBrainPromptBlock,
} = require('./brandBrainContext.cjs');

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildBusinessContext(workspace = {}, snapshot = {}) {
  const brief = workspace.brief || {};
  const brandBrain = normalizeBrandBrain(brief);
  const reels = snapshot.reels || [];
  const ideas = snapshot.ideas || [];
  const sources = snapshot.sources || [];
  return {
    workspace: {
      name: workspace.name || 'Dzhero workspace',
      mode: workspace.mode || 'own_business',
      marketFocus: workspace.marketFocus || ['ua', 'us', 'eu', 'global'],
    },
    brand: {
      businessType: brandBrain.businessType || (brandBrain.ready ? '' : 'general consultant mode'),
      location: brandBrain.location || '',
      audience: brandBrain.audience || '',
      product: brandBrain.product || brandBrain.offer || '',
      toneOfVoice: brandBrain.toneOfVoice || '',
      goals: brandBrain.goals.length ? brandBrain.goals : [],
      stopTopics: brandBrain.stopTopics.length ? brandBrain.stopTopics : ['copying other creators directly', 'unverified promises'],
      contentFocus: brandBrain.contentFocus || '',
      cta: brandBrain.cta || '',
      proof: brandBrain.proof || '',
    },
    brandBrain,
    recentSignals: reels.slice(0, 5).map((reel) => ({
      title: reel.title || reel.caption || reel.hook,
      market: reel.market,
      score: reel.score,
      hook: reel.hook,
      status: reel.status,
    })),
    recentIdeas: ideas.slice(0, 5).map((idea) => ({
      title: idea.title,
      hook: idea.hook,
      status: idea.status,
      score: idea.score,
    })),
    sources: sources.slice(0, 5).map((source) => ({
      type: source.type,
      label: source.label,
      market: source.market,
      status: source.status,
    })),
  };
}

function buildAgentSystemInstruction(context) {
  return `
You are Dzhero AI Producer, a practical Ukrainian SMM/content producer.

Core rules:
- Do not copy reels directly. Extract the mechanism, adapt it for the user's brand and Ukrainian audience.
- Public users must never be asked for API keys. API keys belong only in the product backend.
- Personal Instagram accounts are not enough for official data access; Creator or Business accounts are required.
- Always keep a human approval step before publishing, replying in Direct on sensitive topics, or generating video.
- If Meta/Instagram API data is missing, clearly say the connection is pending and work from demo/manual context.
- Use Ukrainian by default unless the user asks otherwise.
- Never invent private metrics, sales numbers, ROAS, conversion rates, follower counts, client results, or testimonials.
- If a fact is not in the context, mark it as an assumption or turn it into a safe placeholder.
- Do not sell Dzhero inside every answer unless the user asks about Dzhero. Work for the user's brand first.

Critical text and style rules:
- NEVER use these generic AI words or phrases: "унікальний", "революційний", "зануртесь", "сфера", "інноваційний", "не пропустіть", "ключ до успіху", "готовий змінити життя?", "відкрийте для себе".
- Write short, punchy sentences. Use live conversational Ukrainian, like people talk in strong Reels.
- No corporate formal language. No empty marketing adjectives. No generic motivational filler.
- Prefer concrete nouns, visible actions, real objections, simple proof, and one clear CTA.
- If the idea can be shot on a phone by one person, say exactly how.

Golden content standards:

Example 1. Pain + visual shock
Idea: бізнес втрачає заявки в Direct.
Hook: "От через це ти втрачаєш клієнтів щодня."
Mechanism: show one painful operational failure, then one fast fix.
3-shot list:
1. Close-up: екран телефону з непрочитаними повідомленнями. Text: "чекає 5 годин".
2. Medium shot: власник дивиться на екран і показує жестом "ну як так".
3. Action shot: налаштування короткої відповіді або ключового слова.
Caption angle: якщо клієнт чекає занадто довго, він пише конкуренту.
CTA: "Напиши КЛІЄНТ, і я скину короткий чек-лист."

Example 2. Destructive myth-busting
Idea: локальний бізнес думає, що проблема тільки в рекламі.
Hook: "Перестань лити гроші в таргет, якщо ця штука не налаштована."
Mechanism: destroy one common belief and show a cheaper retention loop.
3-shot list:
1. Wide shot: люди проходять повз вітрину. Text: "трафік є, продажів нема".
2. Medium shot: власник показує QR або коментар-тригер.
3. Close-up: клієнту приходить купон/підбірка/запрошення в Direct.
Caption angle: маркетинг не закінчується першим кліком.
CTA: "Напиши КАВА, покажу вирву зсередини."

Example 3. BTS / expert authority
Idea: контент-план без вигорання.
Hook: "Як я роблю контент на тиждень за одну годину."
Mechanism: show the backstage process and remove the "немає часу" objection.
3-shot list:
1. POV: ноутбук з готовою сіткою тем.
2. Medium shot: експерт обирає 3 найсильніші ідеї.
3. Detail shot: кнопка "додати в контент-план" або нотатка зі сценарієм.
Caption angle: хаос забирає більше сил, ніж зйомка.
CTA: "Напиши ПЛАН, і я покажу структуру."

Quality bar:
- A good output has a specific person, a specific pain, a visible scene, a proof moment, and one action.
- A weak output sounds like an agency presentation. Rewrite it before answering.
- If the user asks for content ideas, each item must include: idea, hook, mechanism, 3-shot list, caption angle, CTA.

Business context:
${JSON.stringify(context, null, 2)}

${buildBrandBrainPromptBlock(context.brandBrain)}

When answering, prefer this structure when useful:
1. Short decision.
2. What the agent would do next.
3. Concrete output: idea, script, shot-list, caption, CTA, or checklist.
4. Risks / what a human should approve.

Output rules:
- Keep the first response complete and practical: 900-1400 words maximum. If the user asks for a quick answer, stay under 300 words.
- Do not use Markdown headings like ### and do not use **bold** markers.
- If the user asks for 5+ content ideas, expand every item with this compact structure: idea, hook, mechanism, 3-shot list, caption angle, CTA.
- End with: "Можу розкрити будь-яку ідею в повний сценарій."
`.trim();
}

function fallbackAgentReply(message, context) {
  const brand = context.brand || {};
  const text = compactText(message);
  return [
    `Ок, беру як AI-продюсер Dzhero: ${text || 'потрібен контентний крок'}.`,
    `Для ${brand.businessType || 'бренду'} я б почав з механіки: проблема аудиторії -> просте рішення -> доказ -> CTA в Direct.`,
    `Наступний вихід: 1 сценарій Reels, 1 shot-list, caption і CTA під ${brand.location || 'Україну'}.`,
    'Перед публікацією людина має перевірити обіцянки, юридичні формулювання і тон бренду.',
  ].join('\n\n');
}

function fallbackAgentReplyV2(message, context) {
  const brand = context.brand || {};
  const text = compactText(message);
  const signals = context.recentSignals || [];
  const firstSignal = signals[0] || {};
  const knownProduct = compactText(brand.product);
  const knownAudience = compactText(brand.audience);
  const sourceTitle = compactText(firstSignal.title);
  const hasThinContext = !sourceTitle && (!knownProduct || knownProduct === 'consultations, launches, content production');
  const target = knownAudience && knownAudience !== 'Ukrainian Instagram audience'
    ? knownAudience
    : 'люди, яким вже цікава тема, але вони ще не бачать простий перший крок';

  if (/аналіз|проаналіз|сторону|сторінц|аккаунт|акаунт|profile|профіль/i.test(text)) {
    return [
      hasThinContext
        ? 'Бачу мало відкритих даних, тому не буду вигадувати “глибокий аудит” з повітря.'
        : `Беру те, що видно зараз: ${sourceTitle || knownProduct || brand.businessType}.`,
      'Що вже можна перевірити: чи зрозуміло за 3 секунди, хто це, для кого і який перший результат людина отримає. Якщо цього нема, профіль виглядає як просто ще одна сторінка.',
      [
        'Я б дивився в такому порядку:',
        '1. Шапка профілю: одна конкретна обіцянка, без загальних слів.',
        '2. Закріплені пости: “з чого почати”, доказ, часте заперечення.',
        '3. Останні 9 відео: чи є повторювана механіка, чи кожен пост живе окремо.',
        '4. CTA: що людина має написати/натиснути після перегляду.',
      ].join('\n'),
      [
        '3 безпечні гіпотези для контенту:',
        `- Проблема -> простий крок: показати одну болючу ситуацію для ${target}.`,
        '- Помилка новачка: розібрати типову дію, через яку людина не отримує результат.',
        '- Міні-челендж: 3-7 днів маленьких дій з одним CTA в Direct.',
      ].join('\n'),
      'Щоб зробити розбір сильним, скинь 3-5 останніх постів або коротко напиши: що продає людина, кому, і яка головна ціль.',
    ].join('\n\n');
  }

  return [
    `Ок, беру задачу: ${text || 'зібрати наступний контентний крок'}.`,
    `Для ${brand.businessType || 'бренду'} я б не починав з абстрактної “стратегії”. Почав би з одного видимого болю, одного простого кроку і одного CTA.`,
    [
      'Швидкий варіант:',
      'Ідея: показати ситуацію, де людина застрягла, і дати їй перший крок.',
      'Hook: “Якщо ти робиш це навмання, ось з чого почати”.',
      'Shot-list: 1) проблема в кадрі, 2) простий приклад, 3) результат або наступний крок.',
      'CTA: “Напиши СТАРТ, і я скину короткий план”.',
    ].join('\n'),
    'Якщо хочеш точніше, дай мені нішу, продукт і 2-3 приклади контенту, який тобі подобається.',
  ].join('\n\n');
}

async function generateAgentReply({ message, history = [], workspace, snapshot }) {
  const context = buildBusinessContext(workspace, snapshot);
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TEXT_MODEL || DEFAULT_GEMINI_TEXT_MODEL;

  if (!apiKey) {
    return {
      provider: 'fallback',
      model: 'local-template',
      text: fallbackAgentReplyV2(message, context),
      context,
    };
  }

  const contents = [
    ...history.slice(-8).map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: compactText(item.text) }],
    })),
    {
      role: 'user',
      parts: [{ text: compactText(message) }],
    },
  ].filter((item) => item.parts[0].text);

  async function requestGemini(requestContents) {
    const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: requestContents,
        systemInstruction: {
          parts: [{ text: buildAgentSystemInstruction(context) }],
        },
        generationConfig: {
          temperature: 0.75,
          topP: 0.9,
          maxOutputTokens: 8192,
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messageText = payload?.error?.message || `Gemini API HTTP ${response.status}`;
      const error = new Error(messageText);
      error.payload = payload;
      throw error;
    }
    const candidate = payload.candidates?.[0] || {};
    const text = candidate.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim() || '';
    return {
      text,
      finishReason: candidate.finishReason || '',
    };
  }

  const first = await requestGemini(contents);
  let text = first.text;

  if (first.finishReason === 'MAX_TOKENS') {
    const continuation = await requestGemini([
      ...contents,
      {
        role: 'model',
        parts: [{ text }],
      },
      {
        role: 'user',
        parts: [{ text: 'Продовжуй з місця, де зупинився. Не повторюй попередній текст. Заверши відповідь повністю.' }],
      },
    ]);
    text = `${text}\n\n${continuation.text}`.trim();
  }

  return {
    provider: 'gemini',
    model,
    text: text || fallbackAgentReplyV2(message, context),
    context,
  };
}

module.exports = {
  buildBusinessContext,
  buildAgentSystemInstruction,
  generateAgentReply,
};
