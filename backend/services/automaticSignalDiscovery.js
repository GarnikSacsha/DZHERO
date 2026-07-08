const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ACCOUNT_INTERVAL_MS = 6 * HOUR_MS;
const DISCOVERY_INTERVAL_MS = 12 * HOUR_MS;
const MAX_INPUTS_PER_LANE = 10;
const DEFAULT_DAILY_BUDGET_USD = 0.8;
const DEFAULT_VIRAL_SCORE_THRESHOLD = 70;

const DEFAULT_LANES = ['accounts', 'keywords', 'hashtags', 'trends'];
const PLATFORM_NAMES = ['instagram', 'tiktok'];
const LANE_INTERVALS = {
  accounts: ACCOUNT_INTERVAL_MS,
  keywords: DISCOVERY_INTERVAL_MS,
  hashtags: DISCOVERY_INTERVAL_MS,
  trends: DISCOVERY_INTERVAL_MS,
};

function toDate(value, fallback = null) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || fallback || Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date(fallback || Date.now());
}

function toUtcDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function roundUsd(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeHandle(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    const instagramMatch = raw.match(/instagram\.com\/([^/?#]+)/i);
    if (instagramMatch?.[1]) return `@${instagramMatch[1].replace(/^@/, '')}`.toLowerCase();
    const tiktokMatch = raw.match(/tiktok\.com\/@([^/?#]+)/i);
    if (tiktokMatch?.[1]) return `@${tiktokMatch[1].replace(/^@/, '')}`.toLowerCase();
  }
  return raw.startsWith('@') ? raw.toLowerCase() : `@${raw.replace(/^@/, '').toLowerCase()}`;
}

function slugForHashtag(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF]+/giu, '');
}

function uniqueValues(values, limit = MAX_INPUTS_PER_LANE) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function getWorkspace(state = {}, workspaceId) {
  return Array.isArray(state.workspaces)
    ? state.workspaces.find((workspace) => workspace && workspace.id === workspaceId)
    : null;
}

function getReelIdentifiers(reel = {}) {
  return [
    reel.id,
    reel.sourceHandle,
    reel.handle,
    reel.sourceUrl,
    reel.importedMetadata?.externalId,
    reel.importedMetadata?.shortCode,
    reel.importedMetadata?.tiktokVideoId,
    reel.importedMetadata?.url,
    reel.importedMetadata?.handle,
  ]
    .map((value) => normalizeLower(value))
    .filter(Boolean);
}

function collectExistingReelKeys(state = {}, workspaceId) {
  const keys = new Set();
  for (const reel of Array.isArray(state.reels) ? state.reels : []) {
    if (reel?.workspaceId !== workspaceId) continue;
    for (const key of getReelIdentifiers(reel)) {
      keys.add(key);
    }
  }
  return keys;
}

function collectAccountCandidates(state = {}, workspaceId, existingKeys) {
  const candidates = [];
  for (const source of Array.isArray(state.sources) ? state.sources : []) {
    if (source?.workspaceId !== workspaceId) continue;
    const handle = source.handle || source.username || source.sourceHandle || source.url || '';
    const normalized = normalizeHandle(handle);
    if (normalized && !existingKeys.has(normalized)) {
      candidates.push(normalized);
    }
  }
  for (const competitor of Array.isArray(state.competitors) ? state.competitors : []) {
    if (competitor?.workspaceId !== workspaceId) continue;
    const normalized = normalizeHandle(competitor.handle || competitor.username || competitor.url || '');
    if (normalized && !existingKeys.has(normalized)) {
      candidates.push(normalized);
    }
  }
  return uniqueValues(candidates);
}

function collectKeywordCandidates(workspace = {}, state = {}, workspaceId) {
  const brief = workspace.brief || {};
  const values = [
    brief.businessType,
    brief.niche,
    brief.product,
    brief.location,
    brief.contentFocus,
    brief.toneOfVoice,
    ...(Array.isArray(brief.goals) ? brief.goals : []),
    ...(Array.isArray(workspace.marketFocus) ? workspace.marketFocus : []),
  ];

  for (const source of Array.isArray(state.sources) ? state.sources : []) {
    if (source?.workspaceId !== workspaceId) continue;
    values.push(source.label, source.type);
  }

  for (const competitor of Array.isArray(state.competitors) ? state.competitors : []) {
    if (competitor?.workspaceId !== workspaceId) continue;
    values.push(competitor.niche, competitor.market, competitor.handle);
  }

  return uniqueValues(values.map((value) => normalizeText(value).toLowerCase()), MAX_INPUTS_PER_LANE);
}

function collectHashtagCandidates(workspace = {}, state = {}, workspaceId) {
  const brief = workspace.brief || {};
  const values = [
    brief.businessType,
    brief.niche,
    brief.product,
    brief.location,
    brief.contentFocus,
    ...(Array.isArray(brief.goals) ? brief.goals : []),
  ];

  for (const source of Array.isArray(state.sources) ? state.sources : []) {
    if (source?.workspaceId !== workspaceId) continue;
    values.push(source.label);
  }

  for (const competitor of Array.isArray(state.competitors) ? state.competitors : []) {
    if (competitor?.workspaceId !== workspaceId) continue;
    values.push(competitor.niche, competitor.market);
  }

  return uniqueValues(
    values
      .map((value) => slugForHashtag(value))
      .filter(Boolean)
      .map((value) => `#${value}`),
    MAX_INPUTS_PER_LANE
  );
}

function buildTrendCandidates(platform, workspace = {}) {
  const brief = workspace.brief || {};
  const businessType = normalizeText(brief.businessType || 'business').toLowerCase();
  const niche = normalizeText(brief.niche || brief.businessType || 'niche').toLowerCase();
  const product = normalizeText(brief.product || brief.contentFocus || 'content').toLowerCase();
  const location = normalizeText(brief.location || 'global').toLowerCase();
  const goal = normalizeText(Array.isArray(brief.goals) ? brief.goals[0] : '').toLowerCase();

  return uniqueValues([
    `${platform} ${businessType} trends`,
    `${platform} ${niche} hooks`,
    `${platform} ${product} ideas`,
    `${location} ${businessType} examples`,
    `${product} before after`,
    `${goal || 'lead generation'} content`,
    `${niche} mistakes to avoid`,
    `${businessType} creator trends`,
  ]);
}

function defaultDiscoverySettings(now = new Date()) {
  const base = toDate(now);
  return {
    enabled: true,
    dailyBudgetUsd: DEFAULT_DAILY_BUDGET_USD,
    viralScoreThreshold: DEFAULT_VIRAL_SCORE_THRESHOLD,
    accountIntervalMs: ACCOUNT_INTERVAL_MS,
    discoveryIntervalMs: DISCOVERY_INTERVAL_MS,
    laneIntervalsMs: { ...LANE_INTERVALS },
    platforms: [...PLATFORM_NAMES],
    lastRunAt: {
      accounts: null,
      keywords: null,
      hashtags: null,
      trends: null,
    },
    nextRunAt: {
      accounts: new Date(base.getTime() + ACCOUNT_INTERVAL_MS).toISOString(),
      keywords: new Date(base.getTime() + DISCOVERY_INTERVAL_MS).toISOString(),
      hashtags: new Date(base.getTime() + DISCOVERY_INTERVAL_MS).toISOString(),
      trends: new Date(base.getTime() + DISCOVERY_INTERVAL_MS).toISOString(),
    },
    updatedAt: base.toISOString(),
  };
}

function buildDiscoveryInputs(state = {}, workspaceId) {
  const workspace = getWorkspace(state, workspaceId) || {};
  const existingKeys = collectExistingReelKeys(state, workspaceId);
  const accounts = collectAccountCandidates(state, workspaceId, existingKeys);
  const keywords = collectKeywordCandidates(workspace, state, workspaceId);
  const hashtags = collectHashtagCandidates(workspace, state, workspaceId);

  return {
    instagram: {
      accounts: [...accounts],
      keywords: [...keywords],
      hashtags: [...hashtags],
      trends: buildTrendCandidates('instagram', workspace),
    },
    tiktok: {
      accounts: [...accounts],
      keywords: [...keywords],
      hashtags: [...hashtags],
      trends: buildTrendCandidates('tiktok', workspace),
    },
  };
}

function isDiscoveryDue(settings = {}, lane, now = new Date()) {
  if (!settings || settings.enabled === false) return false;
  const intervalMs = settings.laneIntervalsMs?.[lane] || LANE_INTERVALS[lane];
  if (!intervalMs) return false;
  const currentTime = toDate(now).getTime();
  const scheduledTime = settings.nextRunAt?.[lane];
  if (scheduledTime) {
    return currentTime >= toDate(scheduledTime).getTime();
  }
  const lastRunAt = settings.lastRunAt?.[lane];
  if (!lastRunAt) return true;
  return currentTime - toDate(lastRunAt).getTime() >= intervalMs;
}

function getDailyAutomaticSpend(runs = [], workspaceId, now = new Date()) {
  const dayKey = toUtcDayKey(now);
  let total = 0;
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || run.workspaceId !== workspaceId) continue;
    const runDayKey = toUtcDayKey(run.claimedAt || run.startedAt || run.createdAt || run.completedAt);
    if (!runDayKey) continue;
    if (runDayKey !== dayKey) continue;
    const amount = Number(run.actualCostUsd ?? run.estimatedCostUsd ?? 0);
    if (Number.isFinite(amount) && amount > 0) {
      total += amount;
    }
  }
  return roundUsd(total);
}

function canStartDiscoveryRun(args = {}) {
  const spentUsd = Number(args.spentUsd || 0);
  const estimatedUsd = Number(args.estimatedUsd || 0);
  const budgetUsd = Number(args.budgetUsd || 0);
  return spentUsd + estimatedUsd <= budgetUsd;
}

function createRunId(prefix = 'discovery_run') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function claimDiscoveryRun(state = {}, args = {}) {
  const workspaceId = String(args.workspaceId || '').trim();
  const lane = String(args.lane || '').trim();
  if (!workspaceId || !lane) return null;
  const runs = Array.isArray(state.discoveryRuns) ? state.discoveryRuns : (state.discoveryRuns = []);
  const activeConflict = runs.some((run) => (
    run
    && run.workspaceId === workspaceId
    && run.lane === lane
    && run.status === 'running'
  ));
  if (activeConflict) return null;

  const now = toDate(args.now || new Date());
  const run = {
    id: createRunId(),
    workspaceId,
    lane,
    dayKey: toUtcDayKey(now),
    status: 'running',
    estimatedCostUsd: roundUsd(args.estimatedCostUsd || 0),
    actualCostUsd: 0,
    claimedAt: now.toISOString(),
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  runs.unshift(run);
  return run;
}

module.exports = {
  defaultDiscoverySettings,
  buildDiscoveryInputs,
  isDiscoveryDue,
  getDailyAutomaticSpend,
  canStartDiscoveryRun,
  claimDiscoveryRun,
};
