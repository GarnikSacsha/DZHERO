const { releaseUsageCounter, reserveUsageCounter } = require('./paidUsage.cjs');

const KYIV_TIMEZONE = 'Europe/Kyiv';

const TRIAL_DAILY_LIMITS = Object.freeze({
  remix: 5,
  agentChat: 100,
  providerAttempts: 250,
});

const ACTIONS = Object.freeze({
  remix: {
    metric: 'trial_remix_daily',
    limit: TRIAL_DAILY_LIMITS.remix,
    error: 'daily_remix_limit_reached',
  },
  agentChat: {
    metric: 'trial_agent_chat_daily',
    limit: TRIAL_DAILY_LIMITS.agentChat,
    error: 'daily_agent_chat_limit_reached',
  },
});

const kyivDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KYIV_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const kyivDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: KYIV_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function readParts(formatter, value) {
  return Object.fromEntries(formatter.formatToParts(value)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
}

function getKyivDayKey(now = new Date()) {
  const parts = readParts(kyivDateFormatter, new Date(now));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getKyivOffsetMs(now) {
  const instant = new Date(now);
  const parts = readParts(kyivDateTimeFormatter, instant);
  const zonedWallTime = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return zonedWallTime - instant.getTime();
}

function getNextKyivResetAt(now = new Date()) {
  const parts = readParts(kyivDateFormatter, new Date(now));
  const nextDay = new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day) + 1,
  ));
  const target = nextDay.getTime();
  let candidate = new Date(target);

  for (let index = 0; index < 3; index += 1) {
    const corrected = new Date(target - getKyivOffsetMs(candidate));
    if (corrected.getTime() === candidate.getTime()) return corrected;
    candidate = corrected;
  }
  return candidate;
}

function isDailyTrialAccess({ planId, unlimited = false, accessSource, testerAccessActive = false } = {}) {
  return planId === 'trial'
    && !unlimited
    && !testerAccessActive
    && accessSource !== 'tester_grant';
}

function getCounterValue(db, workspaceId, metric, period) {
  const counter = (db.usageCounters || []).find((item) => (
    item.workspaceId === workspaceId
    && item.metric === metric
    && item.period === period
  ));
  return Math.max(0, Number(counter?.value || 0));
}

function buildDailyTrialSnapshot(db, options = {}) {
  const now = new Date(options.now || new Date());
  const period = getKyivDayKey(now);
  const resetsAt = getNextKyivResetAt(now).toISOString();
  const bounded = isDailyTrialAccess(options);
  const actionSnapshot = (action) => {
    if (!bounded) return { limit: null, used: 0, remaining: null };
    const descriptor = ACTIONS[action];
    const used = getCounterValue(db, options.workspaceId, descriptor.metric, period);
    return {
      limit: descriptor.limit,
      used,
      remaining: Math.max(0, descriptor.limit - used),
    };
  };

  return {
    timezone: KYIV_TIMEZONE,
    period,
    resetsAt,
    remix: actionSnapshot('remix'),
    agentChat: actionSnapshot('agentChat'),
  };
}

function reserveDailyTrialAction(db, options = {}) {
  const descriptor = ACTIONS[options.action];
  if (!descriptor) throw new Error(`unsupported_daily_trial_action:${options.action}`);
  if (!isDailyTrialAccess(options)) return null;

  const now = new Date(options.now || new Date());
  const period = getKyivDayKey(now);
  const resetsAt = getNextKyivResetAt(now).toISOString();
  const amount = Math.max(1, Math.trunc(Number(options.amount || 1)));
  try {
    reserveUsageCounter(db, {
      workspaceId: options.workspaceId,
      metric: descriptor.metric,
      period,
      amount,
      limit: descriptor.limit,
      now,
    });
  } catch (error) {
    if (error?.payload?.error !== 'plan_limit_reached') throw error;
    const quotaError = new Error(descriptor.error);
    quotaError.status = error.status;
    quotaError.payload = {
      ...error.payload,
      error: descriptor.error,
      limit: descriptor.limit,
      used: Number(error.payload.used || 0),
      remaining: Math.max(0, descriptor.limit - Number(error.payload.used || 0)),
      period,
      resetsAt,
    };
    throw quotaError;
  }

  return {
    workspaceId: options.workspaceId,
    action: options.action,
    metric: descriptor.metric,
    period,
    amount,
  };
}

function releaseDailyTrialAction(db, reservation, options = {}) {
  if (!reservation) return null;
  return releaseUsageCounter(db, {
    workspaceId: reservation.workspaceId,
    metric: reservation.metric,
    period: reservation.period,
    amount: reservation.amount,
    now: options.now || new Date(),
  });
}

function resolveProviderAttemptBudget(entitlements = {}, now = new Date()) {
  const planId = entitlements.plan?.id || entitlements.planId;
  const isTrial = isDailyTrialAccess({
    planId,
    unlimited: entitlements.unlimited,
    accessSource: entitlements.accessSource,
    testerAccessActive: entitlements.testerAccessActive,
  });
  if (isTrial) {
    return {
      metric: 'trial_provider_attempts_daily',
      limit: TRIAL_DAILY_LIMITS.providerAttempts,
      period: getKyivDayKey(now),
      unlimited: false,
    };
  }

  return {
    metric: 'ai_operations',
    limit: entitlements.plan?.limits?.aiOperations,
    period: entitlements.period,
    unlimited: Boolean(entitlements.unlimited),
  };
}

module.exports = {
  TRIAL_DAILY_LIMITS,
  buildDailyTrialSnapshot,
  getKyivDayKey,
  getNextKyivResetAt,
  releaseDailyTrialAction,
  reserveDailyTrialAction,
  resolveProviderAttemptBudget,
};
