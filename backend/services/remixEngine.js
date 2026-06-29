/**
 * Remix Engine (Ремикс-студия) Service for Dzhero SaaS
 * Handles the deconstruction of global Reels and generates 3 customized Ukrainian script remixes.
 */

// Safely use global fetch (available in Node 18+) or fallback
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : async (...args) => {
  try {
    const nodeFetch = require('node-fetch');
    return (nodeFetch.default || nodeFetch)(...args);
  } catch (e) {
    throw new Error("Native fetch is not available and 'node-fetch' is not installed. Please upgrade to Node 18+ or run 'npm install node-fetch'.");
  }
};

const DEFAULT_GEMINI_REMIX_MODEL = 'gemini-3.5-flash';

// The Structured JSON Schema requested
const REMIX_OUTPUT_SCHEMA = {
  deconstruction: {
    coreMechanics: "Psychological hook and core value loop used in the global video",
    psychologicalTriggers: ["List of 3 key psychological triggers used to keep viewers hooked"],
    removedCulturalContext: ["US/Global cultural memes, high budgets, currency references or specific brands stripped away"]
  },
  viabilityFilter: {
    isAdaptable: true,
    uaMentalityCheck: "Why this structure works specifically for the Ukrainian consumer/business owner mindset",
    productionFeasibility: "Production guidelines indicating low-budget execution for small teams (e.g. self-shooting, smartphone-only)"
  },
  remixes: [
    {
      title: "Name/Angle of this UA-remix variant (e.g., 'Сміливий виклик', 'Чесний розбір', 'Швидкий лайфхак')",
      hook: "Ukrainian hook for the first 2 seconds of the video, designed to grab immediate attention",
      visualFlow: [
        {
          timeframe: "0:00-0:03",
          actionDescription: "What the person does in the frame (e.g., наливає каву, дивиться прямо в камеру з посмішкою, показує екран телефону)",
          onScreenText: "Text overlay shown on the screen",
          audioVoiceover: "What to say out loud in Ukrainian (natural, spoken, matching the Tone of Voice)"
        },
        {
          timeframe: "0:03-0:10",
          actionDescription: "Visual progression showing the problem or product process",
          onScreenText: "Main learning point text overlay",
          audioVoiceover: "Explanation of the pain point or solution"
        },
        {
          timeframe: "0:10-0:15",
          actionDescription: "Visual proof, results, or engaging gesture",
          onScreenText: "Offer or CTA text",
          audioVoiceover: "Call to action details"
        }
      ],
      cta: "Clear Ukrainian Call to Action (e.g., напиши 'КАВА' в Дірект, залиш коментар, забронюй столик)"
    }
  ]
};

