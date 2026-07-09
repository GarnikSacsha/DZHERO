const {
  buildScore,
  fetchApifySignals,
  getApifySignalKey,
} = require('./apifySignalProvider');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ACCOUNT_INTERVAL_MS = 6 * HOUR_MS;
const DISCOVERY_INTERVAL_MS = 12 * HOUR_MS;
const MAX_INPUTS_PER_LANE = 10;
const MAX_DAILY_BUDGET_USD = 0.8;
const DEFAULT_DAILY_BUDGET_USD = 0.8;
const DEFAULT_VIRAL_SCORE_THRESHOLD = 70;
const AUTOMATIC_FALLBACK_SCORE_THRESHOLD = 55;
const AUTOMATIC_RUN_LANE = 'automatic';
const AUTOMATIC_INPUTS_PER_LANE = 3;
const AUTOMATIC_METADATA_LIMIT = 8;
const AUTOMATIC_DOWNLOAD_LIMIT = 1;
const AUTOMATIC_MAX_WINNERS = 20;
const STALE_RUNNING_LEASE_MS = 30 * 60 * 1000;
const FAILURE_RETRY_BASE_MS = 30 * 60 * 1000;
const FAILURE_RETRY_CAP_MS = 6 * HOUR_MS;

const DEFAULT_LANES = ['accounts', 'keywords', 'hashtags', 'trends'];
const PLATFORM_NAMES = ['instagram', 'tiktok'];
const LANE_INTERVALS = {
  accounts: ACCOUNT_INTERVAL_MS,
  keywords: DISCOVERY_INTERVAL_MS,
  hashtags: DISCOVERY_INTERVAL_MS,
  trends: DISCOVERY_INTERVAL_MS,
};
const INPUT_TYPE_BY_LANE = {
  accounts: 'profile',
  keywords: 'search',
  hashtags: 'hashtag',
  trends: 'search',
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

function clampNumber(value, min, max, fallback = min) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function clampBudgetUsd(value, { min = 0, fallback = DEFAULT_DAILY_BUDGET_USD } = {}) {
  return clampNumber(value, min, MAX_DAILY_BUDGET_USD, fallback);
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function canonicalizeSignalUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.search = '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return raw.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

function normalizeHandle(value, platform = '') {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    const instagramMatch = raw.match(/instagram\.com\/([^/?#]+)/i);
    if (instagramMatch?.[1] && (!platform || platform === 'instagram')) {
      return `@${instagramMatch[1].replace(/^@/, '')}`.toLowerCase();
    }
    const tiktokMatch = raw.match(/tiktok\.com\/@([^/?#]+)/i);
    if (tiktokMatch?.[1] && (!platform || platform === 'tiktok')) {
      return `@${tiktokMatch[1].replace(/^@/, '')}`.toLowerCase();
    }
    return '';
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

function rotateValues(values, offset = 0, limit = MAX_INPUTS_PER_LANE) {
  const unique = uniqueValues(values, Number.MAX_SAFE_INTEGER);
  if (!unique.length) return [];
  const start = Math.max(0, Math.trunc(Number(offset) || 0)) % unique.length;
  const rotated = [...unique.slice(start), ...unique.slice(0, start)];
  return rotated.slice(0, Math.max(0, limit));
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

function inferSocialPlatform(item = {}) {
  const labels = [item.platform, item.type, item.provider, item.sourceType]
    .map((value) => normalizeLower(value))
    .filter(Boolean);
  if (labels.some((value) => value.includes('instagram'))) return 'instagram';
  if (labels.some((value) => value.includes('tiktok'))) return 'tiktok';
  const url = normalizeLower(item.url || item.profileUrl || item.profileDeepLink || item.handle);
  if (url.includes('instagram.com/')) return 'instagram';
  if (url.includes('tiktok.com/')) return 'tiktok';
  return '';
}

function getAccountHandle(item = {}, platform = '') {
  const value = platform === 'instagram'
    ? item.username || item.handle || item.profileUrl || item.url
    : item.username || item.handle || item.profileDeepLink || item.profileUrl || item.url;
  return normalizeHandle(value, platform);
}

function collectAccountCandidates(state = {}, workspaceId) {
  const candidates = {
    instagram: [],
    tiktok: [],
  };
  for (const source of Array.isArray(state.sources) ? state.sources : []) {
    if (source?.workspaceId !== workspaceId) continue;
    const platform = inferSocialPlatform(source);
    if (!platform) continue;
    const handle = source.handle || source.username || source.sourceHandle || source.url || '';
    const normalized = normalizeHandle(handle, platform);
    if (normalized) {
      candidates[platform].push(normalized);
    }
  }
  for (const competitor of Array.isArray(state.competitors) ? state.competitors : []) {
    if (competitor?.workspaceId !== workspaceId) continue;
    const platform = inferSocialPlatform(competitor);
    const normalized = normalizeHandle(competitor.handle || competitor.username || competitor.url || '', platform);
    if (normalized) {
      if (platform) {
        candidates[platform].push(normalized);
      } else {
        candidates.instagram.push(normalized);
        candidates.tiktok.push(normalized);
      }
    }
  }
  for (const account of Array.isArray(state.instagramAccounts) ? state.instagramAccounts : []) {
    if (account?.workspaceId !== workspaceId || account.status === 'disconnected') continue;
    const normalized = getAccountHandle(account, 'instagram');
    if (normalized) candidates.instagram.push(normalized);
  }
  for (const account of Array.isArray(state.tiktokAccounts) ? state.tiktokAccounts : []) {
    if (account?.workspaceId !== workspaceId || account.status === 'disconnected') continue;
    const normalized = getAccountHandle(account, 'tiktok');
    if (normalized) candidates.tiktok.push(normalized);
  }
  return {
    instagram: uniqueValues(candidates.instagram, Number.MAX_SAFE_INTEGER),
    tiktok: uniqueValues(candidates.tiktok, Number.MAX_SAFE_INTEGER),
  };
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

function countStructuredInputs(input) {
  if (Array.isArray(input)) {
    return input.reduce((total, value) => total + (normalizeText(value) ? 1 : 0), 0);
  }
  if (!input || typeof input !== 'object') return 0;
  return Object.values(input).reduce((total, value) => total + countStructuredInputs(value), 0);
}

function estimateDiscoveryRunCostUsd(args = {}) {
  const platform = normalizeLower(args.platform);
  const structuredInputs = args.discoveryInputs ?? args.platformInputs ?? args.inputs ?? null;
  const boundedInputCount = Math.min(Math.max(countStructuredInputs(structuredInputs), 1), MAX_INPUTS_PER_LANE);
  const boundedLimit = clampNumber(args.limit, 1, 30, 5);
  const resultCount = boundedInputCount * boundedLimit;
  const resultPriceUsd = platform === 'tiktok'
    ? (args.downloadVideo ? 0.06 : 0.04)
    : 0.03;
  const conservativeEstimate = resultCount * resultPriceUsd;
  const callerEstimate = Math.max(Number(args.estimatedCostUsd || args.estimatedUsd || 0), 0);
  return roundUsd(Math.max(conservativeEstimate, callerEstimate));
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
    retryCounts: {},
    sourceCheckpoints: {},
    initializedAt: base.toISOString(),
    updatedAt: base.toISOString(),
  };
}

function ensureWorkspaceDiscoverySettings(workspace = {}, now = new Date()) {
  if (!workspace || typeof workspace !== 'object') return defaultDiscoverySettings(now);
  const savedSettings = workspace.discoverySettings || workspace.automaticDiscovery || workspace.signalDiscovery || null;
  if (savedSettings?.initializedAt && workspace.discoverySettings === savedSettings) {
    return savedSettings;
  }
  const createdAt = Date.parse(workspace.createdAt || '');
  const base = Number.isFinite(createdAt) ? new Date(createdAt) : toDate(now);
  const defaults = defaultDiscoverySettings(base);
  const saved = savedSettings || {};
  workspace.discoverySettings = {
    ...defaults,
    ...saved,
    platforms: Array.isArray(saved.platforms) ? [...saved.platforms] : [...defaults.platforms],
    laneIntervalsMs: {
      ...defaults.laneIntervalsMs,
      ...(saved.laneIntervalsMs || {}),
    },
    lastRunAt: {
      ...defaults.lastRunAt,
      ...(saved.lastRunAt || {}),
    },
    nextRunAt: {
      ...defaults.nextRunAt,
      ...(saved.nextRunAt || {}),
    },
    retryCounts: {
      ...(saved.retryCounts || {}),
    },
    sourceCheckpoints: Object.fromEntries(
      PLATFORM_NAMES.map((platform) => [
        platform,
        { ...(saved.sourceCheckpoints?.[platform] || {}) },
      ])
    ),
    initializedAt: saved.initializedAt || toDate(now).toISOString(),
    updatedAt: saved.updatedAt || toDate(now).toISOString(),
  };
  return workspace.discoverySettings;
}

function buildDiscoveryInputs(state = {}, workspaceId) {
  const workspace = getWorkspace(state, workspaceId) || {};
  const accounts = collectAccountCandidates(state, workspaceId);
  const keywords = collectKeywordCandidates(workspace, state, workspaceId);
  const hashtags = collectHashtagCandidates(workspace, state, workspaceId);
  const checkpoints = workspace.discoverySettings?.sourceCheckpoints || {};

  return {
    instagram: {
      accounts: rotateValues(accounts.instagram, checkpoints.instagram?.accounts),
      keywords: rotateValues(keywords, checkpoints.instagram?.keywords),
      hashtags: rotateValues(hashtags, checkpoints.instagram?.hashtags),
      trends: rotateValues(buildTrendCandidates('instagram', workspace), checkpoints.instagram?.trends),
    },
    tiktok: {
      accounts: rotateValues(accounts.tiktok, checkpoints.tiktok?.accounts),
      keywords: rotateValues(keywords, checkpoints.tiktok?.keywords),
      hashtags: rotateValues(hashtags, checkpoints.tiktok?.hashtags),
      trends: rotateValues(buildTrendCandidates('tiktok', workspace), checkpoints.tiktok?.trends),
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

function getDailyAutomaticSpendSummary(runs = [], workspaceId, now = new Date()) {
  const dayKey = toUtcDayKey(now);
  let total = 0;
  let isEstimated = false;
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || run.workspaceId !== workspaceId) continue;
    const runDayKey = toUtcDayKey(run.claimedAt || run.startedAt || run.createdAt || run.completedAt);
    if (!runDayKey) continue;
    if (runDayKey !== dayKey) continue;
    const hasActualCost = run.actualCostUsd !== null
      && run.actualCostUsd !== undefined
      && Number.isFinite(Number(run.actualCostUsd))
      && Number(run.actualCostUsd) > 0;
    const actualCostUsd = hasActualCost ? Number(run.actualCostUsd) : null;
    const reservedCostUsd = Number(run.reservedCostUsd);
    const estimatedCostUsd = Number(run.estimatedCostUsd);
    const attemptedCallCount = Number(run.attemptedCallCount);
    if (
      !hasActualCost
      && Number.isFinite(attemptedCallCount)
      && attemptedCallCount <= 0
      && run.status !== 'running'
    ) {
      continue;
    }
    const amount = hasActualCost
      ? actualCostUsd
      : run.status === 'running' && Number.isFinite(reservedCostUsd) && reservedCostUsd > 0
        ? reservedCostUsd
      : run.status === 'running' && Number.isFinite(estimatedCostUsd) && estimatedCostUsd > 0
        ? estimatedCostUsd
        : 0;
    if (Number.isFinite(amount) && amount > 0) {
      total += amount;
      if (!hasActualCost) {
        isEstimated = true;
      }
    }
  }
  return {
    amountUsd: roundUsd(total),
    isEstimated,
  };
}

function getDailyAutomaticSpend(runs = [], workspaceId, now = new Date()) {
  return getDailyAutomaticSpendSummary(runs, workspaceId, now).amountUsd;
}

function canStartDiscoveryRun(args = {}) {
  const spentUsd = Number(args.spentUsd || 0);
  const budgetUsd = clampBudgetUsd(args.budgetUsd, { min: 0, fallback: 0 });
  const estimatedUsd = estimateDiscoveryRunCostUsd(args);
  return spentUsd + estimatedUsd <= budgetUsd;
}

function createRunId(prefix = 'discovery_run') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getRunHeartbeatTime(run = {}) {
  for (const value of [run.updatedAt, run.startedAt, run.claimedAt, run.createdAt]) {
    const timestamp = Date.parse(value || '');
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function recoverStaleRunningRuns(state = {}, args = {}) {
  const workspaceId = String(args.workspaceId || '').trim();
  const lane = String(args.lane || '').trim();
  if (!workspaceId) return [];
  const now = toDate(args.now || new Date());
  const leaseMs = Number.isFinite(Number(args.leaseMs)) && Number(args.leaseMs) > 0
    ? Number(args.leaseMs)
    : STALE_RUNNING_LEASE_MS;
  const runs = Array.isArray(state.discoveryRuns) ? state.discoveryRuns : (state.discoveryRuns = []);
  const recoveredRuns = [];

  for (const run of runs) {
    if (!run || run.workspaceId !== workspaceId || run.status !== 'running') continue;
    if (lane && run.lane !== lane) continue;
    const heartbeatTime = getRunHeartbeatTime(run);
    if (!Number.isFinite(heartbeatTime)) continue;
    if (now.getTime() - heartbeatTime < leaseMs) continue;
    run.status = 'failed';
    run.reason = 'stale_run_recovered';
    run.finishedAt = now.toISOString();
    run.completedAt = run.completedAt || now.toISOString();
    run.updatedAt = now.toISOString();
    run.errorCount = Number.isFinite(Number(run.errorCount)) ? Number(run.errorCount) + 1 : 1;
    run.errors = Array.isArray(run.errors) ? run.errors : [];
    run.errors.push({
      code: 'stale_run_recovered',
      message: 'Recovered a stale running discovery lease before starting a new run.',
    });
    recoveredRuns.push(run);
  }

  return recoveredRuns;
}

function getWorkspaceDiscoverySettings(state = {}, workspaceId, now = new Date()) {
  const workspace = getWorkspace(state, workspaceId) || {};
  ensureWorkspaceDiscoverySettings(workspace, now);
  const defaults = defaultDiscoverySettings(now);
  const savedSettings = workspace.discoverySettings || workspace.automaticDiscovery || workspace.signalDiscovery || {};
  const configuredPlatforms = Array.isArray(savedSettings.platforms)
    ? savedSettings.platforms.map((value) => normalizeLower(value)).filter((value) => PLATFORM_NAMES.includes(value))
    : defaults.platforms;

  return {
    ...defaults,
    ...savedSettings,
    enabled: savedSettings.enabled !== false,
    dailyBudgetUsd: clampBudgetUsd(savedSettings.dailyBudgetUsd, { min: 0.1, fallback: defaults.dailyBudgetUsd }),
    viralScoreThreshold: clampNumber(savedSettings.viralScoreThreshold, 55, 96, defaults.viralScoreThreshold),
    platforms: configuredPlatforms.length ? uniqueValues(configuredPlatforms, PLATFORM_NAMES.length) : [...defaults.platforms],
    laneIntervalsMs: {
      ...defaults.laneIntervalsMs,
      ...(savedSettings.laneIntervalsMs || {}),
    },
    lastRunAt: {
      ...defaults.lastRunAt,
      ...(savedSettings.lastRunAt || {}),
    },
    nextRunAt: {
      ...defaults.nextRunAt,
      ...(savedSettings.nextRunAt || {}),
    },
    retryCounts: {
      ...(savedSettings.retryCounts || {}),
    },
    sourceCheckpoints: Object.fromEntries(
      PLATFORM_NAMES.map((platform) => [
        platform,
        { ...(savedSettings.sourceCheckpoints?.[platform] || {}) },
      ])
    ),
    initializedAt: savedSettings.initializedAt || defaults.initializedAt,
    updatedAt: savedSettings.updatedAt || defaults.updatedAt,
  };
}

function getWorkspaceMarket(workspace = {}) {
  return normalizeText(
    workspace.market
    || workspace.marketFocus?.[0]
    || workspace.brief?.location
    || 'global'
  ).toLowerCase() || 'global';
}

function getSignalSourceUrl(reel = {}) {
  return normalizeText(reel.sourceUrl || reel.importedMetadata?.url || reel.importedMetadata?.webVideoUrl || '');
}

function getSignalVideoUrl(reel = {}) {
  return normalizeText(
    reel.videoUrl
    || reel.importedMetadata?.videoUrl
    || reel.importedMetadata?.mediaUrls?.[0]
    || reel.importedMetadata?.apify?.mediaUrls?.[0]
    || ''
  );
}

function getSignalIdentityKeys(reel = {}) {
  const keys = [];
  const providerKey = normalizeLower(getApifySignalKey(reel.importedMetadata || {}));
  const sourceUrlKey = canonicalizeSignalUrl(getSignalSourceUrl(reel));
  if (providerKey) keys.push(providerKey);
  if (sourceUrlKey) keys.push(`url:${normalizeLower(sourceUrlKey)}`);
  return [...new Set(keys)];
}

function getExistingReelsByIdentity(state = {}, workspaceId) {
  const map = new Map();
  for (const reel of Array.isArray(state.reels) ? state.reels : []) {
    if (reel?.workspaceId !== workspaceId) continue;
    for (const key of getSignalIdentityKeys(reel)) {
      if (!map.has(key)) {
        map.set(key, reel);
      }
    }
  }
  return map;
}

function findFirstMappedValue(map, keys = []) {
  for (const key of keys) {
    if (map.has(key)) {
      return map.get(key);
    }
  }
  return null;
}

function createAutomaticSignalId(prefix = 'reel') {
  return createRunId(prefix);
}

function recalculateSignalScore(reel = {}) {
  return buildScore({
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    shares: reel.shares,
    saves: reel.saves,
    publishedAt: reel.importedMetadata?.publishedAt || reel.publishedAt,
    sourceQuality: getSignalVideoUrl(reel) ? 12 : 8,
  });
}

function hasActionableSignalEvidence(reel = {}) {
  const metrics = [
    reel.views,
    reel.likes,
    reel.comments,
    reel.shares,
    reel.saves,
    reel.importedMetadata?.stats?.views,
    reel.importedMetadata?.stats?.likes,
    reel.importedMetadata?.rawStats?.views,
    reel.importedMetadata?.rawStats?.likes,
  ].map((value) => Number(value || 0));
  return Boolean(getSignalVideoUrl(reel)) || metrics.some((value) => Number.isFinite(value) && value > 0);
}

function normalizeAutomaticSignal(reel = {}, context = {}) {
  const now = toDate(context.now || new Date());
  const workspaceId = context.workspaceId || reel.workspaceId;
  const market = normalizeText(reel.market || context.market || 'global').toLowerCase() || 'global';
  const sourceUrl = getSignalSourceUrl(reel);
  const videoUrl = getSignalVideoUrl(reel);
  const importedMetadata = {
    ...(reel.importedMetadata || {}),
  };

  if (!importedMetadata.platform) {
    importedMetadata.platform = normalizeLower(importedMetadata.source?.tone || reel.sourceType || '');
  }
  if (!importedMetadata.url && sourceUrl) importedMetadata.url = sourceUrl;
  if (!importedMetadata.videoUrl && videoUrl) importedMetadata.videoUrl = videoUrl;
  if ((!Array.isArray(importedMetadata.mediaUrls) || !importedMetadata.mediaUrls.length) && videoUrl) {
    importedMetadata.mediaUrls = [videoUrl];
  }
  if (!importedMetadata.handle && (reel.handle || reel.sourceHandle)) {
    importedMetadata.handle = reel.handle || reel.sourceHandle;
  }
  if (!importedMetadata.source) {
    importedMetadata.source = {
      label: reel.scanLabel || reel.sourceType || importedMetadata.platform || 'Signal',
      tone: importedMetadata.platform || '',
    };
  }
  if (!importedMetadata.sourceStatus) {
    importedMetadata.sourceStatus = videoUrl ? 'apify_video' : 'apify_metadata';
  }

  const normalized = {
    ...reel,
    id: reel.id || (context.createId ? context.createId('reel') : createAutomaticSignalId('reel')),
    workspaceId,
    market,
    sourceHandle: reel.sourceHandle || reel.handle || importedMetadata.handle || '',
    handle: reel.handle || reel.sourceHandle || importedMetadata.handle || '',
    sourceUrl,
    videoUrl,
    importedMetadata,
    sourceStatus: reel.sourceStatus || importedMetadata.sourceStatus,
    createdAt: reel.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  };

  normalized.score = recalculateSignalScore(normalized);
  return normalized;
}

function getSignalSnapshotTime(signal = {}) {
  for (const value of [
    signal.importedMetadata?.snapshotAt,
    signal.importedMetadata?.collectedAt,
    signal.importedMetadata?.fetchedAt,
    signal.snapshotAt,
    signal.updatedAt,
    signal.createdAt,
  ]) {
    const timestamp = Date.parse(value || '');
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function mergeSignalSnapshot(baseSignal = {}, incomingSignal = {}, now = new Date()) {
  const baseSnapshotTime = getSignalSnapshotTime(baseSignal);
  const incomingSnapshotTime = getSignalSnapshotTime(incomingSignal);
  const normalizedBase = normalizeAutomaticSignal(baseSignal, {
    workspaceId: baseSignal.workspaceId || incomingSignal.workspaceId,
    market: baseSignal.market || incomingSignal.market,
    now,
    createId: createAutomaticSignalId,
  });
  const normalizedIncoming = normalizeAutomaticSignal(incomingSignal, {
    workspaceId: normalizedBase.workspaceId,
    market: normalizedBase.market,
    now,
    createId: createAutomaticSignalId,
  });
  const mergedImportedMetadata = {
    ...(normalizedBase.importedMetadata || {}),
    ...(normalizedIncoming.importedMetadata || {}),
    apify: normalizedIncoming.importedMetadata?.apify || normalizedBase.importedMetadata?.apify,
  };
  const useIncomingMetrics = Number.isFinite(baseSnapshotTime) && Number.isFinite(incomingSnapshotTime)
    ? incomingSnapshotTime >= baseSnapshotTime
    : null;
  const mergeMetric = (baseValue, incomingValue) => {
    const base = Math.max(Number(baseValue) || 0, 0);
    const incoming = Math.max(Number(incomingValue) || 0, 0);
    if (useIncomingMetrics === true) return incoming;
    if (useIncomingMetrics === false) return base;
    return Math.max(base, incoming);
  };

  const merged = {
    ...normalizedBase,
    ...normalizedIncoming,
    id: normalizedBase.id || normalizedIncoming.id,
    workspaceId: normalizedBase.workspaceId,
    market: normalizedBase.market,
    sourceHandle: normalizedBase.sourceHandle || normalizedIncoming.sourceHandle || '',
    handle: normalizedBase.handle || normalizedIncoming.handle || '',
    sourceUrl: normalizedBase.sourceUrl || normalizedIncoming.sourceUrl || '',
    videoUrl: normalizedBase.videoUrl || normalizedIncoming.videoUrl || '',
    image: normalizedBase.image || normalizedIncoming.image || '',
    title: normalizedBase.title || normalizedIncoming.title || '',
    caption: normalizedIncoming.caption || normalizedBase.caption || '',
    transcript: normalizedBase.transcript || normalizedIncoming.transcript || '',
    views: mergeMetric(normalizedBase.views, normalizedIncoming.views),
    likes: mergeMetric(normalizedBase.likes, normalizedIncoming.likes),
    comments: mergeMetric(normalizedBase.comments, normalizedIncoming.comments),
    shares: mergeMetric(normalizedBase.shares, normalizedIncoming.shares),
    saves: mergeMetric(normalizedBase.saves, normalizedIncoming.saves),
    hook: normalizedBase.hook || normalizedIncoming.hook || normalizedBase.title || normalizedIncoming.title || '',
    importedMetadata: mergedImportedMetadata,
    sourceStatus: (normalizedBase.videoUrl || normalizedIncoming.videoUrl)
      ? 'apify_video'
      : normalizedIncoming.sourceStatus || normalizedBase.sourceStatus || 'apify_metadata',
    createdAt: normalizedBase.createdAt || normalizedIncoming.createdAt,
    updatedAt: toDate(now).toISOString(),
  };

  merged.score = recalculateSignalScore(merged);
  return merged;
}

function refreshExistingSignal(existingSignal, incomingSignal, now = new Date()) {
  const merged = mergeSignalSnapshot(existingSignal, incomingSignal, now);
  Object.assign(existingSignal, merged);
  return existingSignal;
}

function registerSignalIdentity(map, reel) {
  for (const key of getSignalIdentityKeys(reel)) {
    map.set(key, reel);
  }
}

function registerIdentityValue(map, reel, value) {
  for (const key of getSignalIdentityKeys(reel)) {
    map.set(key, value);
  }
}

function planAutomaticDiscoveryCalls(discoveryInputs = {}, platforms = []) {
  const calls = [];
  for (const platform of platforms) {
    const platformInputs = discoveryInputs[platform] || {};
    for (const lane of DEFAULT_LANES) {
      const inputType = INPUT_TYPE_BY_LANE[lane];
      if (!inputType) continue;
      for (const inputValue of uniqueValues(platformInputs[lane] || [], AUTOMATIC_INPUTS_PER_LANE)) {
        calls.push({
          platform,
          lane,
          inputType,
          inputValue,
          limit: AUTOMATIC_METADATA_LIMIT,
          downloadVideo: false,
        });
      }
    }
  }
  return calls;
}

function getPlannedAutomaticDiscoveryCalls(discoveryInputs = {}, platforms = [], lanes = DEFAULT_LANES) {
  const allowedLanes = new Set(Array.isArray(lanes) ? lanes : DEFAULT_LANES);
  return planAutomaticDiscoveryCalls(discoveryInputs, platforms).filter((call) => allowedLanes.has(call.lane));
}

function createLaneScheduleMap(settings = {}) {
  return {
    lastRunAt: {
      ...(settings.lastRunAt || {}),
    },
    nextRunAt: {
      ...(settings.nextRunAt || {}),
    },
  };
}

function persistDiscoverySchedule(workspace = {}, settings = {}, now = new Date()) {
  const current = workspace.discoverySettings || {};
  workspace.discoverySettings = {
    ...current,
    enabled: settings.enabled !== false,
    dailyBudgetUsd: settings.dailyBudgetUsd,
    viralScoreThreshold: settings.viralScoreThreshold,
    platforms: [...(settings.platforms || [])],
    laneIntervalsMs: {
      ...(settings.laneIntervalsMs || {}),
    },
    lastRunAt: {
      ...(settings.lastRunAt || {}),
    },
    nextRunAt: {
      ...(settings.nextRunAt || {}),
    },
    retryCounts: {
      ...(settings.retryCounts || {}),
    },
    sourceCheckpoints: Object.fromEntries(
      PLATFORM_NAMES.map((platform) => [
        platform,
        { ...(settings.sourceCheckpoints?.[platform] || {}) },
      ])
    ),
    initializedAt: current.initializedAt || settings.initializedAt || toDate(now).toISOString(),
    updatedAt: toDate(now).toISOString(),
  };
}

function applyNormalLaneSchedules(workspace = {}, settings = {}, lanes = [], now = new Date()) {
  if (!Array.isArray(lanes) || !lanes.length) return;
  const scheduleState = createLaneScheduleMap(settings);
  const timestamp = toDate(now).toISOString();
  for (const lane of lanes) {
    const intervalMs = settings.laneIntervalsMs?.[lane] || LANE_INTERVALS[lane];
    if (!intervalMs) continue;
    scheduleState.lastRunAt[lane] = timestamp;
    scheduleState.nextRunAt[lane] = new Date(toDate(now).getTime() + intervalMs).toISOString();
    settings.retryCounts[lane] = 0;
  }
  settings.lastRunAt = scheduleState.lastRunAt;
  settings.nextRunAt = scheduleState.nextRunAt;
  persistDiscoverySchedule(workspace, settings, now);
}

function applyFailedLaneSchedules(workspace = {}, settings = {}, lanes = [], now = new Date()) {
  if (!Array.isArray(lanes) || !lanes.length) return;
  const timestamp = toDate(now).getTime();
  for (const lane of lanes) {
    const retryCount = Math.max(0, Math.trunc(Number(settings.retryCounts?.[lane]) || 0)) + 1;
    const backoffMs = Math.min(FAILURE_RETRY_BASE_MS * (2 ** Math.max(0, retryCount - 1)), FAILURE_RETRY_CAP_MS);
    settings.retryCounts[lane] = retryCount;
    settings.nextRunAt[lane] = new Date(timestamp + backoffMs).toISOString();
  }
  persistDiscoverySchedule(workspace, settings, now);
}

function getNextUtcDayStart(now = new Date()) {
  const date = toDate(now);
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
  ));
}

function applyBudgetLaneSchedules(workspace = {}, settings = {}, lanes = [], now = new Date()) {
  if (!Array.isArray(lanes) || !lanes.length) return;
  const nextBudgetWindow = getNextUtcDayStart(now).toISOString();
  for (const lane of lanes) {
    settings.nextRunAt[lane] = nextBudgetWindow;
  }
  persistDiscoverySchedule(workspace, settings, now);
}

function advanceSourceCheckpoints(workspace = {}, settings = {}, calls = []) {
  for (const call of calls) {
    if (!PLATFORM_NAMES.includes(call.platform) || !DEFAULT_LANES.includes(call.lane)) continue;
    const platformCheckpoints = settings.sourceCheckpoints[call.platform]
      || (settings.sourceCheckpoints[call.platform] = {});
    platformCheckpoints[call.lane] = Math.max(
      0,
      Math.trunc(Number(platformCheckpoints[call.lane]) || 0) + 1,
    );
  }
  persistDiscoverySchedule(workspace, settings, settings.updatedAt || new Date());
}

function estimateDiscoveryCallCostUsd(call = {}) {
  const inputLabel = call.inputType || call.lane || 'search';
  return estimateDiscoveryRunCostUsd({
    platform: call.platform,
    limit: call.limit,
    downloadVideo: call.downloadVideo,
    discoveryInputs: {
      [inputLabel]: [call.inputValue],
    },
  });
}

function createAutomaticRun(state = {}, args = {}) {
  const runs = Array.isArray(state.discoveryRuns) ? state.discoveryRuns : (state.discoveryRuns = []);
  const workspaceId = String(args.workspaceId || '').trim();
  if (!workspaceId) return null;
  recoverStaleRunningRuns(state, {
    workspaceId,
    lane: AUTOMATIC_RUN_LANE,
    now: args.now,
  });
  const activeConflict = runs.some((run) => (
    run
    && run.workspaceId === workspaceId
    && run.lane === AUTOMATIC_RUN_LANE
    && run.status === 'running'
  ));
  if (activeConflict) return null;

  const now = toDate(args.now || new Date());
  const run = {
    id: createRunId('automatic_discovery'),
    workspaceId,
    lane: AUTOMATIC_RUN_LANE,
    platform: 'multi',
    dayKey: toUtcDayKey(now),
    status: 'running',
    budgetUsd: roundUsd(args.budgetUsd),
    spentUsdBefore: roundUsd(args.spentUsdBefore),
    estimatedCostUsd: roundUsd(args.estimatedCostUsd),
    reservedCostUsd: roundUsd(args.reservedCostUsd ?? args.estimatedCostUsd),
    actualCostUsd: null,
    attemptedCallCount: Number(args.attemptedCallCount || 0),
    requestedCount: Number(args.requestedCount || 0),
    returnedCount: 0,
    acceptedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
    errorCount: 0,
    errors: [],
    claimedAt: now.toISOString(),
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  runs.unshift(run);
  return run;
}

function createEmptyDiscoveryResult(run = null, extra = {}) {
  return {
    run,
    acceptedSignals: [],
    updatedSignals: [],
    execution: null,
    ...extra,
  };
}

function prepareAutomaticDiscovery(args = {}) {
  const now = toDate(args.now || new Date());
  const state = args.state || {};
  const workspaceId = String(args.workspaceId || '').trim();
  const workspace = getWorkspace(state, workspaceId);
  if (!workspace) {
    const error = new Error('workspace_not_found');
    error.status = 404;
    throw error;
  }

  ensureWorkspaceDiscoverySettings(workspace, now);
  const settings = getWorkspaceDiscoverySettings(state, workspaceId, now);
  recoverStaleRunningRuns(state, {
    workspaceId,
    lane: AUTOMATIC_RUN_LANE,
    now,
  });
  const activeRun = (Array.isArray(state.discoveryRuns) ? state.discoveryRuns : [])
    .find((run) => run?.workspaceId === workspaceId && run.lane === AUTOMATIC_RUN_LANE && run.status === 'running');
  if (activeRun) {
    return createEmptyDiscoveryResult(null, { reason: 'active_run' });
  }

  if (settings.enabled === false) {
    if (args.recordPaused === false) {
      return createEmptyDiscoveryResult(null, { reason: 'paused' });
    }
    const run = createAutomaticRun(state, {
      workspaceId,
      now,
      budgetUsd: settings.dailyBudgetUsd,
      spentUsdBefore: getDailyAutomaticSpend(state.discoveryRuns, workspaceId, now),
      estimatedCostUsd: 0,
      reservedCostUsd: 0,
      requestedCount: 0,
    });
    if (!run) return createEmptyDiscoveryResult(null, { reason: 'active_run' });
    run.status = 'paused';
    run.completedAt = now.toISOString();
    run.updatedAt = now.toISOString();
    return createEmptyDiscoveryResult(run, { reason: 'paused' });
  }

  const dueLanes = args.force
    ? [...DEFAULT_LANES]
    : DEFAULT_LANES.filter((lane) => isDiscoveryDue(settings, lane, now));
  if (!dueLanes.length) {
    return createEmptyDiscoveryResult(null, { reason: 'not_due' });
  }

  const discoveryInputs = buildDiscoveryInputs(state, workspaceId);
  const plannedCalls = getPlannedAutomaticDiscoveryCalls(discoveryInputs, settings.platforms, dueLanes);
  const lanesWithCalls = new Set(plannedCalls.map((call) => call.lane));
  const emptyLanes = dueLanes.filter((lane) => !lanesWithCalls.has(lane));
  applyNormalLaneSchedules(workspace, settings, emptyLanes, now);
  if (!plannedCalls.length) {
    if (args.force) {
      const run = createAutomaticRun(state, {
        workspaceId,
        now,
        budgetUsd: settings.dailyBudgetUsd,
        spentUsdBefore: getDailyAutomaticSpend(state.discoveryRuns, workspaceId, now),
        estimatedCostUsd: 0,
        reservedCostUsd: 0,
        requestedCount: 0,
      });
      if (!run) return createEmptyDiscoveryResult(null, { reason: 'active_run' });
      run.status = 'completed';
      run.completedAt = now.toISOString();
      run.updatedAt = now.toISOString();
      return createEmptyDiscoveryResult(run, { reason: 'empty' });
    }
    return createEmptyDiscoveryResult(null, { reason: 'empty' });
  }

  const spentUsd = getDailyAutomaticSpend(state.discoveryRuns, workspaceId, now);
  const estimatedMetadataCostUsd = roundUsd(
    plannedCalls.reduce((total, call) => total + estimateDiscoveryCallCostUsd(call), 0)
  );
  const isForcedRun = Boolean(args.force);
  if (spentUsd >= settings.dailyBudgetUsd || (!isForcedRun && spentUsd + estimatedMetadataCostUsd > settings.dailyBudgetUsd)) {
    applyBudgetLaneSchedules(workspace, settings, DEFAULT_LANES, now);
    const run = createAutomaticRun(state, {
      workspaceId,
      now,
      budgetUsd: settings.dailyBudgetUsd,
      spentUsdBefore: spentUsd,
      estimatedCostUsd: 0,
      reservedCostUsd: 0,
      requestedCount: plannedCalls.length,
    });
    if (!run) return createEmptyDiscoveryResult(null, { reason: 'active_run' });
    run.status = 'blocked_budget';
    run.errorCount = 1;
    run.errors.push({
      code: 'automatic_budget_reached',
      message: 'Automatic discovery metadata budget is exhausted for this UTC day.',
    });
    run.completedAt = now.toISOString();
    run.updatedAt = now.toISOString();
    return createEmptyDiscoveryResult(run, { reason: 'blocked_budget' });
  }

  const run = createAutomaticRun(state, {
    workspaceId,
    now,
    budgetUsd: settings.dailyBudgetUsd,
    spentUsdBefore: spentUsd,
    estimatedCostUsd: estimatedMetadataCostUsd,
    reservedCostUsd: isForcedRun ? 0 : estimatedMetadataCostUsd,
    requestedCount: plannedCalls.length,
  });
  if (!run) return createEmptyDiscoveryResult(null, { reason: 'active_run' });
  return {
    run,
    acceptedSignals: [],
    updatedSignals: [],
    execution: {
      discoveryInputs,
      dueLanes,
      plannedCalls,
      settings,
    },
  };
}

async function executeAutomaticDiscovery(args = {}) {
  const now = toDate(args.now || new Date());
  const state = args.state || {};
  const workspaceId = String(args.workspaceId || '').trim();
  const workspace = getWorkspace(state, workspaceId);
  if (!workspace) {
    const error = new Error('workspace_not_found');
    error.status = 404;
    throw error;
  }

  const prepared = args.prepared || prepareAutomaticDiscovery(args);
  if (!prepared.execution) {
    return createEmptyDiscoveryResult(prepared.run, { reason: prepared.reason });
  }
  const run = prepared.run;
  const {
    dueLanes,
    plannedCalls,
    settings,
  } = prepared.execution;
  const spentUsd = run.spentUsdBefore;

  const fetchSignals = typeof args.fetchSignals === 'function' ? args.fetchSignals : fetchApifySignals;
  const market = getWorkspaceMarket(workspace);
  const reels = Array.isArray(state.reels) ? state.reels : (state.reels = []);
  const existingByIdentity = getExistingReelsByIdentity(state, workspaceId);
  const candidateIdsByIdentity = new Map();
  const candidatesById = new Map();
  const updatedSignalsById = new Map();
  let successfulCalls = 0;
  let billedCostUsd = 0;
  let hasCompleteBilledCost = true;
  const laneStats = new Map();
  const getCurrentTime = typeof args.getCurrentTime === 'function'
    ? args.getCurrentTime
    : () => new Date();

  async function reportProgress() {
    const progressTime = toDate(getCurrentTime());
    const previousTime = Date.parse(run.updatedAt || '');
    run.updatedAt = Number.isFinite(previousTime) && previousTime > progressTime.getTime()
      ? new Date(previousTime).toISOString()
      : progressTime.toISOString();
    if (typeof args.onProgress === 'function') {
      await args.onProgress(run);
    }
  }

  function unpackProviderResult(result) {
    if (Array.isArray(result)) {
      const actualCostUsd = result.actualCostUsd;
      return {
        signals: result,
        actualCostUsd: actualCostUsd === null || actualCostUsd === undefined
          ? null
          : Number(actualCostUsd),
      };
    }
    const signals = Array.isArray(result?.signals)
      ? result.signals
      : Array.isArray(result?.items)
        ? result.items
        : [];
    const actualCostUsd = result?.actualCostUsd;
    return {
      signals,
      actualCostUsd: actualCostUsd === null || actualCostUsd === undefined
        ? null
        : Number(actualCostUsd),
    };
  }

  function recordBilledCost(value) {
    if (Number.isFinite(value) && value > 0) {
      billedCostUsd += value;
      return;
    }
    hasCompleteBilledCost = false;
  }

  function getLaneStat(lane) {
    if (!laneStats.has(lane)) {
      laneStats.set(lane, { attempted: 0, successful: 0, failed: 0 });
    }
    return laneStats.get(lane);
  }

  for (const call of plannedCalls) {
    const callEstimateUsd = estimateDiscoveryCallCostUsd(call);
    const laneStat = getLaneStat(call.lane);
    laneStat.attempted += 1;
    run.attemptedCallCount += 1;
    await reportProgress();
    try {
      const providerResult = await fetchSignals({
        token: args.token,
        platform: call.platform,
        mode: call.inputType,
        input: call.inputValue,
        inputType: call.inputType,
        inputValue: call.inputValue,
        limit: call.limit,
        downloadVideo: false,
        downloadVideos: false,
        workspaceId,
        market,
        createId: createAutomaticSignalId,
      });
      const { signals: fetchedSignals, actualCostUsd } = unpackProviderResult(providerResult);
      recordBilledCost(actualCostUsd);
      run.returnedCount += Array.isArray(fetchedSignals) ? fetchedSignals.length : 0;
      successfulCalls += 1;
      laneStat.successful += 1;

      for (const fetchedSignal of Array.isArray(fetchedSignals) ? fetchedSignals : []) {
        const normalizedSignal = normalizeAutomaticSignal(fetchedSignal, {
          workspaceId,
          market,
          now,
          createId: createAutomaticSignalId,
        });
        const identityKeys = getSignalIdentityKeys(normalizedSignal);
        const existingSignal = findFirstMappedValue(existingByIdentity, identityKeys);
        if (existingSignal) {
          const refreshedSignal = refreshExistingSignal(existingSignal, normalizedSignal, now);
          updatedSignalsById.set(refreshedSignal.id, refreshedSignal);
          registerSignalIdentity(existingByIdentity, refreshedSignal);
          run.duplicateCount += 1;
          continue;
        }

        const candidateId = findFirstMappedValue(candidateIdsByIdentity, identityKeys);
        if (candidateId) {
          const mergedCandidate = mergeSignalSnapshot(candidatesById.get(candidateId), normalizedSignal, now);
          candidatesById.set(candidateId, mergedCandidate);
          registerIdentityValue(candidateIdsByIdentity, mergedCandidate, candidateId);
          run.duplicateCount += 1;
          continue;
        }

        const newCandidateId = normalizedSignal.id || createAutomaticSignalId('candidate');
        candidatesById.set(newCandidateId, normalizedSignal);
        registerIdentityValue(candidateIdsByIdentity, normalizedSignal, newCandidateId);
      }
    } catch (error) {
      recordBilledCost(error?.actualCostUsd);
      run.errorCount += 1;
      laneStat.failed += 1;
      run.errors.push({
        platform: call.platform,
        lane: call.lane,
        input: call.inputValue,
        message: error?.message || 'automatic_discovery_failed',
        status: error?.status || 500,
      });
    } finally {
      await reportProgress();
    }
  }

  const successfulLanes = Array.from(laneStats.entries())
    .filter(([, stats]) => stats.attempted > 0 && stats.successful > 0)
    .map(([lane]) => lane);
  const failedLanes = Array.from(laneStats.entries())
    .filter(([, stats]) => stats.attempted > 0 && stats.successful === 0 && stats.failed > 0)
    .map(([lane]) => lane);
  const attemptedLanes = new Set(Array.from(laneStats.keys()));
  const emptyLanes = dueLanes.filter((lane) => !attemptedLanes.has(lane));
  applyNormalLaneSchedules(workspace, settings, [...successfulLanes, ...emptyLanes], now);
  applyFailedLaneSchedules(workspace, settings, failedLanes, now);
  advanceSourceCheckpoints(workspace, settings, plannedCalls);

  const rankedSignals = Array.from(candidatesById.values())
    .filter(hasActionableSignalEvidence)
    .sort((left, right) => right.score - left.score);
  const selectedCandidateIds = new Set();
  const selectCandidate = (signal) => {
    if (!signal || selectedCandidateIds.has(signal.id)) return;
    selectedCandidateIds.add(signal.id);
  };
  for (const signal of rankedSignals) {
    if (signal.score >= settings.viralScoreThreshold) selectCandidate(signal);
  }
  for (const platform of settings.platforms || []) {
    const platformHasWinner = rankedSignals.some((signal) => (
      selectedCandidateIds.has(signal.id)
      && normalizeLower(signal.importedMetadata?.platform) === platform
    ));
    if (platformHasWinner) continue;
    const fallbackSignal = rankedSignals.find((signal) => (
      normalizeLower(signal.importedMetadata?.platform) === platform
      && signal.score >= AUTOMATIC_FALLBACK_SCORE_THRESHOLD
    ));
    selectCandidate(fallbackSignal);
  }
  for (const signal of rankedSignals) {
    if (selectedCandidateIds.size >= AUTOMATIC_MAX_WINNERS) break;
    if (signal.score >= AUTOMATIC_FALLBACK_SCORE_THRESHOLD) selectCandidate(signal);
  }
  const shortlistedSignals = rankedSignals
    .filter((signal) => selectedCandidateIds.has(signal.id))
    .slice(0, AUTOMATIC_MAX_WINNERS);

  run.rejectedCount = Math.max(candidatesById.size - shortlistedSignals.length, 0);

  const acceptedSignals = [];
  for (const shortlistedSignal of shortlistedSignals) {
    let acceptedSignal = shortlistedSignal;
    const platform = normalizeLower(shortlistedSignal.importedMetadata?.platform);
    if (platform === 'tiktok') {
      const downloadInput = shortlistedSignal.sourceUrl || shortlistedSignal.importedMetadata?.url || '';
      const downloadCall = {
        platform: 'tiktok',
        lane: 'winner',
        inputType: 'url',
        inputValue: downloadInput,
        limit: AUTOMATIC_DOWNLOAD_LIMIT,
        downloadVideo: true,
      };
      const downloadEstimateUsd = estimateDiscoveryCallCostUsd(downloadCall);
      if (downloadInput && spentUsd + run.reservedCostUsd + downloadEstimateUsd <= settings.dailyBudgetUsd) {
        run.estimatedCostUsd = roundUsd(run.estimatedCostUsd + downloadEstimateUsd);
        run.reservedCostUsd = roundUsd(run.reservedCostUsd + downloadEstimateUsd);
        run.attemptedCallCount += 1;
        await reportProgress();
        try {
          const providerResult = await fetchSignals({
            token: args.token,
            platform: 'tiktok',
            mode: 'url',
            input: downloadInput,
            inputType: 'url',
            inputValue: downloadInput,
            limit: AUTOMATIC_DOWNLOAD_LIMIT,
            downloadVideo: true,
            downloadVideos: true,
            workspaceId,
            market,
            createId: createAutomaticSignalId,
          });
          const { signals: downloadedSignals, actualCostUsd } = unpackProviderResult(providerResult);
          recordBilledCost(actualCostUsd);
          run.returnedCount += Array.isArray(downloadedSignals) ? downloadedSignals.length : 0;
          successfulCalls += 1;

          const matchingDownload = (Array.isArray(downloadedSignals) ? downloadedSignals : [])
            .map((signal) => normalizeAutomaticSignal(signal, {
              workspaceId,
              market,
              now,
              createId: createAutomaticSignalId,
            }))
            .find((signal) => {
              const downloadIdentityKeys = new Set(getSignalIdentityKeys(signal));
              return getSignalIdentityKeys(shortlistedSignal).some((key) => downloadIdentityKeys.has(key));
            });

          if (matchingDownload) {
            acceptedSignal = mergeSignalSnapshot(shortlistedSignal, matchingDownload, now);
            if (!acceptedSignal.sourceUrl) {
              acceptedSignal.sourceUrl = shortlistedSignal.sourceUrl;
            }
            if (!acceptedSignal.importedMetadata?.url && acceptedSignal.sourceUrl) {
              acceptedSignal.importedMetadata = {
                ...(acceptedSignal.importedMetadata || {}),
                url: acceptedSignal.sourceUrl,
              };
            }
          }
        } catch (error) {
          recordBilledCost(error?.actualCostUsd);
          run.errorCount += 1;
          run.errors.push({
            platform: 'tiktok',
            lane: 'winner',
            input: downloadInput,
            message: error?.message || 'automatic_discovery_download_failed',
            status: error?.status || 500,
          });
        } finally {
          await reportProgress();
        }
      }
    }

    const finalizedSignal = normalizeAutomaticSignal(acceptedSignal, {
      workspaceId,
      market,
      now,
      createId: createAutomaticSignalId,
    });
    acceptedSignals.push(finalizedSignal);
    registerSignalIdentity(existingByIdentity, finalizedSignal);
  }

  if (acceptedSignals.length) {
    reels.unshift(...acceptedSignals);
  }

  run.acceptedCount = acceptedSignals.length;
  run.status = successfulCalls > 0 ? 'completed' : 'failed';
  const roundedBilledCostUsd = roundUsd(billedCostUsd);
  run.actualCostUsd = run.attemptedCallCount > 0 && hasCompleteBilledCost && roundedBilledCostUsd > 0
    ? roundedBilledCostUsd
    : null;
  run.completedAt = now.toISOString();
  const latestHeartbeat = Date.parse(run.updatedAt || '');
  run.updatedAt = Number.isFinite(latestHeartbeat) && latestHeartbeat > now.getTime()
    ? new Date(latestHeartbeat).toISOString()
    : now.toISOString();

  return {
    run,
    acceptedSignals,
    updatedSignals: Array.from(updatedSignalsById.values()),
  };
}

function claimDiscoveryRun(state = {}, args = {}) {
  const workspaceId = String(args.workspaceId || '').trim();
  const lane = String(args.lane || '').trim();
  if (!workspaceId || !lane) return null;
  const runs = Array.isArray(state.discoveryRuns) ? state.discoveryRuns : (state.discoveryRuns = []);
  recoverStaleRunningRuns(state, {
    workspaceId,
    lane,
    now: args.now,
  });
  const activeConflict = runs.some((run) => (
    run
    && run.workspaceId === workspaceId
    && run.lane === lane
    && run.status === 'running'
  ));
  if (activeConflict) return null;

  const estimatedCostUsd = estimateDiscoveryRunCostUsd(args);
  const spentUsd = Number(args.spentUsd || 0);
  const budgetUsd = clampBudgetUsd(args.budgetUsd, { min: 0, fallback: 0 });
  if (Number.isFinite(budgetUsd) && budgetUsd > 0 && spentUsd + estimatedCostUsd > budgetUsd) {
    return null;
  }

  const now = toDate(args.now || new Date());
  const run = {
    id: createRunId(),
    workspaceId,
    lane,
    dayKey: toUtcDayKey(now),
    status: 'running',
    estimatedCostUsd,
    reservedCostUsd: estimatedCostUsd,
    actualCostUsd: null,
    claimedAt: now.toISOString(),
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  runs.unshift(run);
  return run;
}

module.exports = {
  defaultDiscoverySettings,
  ensureWorkspaceDiscoverySettings,
  buildDiscoveryInputs,
  canonicalizeSignalUrl,
  isDiscoveryDue,
  getDailyAutomaticSpend,
  getDailyAutomaticSpendSummary,
  canStartDiscoveryRun,
  claimDiscoveryRun,
  recoverStaleRunningRuns,
  prepareAutomaticDiscovery,
  executeAutomaticDiscovery,
  mergeSignalSnapshot,
};
