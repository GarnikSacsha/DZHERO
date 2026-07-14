import { createTranslator, getLocaleTag, normalizeLanguage } from './i18nCore.mjs';

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

function formatDiscoveryTimestamp(value, language = 'uk') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(getLocaleTag(language), {
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

function getDiscoveryRunLaneLabel(lane, language = 'uk') {
  const t = createTranslator(language);
  const key = {
    accounts: 'signals.discovery.lane.accounts',
    keywords: 'signals.discovery.lane.keywords',
    hashtags: 'signals.discovery.lane.hashtags',
    trends: 'signals.discovery.lane.trends',
    winner: 'signals.discovery.lane.winner',
  }[lane];
  return key ? t(key) : String(lane || '').trim();
}

function getDiscoveryRunErrorContext(run, language = 'uk') {
  const t = createTranslator(language);
  const [firstError] = getDiscoveryRunErrors(run);
  if (!firstError) return '';

  const locationParts = [];
  const platformLabel = getDiscoveryRunPlatformLabel(firstError.platform);
  const laneLabel = getDiscoveryRunLaneLabel(firstError.lane, language);
  if (platformLabel) locationParts.push(platformLabel);
  if (laneLabel) locationParts.push(laneLabel);

  const prefix = locationParts.length ? `${locationParts.join(' / ')}: ` : '';
  const rawMessage = [firstError.message, firstError.error, firstError.code, firstError.status]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const errorKey = /token|configur|credential/.test(rawMessage)
    ? 'signals.discovery.error.configured'
    : /budget|limit_reached|blocked_budget/.test(rawMessage)
      ? 'signals.discovery.error.budget'
      : /worker/.test(rawMessage)
        ? 'signals.discovery.error.worker'
        : /429|rate|provider|apify|network|timeout/.test(rawMessage)
          ? 'signals.discovery.error.provider'
          : 'signals.discovery.error.unknown';
  const message = t(errorKey);
  const remainingErrors = Math.max(getDiscoveryRunErrorCount(run) - 1, 0);
  const extraText = remainingErrors > 0
    ? ` ${t('signals.discovery.notice.extraErrors', {
        count: formatLocalizedCount(remainingErrors, language, 'помилка', 'помилки', 'помилок', 'error', 'errors'),
      })}`
    : '';

  if (!message) {
    return `${prefix.trim()}${extraText}`.trim();
  }
  return `${prefix}${message}${extraText}`.trim();
}

function formatLocalizedCount(count, language, one, few, many, englishOne, englishMany) {
  const normalizedLanguage = normalizeLanguage(language);
  if (normalizedLanguage === 'en') {
    return `${count} ${count === 1 ? englishOne : englishMany}`;
  }
  return `${count} ${pluralize(count, one, few, many)}`;
}

function buildDiscoveryRunSuccessSummary(acceptedCount, updatedCount, language = 'uk') {
  const t = createTranslator(language);
  const accepted = Math.max(toInt(acceptedCount), 0);
  const updated = Math.max(toInt(updatedCount), 0);

  if (accepted > 0 || updated > 0) {
    const acceptedText = accepted > 0
      ? formatLocalizedCount(accepted, language, 'сигнал', 'сигнали', 'сигналів', 'signal', 'signals')
      : '';
    const updatedText = updated > 0
      ? formatLocalizedCount(updated, language, 'сигнал', 'сигнали', 'сигналів', 'signal', 'signals')
      : '';
    if (accepted > 0 && updated > 0) {
      return t('signals.discovery.notice.addedAndUpdated', { accepted: acceptedText, updated: updatedText });
    }
    return accepted > 0
      ? t('signals.discovery.notice.added', { count: acceptedText })
      : t('signals.discovery.notice.updated', { count: updatedText });
  }

  return t('signals.discovery.notice.noNew');
}

function buildDiscoveryRunFunnelSummary(run = {}, language = 'uk') {
  const t = createTranslator(language);
  if (!run || run.status !== 'completed') return '';
  const accepted = Math.max(toInt(run.acceptedCount), 0);
  if (accepted > 0) return t('signals.discovery.notice.funnelNew');
  return t('signals.discovery.notice.funnelCurrent');
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
  language = 'uk',
} = {}) {
  const t = createTranslator(language);
  const accepted = getDiscoveryRunAcceptedCount(run, acceptedSignalsCount);
  const updated = Math.max(toInt(updatedSignalsCount), 0);
  const errorContext = getDiscoveryRunErrorContext(run, language);

  if (run?.status === 'failed') {
    const parts = [];
    if (accepted > 0) {
      parts.push(formatLocalizedCount(accepted, language, 'сигнал', 'сигнали', 'сигналів', 'signal', 'signals'));
    }
    if (updated > 0) {
      parts.push(formatLocalizedCount(updated, language, 'оновлення', 'оновлення', 'оновлень', 'update', 'updates'));
    }
    if (parts.length) {
      return {
        tone: 'error',
        message: t('signals.discovery.notice.failedAfter', {
          parts: parts.join(normalizeLanguage(language) === 'en' ? ' and ' : ' і '),
        }),
      };
    }
    return {
      tone: 'error',
      message: errorContext
        ? t('signals.discovery.notice.failedWithContext', { context: errorContext })
        : t('signals.discovery.notice.failed'),
    };
  }

  if (isPartialDiscoveryRun(run)) {
    const successSummary = buildDiscoveryRunSuccessSummary(accepted, updated, language).replace(/\.$/, '');
    return {
      tone: 'warning',
      message: errorContext
        ? t('signals.discovery.notice.partialWithContext', { summary: successSummary, context: errorContext })
        : t('signals.discovery.notice.partial', { summary: successSummary }),
    };
  }

  return {
    tone: 'success',
    message: buildDiscoveryRunSuccessSummary(accepted, updated, language),
  };
}

export function deriveDiscoveryToolbarStatus(discovery, { language = 'uk' } = {}) {
  const t = createTranslator(language);
  if (!discovery) {
    return {
      label: t('signals.discovery.status.loading'),
      tone: 'scheduled',
      detail: t('signals.discovery.status.loadingDetail'),
    };
  }

  const settings = discovery?.settings || {};
  const status = discovery?.status || {};
  const latestRun = status.latestRun || null;

  if (status.running || status.code === 'running') {
    const activeRun = status.activeRun;
    const attempted = Number(activeRun?.attemptedCallCount || 0);
    const accepted = Number(activeRun?.acceptedCount || 0);
    const progressParts = [
      attempted ? t('signals.discovery.status.runningSources') : '',
      accepted ? t('signals.discovery.status.runningSignals') : '',
    ].filter(Boolean);
    return {
      label: t('signals.discovery.status.running'),
      tone: 'running',
      detail: progressParts.length
        ? t('signals.discovery.status.runningDetail', { progress: progressParts.join(' · ') })
        : t('signals.discovery.status.runningFallback'),
    };
  }

  if (!status.tokenConfigured) {
    return {
      label: t('signals.discovery.status.error'),
      tone: 'error',
      detail: t('signals.discovery.status.tokenDetail'),
    };
  }

  if (settings.enabled === false || status.code === 'paused') {
    return {
      label: t('signals.discovery.status.paused'),
      tone: 'paused',
      detail: t('signals.discovery.status.pausedDetail'),
    };
  }

  if (status.workerEnabled === false && settings.enabled !== false) {
    return {
      label: t('signals.discovery.status.error'),
      tone: 'error',
      detail: t('signals.discovery.status.workerDetail'),
    };
  }

  if (status.code === 'budget_reached') {
    return {
      label: t('signals.discovery.status.budget'),
      tone: 'budget',
      detail: t('signals.discovery.status.budgetDetail'),
    };
  }

  if (status.code === 'failed' || latestRun?.status === 'failed') {
    return {
      label: t('signals.discovery.status.error'),
      tone: 'error',
      detail: getDiscoveryRunErrorContext(latestRun, language) || t('signals.discovery.status.failedDetail'),
    };
  }

  if (status.code === 'partial' || isPartialDiscoveryRun(latestRun)) {
    return {
      label: t('signals.discovery.status.partial'),
      tone: 'warning',
      detail: deriveDiscoveryRunNotice({
        run: latestRun,
        acceptedSignalsCount: latestRun?.acceptedCount,
        updatedSignalsCount: latestRun?.updatedCount,
        language,
      }).message,
    };
  }

  const latestRunFunnel = buildDiscoveryRunFunnelSummary(latestRun, language);
  if (latestRunFunnel) {
    return {
      label: t('signals.discovery.status.scheduled'),
      tone: 'scheduled',
      detail: latestRunFunnel,
    };
  }

  return {
    label: t('signals.discovery.status.scheduled'),
    tone: 'scheduled',
    detail: status.nextRunAt
      ? t('signals.discovery.status.nextRun', { timestamp: formatDiscoveryTimestamp(status.nextRunAt, language) })
      : t('signals.discovery.status.waiting'),
  };
}

export function canRunDiscoveryNow(discovery, { busy = false } = {}) {
  if (!discovery || busy) return false;
  const settings = discovery.settings || {};
  const status = discovery.status || {};
  if (settings.enabled === false || status.running || status.canRunNow !== true) return false;

  const spent = Number(status.dailySpendUsd);
  const budget = Number(status.dailyBudgetUsd ?? settings.dailyBudgetUsd);
  const remaining = Number(status.remainingBudgetUsd);
  if (Number.isFinite(remaining) && remaining <= 0) return false;
  if (Number.isFinite(spent) && Number.isFinite(budget) && spent >= budget) return false;
  return true;
}

export function deriveDiscoveryRunNowLabel(discovery, { busy = false, language = 'uk' } = {}) {
  const t = createTranslator(language);
  const status = discovery?.status || {};
  if (busy || status.running) return t('signals.actions.running');
  if (status.code === 'budget_reached' && !canRunDiscoveryNow(discovery)) {
    return t('signals.actions.budgetReached');
  }
  return t('signals.actions.runNow');
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
  language = 'uk',
} = {}) {
  const t = createTranslator(language);
  if (reelsCount === 0 && !hasActiveFilters) {
    if (isLoading) {
      return {
        kind: 'loading',
        title: t('signals.empty.loadingTitle'),
        text: t('signals.empty.loadingText'),
        primaryAction: null,
        secondaryAction: null,
      };
    }

    if (loadIssue) {
      return {
        kind: 'error',
        title: t('signals.empty.errorTitle'),
        text: t('signals.discovery.status.failedDetail'),
        primaryAction: {
          kind: 'retry',
          label: t('signals.actions.retry'),
          disabled: false,
        },
        secondaryAction: {
          kind: 'advanced_import',
          label: t('signals.actions.advancedImport'),
        },
      };
    }

    return {
      kind: 'authoritative',
      title: t('signals.empty.authoritativeTitle'),
      text: t('signals.empty.authoritativeText'),
      primaryAction: !automationEnabled
        ? {
            kind: 'enable',
            label: t('signals.actions.enableAutomation'),
            disabled: false,
          }
        : canRunAutomation
          ? {
              kind: 'run',
              label: t('signals.actions.runNow'),
              disabled: false,
            }
          : null,
      secondaryAction: {
        kind: 'advanced_import',
        label: t('signals.actions.advancedImport'),
      },
    };
  }

  if (filteredReelsCount === 0 && hasActiveFilters) {
    if (pastedReelUrl) {
      return {
        kind: 'filtered',
        title: t('signals.empty.linkTitle'),
        text: t('signals.empty.linkText'),
        primaryAction: null,
        secondaryAction: null,
      };
    }

    if (query) {
      return {
        kind: 'filtered',
        title: t('signals.empty.searchTitle'),
        text: t('signals.empty.searchText'),
        primaryAction: null,
        secondaryAction: null,
      };
    }

    if (sourceFilter !== 'all') {
      return {
        kind: 'filtered',
        title: t('signals.empty.sourceTitle'),
        text: t('signals.empty.sourceText'),
        primaryAction: null,
        secondaryAction: null,
      };
    }
  }

  return null;
}
