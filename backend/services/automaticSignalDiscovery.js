const crypto = require('node:crypto');
const {
  buildScore,
  fetchApifySignals,
  getApifyInputSupport,
  getApifySignalKey,
} = require('./apifySignalProvider');
const {
  combineSignalQualityAssessments,
  isSignalQualityBorderline,
} = require('./signalQualityGate.cjs');
const { resolveWorkspaceDiscoveryBrand } = require('./productBrandBrain.cjs');
const { sanitizeDiagnosticExport, sanitizeUrl } = require('./diagnosticExportSanitizer.cjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const ACCOUNT_INTERVAL_MS = 6 * HOUR_MS;
const DISCOVERY_INTERVAL_MS = 12 * HOUR_MS;
const MAX_INPUTS_PER_LANE = 10;
const MAX_DAILY_BUDGET_USD = 0.8;
const DEFAULT_DAILY_BUDGET_USD = 0.8;
const DEFAULT_VIRAL_SCORE_THRESHOLD = 70;
const AUTOMATIC_RUN_LANE = 'automatic';
const AUTOMATIC_INPUTS_PER_LANE = 3;
const AUTOMATIC_METADATA_LIMIT = 5;
const AUTOMATIC_MAX_PLANNED_CALLS = 1;
const FORCED_AUTOMATIC_INPUTS_PER_LANE = 1;
const FORCED_AUTOMATIC_METADATA_LIMIT = 5;
const FORCED_AUTOMATIC_INSTAGRAM_METADATA_LIMIT = 5;
const AUTOMATIC_DOWNLOAD_LIMIT = 1;
const AUTOMATIC_MAX_WINNERS = 20;
const FORCED_AUTOMATIC_MAX_WINNERS = 1;
const AUTOMATIC_MAX_WINNER_DOWNLOADS = 1;
const FORCED_AUTOMATIC_MAX_WINNER_DOWNLOADS = 1;
const STALE_RUNNING_LEASE_MS = 30 * 60 * 1000;
const FAILURE_RETRY_BASE_MS = 30 * 60 * 1000;
const FAILURE_RETRY_CAP_MS = 6 * HOUR_MS;
const B_SOFT_RANKING_VERSION = 'b_soft_v1';
const B_SOFT_SHARE_WEIGHT = 4;
const B_SOFT_SAVE_WEIGHT = 3;
const B_SOFT_DENOMINATOR_FLOOR = 500;
const B_SOFT_DURATION_MIN_SECONDS = 12;
const B_SOFT_DURATION_MAX_SECONDS = 60;
const B_SOFT_DURATION_DECAY_SECONDS = 12;
const MANUAL_REFRESH_TRIGGER_MODE = 'manual_refresh';
const SCHEDULED_TRIGGER_MODE = 'scheduled';
const MANUAL_REFRESH_PER_RUN_CAP_USD = 1;
const MANUAL_REFRESH_DAILY_CAP_USD = 3;
const MANUAL_REFRESH_MONTHLY_CAP_USD = 90;
const MANUAL_METADATA_APIFY_CAP_USD = 0.5;
const MANUAL_DOWNLOAD_APIFY_CAP_USD = 0.5;
const MANUAL_GEMINI_CAP_USD = 0.15;

const BOOTSTRAP_KEYWORDS = [
  'ai tools',
  'content marketing',
  'youtube automation',
  'small business marketing',
  'creator economy',
  'ecommerce ads',
  'ugc ads',
  'social media tips',
  'brand storytelling',
  'productivity workflow',
];

const BOOTSTRAP_HASHTAGS = [
  '#aitools',
  '#contentmarketing',
  '#youtubeautomation',
  '#smallbusiness',
  '#creatorbusiness',
  '#ecommerce',
  '#ugccreator',
  '#socialmediamarketing',
  '#marketingtips',
  '#productivity',
];

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

function roundProviderUsd(value) {
  return Number(Number(value || 0).toFixed(6));
}

function createProviderBudgetLedger({ hardCapUsd = MANUAL_REFRESH_PER_RUN_CAP_USD } = {}) {
  const hardCap = roundProviderUsd(hardCapUsd);
  if (!Number.isFinite(hardCap) || hardCap <= 0) throw new Error('provider_budget_hard_cap_invalid');
  const stages = new Map();

  const committedFor = (stage) => {
    if (Number.isFinite(stage.calculatedCostUsd)) return stage.calculatedCostUsd;
    if (Number.isFinite(stage.actualCostUsd)) return stage.actualCostUsd;
    return stage.reservedCostUsd;
  };
  const snapshot = () => {
    const values = Array.from(stages.values());
    const committedCostUsd = roundProviderUsd(values.reduce((total, stage) => total + committedFor(stage), 0));
    const estimatedCostUsd = roundProviderUsd(values.reduce((total, stage) => total + stage.estimatedCostUsd, 0));
    const reservedCostUsd = roundProviderUsd(values.reduce((total, stage) => total + stage.reservedCostUsd, 0));
    const knownCostUsd = roundProviderUsd(values.reduce((total, stage) => (
      total
      + (Number.isFinite(stage.calculatedCostUsd)
        ? stage.calculatedCostUsd
        : Number.isFinite(stage.actualCostUsd)
          ? stage.actualCostUsd
          : 0)
    ), 0));
    const complete = values.every((stage) => (
      stage.state === 'completed'
      && (Number.isFinite(stage.actualCostUsd) || Number.isFinite(stage.calculatedCostUsd))
    ));
    return {
      hardCapUsd: hardCap,
      estimatedCostUsd,
      reservedCostUsd,
      actualCostUsd: complete ? knownCostUsd : null,
      committedCostUsd,
      remainingBudgetUsd: roundProviderUsd(Math.max(hardCap - committedCostUsd, 0)),
      stages: Object.fromEntries(values.map((stage) => [stage.name, { ...stage }])),
    };
  };
  const reserve = (name, exposureUsd, { estimatedCostUsd = exposureUsd } = {}) => {
    const stageName = String(name || '').trim();
    const exposure = roundProviderUsd(exposureUsd);
    if (!stageName || !Number.isFinite(exposure) || exposure <= 0) throw new Error('provider_budget_reservation_invalid');
    if (stages.has(stageName)) throw new Error(`provider_budget_stage_already_reserved:${stageName}`);
    const current = snapshot().committedCostUsd;
    if (roundProviderUsd(current + exposure) > hardCap) {
      const error = new Error(`provider_budget_exceeded:${stageName}`);
      error.code = 'provider_budget_exceeded';
      throw error;
    }
    stages.set(stageName, {
      name: stageName,
      state: 'reserved',
      estimatedCostUsd: roundProviderUsd(estimatedCostUsd),
      reservedCostUsd: exposure,
      actualCostUsd: null,
      calculatedCostUsd: null,
      providerRunId: null,
    });
    return snapshot();
  };
  const complete = (name, { actualCostUsd = null, calculatedCostUsd = null, providerRunId = null } = {}) => {
    const stage = stages.get(String(name || '').trim());
    if (!stage) throw new Error(`provider_budget_stage_not_reserved:${name}`);
    const actual = actualCostUsd === null || actualCostUsd === undefined ? null : Number(actualCostUsd);
    const calculated = calculatedCostUsd === null || calculatedCostUsd === undefined ? null : Number(calculatedCostUsd);
    stage.actualCostUsd = Number.isFinite(actual) && actual >= 0 ? roundProviderUsd(actual) : null;
    stage.calculatedCostUsd = Number.isFinite(calculated) && calculated >= 0 ? roundProviderUsd(calculated) : null;
    stage.providerRunId = providerRunId ? String(providerRunId) : null;
    stage.state = 'completed';
    if (snapshot().committedCostUsd > hardCap) throw new Error(`provider_budget_exceeded:${name}`);
    return snapshot();
  };
  const fail = (name) => {
    const stage = stages.get(String(name || '').trim());
    if (stage) stage.state = 'failed';
    return snapshot();
  };
  return { reserve, complete, fail, snapshot };
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

function cloneAuditValue(value) {
  try {
    return JSON.parse(JSON.stringify(value, (key, nestedValue) => (
      /^(authorization|cookie|token|apiKey|api_key|secret|password)$/i.test(key)
        ? undefined
        : nestedValue
    )));
  } catch {
    return null;
  }
}

function sanitizeAutomaticDiscoveryTrace(value) {
  const omitKeys = /^(caption|authorization|cookie|token|apiKey|api_key|secret|password|databaseUrl|database_url|connectionString|connection_string|rawProviderPayload|uploadUrl)$/i;
  const visit = (item, key = '') => {
    if (omitKeys.test(key)) return undefined;
    if (typeof item === 'string') return sanitizeDiagnosticExport(item);
    if (Array.isArray(item)) return item.map((entry) => visit(entry)).filter((entry) => entry !== undefined);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item)
        .map(([nestedKey, nestedValue]) => [nestedKey, visit(nestedValue, nestedKey)])
        .filter(([, nestedValue]) => nestedValue !== undefined));
    }
    return item;
  };
  return visit(value);
}

function summarizeCandidateForAudit(signal = {}) {
  const sourceUrl = canonicalizeSignalUrl(getSignalSourceUrl(signal));
  return sanitizeAutomaticDiscoveryTrace({
    id: signal.id || null,
    stableId: signal.importedMetadata?.externalId
      || signal.importedMetadata?.tiktokVideoId
      || signal.importedMetadata?.shortcode
      || null,
    platform: normalizeLower(signal.importedMetadata?.platform || signal.sourceType),
    sourceHandle: signal.sourceHandle || signal.handle || null,
    canonicalUrl: sourceUrl ? sanitizeUrl(sourceUrl) : null,
    sourceRelationship: signal.sourceRelationship || signal.importedMetadata?.sourceRelationship || null,
    views: Number.isFinite(Number(signal.views)) ? Number(signal.views) : null,
    shares: Number.isFinite(Number(signal.shares)) ? Number(signal.shares) : null,
    saves: Number.isFinite(Number(signal.saves)) ? Number(signal.saves) : null,
    durationSeconds: Number.isFinite(Number(signal.durationSeconds ?? signal.duration ?? signal.importedMetadata?.durationSeconds ?? signal.importedMetadata?.duration))
      ? Number(signal.durationSeconds ?? signal.duration ?? signal.importedMetadata?.durationSeconds ?? signal.importedMetadata?.duration)
      : null,
    protectedIntent: Number.isFinite(Number(signal.protectedIntent)) ? Number(signal.protectedIntent) : null,
    rankingScore: Number.isFinite(Number(signal.rankingScore)) ? Number(signal.rankingScore) : null,
    rankingVersion: signal.rankingVersion || null,
    identityKeys: getSignalIdentityKeys(signal),
  });
}

function hashAuditPayload(value) {
  if (value === null || value === undefined) return null;
  try {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  } catch {
    return null;
  }
}

function summarizeGeminiResponseEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const safeKeys = ['id', 'interaction', 'model', 'status', 'finish_reason', 'finishReason'];
  return sanitizeAutomaticDiscoveryTrace(Object.fromEntries(
    safeKeys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]),
  ));
}

function canonicalizeSignalUrl(value) {
  const raw = normalizeText(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    const youtubeVideoId = url.hostname === 'youtube.com' && url.pathname.replace(/\/+$/, '') === '/watch'
      ? url.searchParams.get('v')
      : '';
    url.search = youtubeVideoId ? `?v=${encodeURIComponent(youtubeVideoId)}` : '';
    url.hash = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}${url.search}`;
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
    brief.audience,
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

  return uniqueValues(
    [
      ...values.map((value) => normalizeText(value).toLowerCase()),
      ...BOOTSTRAP_KEYWORDS,
    ],
    MAX_INPUTS_PER_LANE
  );
}

function collectHashtagCandidates(workspace = {}, state = {}, workspaceId) {
  const brief = workspace.brief || {};
  const values = [
    brief.businessType,
    brief.niche,
    brief.product,
    brief.audience,
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
    [
      ...values
        .map((value) => slugForHashtag(value))
        .filter(Boolean)
        .map((value) => `#${value}`),
      ...BOOTSTRAP_HASHTAGS,
    ],
    MAX_INPUTS_PER_LANE
  );
}

