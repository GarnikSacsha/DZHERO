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
        title: 'Choose from my Signals',
        description: 'The Trend Analyst chooses the strongest existing workspace signal for your objective.',
      },
      adapt_reel: {
        title: 'Adapt a Reel',
        description: 'Paste a public video link. DZHERO fetches and inspects the media automatically.',
      },
    },
    objective: 'What should this content achieve?',
    objectivePlaceholder: 'For example: bring more weekday morning visits to my coffee shop.',
    demoObjective: 'Use coffee shop demo objective',
    source: 'Video URL',
    sourcePlaceholder: 'Instagram, TikTok, YouTube, or a direct video URL',
    signal: 'Or use an existing signal',
    noSignal: 'No signal selected',
    noSignalsAvailable: 'There are no Signals in this workspace yet. Use Adapt a Reel with a public URL.',
    upload: 'Or upload the original video',
    uploadHint: 'MP4, MOV, WebM or M4V · up to 100 MB',
    uploadSelected: 'Selected file',
    uploading: 'Uploading video to Gemini...',
    run: 'Start agent team',
    running: 'Jeryk is managing the run',
    cancel: 'Cancel run',
    contextTitle: 'Video analysis needs another attempt',
    contextDescription: 'DZHERO could not obtain reliable structured video evidence. Retry or choose another public link.',
    chooseAnotherSource: 'Use another public link',
    resume: 'Upload and analyze',
    retrySource: 'Retry automatic video fetch',
    retryingSource: 'Retrying with Apify + Gemini...',
    resultEyebrow: 'Jeryk Manager review',
    why: 'Why this works',
    evidence: 'Grounded evidence',
    mechanic: 'Transferable mechanic',
    quality: 'Quality gate',
    qualityPassed: 'Passed',
    qualityReview: 'Needs revision',
    qualitySummary: 'Independent Critic score',
    qualityLabels: {
      grounding: 'Grounding',
      brandFit: 'Brand fit',
      originality: 'Originality',
      feasibility: 'Feasibility',
      language: 'Language',
      commercialFit: 'Commercial fit',
      hookStrength: 'Hook strength',
      mechanicFidelity: 'Mechanic fidelity',
      creativeBoldness: 'Creative boldness',
    },
    usage: 'Provider usage',
    usageCalls: 'calls',
    usageTokens: 'tokens',
    usageEstimated: 'estimated',
    usageReported: 'reported by provider',
    concepts: 'Choose the creative direction',
    hero: 'Full production script',
    alternative: 'Alternative concept',
    hybrid: 'Hybrid production script',
    hybridMode: 'Combine two directions',
    hybridHint: 'Select exactly two concepts. A new OpenAI agent will synthesize and re-check them.',
    hybridCreate: 'Create hybrid from selected ideas',
    hybridCreating: 'Hybrid team is working...',
    hybridCancel: 'Cancel hybrid selection',
    scenes: 'Shot-by-shot',
    plan: 'Seven-day content plan',
    trace: 'Agent activity',
    traceShowAll: 'Show all',
    traceShowLess: 'Show less',
    approve: 'Approve and add 7 days to Content Plan',
    approving: 'Adding to Content Plan...',
    approved: 'Approved · added to Content Plan',
    alternativeApprovalTitle: 'Turn this direction into a production-ready script first',
    alternativeApprovalHint: 'Choose Combine two directions and select exactly two ideas. Hybrid Producer will create and re-check a full script before approval.',
    approvalSuccessTitle: 'Content package approved',
    approvalSuccessDays: 'days were added to Content Plan.',
    approvalSuccessDuplicate: 'This package was already added to Content Plan.',
    openContentPlan: 'Open Content Plan',
    disabledTitle: 'Agent Studio Beta is disabled',
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
    stageStatus: {
      selecting_signal: 'selecting signal',
      analyzing_video: 'analyzing video',
      adapting_brand: 'adapting brand',
      producing: 'producing',
      evaluating: 'evaluating',
      planning: 'planning',
      awaiting_approval: 'awaiting approval',
    },
    traceStatuses: {
      started: 'started',
      completed: 'completed',
      needs_context: 'needs context',
      revised: 'revised',
      failed: 'failed',
      cancelled: 'cancelled',
    },
  },
  uk: {
    eyebrow: 'OpenAI Build Week · Beta',
    title: 'Agent Studio',
    subtitle: 'Джерик керує командою спеціалістів, яка перетворює один реальний сигнал на обґрунтований Reel і контент-пакет на сім днів.',
    newRun: 'Новий запуск',
    modes: {
      find_trend: {
        title: 'Знайти серед моїх Signals',
        description: 'Trend Analyst обере найсильніший готовий сигнал цього workspace під твою ціль.',
      },
      adapt_reel: {
        title: 'Адаптувати Reel',
        description: 'Встав публічне посилання. DZHERO автоматично отримає й проаналізує відео.',
      },
    },
    objective: 'Якого результату має досягти контент?',
    objectivePlaceholder: 'Наприклад: привести більше гостей у кавʼярню вранці у будні.',
    demoObjective: 'Підставити ціль для демо кавʼярні',
    source: 'URL відео',
    sourcePlaceholder: 'Instagram, TikTok, YouTube або пряме посилання на відео',
    signal: 'Або обери готовий сигнал',
    noSignal: 'Сигнал не обрано',
    noSignalsAvailable: 'У цьому workspace ще немає Signals. Обери «Адаптувати Reel» і встав публічний URL.',
    upload: 'Або завантаж оригінальне відео',
    uploadHint: 'MP4, MOV, WebM або M4V · до 100 МБ',
    uploadSelected: 'Обраний файл',
    uploading: 'Завантажуємо відео в Gemini...',
    run: 'Запустити команду агентів',
    running: 'Джерик керує запуском',
    cancel: 'Скасувати запуск',
    contextTitle: 'Аналіз відео потребує повторної спроби',
    contextDescription: 'DZHERO не зміг отримати надійні структуровані дані аналізу відео. Повтори спробу або встав інше публічне посилання.',
    chooseAnotherSource: 'Вставити інше публічне посилання',
    resume: 'Завантажити й проаналізувати',
    retrySource: 'Повторити автоматичне отримання відео',
    retryingSource: 'Повторюємо Apify + Gemini...',
    resultEyebrow: 'Ревʼю менеджера Джерика',
    why: 'Чому це працює',
    evidence: 'Перевірені докази',
    mechanic: 'Механіка для адаптації',
    quality: 'Контроль якості',
    qualityPassed: 'Пройдено',
    qualityReview: 'Потрібне доопрацювання',
    qualitySummary: 'Незалежна оцінка Critic',
    qualityLabels: {
      grounding: 'Обґрунтованість',
      brandFit: 'Відповідність бренду',
      originality: 'Оригінальність',
      feasibility: 'Реалістичність',
      language: 'Мова',
      commercialFit: 'Комерційний потенціал',
      hookStrength: 'Сила хука',
      mechanicFidelity: 'Точність механіки',
      creativeBoldness: 'Креативна сміливість',
    },
    usage: 'Використання провайдерів',
    usageCalls: 'викликів',
    usageTokens: 'токенів',
    usageEstimated: 'оцінка',
    usageReported: 'звіт провайдера',
    concepts: 'Обери креативний напрям',
    hero: 'Повний сценарій продакшену',
    alternative: 'Альтернативний концепт',
    hybrid: 'Гібридний продакшн-сценарій',
    hybridMode: 'Об’єднати два напрями',
    hybridHint: 'Обери рівно дві концепції. Новий OpenAI-агент об’єднає та повторно перевірить їх.',
    hybridCreate: 'Створити гібрид з обраних ідей',
    hybridCreating: 'Гібридна команда працює...',
    hybridCancel: 'Скасувати вибір для гібрида',
    scenes: 'Покадровий план',
    plan: 'Контент-план на сім днів',
    trace: 'Робота агентів',
    traceShowAll: 'Показати всі',
    traceShowLess: 'Згорнути',
    approve: 'Затвердити й додати 7 днів у контент-план',
    approving: 'Додаю в контент-план...',
    approved: 'Затверджено · додано в контент-план',
    alternativeApprovalTitle: 'Спочатку перетвори цей напрям на готовий сценарій',
    alternativeApprovalHint: 'Обери «Об’єднати два напрями» і відзнач рівно дві ідеї. Hybrid Producer створить і повторно перевірить повний сценарій.',
    approvalSuccessTitle: 'Креативний пакет затверджено',
    approvalSuccessDays: 'днів додано в контент-план.',
    approvalSuccessDuplicate: 'Цей пакет уже додано в контент-план.',
    openContentPlan: 'Відкрити контент-план',
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
    stageStatus: {
      selecting_signal: 'вибір сигналу',
      analyzing_video: 'аналіз відео',
      adapting_brand: 'адаптація бренду',
      producing: 'продакшен',
      evaluating: 'оцінювання',
      planning: 'планування',
      awaiting_approval: 'очікує підтвердження',
    },
    traceStatuses: {
      started: 'запущено',
      completed: 'завершено',
      needs_context: 'потрібен контекст',
      revised: 'доопрацьовано',
      failed: 'помилка',
      cancelled: 'скасовано',
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
    { ...creative.heroReel, kind: run?.artifacts?.hybrid ? 'hybrid' : 'hero' },
    ...(creative.alternatives || []).map((candidate) => ({ ...candidate, kind: 'alternative' })),
  ];
}