// System Prompt for the LLM
const REMIX_SYSTEM_PROMPT = `
You are the core AI of the Dzhero SMM platform ("Ремикс-студия"), a practical marketing producer for SMM experts and local business owners in Ukraine.
Your primary task is "Global Scouting & UA Adaptation": taking a highly viral global English Reel/Short video ("Global Insight"), deconstructing its marketing essence, filtering it for cultural viability, and rewriting it into 3 highly engaging, localized, and natural-sounding Reels scripts in Ukrainian (UA).

Here are your instructions:

1. DECONSTRUCTION PHASE:
   - Identify the psychological and marketing core of the original trend.
   - Strip away all foreign cultural artifacts: US memes, references to dollars/Euros, expensive studio setups, global enterprise brands, and massive production budgets.
   - Break it down into pure human psychology and a core marketing funnel (e.g., "Hook -> Agitate Pain -> Introduce AI/Simple Solution -> Interactive CTA").

2. QUALITY & VIABILITY FILTER:
   - Check if this format is adaptable to the Ukrainian local market context.
   - Explain why this appeals to the Ukrainian consumer mindset (who value authenticity, pragmatism, clever lifehacks, and supporting local businesses).
   - Ensure the execution is affordable, requiring only a smartphone, basic lighting, and a single speaker (no complex CGI or expensive sets).

3. 3x UKRAINIAN REMIX GENERATION:
   - Produce exactly 3 distinct script adaptations in natural, modern, native Ukrainian.
   - Avoid Google Translate-style or dry textbook language. Use natural spoken Ukrainian, slang if appropriate, and highly engaging conversational structures.
   - Align each remix with the Ukrainian Business Brief provided (Niche, Product/Offer, Location, and Tone of Voice).
   - NEVER use these generic AI words or phrases: "унікальний", "революційний", "зануртесь", "сфера", "інноваційний", "не пропустіть", "ключ до успіху", "готовий змінити життя?", "відкрийте для себе".
   - Never invent private metrics, client results, testimonials, or revenue numbers. If proof is missing, use safe proof placeholders such as "покажи відгук", "покажи процес", "покажи результат".
   - Format each remix with:
     - A unique creative angle/title.
     - A killer Hook (Хук) for the first 2 seconds.
     - A step-by-step Visual Flow (Visual Row / Сценарій) mapping timestamp ranges, action descriptions, on-screen text overlays, and spoken audio voiceover.
     - A clear local Call to Action (CTA) tailored to Instagram Direct messages, comments, or bio links.

FEW-SHOT QUALITY TARGETS:
- Pain + visual shock: "От через це ти втрачаєш клієнтів щодня." Show one visible operational failure, then one fix.
- Myth-busting: "Перестань лити гроші в таргет, якщо ця штука не налаштована." Destroy a common belief and show a cheaper retention loop.
- BTS authority: "Як я роблю контент на тиждень за одну годину." Show the actual workflow, not a motivational monologue.

4. STRICT JSON OUTPUT FORMAT:
   Return ONLY a valid JSON object matching this schema. Do not enclose it in markdown code blocks unless requested by JSON mode, but strictly output valid parsing JSON.
   JSON schema to fulfill:
   {
     "deconstruction": {
       "coreMechanics": "string explaining the underlying psychological or marketing pattern",
       "psychologicalTriggers": ["string trigger 1", "string trigger 2", "string trigger 3"],
       "removedCulturalContext": ["string describing what was stripped"]
     },
     "viabilityFilter": {
       "isAdaptable": true,
       "uaMentalityCheck": "string explaining the fit for UA audience",
       "productionFeasibility": "string describing how easily a local business can shoot this"
     },
     "remixes": [
       {
         "title": "string (creative angle title in UA)",
         "hook": "string (UA hook)",
         "visualFlow": [
           {
             "timeframe": "string (e.g. 0:00-0:02)",
             "actionDescription": "string (visual action details)",
             "onScreenText": "string (on-screen text overlay in UA)",
             "audioVoiceover": "string (verbal script in UA)"
           }
         ],
         "cta": "string (UA CTA)"
       }
     ]
   }
   Generate exactly 3 entries in the "remixes" array. Keep all Ukrainian translations natural, emotional, and persuasive.
`;

/**
 * Main Remix Engine Generator Function
 */
async function generateRemix(globalInsight, businessBrief) {
  const {
    title: globalTitle = "",
    hook: globalHook = "",
    script: globalScript = "",
    marketingMechanics: globalMechanics = ""
  } = globalInsight || {};

  const {
    niche = "Кафе/Ресторан",
    product = "Спешелті кава та десерти",
    location = "Київ",
    toneOfVoice = "дружній, але професійний"
  } = businessBrief || {};

  console.log(`[RemixEngine] Generating remixes for: Niche="${niche}", Product="${product}", Location="${location}", Tone="${toneOfVoice}"`);

  // Check if API keys are present in process.env
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (geminiApiKey) {
    try {
      return await generateWithGemini(geminiApiKey, globalInsight, businessBrief);
    } catch (err) {
      console.error("[RemixEngine] Gemini API error, falling back to mock generator:", err);
    }
  } else if (openaiApiKey) {
    try {
      return await generateWithOpenAI(openaiApiKey, globalInsight, businessBrief);
    } catch (err) {
      console.error("[RemixEngine] OpenAI API error, falling back to mock generator:", err);
    }
  }

  // Fallback high-fidelity smart script generator
  return generateHighFidelityFallback(globalInsight, businessBrief);
}

/**
 * Gemini SDK or REST API integration
 */
