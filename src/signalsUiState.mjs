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

export function deriveDiscoveryRunStatusCode(run, settings = {}, fallbackCode = '') {
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
  const accepted = Math.max(toInt(acceptedSignalsCount), 0);
  const updated = Math.max(toInt(updatedSignalsCount), 0);

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
      message: run?.errors?.[0]?.message
        ? `Автопошук завершився з помилкою: ${run.errors[0].message}`
        : 'Автопошук завершився з помилкою.',
    };
  }

  if (accepted > 0 || updated > 0) {
    const acceptedText = accepted > 0
      ? `${accepted} ${pluralize(accepted, 'сигнал', 'сигнали', 'сигналів')}`
      : '';
    const updatedText = updated > 0
      ? `${updated} ${pluralize(updated, 'сигнал', 'сигнали', 'сигналів')}`
      : '';
    return {
      tone: 'success',
      message: `Автопошук ${accepted > 0 ? `додав ${acceptedText}` : ''}${accepted > 0 && updated > 0 ? ' і ' : ''}${updated > 0 ? `оновив ${updatedText}` : ''}.`,
    };
  }

  return {
    tone: 'success',
    message: 'Автопошук завершився без нових сигналів.',
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
      detail: latestRun?.errors?.[0]?.message || 'Останній автоматичний запуск завершився з помилкою.',
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
