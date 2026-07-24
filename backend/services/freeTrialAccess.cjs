const FREE_TRIAL_AI_GRANT_VERSION = '2026-07-24-public-beta-ai-v1';
const FREE_TRIAL_AI_WINDOW_MS = 72 * 60 * 60 * 1000;

function isPendingFreeTrialAiActivation(subscription = {}) {
  return subscription.planId === 'trial'
    && (
      subscription.aiTrialGrantVersion !== FREE_TRIAL_AI_GRANT_VERSION
      || !subscription.aiTrialStartedAt
    );
}

function activateFreeTrialAiWindow(subscription, { now = new Date(), eligible = false } = {}) {
  if (!eligible || !isPendingFreeTrialAiActivation(subscription)) return false;

  const startedAt = new Date(now).toISOString();
  const endsAt = new Date(new Date(now).getTime() + FREE_TRIAL_AI_WINDOW_MS).toISOString();
  subscription.aiTrialGrantVersion = FREE_TRIAL_AI_GRANT_VERSION;
  subscription.aiTrialStartedAt = startedAt;
  subscription.trialEndsAt = endsAt;
  subscription.currentPeriodStart = startedAt;
  subscription.currentPeriodEnd = endsAt;
  subscription.updatedAt = startedAt;
  return true;
}

function buildFreeTrialState(subscription = {}, { hasTrialPlanAccess = false, now = new Date() } = {}) {
  if (!hasTrialPlanAccess) {
    return {
      pendingActivation: false,
      active: false,
      expired: false,
      endsAt: subscription.trialEndsAt || null,
      daysRemaining: null,
    };
  }

  if (isPendingFreeTrialAiActivation(subscription)) {
    return {
      pendingActivation: true,
      active: false,
      expired: false,
      endsAt: null,
      daysRemaining: 3,
    };
  }

  const nowMs = new Date(now).getTime();
  const endsAtMs = subscription.trialEndsAt ? Date.parse(subscription.trialEndsAt) : NaN;
  const hasValidEnd = Number.isFinite(endsAtMs);
  return {
    pendingActivation: false,
    active: hasValidEnd && endsAtMs > nowMs,
    expired: !hasValidEnd || endsAtMs <= nowMs,
    endsAt: subscription.trialEndsAt || null,
    daysRemaining: hasValidEnd
      ? Math.max(0, Math.ceil((endsAtMs - nowMs) / (24 * 60 * 60 * 1000)))
      : null,
  };
}

module.exports = {
  FREE_TRIAL_AI_GRANT_VERSION,
  FREE_TRIAL_AI_WINDOW_MS,
  isPendingFreeTrialAiActivation,
  activateFreeTrialAiWindow,
  buildFreeTrialState,
};