export function isProductionReadyAgentStudioCandidate(candidate) {
  return Array.isArray(candidate?.scenes)
    && candidate.scenes.length >= 2
    && Array.isArray(candidate?.productionNotes)
    && candidate.productionNotes.length > 0;
}

export function getAgentStudioGroundingPercent(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(Math.min(numeric <= 10 ? numeric * 10 : numeric, 100));
}

export function getAgentStudioTraceEntries(trace = []) {
  return trace.filter((entry, index) => {
    const previous = trace[index - 1];
    return !previous
      || previous.agent !== entry.agent
      || previous.status !== entry.status
      || previous.summary !== entry.summary;
  });
}

export function getAgentStudioRunLanguage(run) {
  return run?.input?.outputLanguage === 'en' ? 'en' : 'uk';
}

export function agentStudioRunMatchesLanguage(run, language = 'uk') {
  return getAgentStudioRunLanguage(run) === (language === 'en' ? 'en' : 'uk');
}

export function getAgentStudioStatusLabel(status, language = 'uk') {
  const normalized = String(status || '').replaceAll('_', ' ');
  if (language === 'en') return normalized;
  const labels = {
    queued: 'у черзі',
    selecting_signal: 'вибір сигналу',
    analyzing_video: 'аналіз відео',
    adapting_brand: 'адаптація бренду',
    producing: 'продакшен',
    evaluating: 'оцінювання',
    planning: 'планування',
    awaiting_approval: 'очікує підтвердження',
    completed: 'завершено',
    failed: 'помилка',
    cancelled: 'скасовано',
    needs_context: 'потрібен контекст',
  };
  return labels[status] || normalized;
}

