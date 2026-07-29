export const MINIMUM_SIGNAL_COMPARABLES = 3;

const METRIC_KEYS = Object.freeze([
  'viewsValue',
  'likesValue',
  'commentsValue',
  'sharesValue',
  'savesValue',
  'viewVelocity',
]);

function finiteMetric(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function getSignalAgeBucket(ageHours) {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 'unknown';
  if (ageHours <= 6) return 'launch';
  if (ageHours <= 24) return 'day';
  if (ageHours <= 72) return 'early';
  return 'mature';
}

export function selectSignalComparables(signal, candidates = []) {
  const platform = String(signal?.platformId || '').toLowerCase();
  const ageBucket = getSignalAgeBucket(signal?.ageHours);
  if (!platform || ageBucket === 'unknown') {
    return { scope: 'none', comparables: [], platform, ageBucket };
  }

  const normalizedCandidates = candidates.filter((candidate) => (
    candidate?.id !== signal?.id
    && String(candidate?.platformId || '').toLowerCase() === platform
    && getSignalAgeBucket(candidate?.ageHours) === ageBucket
  ));
  const creatorComparables = signal?.creatorId
    ? normalizedCandidates.filter((candidate) => candidate.creatorId === signal.creatorId)
    : [];

  if (creatorComparables.length >= MINIMUM_SIGNAL_COMPARABLES) {
    return { scope: 'creator', comparables: creatorComparables, platform, ageBucket };
  }

  const cohortComparables = signal?.niche
    ? normalizedCandidates.filter((candidate) => candidate.niche === signal.niche)
    : [];
  if (cohortComparables.length >= MINIMUM_SIGNAL_COMPARABLES) {
    return { scope: 'cohort', comparables: cohortComparables, platform, ageBucket };
  }

  const bestAvailable = creatorComparables.length >= cohortComparables.length
    ? creatorComparables
    : cohortComparables;
  return { scope: 'insufficient', comparables: bestAvailable, platform, ageBucket };
}

export function buildSignalStrengthEvidence(signal, candidates = []) {
  const comparison = selectSignalComparables(signal, candidates);
  const medians = Object.fromEntries(METRIC_KEYS.map((key) => [
    key,
    median(comparison.comparables.map((candidate) => finiteMetric(candidate[key]))),
  ]));
  const lifts = Object.fromEntries(METRIC_KEYS.map((key) => {
    const current = finiteMetric(signal?.[key]);
    const baseline = medians[key];
    return [key, current !== null && baseline !== null && baseline > 0 ? current / baseline : null];
  }));
  const availableMetrics = METRIC_KEYS.filter((key) => finiteMetric(signal?.[key]) !== null);
  const hasReach = lifts.viewsValue !== null;
  const hasVelocity = lifts.viewVelocity !== null;
  const hasIntent = ['commentsValue', 'sharesValue', 'savesValue'].some((key) => lifts[key] !== null);
  const ready = comparison.comparables.length >= MINIMUM_SIGNAL_COMPARABLES
    && hasReach
    && hasVelocity
    && hasIntent;

  return {
    status: ready ? 'ready' : 'insufficient',
    confidence: ready
      ? comparison.comparables.length >= 8 ? 'high' : comparison.comparables.length >= 5 ? 'medium' : 'low'
      : 'none',
    scope: comparison.scope,
    platform: comparison.platform,
    ageBucket: comparison.ageBucket,
    comparableCount: comparison.comparables.length,
    requiredComparables: MINIMUM_SIGNAL_COMPARABLES,
    availableMetrics,
    medians,
    lifts,
    missing: [
      ...(!hasReach ? ['reachBaseline'] : []),
      ...(!hasVelocity ? ['velocityBaseline'] : []),
      ...(!hasIntent ? ['intentBaseline'] : []),
    ],
  };
}
