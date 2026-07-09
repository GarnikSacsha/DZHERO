function toInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pluralize(count, one, few, many) {
  const absolute = Math.abs(Math.trunc(count));
  const lastTwo = absolute % 100;
  const lastDigit = absolute % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}

function formatDiscoveryTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date).replace(',', '');
}

function getDiscoveryRunErrors(run) {
  return Array.isArray(run?.errors) ? run.errors.filter(Boolean) : [];
}

function getDiscoveryRunErrorCount(run) {
  const errorCount = Number(run?.errorCount);
  if (Number.isFinite(errorCount) && errorCount > 0) return errorCount;
  return getDiscoveryRunErrors(run).length;
}

function getDiscoveryRunAcceptedCount(run, fallbackCount = 0) {
  const runAccepted = Number(run?.acceptedCount);
  if (Number.isFinite(runAccepted) && runAccepted >= 0) return runAccepted;
  return Math.max(toInt(fallbackCount), 0);
}

function getDiscoveryRunPlatformLabel(platform) {
  if (platform === 'instagram') return 'Instagram';
  if (platform === 'tiktok') return 'TikTok';
  return String(platform || '').trim();
}

function getDiscoveryRunLaneLabel(lane) {
  return {
    accounts: 'акаунти',
    keywords: 'ключові слова',
    hashtags: 'хештеги',
    trends: 'тренди',
    winner: 'фінальне завантаження',
  }[lane] || String(lane || '').trim();
}

function getDiscoveryRunErrorContext(run) {
  const [firstError] = getDiscoveryRunErrors(run);
  if (!firstError) return '';

  const locationParts = [];
  const platformLabel = getDiscoveryRunPlatformLabel(firstError.platform);
  const laneLabel = getDiscoveryRunLaneLabel(firstError.lane);
  if (platformLabel) locationParts.push(platformLabel);
  if (laneLabel) locationParts.push(laneLabel);

  const prefix = locationParts.length ? `${locationParts.join(' / ')}: ` : '';
  const message = String(firstError.message || '').trim();
  const remainingErrors = Math.max(getDiscoveryRunErrorCount(run) - 1, 0);
  const extraText = remainingErrors > 0
    ? ` Ще ${remainingErrors} ${pluralize(remainingErrors, 'помилка', 'помилки', 'помилок')}.`
    : '';

  if (!message) {
    return `${prefix.trim()}${extraText}`.trim();
  }
  return `${prefix}${message}${extraText}`.trim();
}

function buildDiscoveryRunSuccessSummary(acceptedCount, updatedCount) {
  const accepted = Math.max(toInt(acceptedCount), 0);
  const updated = Math.max(toInt(updatedCount), 0);

  if (accepted > 0 || updated > 0) {
    const acceptedText = accepted > 0
      ? `${accepted} ${pluralize(accepted, 'сигнал', 'сигнали', 'сигналів')}`
      : '';
    const updatedText = updated > 0
      ? `${updated} ${pluralize(updated, 'сигнал', 'сигнали', 'сигналів')}`
      : '';
    return `Автопошук ${accepted > 0 ? `додав ${acceptedText}` : ''}${accepted > 0 && updated > 0 ? ' і ' : ''}${updated > 0 ? `оновив ${updatedText}` : ''}.`;
  }

  return 'Автопошук завершився без нових сигналів.';
}

function isPartialDiscoveryRun(run) {
  return run?.status === 'completed' && getDiscoveryRunErrorCount(run) > 0;
}

export function deriveDiscoveryRunStatusCode(run, settings = {}, fallbackCode = '') {
  if (isPartialDiscoveryRun(run)) return 'partial';
  if (fallbackCode) return fallbackCode;
  if (run?.status === 'running') return 'running';
  if (run?.status === 'blocked_budget') return 'budget_reached';
  if (run?.status === 'failed') return 'failed';
  if (settings?.enabled === false) return 'paused';
  return 'scheduled';
}

export function deriveDiscoveryRunNotice({
  run = null,
  acceptedSignalsCount = 0,
  updatedSignalsCount = 0,
} = {}) {
  const accepted = getDiscoveryRunAcceptedCount(run, acceptedSignalsCount);
  const updated = Math.max(toInt(updatedSignalsCount), 0);
  const errorContext = getDiscoveryRunErrorContext(run);

  if (run?.status === 'failed') {
    const parts = [];
    if (accepted > 0) {
      parts.push(`${accepted} ${pluralize(accepted, 'сигнал', 'сигнали', 'сигналів')}`);
    }
    if (updated > 0) {
      parts.push(`${updated} ${pluralize(updated, 'оновлення', 'оновлення', 'оновлень')}`);
    }
    if (parts.length) {
      return {
        tone: 'error',
        message: `Автопошук завершився з помилкою після ${parts.join(' і ')}.`,
      };
    }
    return {
      tone: 'error',
      message: errorContext
        ? `Автопошук завершився з помилкою: ${errorContext}`
        : 'Автопошук завершився з помилкою.',
    };
  }

  if (isPartialDiscoveryRun(run)) {
    const successSummary = buildDiscoveryRunSuccessSummary(accepted, updated).replace(/\.$/, '');
    return {
      tone: 'warning',
      message: errorContext
        ? `${successSummary}, але частина джерел завершилась з помилками: ${errorContext}`
        : `${successSummary}, але частина джерел завершилась з помилками.`,
    };
  }

  return {
    tone: 'success',
    message: buildDiscoveryRunSuccessSummary(accepted, updated),
  };
}