function buildTrendCandidates(platform, workspace = {}) {
  const brief = workspace.brief || {};
  const businessType = normalizeText(brief.businessType || 'business').toLowerCase();
  const niche = normalizeText(brief.niche || brief.businessType || 'niche').toLowerCase();
  const product = normalizeText(brief.product || brief.contentFocus || 'content').toLowerCase();
  const audience = normalizeText(brief.audience || brief.product || 'audience').toLowerCase();
  const location = normalizeText(brief.location || 'global').toLowerCase();
  const goal = normalizeText(Array.isArray(brief.goals) ? brief.goals[0] : '').toLowerCase();

  return uniqueValues([
    `${platform} ${businessType} trends`,
    `${platform} ${niche} hooks`,
    `${platform} ${product} ideas`,
    `${platform} ${audience} content`,
    `${location} ${businessType} examples`,
    `${product} before after`,
    `${goal || 'lead generation'} content`,
    `${niche} mistakes to avoid`,
    `${businessType} creator trends`,
    ...BOOTSTRAP_KEYWORDS.map((keyword) => `${platform} ${keyword}`),
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

function buildDiscoveryInputs(state = {}, workspaceId, options = {}) {
  const storedWorkspace = getWorkspace(state, workspaceId) || {};
  const workspace = options.brandBrain && typeof options.brandBrain === 'object'
    ? { ...storedWorkspace, brief: options.brandBrain }
    : storedWorkspace;
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

function getCommittedDiscoveryRunCost(run = {}) {
    const hasActualCost = run.actualCostUsd !== null
      && run.actualCostUsd !== undefined
      && Number.isFinite(Number(run.actualCostUsd))
      && Number(run.actualCostUsd) >= 0;
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
      return { amount: 0, isEstimated: false };
    }
    const amount = hasActualCost
      ? actualCostUsd
      : Number.isFinite(reservedCostUsd) && reservedCostUsd > 0
        ? reservedCostUsd
      : run.status === 'running' && Number.isFinite(estimatedCostUsd) && estimatedCostUsd > 0
        ? estimatedCostUsd
        : 0;
    return {
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      isEstimated: !hasActualCost && Number.isFinite(amount) && amount > 0,
    };
}

function getAutomaticSpendSummary(runs = [], workspaceId, now = new Date(), period = 'day') {
  const date = toDate(now);
  const periodKey = period === 'month' ? date.toISOString().slice(0, 7) : toUtcDayKey(date);
  let total = 0;
  let isEstimated = false;
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || run.workspaceId !== workspaceId) continue;
    const runTimestamp = run.claimedAt || run.startedAt || run.createdAt || run.completedAt;
    const runDate = toDate(runTimestamp);
    const runPeriodKey = period === 'month' ? runDate.toISOString().slice(0, 7) : toUtcDayKey(runDate);
    if (!runPeriodKey || runPeriodKey !== periodKey) continue;
    const cost = getCommittedDiscoveryRunCost(run);
    total += cost.amount;
    if (cost.isEstimated) isEstimated = true;
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

function getSignalRankingTieKey(reel = {}) {
  const metadata = reel.importedMetadata || {};
  const platform = normalizeLower(
    metadata.platform
    || metadata.providerPlatform
    || metadata.source?.tone
    || reel.sourceType
    || ''
  );
  const providerId = normalizeLower(
    metadata.externalId
    || metadata.tiktokVideoId
    || metadata.shortCode
    || ''
  );
  const canonicalUrl = normalizeLower(canonicalizeSignalUrl(
    getSignalSourceUrl(reel)
    || metadata.url
    || ''
  ));
  const stableIdentity = providerId
    ? `id:${providerId}`
    : canonicalUrl
      ? `url:${canonicalUrl}`
      : '';

  if (stableIdentity) {
    return JSON.stringify(['identity', platform, stableIdentity]);
  }

  return JSON.stringify([
    'metadata',
    platform,
    normalizeLower(metadata.handle || reel.handle || reel.sourceHandle || ''),
    normalizeLower(metadata.title || reel.title || ''),
    normalizeLower(metadata.description || reel.caption || ''),
    normalizeLower(metadata.publishedAt || reel.publishedAt || ''),
    normalizeLower(metadata.duration || reel.duration || ''),
    Number(reel.views || metadata.stats?.views || 0),
    Number(reel.likes || metadata.stats?.likes || 0),
    Number(reel.comments || metadata.stats?.comments || 0),
    Number(reel.shares || metadata.stats?.shares || 0),
    Number(reel.saves || metadata.stats?.saves || 0),
  ]);
}

function toRankingNumber(value) {
  try {
    return Number(value);
  } catch {
    return Number.NaN;
  }
}

function hasKnownRankingMetric(value) {
  if (value === null || value === undefined || value === '') return false;
  const number = toRankingNumber(value);
  return Number.isFinite(number) && number >= 0;
}

function safeRankingMetric(value) {
  const number = toRankingNumber(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(number, Number.MAX_SAFE_INTEGER);
}

function getFirstPresentRankingValue(values = []) {
  return values.find((value) => value !== null && value !== undefined && value !== '');
}

function getSignalRankingMetric(reel = {}, key) {
  return getFirstPresentRankingValue([
    reel[key],
    reel.importedMetadata?.stats?.[key],
    reel.importedMetadata?.rawStats?.[key],
  ]);
}

function getSignalRankingDuration(reel = {}) {
  return getFirstPresentRankingValue([
    reel.duration,
    reel.importedMetadata?.duration,
  ]);
}

function getExplicitRankingAvailability(reel = {}, key) {
  const availabilityKey = `${key}Available`;
  const direct = reel[availabilityKey];
  if (typeof direct === 'boolean') return direct;
  const nested = reel.importedMetadata?.rankingAvailability?.[availabilityKey];
  return typeof nested === 'boolean' ? nested : null;
}

function inspectRankingMetric(reel = {}, key) {
  const value = key === 'duration'
    ? getSignalRankingDuration(reel)
    : getSignalRankingMetric(reel, key);
  const explicitAvailability = getExplicitRankingAvailability(reel, key);
  if (explicitAvailability === false) {
    const explicitStatus = reel.rankingMetadataStatus
      || reel.importedMetadata?.rankingAvailability?.rankingMetadataStatus;
    return {
      available: false,
      invalid: explicitStatus === 'invalid_ranking_metadata',
      value: null,
    };
  }
  if (value === null || value === undefined || value === '') {
    return { available: false, invalid: false, value: null };
  }
  const number = toRankingNumber(value);
  if (!Number.isFinite(number) || number < 0) {
    return { available: false, invalid: true, value: null };
  }
  return {
    available: explicitAvailability !== false,
    invalid: false,
    value: Math.min(number, Number.MAX_SAFE_INTEGER),
  };
}

function getDailyAutomaticSpendSummary(runs = [], workspaceId, now = new Date()) {
  return getAutomaticSpendSummary(runs, workspaceId, now, 'day');
}

function getMonthlyAutomaticSpendSummary(runs = [], workspaceId, now = new Date()) {
  return getAutomaticSpendSummary(runs, workspaceId, now, 'month');
}

function assessSignalRankingMetadata(reel = {}) {
  const views = inspectRankingMetric(reel, 'views');
  const shares = inspectRankingMetric(reel, 'shares');
  const saves = inspectRankingMetric(reel, 'saves');
  const duration = inspectRankingMetric(reel, 'duration');
  const protectedIntentAvailable = views.available && shares.available && saves.available;
  const invalid = views.invalid || shares.invalid || saves.invalid || duration.invalid;
  return {
    sharesAvailable: shares.available,
    savesAvailable: saves.available,
    viewsAvailable: views.available,
    durationAvailable: duration.available,
    protectedIntentAvailable,
    rankingMetadataStatus: invalid
      ? 'invalid_ranking_metadata'
      : protectedIntentAvailable
        ? 'ready'
        : 'insufficient_ranking_metadata',
    metrics: { views, shares, saves, duration },
  };
}

function getKnownDurationRankingComponents(value) {
  const duration = safeRankingMetric(value);
  const durationDistance = duration < B_SOFT_DURATION_MIN_SECONDS
    ? B_SOFT_DURATION_MIN_SECONDS - duration
    : duration > B_SOFT_DURATION_MAX_SECONDS
      ? duration - B_SOFT_DURATION_MAX_SECONDS
      : 0;
  return {
    durationDistance,
    durationPrior: 1 / (1 + durationDistance / B_SOFT_DURATION_DECAY_SECONDS),
  };
}

function medianRankingValue(values = []) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rankSignalsByBSoft(signals = []) {
  const candidateBatch = Array.isArray(signals) ? signals : [];
  const knownDurationPriors = candidateBatch
    .map((signal) => assessSignalRankingMetadata(signal).metrics.duration)
    .filter((duration) => duration.available)
    .map((duration) => getKnownDurationRankingComponents(duration.value).durationPrior);
  const missingDurationPrior = medianRankingValue(knownDurationPriors) ?? 1;

  return candidateBatch
    .map((signal) => {
      const rankingAvailability = assessSignalRankingMetadata(signal);
      const safeViews = safeRankingMetric(rankingAvailability.metrics.views.value);
      const safeShares = safeRankingMetric(rankingAvailability.metrics.shares.value);
      const safeSaves = safeRankingMetric(rankingAvailability.metrics.saves.value);
      const intentNumerator = B_SOFT_SHARE_WEIGHT * safeShares
        + B_SOFT_SAVE_WEIGHT * safeSaves;
      const protectedIntent = intentNumerator / Math.max(safeViews, B_SOFT_DENOMINATOR_FLOOR);
      const duration = rankingAvailability.metrics.duration.value;
      const missingDuration = !rankingAvailability.durationAvailable;
      const durationComponents = missingDuration
        ? { durationDistance: null, durationPrior: missingDurationPrior }
        : getKnownDurationRankingComponents(duration);
      const rankingScore = protectedIntent * durationComponents.durationPrior;

      return {
        ...signal,
        rankingVersion: B_SOFT_RANKING_VERSION,
        rankingScore,
        sharesAvailable: rankingAvailability.sharesAvailable,
        savesAvailable: rankingAvailability.savesAvailable,
        viewsAvailable: rankingAvailability.viewsAvailable,
        durationAvailable: rankingAvailability.durationAvailable,
        protectedIntentAvailable: rankingAvailability.protectedIntentAvailable,
        rankingMetadataStatus: rankingAvailability.rankingMetadataStatus,
        rankingComponents: {
          intentNumerator,
          protectedIntent,
          durationPrior: durationComponents.durationPrior,
          durationDistance: durationComponents.durationDistance,
          denominatorFloor: B_SOFT_DENOMINATOR_FLOOR,
          missingDuration,
        },
      };
    })
    .sort(compareSignalsByMetadataRank);
}

function hasMeaningfulRankingSignal(signal = {}) {
  return signal.rankingMetadataStatus === 'ready'
    && signal.protectedIntentAvailable === true
    && Number(signal.rankingComponents?.intentNumerator || 0) > 0
    && Number(signal.rankingScore || 0) > 0;
}

function resolveSignalAdmission(quality = {}) {
  const decision = ['accept', 'reject', 'uncertain'].includes(quality?.decision)
    ? quality.decision
    : 'uncertain';
  return {
    decision,
    admittedToBank: decision === 'accept' && quality?.admittedToBank === true,
  };
}

function getSignalSourceRelationship(signal = {}) {
  return signal.sourceRelationship || signal.importedMetadata?.sourceRelationship || null;
}

function isSignalWithinRequestedSourceScope(signal = {}) {
  return getSignalSourceRelationship(signal) !== 'unrelated';
}

function classifyBlockedRankingBatch({ allCandidates = [], inScopeCandidates = [], rankedCandidates = [] } = {}) {
  if (allCandidates.length > 0 && inScopeCandidates.length === 0) {
    return { code: 'provider_scope_mismatch' };
  }
  if (rankedCandidates.some(hasMeaningfulRankingSignal)) return null;
  if (inScopeCandidates.length > 0
    && rankedCandidates.length > 0
    && rankedCandidates.every((candidate) => candidate.rankingMetadataStatus === 'invalid_ranking_metadata')) {
    return { code: 'invalid_ranking_metadata' };
  }
  return { code: 'insufficient_ranking_metadata' };
}

function compareSignalsByMetadataRank(left = {}, right = {}) {
  const scoreDifference = Number(right.rankingScore || 0) - Number(left.rankingScore || 0);
  if (scoreDifference !== 0) return scoreDifference;

  const leftTieKey = getSignalRankingTieKey(left);
  const rightTieKey = getSignalRankingTieKey(right);
  if (leftTieKey < rightTieKey) return -1;
  if (leftTieKey > rightTieKey) return 1;
  return 0;
}

function getAuditStableId(candidate = {}) {
  return normalizeText(
    candidate.stableId
    || candidate.candidateId
    || candidate.externalId
    || candidate.tiktokVideoId
    || candidate.shortCode
    || candidate.importedMetadata?.externalId
    || candidate.importedMetadata?.tiktokVideoId
    || candidate.importedMetadata?.shortCode
    || '',
  );
}

function getAuditPlatform(candidate = {}) {
  return normalizeLower(
    candidate.platform
    || candidate.importedMetadata?.platform
    || candidate.importedMetadata?.providerPlatform
    || candidate.sourceType
    || '',
  );
}

function getAuditCanonicalUrl(candidate = {}) {
  return canonicalizeSignalUrl(
    candidate.canonicalUrl
    || candidate.sourceUrl
    || candidate.url
    || candidate.importedMetadata?.url
    || candidate.importedMetadata?.webVideoUrl
    || '',
  );
}

function hasSignalFilterAuditFailure(audit = {}) {
  return Boolean(
    audit.failure
    || audit.classifiedFailure
    || audit.providerFailure
    || audit.schemaFailure
    || audit.runtimeFailure
    || audit.executionFailure,
  );
}

function addDecisionMemoryRecord(memory, record = {}) {
  for (const key of Array.isArray(record.identityKeys) ? record.identityKeys : []) {
    const normalizedKey = normalizeLower(key);
    if (normalizedKey && !memory.has(normalizedKey)) memory.set(normalizedKey, record);
  }
}

function resolveNormalizedSignalFilterAuditMemory(audit = {}, workspaceId, policyVersion) {
  if (audit.workspaceId !== workspaceId || Number(audit.policyVersion) !== policyVersion) return null;
  const candidateId = getAuditStableId(audit);
  const platform = getAuditPlatform(audit);
  if (!candidateId || !platform || !Array.isArray(audit.identityKeys)) return null;
  const expectedProviderKey = `${platform}:${normalizeLower(candidateId)}`;
  const identityKeys = [...new Set(audit.identityKeys.map(normalizeLower).filter(Boolean))];
  const providerKeys = identityKeys.filter((key) => !key.startsWith('url:'));
  if (!identityKeys.includes(expectedProviderKey)
    || providerKeys.some((key) => key !== expectedProviderKey)) {
    return null;
  }
  const canonicalUrl = getAuditCanonicalUrl(audit);
  if (!canonicalUrl) return null;
  const canonicalUrlKey = `url:${normalizeLower(canonicalUrl)}`;
  const urlKeys = identityKeys.filter((key) => key.startsWith('url:'));
  if (urlKeys.length !== 1 || urlKeys[0] !== canonicalUrlKey) return null;
  return { candidateId, identityKeys };
}

function getMetadataAuditCandidateCollections(trace = {}) {
  return [
    trace.selectedTopCandidate,
    ...(Array.isArray(trace.topCandidates) ? trace.topCandidates : []),
    ...(Array.isArray(trace.deduplicatedEligibleCandidates) ? trace.deduplicatedEligibleCandidates : []),
    ...(Array.isArray(trace.deduplicatedCandidates) ? trace.deduplicatedCandidates : []),
    ...(Array.isArray(trace.normalizedCandidates) ? trace.normalizedCandidates : []),
    ...(Array.isArray(trace.rawMetadataCandidates) ? trace.rawMetadataCandidates : []),
  ].filter(Boolean);
}

function resolveLegacySignalFilterAuditMemory(state = {}, audit = {}, workspaceId, policyVersion) {
  if (Number(audit.schemaVersion) !== 1 || policyVersion !== 3.1) return null;
  const metadataAuditId = normalizeText(audit.metadataAuditId);
  const candidateId = getAuditStableId(audit);
  if (!metadataAuditId || !candidateId) return null;
  const metadataMatches = (Array.isArray(state.metadataAuditRuns) ? state.metadataAuditRuns : [])
    .filter((trace) => trace?.id === metadataAuditId);
  if (metadataMatches.length !== 1) return null;
  const metadataAudit = metadataMatches[0];
  if (metadataAudit?.state !== 'completed' || metadataAudit?.workspaceId !== workspaceId) return null;
  const availableWorkspaceIds = [audit.workspaceId, metadataAudit.workspaceId]
    .filter(Boolean);
  if (availableWorkspaceIds.some((value) => value !== workspaceId)) return null;

  const selectedTopCandidate = metadataAudit.selectedTopCandidate || metadataAudit.topCandidates?.[0] || null;
  if (!selectedTopCandidate || getAuditStableId(selectedTopCandidate) !== candidateId) return null;
  const matchingCandidates = getMetadataAuditCandidateCollections(metadataAudit)
    .filter((candidate) => getAuditStableId(candidate) === candidateId);
  if (matchingCandidates.length === 0) return null;
  const availableCandidateWorkspaceIds = matchingCandidates
    .map((candidate) => candidate.workspaceId)
    .filter(Boolean);
  if (availableCandidateWorkspaceIds.some((value) => value !== workspaceId)) return null;

  const platforms = [...new Set([selectedTopCandidate, ...matchingCandidates]
    .map(getAuditPlatform)
    .filter(Boolean))];
  if (platforms.length !== 1 || platforms[0] !== 'tiktok') return null;
  const canonicalUrls = [...new Set([selectedTopCandidate, ...matchingCandidates]
    .map(getAuditCanonicalUrl)
    .filter(Boolean))];
  if (canonicalUrls.length !== 1) return null;
  const canonicalUrl = canonicalUrls[0];
  const expectedPathSuffix = `/video/${candidateId}`;
  if (!canonicalUrl.toLowerCase().includes('tiktok.com/') || !canonicalUrl.endsWith(expectedPathSuffix)) return null;
  return {
    candidateId,
    identityKeys: [
      `tiktok:${normalizeLower(candidateId)}`,
      `url:${normalizeLower(canonicalUrl)}`,
    ],
  };
}

function getActiveAnalysisDecisionMemory(state = {}, workspaceId, config = {}, now = new Date()) {
  if (config.rejectionMemory?.enabled === false) return new Map();
  const policyVersion = Number(config.version);
  if (!Number.isFinite(policyVersion)) return new Map();
  const nowMs = toDate(now).getTime();
  const ttlDays = Math.max(0, Number(config.rejectionMemory?.ttlDays || 0));
  const memory = new Map();
  for (const run of Array.isArray(state.discoveryRuns) ? state.discoveryRuns : []) {
    if (run?.workspaceId !== workspaceId) continue;
    for (const decision of Array.isArray(run.qualityDecisions) ? run.qualityDecisions : []) {
      const cachedUntilMs = Date.parse(decision?.cachedUntil || '');
      if (
        !['accept', 'reject', 'uncertain'].includes(decision?.decision)
        || Number(decision.policyVersion) !== policyVersion
        || !Number.isFinite(cachedUntilMs)
        || cachedUntilMs <= nowMs
      ) {
        continue;
      }
      const identityKeys = [...(Array.isArray(decision.identityKeys) ? decision.identityKeys : [])];
      const sourceUrl = canonicalizeSignalUrl(decision.sourceUrl || '');
      if (sourceUrl) identityKeys.push(`url:${normalizeLower(sourceUrl)}`);
      addDecisionMemoryRecord(memory, {
        source: 'discovery',
        decision: decision.decision,
        cachedUntil: decision.cachedUntil,
        identityKeys,
      });
    }
  }

  if (ttlDays <= 0) return memory;
  for (const audit of Array.isArray(state.signalFilterAuditRuns) ? state.signalFilterAuditRuns : []) {
    if (audit?.state !== 'completed'
      || !['accept', 'reject', 'uncertain'].includes(audit?.decision)
      || hasSignalFilterAuditFailure(audit)) {
      continue;
    }
    const completedAt = audit.completedAt || audit.createdAt;
    const completedAtMs = Date.parse(completedAt || '');
    if (!Number.isFinite(completedAtMs)) continue;
    const cachedUntilMs = completedAtMs + ttlDays * DAY_MS;
    if (cachedUntilMs <= nowMs) continue;
    const normalizedMemory = resolveNormalizedSignalFilterAuditMemory(
      audit,
      workspaceId,
      policyVersion,
    );
    const legacyMemory = normalizedMemory || resolveLegacySignalFilterAuditMemory(
      state,
      audit,
      workspaceId,
      policyVersion,
    );
    if (!legacyMemory) continue;
    addDecisionMemoryRecord(memory, {
      source: 'signal_filter_audit',
      auditId: audit.id || null,
      decision: audit.decision,
      admittedToBank: audit.admittedToBank === true,
      cachedUntil: new Date(cachedUntilMs).toISOString(),
      identityKeys: legacyMemory.identityKeys,
    });
  }
  return memory;
}

function isQualityDecisionSuppressionEligible(quality = {}, config = {}) {
  const decision = quality?.decision;
  const policyVersion = Number(quality?.policyVersion);
  const expectedPolicyVersion = Number(config.version);
  if (
    !['accept', 'reject', 'uncertain'].includes(decision)
    || !Number.isFinite(policyVersion)
    || !Number.isFinite(expectedPolicyVersion)
    || policyVersion !== expectedPolicyVersion
  ) {
    return false;
  }
  if (decision === 'accept') return true;
  return decision === 'reject'
    ? Array.isArray(quality.rejectionReasons)
    : Array.isArray(quality.uncertaintyReasons);
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

function buildMetadataAuditCandidateSet(signals = [], context = {}) {
  const now = toDate(context.now || new Date());
  const normalizedCandidates = (Array.isArray(signals) ? signals : [])
    .map((signal, index) => normalizeAutomaticSignal(signal, {
      workspaceId: context.workspaceId,
      market: context.market,
      now,
      createId: (prefix) => `${prefix}_metadata_audit_${index + 1}`,
    }));
  const deduplicatedByIdentity = new Map();

  for (const candidate of normalizedCandidates) {
    const identityKeys = getSignalIdentityKeys(candidate);
    const identity = identityKeys[0] || `tie:${getSignalRankingTieKey(candidate)}`;
    const existing = deduplicatedByIdentity.get(identity);
    deduplicatedByIdentity.set(
      identity,
      existing ? mergeSignalSnapshot(existing, candidate, now) : candidate,
    );
  }

  const deduplicatedCandidates = Array.from(deduplicatedByIdentity.values());
  const inScopeCandidates = deduplicatedCandidates.filter(isSignalWithinRequestedSourceScope);
  const deduplicatedEligibleCandidates = inScopeCandidates.filter(hasActionableSignalEvidence);
  const evaluatedCandidates = rankSignalsByBSoft(deduplicatedEligibleCandidates);
  const rankedCandidates = evaluatedCandidates.filter(hasMeaningfulRankingSignal);
  const classifiedFailure = classifyBlockedRankingBatch({
    allCandidates: deduplicatedCandidates,
    inScopeCandidates,
    rankedCandidates: evaluatedCandidates,
  });

  return {
    normalizedCandidates,
    deduplicatedCandidates,
    inScopeCandidates,
    deduplicatedEligibleCandidates,
    evaluatedCandidates,
    rankedCandidates,
    topCandidates: rankedCandidates.slice(0, 5),
    selectedTopCandidate: rankedCandidates[0] || null,
    classifiedFailure,
  };
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

function planAutomaticDiscoveryCalls(discoveryInputs = {}, platforms = [], options = {}) {
  const calls = [];
  const inputLimit = Math.max(1, Math.trunc(Number(options.inputLimit || AUTOMATIC_INPUTS_PER_LANE)));
  const resultLimit = Math.max(1, Math.trunc(Number(options.resultLimit || AUTOMATIC_METADATA_LIMIT)));
  const resultLimitByPlatform = options.resultLimitByPlatform || {};
  for (const platform of platforms) {
    const platformInputs = discoveryInputs[platform] || {};
    const platformResultLimit = Math.max(
      1,
      Math.trunc(Number(resultLimitByPlatform[platform] || resultLimit))
    );
    for (const lane of DEFAULT_LANES) {
      const inputType = INPUT_TYPE_BY_LANE[lane];
      if (!inputType) continue;
      for (const inputValue of uniqueValues(platformInputs[lane] || [], inputLimit)) {
        calls.push({
          platform,
          lane,
          inputType,
          inputValue,
          limit: platformResultLimit,
          downloadVideo: false,
        });
      }
    }
  }
  return calls;
}

function getPlannedAutomaticDiscoveryCalls(discoveryInputs = {}, platforms = [], lanes = DEFAULT_LANES, options = {}) {
  const allowedLanes = new Set(Array.isArray(lanes) ? lanes : DEFAULT_LANES);
  return planAutomaticDiscoveryCalls(discoveryInputs, platforms, options).filter((call) => allowedLanes.has(call.lane));
}

function selectDiverseDiscoveryCalls(calls = [], platforms = [], maxCalls = AUTOMATIC_MAX_PLANNED_CALLS) {
  const candidates = Array.isArray(calls) ? calls : [];
  const limit = Math.max(1, Math.trunc(Number(maxCalls) || AUTOMATIC_MAX_PLANNED_CALLS));
  const selected = [];
  const used = new Set();
  const orderedPlatforms = uniqueValues(platforms);

  for (let laneIndex = 0; laneIndex < DEFAULT_LANES.length && selected.length < limit; laneIndex += 1) {
    const lane = DEFAULT_LANES[laneIndex];
    const preferredPlatform = orderedPlatforms.length
      ? orderedPlatforms[laneIndex % orderedPlatforms.length]
      : '';
    const call = candidates.find((item) => (
      item.lane === lane
      && item.platform === preferredPlatform
      && !used.has(item)
    )) || candidates.find((item) => item.lane === lane && !used.has(item));
    if (!call) continue;
    selected.push(call);
    used.add(call);
  }

  for (const platform of orderedPlatforms) {
    if (selected.length >= limit) break;
    if (selected.some((call) => call.platform === platform)) continue;
    const call = candidates.find((item) => item.platform === platform && !used.has(item));
    if (!call) continue;
    selected.push(call);
    used.add(call);
  }

  for (const call of candidates) {
    if (selected.length >= limit) break;
    if (used.has(call)) continue;
    selected.push(call);
    used.add(call);
  }

  return selected;
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
    triggerMode: args.triggerMode === MANUAL_REFRESH_TRIGGER_MODE
      ? MANUAL_REFRESH_TRIGGER_MODE
      : SCHEDULED_TRIGGER_MODE,
    platform: 'multi',
    dayKey: toUtcDayKey(now),
    status: 'running',
    budgetUsd: roundUsd(args.budgetUsd),
    dailyBudgetUsd: roundProviderUsd(args.dailyBudgetUsd ?? args.budgetUsd),
    monthlyBudgetUsd: roundProviderUsd(args.monthlyBudgetUsd),
    monthlySpentUsdBefore: roundProviderUsd(args.monthlySpentUsdBefore),
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
    qualityEvaluatedCount: 0,
    qualityInteractionCount: 0,
    qualityRecheckCount: 0,
    qualityCacheHitCount: 0,
    qualityAcceptedCount: 0,
    qualityRejectedCount: 0,
    qualityUncertainCount: 0,
    qualityErrorCount: 0,
    qualityDecisions: [],
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

  const discoveryBrand = resolveWorkspaceDiscoveryBrand(workspace, {
    requireProductBrandBrain: Boolean(args.requireProductBrandBrain),
    activeBrandId: args.activeBrandId,
  });
  if (!discoveryBrand.complete && (args.requireProductBrandBrain || discoveryBrand.productBrand)) {
    const error = new Error(
      discoveryBrand.activeBrandMismatch
        ? 'automatic_discovery_active_brand_mismatch'
        : 'automatic_discovery_brand_brain_incomplete',
    );
    error.status = 422;
    error.payload = {
      error: error.message,
      message: discoveryBrand.activeBrandMismatch
        ? 'The selected redesign brand is not the active backend Brand Brain.'
        : 'Complete the active Brand Brain before refreshing the signal bank.',
      missingFields: discoveryBrand.missingFields,
      activeBrandId: discoveryBrand.ref.activeBrandId,
    };
    throw error;
  }

  ensureWorkspaceDiscoverySettings(workspace, now);
  const settings = getWorkspaceDiscoverySettings(state, workspaceId, now);
  const triggerMode = args.triggerMode === MANUAL_REFRESH_TRIGGER_MODE
    ? MANUAL_REFRESH_TRIGGER_MODE
    : SCHEDULED_TRIGGER_MODE;
  const isManualRefresh = triggerMode === MANUAL_REFRESH_TRIGGER_MODE;
  const rawPolicy = args.policy && typeof args.policy === 'object' ? args.policy : null;
  const policy = rawPolicy ? {
    dailyBudgetUsd: clampNumber(rawPolicy.dailyBudgetUsd, 0.01, MAX_DAILY_BUDGET_USD, DEFAULT_DAILY_BUDGET_USD),
    manualRefreshDailyBudgetUsd: roundProviderUsd(rawPolicy.manualRefreshDailyBudgetUsd ?? MANUAL_REFRESH_DAILY_CAP_USD),
    monthlyBudgetUsd: roundProviderUsd(rawPolicy.monthlyBudgetUsd ?? MANUAL_REFRESH_MONTHLY_CAP_USD),
    perRunBudgetUsd: roundProviderUsd(rawPolicy.perRunBudgetUsd ?? MANUAL_REFRESH_PER_RUN_CAP_USD),
    metadataApifyHardCapUsd: roundProviderUsd(rawPolicy.metadataApifyHardCapUsd ?? MANUAL_METADATA_APIFY_CAP_USD),
    downloadApifyHardCapUsd: roundProviderUsd(rawPolicy.downloadApifyHardCapUsd ?? MANUAL_DOWNLOAD_APIFY_CAP_USD),
    geminiHardCapUsd: roundProviderUsd(rawPolicy.geminiHardCapUsd ?? MANUAL_GEMINI_CAP_USD),
    dailyTarget: Math.max(1, Math.trunc(Number(rawPolicy.dailyTarget || AUTOMATIC_MAX_WINNERS))),
    maxBudgetedRunsPerDay: Math.max(1, Math.trunc(Number(rawPolicy.maxBudgetedRunsPerDay || 1))),
    resultLimitPerPlatform: Math.max(1, Math.trunc(Number(rawPolicy.resultLimitPerPlatform || AUTOMATIC_METADATA_LIMIT))),
    maxPlannedCalls: Math.min(
      AUTOMATIC_MAX_PLANNED_CALLS,
      Math.max(1, Math.trunc(Number(rawPolicy.maxPlannedCalls || 1))),
    ),
  } : null;
  if (policy) {
    settings.dailyBudgetUsd = Math.min(settings.dailyBudgetUsd, policy.dailyBudgetUsd);
    workspace.discoverySettings.dailyBudgetUsd = settings.dailyBudgetUsd;
  }
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

  if (policy) {
    const dayKey = toUtcDayKey(now);
    const budgetedRunsToday = (Array.isArray(state.discoveryRuns) ? state.discoveryRuns : []).filter((run) => {
      if (!run || run.workspaceId !== workspaceId || run.lane !== AUTOMATIC_RUN_LANE) return false;
      const runDayKey = run.dayKey || toUtcDayKey(run.claimedAt || run.startedAt || run.createdAt || run.completedAt);
      if (runDayKey !== dayKey) return false;
      return Number(run.attemptedCallCount || 0) > 0
        || Number(run.reservedCostUsd || 0) > 0
        || Number(run.actualCostUsd || 0) > 0;
    }).length;
    if (budgetedRunsToday >= policy.maxBudgetedRunsPerDay) {
      return createEmptyDiscoveryResult(null, { reason: 'daily_run_limit' });
    }
  }

  if (settings.enabled === false && !isManualRefresh) {
    if (args.recordPaused === false) {
      return createEmptyDiscoveryResult(null, { reason: 'paused' });
    }
    const run = createAutomaticRun(state, {
      workspaceId,
      now,
      triggerMode,
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

  const isForcedRun = Boolean(args.force);
  const planningOptions = policy
    ? {
        inputLimit: 1,
        resultLimit: policy.resultLimitPerPlatform,
      }
    : isForcedRun
    ? {
        inputLimit: FORCED_AUTOMATIC_INPUTS_PER_LANE,
        resultLimit: FORCED_AUTOMATIC_METADATA_LIMIT,
        resultLimitByPlatform: {
          instagram: FORCED_AUTOMATIC_INSTAGRAM_METADATA_LIMIT,
        },
      }
    : {};
  const discoveryInputs = buildDiscoveryInputs(state, workspaceId, {
    brandBrain: discoveryBrand.brief,
  });
  const candidateCalls = getPlannedAutomaticDiscoveryCalls(discoveryInputs, settings.platforms, dueLanes, planningOptions);
  const unsupportedCandidateCalls = candidateCalls.filter((call) => (
    !getApifyInputSupport({
      platform: call.platform,
      inputType: call.inputType,
      inputValue: call.inputValue,
    }).supported
  ));
  const supportedCandidateCalls = candidateCalls.filter((call) => (
    getApifyInputSupport({
      platform: call.platform,
      inputType: call.inputType,
      inputValue: call.inputValue,
    }).supported
  ));
  const plannedCalls = policy
    ? selectDiverseDiscoveryCalls(supportedCandidateCalls, settings.platforms, policy.maxPlannedCalls)
    : selectDiverseDiscoveryCalls(supportedCandidateCalls, settings.platforms, AUTOMATIC_MAX_PLANNED_CALLS);
  const lanesWithCalls = new Set(plannedCalls.map((call) => call.lane));
  const emptyLanes = dueLanes.filter((lane) => !lanesWithCalls.has(lane));
  applyNormalLaneSchedules(workspace, settings, emptyLanes, now);
  if (!plannedCalls.length) {
    if (unsupportedCandidateCalls.length) {
      const spentWithoutProviderCall = getDailyAutomaticSpend(state.discoveryRuns, workspaceId, now);
      const monthlyWithoutProviderCall = getMonthlyAutomaticSpendSummary(state.discoveryRuns, workspaceId, now);
      const run = createAutomaticRun(state, {
        workspaceId,
        now,
        triggerMode,
        budgetUsd: policy?.perRunBudgetUsd || settings.dailyBudgetUsd,
        dailyBudgetUsd: policy?.manualRefreshDailyBudgetUsd || settings.dailyBudgetUsd,
        monthlyBudgetUsd: policy?.monthlyBudgetUsd || 0,
        monthlySpentUsdBefore: monthlyWithoutProviderCall.amountUsd,
        spentUsdBefore: spentWithoutProviderCall,
        estimatedCostUsd: 0,
        reservedCostUsd: 0,
        requestedCount: 0,
      });
      if (!run) return createEmptyDiscoveryResult(null, { reason: 'active_run' });
      const unsupportedSummary = unsupportedCandidateCalls.map((call) => {
        const support = getApifyInputSupport({
          platform: call.platform,
          inputType: call.inputType,
          inputValue: call.inputValue,
        });
        return {
          platform: call.platform,
          lane: call.lane,
          inputType: call.inputType,
          code: support.code,
          reason: support.reason,
        };
      });
      run.status = 'failed';
      run.classifiedFailure = {
        code: 'provider_input_unsupported',
        reason: 'no_supported_provider_input',
        unsupportedCalls: unsupportedSummary,
      };
      run.errorCount = 1;
      run.errors.push({
        code: 'provider_input_unsupported',
        message: 'No planned discovery input satisfies the provider contract.',
        status: 422,
      });
      run.auditTrace = {
        version: 1,
        runId: run.id,
        triggerMode,
        workspace: {
          id: workspaceId,
          brandBrainSource: discoveryBrand.source,
          brandBrainRef: { ...discoveryBrand.ref },
        },
        plan: {
          metadataBeforeMedia: true,
          plannedCalls: [],
          unsupportedCalls: unsupportedSummary,
          maxMetadataCalls: policy?.maxPlannedCalls || AUTOMATIC_MAX_PLANNED_CALLS,
          maxMediaDownloads: 1,
          maxVideoAnalyses: 1,
          concurrency: 1,
          retries: 0,
          fallbacks: 0,
        },
        counts: {
          raw: 0,
          normalized: 0,
          deduplicated: 0,
          inScope: 0,
          eligible: 0,
          suppressed: 0,
        },
        candidates: [],
        rawMetadataCandidates: [],
        normalizedEligibleCandidates: [],
        suppressedCandidates: [],
        topCandidates: [],
        selectedTopCandidate: null,
        failure: {
          stage: 'metadata_input',
          code: 'provider_input_unsupported',
          message: 'No planned discovery input satisfies the provider contract.',
          status: 422,
        },
        providerCost: { estimatedUsd: 0, actualUsd: 0, geminiEstimatedUsd: null },
        apifyRuns: { metadata: [], download: null },
        mutationSnapshot: { before: null, after: null, bankDelta: 0, collectionDelta: 0 },
      };
      run.actualCostUsd = 0;
      run.completedAt = now.toISOString();
      run.updatedAt = now.toISOString();
      run.auditTrace = sanitizeAutomaticDiscoveryTrace(run.auditTrace);
      return createEmptyDiscoveryResult(run, { reason: 'provider_input_unsupported' });
    }
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
  const monthlySpend = getMonthlyAutomaticSpendSummary(state.discoveryRuns, workspaceId, now);
  const estimatedMetadataCostUsd = roundUsd(
    plannedCalls.reduce((total, call) => total + estimateDiscoveryCallCostUsd(call), 0)
  );
  const dailyBudgetUsd = isManualRefresh
    ? policy?.manualRefreshDailyBudgetUsd || MANUAL_REFRESH_DAILY_CAP_USD
    : settings.dailyBudgetUsd;
  const monthlyBudgetUsd = isManualRefresh
    ? policy?.monthlyBudgetUsd || MANUAL_REFRESH_MONTHLY_CAP_USD
    : 0;
  const perRunBudgetUsd = isManualRefresh
    ? policy?.perRunBudgetUsd || MANUAL_REFRESH_PER_RUN_CAP_USD
    : settings.dailyBudgetUsd;
  const metadataReservationUsd = isManualRefresh
    ? policy?.metadataApifyHardCapUsd || MANUAL_METADATA_APIFY_CAP_USD
    : estimatedMetadataCostUsd;
  const estimateExceedsBudget = spentUsd + metadataReservationUsd > dailyBudgetUsd;
  const monthlyEstimateExceedsBudget = isManualRefresh
    && monthlySpend.amountUsd + metadataReservationUsd > monthlyBudgetUsd;
  if (spentUsd >= dailyBudgetUsd || estimateExceedsBudget || monthlyEstimateExceedsBudget) {
    applyBudgetLaneSchedules(workspace, settings, DEFAULT_LANES, now);
    const run = createAutomaticRun(state, {
      workspaceId,
      now,
      triggerMode,
      budgetUsd: perRunBudgetUsd,
      dailyBudgetUsd,
      monthlyBudgetUsd,
      monthlySpentUsdBefore: monthlySpend.amountUsd,
      spentUsdBefore: spentUsd,
      estimatedCostUsd: policy ? estimatedMetadataCostUsd : 0,
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
    triggerMode,
    budgetUsd: perRunBudgetUsd,
    dailyBudgetUsd,
    monthlyBudgetUsd,
    monthlySpentUsdBefore: monthlySpend.amountUsd,
    spentUsdBefore: spentUsd,
    estimatedCostUsd: estimatedMetadataCostUsd,
    reservedCostUsd: metadataReservationUsd,
    requestedCount: plannedCalls.length,
  });
  if (!run) return createEmptyDiscoveryResult(null, { reason: 'active_run' });
  run.auditTrace = {
    version: 1,
    runId: run.id,
    triggerMode,
    workspace: {
      id: workspaceId,
      brandBrainSource: discoveryBrand.source,
      brandBrainRef: { ...discoveryBrand.ref },
    },
    plan: {
      metadataBeforeMedia: true,
      canonicalDeduplicationBeforeRanking: true,
      rankingVersion: B_SOFT_RANKING_VERSION,
      plannedCalls: plannedCalls.map((call) => ({ ...call })),
      maxMetadataCalls: AUTOMATIC_MAX_PLANNED_CALLS,
      maxMediaDownloads: 1,
      maxVideoAnalyses: 1,
      concurrency: 1,
      retries: 0,
      fallbacks: 0,
    },
    counts: {
      raw: 0,
      normalized: 0,
      deduplicated: 0,
      inScope: 0,
      eligible: 0,
      suppressed: 0,
    },
    candidates: [],
    rawMetadataCandidates: [],
    normalizedEligibleCandidates: [],
    suppressedCandidates: [],
    topCandidates: [],
    selectedTopCandidate: null,
    download: {
      attempted: false,
      result: 'not_attempted',
      mediaSha256: null,
    },
    gemini: {
      attempted: false,
      rawResponse: null,
      parsedResult: null,
      usage: null,
      normalizedUsage: null,
      model: null,
      calculatedCostUsd: null,
      conservativeCostUsd: null,
      httpOperations: null,
    },
    signalFilter: {
      decision: null,
      admittedToBank: false,
      rejectionReasons: [],
      uncertaintyReasons: [],
    },
    failure: null,
    providerCost: {
      estimatedUsd: run.estimatedCostUsd,
      actualUsd: null,
      geminiEstimatedUsd: null,
    },
    apifyRuns: {
      metadata: [],
      download: null,
    },
    budgetLedger: null,
    mutationSnapshot: {
      before: null,
      after: null,
      bankDelta: 0,
      collectionDelta: 0,
    },
  };
  return {
    run,
    acceptedSignals: [],
    updatedSignals: [],
    execution: {
      discoveryInputs,
      dueLanes,
      plannedCalls,
      maxWinners: policy ? policy.dailyTarget : isForcedRun ? FORCED_AUTOMATIC_MAX_WINNERS : AUTOMATIC_MAX_WINNERS,
      maxWinnerDownloads: isForcedRun
        ? FORCED_AUTOMATIC_MAX_WINNER_DOWNLOADS
        : AUTOMATIC_MAX_WINNER_DOWNLOADS,
      triggerMode,
      budgetPolicy: isManualRefresh ? {
        perRunCapUsd: perRunBudgetUsd,
        dailyCapUsd: dailyBudgetUsd,
        monthlyCapUsd: monthlyBudgetUsd,
        metadataApifyHardCapUsd: policy?.metadataApifyHardCapUsd || MANUAL_METADATA_APIFY_CAP_USD,
        downloadApifyHardCapUsd: policy?.downloadApifyHardCapUsd || MANUAL_DOWNLOAD_APIFY_CAP_USD,
        geminiHardCapUsd: policy?.geminiHardCapUsd || MANUAL_GEMINI_CAP_USD,
      } : null,
      discoveryBrand,
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
    maxWinners = AUTOMATIC_MAX_WINNERS,
    maxWinnerDownloads = AUTOMATIC_MAX_WINNER_DOWNLOADS,
    discoveryBrand,
    settings,
    triggerMode = SCHEDULED_TRIGGER_MODE,
    budgetPolicy = null,
  } = prepared.execution;
  const auditTrace = run.auditTrace || null;
  const isManualRefresh = triggerMode === MANUAL_REFRESH_TRIGGER_MODE;
  const budgetLedger = isManualRefresh
    ? createProviderBudgetLedger({ hardCapUsd: budgetPolicy?.perRunCapUsd || MANUAL_REFRESH_PER_RUN_CAP_USD })
    : null;
  const qualityRuntimeGuards = args.qualityRuntimeGuards || null;
  const discoveryWorkspace = discoveryBrand?.brief
    ? { ...workspace, brief: discoveryBrand.brief }
    : workspace;
  const evaluateSignalQuality = typeof args.evaluateSignalQuality === 'function'
    ? args.evaluateSignalQuality
    : null;
  const maxQualityEvaluations = evaluateSignalQuality
    ? Math.min(1, Math.max(1, Math.trunc(Number(args.maxQualityEvaluations || 1))))
    : 0;
  const qualityGateConfig = args.qualityGateConfig || {};
  const maxQualityRechecks = evaluateSignalQuality
    ? Math.max(0, Math.trunc(Number(qualityGateConfig.borderlineReview?.maxRechecksPerRun || 0)))
    : 0;
  const decisionSuppressionTtlDays = Math.max(
    0,
    Number(qualityGateConfig.rejectionMemory?.ttlDays || 0),
  );
  const activeAnalysisDecisionMemory = getActiveAnalysisDecisionMemory(
    state,
    workspaceId,
    qualityGateConfig,
    now,
  );
  const spentUsd = run.spentUsdBefore;

  const fetchSignals = typeof args.fetchSignals === 'function' ? args.fetchSignals : fetchApifySignals;
  const market = getWorkspaceMarket(workspace);
  const reels = Array.isArray(state.reels) ? state.reels : (state.reels = []);
  const bankCountBefore = reels.filter((signal) => (
    signal?.workspaceId === workspaceId
    && signal?.importedMetadata?.qualityGate?.decision === 'accept'
    && signal?.importedMetadata?.qualityGate?.admittedToBank === true
  )).length;
  if (auditTrace) {
    auditTrace.mutationSnapshot.before = {
      reels: reels.filter((signal) => signal?.workspaceId === workspaceId).length,
      bank: bankCountBefore,
      collection: bankCountBefore,
    };
  }
  const existingByIdentity = getExistingReelsByIdentity(state, workspaceId);
  const candidateIdsByIdentity = new Map();
  const candidatesById = new Map();
  const updatedSignalsById = new Map();
  const pendingSignalUpdatesById = new Map();
  let successfulCalls = 0;
  let billedCostUsd = 0;
  let hasCompleteBilledCost = true;
  let qualityGateTechnicalFailure = false;
  const laneStats = new Map();
  const getCurrentTime = typeof args.getCurrentTime === 'function'
    ? args.getCurrentTime
    : () => new Date();

  function syncBudgetLedger() {
    if (!budgetLedger) return null;
    const snapshot = budgetLedger.snapshot();
    run.reservedCostUsd = snapshot.committedCostUsd;
    run.actualCostUsd = snapshot.actualCostUsd;
    if (auditTrace) auditTrace.budgetLedger = snapshot;
    return snapshot;
  }

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
        runId: result.runId || null,
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
      runId: result?.runId || null,
      actualCostUsd: actualCostUsd === null || actualCostUsd === undefined
        ? null
        : Number(actualCostUsd),
    };
  }

  function recordBilledCost(value) {
    if (Number.isFinite(value) && value >= 0) {
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
    if (budgetLedger) {
      try {
        budgetLedger.reserve('metadata', budgetPolicy.metadataApifyHardCapUsd, {
          estimatedCostUsd: callEstimateUsd,
        });
        syncBudgetLedger();
      } catch (error) {
        run.errorCount += 1;
        run.errors.push({ lane: call.lane, code: error.code || 'provider_budget_exceeded', message: error.message, status: 429 });
        if (auditTrace) auditTrace.failure = { stage: 'metadata_budget', code: error.code || 'provider_budget_exceeded', status: 429 };
        break;
      }
    }
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
        ...(budgetLedger ? {
          maxTotalChargeUsd: budgetPolicy.metadataApifyHardCapUsd,
          maxItems: call.limit,
          retries: 0,
          fallbacks: 0,
        } : {}),
      });
      const { signals: fetchedSignals, actualCostUsd, runId } = unpackProviderResult(providerResult);
      if (auditTrace) {
        auditTrace.counts.raw += Array.isArray(fetchedSignals) ? fetchedSignals.length : 0;
        const candidateSummaries = (Array.isArray(fetchedSignals) ? fetchedSignals : [])
          .map(summarizeCandidateForAudit)
          .filter(Boolean);
        auditTrace.candidates.push(...candidateSummaries);
        auditTrace.rawMetadataCandidates.push(...candidateSummaries.map((candidate) => ({ ...candidate })));
        auditTrace.apifyRuns.metadata.push({
          runId: runId || null,
          actualCostUsd: Number.isFinite(actualCostUsd) ? actualCostUsd : null,
          hardCapUsd: budgetPolicy?.metadataApifyHardCapUsd || null,
          maxItems: call.limit,
        });
      }
      if (budgetLedger) {
        budgetLedger.complete('metadata', { actualCostUsd, providerRunId: runId });
        syncBudgetLedger();
      }
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
          const refreshedSignal = mergeSignalSnapshot(existingSignal, normalizedSignal, now);
          pendingSignalUpdatesById.set(refreshedSignal.id, {
            target: existingSignal,
            value: refreshedSignal,
          });
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
      if (budgetLedger) {
        try {
          budgetLedger.complete('metadata', {
            actualCostUsd: error?.actualCostUsd,
            providerRunId: error?.runId,
          });
        } catch {
          budgetLedger.fail('metadata');
        }
        syncBudgetLedger();
      }
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

  const deduplicatedCandidates = Array.from(candidatesById.values());
  const inScopeCandidates = deduplicatedCandidates.filter(isSignalWithinRequestedSourceScope);
  const eligibleSignals = inScopeCandidates
    .filter(hasActionableSignalEvidence)
    .filter((signal) => {
      const matchingMemory = getSignalIdentityKeys(signal)
        .map((key) => activeAnalysisDecisionMemory.get(key))
        .find(Boolean);
      if (matchingMemory) {
        run.qualityCacheHitCount += 1;
        if (auditTrace) {
          auditTrace.suppressedCandidates.push({
            ...summarizeCandidateForAudit(signal),
            decision: matchingMemory.decision || null,
            cachedUntil: matchingMemory.cachedUntil || null,
            memorySource: matchingMemory.source || null,
            auditId: matchingMemory.auditId || null,
          });
        }
      }
      return !matchingMemory;
    });
  const evaluatedSignals = rankSignalsByBSoft(eligibleSignals);
  const rankedSignals = evaluatedSignals.filter(hasMeaningfulRankingSignal);
  const classifiedRankingFailure = classifyBlockedRankingBatch({
    allCandidates: deduplicatedCandidates,
    inScopeCandidates,
    rankedCandidates: evaluatedSignals,
  });
  const rankingBlocked = Boolean(classifiedRankingFailure);
  if (rankingBlocked) {
    run.classifiedFailure = classifiedRankingFailure;
    run.errorCount += 1;
    run.errors.push({
      code: classifiedRankingFailure.code,
      message: classifiedRankingFailure.code,
      status: 422,
    });
  } else {
    for (const { target, value } of pendingSignalUpdatesById.values()) {
      Object.assign(target, value);
      updatedSignalsById.set(value.id, value);
    }
  }
  if (auditTrace) {
    auditTrace.counts.normalized = run.returnedCount;
    auditTrace.counts.deduplicated = deduplicatedCandidates.length;
    auditTrace.counts.inScope = inScopeCandidates.length;
    auditTrace.counts.eligible = evaluatedSignals.length;
    auditTrace.counts.suppressed = run.qualityCacheHitCount;
    auditTrace.normalizedEligibleCandidates = evaluatedSignals.map(summarizeCandidateForAudit).filter(Boolean);
    auditTrace.topCandidates = rankedSignals.slice(0, 5).map(summarizeCandidateForAudit).filter(Boolean);
    if (rankingBlocked) {
      auditTrace.failure = {
        stage: 'metadata_ranking',
        code: classifiedRankingFailure.code,
        message: classifiedRankingFailure.code,
        status: 422,
      };
    }
  }
  const shortlistLimit = evaluateSignalQuality
    ? Math.min(maxWinners, maxQualityEvaluations)
    : maxWinners;
  const shortlistedSignals = rankedSignals
    .slice(0, shortlistLimit);

  if (auditTrace) {
    auditTrace.selectedTopCandidate = shortlistedSignals[0]
      ? summarizeCandidateForAudit(shortlistedSignals[0])
      : null;
  }

  run.rejectedCount = Math.max(candidatesById.size - shortlistedSignals.length, 0);

  const acceptedSignals = [];
  let winnerDownloadCount = 0;
  for (const shortlistedSignal of shortlistedSignals) {
    let acceptedSignal = shortlistedSignal;
    let candidateHadTechnicalFailure = false;
    const platform = normalizeLower(shortlistedSignal.importedMetadata?.platform);
    const winnerDownloadLimit = evaluateSignalQuality
      ? Math.min(maxWinnerDownloads, maxQualityEvaluations)
      : maxWinnerDownloads;
    if (['instagram', 'tiktok'].includes(platform) && winnerDownloadCount < winnerDownloadLimit) {
      const downloadInput = sanitizeUrl(shortlistedSignal.sourceUrl || shortlistedSignal.importedMetadata?.url || '');
      const downloadCall = {
        platform,
        lane: 'winner',
        inputType: 'url',
        inputValue: downloadInput,
        limit: AUTOMATIC_DOWNLOAD_LIMIT,
        downloadVideo: true,
      };
      const downloadEstimateUsd = estimateDiscoveryCallCostUsd(downloadCall);
      if (auditTrace) {
        auditTrace.download = {
          attempted: Boolean(downloadInput),
          result: downloadInput ? 'running' : 'missing_source_url',
          platform,
          sourceUrl: downloadInput ? sanitizeUrl(downloadInput) : null,
          estimatedCostUsd: downloadEstimateUsd,
          actualCostUsd: null,
          mediaSha256: null,
        };
      }
      let downloadBudgetAvailable = Boolean(downloadInput);
      if (downloadBudgetAvailable && budgetLedger) {
        try {
          const currentCommitment = budgetLedger.snapshot().committedCostUsd;
          const exposure = budgetPolicy.downloadApifyHardCapUsd;
          if (spentUsd + currentCommitment + exposure > run.dailyBudgetUsd) throw new Error('manual_refresh_daily_budget_exceeded');
          if (run.monthlySpentUsdBefore + currentCommitment + exposure > run.monthlyBudgetUsd) throw new Error('manual_refresh_monthly_budget_exceeded');
          budgetLedger.reserve('download', exposure, { estimatedCostUsd: downloadEstimateUsd });
          syncBudgetLedger();
        } catch (error) {
          downloadBudgetAvailable = false;
          candidateHadTechnicalFailure = true;
          run.errorCount += 1;
          run.errors.push({ lane: 'winner_budget', code: error.code || error.message, message: error.message, status: 429 });
          if (auditTrace) auditTrace.failure = { stage: 'download_budget', code: error.code || error.message, status: 429 };
        }
      }
      if (downloadInput && downloadBudgetAvailable && (
        budgetLedger || spentUsd + run.reservedCostUsd + downloadEstimateUsd <= settings.dailyBudgetUsd
      )) {
        winnerDownloadCount += 1;
        run.estimatedCostUsd = roundUsd(run.estimatedCostUsd + downloadEstimateUsd);
        if (!budgetLedger) run.reservedCostUsd = roundUsd(run.reservedCostUsd + downloadEstimateUsd);
        run.attemptedCallCount += 1;
        await reportProgress();
        try {
          const providerResult = await fetchSignals({
            token: args.token,
            platform,
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
            ...(budgetLedger ? {
              maxTotalChargeUsd: budgetPolicy.downloadApifyHardCapUsd,
              maxItems: AUTOMATIC_DOWNLOAD_LIMIT,
              retries: 0,
              fallbacks: 0,
            } : {}),
          });
          const { signals: downloadedSignals, actualCostUsd, runId } = unpackProviderResult(providerResult);
          if (auditTrace) {
            auditTrace.download.actualCostUsd = Number.isFinite(actualCostUsd) ? actualCostUsd : null;
            auditTrace.apifyRuns.download = {
              runId: runId || null,
              actualCostUsd: Number.isFinite(actualCostUsd) ? actualCostUsd : null,
              hardCapUsd: budgetPolicy?.downloadApifyHardCapUsd || null,
              maxItems: AUTOMATIC_DOWNLOAD_LIMIT,
            };
          }
          if (budgetLedger) {
            budgetLedger.complete('download', { actualCostUsd, providerRunId: runId });
            syncBudgetLedger();
          }
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
            if (auditTrace) auditTrace.download.result = 'media_url_ready';
          } else {
            candidateHadTechnicalFailure = true;
            if (auditTrace) auditTrace.download.result = 'matching_media_not_returned';
          }
        } catch (error) {
          candidateHadTechnicalFailure = true;
          if (budgetLedger) {
            try {
              budgetLedger.complete('download', {
                actualCostUsd: error?.actualCostUsd,
                providerRunId: error?.runId,
              });
            } catch {
              budgetLedger.fail('download');
            }
            syncBudgetLedger();
          }
          recordBilledCost(error?.actualCostUsd);
          run.errorCount += 1;
          run.errors.push({
            platform,
            lane: 'winner',
            input: downloadInput,
            message: error?.message || 'automatic_discovery_download_failed',
            status: error?.status || 500,
          });
          if (auditTrace) {
            auditTrace.download.result = 'failed';
            auditTrace.download.error = {
              code: error?.code || 'automatic_discovery_download_failed',
              message: error?.message || 'automatic_discovery_download_failed',
              status: error?.status || 500,
            };
          }
        } finally {
          await reportProgress();
        }
      } else {
        candidateHadTechnicalFailure = true;
        if (downloadInput && auditTrace) auditTrace.download.result = 'blocked_budget';
      }
    }

    let finalizedSignal = normalizeAutomaticSignal(acceptedSignal, {
      workspaceId,
      market,
      now,
      createId: createAutomaticSignalId,
    });
    if (candidateHadTechnicalFailure) {
      await reportProgress();
      continue;
    }
    if (evaluateSignalQuality) {
      try {
        if (budgetLedger) {
          const geminiExposure = budgetPolicy.geminiHardCapUsd;
          const currentCommitment = budgetLedger.snapshot().committedCostUsd;
          if (spentUsd + currentCommitment + geminiExposure > run.dailyBudgetUsd) throw new Error('manual_refresh_daily_budget_exceeded');
          if (run.monthlySpentUsdBefore + currentCommitment + geminiExposure > run.monthlyBudgetUsd) throw new Error('manual_refresh_monthly_budget_exceeded');
          budgetLedger.reserve('gemini', geminiExposure, {
            estimatedCostUsd: qualityRuntimeGuards?.conservativeCostUsd ?? geminiExposure,
          });
          syncBudgetLedger();
        }
        run.qualityEvaluatedCount += 1;
        run.qualityInteractionCount += 1;
        if (auditTrace) auditTrace.gemini.attempted = true;
        let quality = await evaluateSignalQuality({
          signal: finalizedSignal,
          workspace: discoveryWorkspace,
          platform,
          now,
          runtimeGuards: qualityRuntimeGuards,
        });
        if (budgetLedger) {
          budgetLedger.complete('gemini', {
            calculatedCostUsd: quality?.auditTrace?.calculatedCostUsd,
          });
          syncBudgetLedger();
        }
        const borderline = (
          run.qualityRecheckCount < maxQualityRechecks
          && isSignalQualityBorderline(quality, qualityGateConfig)
        );
        if (borderline) {
          run.qualityRecheckCount += 1;
          run.qualityInteractionCount += 1;
          try {
            const repeatedQuality = await evaluateSignalQuality({
              signal: finalizedSignal,
              workspace: discoveryWorkspace,
              platform,
              now,
              reviewAttempt: 2,
            });
            quality = combineSignalQualityAssessments(
              quality,
              repeatedQuality,
              qualityGateConfig,
            );
          } catch (reviewError) {
            run.qualityErrorCount += 1;
            run.errorCount += 1;
            run.errors.push({
              platform,
              lane: 'quality_gate_review',
              input: finalizedSignal.sourceUrl || finalizedSignal.importedMetadata?.url || '',
              message: reviewError?.message || 'signal_quality_gate_review_failed',
              status: reviewError?.status || 500,
            });
            quality = {
              ...quality,
              decision: 'uncertain',
              rejectionReasons: [
                ...new Set([
                  ...(quality?.rejectionReasons || []),
                  'borderline_review_failed',
                ]),
              ],
              review: {
                performed: true,
                consistent: false,
                decisions: [quality?.decision || 'uncertain', 'error'],
                qualityScores: [quality?.qualityScore ?? null, null],
              },
            };
          }
        }
        const identityKeys = getSignalIdentityKeys(finalizedSignal);
        const { decision, admittedToBank } = resolveSignalAdmission(quality);
        if (auditTrace) {
          auditTrace.download.mediaSha256 = quality?.auditTrace?.mediaSha256 || null;
          auditTrace.download.mediaByteLength = Number.isFinite(Number(quality?.auditTrace?.mediaByteLength))
            ? Number(quality.auditTrace.mediaByteLength)
            : null;
          auditTrace.gemini.rawResponseHash = hashAuditPayload(quality?.auditTrace?.rawResponse ?? null);
          auditTrace.gemini.rawResponse = summarizeGeminiResponseEnvelope(quality?.auditTrace?.rawResponse ?? null);
          const parsedAudit = quality?.auditTrace?.parsedResult ?? quality?.auditTrace?.rawAssessment ?? null;
          const safeParsedSummary = parsedAudit ? {
            accessible: parsedAudit.accessible === true,
            ...(parsedAudit.summary ? { summary: String(parsedAudit.summary).replace(/\s+/g, ' ').trim().slice(0, 500) } : {}),
            observationCount: Array.isArray(parsedAudit.observations) ? parsedAudit.observations.length : 0,
            evidenceChainCount: Array.isArray(parsedAudit.evidenceChains) ? parsedAudit.evidenceChains.length : 0,
          } : null;
          auditTrace.gemini.parsedSummary = safeParsedSummary;
          auditTrace.gemini.parsedResult = safeParsedSummary ? { ...safeParsedSummary } : null;
          auditTrace.gemini.usage = cloneAuditValue(quality?.auditTrace?.usage ?? null);
          auditTrace.gemini.normalizedUsage = cloneAuditValue(quality?.auditTrace?.normalizedUsage ?? null);
          auditTrace.gemini.model = quality?.auditTrace?.model || qualityRuntimeGuards?.model || null;
          auditTrace.gemini.calculatedCostUsd = Number.isFinite(Number(quality?.auditTrace?.calculatedCostUsd))
            ? Number(quality.auditTrace.calculatedCostUsd)
            : null;
          auditTrace.gemini.conservativeCostUsd = Number.isFinite(Number(quality?.auditTrace?.conservativeCostUsd))
            ? Number(quality.auditTrace.conservativeCostUsd)
            : qualityRuntimeGuards?.conservativeCostUsd ?? null;
          auditTrace.gemini.httpOperations = cloneAuditValue(quality?.auditTrace?.httpOperations ?? null);
          auditTrace.signalFilter = {
            decision,
            admittedToBank,
            rejectionReasons: Array.isArray(quality?.rejectionReasons) ? [...quality.rejectionReasons] : [],
            uncertaintyReasons: Array.isArray(quality?.uncertaintyReasons)
              ? [...quality.uncertaintyReasons]
              : [],
            policyVersion: quality?.policyVersion ?? qualityGateConfig.version ?? null,
            qualityScore: Number.isFinite(Number(quality?.qualityScore)) ? Number(quality.qualityScore) : null,
            brandRelevance: Number.isFinite(Number(quality?.brandRelevance)) ? Number(quality.brandRelevance) : null,
          };
          auditTrace.providerCost.geminiEstimatedUsd = Number.isFinite(Number(quality?.auditTrace?.calculatedCostUsd))
            ? Number(quality.auditTrace.calculatedCostUsd)
            : Number.isFinite(Number(quality?.auditTrace?.estimatedCostUsd))
              ? Number(quality.auditTrace.estimatedCostUsd)
            : null;
        }
        const cachedUntil = !candidateHadTechnicalFailure
          && isQualityDecisionSuppressionEligible(quality, qualityGateConfig)
          && decisionSuppressionTtlDays > 0
          ? new Date(now.getTime() + decisionSuppressionTtlDays * DAY_MS).toISOString()
          : null;
        run.qualityDecisions.push({
          signalId: finalizedSignal.id,
          sourceUrl: canonicalizeSignalUrl(finalizedSignal.sourceUrl || finalizedSignal.importedMetadata?.url || ''),
          identityKeys,
          policyVersion: quality?.policyVersion ?? qualityGateConfig.version ?? null,
          decision,
          admittedToBank,
          qualityScore: Number.isFinite(Number(quality?.qualityScore)) ? Number(quality.qualityScore) : null,
          brandRelevance: Number.isFinite(Number(quality?.brandRelevance)) ? Number(quality.brandRelevance) : null,
          rejectionReasons: Array.isArray(quality?.rejectionReasons) ? [...quality.rejectionReasons] : [],
          uncertaintyReasons: Array.isArray(quality?.uncertaintyReasons)
            ? [...quality.uncertaintyReasons]
            : [],
          cachedUntil,
          review: quality?.review ? { ...quality.review } : null,
        });
        if (!admittedToBank) {
          if (decision === 'uncertain') run.qualityUncertainCount += 1;
          else run.qualityRejectedCount += 1;
          run.rejectedCount += 1;
          await reportProgress();
          continue;
        }
        run.qualityAcceptedCount += 1;
        finalizedSignal = {
          ...finalizedSignal,
          importedMetadata: {
            ...(finalizedSignal.importedMetadata || {}),
            qualityGate: {
              policyVersion: quality.policyVersion,
              policy: quality.policy,
              generatedContentPolicy: quality.generatedContentPolicy,
              decision,
              admittedToBank,
              admissionMode: quality.admissionMode || null,
              passedModes: Array.isArray(quality.passedModes) ? [...quality.passedModes] : [],
              modeResults: Array.isArray(quality.modeResults)
                ? quality.modeResults.map((result) => ({
                  ...result,
                  evidenceIds: Array.isArray(result.evidenceIds) ? [...result.evidenceIds] : [],
                  missingRequirements: Array.isArray(result.missingRequirements)
                    ? [...result.missingRequirements]
                    : [],
                }))
                : [],
              evidenceChains: Array.isArray(quality.evidenceChains)
                ? quality.evidenceChains.map((chain) => ({
                  ...chain,
                  ambiguityReasons: Array.isArray(chain.ambiguityReasons)
                    ? [...chain.ambiguityReasons]
                    : [],
                }))
                : [],
              causalChainValidation: Array.isArray(quality.causalChainValidation)
                ? quality.causalChainValidation.map((chain) => ({
                  ...chain,
                  evidenceIds: Array.isArray(chain.evidenceIds) ? [...chain.evidenceIds] : [],
                  ambiguityReasons: Array.isArray(chain.ambiguityReasons)
                    ? [...chain.ambiguityReasons]
                    : [],
                  issues: Array.isArray(chain.issues) ? [...chain.issues] : [],
                }))
                : [],
              qualityScore: quality.qualityScore,
              brandRelevance: quality.brandRelevance,
              scores: quality.scores,
              evidenceConfidence: quality.evidenceConfidence,
              summary: quality.summary,
              centralIdea: quality.centralIdea,
              contentMechanic: quality.contentMechanic || quality.transferableMechanic || '',
              visualExecution: quality.visualExecution || '',
              adaptationTemplate: quality.adaptationTemplate || '',
              derivedClaims: quality.derivedClaims
                ? Object.fromEntries(
                  Object.entries(quality.derivedClaims).map(([key, claim]) => [
                    key,
                    {
                      ...claim,
                      evidenceIds: Array.isArray(claim?.evidenceIds) ? [...claim.evidenceIds] : [],
                    },
                  ]),
                )
                : null,
              contentMechanicEvidenceIds: Array.isArray(quality.contentMechanicEvidenceIds)
                ? [...quality.contentMechanicEvidenceIds]
                : [],
              transferableMechanic: quality.transferableMechanic,
              slopIndicators: Array.isArray(quality.slopIndicators) ? [...quality.slopIndicators] : [],
              rejectionReasons: Array.isArray(quality.rejectionReasons) ? [...quality.rejectionReasons] : [],
              uncertaintyReasons: Array.isArray(quality.uncertaintyReasons)
                ? [...quality.uncertaintyReasons]
                : [],
              observations: Array.isArray(quality.observations)
                ? quality.observations.map((observation) => ({ ...observation }))
                : [],
              unknowns: Array.isArray(quality.unknowns) ? [...quality.unknowns] : [],
              review: quality.review ? { ...quality.review } : null,
              evaluationCount: quality.review?.performed ? 2 : 1,
              evaluatedAt: now.toISOString(),
            },
          },
        };
      } catch (error) {
        qualityGateTechnicalFailure = true;
        if (budgetLedger && budgetLedger.snapshot().stages.gemini) {
          budgetLedger.fail('gemini');
          syncBudgetLedger();
        }
        run.qualityErrorCount += 1;
        run.errorCount += 1;
        run.errors.push({
          platform,
          lane: 'quality_gate',
          input: finalizedSignal.sourceUrl || finalizedSignal.importedMetadata?.url || '',
          message: error?.message || 'signal_quality_gate_failed',
          status: error?.status || 500,
        });
        if (auditTrace) {
          auditTrace.failure = {
            stage: 'quality_gate',
            code: error?.code || 'signal_quality_gate_failed',
            message: error?.message || 'signal_quality_gate_failed',
            status: error?.status || 500,
          };
        }
        await reportProgress();
        continue;
      }
    }
    acceptedSignals.push(finalizedSignal);
    run.acceptedCount = acceptedSignals.length;
    registerSignalIdentity(existingByIdentity, finalizedSignal);
    await reportProgress();
  }

  if (acceptedSignals.length) {
    reels.unshift(...acceptedSignals);
  }

  run.acceptedCount = acceptedSignals.length;
  const qualityGateFailedWithoutAdmission = qualityGateTechnicalFailure && acceptedSignals.length === 0;
  if (qualityGateFailedWithoutAdmission) {
    const qualityFailure = run.errors.find((error) => error.lane === 'quality_gate') || {};
    run.classifiedFailure = {
      code: 'automatic_discovery_quality_gate_failed',
      stage: 'quality_gate',
      cause: {
        code: qualityFailure.code || 'signal_quality_gate_failed',
        message: qualityFailure.message || 'signal_quality_gate_failed',
        status: qualityFailure.status || 500,
      },
    };
  }
  run.status = !rankingBlocked && successfulCalls > 0 && !qualityGateFailedWithoutAdmission
    ? 'completed'
    : 'failed';
  const roundedBilledCostUsd = roundUsd(billedCostUsd);
  if (budgetLedger) {
    const ledgerSnapshot = syncBudgetLedger();
    run.estimatedCostUsd = ledgerSnapshot.estimatedCostUsd;
    run.reservedCostUsd = ledgerSnapshot.committedCostUsd;
    run.actualCostUsd = ledgerSnapshot.actualCostUsd;
  } else {
    run.actualCostUsd = run.attemptedCallCount > 0 && hasCompleteBilledCost && roundedBilledCostUsd >= 0
      ? roundedBilledCostUsd
      : null;
  }
  if (auditTrace) {
    auditTrace.providerCost.estimatedUsd = run.estimatedCostUsd;
    auditTrace.providerCost.actualUsd = run.actualCostUsd;
    if (!auditTrace.failure && run.status === 'failed') {
      auditTrace.failure = {
        stage: 'metadata',
        code: run.errors[0]?.message || 'automatic_discovery_failed',
        message: run.errors[0]?.message || 'automatic_discovery_failed',
        status: run.errors[0]?.status || 500,
      };
    }
    const bankCountAfter = reels.filter((signal) => (
      signal?.workspaceId === workspaceId
      && signal?.importedMetadata?.qualityGate?.decision === 'accept'
      && signal?.importedMetadata?.qualityGate?.admittedToBank === true
    )).length;
    auditTrace.mutationSnapshot.after = {
      reels: reels.filter((signal) => signal?.workspaceId === workspaceId).length,
      bank: bankCountAfter,
      collection: bankCountAfter,
    };
    auditTrace.mutationSnapshot.bankDelta = bankCountAfter - bankCountBefore;
    auditTrace.mutationSnapshot.collectionDelta = bankCountAfter - bankCountBefore;
    run.auditTrace = sanitizeAutomaticDiscoveryTrace(auditTrace);
  }
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
  getMonthlyAutomaticSpendSummary,
  createProviderBudgetLedger,
  sanitizeAutomaticDiscoveryTrace,
  canStartDiscoveryRun,
  estimateDiscoveryRunCostUsd,
  claimDiscoveryRun,
  recoverStaleRunningRuns,
  prepareAutomaticDiscovery,
  executeAutomaticDiscovery,
  buildMetadataAuditCandidateSet,
  rankSignalsByBSoft,
  mergeSignalSnapshot,
  resolveSignalAdmission,
};
