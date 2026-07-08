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
const DEFAULT_DAILY_BUDGET_USD = 0.8;
const DEFAULT_VIRAL_SCORE_THRESHOLD = 70;
const AUTOMATIC_RUN_LANE = 'automatic';
const AUTOMATIC_INPUTS_PER_LANE = 2;
const AUTOMATIC_METADATA_LIMIT = 1;
const AUTOMATIC_DOWNLOAD_LIMIT = 1;
const AUTOMATIC_MAX_WINNERS = 3;

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
    const actualCostUsd = Number(run.actualCostUsd);
    const estimatedCostUsd = Number(run.estimatedCostUsd);
    const amount = Number.isFinite(actualCostUsd) && actualCostUsd > 0
      ? actualCostUsd
      : Number.isFinite(estimatedCostUsd) && estimatedCostUsd > 0
        ? estimatedCostUsd
        : 0;
    if (Number.isFinite(amount) && amount > 0) {
      total += amount;
    }
  }
  return roundUsd(total);
}

function canStartDiscoveryRun(args = {}) {
  const spentUsd = Number(args.spentUsd || 0);
  const budgetUsd = Number(args.budgetUsd || 0);
  const estimatedUsd = estimateDiscoveryRunCostUsd(args);
  return spentUsd + estimatedUsd <= budgetUsd;
}

function createRunId(prefix = 'discovery_run') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getWorkspaceDiscoverySettings(state = {}, workspaceId, now = new Date()) {
  const workspace = getWorkspace(state, workspaceId) || {};
  const defaults = defaultDiscoverySettings(now);
  const savedSettings = workspace.discoverySettings || workspace.automaticDiscovery || workspace.signalDiscovery || {};
  const configuredPlatforms = Array.isArray(savedSettings.platforms)
    ? savedSettings.platforms.map((value) => normalizeLower(value)).filter((value) => PLATFORM_NAMES.includes(value))
    : defaults.platforms;

  return {
    ...defaults,
    ...savedSettings,
    enabled: savedSettings.enabled !== false,
    dailyBudgetUsd: clampNumber(savedSettings.dailyBudgetUsd, 0.1, 1000, defaults.dailyBudgetUsd),
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
  const sourceUrlKey = normalizeLower(getSignalSourceUrl(reel));
  if (providerKey) keys.push(providerKey);
  if (sourceUrlKey) keys.push(`url:${sourceUrlKey}`);
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

function mergeSignalSnapshot(baseSignal = {}, incomingSignal = {}, now = new Date()) {
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
    views: normalizedIncoming.views || normalizedBase.views || 0,
    likes: normalizedIncoming.likes || normalizedBase.likes || 0,
    comments: normalizedIncoming.comments || normalizedBase.comments || 0,
    shares: normalizedIncoming.shares || normalizedBase.shares || 0,
    saves: normalizedIncoming.saves || normalizedBase.saves || 0,
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
    actualCostUsd: 0,
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

  const settings = getWorkspaceDiscoverySettings(state, workspaceId, now);
  const spentUsd = getDailyAutomaticSpend(state.discoveryRuns, workspaceId, now);
  const discoveryInputs = buildDiscoveryInputs(state, workspaceId);
  const plannedCalls = planAutomaticDiscoveryCalls(discoveryInputs, settings.platforms);
  const estimatedMetadataCostUsd = roundUsd(
    plannedCalls.reduce((total, call) => total + estimateDiscoveryCallCostUsd(call), 0)
  );

  const run = createAutomaticRun(state, {
    workspaceId,
    now,
    budgetUsd: settings.dailyBudgetUsd,
    spentUsdBefore: spentUsd,
    estimatedCostUsd: estimatedMetadataCostUsd,
    requestedCount: plannedCalls.length,
  });
  if (!run) {
    return {
      run: null,
      acceptedSignals: [],
      updatedSignals: [],
    };
  }

  if (settings.enabled === false) {
    run.status = 'paused';
    run.completedAt = now.toISOString();
    run.updatedAt = now.toISOString();
    return { run, acceptedSignals: [], updatedSignals: [] };
  }

  if (!plannedCalls.length) {
    run.status = 'completed';
    run.completedAt = now.toISOString();
    run.updatedAt = now.toISOString();
    return { run, acceptedSignals: [], updatedSignals: [] };
  }

  if (spentUsd + estimatedMetadataCostUsd > settings.dailyBudgetUsd) {
    run.status = 'blocked_budget';
    run.errorCount = 1;
    run.errors.push({
      code: 'automatic_budget_reached',
      message: 'Automatic discovery metadata budget is exhausted for this UTC day.',
    });
    run.completedAt = now.toISOString();
    run.updatedAt = now.toISOString();
    return { run, acceptedSignals: [], updatedSignals: [] };
  }

  const fetchSignals = typeof args.fetchSignals === 'function' ? args.fetchSignals : fetchApifySignals;
  const market = getWorkspaceMarket(workspace);
  const reels = Array.isArray(state.reels) ? state.reels : (state.reels = []);
  const existingByIdentity = getExistingReelsByIdentity(state, workspaceId);
  const candidateIdsByIdentity = new Map();
  const candidatesById = new Map();
  const updatedSignalsById = new Map();
  let successfulCalls = 0;

  for (const call of plannedCalls) {
    const callEstimateUsd = estimateDiscoveryCallCostUsd(call);
    try {
      const fetchedSignals = await fetchSignals({
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
      run.actualCostUsd = roundUsd(run.actualCostUsd + callEstimateUsd);
      run.returnedCount += Array.isArray(fetchedSignals) ? fetchedSignals.length : 0;
      successfulCalls += 1;

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
      run.actualCostUsd = roundUsd(run.actualCostUsd + callEstimateUsd);
      run.errorCount += 1;
      run.errors.push({
        platform: call.platform,
        lane: call.lane,
        input: call.inputValue,
        message: error?.message || 'automatic_discovery_failed',
        status: error?.status || 500,
      });
    }
  }

  const shortlistedSignals = Array.from(candidatesById.values())
    .filter((signal) => signal.score >= settings.viralScoreThreshold)
    .sort((left, right) => right.score - left.score)
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
      if (downloadInput && spentUsd + run.actualCostUsd + downloadEstimateUsd <= settings.dailyBudgetUsd) {
        run.estimatedCostUsd = roundUsd(run.estimatedCostUsd + downloadEstimateUsd);
        try {
          const downloadedSignals = await fetchSignals({
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
          run.actualCostUsd = roundUsd(run.actualCostUsd + downloadEstimateUsd);
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
          run.actualCostUsd = roundUsd(run.actualCostUsd + downloadEstimateUsd);
          run.errorCount += 1;
          run.errors.push({
            platform: 'tiktok',
            lane: 'winner',
            input: downloadInput,
            message: error?.message || 'automatic_discovery_download_failed',
            status: error?.status || 500,
          });
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
  run.completedAt = now.toISOString();
  run.updatedAt = now.toISOString();

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
  const activeConflict = runs.some((run) => (
    run
    && run.workspaceId === workspaceId
    && run.lane === lane
    && run.status === 'running'
  ));
  if (activeConflict) return null;

  const estimatedCostUsd = estimateDiscoveryRunCostUsd(args);
  const spentUsd = Number(args.spentUsd || 0);
  const budgetUsd = Number(args.budgetUsd || 0);
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
  executeAutomaticDiscovery,
};
