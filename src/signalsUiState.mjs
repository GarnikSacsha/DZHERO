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
    const body = [acceptedText, updatedText].filter(Boolean).join(acceptedText && updatedText ? ' і ' : '');
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

export function deriveSignalsEmptyState({
  reelsCount = 0,
  filteredReelsCount = 0,
  hasActiveFilters = false,
  automationEnabled = true,
  canRunAutomation = true,
  query = '',
  sourceFilter = 'all',
  pastedReelUrl = '',
} = {}) {
  if (reelsCount === 0 && !hasActiveFilters) {
    return {
      kind: 'authoritative',
      title: 'Автозбір ще не заповнив банк сигналів',
      text: 'Автоматичний збір сам підтягує нові сигнали з підключених акаунтів і трендів. Запустіть його зараз або увімкніть автопошук, щоб банк поповнювався без ручної рутини.',
      primaryAction: automationEnabled
        ? {
            kind: 'run',
            label: 'Запустити зараз',
            disabled: !canRunAutomation,
          }
        : {
            kind: 'enable',
            label: 'Увімкнути автозбір',
            disabled: false,
          },
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
