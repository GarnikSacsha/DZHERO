function reserveUsageCounter(db, {
  workspaceId,
  metric,
  period,
  amount = 1,
  limit,
  unlimited = false,
  now = new Date(),
}) {
  db.usageCounters ||= [];
  let counter = db.usageCounters.find((item) => (
    item.workspaceId === workspaceId
    && item.metric === metric
    && item.period === period
  ));
  if (!counter) {
    counter = {
      workspaceId,
      metric,
      period,
      value: 0,
      createdAt: new Date(now).toISOString(),
    };
    db.usageCounters.unshift(counter);
  }

  const units = Math.max(1, Math.trunc(Number(amount || 1)));
  if (!unlimited && Number.isFinite(limit) && counter.value + units > limit) {
    const error = new Error('plan_limit_reached');
    error.status = 402;
    error.payload = {
      error: 'plan_limit_reached',
      usageKey: metric,
      limit,
      used: counter.value,
      remaining: Math.max(0, limit - counter.value),
    };
    throw error;
  }

  counter.value += units;
  counter.updatedAt = new Date(now).toISOString();
  return counter;
}

function releaseUsageCounter(db, {
  workspaceId,
  metric,
  period,
  amount = 1,
  now = new Date(),
}) {
  const counter = (db.usageCounters || []).find((item) => (
    item.workspaceId === workspaceId
    && item.metric === metric
    && item.period === period
  ));
  if (!counter) return null;
  const units = Math.max(1, Math.trunc(Number(amount || 1)));
  counter.value = Math.max(0, Number(counter.value || 0) - units);
  counter.updatedAt = new Date(now).toISOString();
  return counter;
}

module.exports = { releaseUsageCounter, reserveUsageCounter };