export function deriveDiscoveryToolbarStatus(discovery) {
  if (!discovery) {
    return {
      label: 'Завантаження',
      tone: 'scheduled',
      detail: 'Завантажуємо статус автоматизації для Signals.',
    };
  }

  const settings = discovery?.settings || {};
  const status = discovery?.status || {};
  const latestRun = status.latestRun || null;

  if (status.running || status.code === 'running') {
    const activeRun = status.activeRun;
    const attempted = Number(activeRun?.attemptedCallCount || 0);
    return {
      label: 'Виконується',
      tone: 'running',
      detail: attempted ? `Зараз обробляємо ${attempted} джерел для Signals.` : 'Автоматичний збір сигналів уже триває.',
    };
  }

  if (!status.tokenConfigured) {
    return {
      label: 'Помилка',
      tone: 'error',
      detail: 'APIFY_TOKEN не налаштований у backend, тому автопошук зараз недоступний.',
    };
  }

  if (settings.enabled === false || status.code === 'paused') {
    return {
      label: 'На паузі',
      tone: 'paused',
      detail: 'Автоматичний збір вимкнений. Можна лишити ручний імпорт або увімкнути розклад.',
    };
  }

  if (status.workerEnabled === false && settings.enabled !== false) {
    return {
      label: 'Помилка',
      tone: 'error',
      detail: 'Фоновий worker вимкнений, тож розклад не запуститься автоматично.',
    };
  }

  if (status.code === 'budget_reached') {
    return {
      label: 'Ліміт вичерпано',
      tone: 'budget',
      detail: 'Денний ліміт на метадані вичерпано до наступної UTC-доби.',
    };
  }

  if (status.code === 'failed' || latestRun?.status === 'failed') {
    return {
      label: 'Помилка',
      tone: 'error',
      detail: getDiscoveryRunErrorContext(latestRun) || 'Останній автоматичний запуск завершився з помилкою.',
    };
  }

  if (status.code === 'partial' || isPartialDiscoveryRun(latestRun)) {
    return {
      label: 'Частково',
      tone: 'warning',
      detail: deriveDiscoveryRunNotice({
        run: latestRun,
        acceptedSignalsCount: latestRun?.acceptedCount,
        updatedSignalsCount: latestRun?.updatedCount,
      }).message,
    };
  }

  return {
    label: 'За розкладом',
    tone: 'scheduled',
    detail: status.nextRunAt
      ? `Наступна автоматична перевірка ${formatDiscoveryTimestamp(status.nextRunAt)}.`
      : 'Розклад увімкнений і чекає на наступне вікно запуску.',
  };
}

export function deriveSignalsEmptyState({
  reelsCount = 0,
  filteredReelsCount = 0,
  hasActiveFilters = false,
  automationEnabled = true,
  canRunAutomation = true,
  query = '',
  sourceFilter = 'all',
  pastedReelUrl = '',
  isLoading = false,
  loadIssue = '',
} = {}) {
  if (reelsCount === 0 && !hasActiveFilters) {
    if (isLoading) {
      return {
        kind: 'loading',
        title: 'Завантажуємо Signals',
        text: 'Підтягуємо статус, розклад і перші сигнали для цього workspace.',
        primaryAction: null,
        secondaryAction: null,
      };
    }

    if (loadIssue) {
      return {
        kind: 'error',
        title: 'Не вдалося оновити Signals',
        text: loadIssue,
        primaryAction: {
          kind: 'retry',
          label: 'Спробувати ще раз',
          disabled: false,
        },
        secondaryAction: {
          kind: 'advanced_import',
          label: 'Розширений імпорт',
        },
      };
    }

    return {
      kind: 'authoritative',
      title: 'Автозбір ще не заповнив банк сигналів',
      text: 'Автоматичний збір сам підтягуватиме нові сигнали з підключених акаунтів і трендів. Запустіть його зараз або увімкніть автопошук, щоб банк поповнювався без ручної рутини.',
      primaryAction: !automationEnabled
        ? {
            kind: 'enable',
            label: 'Увімкнути автозбір',
            disabled: false,
          }
        : canRunAutomation
          ? {
              kind: 'run',
              label: 'Запустити зараз',
              disabled: false,
            }
          : null,
      secondaryAction: {
        kind: 'advanced_import',
        label: 'Розширений імпорт',
      },
    };
  }

  if (filteredReelsCount === 0 && hasActiveFilters) {
    if (pastedReelUrl) {
      return {
        kind: 'filtered',
        title: 'Посилання готове до імпорту',
        text: 'Це схоже на зовнішній сигнал. Натисніть імпорт вище або Enter, і Дзеро спробує витягнути контекст у Studio.',
        primaryAction: null,
        secondaryAction: null,
      };
    }

    if (query) {
      return {
        kind: 'filtered',
        title: 'Нічого не знайшли',
        text: 'Спробуйте інший запит або вставте посилання на TikTok, Reels, YouTube Shorts чи сайт.',
        primaryAction: null,
        secondaryAction: null,
      };
    }

    if (sourceFilter !== 'all') {
      return {
        kind: 'filtered',
        title: 'Тут ще немає сигналів',
        text: 'Зараз ця вкладка порожня. Додайте сигнал вручну або запустіть автозбір, щоб вона наповнилася.',
        primaryAction: null,
        secondaryAction: null,
      };
    }
  }

  return null;
}