export function buildAgentStudioCreatePayload(form, idempotencyKey, outputLanguage = 'uk') {
  const payload = {
    mode: form.mode,
    objective: String(form.objective || '').trim(),
    outputLanguage: outputLanguage === 'en' ? 'en' : 'uk',
    idempotencyKey,
  };
  if (form.mode === 'adapt_reel') {
    if (form.signalId) payload.signalId = form.signalId;
    if (String(form.sourceUrl || '').trim()) payload.sourceUrl = String(form.sourceUrl).trim();
    if (form.uploadId) payload.uploadId = form.uploadId;
    if (String(form.userNotes || '').trim()) payload.userNotes = String(form.userNotes).trim();
  }
  return payload;
}

export function getAgentStudioErrorMessage(error, language = 'uk') {
  const code = typeof error === 'string' ? error : error?.error || error?.code;
  const fallback = typeof error === 'object' && error?.message ? error.message : '';
  if (code === 'quality_rejected') {
    return language === 'en'
      ? 'The result did not pass the quality gate.'
      : 'Результат не пройшов перевірку якості.';
  }
  const messages = language === 'en'
    ? {
      agent_studio_disabled: 'Agent Studio Beta is disabled on this environment.',
      agent_studio_not_configured: 'OpenAI or Gemini is not configured for Agent Studio.',
      plan_limit_reached: 'Your plan limit has been reached. Remove an item from Content Plan or upgrade your plan.',
      rate_limit_exceeded: 'Too many requests. Wait a moment and try again.',
      invalid_agent_studio_input: 'Add an objective and choose a video URL, signal, or file.',
      agent_studio_upload_invalid: 'The uploaded video expired. Choose the file again.',
      agent_studio_video_file_required: 'Choose a video file first.',
      agent_studio_video_type_unsupported: 'Use an MP4, MOV, WebM, M4V, or 3GP video file.',
      agent_studio_hybrid_candidates_required: 'Select exactly two creative directions for the hybrid.',
      agent_studio_candidate_not_production_ready: 'This is a compact direction, not a production-ready script. Combine two ideas into a full hybrid first.',
    }
    : {
      agent_studio_disabled: 'Agent Studio Beta вимкнено в цьому середовищі.',
      agent_studio_not_configured: 'Для Agent Studio не налаштовано OpenAI або Gemini.',
      plan_limit_reached: 'Ліміт тарифу вичерпано. Звільни місце в контент-плані або зміни тариф.',
      rate_limit_exceeded: 'Забагато запитів. Зачекай трохи й спробуй знову.',
      invalid_agent_studio_input: 'Додай ціль і обери URL відео, сигнал або файл.',
      agent_studio_upload_invalid: 'Термін завантаженого відео минув. Обери файл ще раз.',
      agent_studio_video_file_required: 'Спочатку обери відеофайл.',
      agent_studio_video_type_unsupported: 'Використай відеофайл MP4, MOV, WebM, M4V або 3GP.',
      agent_studio_hybrid_candidates_required: 'Обери рівно два креативні напрями для гібрида.',
      agent_studio_candidate_not_production_ready: 'Це короткий напрям, а не готовий продакшн-сценарій. Спочатку об’єднай дві ідеї в повний гібрид.',
    };
  return messages[code] || fallback || (language === 'en' ? 'Agent Studio could not complete this request.' : 'Agent Studio не зміг завершити цей запит.');
}

export function getAgentStudioContextMessage(contextRequest, language = 'uk') {
  const reason = String(contextRequest?.reason || contextRequest?.message || '').trim();
  if (reason === 'Gemini did not return valid structured video evidence.') {
    return language === 'en'
      ? reason
      : 'Gemini не повернув коректні структуровані дані аналізу відео.';
  }
  return reason || getAgentStudioCopy(language).contextDescription;
}