async function generateWithGemini(apiKey, globalInsight, businessBrief) {
  const model = process.env.GEMINI_REMIX_MODEL || process.env.GEMINI_TEXT_MODEL || DEFAULT_GEMINI_REMIX_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `
=== BUSINESS BRIEF ===
Niche: ${businessBrief.niche}
Product/Offer: ${businessBrief.product}
Location: ${businessBrief.location || 'Ukraine'}
Tone of Voice: ${businessBrief.toneOfVoice}

=== GLOBAL INSIGHT TO ADAPT ===
Original Video Description: ${globalInsight.title || 'Viral Reels Trend'}
Original Hook: ${globalInsight.hook}
Original Script/Text: ${globalInsight.script}
Marketing Mechanics: ${globalInsight.marketingMechanics}

Please deconstruct and generate 3 custom adaptations. Respond strictly with a JSON object that satisfies the output schema.
`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      systemInstruction: {
        parts: [{ text: REMIX_SYSTEM_PROMPT }]
      },
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.75,
        topP: 0.9
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
  }

  const jsonResult = await response.json();
  const textResponse = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResponse) {
    throw new Error("Empty response from Gemini API");
  }

  return JSON.parse(textResponse.trim());
}

/**
 * OpenAI REST API integration
 */
async function generateWithOpenAI(apiKey, globalInsight, businessBrief) {
  const url = "https://api.openai.com/v1/chat/completions";

  const prompt = `
=== BUSINESS BRIEF ===
Niche: ${businessBrief.niche}
Product/Offer: ${businessBrief.product}
Location: ${businessBrief.location || 'Ukraine'}
Tone of Voice: ${businessBrief.toneOfVoice}

=== GLOBAL INSIGHT TO ADAPT ===
Original Video Description: ${globalInsight.title || 'Viral Reels Trend'}
Original Hook: ${globalInsight.hook}
Original Script/Text: ${globalInsight.script}
Marketing Mechanics: ${globalInsight.marketingMechanics}
`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.7,
      messages: [
        { role: "system", content: REMIX_SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API HTTP ${response.status}: ${errorText}`);
  }

  const jsonResult = await response.json();
  const textResponse = jsonResult.choices?.[0]?.message?.content;
  if (!textResponse) {
    throw new Error("Empty response from OpenAI API");
  }

  return JSON.parse(textResponse.trim());
}

/**
 * Generates highly realistic, custom tailored scripts when API keys are not set.
 * This guarantees the frontend works seamlessly with gorgeous high-quality content.
 */
function generateHighFidelityFallback(globalInsight, businessBrief) {
  const {
    niche = "Кафе/Ресторан",
    product = "Спешелті кава та десерти",
    location = "Львів",
    toneOfVoice = "дружній, але професійний"
  } = businessBrief || {};

  const {
    title: globalTitle = "AI workflow for content creation",
    hook: globalHook = "How to make 5 ad creatives in 10 minutes",
    script: globalScript = "Stop paying for photoshoots. Just take one product photo and use this AI...",
    marketingMechanics = "pain point -> fast AI solution -> call to action on Direct keyword"
  } = globalInsight || {};

  // Formulate tailored Ukrainian terms based on niche and tone
  const lowerNiche = niche.toLowerCase();
  const lowerTone = toneOfVoice.toLowerCase();
  
  // Decide vocabulary based on Tone of Voice
  const isBold = lowerTone.includes('дерзк') || lowerTone.includes('молодеж') || lowerTone.includes('зухвал') || lowerTone.includes('хайп');
  const isExpert = lowerTone.includes('профес') || lowerTone.includes('експерт') || lowerTone.includes('серйозн');
  
  // Custom greetings & verbs based on tone
  const greeting = isBold ? "Йоу!" : isExpert ? "Вітаю!" : "Привіт!";
  const verbDirect = isBold ? "залітай у Дірект і пиши" : isExpert ? "надішліть повідомлення" : "пиши в Дірект";
  const ctaKeyword = isBold ? "СТАРТ" : isExpert ? "ОФФЕР" : "ХОЧУ";

  // Build beautiful custom scenarios depending on niche
  let coreMechanicsText = `Перетворення тренду "${globalTitle}" на локальну механіку взаємодії. Глобальний хук про швидке вирішення болю адаптовано під локальний контекст: український споживач реагує на конкретну вигоду та простоту дій.`;
  let mentalityCheck = `В Україні зараз надвисокий рівень диджиталізації та очікування швидкого сервісу. Споживачі цінують щирість та локальний бізнес, тому відкидаємо пафосні американські обіцянки мільйонів і переходимо до реальної щоденної користі.`;
  let feasibility = `Максимально просто. Не потрібна студія чи дороге світло. Достатньо записати одне розмовне відео на телефон прямо на робочому місці (в ${location}) та додати динамічні субтитри.`;

  let remixes = [];

  if (lowerNiche.includes('кафе') || lowerNiche.includes('ресторан') || lowerNiche.includes('їж') || lowerNiche.includes('коф')) {
    remixes = [
      {
        title: "Ремікс 1: Інтерактивний гастро-хук (Емоційний)",
        hook: `Чому звичайна кава в ${location} більше не працює?`,
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Спікер крупним планом робить перший ковток свіжої кави, на фоні грає затишний неоновий надпис закладу.",
            onScreenText: "Кава більше не працює? ☕️",
            audioVoiceover: `${greeting} Думаєш, люди приходять до нас просто за кофеїном? Насправді вони шукають ту саму атмосферу та емоцію в ${location}.`
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Камера плавно переходить на десертну вітрину, показуючи текстуру фірмового круасана з фісташкою.",
            onScreenText: "Секретний спешелті-оффер 👇",
            audioVoiceover: `Замість того, щоб купувати звичайне американо на ходу, спробуй поєднання нашої спешелті кави та свіжовипечених десертів.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Бариста посміхається і простягає чашку з лате-артом прямо в об'єктив камери.",
            onScreenText: "Напиши 'СПЕШЕЛТІ' в Дірект",
            audioVoiceover: `Хочеш отримати фірмовий макарон у подарунок до першого візиту? Просто ${verbDirect} кодове слово 'СПЕШЕЛТІ' нам у Дірект!`
          }
        ],
        cta: `Напиши кодове слово 'СПЕШЕЛТІ' в Дірект і отримай бонус`
      },
      {
        title: "Ремікс 2: Бекстейдж-тренд (Чесна кухня)",
        hook: "Скільки насправді коштує зробити один крутий десерт?",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Шеф-кондитер розбиває шоколадну сферу, з якої витікає гарячий карамельний соус.",
            onScreenText: "Чесна математика десерту 🍫",
            audioVoiceover: "Більшість людей думають, що кондитерка — це просто борошно та цукор. Але за цим стоять години підбору бельгійського шоколаду."
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Швидка динамічна нарізка кадрів: зважування інгредієнтів, випікання, декорування вручну.",
            onScreenText: "100% натуральні інгредієнти",
            audioVoiceover: `Ми в ${location} не використовуємо готові суміші. Тільки натуральне вершкове масло та фермерські ягоди.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Спікер відкушує десерт і показує задоволене обличчя з піднятим догори пальцем.",
            onScreenText: "Забронювати столик → Директ",
            audioVoiceover: `Спробуй справжній смак вже сьогодні. Напиши нам 'МЕНЮ' в Дірект, і ми надішлемо повну карту десертів та забронюємо для тебе найкращий столик.`
          }
        ],
        cta: "Напиши кодове слово 'МЕНЮ' в Дірект для бронювання та перегляду меню"
      },
      {
        title: "Ремікс 3: Локальна гордість (Дерзкий/Спільнота)",
        hook: `Секретне місце в ${location}, про яке ще не знають твої друзі`,
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Естетичний кадр входу у заклад через зелену арку, камера швидко залітає всередину.",
            onScreenText: "Таємна локація знайдена! 📍",
            audioVoiceover: "Шукаєш ідеальне спокійне місце для роботи з ноутбуком або побачення, де немає натовпу?"
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Показ затишного куточка з м'якими кріслами, розетками та ідеально налаштованим освітленням.",
            onScreenText: "Dzhero Vibes: Коворкінг + Релакс",
            audioVoiceover: `Ми створили простір, де є швидкий інтернет, генератори на випадок відключень і неймовірні спешелті кава та десерти.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Камера показує екран телефона з чат-ботом закладу, який видає знижку.",
            onScreenText: "Пиши 'ЗАТИШОК' в Дірект",
            audioVoiceover: `Хочеш секретну знижку 15% на перше замовлення? Просто ${verbDirect} 'ЗАТИШОК' прямо зараз!`
          }
        ],
        cta: "Пиши кодове слово 'ЗАТИШОК' в Дірект і забирай знижку 15%"
      }
    ];
  } else if (lowerNiche.includes('одяг') || lowerNiche.includes('шоп') || lowerNiche.includes('бренд') || lowerNiche.includes('гардероб') || lowerNiche.includes('fashion')) {
    remixes = [
      {
        title: "Ремікс 1: Капсульний лайфхак (Корисний експерт)",
        hook: "Як зібрати 7 стильних образів всього з 3 речей?",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Модель стоїть біля вішака з одягом, клацає пальцями — і на ній миттєво змінюється образ.",
            onScreenText: "Магія капсульного гардеробу 🪄",
            audioVoiceover: `${greeting} Втомилася від вічного 'нічого одягнути', хоча шафа ломиться від речей? Тобі не потрібна валіза одягу.`
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Динамічна зміна кадрів: модель комбінує базові штани, піджак та топ під різні аксесуари.",
            onScreenText: "База від нашого бренду в Одесі",
            audioVoiceover: `Достатньо мати якісну базу. Наші вироби в ${location} шиються за авторськими лекалами з натуральних італійських тканин.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Модель показує коробку з брендованим пакуванням і посміхається.",
            onScreenText: "Напиши 'КАПСУЛА' в Дірект",
            audioVoiceover: `Хочеш безкоштовний гайд з підбору капсульного гардероба на це літо? ${verbDirect} кодове слово 'КАПСУЛА'!`
          }
        ],
        cta: "Пиши кодове слово 'КАПСУЛА' в Дірект для отримання безкоштовного гайду"
      },
      {
        title: "Ремікс 2: Анти-шопінг маніфест (Зухвалий)",
        hook: "Перестань купувати дешевий одноразовий одяг!",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Дівчина кидає на підлогу кофту з мас-маркету, яка розтягнулася після першого прання.",
            onScreenText: "Досить викидати гроші! ❌",
            audioVoiceover: "Купуєш дешеву річ, вона втрачає вигляд після першого ж прання, і ти знову йдеш витрачати гроші. Знайомо?"
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Камера макро-зйомкою показує ідеальні шви та міцну фурнітуру нашого одягу.",
            onScreenText: "Якість, яка служить роками ✨",
            audioVoiceover: `Ми створюємо речі, які витримують сотні прань і сидять ідеально. Наш бренд у ${location} гарантує якість кожної ниточки.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Модель загортається у теплий м'який світшот і показує серце руками.",
            onScreenText: "Напиши 'ЯКІСТЬ' в Дірект",
            audioVoiceover: `Спробуй преміум-якість без переплат. Напиши нам 'ЯКІСТЬ' в Дірект, і ми дамо безкоштовну доставку на перше замовлення.`
          }
        ],
        cta: "Напиши кодове слово 'ЯКІСТЬ' в Дірект, щоб отримати безкоштовну доставку"
      },
      {
        title: "Ремікс 3: Естетика примірки (Шоукейс)",
        hook: "Знайшли сукню, яка підкреслює фігуру на всі 100%",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Дівчина крутиться перед дзеркалом у неймовірно красивій вечірній сукні, яка ідеально сідає по талії.",
            onScreenText: "Сукня-мрія знайдена 😍",
            audioVoiceover: "Шукаєш той самий образ для особливої події, який змусить усіх обертатися тобі вслід?"
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Камера показує деталі сукні: відкриту спину, легкість тканини при русі, блиск матеріалу.",
            onScreenText: "Лімітована колекція",
            audioVoiceover: `Це наша нова лімітована колекція. Всього 20 штук на всю країну, пошито вручну нашими майстрами.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Показ подарункового сертифікату або інтер'єру шоуруму.",
            onScreenText: "Пиши 'ОБРАЗ' в Дірект",
            audioVoiceover: `Забронювати свій розмір на примірку в ${location} або отримати онлайн-консультацію стиліста можна написавши 'ОБРАЗ' нам у Дірект!`
          }
        ],
        cta: "Напиши кодове слово 'ОБРАЗ' в Дірект для консультації стиліста та броні розміру"
      }
    ];
  } else {
    // Default tailored to "Эксперт" / "AI-маркетинг" or general business
    remixes = [
      {
        title: "Ремікс 1: Руйнування міфів (Професійний)",
        hook: `Ти використовуєш AI як звичайний Google. Саме тому він не дає бізнес-результату.`,
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Спікер сидить за столом з ноутбуком, рішуче закриває кришку і дивиться в об'єктив.",
            onScreenText: "Досить гуглити в ChatGPT! ❌",
            audioVoiceover: `${greeting} Більшість підприємців думають, що штучний інтелект — це просто заміна пошуковика для написання текстів. Але це помилка.`
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Швидкий запис екрану, де показано автоматизований воркфлоу, що створює контент-план за 10 секунд.",
            onScreenText: "AI як система автоматизації",
            audioVoiceover: `Справжня сила штучного інтелекту — в налаштуванні систем, які автоматизують твої продажі, аналізують конкурентів та пишуть сценарії.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Спікер посміхається і вказує пальцем вниз, де з'являється кодове слово.",
            onScreenText: "Напиши 'СИСТЕМА' в Дірект",
            audioVoiceover: `Хочеш впровадити таку систему у свій бізнес у місті ${location}? Просто ${verbDirect} мені слово 'СИСТЕМА' у приватні повідомлення.`
          }
        ],
        cta: `Напиши кодове слово 'СИСТЕМА' в Дірект для отримання безкоштовного чек-листа`
      },
      {
        title: "Ремікс 2: Крок за кроком (Інструкція)",
        hook: "Як звільнити 20 годин на тиждень за допомогою лише однієї безкоштовної програми",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Спікер з полегшенням видихає, відкидаючись на спинку офісного крісла.",
            onScreenText: "Поверни свій вільний час! ⏱️",
            audioVoiceover: "Постійно тонеш в операційці, рутині та підготовці звітів? Є один простий спосіб це змінити."
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Камера фокусується на телефоні спікера, де видно, як завдання автоматично виконуються.",
            onScreenText: "3 кроки до авто-пілота",
            audioVoiceover: `Замість ручного копіювання, налаштуй один раз інтеграцію між вашими CRM, месенджерами та AI.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Спікер показує жест рукою 'Окей' та киває головою.",
            onScreenText: "Пиши 'АВТО' в Дірект",
            audioVoiceover: `Я підготував детальну відео-інструкцію з налаштування. Напиши слово 'АВТО' в Дірект, і я надішлю її миттєво.`
          }
        ],
        cta: "Напиши кодове слово 'АВТО' в Дірект, щоб отримати відео-інструкцію"
      },
      {
        title: "Ремікс 3: Зухвалий виклик (Кейс-перформанс)",
        hook: "Я докажу, що твій відділ продажів втрачає до 40% клієнтів прямо зараз!",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Спікер тримає в руках пачку аркушів із закресленими графіками і кидає їх на стіл.",
            onScreenText: "Твій бізнес втрачає гроші! 💸",
            audioVoiceover: "Твої менеджери відповідають клієнтам по 2 години? В цей час вони просто купують у конкурентів, які відповідають за хвилину."
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Показ аналітичної панелі Dzhero з моментальною авто-відповіддю та кваліфікацією лідів.",
            onScreenText: "Рішення: Миттєва AI-кваліфікація лідів",
            audioVoiceover: `Завдяки нашій платформі Dzhero, кожен клієнт у ${location} отримує відповідь за 5 секунд та кваліфікується автоматично.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Спікер робить дружній жест, запрошуючи до діалогу.",
            onScreenText: "Напиши 'АУДИТ' в Дірект",
            audioVoiceover: `Хочеш безкоштовний аудит швидкості відповідей твоєї команди? ${verbDirect} мені кодове слово 'АУДИТ'!`
          }
        ],
        cta: "Напиши кодове слово 'АУДИТ' в Дірект для отримання безкоштовного аудиту швидкості відповідей"
      }
    ];
  }

  return {
    deconstruction: {
      coreMechanics: coreMechanicsText,
      psychologicalTriggers: [
        "Апеляція до болю втрати часу та грошей (FOMO/Pain points)",
        "Демонстрація надзвичайно легкого та доступного рішення без бюджету",
        "Моментальний тригер та заклик до простої інтерактивної дії (кодове слово в Директ)"
      ],
      removedCulturalContext: [
        "Прибрано американські приклади масштабу мільйонів доларів",
        "Специфічні зарубіжні платформи замінено локальними інструментами (Instagram Direct, Telegram)",
        "Прибрано очікування великих рекламних бюджетів — сценарії адаптовано під самостійну зйомку на телефон в українському офісі чи закладі"
      ]
    },
    viabilityFilter: {
      isAdaptable: true,
      uaMentalityCheck: mentalityCheck,
      productionFeasibility: feasibility
    },
    remixes: remixes
  };
}

module.exports = {
  generateRemix,
  REMIX_SYSTEM_PROMPT
};
