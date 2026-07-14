export const AGENT_STUDIO_STAGE_ORDER = [
  'selecting_signal',
  'analyzing_video',
  'adapting_brand',
  'producing',
  'evaluating',
  'planning',
  'awaiting_approval',
];

export const AGENT_STUDIO_ACTIVE_STATUSES = new Set([
  'queued',
  'selecting_signal',
  'analyzing_video',
  'adapting_brand',
  'producing',
  'evaluating',
  'planning',
]);

const COPY = {
  en: {
    eyebrow: 'OpenAI Build Week · Beta',
    title: 'Agent Studio',
    subtitle: 'Jeryk manages a specialist team that turns one real signal into a grounded Reel and a seven-day content package.',
    newRun: 'New run',
    modes: {
      find_trend: {
        title: 'Find a trend for me',
        description: 'The Trend Analyst chooses the strongest signal for your objective.',
      },
      adapt_reel: {
        title: 'Adapt a Reel',
        description: 'Start from a Reel URL, an existing signal, or your own description.',
      },
    },
    objective: 'What should this content achieve?',
    objectivePlaceholder: 'For example: bring more weekday morning visits to my coffee shop.',
    demoObjective: 'Use coffee shop demo objective',
    source: 'Reel URL',
    sourcePlaceholder: 'Instagram, TikTok, or YouTube URL',
    signal: 'Or use an existing signal',
    noSignal: 'No signal selected',
    notes: 'What happens in the Reel? (optional)',
    notesPlaceholder: 'Describe the hook, key action, reveal, sound, or on-screen text.',
    run: 'Start agent team',
    running: 'Jeryk is managing the run',
    cancel: 'Cancel run',
    contextTitle: 'The video needs your context',
    contextDescription: 'The agents could not verify enough of the Reel. Add one or two sentences about the key action and reveal.',
    contextPlaceholder: 'First we see..., then..., and the reveal is...',
    resume: 'Continue the run',
    resultEyebrow: 'Jeryk manager review',
    why: 'Why this works',
    evidence: 'Grounded evidence',
    mechanic: 'Transferable mechanic',
    concepts: 'Choose the creative direction',
    hero: 'Full production script',
    alternative: 'Alternative concept',
    scenes: 'Shot-by-shot',
    plan: 'Seven-day content plan',
    trace: 'Agent activity',
    approve: 'Approve and add 7 days to Content Plan',
    approving: 'Adding to Content Plan...',
    approved: 'Approved · added to Content Plan',
    disabledTitle: 'Agent Studio Beta is switched off',
    disabledText: 'Set ENABLE_AGENT_STUDIO=true on the backend to show this Build Week experience.',
    missingTitle: 'Agent providers need configuration',
    retry: 'Try again',
    stages: {
      selecting_signal: 'Trend Analyst',
      analyzing_video: 'Video evidence',
      adapting_brand: 'Brand Strategist',
      producing: 'Creative Producer',
      evaluating: 'Critic',
      planning: 'Content Planner',
      awaiting_approval: 'Jeryk review',
    },
  },
  uk: {
    eyebrow: 'OpenAI Build Week · Beta',
    title: 'Agent Studio',
    subtitle: 'Джерик керує командою спеціалістів, яка перетворює один реальний сигнал на обґрунтований Reel і контент-пакет на сім днів.',
    newRun: 'Новий запуск',
    modes: {
      find_trend: {
        title: 'Знайти тренд для мене',
        description: 'Trend Analyst обере найсильніший сигнал під твою ціль.',
      },
      adapt_reel: {
        title: 'Адаптувати Reel',
        description: 'Почни з URL рілса, готового сигналу або власного опису.',
      },
    },
    objective: 'Якого результату має досягти контент?',
    objectivePlaceholder: 'Наприклад: привести більше гостей у кавʼярню вранці у будні.',
    demoObjective: 'Підставити ціль для демо кавʼярні',
    source: 'URL рілса',
    sourcePlaceholder: 'Посилання Instagram, TikTok або YouTube',
    signal: 'Або обери готовий сигнал',
    noSignal: 'Сигнал не обрано',
    notes: 'Що відбувається в рілсі? (необовʼязково)',
    notesPlaceholder: 'Опиши хук, ключову дію, розкриття, звук або текст на екрані.',
    run: 'Запустити команду агентів',
    running: 'Джерик керує запуском',
    cancel: 'Скасувати запуск',
    contextTitle: 'Відео потребує твого контексту',
    contextDescription: 'Агенти не змогли перевірити достатньо деталей рілса. Додай одне-два речення про ключову дію та розкриття.',
    contextPlaceholder: 'Спочатку бачимо..., потім..., а розкриття в тому, що...',
    resume: 'Продовжити запуск',
    resultEyebrow: 'Ревʼю менеджера Джерика',
    why: 'Чому це працює',
    evidence: 'Перевірені докази',
    mechanic: 'Механіка для адаптації',
    concepts: 'Обери креативний напрям',
    hero: 'Повний сценарій продакшену',
    alternative: 'Альтернативний концепт',
    scenes: 'Покадровий план',
    plan: 'Контент-план на сім днів',
    trace: 'Робота агентів',
    approve: 'Затвердити й додати 7 днів у контент-план',
    approving: 'Додаю в контент-план...',
    approved: 'Затверджено · додано в контент-план',
    disabledTitle: 'Agent Studio Beta вимкнено',
    disabledText: 'Встанови ENABLE_AGENT_STUDIO=true на backend, щоб показати цей Build Week режим.',
    missingTitle: 'Потрібно налаштувати провайдерів агентів',
    retry: 'Спробувати ще раз',
    stages: {
      selecting_signal: 'Trend Analyst',
      analyzing_video: 'Video evidence',
      adapting_brand: 'Brand Strategist',
      producing: 'Creative Producer',
      evaluating: 'Critic',
      planning: 'Content Planner',
      awaiting_approval: 'Ревʼю Джерика',
    },
  },
};

