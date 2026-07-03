function getAllowedBatchSize({ requested, limit, used = 0, unlimited = false }) {
  const requestedCount = Math.max(1, Number(requested || 1));
  if (unlimited || !Number.isFinite(limit)) return requestedCount;
  const remaining = Math.max(0, Number(limit || 0) - Number(used || 0));
  return Math.min(requestedCount, remaining);
}

module.exports = {
  getAllowedBatchSize,
};