export function getAgentStudioCopy(language = 'uk') {
  return COPY[language === 'en' ? 'en' : 'uk'];
}

export function shouldPollAgentStudioRun(status) {
  return AGENT_STUDIO_ACTIVE_STATUSES.has(status);
}

export function getAgentStudioStageState(status, stage) {
  const stageIndex = AGENT_STUDIO_STAGE_ORDER.indexOf(stage);
  if (stageIndex < 0) return 'pending';
  if (status === 'completed') return 'complete';
  if (status === 'failed' || status === 'cancelled' || status === 'needs_context') {
    const activeIndex = AGENT_STUDIO_STAGE_ORDER.indexOf(status === 'needs_context' ? 'analyzing_video' : stage);
    if (status === 'needs_context') {
      if (stageIndex < activeIndex) return 'complete';
      if (stageIndex === activeIndex) return 'active';
    }
    return 'pending';
  }
  const activeStage = status === 'queued' ? AGENT_STUDIO_STAGE_ORDER[0] : status;
  const activeIndex = AGENT_STUDIO_STAGE_ORDER.indexOf(activeStage);
  if (activeIndex < 0) return 'pending';
  if (stageIndex < activeIndex) return 'complete';
  if (stageIndex === activeIndex) return 'active';
  return 'pending';
}

export function getAgentStudioCandidates(run) {
  const creative = run?.artifacts?.creative;
  if (!creative?.heroReel) return [];
  return [
    { ...creative.heroReel, kind: 'hero' },
    ...(creative.alternatives || []).map((candidate) => ({ ...candidate, kind: 'alternative' })),
  ];
}

export function buildAgentStudioCreatePayload(form, idempotencyKey) {
  const payload = {
    mode: form.mode,
    objective: String(form.objective || '').trim(),
    idempotencyKey,
  };
  if (form.mode === 'adapt_reel') {
    if (form.signalId) payload.signalId = form.signalId;
    if (String(form.sourceUrl || '').trim()) payload.sourceUrl = String(form.sourceUrl).trim();
    if (String(form.userNotes || '').trim()) payload.userNotes = String(form.userNotes).trim();
  }
  return payload;
}

export function getAgentStudioErrorMessage(error, language = 'uk') {
  const code = typeof error === 'string' ? error : error?.error || error?.code;
  const fallback = typeof error === 'object' && error?.message ? error.message : '';
  const messages = language === 'en'
    ? {
      agent_studio_disabled: 'Agent Studio Beta is disabled on this environment.',
      agent_studio_not_configured: 'OpenAI or Gemini is not configured for Agent Studio.',
      plan_limit_reached: 'Your plan limit is reached. Free space in Content Plan or change the plan.',
      rate_limit_exceeded: 'Too many requests. Wait a moment and try again.',
      invalid_agent_studio_input: 'Add an objective and a Reel source or description.',
    }
    : {
      agent_studio_disabled: 'Agent Studio Beta вимкнено в цьому середовищі.',
      agent_studio_not_configured: 'Для Agent Studio не налаштовано OpenAI або Gemini.',
      plan_limit_reached: 'Ліміт тарифу вичерпано. Звільни місце в контент-плані або зміни тариф.',
      rate_limit_exceeded: 'Забагато запитів. Зачекай трохи й спробуй знову.',
      invalid_agent_studio_input: 'Додай ціль і джерело рілса або його опис.',
    };
  return messages[code] || fallback || (language === 'en' ? 'Agent Studio could not complete this request.' : 'Agent Studio не зміг завершити цей запит.');
}
