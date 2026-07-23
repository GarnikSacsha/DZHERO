const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const { generateAgentReply } = require('./services/agentEngine');
const { generateRemix } = require('./services/remixEngine');
const { normalizeAgentStudioInput } = require('./services/agentStudioSchemas.cjs');
const {
  ACTIVE_AGENT_STUDIO_STATUSES,
  TERMINAL_AGENT_STUDIO_STATUSES,
  createAgentStudioRun,
  appendAgentStudioTrace,
  transitionAgentStudioRun,
  requestAgentStudioContext,
  resumeAgentStudioRunWithContext,
  requestAgentStudioCriticRevision,
  cancelAgentStudioRun,
  classifyAgentStudioError,
  approveAgentStudioRun,
  recoverInterruptedAgentStudioRun,
  toPublicAgentStudioRun,
} = require('./services/agentStudioRun.cjs');
const {
  createOpenAIAgentRunner,
  orchestrateAgentStudio,
  orchestrateAgentStudioHybrid,
} = require('./services/agentStudioAgents.cjs');
const {
  analyzeAgentStudioVideo,
  uploadGeminiVideoBytes,
  deleteGeminiFile,
} = require('./services/agentStudioVideoTool.cjs');
const { resolveAgentStudioVideoSource } = require('./services/agentStudioSourceResolver.cjs');
const { createAgentStudioUsageCollector } = require('./services/agentStudioUsage.cjs');
const agentStudioCoffeeFixture = require('../scripts/fixtures/agent-studio-coffee-shop.cjs');
const {
  normalizeBrandBrain,
  buildBusinessBriefFromBrandBrain,
  mergeBusinessBriefWithBrandBrain,
} = require('./services/brandBrainContext.cjs');
const {
  buildBrandBrainEnrichment,
  shouldUseApifyForBrandScan,
} = require('./services/brandBrainExtractor.cjs');
const {
  normalizeBrandAnswers,
  getMissingBrandAnswers,
  normalizeBrandBrainDraft,
  projectBrandBrainCompatibility,
  isBrandContextComplete,
  buildBrandAnswerFingerprint,
} = require('./services/brandBrainV2.cjs');
const { finalizeBrandBrainV2 } = require('./services/brandBrainFinalizer.cjs');
const {
  shouldChargeBrandBrainSave,
  getMissingRequiredBrandFields,
  normalizeBrandBrainSourceLinks,
} = require('./services/brandBrainPersistence.cjs');
const { analyzeReel, generateIdeasFromReel } = require('./services/scoringEngine');
const { getAllowedBatchSize } = require('./services/usageLimits.cjs');
const {
  buildSharedSignalBankReels,
  isSharedSignalBankPlan,
} = require('./services/sharedSignalBank.cjs');
const { normalizeContentPlanBody } = require('./services/contentPlanPostBody.cjs');
const {
  getYouTubeShortsSearchQueries,
  shouldRetryPopularWithoutCategory,
} = require('./services/youtubePopularFallback.cjs');
const {
  fetchApifySignals,
  getApifySignalKey,
} = require('./services/apifySignalProvider');
const {
  defaultDiscoverySettings,
  ensureWorkspaceDiscoverySettings,
  buildDiscoveryInputs,
  canonicalizeSignalUrl,
  isDiscoveryDue,
  getDailyAutomaticSpend,
  getDailyAutomaticSpendSummary,
  prepareAutomaticDiscovery,
  executeAutomaticDiscovery,
  mergeSignalSnapshot,
  recoverStaleRunningRuns,
} = require('./services/automaticSignalDiscovery');
const {
  createKeyedMutex,
  withPostgresStateTransaction,
} = require('./services/automaticDiscoveryStorage');
const {
  findAuthSession,
  getAuthTokenCandidates,
  getBearerToken,
  parseCookies,
} = require('./services/authSession.cjs');
const {
  buildAuthWorkspacePayload,
} = require('./services/authWorkspacePayload.cjs');
const { reserveUsageCounter } = require('./services/paidUsage.cjs');
const { safeFetchPublicText } = require('./services/safePublicFetch.cjs');
const {
  buildLeadSyncPayload,
  createCrmSyncClient,
  createLatestSyncScheduler,
  isVerifiedGoogleUser: isCrmSyncEligibleUser,
  publicCommunicationPreferences,
  updateCommunicationPreferences,
} = require('./services/crmSync.cjs');
const {
  getActiveTesterGrant,
  getTesterDiscoveryPolicy,
  linkTesterGrant,
  normalizeTesterEmail,
  resolveAccessPlan,
  revokeTesterGrant,
  upsertTesterGrant,
} = require('./services/testerAccess.cjs');

function loadLocalEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fsSync.existsSync(envPath)) return;
  const rows = fsSync.readFileSync(envPath, 'utf8').split(/\r?\n/);
  rows.forEach((row) => {
    const line = row.trim();
    if (!line || line.startsWith('#')) return;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match || process.env[match[1]] !== undefined) return;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value.replace(/\\n/g, '\n');
  });
}

loadLocalEnv();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_DB_PATH = path.join(__dirname, 'data', 'db.json');
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;
const DATABASE_URL = process.env.DATABASE_URL || '';
const DATABASE_SSL = process.env.DATABASE_SSL === 'true' || process.env.PGSSLMODE === 'require';
const APP_STATE_KEY = process.env.APP_STATE_KEY || 'main';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const PAYMENT_CARD_NUMBER = process.env.PAYMENT_CARD_NUMBER || '';
const PAYMENT_CARD_HOLDER = process.env.PAYMENT_CARD_HOLDER || '';
const PAYMENT_CARD_URL = process.env.PAYMENT_CARD_URL || '';
const PAYMENT_SUPPORT_URL = process.env.PAYMENT_SUPPORT_URL || '';
const PAYMENT_NOTE_PREFIX = process.env.PAYMENT_NOTE_PREFIX || 'Dzhero';
const ENABLE_BILLING_PURCHASES = process.env.ENABLE_BILLING_PURCHASES === 'true';
const CRM_TELEMETRY_ORIGIN = 'https://crmdzhero-production.up.railway.app';
const DZHERO_CRM_API_URL = String(process.env.DZHERO_CRM_API_URL || '').trim();
const DZHERO_CRM_SYNC_TOKEN = String(process.env.DZHERO_CRM_SYNC_TOKEN || '').trim();
const ALLOW_DEMO_LOGIN = process.env.ALLOW_DEMO_LOGIN === 'true' || process.env.NODE_ENV !== 'production';
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_SESSIONS_PER_USER = Math.min(50, Math.max(1, Number(process.env.MAX_ACTIVE_SESSIONS_PER_USER || 8) || 8));
const REGISTER_RATE_LIMIT_PER_HOUR = Math.min(100, Math.max(1, Number(process.env.REGISTER_RATE_LIMIT_PER_HOUR || 10) || 10));
const OAUTH_STATE_TTL_MS = Number(process.env.OAUTH_STATE_TTL_MINUTES || 10) * 60 * 1000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CLIENT_DIST_PATH = path.join(__dirname, '..', 'dist');
const META_AUTH_BASE_URL = process.env.META_AUTH_BASE_URL || 'https://www.facebook.com/v20.0/dialog/oauth';
const META_GRAPH_BASE_URL = process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v20.0';
const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || `http://127.0.0.1:${PORT}/api/auth/meta/callback`;
const META_LOGIN_CONFIG_ID = process.env.META_LOGIN_CONFIG_ID || process.env.FACEBOOK_LOGIN_CONFIG_ID || '';
const CLIENT_URL = process.env.CLIENT_URL || 'http://127.0.0.1:5173';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://127.0.0.1:${PORT}/api/auth/callback/google`;
const GOOGLE_AUTH_BASE_URL = process.env.GOOGLE_AUTH_BASE_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = process.env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo';
const GOOGLE_SCOPES = process.env.GOOGLE_SCOPES || 'openid email profile';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const SHARED_SIGNAL_BANK_WORKSPACE_ID = String(process.env.SHARED_SIGNAL_BANK_WORKSPACE_ID || '').trim();
const SHARED_SIGNAL_BANK_OWNER_EMAIL = String(process.env.SHARED_SIGNAL_BANK_OWNER_EMAIL || '').trim();
const SHARED_SIGNAL_BANK_LIMIT = Number(process.env.SHARED_SIGNAL_BANK_LIMIT || 250);
const ENABLE_PUBLIC_APIFY_BRAND_SCAN = process.env.ENABLE_PUBLIC_APIFY_BRAND_SCAN === 'true';
const PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT = Math.max(
  1,
  Number(process.env.PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT || 20),
);
const AUTOMATIC_DISCOVERY_ENABLED = process.env.AUTOMATIC_DISCOVERY_ENABLED !== 'false';
const AUTOMATIC_DISCOVERY_TICK_MS = Number.isFinite(Number(process.env.AUTOMATIC_DISCOVERY_TICK_MS))
  ? Math.max(1000, Number(process.env.AUTOMATIC_DISCOVERY_TICK_MS))
  : 60000;
const AUTOMATIC_DISCOVERY_TEST_PROVIDER = process.env.NODE_ENV === 'test'
  ? String(process.env.AUTOMATIC_DISCOVERY_TEST_PROVIDER || '').trim()
  : '';
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || '';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || `http://127.0.0.1:${PORT}/api/auth/tiktok/callback`;
const TIKTOK_AUTH_BASE_URL = process.env.TIKTOK_AUTH_BASE_URL || 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = process.env.TIKTOK_TOKEN_URL || 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USERINFO_URL = process.env.TIKTOK_USERINFO_URL || 'https://open.tiktokapis.com/v2/user/info/';
const TIKTOK_SCOPES = process.env.TIKTOK_SCOPES || 'user.info.basic,user.info.profile,user.info.stats';
const UNLIMITED_ACCESS_EMAILS = new Set(
  String(process.env.UNLIMITED_ACCESS_EMAILS || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean)
);
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_REMIX_MODEL || 'gemini-3.5-flash';
const ENABLE_AGENT_STUDIO = process.env.ENABLE_AGENT_STUDIO === 'true';
const OPENAI_AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || 'gpt-5.6';
const AGENT_STUDIO_TEST_PROVIDER = process.env.NODE_ENV === 'test'
  ? String(process.env.AGENT_STUDIO_TEST_PROVIDER || '').trim()
  : '';

const crmSyncClient = createCrmSyncClient({
  apiUrl: DZHERO_CRM_API_URL,
  token: DZHERO_CRM_SYNC_TOKEN,
  timeoutMs: 3000,
});
const crmSyncScheduler = createLatestSyncScheduler((payload) => crmSyncClient.sync(payload));

function scheduleCrmSync(user, context = {}) {
  if (!crmSyncClient.configured) return 'not_configured';
  if (!isCrmSyncEligibleUser(user)) return 'not_eligible';
  let payload;
  try {
    payload = buildLeadSyncPayload({
      user,
      visitorId: context.visitorId,
      attribution: context.attribution,
    });
  } catch {
    return 'not_eligible';
  }
  crmSyncScheduler.schedule(user.id, payload).catch((error) => {
    console.error(`[CrmSync] ${String(error?.message || 'sync_failed').slice(0, 160)}`);
  });
  return 'scheduled';
}
const INSTAGRAM_APP_ID = process.env.INSTAGRAM_APP_ID || META_APP_ID;
const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || META_APP_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || `http://127.0.0.1:${PORT}/api/auth/instagram/callback`;
const INSTAGRAM_AUTH_BASE_URL = process.env.INSTAGRAM_AUTH_BASE_URL || 'https://www.instagram.com/oauth/authorize';
const INSTAGRAM_TOKEN_URL = process.env.INSTAGRAM_TOKEN_URL || 'https://api.instagram.com/oauth/access_token';
const INSTAGRAM_GRAPH_BASE_URL = process.env.INSTAGRAM_GRAPH_BASE_URL || 'https://graph.instagram.com';
const INSTAGRAM_SCOPES = process.env.INSTAGRAM_SCOPES || [
  'instagram_business_basic',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
  'instagram_business_content_publish',
].join(',');
const META_SCOPES = process.env.META_SCOPES || '';

function parseCsvEnv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const META_SCOPE_LIST = parseCsvEnv(META_SCOPES);
const INSTAGRAM_SCOPE_LIST = parseCsvEnv(INSTAGRAM_SCOPES);
const TIKTOK_SCOPE_LIST = parseCsvEnv(TIKTOK_SCOPES);
const CAN_DISCOVER_META_ACCOUNTS = Boolean(META_LOGIN_CONFIG_ID || META_SCOPE_LIST.includes('pages_show_list'));

const PLAN_CATALOG = [
  {
    id: 'demo',
    name: 'Demo',
    billingPeriod: 'temporary',
    priceUah: 0,
    limits: {
      aiOperations: 50,
      agentChat: 20,
      reelImports: 3,
      competitors: 8,
      workspaces: 1,
      teamMembers: 1,
      instagramAccounts: 0,
      brandBrainSaves: 1,
      contentPlanPosts: 7,
    },
    features: ['demo_workspace', 'mock_market_data', 'agent_chat_limited', 'manual_reel_import'],
  },
  {
    id: 'trial',
    name: 'Free Trial',
    billingPeriod: '3 days',
    priceUah: 0,
    limits: {
      aiOperations: 5,
      agentChat: 5,
      reelImports: 3,
      competitors: 2,
      workspaces: 1,
      teamMembers: 1,
      instagramAccounts: 0,
      brandBrainSaves: 1,
      contentPlanPosts: 7,
    },
    features: ['guest_preview', 'brand_scan_trial', 'brand_brain_once', 'studio_drafts_limited'],
  },
  {
    id: 'starter',
    name: 'Starter',
    billingPeriod: 'month',
    priceUah: 590,
    limits: {
      aiOperations: 150,
      agentChat: 150,
      reelImports: 30,
      competitors: 5,
      workspaces: 1,
      teamMembers: 1,
      instagramAccounts: 1,
      brandBrainSaves: 10,
      contentPlanPosts: 100,
    },
    features: ['brand_brain', 'assistant', 'remix_studio', 'content_plan', 'instagram_login'],
  },
  {
    id: 'pro',
    name: 'Pro',
    billingPeriod: 'month',
    priceUah: 1490,
    limits: {
      aiOperations: 600,
      agentChat: 600,
      reelImports: 250,
      competitors: 30,
      workspaces: 3,
      teamMembers: 1,
      instagramAccounts: 3,
      brandBrainSaves: 150,
      contentPlanPosts: 500,
    },
    features: ['everything_starter', 'weekly_batches', 'deep_brand_memory', 'content_notes', 'ai_direct', 'exports', 'sync_queue'],
  },
  {
    id: 'agency',
    name: 'Agency',
    billingPeriod: 'month',
    priceUah: 3900,
    limits: {
      aiOperations: 2500,
      agentChat: 2500,
      reelImports: 500,
      competitors: 50,
      workspaces: 10,
      teamMembers: 1,
      instagramAccounts: 10,
      brandBrainSaves: 500,
      contentPlanPosts: 2000,
    },
    features: ['everything_pro', 'multi_client_workspaces', 'ai_direct_unlimited', 'approval_flow', 'priority_support'],
  },
  {
    id: 'tester_pro',
    name: 'Tester Pro',
    billingPeriod: 'internal',
    priceUah: 0,
    internal: true,
    limits: {
      aiOperations: 50,
      agentChat: 50,
      reelImports: 30,
      competitors: 5,
      workspaces: 1,
      teamMembers: 1,
      instagramAccounts: 1,
      brandBrainSaves: 10,
      contentPlanPosts: 50,
    },
    features: ['tester_pro', 'assistant', 'remix_studio', 'content_plan', 'apify_discovery'],
  },
];

const DISCOVERY_PLATFORM_NAMES = ['instagram', 'tiktok'];
const DISCOVERY_SETTINGS_BUDGET_MIN_USD = 0.1;
const DISCOVERY_SETTINGS_BUDGET_MAX_USD = 0.8;
const DISCOVERY_VIRAL_SCORE_MIN = 55;
const DISCOVERY_VIRAL_SCORE_MAX = 96;
const DISCOVERY_STATUS_RUN_LIMIT = 10;

const CONTENT_FORMATS = ['Post', 'Reels', 'Shorts', 'Tik - Tok', 'Video', 'Stories'];
const CONTENT_FORMAT_ALIASES = {
  'short-form': 'Video',
  shortform: 'Video',
  reel: 'Reels',
  reels: 'Reels',
  story: 'Stories',
  stories: 'Stories',
  tiktok: 'Tik - Tok',
  'tik tok': 'Tik - Tok',
  'tik-tok': 'Tik - Tok',
  'tik - tok': 'Tik - Tok',
  shorts: 'Shorts',
  'youtube shorts': 'Shorts',
  youtube: 'Shorts',
  carousel: 'Post',
  email: 'Post',
  note: 'Post',
  post: 'Post',
  video: 'Video',
};

const USAGE_METRICS = {
  aiOperations: 'ai_operations',
  agentChat: 'agent_chat',
  reelImports: 'reel_imports',
  competitors: 'competitors',
  brandBrainSaves: 'brand_brain_saves',
};

const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://dzhero.com.ua',
  'https://insta-producer-production.up.railway.app',
  CLIENT_URL,
].filter(Boolean));

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: IS_PRODUCTION ? {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'", CRM_TELEMETRY_ORIGIN],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", ...Array.from(allowedOrigins), 'https://www.googleapis.com', CRM_TELEMETRY_ORIGIN],
      formAction: ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}));

app.use('/api', cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    const error = new Error(`CORS blocked for origin: ${origin}`);
    error.status = 403;
    error.payload = { error: 'cors_origin_denied' };
    callback(error);
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: REGISTER_RATE_LIMIT_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'registration_rate_limit_reached',
    message: 'Too many accounts were created from this network. Try again later or use Google sign-in.',
  },
});

const oauthLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
});

const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const publicPreviewDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: Number(process.env.PUBLIC_PREVIEW_DAILY_LIMIT || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'preview_daily_limit_reached',
    message: 'Daily public preview limit reached. Sign in to continue with your plan limits.',
  },
});

app.use('/api', apiLimiter);
app.use('/api', verifyTrustedWriteRequest);
app.use('/api', serializeMutatingApiRequests);
app.use('/api/auth/meta/start', oauthLimiter);
app.use('/api/auth/instagram/start', oauthLimiter);
app.use('/api/auth/google/start', oauthLimiter);
app.use('/api/auth/tiktok/start', oauthLimiter);
app.use('/api/auth/meta/callback', oauthLimiter);
app.use('/api/auth/instagram/callback', oauthLimiter);
app.use('/api/auth/callback/google', oauthLimiter);
app.use('/api/auth/tiktok/callback', oauthLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', registerLimiter, authLimiter);
app.use('/api/auth/demo', authLimiter);
app.use('/api/data-deletion/request', authLimiter);
app.use('/api/brand-scan/preview', publicPreviewDailyLimiter, expensiveLimiter);
app.use('/api/workspaces/:workspaceId/signals/discovery/run', expensiveLimiter);
app.use('/api/workspaces/:workspaceId/reels/import-url', expensiveLimiter);
app.use('/api/workspaces/:workspaceId/reels/youtube/popular', expensiveLimiter);
app.use('/api/workspaces/:workspaceId/signals/apify/import', expensiveLimiter);
app.use('/api/workspaces/:workspaceId/agent/chat', expensiveLimiter);
app.use('/api/workspaces/:workspaceId/agent/actions', expensiveLimiter);
app.use('/api/workspaces/:workspaceId/remix/generate', expensiveLimiter);

let pgPool;

function getPgPool() {
  if (!DATABASE_URL) return null;
  if (!pgPool) {
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pgPool;
}

function normalizeDbShape(db = {}) {
  const collectionKeys = [
    'users',
    'sessions',
    'workspaces',
    'competitors',
    'reels',
    'ideas',
    'leads',
    'syncJobs',
    'discoveryRuns',
    'sources',
    'metaStates',
    'instagramAccounts',
    'tiktokAccounts',
    'aiMemory',
    'aiJobs',
    'remixes',
    'contentPlanItems',
    'videoJobs',
    'dataDeletionRequests',
    'subscriptions',
    'usageCounters',
    'testerAccessGrants',
    'demoSessions',
    'agentStudioRuns',
    'agentStudioUploads',
  ];
  for (const key of collectionKeys) {
    if (!Array.isArray(db[key])) db[key] = [];
  }
  if (!Array.isArray(db.plans) || !db.plans.length) db.plans = PLAN_CATALOG;
  return db;
}

let automaticDiscoveryTickInFlight = false;
const automaticDiscoveryWorkspacesInFlight = new Set();
const brandBrainFinalizeFlights = new Map();
const automaticDiscoveryFileMutex = createKeyedMutex();
let automaticDiscoveryTestProvider = null;
let agentStudioTestProvider = null;

if (AUTOMATIC_DISCOVERY_TEST_PROVIDER) {
  const loadedProvider = require(path.resolve(AUTOMATIC_DISCOVERY_TEST_PROVIDER));
  automaticDiscoveryTestProvider = typeof loadedProvider === 'function'
    ? loadedProvider
    : typeof loadedProvider?.default === 'function'
      ? loadedProvider.default
      : null;
  if (!automaticDiscoveryTestProvider) {
    throw new Error('AUTOMATIC_DISCOVERY_TEST_PROVIDER must export a function when NODE_ENV=test');
  }
}

if (AGENT_STUDIO_TEST_PROVIDER) {
  const loadedProvider = require(path.resolve(AGENT_STUDIO_TEST_PROVIDER));
  agentStudioTestProvider = loadedProvider?.default || loadedProvider;
  if (
    typeof agentStudioTestProvider?.runAgent !== 'function'
    || typeof agentStudioTestProvider?.analyzeVideo !== 'function'
  ) {
    throw new Error('AGENT_STUDIO_TEST_PROVIDER must export runAgent and analyzeVideo functions when NODE_ENV=test');
  }
}

async function readSeedDb() {
  const seed = await fs.readFile(DEFAULT_DB_PATH, 'utf8');
  return normalizeDbShape(JSON.parse(seed));
}

async function ensurePostgresState() {
  const pool = getPgPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  const seed = await readSeedDb();
  await pool.query(
    `
      INSERT INTO app_state (key, data)
      VALUES ($1, $2::jsonb)
      ON CONFLICT (key) DO NOTHING
    `,
    [APP_STATE_KEY, JSON.stringify(seed)]
  );
}

async function readDbSnapshot() {
  if (DATABASE_URL) {
    await ensurePostgresState();
    const result = await getPgPool().query('SELECT data FROM app_state WHERE key = $1', [APP_STATE_KEY]);
    return normalizeDbShape(result.rows[0]?.data || {});
  }

  await ensureDbFile();
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const raw = await fs.readFile(DB_PATH, 'utf8');
      return normalizeDbShape(JSON.parse(raw));
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

async function readDb() {
  if (DATABASE_URL) return readDbSnapshot();
  return automaticDiscoveryFileMutex.run('app-state', readDbSnapshot);
}

async function writeDbSnapshot(db) {
  const normalized = normalizeDbShape(db);
  if (DATABASE_URL) {
    await getPgPool().query(
      `
        UPDATE app_state
        SET data = $2::jsonb,
            updated_at = now()
        WHERE key = $1
      `,
      [APP_STATE_KEY, JSON.stringify(normalized)]
    );
    return;
  }

  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const tempPath = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  await fs.rm(DB_PATH, { force: true });
  await fs.rename(tempPath, DB_PATH);
}

async function writeDb(db, { preserveAutomaticDiscovery = true } = {}) {
  let nextDb = normalizeDbShape(db);
  if (!preserveAutomaticDiscovery) {
    await writeDbSnapshot(nextDb);
    return;
  }

  if (DATABASE_URL) {
    await ensurePostgresState();
    const client = await getPgPool().connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        'SELECT data FROM app_state WHERE key = $1 FOR UPDATE',
        [APP_STATE_KEY]
      );
      const latestDb = normalizeDbShape(result.rows[0]?.data || {});
      nextDb = mergeAutomaticDiscoveryWriteSnapshot(nextDb, latestDb);
      await client.query(
        `
          UPDATE app_state
          SET data = $2::jsonb,
              updated_at = now()
          WHERE key = $1
        `,
        [APP_STATE_KEY, JSON.stringify(nextDb)]
      );
      await client.query('COMMIT');
      return;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Keep the original persistence error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  await automaticDiscoveryFileMutex.run('app-state', async () => {
    try {
      const latestDb = await readDbSnapshot();
      nextDb = mergeAutomaticDiscoveryWriteSnapshot(nextDb, latestDb);
    } catch {
      // If the file does not exist yet, write the normalized snapshot below.
    }
    await writeDbSnapshot(nextDb);
  });
}

async function ensureDbFile() {
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    const seed = await fs.readFile(DEFAULT_DB_PATH, 'utf8');
    await fs.writeFile(DB_PATH, seed, 'utf8');
  }
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getExistingReelByApifyKey(db, workspaceId) {
  const map = new Map();
  for (const reel of db.reels.filter((item) => item.workspaceId === workspaceId)) {
    const key = getApifySignalKey(reel.importedMetadata || {});
    if (key && !map.has(key)) map.set(key, reel);
  }
  return map;
}

function getReelYouTubeVideoId(reel = {}) {
  return String(
    reel.importedMetadata?.youtube?.videoId
    || reel.youtube?.videoId
    || parseYouTubeInput(reel.sourceUrl || reel.importedMetadata?.url || '')?.videoId
    || ''
  ).trim();
}

function getReelStableKeys(reel = {}) {
  const keys = [];
  const apifyKey = getApifySignalKey(reel.importedMetadata || {});
  if (apifyKey) keys.push(`apify:${apifyKey}`);

  const youtubeVideoId = getReelYouTubeVideoId(reel);
  if (youtubeVideoId) keys.push(`youtube:${youtubeVideoId.toLowerCase()}`);

  for (const value of [
    reel.sourceUrl,
    reel.importedMetadata?.url,
    reel.importedMetadata?.webVideoUrl,
    reel.videoUrl,
    reel.importedMetadata?.videoUrl,
  ]) {
    const normalizedUrl = canonicalizeSignalUrl(value || '');
    if (normalizedUrl) keys.push(`url:${normalizedUrl.toLowerCase()}`);
  }

  return [...new Set(keys)];
}

function getReelDisplayStrength(reel = {}) {
  const views = parseMetric(reel.views || reel.importedMetadata?.rawStats?.views || reel.importedMetadata?.stats?.views);
  const likes = parseMetric(reel.likes || reel.importedMetadata?.rawStats?.likes || reel.importedMetadata?.stats?.likes);
  const score = Number(reel.score) || 0;
  const hasMedia = reel.videoUrl || reel.image || reel.importedMetadata?.videoUrl || reel.importedMetadata?.image ? 1 : 0;
  const updatedAt = Date.parse(reel.updatedAt || reel.createdAt || reel.importedMetadata?.snapshotAt || '') || 0;
  return (score * 1_000_000_000) + (views * 100) + likes + (hasMedia * 10_000_000_000) + Math.floor(updatedAt / 1000);
}

function mergeDuplicateReelForDisplay(current = {}, incoming = {}) {
  const currentWins = getReelDisplayStrength(current) >= getReelDisplayStrength(incoming);
  const primary = currentWins ? current : incoming;
  const secondary = currentWins ? incoming : current;
  return {
    ...secondary,
    ...primary,
    sourceUrl: primary.sourceUrl || secondary.sourceUrl || '',
    videoUrl: primary.videoUrl || secondary.videoUrl || '',
    image: primary.image || secondary.image || '',
    views: parseMetric(primary.views) > 0 ? primary.views : secondary.views || primary.views || 0,
    likes: parseMetric(primary.likes) > 0 ? primary.likes : secondary.likes || primary.likes || 0,
    comments: parseMetric(primary.comments) > 0 ? primary.comments : secondary.comments || primary.comments || 0,
    importedMetadata: {
      ...(secondary.importedMetadata || {}),
      ...(primary.importedMetadata || {}),
      youtube: primary.importedMetadata?.youtube || secondary.importedMetadata?.youtube,
      apify: primary.importedMetadata?.apify || secondary.importedMetadata?.apify,
    },
    status: Array.from(new Set([
      ...(Array.isArray(secondary.status) ? secondary.status : []),
      ...(Array.isArray(primary.status) ? primary.status : []),
    ])),
  };
}

function dedupeWorkspaceReelsForResponse(reels = []) {
  const result = [];
  const indexByKey = new Map();
  for (const reel of reels) {
    const keys = getReelStableKeys(reel);
    const existingIndex = keys.map((key) => indexByKey.get(key)).find((index) => index !== undefined);
    if (existingIndex === undefined) {
      result.push(reel);
      const newIndex = result.length - 1;
      for (const key of keys) indexByKey.set(key, newIndex);
      continue;
    }
    result[existingIndex] = mergeDuplicateReelForDisplay(result[existingIndex], reel);
    for (const key of getReelStableKeys(result[existingIndex])) indexByKey.set(key, existingIndex);
  }
  return result;
}

function getExistingReelByStableKey(db, workspaceId) {
  const map = new Map();
  for (const reel of (Array.isArray(db.reels) ? db.reels : []).filter((item) => item.workspaceId === workspaceId)) {
    for (const key of getReelStableKeys(reel)) {
      if (!map.has(key)) map.set(key, reel);
    }
  }
  return map;
}

async function withAutomaticDiscoveryStateLock(workspaceId, task) {
  if (DATABASE_URL) {
    await ensurePostgresState();
    return withPostgresStateTransaction({
      pool: getPgPool(),
      appStateKey: APP_STATE_KEY,
      workspaceId,
      normalizeState: normalizeDbShape,
      task,
    });
  }
  return automaticDiscoveryFileMutex.run('app-state', async () => {
    const db = await readDbSnapshot();
    const result = await task(db);
    await writeDbSnapshot(db);
    return result;
  });
}

function normalizeDiscoveryIdentity(value) {
  return String(value || '').trim().toLowerCase();
}

function cloneDiscoveryRun(run = {}) {
  return {
    ...run,
    errors: Array.isArray(run.errors) ? [...run.errors] : [],
  };
}

function cloneDiscoveryReel(reel = {}) {
  return {
    ...reel,
    importedMetadata: reel.importedMetadata
      ? {
        ...reel.importedMetadata,
      }
      : reel.importedMetadata,
  };
}

function copyDiscoverySettings(settings = {}) {
  return {
    ...settings,
    platforms: Array.isArray(settings.platforms) ? [...settings.platforms] : settings.platforms,
    laneIntervalsMs: settings.laneIntervalsMs ? { ...settings.laneIntervalsMs } : settings.laneIntervalsMs,
    lastRunAt: settings.lastRunAt ? { ...settings.lastRunAt } : settings.lastRunAt,
    nextRunAt: settings.nextRunAt ? { ...settings.nextRunAt } : settings.nextRunAt,
    retryCounts: settings.retryCounts ? { ...settings.retryCounts } : settings.retryCounts,
    sourceCheckpoints: settings.sourceCheckpoints
      ? Object.fromEntries(
        Object.entries(settings.sourceCheckpoints).map(([platform, checkpoints]) => [
          platform,
          { ...(checkpoints || {}) },
        ])
      )
      : settings.sourceCheckpoints,
  };
}

function recoverAutomaticDiscoveryLeases(db = {}, workspaceId, now = new Date()) {
  return recoverStaleRunningRuns(db, {
    workspaceId,
    lane: 'automatic',
    now,
  });
}

function upsertAutomaticDiscoveryRun(db = {}, run = {}) {
  if (!run?.id) return;
  const runs = Array.isArray(db.discoveryRuns) ? db.discoveryRuns : (db.discoveryRuns = []);
  const index = runs.findIndex((item) => item && item.id === run.id);
  const nextRun = cloneDiscoveryRun(run);
  if (index >= 0) {
    runs[index] = nextRun;
    return;
  }
  runs.unshift(nextRun);
}

function mergeAutomaticDiscoverySettings(workspace = {}, snapshotWorkspace = {}) {
  const snapshotSettings = snapshotWorkspace.discoverySettings;
  if (!snapshotSettings) return;
  if (!workspace.discoverySettings) {
    workspace.discoverySettings = copyDiscoverySettings(snapshotSettings);
    return;
  }
  workspace.discoverySettings = {
    ...workspace.discoverySettings,
    laneIntervalsMs: {
      ...(workspace.discoverySettings.laneIntervalsMs || {}),
      ...(snapshotSettings.laneIntervalsMs || {}),
    },
    lastRunAt: {
      ...(workspace.discoverySettings.lastRunAt || {}),
      ...(snapshotSettings.lastRunAt || {}),
    },
    nextRunAt: {
      ...(workspace.discoverySettings.nextRunAt || {}),
      ...(snapshotSettings.nextRunAt || {}),
    },
    retryCounts: {
      ...(workspace.discoverySettings.retryCounts || {}),
      ...(snapshotSettings.retryCounts || {}),
    },
    sourceCheckpoints: Object.fromEntries(
      DISCOVERY_PLATFORM_NAMES.map((platform) => [
        platform,
        {
          ...(workspace.discoverySettings.sourceCheckpoints?.[platform] || {}),
          ...(snapshotSettings.sourceCheckpoints?.[platform] || {}),
        },
      ])
    ),
    initializedAt: workspace.discoverySettings.initializedAt || snapshotSettings.initializedAt,
    updatedAt: snapshotSettings.updatedAt || workspace.discoverySettings.updatedAt,
  };
  if (!Object.prototype.hasOwnProperty.call(workspace.discoverySettings, 'enabled')) {
    workspace.discoverySettings.enabled = snapshotSettings.enabled;
  }
  if (!Object.prototype.hasOwnProperty.call(workspace.discoverySettings, 'dailyBudgetUsd')) {
    workspace.discoverySettings.dailyBudgetUsd = snapshotSettings.dailyBudgetUsd;
  }
  if (!Object.prototype.hasOwnProperty.call(workspace.discoverySettings, 'viralScoreThreshold')) {
    workspace.discoverySettings.viralScoreThreshold = snapshotSettings.viralScoreThreshold;
  }
  if (!Array.isArray(workspace.discoverySettings.platforms) && Array.isArray(snapshotSettings.platforms)) {
    workspace.discoverySettings.platforms = [...snapshotSettings.platforms];
  }
}

function findAutomaticDiscoveryReelIndex(reels = [], workspaceId, candidate = {}) {
  const targetId = normalizeDiscoveryIdentity(candidate.id);
  if (targetId) {
    const indexById = reels.findIndex((reel) => reel?.workspaceId === workspaceId && normalizeDiscoveryIdentity(reel.id) === targetId);
    if (indexById >= 0) return indexById;
  }

  const targetApifyKey = normalizeDiscoveryIdentity(getApifySignalKey(candidate.importedMetadata || {}));
  if (targetApifyKey) {
    const indexByApifyKey = reels.findIndex((reel) => (
      reel?.workspaceId === workspaceId
      && normalizeDiscoveryIdentity(getApifySignalKey(reel.importedMetadata || {})) === targetApifyKey
    ));
    if (indexByApifyKey >= 0) return indexByApifyKey;
  }

  const targetUrl = normalizeDiscoveryIdentity(canonicalizeSignalUrl(candidate.sourceUrl || candidate.importedMetadata?.url || ''));
  if (!targetUrl) return -1;
  return reels.findIndex((reel) => (
    reel?.workspaceId === workspaceId
    && normalizeDiscoveryIdentity(canonicalizeSignalUrl(reel.sourceUrl || reel.importedMetadata?.url || '')) === targetUrl
  ));
}

function mergeAutomaticDiscoveryReel(db = {}, workspaceId, reel = {}, { prepend = false } = {}) {
  const reels = Array.isArray(db.reels) ? db.reels : (db.reels = []);
  const nextReel = cloneDiscoveryReel(reel);
  const existingIndex = findAutomaticDiscoveryReelIndex(reels, workspaceId, nextReel);
  if (existingIndex >= 0) {
    const current = reels[existingIndex] || {};
    reels[existingIndex] = mergeSignalSnapshot(current, nextReel, new Date());
    return;
  }
  if (prepend) {
    reels.unshift(nextReel);
    return;
  }
  reels.push(nextReel);
}

function mergeAutomaticDiscoveryClaim(db = {}, snapshotDb = {}, workspaceId) {
  const claimRun = listAutomaticDiscoveryRuns(snapshotDb, workspaceId).find((run) => run.status === 'running');
  if (claimRun) {
    upsertAutomaticDiscoveryRun(db, claimRun);
  }
  return db;
}

function mergeAutomaticDiscoveryResult(db = {}, snapshotDb = {}, workspaceId, result = {}) {
  const workspace = db.workspaces.find((item) => item.id === workspaceId);
  const snapshotWorkspace = snapshotDb.workspaces.find((item) => item.id === workspaceId);
  if (workspace && snapshotWorkspace) {
    mergeAutomaticDiscoverySettings(workspace, snapshotWorkspace);
  }

  if (result.run) {
    upsertAutomaticDiscoveryRun(db, result.run);
  }

  for (const reel of Array.isArray(result.updatedSignals) ? result.updatedSignals : []) {
    mergeAutomaticDiscoveryReel(db, workspaceId, reel);
  }
  for (const reel of Array.isArray(result.acceptedSignals) ? result.acceptedSignals : []) {
    mergeAutomaticDiscoveryReel(db, workspaceId, reel, { prepend: true });
  }

  return db;
}

function isAutomaticDiscoveryReel(reel = {}) {
  const sourceStatus = String(reel.sourceStatus || reel.importedMetadata?.sourceStatus || '').toLowerCase();
  const sourceTone = String(reel.importedMetadata?.source?.tone || reel.importedMetadata?.platform || '').toLowerCase();
  if (sourceStatus.includes('apify')) return true;
  if (reel.importedMetadata?.apify) return true;
  return sourceTone === 'instagram' || sourceTone === 'tiktok';
}

function mergeAutomaticDiscoveryWriteSnapshot(outgoingDb = {}, latestDb = {}) {
  const nextDb = normalizeDbShape(outgoingDb);
  const latest = normalizeDbShape(latestDb);

  const latestRuns = Array.isArray(latest.discoveryRuns) ? latest.discoveryRuns : [];
  for (const run of latestRuns) {
    if (run?.id) upsertAutomaticDiscoveryRun(nextDb, run);
  }

  const nextWorkspaces = Array.isArray(nextDb.workspaces) ? nextDb.workspaces : (nextDb.workspaces = []);
  const latestWorkspaces = Array.isArray(latest.workspaces) ? latest.workspaces : [];
  for (const latestWorkspace of latestWorkspaces) {
    if (!latestWorkspace?.id || !latestWorkspace.discoverySettings) continue;
    const workspace = nextWorkspaces.find((item) => item?.id === latestWorkspace.id);
    if (workspace) {
      workspace.discoverySettings = copyDiscoverySettings(latestWorkspace.discoverySettings);
    }
  }

  const latestReels = Array.isArray(latest.reels) ? latest.reels : [];
  for (const reel of latestReels) {
    if (!reel?.workspaceId || !isAutomaticDiscoveryReel(reel)) continue;
    mergeAutomaticDiscoveryReel(nextDb, reel.workspaceId, reel);
  }

  return nextDb;
}

function runAutomaticDiscoveryFetch(call = {}) {
  if (automaticDiscoveryTestProvider) {
    return automaticDiscoveryTestProvider({
      ...call,
    });
  }
  return fetchApifySignals({
    ...call,
    token: APIFY_TOKEN,
  });
}

function clampAutomaticDiscoveryBudgetUsd(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(
    DISCOVERY_SETTINGS_BUDGET_MAX_USD,
    Math.max(DISCOVERY_SETTINGS_BUDGET_MIN_USD, Math.round(numeric * 100) / 100)
  );
}

function clampAutomaticDiscoveryViralScore(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(DISCOVERY_VIRAL_SCORE_MAX, Math.max(DISCOVERY_VIRAL_SCORE_MIN, Math.round(numeric)));
}

function normalizeDiscoveryPlatforms(platforms, fallback = DISCOVERY_PLATFORM_NAMES) {
  const values = Array.isArray(platforms) ? platforms : fallback;
  const normalized = Array.from(new Set(values.map((value) => String(value || '').trim().toLowerCase())))
    .filter((value) => DISCOVERY_PLATFORM_NAMES.includes(value));
  return normalized.length ? normalized : [...fallback];
}

function getWorkspaceDiscoverySettingsSnapshot(workspace = {}, now = new Date()) {
  ensureWorkspaceDiscoverySettings(workspace, now);
  const defaults = defaultDiscoverySettings(now);
  const savedSettings = workspace.discoverySettings || workspace.automaticDiscovery || workspace.signalDiscovery || {};
  return {
    ...defaults,
    ...savedSettings,
    enabled: savedSettings.enabled !== false,
    dailyBudgetUsd: clampAutomaticDiscoveryBudgetUsd(savedSettings.dailyBudgetUsd, defaults.dailyBudgetUsd),
    viralScoreThreshold: clampAutomaticDiscoveryViralScore(savedSettings.viralScoreThreshold, defaults.viralScoreThreshold),
    platforms: normalizeDiscoveryPlatforms(savedSettings.platforms, defaults.platforms),
    laneIntervalsMs: {
      ...(defaults.laneIntervalsMs || {}),
      ...(savedSettings.laneIntervalsMs || {}),
    },
    lastRunAt: {
      ...(defaults.lastRunAt || {}),
      ...(savedSettings.lastRunAt || {}),
    },
    nextRunAt: {
      ...(defaults.nextRunAt || {}),
      ...(savedSettings.nextRunAt || {}),
    },
    retryCounts: {
      ...(savedSettings.retryCounts || {}),
    },
    sourceCheckpoints: Object.fromEntries(
      DISCOVERY_PLATFORM_NAMES.map((platform) => [
        platform,
        { ...(savedSettings.sourceCheckpoints?.[platform] || {}) },
      ])
    ),
    initializedAt: savedSettings.initializedAt || defaults.initializedAt,
    updatedAt: savedSettings.updatedAt || defaults.updatedAt,
  };
}

function listAutomaticDiscoveryRuns(db = {}, workspaceId) {
  return (Array.isArray(db.discoveryRuns) ? db.discoveryRuns : [])
    .filter((run) => run && run.workspaceId === workspaceId && run.lane === 'automatic');
}

function sanitizeDiscoveryRun(run = {}) {
  return {
    id: run.id,
    lane: run.lane,
    platform: run.platform,
    dayKey: run.dayKey,
    status: run.status,
    budgetUsd: Number.isFinite(Number(run.budgetUsd)) ? Number(run.budgetUsd) : null,
    spentUsdBefore: Number.isFinite(Number(run.spentUsdBefore)) ? Number(run.spentUsdBefore) : 0,
    estimatedCostUsd: Number.isFinite(Number(run.estimatedCostUsd)) ? Number(run.estimatedCostUsd) : 0,
    reservedCostUsd: Number.isFinite(Number(run.reservedCostUsd)) ? Number(run.reservedCostUsd) : 0,
    actualCostUsd: run.actualCostUsd !== null
      && run.actualCostUsd !== undefined
      && Number.isFinite(Number(run.actualCostUsd))
      ? Number(run.actualCostUsd)
      : null,
    attemptedCallCount: Number.isFinite(Number(run.attemptedCallCount)) ? Number(run.attemptedCallCount) : 0,
    requestedCount: Number.isFinite(Number(run.requestedCount)) ? Number(run.requestedCount) : 0,
    returnedCount: Number.isFinite(Number(run.returnedCount)) ? Number(run.returnedCount) : 0,
    acceptedCount: Number.isFinite(Number(run.acceptedCount)) ? Number(run.acceptedCount) : 0,
    duplicateCount: Number.isFinite(Number(run.duplicateCount)) ? Number(run.duplicateCount) : 0,
    rejectedCount: Number.isFinite(Number(run.rejectedCount)) ? Number(run.rejectedCount) : 0,
    errorCount: Number.isFinite(Number(run.errorCount)) ? Number(run.errorCount) : 0,
    errors: Array.isArray(run.errors) ? run.errors : [],
    claimedAt: run.claimedAt || null,
    startedAt: run.startedAt || null,
    completedAt: run.completedAt || null,
    updatedAt: run.updatedAt || null,
  };
}

function getLatestTimestamp(values = []) {
  const timestamps = values
    .map((value) => Date.parse(value || ''))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function getEarliestTimestamp(values = []) {
  const timestamps = values
    .map((value) => Date.parse(value || ''))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

function getDiscoveryStatusCode({ settings, activeRun, latestRun, dailySpendUsd, now = new Date() }) {
  if (activeRun) return 'running';
  if (settings.enabled === false) return 'paused';
  if (dailySpendUsd >= settings.dailyBudgetUsd) return 'budget_reached';
  if (latestRun?.status === 'failed') return 'failed';
  if (latestRun?.status === 'completed') return 'completed';
  return 'idle';
}

function getWorkspaceTesterDiscoveryPolicy(db = {}, workspaceId, actorUser = null) {
  const workspaceUser = actorUser || getWorkspaceUsers(db, workspaceId)[0] || null;
  const entitlements = buildEntitlements(db, workspaceId, workspaceUser);
  return getTesterDiscoveryPolicy(entitlements.plan.id);
}

function canWorkspaceUsePaidDiscovery(db = {}, workspaceId, actorUser = null) {
  const workspaceUser = actorUser || getWorkspaceUsers(db, workspaceId)[0] || null;
  const entitlements = buildEntitlements(db, workspaceId, workspaceUser);
  return Boolean(
    entitlements.unlimited
    || entitlements.plan.features?.includes('apify_discovery')
  );
}

function buildPaidDiscoveryAccessError() {
  const error = new Error('shared_signal_bank_only');
  error.status = 403;
  error.payload = {
    error: 'shared_signal_bank_only',
    message: 'Fresh paid discovery is closed during public beta. Choose a signal from the shared bank and adapt it instead.',
  };
  return error;
}

function assertWorkspaceCanUsePaidDiscovery(db = {}, workspaceId, actorUser = null) {
  if (!canWorkspaceUsePaidDiscovery(db, workspaceId, actorUser)) {
    throw buildPaidDiscoveryAccessError();
  }
}

function buildSharedBankDiscoveryStatus(payload = {}) {
  return {
    ...payload,
    access: {
      mode: 'shared_bank',
      paidDiscoveryEnabled: false,
    },
    settings: {
      ...(payload.settings || {}),
      enabled: false,
    },
    status: {
      ...(payload.status || {}),
      code: 'shared_bank',
      label: 'Shared signal bank',
      running: false,
      canRunNow: false,
      dailySpendUsd: 0,
      remainingBudgetUsd: 0,
      nextRunAt: null,
      activeRun: null,
    },
  };
}

function hasReachedTesterDiscoveryDailyRunLimit(db = {}, workspaceId, policy, now = new Date()) {
  if (!policy) return false;
  const dayKey = now.toISOString().slice(0, 10);
  const budgetedRunsToday = listAutomaticDiscoveryRuns(db, workspaceId).filter((run) => (
    (run.dayKey || String(run.claimedAt || run.startedAt || run.completedAt || '').slice(0, 10)) === dayKey
    && (
      Number(run.attemptedCallCount || 0) > 0
      || Number(run.reservedCostUsd || 0) > 0
      || Number(run.actualCostUsd || 0) > 0
    )
  )).length;
  return budgetedRunsToday >= policy.maxBudgetedRunsPerDay;
}

function getDiscoveryStatusLabel(code) {
  const labels = {
    idle: 'Idle',
    running: 'Running',
    paused: 'Paused',
    completed: 'Completed',
    failed: 'Needs attention',
    budget_reached: 'Budget reached',
  };
  return labels[code] || 'Idle';
}

function buildDiscoveryStatusResponse(db = {}, workspaceId, now = new Date()) {
  const workspace = db.workspaces.find((item) => item.id === workspaceId) || {};
  const settings = getWorkspaceDiscoverySettingsSnapshot(workspace, now);
  const policy = getWorkspaceTesterDiscoveryPolicy(db, workspaceId);
  if (policy) {
    settings.dailyBudgetUsd = Math.min(settings.dailyBudgetUsd, policy.dailyBudgetUsd);
  }
  const testerDailyRunLimitReached = hasReachedTesterDiscoveryDailyRunLimit(db, workspaceId, policy, now);
  const runs = listAutomaticDiscoveryRuns(db, workspaceId);
  const activeRun = runs.find((run) => run.status === 'running') || null;
  const latestRun = runs[0] || null;
  const spendSummary = getDailyAutomaticSpendSummary(db.discoveryRuns, workspaceId, now);
  const dailySpendUsd = spendSummary.amountUsd;
  const inputs = buildDiscoveryInputs(db, workspaceId);
  const nextRunAt = getEarliestTimestamp(Object.values(settings.nextRunAt || {}));
  const lastScheduledRunAt = getLatestTimestamp(Object.values(settings.lastRunAt || {}));
  const statusCode = getDiscoveryStatusCode({ settings, activeRun, latestRun, dailySpendUsd, now });

  return {
    settings: {
      enabled: settings.enabled,
      dailyBudgetUsd: settings.dailyBudgetUsd,
      viralScoreThreshold: settings.viralScoreThreshold,
      platforms: [...settings.platforms],
      lastRunAt: { ...(settings.lastRunAt || {}) },
      nextRunAt: { ...(settings.nextRunAt || {}) },
      updatedAt: settings.updatedAt,
    },
    status: {
      code: statusCode,
      label: getDiscoveryStatusLabel(statusCode),
      running: Boolean(activeRun),
      tokenConfigured: Boolean(APIFY_TOKEN),
      workerEnabled: AUTOMATIC_DISCOVERY_ENABLED,
      workerTickMs: AUTOMATIC_DISCOVERY_TICK_MS,
      dailySpendUsd,
      dailySpendIsEstimated: spendSummary.isEstimated,
      dailyBudgetUsd: settings.dailyBudgetUsd,
      remainingBudgetUsd: Math.max(0, Math.round((settings.dailyBudgetUsd - dailySpendUsd) * 100) / 100),
      lastRunAt: latestRun?.completedAt || latestRun?.updatedAt || lastScheduledRunAt,
      nextRunAt,
      activeRun: activeRun ? sanitizeDiscoveryRun(activeRun) : null,
      latestRun: latestRun ? sanitizeDiscoveryRun(latestRun) : null,
      canRunNow: Boolean(APIFY_TOKEN)
        && settings.enabled !== false
        && !activeRun
        && !testerDailyRunLimitReached
        && dailySpendUsd < settings.dailyBudgetUsd,
    },
    inputs: Object.fromEntries(
      Object.entries(inputs).map(([platform, platformInputs]) => [
        platform,
        Object.fromEntries(
          Object.entries(platformInputs || {}).map(([lane, values]) => [lane, Array.isArray(values) ? values.length : 0])
        ),
      ])
    ),
    runs: runs.slice(0, DISCOVERY_STATUS_RUN_LIMIT).map(sanitizeDiscoveryRun),
  };
}

function createPersistedDiscoverySettings(workspace = {}, changes = {}, now = new Date()) {
  const current = getWorkspaceDiscoverySettingsSnapshot(workspace, now);
  return {
    ...(workspace.discoverySettings || {}),
    enabled: Object.prototype.hasOwnProperty.call(changes, 'enabled') ? changes.enabled : current.enabled,
    dailyBudgetUsd: Object.prototype.hasOwnProperty.call(changes, 'dailyBudgetUsd')
      ? changes.dailyBudgetUsd
      : current.dailyBudgetUsd,
    viralScoreThreshold: Object.prototype.hasOwnProperty.call(changes, 'viralScoreThreshold')
      ? changes.viralScoreThreshold
      : current.viralScoreThreshold,
    platforms: Object.prototype.hasOwnProperty.call(changes, 'platforms')
      ? [...changes.platforms]
      : [...current.platforms],
    laneIntervalsMs: {
      ...(current.laneIntervalsMs || {}),
    },
    lastRunAt: {
      ...(current.lastRunAt || {}),
    },
    nextRunAt: {
      ...(current.nextRunAt || {}),
    },
    retryCounts: {
      ...(current.retryCounts || {}),
    },
    sourceCheckpoints: Object.fromEntries(
      DISCOVERY_PLATFORM_NAMES.map((platform) => [
        platform,
        { ...(current.sourceCheckpoints?.[platform] || {}) },
      ])
    ),
    initializedAt: current.initializedAt,
    updatedAt: new Date(now).toISOString(),
  };
}

function parseDiscoverySettingsPatch(body = {}) {
  const changes = {};

  if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    if (typeof body.enabled !== 'boolean') {
      const error = new Error('enabled_must_be_boolean');
      error.status = 400;
      throw error;
    }
    changes.enabled = body.enabled;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'dailyBudgetUsd')) {
    const numeric = Number(body.dailyBudgetUsd);
    if (!Number.isFinite(numeric) || numeric < DISCOVERY_SETTINGS_BUDGET_MIN_USD || numeric > DISCOVERY_SETTINGS_BUDGET_MAX_USD) {
      const error = new Error('daily_budget_out_of_range');
      error.status = 400;
      throw error;
    }
    changes.dailyBudgetUsd = Math.round(numeric * 100) / 100;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'viralScoreThreshold')) {
    const numeric = Number(body.viralScoreThreshold);
    if (!Number.isFinite(numeric) || numeric < DISCOVERY_VIRAL_SCORE_MIN || numeric > DISCOVERY_VIRAL_SCORE_MAX) {
      const error = new Error('viral_score_threshold_out_of_range');
      error.status = 400;
      throw error;
    }
    changes.viralScoreThreshold = Math.round(numeric);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'platforms')) {
    if (!Array.isArray(body.platforms)) {
      const error = new Error('platforms_must_be_array');
      error.status = 400;
      throw error;
    }
    const platforms = normalizeDiscoveryPlatforms(body.platforms, []);
    if (!platforms.length) {
      const error = new Error('platform_required');
      error.status = 400;
      throw error;
    }
    changes.platforms = platforms;
  }

  return changes;
}

function shouldRunAutomaticDiscoveryTick(db = {}, workspaceId, now = new Date()) {
  if (!APIFY_TOKEN) return false;
  if (automaticDiscoveryWorkspacesInFlight.has(workspaceId)) return false;
  const workspace = db.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return false;
  if (!canWorkspaceUsePaidDiscovery(db, workspaceId)) return false;
  const settings = getWorkspaceDiscoverySettingsSnapshot(workspace, now);
  const policy = getWorkspaceTesterDiscoveryPolicy(db, workspaceId);
  if (policy) {
    settings.dailyBudgetUsd = Math.min(settings.dailyBudgetUsd, policy.dailyBudgetUsd);
    if (hasReachedTesterDiscoveryDailyRunLimit(db, workspaceId, policy, now)) return false;
  }
  if (settings.enabled === false) return false;
  const runs = listAutomaticDiscoveryRuns(db, workspaceId);
  if (runs.some((run) => run.status === 'running')) return false;
  const dailySpendUsd = getDailyAutomaticSpend(db.discoveryRuns, workspaceId, now);
  if (dailySpendUsd >= settings.dailyBudgetUsd) return false;
  return ['accounts', 'keywords', 'hashtags', 'trends'].some((lane) => isDiscoveryDue(settings, lane, now));
}

async function runAutomaticDiscoveryForWorkspace(workspaceId, options = {}) {
  if (!APIFY_TOKEN) {
    const error = new Error('apify_not_configured');
    error.status = 501;
    error.payload = {
      error: 'apify_not_configured',
      message: 'Set APIFY_TOKEN in .env before running automatic discovery.',
    };
    throw error;
  }

  if (automaticDiscoveryWorkspacesInFlight.has(workspaceId)) {
    return { run: null, acceptedSignals: [], updatedSignals: [] };
  }

  automaticDiscoveryWorkspacesInFlight.add(workspaceId);
  try {
    const now = options.now || new Date();
    const claim = await withAutomaticDiscoveryStateLock(workspaceId, async (db) => {
      const workspace = db.workspaces.find((item) => item.id === workspaceId);
      if (!workspace) {
        const error = new Error('workspace_not_found');
        error.status = 404;
        error.payload = { error: 'workspace_not_found' };
        throw error;
      }
      assertWorkspaceCanUsePaidDiscovery(db, workspaceId, options.actorUser || null);
      const policy = getWorkspaceTesterDiscoveryPolicy(db, workspaceId);
      const prepared = prepareAutomaticDiscovery({
        state: db,
        workspaceId,
        now,
        force: Boolean(options.force),
        recordPaused: Boolean(options.force),
        policy,
      });
      return { db, prepared };
    });

    if (!claim.prepared.execution) {
      return claim.prepared;
    }

    const result = await executeAutomaticDiscovery({
      state: claim.db,
      workspaceId,
      now,
      prepared: claim.prepared,
      getCurrentTime: () => new Date(),
      onProgress: async (run) => {
        await withAutomaticDiscoveryStateLock(workspaceId, async (currentDb) => {
          upsertAutomaticDiscoveryRun(currentDb, run);
        });
      },
      fetchSignals: runAutomaticDiscoveryFetch,
    });

    if (result.run) {
      await withAutomaticDiscoveryStateLock(workspaceId, async (currentDb) => {
        mergeAutomaticDiscoveryResult(currentDb, claim.db, workspaceId, result);
      });
    }

    return result;
  } finally {
    automaticDiscoveryWorkspacesInFlight.delete(workspaceId);
  }
}

async function runAutomaticDiscoveryWorkerTick() {
  if (!AUTOMATIC_DISCOVERY_ENABLED || automaticDiscoveryTickInFlight) return;
  automaticDiscoveryTickInFlight = true;
  try {
    const db = await readDb();
    const now = new Date();
    const workspaceIds = db.workspaces
      .map((workspace) => workspace.id)
      .filter(Boolean);

    for (const workspaceId of workspaceIds) {
      try {
        await runAutomaticDiscoveryForWorkspace(workspaceId, { now, force: false });
      } catch (error) {
        console.error('[AutomaticDiscoveryWorker]', workspaceId, error);
      }
    }
  } finally {
    automaticDiscoveryTickInFlight = false;
  }
}

function logAutomaticDiscoveryWorkerError(error) {
  try {
    const message = error instanceof Error
      ? error.stack || error.message
      : String(error || 'unknown_worker_error');
    console.error('[AutomaticDiscoveryWorker]', message);
  } catch {
    // Logging must never turn a scheduler failure into an unhandled rejection.
  }
}

function startAutomaticDiscoveryWorker() {
  if (!AUTOMATIC_DISCOVERY_ENABLED) return;
  const timer = setInterval(() => {
    void runAutomaticDiscoveryWorkerTick().catch(logAutomaticDiscoveryWorkerError);
  }, AUTOMATIC_DISCOVERY_TICK_MS);
  timer.unref();
}

function normalizeContentPlanPosts(posts) {
  if (!Array.isArray(posts)) return [];
  return posts.slice(0, 2000).map((post, index) => ({
    id: String(post?.id || createId('post')).slice(0, 80),
    day: Math.min(31, Math.max(1, Number(post?.day || index + 1))),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(post?.date || '')) ? String(post.date) : '',
    title: String(post?.title || '').trim().slice(0, 180) || 'Untitled post',
    body: normalizeContentPlanBody(post?.body),
    format: normalizeContentFormat(post?.format),
    time: /^\d{2}:\d{2}$/.test(String(post?.time || '')) ? post.time : '10:00',
    done: Boolean(post?.done),
    source: String(post?.source || '').trim().slice(0, 80),
    sourceKey: String(post?.sourceKey || '').trim().slice(0, 180),
    sourceTitle: String(post?.sourceTitle || '').trim().slice(0, 180),
    sourceUrl: String(post?.sourceUrl || '').trim().slice(0, 500),
    sourceReelId: String(post?.sourceReelId || '').trim().slice(0, 120),
    sourceHandle: String(post?.sourceHandle || '').trim().slice(0, 80),
    dayLabel: String(post?.dayLabel || '').trim().slice(0, 24),
  }));
}

function normalizeContentFormat(format, fallback = 'Post') {
  const clean = String(format || '').trim();
  if (CONTENT_FORMATS.includes(clean)) return clean;
  const normalized = clean.toLowerCase().replace(/\s+/g, ' ');
  return CONTENT_FORMAT_ALIASES[normalized] || fallback;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt);
  const expectedBuffer = Buffer.from(storedHash);
  const candidateBuffer = Buffer.from(candidate);
  return expectedBuffer.length === candidateBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
}

function getPublicUserProvider(user) {
  if (normalizeEmail(user.email) === 'demo@dzhero.app' || String(user.workspaceId || '').startsWith('ws_demo_')) {
    return 'demo';
  }
  if ((user.oauthProviders || []).includes('google')) return 'google';
  if (user.authProvider === 'email_trial') return 'email';
  if (user.authProvider) return user.authProvider;
  return 'email';
}

function isVerifiedGoogleUser(user) {
  return user?.authProvider === 'google' || (user?.oauthProviders || []).includes('google');
}

function publicUser(user) {
  const provider = getPublicUserProvider(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    provider,
    isDemo: provider === 'demo',
    canManageTesters: provider !== 'demo' && userHasUnlimitedAccess(user),
    workspaceId: user.workspaceId,
    avatarUrl: user.avatarUrl || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

function buildAuthPayload(db, user) {
  return buildAuthWorkspacePayload(db, user, publicUser);
}

function ensureOAuthUser(db, profile) {
  const email = normalizeEmail(profile.email);
  if (!email || !email.includes('@')) {
    throw new Error('OAuth provider did not return a verified email.');
  }
  let user = db.users.find((item) => normalizeEmail(item.email) === email);
  if (user) {
    if (
      profile.provider === 'google'
      && user.oauthSubject
      && profile.sub
      && user.oauthSubject !== profile.sub
    ) {
      throw new Error('Google identity does not match the existing account.');
    }
    user.name = user.name || profile.name || email.split('@')[0];
    user.avatarUrl = user.avatarUrl || profile.picture || '';
    user.oauthProviders = Array.from(new Set([...(user.oauthProviders || []), profile.provider]));
    user.authProvider = profile.provider;
    if (profile.provider === 'google' && !user.oauthSubject) user.oauthSubject = profile.sub || null;
    user.lastLoginAt = new Date().toISOString();
    return user;
  }

  const name = String(profile.name || email.split('@')[0] || 'User').trim();
  const workspace = {
    id: createId('ws'),
    name: `${name} workspace`,
    owner: name,
    mode: 'own_business',
    marketFocus: ['ua', 'us', 'eu', 'global'],
    createdAt: new Date().toISOString(),
    brief: {},
  };
  user = {
    id: createId('usr'),
    name,
    email,
    role: 'owner',
    workspaceId: workspace.id,
    passwordHash: hashPassword(crypto.randomBytes(18).toString('hex')),
    authProvider: profile.provider,
    oauthProviders: [profile.provider],
    oauthSubject: profile.sub || null,
    avatarUrl: profile.picture || '',
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };
  db.workspaces.unshift(workspace);
  db.users.unshift(user);
  ensureWorkspaceSubscription(db, workspace.id, { planId: 'trial' });
  return user;
}

function publicPlan(plan) {
  return {
    id: plan.id,
    name: plan.name,
    billingPeriod: plan.billingPeriod,
    priceUah: plan.priceUah,
    limits: plan.limits,
    features: plan.features,
  };
}

function getWorkspaceUsers(db, workspaceId) {
  return (db.users || []).filter((user) => (
    user.workspaceId === workspaceId
    || (Array.isArray(user.workspaceIds) && user.workspaceIds.includes(workspaceId))
  ));
}

function userHasUnlimitedAccess(user) {
  return Boolean(
    user
    && (
      user.role === 'admin'
      || UNLIMITED_ACCESS_EMAILS.has(normalizeEmail(user.email))
    )
  );
}

function workspaceHasUnlimitedAccess(db, workspaceId, actorUser = null) {
  if (String(workspaceId || '').startsWith('ws_demo_') || getPublicUserProvider(actorUser || {}) === 'demo') {
    return false;
  }
  if (userHasUnlimitedAccess(actorUser)) return true;
  return getWorkspaceUsers(db, workspaceId).some((user) => (
    user.role === 'admin'
    || UNLIMITED_ACCESS_EMAILS.has(normalizeEmail(user.email))
  ));
}

function buildUnlimitedPlan(basePlan) {
  const limits = Object.fromEntries(
    Object.keys(basePlan.limits || {}).map((key) => [key, null])
  );
  return {
    ...basePlan,
    id: 'owner_unlimited',
    name: 'Owner Unlimited',
    billingPeriod: 'internal',
    priceUah: 0,
    limits,
    features: Array.from(new Set([...(basePlan.features || []), 'owner_unlimited'])),
  };
}

function getPlan(planId) {
  return PLAN_CATALOG.find((plan) => plan.id === planId) || PLAN_CATALOG[0];
}

function getUsagePeriod(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function getDefaultPlanId(workspaceId) {
  return String(workspaceId || '').startsWith('ws_demo_') ? 'demo' : 'trial';
}

function ensureWorkspaceSubscription(db, workspaceId, options = {}) {
  db.subscriptions ||= [];
  const existing = db.subscriptions.find((item) => item.workspaceId === workspaceId);
  if (existing) return existing;
  const now = new Date();
  const planId = options.planId || getDefaultPlanId(workspaceId);
  const isDemo = planId === 'demo';
  const isTrial = planId === 'trial';
  const trialDays = Number(options.trialDays || 3);
  const periodDays = isTrial ? trialDays : 30;
  const subscription = {
    id: createId('sub'),
    workspaceId,
    planId,
    status: isDemo ? 'demo' : isTrial ? 'trialing' : 'active',
    provider: 'manual',
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000).toISOString(),
    trialEndsAt: isTrial ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000).toISOString() : null,
    cancelAtPeriodEnd: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  db.subscriptions.unshift(subscription);
  return subscription;
}

function getUsageCounter(db, workspaceId, metric, period = getUsagePeriod()) {
  db.usageCounters ||= [];
  let counter = db.usageCounters.find((item) => (
    item.workspaceId === workspaceId && item.metric === metric && item.period === period
  ));
  if (!counter) {
    counter = {
      id: createId('usage'),
      workspaceId,
      metric,
      period,
      value: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.usageCounters.unshift(counter);
  }
  return counter;
}

function buildEntitlements(db, workspaceId, actorUser = null) {
  const subscription = ensureWorkspaceSubscription(db, workspaceId);
  const basePlan = getPlan(subscription.planId);
  const unlimited = workspaceHasUnlimitedAccess(db, workspaceId, actorUser);
  const workspaceUser = actorUser || getWorkspaceUsers(db, workspaceId)[0] || null;
  const testerGrant = getActiveTesterGrant(db, workspaceUser);
  const testerPlan = PLAN_CATALOG.find((item) => item.id === 'tester_pro');
  const resolvedAccess = resolveAccessPlan({
    basePlan,
    testerPlan,
    grant: testerGrant,
    unlimited,
  });
  const plan = unlimited ? buildUnlimitedPlan(basePlan) : resolvedAccess.plan;
  const period = getUsagePeriod();
  const usage = {
    aiOperations: getUsageCounter(db, workspaceId, USAGE_METRICS.aiOperations, period).value,
    agentChat: getUsageCounter(db, workspaceId, USAGE_METRICS.agentChat, period).value,
    reelImports: getUsageCounter(db, workspaceId, USAGE_METRICS.reelImports, period).value,
    brandBrainSaves: getUsageCounter(db, workspaceId, USAGE_METRICS.brandBrainSaves, period).value,
    competitors: db.competitors.filter((item) => item.workspaceId === workspaceId).length,
    workspaces: workspaceUser
      ? db.workspaces.filter((item) => canAccessWorkspace(workspaceUser, item.id)).length
      : 0,
    teamMembers: getWorkspaceUsers(db, workspaceId).length,
    instagramAccounts: db.instagramAccounts.filter((item) => item.workspaceId === workspaceId).length,
    contentPlanPosts: normalizeContentPlanPosts(db.workspaces.find((item) => item.id === workspaceId)?.contentPlanPosts || []).length,
  };
  const remaining = Object.fromEntries(
    Object.keys(usage).map((key) => {
      const limit = plan.limits[key];
      return [key, Number.isFinite(limit) ? Math.max(0, limit - usage[key]) : null];
    })
  );
  const trialEndsAt = subscription.trialEndsAt ? Date.parse(subscription.trialEndsAt) : null;
  const testerAccessActive = resolvedAccess.accessSource === 'tester_grant';
  const trial = {
    active: !unlimited && !testerAccessActive && subscription.status === 'trialing' && (!trialEndsAt || trialEndsAt > Date.now()),
    expired: !unlimited && !testerAccessActive && subscription.status === 'trialing' && Boolean(trialEndsAt) && trialEndsAt <= Date.now(),
    endsAt: subscription.trialEndsAt,
    daysRemaining: trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / (24 * 60 * 60 * 1000))) : null,
  };
  return {
    plan: publicPlan(plan),
    subscription,
    trial,
    period,
    usage,
    remaining,
    unlimited,
    accessSource: resolvedAccess.accessSource,
    testerGrant: testerGrant ? {
      id: testerGrant.id,
      email: testerGrant.email,
      status: testerGrant.status,
      grantedAt: testerGrant.grantedAt || null,
      activatedAt: testerGrant.activatedAt || null,
    } : null,
  };
}

function assertUsageAvailable(db, workspaceId, usageKey, amount = 1, actorUser = null) {
  const entitlements = buildEntitlements(db, workspaceId, actorUser);
  if (entitlements.unlimited) return entitlements;
  if (entitlements.trial.expired) {
    const error = new Error('trial_expired');
    error.status = 402;
    error.payload = {
      error: 'trial_expired',
      plan: entitlements.plan,
      trial: entitlements.trial,
      message: 'Free Trial has ended. Choose a paid plan to continue.',
    };
    throw error;
  }
  const limit = entitlements.plan.limits[usageKey];
  const used = entitlements.usage[usageKey] || 0;
  if (Number.isFinite(limit) && used + amount > limit) {
    const error = new Error('plan_limit_reached');
    error.status = 402;
    error.payload = {
      error: 'plan_limit_reached',
      usageKey,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      plan: entitlements.plan,
      message: `Plan limit reached for ${usageKey}.`,
    };
    throw error;
  }
  return entitlements;
}

function incrementUsage(db, workspaceId, metric, amount = 1) {
  const counter = getUsageCounter(db, workspaceId, metric);
  counter.value += amount;
  counter.updatedAt = new Date().toISOString();
  return counter;
}

function createPaidAiAttemptGuard({ db, workspaceId, actorUser }) {
  let queue = Promise.resolve();
  return () => {
    queue = queue.then(async () => {
      const billing = buildEntitlements(db, workspaceId, actorUser);
      reserveUsageCounter(db, {
        workspaceId,
        metric: USAGE_METRICS.aiOperations,
        period: billing.period,
        limit: billing.plan.limits.aiOperations,
        unlimited: billing.unlimited,
      });
      await writeDb(db);
    });
    return queue;
  };
}

function getAccessibleWorkspaceSignals(db, workspaceId, authUser) {
  const entitlements = buildEntitlements(db, workspaceId, authUser);
  const ownReels = db.reels.filter((item) => item.workspaceId === workspaceId);
  const sharedBank = isSharedSignalBankPlan(entitlements)
    ? buildSharedSignalBankReels(db, {
        targetWorkspaceId: workspaceId,
        workspaceId: SHARED_SIGNAL_BANK_WORKSPACE_ID,
        ownerEmail: SHARED_SIGNAL_BANK_OWNER_EMAIL || Array.from(UNLIMITED_ACCESS_EMAILS)[0] || '',
        limit: SHARED_SIGNAL_BANK_LIMIT,
      })
    : { reels: [] };
  return dedupeWorkspaceReelsForResponse([...ownReels, ...sharedBank.reels]);
}

function getCurrentActor(db, actorUser) {
  if (!actorUser?.id) return actorUser || null;
  return db.users.find((user) => user.id === actorUser.id) || null;
}

function assertCurrentWorkspaceAccess(db, workspaceId, actorUser) {
  const currentActor = getCurrentActor(db, actorUser);
  if (!currentActor) {
    const error = new Error('unauthorized');
    error.status = 401;
    error.payload = { error: 'unauthorized' };
    throw error;
  }
  const workspace = db.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    const error = new Error('workspace_not_found');
    error.status = 404;
    error.payload = { error: 'workspace_not_found' };
    throw error;
  }
  if (!canAccessWorkspace(currentActor, workspaceId)) {
    const error = new Error('workspace_forbidden');
    error.status = 403;
    error.payload = { error: 'workspace_forbidden' };
    throw error;
  }
  return { actorUser: currentActor, workspace };
}

function createSerializedPaidAiAttemptGuard({ workspaceId, actorUser }) {
  let providerAttemptQueue = Promise.resolve();
  return () => {
    providerAttemptQueue = providerAttemptQueue.then(() => serializeBackgroundMutation(async () => {
      try {
        const db = await readDb();
        const current = assertCurrentWorkspaceAccess(db, workspaceId, actorUser);
        const billing = buildEntitlements(db, workspaceId, current.actorUser);
        reserveUsageCounter(db, {
          workspaceId,
          metric: USAGE_METRICS.aiOperations,
          period: billing.period,
          limit: billing.plan.limits.aiOperations,
          unlimited: billing.unlimited,
        });
        await writeDb(db);
      } catch (error) {
        error.providerAttemptBlocked = true;
        throw error;
      }
    }));
    return providerAttemptQueue;
  };
}

function createBrandBrainFinalizeError(code, status = 409) {
  const error = new Error(code);
  error.status = status;
  error.payload = { error: code };
  return error;
}

function isBrandBrainUsageBlock(error) {
  const code = String(error?.payload?.error || error?.message || '');
  return code === 'plan_limit_reached' || code === 'trial_expired';
}

function isBrandBrainAiUnavailable(entitlements = {}) {
  if (entitlements.unlimited) return false;
  if (entitlements.trial?.expired) return true;
  const limit = entitlements.plan?.limits?.aiOperations;
  const used = Number(entitlements.usage?.aiOperations || 0);
  return Number.isFinite(limit) && used >= limit;
}

function hasBrandBrainFingerprint(brief = {}, fingerprint = '') {
  return Number(brief.schemaVersion) === 2
    && buildBrandAnswerFingerprint(brief.answers) === fingerprint;
}

function buildPersistedBrandBrainFinalizePayload(workspace, accessibleSignals, fingerprint) {
  const brief = workspace.brief || {};
  if (!hasBrandBrainFingerprint(brief, fingerprint)) return null;
  const recommendation = brief.recommendation || null;
  if (!recommendation) {
    if (accessibleSignals.length) {
      throw createBrandBrainFinalizeError('brand_brain_recommendation_unavailable');
    }
    return {
      complete: true,
      brief,
      recommendation: null,
      signal: null,
    };
  }
  const signal = accessibleSignals.find((item) => item.id === recommendation.signalId);
  if (!signal) throw createBrandBrainFinalizeError('brand_brain_recommendation_unavailable');
  return {
    complete: true,
    brief,
    recommendation,
    signal,
  };
}

function runBrandBrainFinalizeSingleFlight(key, task) {
  const existing = brandBrainFinalizeFlights.get(key);
  if (existing) return existing;
  const flight = Promise.resolve().then(task);
  brandBrainFinalizeFlights.set(key, flight);
  const cleanup = () => {
    if (brandBrainFinalizeFlights.get(key) === flight) brandBrainFinalizeFlights.delete(key);
  };
  flight.then(cleanup, cleanup);
  return flight;
}

async function reserveBrandBrainFinalizeIntent({ workspaceId, fingerprint, actorUser }) {
  return serializeBackgroundMutation(() => withAutomaticDiscoveryStateLock(workspaceId, async (db) => {
    const current = assertCurrentWorkspaceAccess(db, workspaceId, actorUser);
    const mandatoryOnboarding = !isBrandContextComplete(current.workspace.brief || {});
    const entitlements = buildEntitlements(db, workspaceId, current.actorUser);
    const accessibleSignals = getAccessibleWorkspaceSignals(db, workspaceId, current.actorUser);
    const persisted = buildPersistedBrandBrainFinalizePayload(
      current.workspace,
      accessibleSignals,
      fingerprint,
    );
    if (persisted) return { persisted };
    const token = createId('brand_finalize');
    current.workspace.brandBrainFinalizeIntent = {
      fingerprint,
      token,
      createdAt: new Date().toISOString(),
    };
    return {
      token,
      accessibleSignals,
      mandatoryOnboarding,
      onboardingProviderBlocked: mandatoryOnboarding && isBrandBrainAiUnavailable(entitlements),
    };
  }));
}

async function clearBrandBrainFinalizeIntent({ workspaceId, token }) {
  if (!token) return;
  await serializeBackgroundMutation(() => withAutomaticDiscoveryStateLock(workspaceId, async (db) => {
    const workspace = db.workspaces.find((item) => item.id === workspaceId);
    if (workspace?.brandBrainFinalizeIntent?.token === token) {
      delete workspace.brandBrainFinalizeIntent;
    }
  }));
}

async function persistBrandBrainFinalizeResult({
  workspaceId,
  fingerprint,
  token,
  actorUser,
  finalized,
}) {
  return serializeBackgroundMutation(() => withAutomaticDiscoveryStateLock(workspaceId, async (db) => {
    const current = assertCurrentWorkspaceAccess(db, workspaceId, actorUser);
    const workspace = current.workspace;
    const accessibleSignals = getAccessibleWorkspaceSignals(db, workspaceId, current.actorUser);
    const persisted = buildPersistedBrandBrainFinalizePayload(
      workspace,
      accessibleSignals,
      fingerprint,
    );
    if (persisted) return persisted;
    const intent = workspace.brandBrainFinalizeIntent;
    if (intent?.token !== token || intent?.fingerprint !== fingerprint) {
      return { superseded: true };
    }

    let recommendation = finalized.recommendation || null;
    let signal = recommendation
      ? accessibleSignals.find((item) => item.id === recommendation.signalId) || null
      : null;
    if (recommendation && !signal && accessibleSignals.length) {
      throw createBrandBrainFinalizeError('brand_brain_accessible_signal_required');
    }
    if (!recommendation && accessibleSignals.length) {
      throw createBrandBrainFinalizeError('brand_brain_accessible_signal_required');
    }
    if (!signal) recommendation = null;

    const nextBrief = {
      ...finalized.compatibilityBrief,
      recommendation,
    };
    const mandatoryOnboarding = !isBrandContextComplete(workspace.brief || {});
    const shouldChargeSave = shouldChargeBrandBrainSave({
      existingBrief: workspace.brief || {},
      nextBrief,
    });
    if (shouldChargeSave) {
      let saveAllowedByPlan = true;
      try {
        assertUsageAvailable(db, workspace.id, 'brandBrainSaves', 1, current.actorUser);
      } catch (error) {
        if (!mandatoryOnboarding || !isBrandBrainUsageBlock(error)) throw error;
        saveAllowedByPlan = false;
      }
      if (saveAllowedByPlan) {
        incrementUsage(db, workspace.id, USAGE_METRICS.brandBrainSaves);
      }
    }
    workspace.brief = nextBrief;
    delete workspace.brandBrainDraft;
    delete workspace.brandBrainFinalizeIntent;
    const memory = {
      id: createId('mem'),
      workspaceId: workspace.id,
      type: 'brand_context_update',
      value: nextBrief,
      createdAt: new Date().toISOString(),
    };
    db.aiMemory.unshift(memory);
    return {
      complete: true,
      brief: nextBrief,
      recommendation,
      signal,
    };
  }));
}

function activateWorkspacePlan(db, workspaceId, planId, options = {}) {
  const plan = PLAN_CATALOG.find((item) => item.id === planId);
  if (!plan || plan.internal || ['demo', 'trial'].includes(plan.id)) {
    throw new Error('valid_paid_plan_required');
  }
  const now = new Date();
  const days = Number(options.days || 30);
  const subscription = ensureWorkspaceSubscription(db, workspaceId);
  subscription.planId = plan.id;
  delete subscription.pendingPlanId;
  subscription.status = options.status || 'active';
  subscription.provider = options.provider || 'manual';
  subscription.currentPeriodStart = now.toISOString();
  subscription.currentPeriodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  subscription.trialEndsAt = null;
  subscription.cancelAtPeriodEnd = false;
  subscription.tester = Boolean(options.tester);
  subscription.note = options.note || subscription.note || '';
  subscription.updatedAt = now.toISOString();
  return subscription;
}

function decodeHtml(value = '') {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractInstagramShortcode(url) {
  const match = String(url || '').match(/instagram\.com\/(?:reel|reels|p)\/([^/?#]+)/i);
  return match?.[1] || '';
}

function parseAllowedSignalUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const allowedHosts = new Set([
    'instagram.com',
    'www.instagram.com',
    'tiktok.com',
    'www.tiktok.com',
    'vm.tiktok.com',
    'vt.tiktok.com',
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
  ]);
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) return null;
  return parsed.toString();
}

function detectPublicSource(input) {
  const value = String(input || '').trim();
  const lower = value.toLowerCase();
  if (/youtube\.com\/shorts|youtu\.be|youtube\.com/i.test(lower)) {
    return { label: 'YouTube Shorts', tone: 'shorts' };
  }
  if (/tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/i.test(lower)) {
    return { label: 'TikTok', tone: 'tiktok' };
  }
  if (/instagram\.com|^@[\w.]+$/i.test(value)) {
    return { label: 'Instagram', tone: 'instagram' };
  }
  if (/https?:\/\/|www\./i.test(lower)) {
    return { label: 'Website', tone: 'website' };
  }
  return { label: 'Опис бізнесу', tone: 'text' };
}

function normalizePublicSourceUrl(input, sourceTone) {
  const raw = String(input || '').trim();
  const withProtocol = raw.startsWith('www.') ? `https://${raw}` : raw;
  const instagramHandle = raw.match(/^@([a-z0-9._]+)$/i)?.[1];
  if (instagramHandle || (sourceTone === 'instagram' && /^[a-z0-9._]+$/i.test(raw))) {
    return `https://www.instagram.com/${instagramHandle || raw.replace(/^@/, '')}/`;
  }
  let parsed;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost'
    || hostname.endsWith('.local')
    || /^127\./.test(hostname)
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  ) {
    return null;
  }
  return parsed.toString();
}

function extractMetaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyPattern = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i');
  const contentFirstPattern = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i');
  return decodeHtml(html.match(propertyPattern)?.[1] || html.match(contentFirstPattern)?.[1] || '');
}

function getInstagramHandleFromMeta(title = '', description = '') {
  const handle = title.match(/@([a-z0-9._]+)/i)?.[1] || description.match(/@([a-z0-9._]+)/i)?.[1];
  return handle ? `@${handle}` : '@instagram.reel';
}

function getPublicHandleFromMeta(source, url, title = '', description = '') {
  const fromText = title.match(/@([a-z0-9._]+)/i)?.[1] || description.match(/@([a-z0-9._]+)/i)?.[1];
  if (fromText) return `@${fromText}`;
  try {
    const parsed = new URL(url);
    if (source.tone === 'instagram' || source.tone === 'tiktok') {
      const firstPath = parsed.pathname.split('/').filter(Boolean)[0];
      return firstPath ? `@${firstPath.replace(/^@/, '')}` : parsed.hostname;
    }
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return source.label;
  }
}

function getInstagramUsernameFromUrl(url = '') {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes('instagram.com')) return '';
    const firstPath = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (!firstPath || /^(p|reel|reels|stories|explore|accounts|about|developer)$/i.test(firstPath)) return '';
    return firstPath.replace(/^@/, '');
  } catch {
    return '';
  }
}

function isGenericInstagramMeta(value = '') {
  const text = String(value || '').trim();
  return /^instagram$/i.test(text) || /create an account|log in to instagram|share what you're into|people who get you/i.test(text);
}

async function fetchInstagramWebProfileMetadata(url, fallback) {
  const username = getInstagramUsernameFromUrl(url);
  if (!username) return null;
  const apiUrl = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const response = await fetch(apiUrl, {
    headers: {
      accept: 'application/json,text/plain,*/*',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      'x-asbd-id': '129477',
      'x-ig-app-id': '936619743392459',
      'x-requested-with': 'XMLHttpRequest',
      referer: url,
    },
    redirect: 'follow',
  });
  if (!response.ok) {
    const error = new Error(`instagram_web_profile_${response.status}`);
    error.status = response.status;
    throw error;
  }
  const raw = await response.text();
  const payload = JSON.parse(raw.replace(/^for\s*\(;;\);\s*/, ''));
  const user = payload?.data?.user;
  if (!user) return null;
  const stats = {
    followers: formatCompactNumber(user.edge_followed_by?.count),
    following: formatCompactNumber(user.edge_follow?.count),
    posts: formatCompactNumber(user.edge_owner_to_timeline_media?.count),
  };
  const title = [user.full_name, user.username ? `@${user.username}` : ''].filter(Boolean).join(' ');
  const description = compactText(user.biography || '', 900);
  const handle = user.username ? `@${user.username}` : fallback.handle;
  const analysisText = [
    title,
    description,
    stats.followers && `${stats.followers} followers`,
    stats.posts && `${stats.posts} posts`,
    handle,
  ].filter(Boolean).join(' ');
  return {
    ...fallback,
    url,
    title,
    description,
    handle,
    image: user.profile_pic_url_hd || user.profile_pic_url || '',
    stats,
    sourceStatus: title || description ? 'instagram_web_profile' : 'url_only',
    analysisText,
  };
}

function extractNumberFromDescription(description, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(description || '').match(new RegExp(`([\\d,.]+\\s*[KMB]?)\\s+${escaped}`, 'i'));
  return match?.[1] || '';
}

function extractPublicStats(description = '') {
  return {
    followers: extractNumberFromDescription(description, 'Followers'),
    following: extractNumberFromDescription(description, 'Following'),
    posts: extractNumberFromDescription(description, 'Posts'),
  };
}

function formatCompactNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return '';
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(number >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, '')}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(number);
}

function parseMetric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value || '').trim().replace(/,/g, '.');
  const match = text.match(/^([\d.]+)\s*([kmb])?$/i);
  if (!match) return Number(text) || 0;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return 0;
  const suffix = (match[2] || '').toLowerCase();
  if (suffix === 'b') return number * 1_000_000_000;
  if (suffix === 'm') return number * 1_000_000;
  if (suffix === 'k') return number * 1_000;
  return number;
}

function compactText(value, maxLength = 1600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}…` : text;
}

function parseXmlAttributes(value = '') {
  const attrs = {};
  String(value || '').replace(/([a-zA-Z_:.-]+)="([^"]*)"/g, (_, key, raw) => {
    attrs[key] = decodeHtml(raw);
    return '';
  });
  return attrs;
}

function normalizeTranscriptText(value = '', maxLength = 3600) {
  return compactText(
    String(value || '')
      .replace(/\s+([,.!?;:])/g, '$1')
      .replace(/\s+/g, ' '),
    maxLength
  );
}

function parseYouTubeTranscriptPayload(raw = '') {
  const source = String(raw || '').trim();
  if (!source) return { text: '', segments: [] };
  try {
    const payload = JSON.parse(source);
    const segments = (payload.events || [])
      .filter((event) => Array.isArray(event.segs))
      .map((event) => ({
        startMs: Number(event.tStartMs || 0),
        durationMs: Number(event.dDurationMs || 0),
        text: normalizeTranscriptText((event.segs || []).map((segment) => segment.utf8 || '').join(' '), 500),
      }))
      .filter((segment) => segment.text);
    return {
      text: normalizeTranscriptText(segments.map((segment) => segment.text).join(' ')),
      segments: segments.slice(0, 80),
    };
  } catch {
    const segments = [...source.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/gi)]
      .map((match) => {
        const attrs = parseXmlAttributes(match[1]);
        return {
          startMs: Math.round(Number(attrs.start || 0) * 1000),
          durationMs: Math.round(Number(attrs.dur || 0) * 1000),
          text: normalizeTranscriptText(decodeHtml(match[2]), 500),
        };
      })
      .filter((segment) => segment.text);
    return {
      text: normalizeTranscriptText(segments.map((segment) => segment.text).join(' ')),
      segments: segments.slice(0, 80),
    };
  }
}

function getPreferredYouTubeTranscriptTracks(tracks = []) {
  const rankLanguage = (lang = '') => {
    const normalized = String(lang || '').toLowerCase();
    if (normalized.startsWith('uk')) return 0;
    if (normalized.startsWith('ru')) return 1;
    if (normalized.startsWith('en')) return 2;
    return 3;
  };
  return [...tracks].sort((a, b) => (
    rankLanguage(a.lang_code) - rankLanguage(b.lang_code)
    || (a.kind === 'asr' ? 1 : 0) - (b.kind === 'asr' ? 1 : 0)
    || String(a.lang_code || '').localeCompare(String(b.lang_code || ''))
  ));
}

function extractJsonArrayAfterKey(source = '', key = '') {
  const keyIndex = source.indexOf(`"${key}"`);
  if (keyIndex < 0) return null;
  const start = source.indexOf('[', keyIndex);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '[') {
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return null;
}

async function fetchYouTubePlayerCaptionTracks(videoId) {
  try {
    const watchUrl = new URL('https://www.youtube.com/watch');
    watchUrl.searchParams.set('v', videoId);
    watchUrl.searchParams.set('hl', 'en');
    const response = await fetch(watchUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9,uk;q=0.8,ru;q=0.7',
        'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/0.1; +https://dzhero.com.ua)',
      },
      redirect: 'follow',
    });
    if (!response.ok) return [];
    const html = await response.text();
    const rawTracks = extractJsonArrayAfterKey(html, 'captionTracks');
    if (!rawTracks) return [];
    return JSON.parse(rawTracks).map((track) => ({
      lang_code: track.languageCode || '',
      lang_original: track.name?.simpleText || track.name?.runs?.map((run) => run.text).join('') || '',
      name: track.name?.simpleText || '',
      kind: track.kind || '',
      baseUrl: track.baseUrl || '',
    })).filter((track) => track.lang_code && track.baseUrl);
  } catch {
    return [];
  }
}

async function fetchTranscriptFromPlayerTrack(track) {
  if (!track?.baseUrl) return null;
  const formats = ['json3', 'srv3', ''];
  for (const fmt of formats) {
    const url = new URL(track.baseUrl);
    if (fmt) url.searchParams.set('fmt', fmt);
    const response = await fetch(url, {
      headers: {
        accept: 'application/json,text/xml,*/*',
        'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/0.1; +https://dzhero.com.ua)',
      },
    });
    if (!response.ok) continue;
    const parsed = parseYouTubeTranscriptPayload(await response.text());
    if (!parsed.text) continue;
    return {
      source: 'youtube_player_captions',
      status: 'available',
      language: track.lang_code,
      languageName: track.lang_original || '',
      trackName: track.name || '',
      isAutoGenerated: track.kind === 'asr',
      text: parsed.text,
      segments: parsed.segments,
    };
  }
  return null;
}

async function fetchYouTubeTranscript(videoId) {
  if (!videoId) return null;
  try {
    const listUrl = new URL('https://video.google.com/timedtext');
    listUrl.searchParams.set('type', 'list');
    listUrl.searchParams.set('v', videoId);
    const listResponse = await fetch(listUrl, {
      headers: {
        accept: 'application/xml,text/xml,*/*',
        'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/0.1; +https://dzhero.com.ua)',
      },
    });
    if (!listResponse.ok) return null;
    const listXml = await listResponse.text();
    const tracks = [...listXml.matchAll(/<track\b([^>]*)>/gi)]
      .map((match) => parseXmlAttributes(match[1]))
      .filter((track) => track.lang_code);
    const playerTracks = tracks.length ? [] : await fetchYouTubePlayerCaptionTracks(videoId);
    const allTracks = tracks.length ? tracks : playerTracks;
    if (!allTracks.length) return {
      source: 'youtube_captions',
      status: 'unavailable',
      reason: 'no_caption_tracks',
      text: '',
      segments: [],
    };
    for (const track of getPreferredYouTubeTranscriptTracks(playerTracks).slice(0, 4)) {
      const transcript = await fetchTranscriptFromPlayerTrack(track);
      if (transcript?.text) return transcript;
    }
    const attempts = [];
    getPreferredYouTubeTranscriptTracks(allTracks).slice(0, 4).forEach((track) => {
      ['json3', 'srv3', ''].forEach((fmt) => {
        attempts.push({ track, fmt, includeName: true, includeKind: true });
        attempts.push({ track, fmt, includeName: false, includeKind: true });
      });
    });
    for (const attempt of attempts) {
      const transcriptUrl = new URL('https://video.google.com/timedtext');
      transcriptUrl.searchParams.set('v', videoId);
      transcriptUrl.searchParams.set('lang', attempt.track.lang_code);
      if (attempt.fmt) transcriptUrl.searchParams.set('fmt', attempt.fmt);
      if (attempt.includeName && attempt.track.name) transcriptUrl.searchParams.set('name', attempt.track.name);
      if (attempt.includeKind && attempt.track.kind) transcriptUrl.searchParams.set('kind', attempt.track.kind);
      const transcriptResponse = await fetch(transcriptUrl, {
        headers: {
          accept: 'application/json,text/xml,*/*',
          'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/0.1; +https://dzhero.com.ua)',
        },
      });
      if (!transcriptResponse.ok) continue;
      const parsed = parseYouTubeTranscriptPayload(await transcriptResponse.text());
      if (!parsed.text) continue;
      return {
        source: 'youtube_timedtext',
        status: 'available',
        language: attempt.track.lang_code,
        languageName: attempt.track.lang_original || attempt.track.lang_translated || '',
        trackName: attempt.track.name || '',
        isAutoGenerated: attempt.track.kind === 'asr',
        text: parsed.text,
        segments: parsed.segments,
      };
    }
    return {
      source: 'youtube_captions',
      status: 'unavailable',
      reason: 'caption_tracks_empty',
      tracks: allTracks.slice(0, 8).map((track) => ({
        language: track.lang_code,
        name: track.name || '',
        kind: track.kind || '',
      })),
      text: '',
      segments: [],
    };
  } catch (error) {
    return { source: 'youtube_timedtext', status: 'error', error: error.message, text: '', segments: [] };
  }
}

async function fetchImageInlineData(imageUrl) {
  if (!imageUrl) return null;
  try {
    const response = await fetch(imageUrl, {
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/0.1; +https://dzhero.com.ua)',
      },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 5 * 1024 * 1024) return null;
    return {
      mimeType: contentType,
      data: buffer.toString('base64'),
    };
  } catch {
    return null;
  }
}

function parseGeminiJson(text = '') {
  const clean = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function analyzeSourceImageWithGemini(metadata, options = {}) {
  if (!GEMINI_API_KEY || !metadata?.image) return null;
  const inlineData = await fetchImageInlineData(metadata.image);
  if (!inlineData) return null;
  try {
    if (typeof options.beforeProviderAttempt === 'function') {
      await options.beforeProviderAttempt({
        provider: 'gemini',
        model: GEMINI_VISION_MODEL,
        operation: 'thumbnail_analysis',
      });
    }
    const response = await fetch(`${GEMINI_API_BASE}/models/${GEMINI_VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              text: [
                'Analyze this public short-form video thumbnail for a Ukrainian content producer.',
                'Do not invent hidden frames. Describe only visible visual facts and safe likely mechanics from the thumbnail/title/description.',
                'Return valid JSON with keys: visualSummary, visibleSubjects, movementGuess, hookMechanic, shotSignals, adaptationGuardrails.',
                `Title: ${metadata.title || ''}`,
                `Description: ${metadata.description || ''}`,
                `Source: ${metadata.source?.label || ''}`,
              ].join('\n'),
            },
            { inlineData },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.35,
          topP: 0.8,
          maxOutputTokens: 1200,
        },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { source: 'gemini_thumbnail_vision', error: payload?.error?.message || `Gemini vision HTTP ${response.status}` };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    const parsed = parseGeminiJson(text);
    if (!parsed) return null;
    return {
      source: 'gemini_thumbnail_vision',
      model: GEMINI_VISION_MODEL,
      visualSummary: compactText(parsed.visualSummary, 520),
      visibleSubjects: Array.isArray(parsed.visibleSubjects) ? parsed.visibleSubjects.slice(0, 6).map((item) => compactText(item, 140)) : [],
      movementGuess: compactText(parsed.movementGuess, 260),
      hookMechanic: compactText(parsed.hookMechanic, 320),
      shotSignals: Array.isArray(parsed.shotSignals) ? parsed.shotSignals.slice(0, 5).map((item) => compactText(item, 180)) : [],
      adaptationGuardrails: Array.isArray(parsed.adaptationGuardrails) ? parsed.adaptationGuardrails.slice(0, 5).map((item) => compactText(item, 180)) : [],
    };
  } catch (error) {
    if (error?.status === 402) throw error;
    return { source: 'gemini_thumbnail_vision', error: error.message };
  }
}

async function generateGeminiJsonText(prompt, options = {}) {
  if (!GEMINI_API_KEY || !prompt) return '';
  const model = options.model || GEMINI_VISION_MODEL;
  if (typeof options.beforeProviderAttempt === 'function') {
    await options.beforeProviderAttempt({ provider: 'gemini', model, operation: options.operation || 'json_generation' });
  }
  const response = await fetch(`${GEMINI_API_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: options.temperature ?? 0.25,
        topP: 0.8,
        maxOutputTokens: options.maxOutputTokens || 1600,
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
}

async function analyzeYouTubeVideoWithGemini(metadata, options = {}) {
  const videoUrl = metadata?.url || metadata?.youtube?.url || '';
  if (!GEMINI_API_KEY || !metadata?.youtube?.videoId || !videoUrl) return null;
  const model = process.env.GEMINI_VIDEO_MODEL || GEMINI_VISION_MODEL;
  const prompt = [
    'Analyze this public YouTube Shorts video for Dzhero, an AI producer for Ukrainian businesses.',
    'Use the actual video frames, audio, captions, title, and description. If the video cannot be accessed, say that clearly in JSON.',
    'Return valid JSON only with keys: videoSummary, spokenText, onScreenText, hook, twist, sceneBeats, contentMechanic, ukrainianAdaptation, shotList, ctaIdeas, guardrails.',
    'Make the Ukrainian adaptation specific to the observed mechanic. Do not default to generic business advice if the source is comedy, prank, story, movie, or entertainment.',
    'Do not suggest copying the original video, audio, faces, characters, or copyrighted creative.',
    `Title: ${metadata.title || ''}`,
    `Description: ${metadata.description || ''}`,
    `Channel: ${metadata.handle || metadata.youtube?.channelTitle || ''}`,
    `Stats: ${JSON.stringify(metadata.stats || {})}`,
  ].join('\n');
  try {
    if (typeof options.beforeProviderAttempt === 'function') {
      await options.beforeProviderAttempt({ provider: 'gemini', model, operation: 'video_analysis' });
    }
    const response = await fetch(`${GEMINI_API_BASE}/interactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model,
        input: [
          { type: 'video', uri: videoUrl },
          { type: 'text', text: prompt },
        ],
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        source: 'gemini_youtube_video',
        status: 'error',
        error: payload?.error?.message || `Gemini video HTTP ${response.status}`,
      };
    }
    const outputText = Array.isArray(payload.output)
      ? payload.output.map((item) => item.content?.map((part) => part.text || '').join('')).join('')
      : '';
    const text = [
      payload.output_text,
      outputText,
      payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join(''),
    ].filter(Boolean).join('\n').trim();
    const parsed = parseGeminiJson(text);
    if (!parsed) return { source: 'gemini_youtube_video', status: 'unavailable', reason: 'empty_or_unparseable_response' };
    return {
      source: 'gemini_youtube_video',
      status: 'available',
      model,
      videoSummary: compactText(parsed.videoSummary, 700),
      spokenText: compactText(parsed.spokenText, 1200),
      onScreenText: compactText(parsed.onScreenText, 700),
      hook: compactText(parsed.hook, 360),
      twist: compactText(parsed.twist, 360),
      contentMechanic: compactText(parsed.contentMechanic, 520),
      ukrainianAdaptation: compactText(parsed.ukrainianAdaptation, 700),
      sceneBeats: Array.isArray(parsed.sceneBeats) ? parsed.sceneBeats.slice(0, 8).map((item) => compactText(item, 220)) : [],
      shotList: Array.isArray(parsed.shotList) ? parsed.shotList.slice(0, 8).map((item) => compactText(item, 220)) : [],
      ctaIdeas: Array.isArray(parsed.ctaIdeas) ? parsed.ctaIdeas.slice(0, 5).map((item) => compactText(item, 160)) : [],
      guardrails: Array.isArray(parsed.guardrails) ? parsed.guardrails.slice(0, 6).map((item) => compactText(item, 180)) : [],
    };
  } catch (error) {
    if (error?.status === 402) throw error;
    return { source: 'gemini_youtube_video', status: 'error', error: error.message };
  }
}

function buildVideoIntelligenceReadiness({ metadata, transcript, visual, video }) {
  const hasTranscript = Boolean(transcript?.text);
  const hasVisual = Boolean(visual?.visualSummary);
  const hasVideo = Boolean(video?.videoSummary || video?.spokenText || video?.contentMechanic);
  const hasStats = Boolean(metadata?.rawStats?.views || metadata?.stats?.views);
  const score = [
    metadata?.sourceStatus === 'youtube_api' ? 24 : 12,
    hasStats ? 12 : 0,
    hasVideo ? 38 : 0,
    hasTranscript ? 16 : 0,
    hasVisual ? 10 : 0,
  ].reduce((sum, value) => sum + value, 0);
  const level = score >= 80 ? 'high' : score >= 55 ? 'medium' : 'limited';
  const gaps = [
    !hasVideo && 'full video understanding unavailable',
    !hasTranscript && 'captions unavailable',
    !hasVisual && 'thumbnail vision unavailable',
    !hasStats && 'public stats limited',
  ].filter(Boolean);
  return {
    score,
    level,
    adaptationReady: score >= 55,
    gaps,
    summary: [
      metadata?.sourceStatus === 'youtube_api' ? 'official YouTube metadata' : 'limited public metadata',
      hasStats ? 'stats' : '',
      hasVideo ? 'Gemini video understanding' : '',
      hasTranscript ? `transcript ${transcript.language || ''}`.trim() : '',
      hasVisual ? 'thumbnail vision' : '',
    ].filter(Boolean).join(' + '),
  };
}

async function enrichVideoIntelligence(metadata, options = {}) {
  const transcript = metadata.youtube?.videoId ? await fetchYouTubeTranscript(metadata.youtube.videoId) : null;
  const [video, visual] = await Promise.all([
    analyzeYouTubeVideoWithGemini(metadata, options),
    analyzeSourceImageWithGemini(metadata, options),
  ]);
  const readiness = buildVideoIntelligenceReadiness({ metadata, transcript, visual, video });
  const intelligence = {
    sourceStatus: metadata.sourceStatus,
    sourceLabel: metadata.source?.label || '',
    confidence: {
      metadata: metadata.sourceStatus === 'youtube_api' ? 'official' : metadata.sourceStatus === 'public_metadata' ? 'public_page' : 'limited',
      transcript: transcript?.text ? 'available' : 'missing',
      visual: visual?.visualSummary ? 'thumbnail_vision' : 'missing',
      video: video?.status === 'available' ? 'gemini_video_understanding' : 'missing',
      frames: video?.status === 'available' ? 'gemini_video_understanding' : 'not_sampled_yet',
    },
    readiness,
    transcript,
    video,
    visual,
    facts: {
      title: metadata.title || '',
      description: metadata.description || '',
      handle: metadata.handle || '',
      stats: metadata.stats || {},
      rawStats: metadata.rawStats || {},
      duration: metadata.youtube?.duration || '',
      publishedAt: metadata.publishedAt || '',
    },
  };
  const analysisParts = [
    metadata.analysisText,
    video?.videoSummary && `Gemini video summary: ${video.videoSummary}`,
    video?.spokenText && `Gemini spoken/audio text: ${video.spokenText}`,
    video?.onScreenText && `On-screen text: ${video.onScreenText}`,
    video?.contentMechanic && `Video mechanic: ${video.contentMechanic}`,
    video?.ukrainianAdaptation && `Ukrainian adaptation: ${video.ukrainianAdaptation}`,
    video?.sceneBeats?.length && `Scene beats: ${video.sceneBeats.join('; ')}`,
    transcript?.text && `Transcript/captions: ${transcript.text}`,
    visual?.visualSummary && `Visible thumbnail: ${visual.visualSummary}`,
    visual?.hookMechanic && `Visual hook mechanic: ${visual.hookMechanic}`,
    visual?.movementGuess && `Likely movement: ${visual.movementGuess}`,
    visual?.adaptationGuardrails?.length && `Guardrails: ${visual.adaptationGuardrails.join('; ')}`,
  ].filter(Boolean);
  return {
    ...metadata,
    transcriptText: transcript?.text || '',
    videoIntelligence: intelligence,
    analysisText: compactText(analysisParts.join(' '), 4200),
  };
}

function parseYouTubeInput(rawInput) {
  const raw = String(rawInput || '').trim();
  const withProtocol = raw.startsWith('www.') ? `https://${raw}` : raw;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be' && parts[0]) return { type: 'video', videoId: parts[0], url: url.toString() };
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) return null;
    if (url.searchParams.get('v')) return { type: 'video', videoId: url.searchParams.get('v'), url: url.toString() };
    if (['shorts', 'embed', 'live'].includes(parts[0]) && parts[1]) return { type: 'video', videoId: parts[1], url: url.toString() };
    if (parts[0] === 'channel' && parts[1]) return { type: 'channel', channelId: parts[1], url: url.toString() };
    if (parts[0]?.startsWith('@')) return { type: 'handle', handle: parts[0].slice(1), url: url.toString() };
    if (['c', 'user'].includes(parts[0]) && parts[1]) return { type: 'query', query: parts[1], url: url.toString() };
    if (parts[0]) return { type: 'query', query: parts[0], url: url.toString() };
  } catch {
    const handle = raw.match(/^@([a-z0-9._-]+)$/i)?.[1];
    if (handle) return { type: 'handle', handle, url: `https://www.youtube.com/@${handle}` };
  }
  return null;
}

async function fetchYouTubeApi(resource, params) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  Object.entries({ ...params, key: YOUTUBE_API_KEY }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/0.1; +https://dzhero.com.ua)',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `YouTube API HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

async function fetchYouTubeVideosByIds(videoIds = []) {
  const ids = [...new Set(videoIds.map((value) => String(value || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  const data = await fetchYouTubeApi('videos', {
    part: 'snippet,statistics,contentDetails',
    id: ids.slice(0, 50).join(','),
    maxResults: String(Math.min(ids.length, 50)),
  });
  return data.items || [];
}

function selectYouTubeThumbnail(...thumbnailSets) {
  const preferredSizes = ['maxres', 'standard', 'high', 'medium', 'default'];
  for (const thumbnails of thumbnailSets) {
    if (!thumbnails) continue;
    for (const size of preferredSizes) {
      const url = thumbnails[size]?.url;
      if (url) return url;
    }
  }
  return '';
}

function mapYouTubeVideoMetadata(video, channel = null, rawInput = '') {
  const snippet = video?.snippet || {};
  const stats = video?.statistics || {};
  const channelSnippet = channel?.snippet || {};
  const channelStats = channel?.statistics || {};
  const thumbnailUrl = selectYouTubeThumbnail(snippet.thumbnails, channelSnippet.thumbnails);
  const title = snippet.title || '';
  const description = snippet.description || '';
  const channelTitle = snippet.channelTitle || channelSnippet.title || 'YouTube channel';
  const customUrl = channelSnippet.customUrl || '';
  const handle = customUrl?.startsWith('@') ? customUrl : channelTitle;
  const publishedAt = snippet.publishedAt || '';
  const analysisText = [
    title,
    description,
    channelTitle,
    stats.viewCount && `${formatCompactNumber(stats.viewCount)} views`,
    stats.likeCount && `${formatCompactNumber(stats.likeCount)} likes`,
    channelStats.subscriberCount && `${formatCompactNumber(channelStats.subscriberCount)} subscribers`,
  ].filter(Boolean).join(' ');
  return {
    source: { label: 'YouTube Shorts', tone: 'shorts' },
    input: String(rawInput || '').trim(),
    url: video?.id ? `https://www.youtube.com/watch?v=${video.id}` : String(rawInput || '').trim(),
    title,
    description,
    handle,
    image: thumbnailUrl,
    publishedAt,
    stats: {
      views: formatCompactNumber(stats.viewCount),
      likes: formatCompactNumber(stats.likeCount),
      comments: formatCompactNumber(stats.commentCount),
      subscribers: formatCompactNumber(channelStats.subscriberCount),
      videos: formatCompactNumber(channelStats.videoCount),
    },
    rawStats: {
      views: stats.viewCount || '',
      likes: stats.likeCount || '',
      comments: stats.commentCount || '',
      subscribers: channelStats.subscriberCount || '',
      videos: channelStats.videoCount || '',
    },
    youtube: {
      videoId: video?.id || '',
      channelId: snippet.channelId || channel?.id || '',
      channelTitle,
      duration: video?.contentDetails?.duration || '',
      categoryId: snippet.categoryId || '',
      tags: Array.isArray(snippet.tags) ? snippet.tags.slice(0, 12) : [],
      thumbnailUrl,
    },
    sourceStatus: 'youtube_api',
    analysisText,
  };
}

function mapYouTubeChannelMetadata(channel, rawInput = '') {
  const snippet = channel?.snippet || {};
  const stats = channel?.statistics || {};
  const thumbnailUrl = selectYouTubeThumbnail(snippet.thumbnails);
  const title = snippet.title || 'YouTube channel';
  const description = snippet.description || '';
  const customUrl = snippet.customUrl || '';
  const handle = customUrl?.startsWith('@') ? customUrl : title;
  return {
    source: { label: 'YouTube Channel', tone: 'shorts' },
    input: String(rawInput || '').trim(),
    url: channel?.id ? `https://www.youtube.com/channel/${channel.id}` : String(rawInput || '').trim(),
    title,
    description,
    handle,
    image: thumbnailUrl,
    publishedAt: snippet.publishedAt || '',
    stats: {
      subscribers: formatCompactNumber(stats.subscriberCount),
      views: formatCompactNumber(stats.viewCount),
      videos: formatCompactNumber(stats.videoCount),
    },
    rawStats: {
      subscribers: stats.subscriberCount || '',
      views: stats.viewCount || '',
      videos: stats.videoCount || '',
    },
    youtube: {
      channelId: channel?.id || '',
      channelTitle: title,
      customUrl,
      country: snippet.country || '',
      thumbnailUrl,
    },
    sourceStatus: 'youtube_api',
    analysisText: [title, description, `${formatCompactNumber(stats.subscriberCount)} subscribers`, `${formatCompactNumber(stats.videoCount)} videos`].filter(Boolean).join(' '),
  };
}

async function fetchYouTubeOEmbedMetadata(rawInput) {
  const parsed = parseYouTubeInput(rawInput);
  if (!parsed || parsed.type !== 'video') return null;
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', parsed.url);
  endpoint.searchParams.set('format', 'json');
  const response = await fetch(endpoint, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/0.1; +https://dzhero.com.ua)',
    },
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data?.title) return null;
  const authorName = data.author_name || 'YouTube channel';
  const thumbnailUrl = data.thumbnail_url || '';
  return {
    source: { label: 'YouTube Shorts', tone: 'shorts' },
    input: String(rawInput || '').trim(),
    url: parsed.url,
    title: data.title,
    description: '',
    handle: data.author_url || authorName,
    image: thumbnailUrl,
    publishedAt: '',
    stats: {},
    youtube: {
      videoId: parsed.videoId || '',
      channelTitle: authorName,
      authorUrl: data.author_url || '',
      provider: data.provider_name || 'YouTube',
      thumbnailUrl,
    },
    sourceStatus: 'youtube_oembed',
    analysisText: [data.title, authorName, parsed.url].filter(Boolean).join(' '),
  };
}

async function fetchYouTubeMetadata(rawInput) {
  if (!YOUTUBE_API_KEY) return null;
  const parsed = parseYouTubeInput(rawInput);
  if (!parsed) return null;

  if (parsed.type === 'video') {
    const videoData = await fetchYouTubeApi('videos', {
      part: 'snippet,statistics,contentDetails',
      id: parsed.videoId,
      maxResults: '1',
    });
    const video = videoData.items?.[0];
    if (!video) return null;
    let channel = null;
    if (video.snippet?.channelId) {
      const channelData = await fetchYouTubeApi('channels', {
        part: 'snippet,statistics',
        id: video.snippet.channelId,
        maxResults: '1',
      });
      channel = channelData.items?.[0] || null;
    }
    return mapYouTubeVideoMetadata(video, channel, rawInput);
  }

  if (parsed.type === 'channel') {
    const channelData = await fetchYouTubeApi('channels', {
      part: 'snippet,statistics',
      id: parsed.channelId,
      maxResults: '1',
    });
    const channel = channelData.items?.[0];
    return channel ? mapYouTubeChannelMetadata(channel, rawInput) : null;
  }

  const query = parsed.type === 'handle' ? `@${parsed.handle}` : parsed.query;
  const searchData = await fetchYouTubeApi('search', {
    part: 'snippet',
    q: query,
    type: 'channel',
    maxResults: '1',
  });
  const channelId = searchData.items?.[0]?.snippet?.channelId;
  if (!channelId) return null;
  const channelData = await fetchYouTubeApi('channels', {
    part: 'snippet,statistics',
    id: channelId,
    maxResults: '1',
  });
  const channel = channelData.items?.[0];
  return channel ? mapYouTubeChannelMetadata(channel, rawInput) : null;
}

function normalizeYouTubeRegionCode(value) {
  const region = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(region) ? region : 'UA';
}

function normalizeYouTubeCategoryId(value) {
  const categoryId = String(value || '').trim();
  return /^\d{1,3}$/.test(categoryId) ? categoryId : '';
}

async function fetchYouTubePopularMetadata(options = {}) {
  if (!YOUTUBE_API_KEY) {
    const error = new Error('youtube_api_key_missing');
    error.status = 503;
    throw error;
  }
  const regionCode = normalizeYouTubeRegionCode(options.regionCode);
  const categoryId = normalizeYouTubeCategoryId(options.categoryId);
  const maxResults = Math.min(Math.max(Number(options.maxResults || 12), 1), 24);
  const searchedVideoIds = [];
  for (const query of getYouTubeShortsSearchQueries(categoryId)) {
    if (searchedVideoIds.length >= maxResults) break;
    const searchData = await fetchYouTubeApi('search', {
      part: 'snippet',
      type: 'video',
      q: query,
      regionCode,
      videoDuration: 'short',
      order: 'viewCount',
      maxResults: String(Math.min(maxResults - searchedVideoIds.length, 12)),
    });
    for (const item of searchData.items || []) {
      const videoId = item.id?.videoId;
      if (videoId && !searchedVideoIds.includes(videoId)) searchedVideoIds.push(videoId);
      if (searchedVideoIds.length >= maxResults) break;
    }
  }
  const popularParams = {
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    regionCode,
    videoCategoryId: categoryId,
    maxResults: String(Math.max(maxResults - searchedVideoIds.length, 1)),
  };
  let videos = await fetchYouTubeVideosByIds(searchedVideoIds);
  if (videos.length < maxResults) {
    let popularData;
    try {
      popularData = await fetchYouTubeApi('videos', popularParams);
    } catch (error) {
      if (!shouldRetryPopularWithoutCategory(error, categoryId)) throw error;
      popularData = await fetchYouTubeApi('videos', {
        ...popularParams,
        videoCategoryId: '',
      });
    }
    const existingIds = new Set(videos.map((video) => video.id).filter(Boolean));
    for (const video of popularData.items || []) {
      if (!video?.id || existingIds.has(video.id)) continue;
      videos.push(video);
      existingIds.add(video.id);
      if (videos.length >= maxResults) break;
    }
  }
  const channelIds = [...new Set(videos.map((video) => video.snippet?.channelId).filter(Boolean))];
  const channels = new Map();
  if (channelIds.length) {
    const channelData = await fetchYouTubeApi('channels', {
      part: 'snippet,statistics',
      id: channelIds.join(','),
      maxResults: String(channelIds.length),
    });
    (channelData.items || []).forEach((channel) => channels.set(channel.id, channel));
  }
  return videos.map((video) => mapYouTubeVideoMetadata(
    video,
    channels.get(video.snippet?.channelId) || null,
    `https://www.youtube.com/watch?v=${video.id}`,
  ));
}

async function fetchPublicSourceMetadata(rawInput, options = {}) {
  const source = detectPublicSource(rawInput);
  const fallback = {
    source,
    input: String(rawInput || '').trim(),
    url: '',
    title: '',
    description: '',
    handle: source.label,
    stats: {},
    sourceStatus: source.tone === 'text' ? 'manual_text' : 'url_only',
    analysisText: String(rawInput || '').trim(),
  };
  if (source.tone === 'text') return fallback;

  const url = normalizePublicSourceUrl(rawInput, source.tone);
  if (!url) return { ...fallback, sourceStatus: 'invalid_public_url' };

  if (source.tone === 'instagram') {
    try {
      const instagramMetadata = await fetchInstagramWebProfileMetadata(url, fallback);
      if (instagramMetadata) return await enrichVideoIntelligence(instagramMetadata, options);
    } catch (error) {
      if (error?.status === 402) throw error;
      fallback.instagramWebProfileError = error.message;
    }
  }

  if (source.tone === 'shorts') {
    try {
      const youtubeMetadata = await fetchYouTubeMetadata(rawInput);
      if (youtubeMetadata) return await enrichVideoIntelligence(youtubeMetadata, options);
    } catch (error) {
      if (error?.status === 402) throw error;
      fallback.youtubeError = error.message;
    }
    try {
      const oEmbedMetadata = await fetchYouTubeOEmbedMetadata(rawInput);
      if (oEmbedMetadata) return await enrichVideoIntelligence({
        ...oEmbedMetadata,
        youtubeError: fallback.youtubeError,
      }, options);
    } catch (error) {
      if (error?.status === 402) throw error;
      fallback.youtubeOEmbedError = error.message;
    }
  }

  try {
    const response = await safeFetchPublicText(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/1.0; +https://dzhero.com.ua)',
      },
    });
    if (!response.ok) {
      return { ...fallback, url, sourceStatus: `metadata_unavailable_${response.status}` };
    }

    const html = response.text;
    const rawTitle = extractMetaContent(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
    const rawDescription = extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description') || '';
    let title = decodeHtml(rawTitle)
      .replace(/\s*•\s*Instagram.*$/i, '')
      .replace(/\s*on Instagram.*$/i, '')
      .replace(/\s*-\s*TikTok.*$/i, '')
      .trim();
    let description = decodeHtml(rawDescription).trim();
    if (source.tone === 'instagram') {
      if (isGenericInstagramMeta(title)) title = '';
      if (isGenericInstagramMeta(description)) description = '';
    }
    const stats = extractPublicStats(description);
    const handle = getPublicHandleFromMeta(source, url, rawTitle, rawDescription);
    const image = extractMetaContent(html, 'og:image');
    const analysisText = [title, description, handle, rawInput].filter(Boolean).join(' ');

    return await enrichVideoIntelligence({
      ...fallback,
      url,
      title,
      description,
      handle,
      image,
      stats,
      sourceStatus: title || description ? 'public_metadata' : 'url_only',
      analysisText,
    }, options);
  } catch (error) {
    if (error?.status === 402) throw error;
    return { ...fallback, url, sourceStatus: 'metadata_fetch_failed', fetchError: error.message };
  }
}

async function enrichVideoIntelligenceSafe(metadata, options = {}) {
  try {
    return await enrichVideoIntelligence(metadata, options);
  } catch (error) {
    if (error?.status === 402) throw error;
    return {
      ...metadata,
      videoIntelligence: {
        sourceStatus: metadata.sourceStatus,
        sourceLabel: metadata.source?.label || '',
        confidence: {
          metadata: metadata.sourceStatus === 'youtube_api' ? 'official' : 'limited',
          transcript: 'missing',
          visual: 'missing',
          video: 'missing',
          frames: 'not_sampled_yet',
        },
        readiness: {
          score: metadata.sourceStatus === 'youtube_api' ? 24 : 12,
          level: 'limited',
          adaptationReady: false,
          gaps: ['video intelligence failed'],
          summary: 'metadata only',
        },
        transcript: { source: 'youtube_timedtext', status: 'error', error: error.message, text: '', segments: [] },
        video: { source: 'gemini_youtube_video', status: 'error', error: error.message },
        visual: null,
        facts: {
          title: metadata.title || '',
          description: metadata.description || '',
          handle: metadata.handle || '',
          stats: metadata.stats || {},
          rawStats: metadata.rawStats || {},
          duration: metadata.youtube?.duration || '',
          publishedAt: metadata.publishedAt || '',
        },
      },
    };
  }
}

async function fetchPublicReelMetadata(reelUrl) {
  const shortcode = extractInstagramShortcode(reelUrl);
  const fallback = {
    url: reelUrl,
    shortcode,
    title: shortcode ? `Instagram Reels signal ${shortcode}` : 'Instagram Reels signal',
    description: '',
    handle: '@instagram.reel',
    sourceStatus: 'url_only',
  };

  try {
    const response = await fetch(reelUrl, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/1.0; +https://dzhero.com.ua)',
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      return { ...fallback, sourceStatus: `metadata_unavailable_${response.status}` };
    }

    const html = await response.text();
    const title = extractMetaContent(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || fallback.title;
    const description = extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description') || '';
    const image = extractMetaContent(html, 'og:image');
    const cleanTitle = decodeHtml(title)
      .replace(/\s*•\s*Instagram.*$/i, '')
      .replace(/\s*on Instagram.*$/i, '')
      .trim() || fallback.title;

    return {
      ...fallback,
      title: cleanTitle,
      description: decodeHtml(description),
      handle: getInstagramHandleFromMeta(title, description),
      image,
      sourceStatus: description || cleanTitle !== fallback.title ? 'public_metadata' : 'url_only',
    };
  } catch (error) {
    return { ...fallback, sourceStatus: 'metadata_fetch_failed', fetchError: error.message };
  }
}

function buildGlobalInsightFromReelMetadata(metadata) {
  const sourceLabel = metadata.source?.label || (metadata.sourceStatus === 'youtube_api' ? 'YouTube Shorts' : 'Instagram Reels');
  const intelligence = metadata.videoIntelligence || {};
  const transcriptText = intelligence.transcript?.text || '';
  const video = intelligence.video || {};
  const visual = intelligence.visual || {};
  const readiness = intelligence.readiness || {};
  const script = [
    metadata.description || '',
    `User supplied ${sourceLabel} URL: ${metadata.url}.`,
    metadata.shortcode ? `Shortcode: ${metadata.shortcode}.` : '',
    video.videoSummary ? `Gemini video summary: ${video.videoSummary}` : '',
    video.spokenText ? `Gemini spoken/on-audio text: ${video.spokenText}` : '',
    video.onScreenText ? `Gemini on-screen text: ${video.onScreenText}` : '',
    video.contentMechanic ? `Gemini video mechanic: ${video.contentMechanic}` : '',
    video.sceneBeats?.length ? `Gemini scene beats: ${video.sceneBeats.join('; ')}` : '',
    video.ukrainianAdaptation ? `Gemini Ukrainian adaptation notes: ${video.ukrainianAdaptation}` : '',
    transcriptText ? `Transcript/captions: ${transcriptText}` : '',
    visual.visualSummary ? `Visible frame/thumbnail facts: ${visual.visualSummary}` : '',
    visual.hookMechanic ? `Observed visual hook mechanic: ${visual.hookMechanic}` : '',
    visual.shotSignals?.length ? `Shot signals: ${visual.shotSignals.join('; ')}` : '',
    visual.adaptationGuardrails?.length ? `Do not violate these visual guardrails: ${visual.adaptationGuardrails.join('; ')}` : '',
    readiness.summary ? `Source quality: ${readiness.summary}. Readiness: ${readiness.level}.` : '',
    readiness.gaps?.length ? `Known gaps: ${readiness.gaps.join('; ')}.` : '',
    `Public ${sourceLabel} metadata is limited, so infer only from available metadata, captions and visible image facts. Do not pretend full video frames were analyzed unless frame data exists.`,
  ].filter(Boolean).join(' ');

  return {
    title: metadata.title,
    hook: metadata.description || metadata.title,
    script,
    marketingMechanics: video.videoSummary
      ? 'Use Gemini video understanding as the primary source. Extract the actual hook, action, twist, proof and CTA from video summary, scene beats and spoken/on-screen text. Adapt the mechanic for a Ukrainian business without copying the original.'
      : transcriptText
        ? 'Use the transcript/captions as the primary source. Extract the spoken hook, payoff, objection and CTA. Keep the adaptation grounded in the transcript and visible thumbnail facts.'
        : metadata.description
        ? 'Deconstruct the caption/title plus transcript/thumbnail intelligence into hook, proof, objection and CTA. Adapt the mechanic for a Ukrainian business without copying the original.'
        : 'Create a pragmatic Ukrainian adaptation from the available source signal and visible thumbnail facts. Avoid pretending unavailable frames were analyzed.',
    videoIntelligence: intelligence,
  };
}

function createSession(db, userId) {
  const now = Date.now();
  const activeSessions = db.sessions
    .filter((item) => Date.parse(item.expiresAt || '') > now)
    .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
  const retainedUserTokens = new Set(activeSessions
    .filter((item) => item.userId === userId)
    .slice(0, Math.max(0, MAX_ACTIVE_SESSIONS_PER_USER - 1))
    .map((item) => item.token));
  db.sessions = activeSessions.filter((item) => item.userId !== userId || retainedUserTokens.has(item.token));
  const session = {
    token: crypto.randomBytes(32).toString('hex'),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
  };
  db.sessions.unshift(session);
  return session;
}

const SESSION_COOKIE_NAME = 'dzhero_session';

function getSessionCookieOptions() {
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
    ...(IS_PRODUCTION ? ['Secure'] : []),
  ].join('; ');
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; ${getSessionCookieOptions()}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_PRODUCTION ? '; Secure' : ''}`);
}

function getAuthToken(req) {
  return getAuthTokenCandidates(req, SESSION_COOKIE_NAME)[0] || parseCookies(req)[SESSION_COOKIE_NAME] || '';
}

function isTrustedRequestUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return allowedOrigins.has(`${url.protocol}//${url.host}`);
  } catch {
    return false;
  }
}

function verifyTrustedWriteRequest(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  if (getBearerToken(req)) {
    next();
    return;
  }
  const origin = String(req.headers.origin || '');
  const referer = String(req.headers.referer || '');
  const trusted = (origin && allowedOrigins.has(origin)) || (!origin && isTrustedRequestUrl(referer));
  if (trusted || (!origin && !referer && !IS_PRODUCTION)) {
    next();
    return;
  }
  res.status(403).json({ error: 'untrusted_origin', message: 'Write requests must originate from Dzhero.' });
}

let mutatingApiQueue = Promise.resolve();

function usesLongRunningExternalWork(req) {
  if (req.method !== 'POST') return false;
  return [
    /^\/brand-scan\/preview\/?$/,
    /^\/workspaces\/[^/]+\/reels\/import-url\/?$/,
    /^\/workspaces\/[^/]+\/agent\/chat\/?$/,
    /^\/workspaces\/[^/]+\/agent\/context\/finalize\/?$/,
    /^\/workspaces\/[^/]+\/remix\/generate\/?$/,
  ].some((pattern) => pattern.test(req.path));
}

function serializeMutatingApiRequests(req, res, next) {
  const usesWorkspaceDiscoveryLock = req.method === 'POST'
    && /^\/workspaces\/[^/]+\/signals\/discovery\/run\/?$/.test(req.path);
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || usesWorkspaceDiscoveryLock || usesLongRunningExternalWork(req)) {
    next();
    return;
  }

  let releaseQueue;
  const currentTurn = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  const previousTurn = mutatingApiQueue.catch(() => {});
  mutatingApiQueue = previousTurn.then(() => currentTurn);

  previousTurn.then(() => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseQueue();
    };
    res.once('finish', release);
    res.once('close', release);
    next();
  }).catch(next);
}

function serializeBackgroundMutation(task) {
  let releaseQueue;
  const currentTurn = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  const previousTurn = mutatingApiQueue.catch(() => {});
  mutatingApiQueue = previousTurn.then(() => currentTurn);
  return previousTurn
    .then(task)
    .finally(() => releaseQueue());
}

function getAdminToken(req) {
  return String(req.headers['x-admin-token'] || '').trim();
}

function requireAdmin(req, res) {
  if (!ADMIN_TOKEN) {
    res.status(501).json({ error: 'admin_token_not_configured' });
    return false;
  }
  if (getAdminToken(req) !== ADMIN_TOKEN) {
    res.status(403).json({ error: 'admin_forbidden' });
    return false;
  }
  return true;
}

function getAuthUser(db, req) {
  const session = findAuthSession(db, req, SESSION_COOKIE_NAME);
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

function requireAuthUser(db, req, res) {
  const user = getAuthUser(db, req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return user;
}

function requireOwnerUser(db, req, res) {
  const user = requireAuthUser(db, req, res);
  if (!user) return null;
  if (!userHasUnlimitedAccess(user)) {
    res.status(403).json({ error: 'owner_access_required' });
    return null;
  }
  return user;
}

function canAccessWorkspace(user, workspaceId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.workspaceId === workspaceId) return true;
  if (Array.isArray(user.workspaceIds) && user.workspaceIds.includes(workspaceId)) return true;
  return false;
}

function pruneOAuthStates(db) {
  db.metaStates ||= [];
  const cutoff = Date.now() - OAUTH_STATE_TTL_MS;
  db.metaStates = db.metaStates
    .filter((item) => !item.usedAt && (!item.createdAt || Date.parse(item.createdAt) >= cutoff))
    .slice(0, 80);
}

function createOAuthState(db, provider, payload = {}) {
  pruneOAuthStates(db);
  const state = crypto.randomBytes(24).toString('hex');
  db.metaStates.unshift({
    state,
    provider,
    createdAt: new Date().toISOString(),
    usedAt: null,
    ...payload,
  });
  return state;
}

function findValidOAuthState(db, state, provider) {
  pruneOAuthStates(db);
  const record = db.metaStates.find((item) => (
    item.state === state
    && item.provider === provider
    && !item.usedAt
    && Date.parse(item.createdAt || 0) + OAUTH_STATE_TTL_MS > Date.now()
  ));
  return record || null;
}

function buildMetaAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: META_REDIRECT_URI,
    response_type: 'code',
    state,
  });
  if (META_LOGIN_CONFIG_ID) {
    params.set('config_id', META_LOGIN_CONFIG_ID);
  } else if (META_SCOPE_LIST.length) {
    params.set('scope', META_SCOPES);
  }
  return {
    authUrl: `${META_AUTH_BASE_URL}?${params.toString()}`,
    state,
  };
}

function buildInstagramAuthUrl(state) {
  const params = new URLSearchParams({
    enable_fb_login: '0',
    force_authentication: '1',
    client_id: INSTAGRAM_APP_ID,
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    response_type: 'code',
    scope: INSTAGRAM_SCOPES,
    state,
  });
  return {
    authUrl: `${INSTAGRAM_AUTH_BASE_URL}?${params.toString()}`,
    state,
  };
}

function buildGoogleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    state,
    access_type: 'offline',
    prompt: 'select_account',
  });
  return {
    authUrl: `${GOOGLE_AUTH_BASE_URL}?${params.toString()}`,
    state,
  };
}

function buildTikTokAuthUrl(state) {
  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    redirect_uri: TIKTOK_REDIRECT_URI,
    response_type: 'code',
    scope: TIKTOK_SCOPES,
    state,
  });
  return {
    authUrl: `${TIKTOK_AUTH_BASE_URL}?${params.toString()}`,
    state,
  };
}

async function fetchMetaJson(url, options) {
  if (typeof fetch !== 'function') {
    throw new Error('Node.js fetch is required for Meta API calls. Use Node 18+.');
  }
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Meta API HTTP ${response.status}`;
    const error = new Error(message);
    error.meta = data;
    throw error;
  }
  return data;
}

async function fetchGoogleJson(url, options) {
  if (typeof fetch !== 'function') {
    throw new Error('Node.js fetch is required for Google OAuth. Use Node 18+.');
  }
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error_description || data?.error || `Google OAuth HTTP ${response.status}`;
    const error = new Error(message);
    error.google = data;
    throw error;
  }
  return data;
}

async function exchangeMetaCode(code) {
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    client_secret: META_APP_SECRET,
    redirect_uri: META_REDIRECT_URI,
    code,
  });
  return fetchMetaJson(`${META_GRAPH_BASE_URL}/oauth/access_token?${params.toString()}`);
}

async function exchangeInstagramCode(code) {
  const params = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID,
    client_secret: INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: INSTAGRAM_REDIRECT_URI,
    code,
  });
  return fetchMetaJson(INSTAGRAM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
}

async function exchangeGoogleCode(code) {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
    code,
  });
  return fetchGoogleJson(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
}

async function exchangeTikTokCode(code) {
  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    client_secret: TIKTOK_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: TIKTOK_REDIRECT_URI,
  });
  return fetchMetaJson(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
}

async function getInstagramProfile(accessToken) {
  const params = new URLSearchParams({
    fields: 'id,user_id,username,account_type,profile_picture_url',
    access_token: accessToken,
  });
  return fetchMetaJson(`${INSTAGRAM_GRAPH_BASE_URL}/me?${params.toString()}`);
}

async function getGoogleProfile(accessToken) {
  return fetchGoogleJson(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

function getTikTokTokenPayload(tokenResult = {}) {
  return tokenResult.data || tokenResult;
}

async function getTikTokProfile(accessToken) {
  const url = new URL(TIKTOK_USERINFO_URL);
  url.searchParams.set('fields', [
    'open_id',
    'union_id',
    'avatar_url',
    'avatar_url_100',
    'avatar_large_url',
    'display_name',
    'profile_deep_link',
    'bio_description',
    'is_verified',
    'follower_count',
    'following_count',
    'likes_count',
    'video_count',
  ].join(','));
  const result = await fetchMetaJson(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
    },
  });
  return result.data?.user || result.user || {};
}

async function getMetaPages(accessToken) {
  const params = new URLSearchParams({
    fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
    access_token: accessToken,
  });
  const result = await fetchMetaJson(`${META_GRAPH_BASE_URL}/me/accounts?${params.toString()}`);
  return result.data || [];
}

function createSyncJob(db, workspaceId, type, payload = {}) {
  const job = {
    id: createId('sync'),
    workspaceId,
    type,
    status: 'queued',
    payload,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    error: null,
  };
  db.syncJobs.unshift(job);
  return job;
}

function requireWorkspace(db, workspaceId, res) {
  const workspace = db.workspaces.find((item) => item.id === workspaceId);
  if (!workspace && String(workspaceId || '').startsWith('ws_demo_')) {
    const demoProfiles = {
      ws_demo_cafe: ['Кафе Central', 'Кафе / ресторан', 'сторіс-меню'],
      ws_demo_shop: ['Odessa Drop', 'Магазин одягу', 'лукбуки'],
      ws_demo_beauty: ['Beauty Room', 'Салон / beauty', 'до/після'],
      ws_demo_expert: ['Expert Lab', 'Експерт / консультант', 'експертні Reels'],
    };
    const [name, businessType, contentFocus] = demoProfiles[workspaceId] || ['Demo Brand', 'Бізнес', 'контент-система'];
    const createdWorkspace = {
      id: workspaceId,
      name,
      owner: 'Admin',
      mode: 'own_business',
      marketFocus: ['ua', 'us', 'eu', 'global'],
      createdAt: new Date().toISOString(),
      brief: {
        businessType,
        location: 'Ukraine',
        audience: 'Ukrainian Instagram audience',
        product: 'content, sales and launch offers',
        toneOfVoice: 'clear, useful, confident',
        goals: ['find market signals', 'adapt reels', 'generate content ideas', 'increase leads'],
        stopTopics: ['RF sources', 'direct copying', 'unsafe automation'],
        contentFocus,
      },
      checklists: {},
    };
    db.workspaces.push(createdWorkspace);
    return createdWorkspace;
  }
  if (!workspace) {
    res.status(404).json({ error: 'workspace_not_found' });
    return null;
  }
  return workspace;
}

async function requireWorkspaceAccess(req, res, next) {
  try {
    const db = await readDb();
    const user = requireAuthUser(db, req, res);
    if (!user) return;
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    if (!canAccessWorkspace(user, workspace.id)) {
      res.status(403).json({ error: 'workspace_forbidden' });
      return;
    }
    req.authUser = user;
    req.workspace = workspace;
    next();
  } catch (err) {
    next(err);
  }
}

app.use('/api/workspaces/:workspaceId', requireWorkspaceAccess);

function getAiProviderStatus() {
  return {
    instagram: {
      configured: Boolean(INSTAGRAM_APP_ID && INSTAGRAM_APP_SECRET),
      status: INSTAGRAM_APP_ID && INSTAGRAM_APP_SECRET ? 'ready' : 'configuration_required',
      requiredEnv: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_REDIRECT_URI'],
    },
    youtube: {
      configured: Boolean(YOUTUBE_API_KEY),
      status: YOUTUBE_API_KEY ? 'ready' : 'preview_only',
      requiredEnv: ['YOUTUBE_API_KEY'],
    },
    textAgent: {
      configured: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY),
      provider: process.env.OPENAI_API_KEY ? 'openai' : process.env.GEMINI_API_KEY ? 'gemini' : 'fallback',
      status: process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY ? 'ready' : 'fallback_mode',
    },
    videoGeneration: {
      configured: Boolean(process.env.VIDEO_PROVIDER_API_KEY),
      provider: process.env.VIDEO_PROVIDER || 'not_configured',
      status: process.env.VIDEO_PROVIDER_API_KEY ? 'ready' : 'queued_for_later',
    },
  };
}

const agentStudioRunsInFlight = new Set();
const agentStudioVideoBody = express.raw({
  type: () => true,
  limit: '100mb',
});

function getAgentStudioUploadName(req) {
  const encoded = String(req.get('x-file-name') || '').trim();
  if (!encoded) return 'uploaded-video';
  try {
    return decodeURIComponent(encoded).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'uploaded-video';
  } catch {
    return encoded.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) || 'uploaded-video';
  }
}

async function uploadAgentStudioVideo(req) {
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);
  if (!bytes.length) {
    const error = new Error('agent_studio_video_file_required');
    error.status = 400;
    throw error;
  }
  const rawMimeType = String(req.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const allowedMimeTypes = new Set([
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-m4v',
    'video/3gpp',
    'application/octet-stream',
  ]);
  if (!allowedMimeTypes.has(rawMimeType)) {
    const error = new Error('agent_studio_video_type_unsupported');
    error.status = 415;
    throw error;
  }
  const originalName = getAgentStudioUploadName(req);
  const inferredMimeType = rawMimeType === 'application/octet-stream'
    ? originalName.toLowerCase().endsWith('.mov') ? 'video/quicktime'
      : originalName.toLowerCase().endsWith('.webm') ? 'video/webm'
        : 'video/mp4'
    : rawMimeType;
  const uploadVideo = agentStudioTestProvider?.uploadVideo || uploadGeminiVideoBytes;
  const uploaded = await uploadVideo({
    bytes,
    mimeType: inferredMimeType,
    displayName: originalName,
    apiKey: GEMINI_API_KEY,
  });
  return {
    name: uploaded.name,
    uri: uploaded.uri,
    mimeType: uploaded.mimeType || inferredMimeType,
    originalName,
    size: bytes.length,
  };
}

function getAgentStudioConfig() {
  const missing = [
    !process.env.OPENAI_API_KEY && 'OPENAI_API_KEY',
    !GEMINI_API_KEY && 'GEMINI_API_KEY',
  ].filter(Boolean);
  return {
    enabled: ENABLE_AGENT_STUDIO,
    configured: ENABLE_AGENT_STUDIO && missing.length === 0,
    model: OPENAI_AGENT_MODEL,
    manager: 'Jeryk Manager',
    provider: 'openai-agents-sdk',
    videoProvider: 'gemini',
    missing,
  };
}

function requireAgentStudioEnabled(res) {
  const config = getAgentStudioConfig();
  if (!config.enabled) {
    res.status(404).json({ error: 'agent_studio_disabled', message: 'Agent Studio Beta is not enabled.' });
    return false;
  }
  if (!config.configured && !agentStudioTestProvider) {
    res.status(503).json({
      error: 'agent_studio_not_configured',
      message: 'Agent Studio providers are not configured.',
      missing: config.missing,
    });
    return false;
  }
  return true;
}

function findAgentStudioRun(db, workspaceId, runId) {
  return (db.agentStudioRuns || []).find((run) => (
    run.id === runId && run.workspaceId === workspaceId
  )) || null;
}

function getAgentStudioRunLanguage(run = {}) {
  return run.input?.outputLanguage === 'en' ? 'en' : 'uk';
}

function isAgentStudioDemoWorkspace(workspaceId) {
  return String(workspaceId || '') === 'ws_demo_agent_studio_coffee';
}

function buildAgentStudioCoffeeDemoRun({ workspaceId, userId, language = 'en', now = new Date().toISOString() }) {
  const isEnglish = language === 'en';
  const fixture = agentStudioCoffeeFixture;
  return {
    id: `agent_run_demo_coffee_${isEnglish ? 'en' : 'uk'}`,
    workspaceId: String(workspaceId),
    userId: String(userId),
    input: {
      mode: 'adapt_reel',
      objective: isEnglish
        ? 'Bring more weekday morning visits to a neighborhood coffee shop with a low-budget Reel anyone can shoot.'
        : 'Bring more weekday morning visits to a neighborhood coffee shop with a low-budget Reel anyone can shoot.',
      outputLanguage: isEnglish ? 'en' : 'uk',
      signalId: fixture.selectedTrend.signalId,
      sourceUrl: fixture.selectedTrend.sourceUrl,
      idempotencyKey: `demo_coffee_${isEnglish ? 'en' : 'uk'}`,
    },
    status: 'completed',
    currentStage: 'completed',
    artifacts: {
      selectedTrend: fixture.selectedTrend,
      evidence: fixture.evidence,
      brandStrategy: fixture.brandStrategy,
      creative: fixture.creative,
      evaluation: fixture.acceptEvaluation,
      contentPlan: fixture.contentPlan,
      managerReview: fixture.managerReview,
    },
    trace: [
      ['Jeryk Manager', 'queued', 'started', 'Jeryk queued the Agent Studio run.'],
      ['Trend Analyst', 'selecting_signal', 'completed', 'Matched a low-budget reveal mechanic to morning visits.'],
      ['Video evidence', 'analyzing_video', 'completed', 'Grounded the quiet setup, interruption, and product reveal.'],
      ['Brand Strategist', 'adapting_brand', 'completed', 'Turned the mechanic into a Kyiv morning-reset position.'],
      ['Creative Producer', 'producing', 'completed', 'Built one complete Reel and two distinct alternatives.'],
      ['Critic', 'evaluating', 'completed', 'Removed the unsupported best-in-Kyiv claim.'],
      ['Content Planner', 'planning', 'completed', 'Expanded the strategy into seven non-repetitive days.'],
      ['Jeryk Manager', 'awaiting_approval', 'completed', fixture.managerReview.headline],
    ].map(([agent, stage, status, summary], index) => ({
      id: `trace_demo_coffee_${isEnglish ? 'en' : 'uk'}_${index + 1}`,
      agent,
      stage,
      status,
      summary,
      createdAt: now,
    })),
    contextRequest: null,
    contextHistory: [],
    outputRepairCount: 0,
    criticRevisionCount: 0,
    approval: {
      candidateId: fixture.creative.heroReel.id,
      approvedAt: now,
      addedToContentPlan: true,
    },
    error: null,
    usage: createAgentStudioUsageCollector().snapshot(),
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  };
}

async function ensureAgentStudioDemoRun(db, workspaceId, userId, language) {
  if (!isAgentStudioDemoWorkspace(workspaceId) || language !== 'en') return null;
  const runId = 'agent_run_demo_coffee_en';
  const existing = (db.agentStudioRuns || []).find((run) => (
    run.id === runId && run.workspaceId === workspaceId
  ));
  if (existing) return existing;
  const run = buildAgentStudioCoffeeDemoRun({ workspaceId, userId, language });
  db.agentStudioRuns = [run, ...(db.agentStudioRuns || [])];
  await writeDb(db);
  return run;
}

function isAgentStudioProductionReadyCandidate(candidate) {
  return Array.isArray(candidate?.scenes)
    && candidate.scenes.length >= 2
    && Array.isArray(candidate?.productionNotes)
    && candidate.productionNotes.length > 0;
}

function buildAgentStudioHeroBody(candidate, day) {
  const scenes = candidate.scenes.map((scene, index) => {
    const direction = [
      scene.action,
      scene.onScreenText,
      scene.voiceover,
    ].filter(Boolean).join(' | ');
    return `${index + 1}. ${scene.timeframe}: ${direction}`;
  }).join('\n');
  const productionNotes = candidate.productionNotes
    .map((note) => `- ${note}`)
    .join('\n');
  return [
    `🎬 ${candidate.concept}`,
    `🪝 ${candidate.hook}`,
    scenes,
    productionNotes,
    `🎯 ${day.objective}`,
    `📣 ${day.hook}`,
    `CTA: ${day.cta}`,
  ].filter(Boolean).join('\n\n');
}

function buildAgentStudioPlanDayBody(day) {
  return [
    `🎯 ${day.objective}`,
    `🪝 ${day.hook}`,
    `CTA: ${day.cta}`,
  ].join('\n\n');
}

function buildAgentStudioContentPlanPosts(run, candidateId) {
  const finalPackage = run.artifacts || {};
  const hero = finalPackage.creative?.heroReel;
  const alternatives = finalPackage.creative?.alternatives || [];
  const candidate = hero?.id === candidateId
    ? hero
    : alternatives.find((item) => item.id === candidateId);
  if (!candidate) throw new Error('agent_studio_candidate_not_found');
  if (!isAgentStudioProductionReadyCandidate(candidate)) {
    throw new Error('agent_studio_candidate_not_production_ready');
  }
  const days = finalPackage.contentPlan?.days || [];
  if (days.length !== 7) throw new Error('agent_studio_content_plan_missing');
  const sourceKey = `agent-studio:${run.id}`;
  const today = new Date();
  return normalizeContentPlanPosts(days.map((day, index) => {
    const scheduledDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index);
    const date = [
      scheduledDate.getFullYear(),
      String(scheduledDate.getMonth() + 1).padStart(2, '0'),
      String(scheduledDate.getDate()).padStart(2, '0'),
    ].join('-');
    return {
      id: `agent-studio-${run.id}-${day.day}`,
      day: scheduledDate.getDate(),
      date,
      title: day.title,
      body: index === 0
        ? buildAgentStudioHeroBody(candidate, day)
        : buildAgentStudioPlanDayBody(day),
      format: day.format,
      time: index % 2 === 0 ? '10:00' : '18:30',
      done: false,
      source: 'agent_studio',
      sourceKey,
      sourceTitle: candidate.title,
      sourceUrl: finalPackage.selectedTrend?.sourceUrl || '',
      sourceReelId: finalPackage.selectedTrend?.signalId || '',
      sourceHandle: 'Jeryk + agent team',
      dayLabel: `Day ${day.day}`,
    };
  }));
}

async function persistAgentStudioEvent(runId, event) {
  return serializeBackgroundMutation(async () => {
    const db = await readDb();
    const index = (db.agentStudioRuns || []).findIndex((run) => run.id === runId);
    if (index < 0) return null;
    const run = db.agentStudioRuns[index];
    if (TERMINAL_AGENT_STUDIO_STATUSES.has(run.status)) return run;
    const now = new Date().toISOString();
    let nextRun;
    if (event.status === 'revised' && event.agentId === 'critic' && run.status === 'evaluating') {
      nextRun = requestAgentStudioCriticRevision(run, {
        instructions: [event.summary || 'Revise the creative using the critic feedback.'],
        now,
      });
    } else if (event.status === 'started' && event.stage !== run.status && event.stage !== 'awaiting_approval') {
      nextRun = transitionAgentStudioRun(run, event.stage, {
        agent: event.agent,
        summary: event.summary,
        now,
      });
    } else {
      nextRun = appendAgentStudioTrace(run, {
        agent: event.agent,
        stage: event.stage || run.currentStage,
        status: event.status || 'completed',
        summary: event.summary,
        now,
      });
    }
    db.agentStudioRuns[index] = nextRun;
    await writeDb(db);
    return nextRun;
  });
}

async function finalizeAgentStudioResult(runId, result, usage = null) {
  return serializeBackgroundMutation(async () => {
    const db = await readDb();
    const index = (db.agentStudioRuns || []).findIndex((run) => run.id === runId);
    if (index < 0) return null;
    const run = db.agentStudioRuns[index];
    if (TERMINAL_AGENT_STUDIO_STATUSES.has(run.status)) return run;
    let nextRun = run;
    if (result.type === 'needs_context') {
      nextRun = requestAgentStudioContext(run, {
        question: result.contextRequest.question,
        reason: result.contextRequest.reason,
        now: new Date().toISOString(),
      });
      nextRun = {
        ...nextRun,
        sourceUpload: null,
        usage: usage || nextRun.usage,
        artifacts: {
          ...(nextRun.artifacts || {}),
          selectedTrend: result.selectedTrend,
          evidence: result.evidence,
        },
      };
    } else {
      const now = new Date().toISOString();
      nextRun = run.status === 'planning'
        ? transitionAgentStudioRun(run, 'awaiting_approval', {
          agent: 'Jeryk Manager',
          traceStatus: 'completed',
          summary: result.finalPackage?.managerReview?.headline || 'Final package is ready for human approval.',
          now,
          appendTrace: false,
        })
        : run;
      nextRun = {
        ...nextRun,
        sourceUpload: null,
        usage: usage || nextRun.usage,
        artifacts: result.finalPackage,
        hybridRequest: null,
        error: null,
        updatedAt: now,
      };
    }
    db.agentStudioRuns[index] = nextRun;
    await writeDb(db);
    return nextRun;
  });
}

async function failAgentStudioRun(runId, cause, usage = null) {
  return serializeBackgroundMutation(async () => {
    const db = await readDb();
    const index = (db.agentStudioRuns || []).findIndex((run) => run.id === runId);
    if (index < 0) return null;
    const run = db.agentStudioRuns[index];
    if (TERMINAL_AGENT_STUDIO_STATUSES.has(run.status)) return run;
    const error = classifyAgentStudioError(cause);
    const failed = transitionAgentStudioRun(run, 'failed', {
      agent: 'Jeryk Manager',
      traceStatus: 'failed',
      summary: error.message,
      error,
      now: new Date().toISOString(),
    });
    db.agentStudioRuns[index] = { ...failed, sourceUpload: null, usage: usage || run.usage };
    await writeDb(db);
    return failed;
  });
}

async function executeAgentStudioRun(runId) {
  if (agentStudioRunsInFlight.has(runId)) return;
  agentStudioRunsInFlight.add(runId);
  let eventQueue = Promise.resolve();
  let usageCollector = null;
  try {
    const db = await readDb();
    const run = (db.agentStudioRuns || []).find((item) => item.id === runId);
    if (!run || TERMINAL_AGENT_STUDIO_STATUSES.has(run.status) || run.status === 'needs_context') return;
    const phase = Array.isArray(run.usage?.calls) && run.usage.calls.length > 0 ? 'resume' : 'initial';
    const invocationId = `${run.id}:${phase}:${crypto.randomUUID()}`;
    usageCollector = createAgentStudioUsageCollector({ initialUsage: run.usage });
    const workspace = db.workspaces.find((item) => item.id === run.workspaceId);
    if (!workspace) throw new Error('workspace_not_found');
    const signals = (db.reels || []).filter((item) => item.workspaceId === run.workspaceId);
    const runAgent = agentStudioTestProvider?.runAgent || createOpenAIAgentRunner({
      model: OPENAI_AGENT_MODEL,
      phase,
      invocationId,
      onUsage: (entry) => usageCollector.recordOpenAI(entry),
    });
    const providerAnalyzeVideo = agentStudioTestProvider?.analyzeVideo || analyzeAgentStudioVideo;
    const analyzeVideo = (args) => providerAnalyzeVideo({
      ...args,
      uploadedFile: run.sourceUpload || null,
      phase,
      invocationId,
      onUsage: (entry) => usageCollector.recordGemini(entry),
      resolveSource: ({ sourceUrl }) => resolveAgentStudioVideoSource({
        token: APIFY_TOKEN,
        sourceUrl,
        workspaceId: run.workspaceId,
        market: workspace.market || 'global',
        phase,
        invocationId,
        onUsage: (entry) => usageCollector.recordApify(entry),
      }),
    });
    const result = await orchestrateAgentStudio({
      runId,
      input: run.input,
      workspace,
      signals,
      selectedTrend: run.artifacts?.selectedTrend || null,
      runAgent,
      analyzeVideo,
      emit(event) {
        eventQueue = eventQueue.then(() => persistAgentStudioEvent(runId, event));
      },
    });
    await eventQueue;
    await finalizeAgentStudioResult(runId, result, usageCollector.snapshot());
  } catch (error) {
    try {
      await eventQueue;
    } catch {
      // The classified failure below is the authoritative terminal state.
    }
    await failAgentStudioRun(runId, error, usageCollector?.snapshot() || null);
  } finally {
    agentStudioRunsInFlight.delete(runId);
  }
}

async function executeAgentStudioHybrid(runId) {
  if (agentStudioRunsInFlight.has(runId)) return;
  agentStudioRunsInFlight.add(runId);
  let eventQueue = Promise.resolve();
  let usageCollector = null;
  try {
    const db = await readDb();
    const run = (db.agentStudioRuns || []).find((item) => item.id === runId);
    if (!run || run.status !== 'producing' || !run.hybridRequest?.candidateIds) return;
    const invocationId = `${run.id}:hybrid:${crypto.randomUUID()}`;
    usageCollector = createAgentStudioUsageCollector({ initialUsage: run.usage });
    const workspace = db.workspaces.find((item) => item.id === run.workspaceId);
    if (!workspace) throw new Error('workspace_not_found');
    const runAgent = agentStudioTestProvider?.runAgent || createOpenAIAgentRunner({
      model: OPENAI_AGENT_MODEL,
      phase: 'hybrid',
      invocationId,
      onUsage: (entry) => usageCollector.recordOpenAI(entry),
    });
    const result = await orchestrateAgentStudioHybrid({
      runId,
      input: run.input,
      workspace,
      finalPackage: run.artifacts,
      candidateIds: run.hybridRequest.candidateIds,
      runAgent,
      emit(event) {
        eventQueue = eventQueue.then(() => persistAgentStudioEvent(runId, event));
      },
    });
    await eventQueue;
    await finalizeAgentStudioResult(runId, result, usageCollector.snapshot());
  } catch (error) {
    try {
      await eventQueue;
    } catch {
      // The classified failure below is the authoritative terminal state.
    }
    await serializeBackgroundMutation(async () => {
      const db = await readDb();
      const index = (db.agentStudioRuns || []).findIndex((run) => run.id === runId);
      if (index < 0) return;
      const run = db.agentStudioRuns[index];
      if (TERMINAL_AGENT_STUDIO_STATUSES.has(run.status)) return;
      const classified = classifyAgentStudioError(error);
      const restored = transitionAgentStudioRun(run, 'awaiting_approval', {
        agent: 'Hybrid Producer',
        traceStatus: 'failed',
        summary: 'The hybrid pass failed, so the original creative package was restored.',
        error: classified,
        now: new Date().toISOString(),
      });
      db.agentStudioRuns[index] = {
        ...restored,
        hybridRequest: null,
        usage: usageCollector?.snapshot() || run.usage,
      };
      await writeDb(db);
    });
  } finally {
    agentStudioRunsInFlight.delete(runId);
  }
}

function scheduleAgentStudioRun(runId) {
  setImmediate(() => {
    void executeAgentStudioRun(runId).catch((error) => {
      console.error('[AgentStudio]', runId, error);
    });
  });
}

function scheduleAgentStudioHybrid(runId) {
  setImmediate(() => {
    void executeAgentStudioHybrid(runId).catch((error) => {
      console.error('[AgentStudioHybrid]', runId, error);
    });
  });
}

async function recoverInterruptedAgentStudioRunsOnStartup() {
  const db = await readDb();
  let changed = false;
  db.agentStudioRuns = (db.agentStudioRuns || []).map((run) => {
    if (!ACTIVE_AGENT_STUDIO_STATUSES.has(run.status)) return run;
    changed = true;
    return recoverInterruptedAgentStudioRun(run, { now: new Date().toISOString() });
  });
  if (changed) await writeDb(db);
}

function normalizeChecklistItems(items = []) {
  return items.map((item, index) => ({
    id: String(item.id || `item_${index + 1}`),
    label: String(item.label || ''),
    checked: Boolean(item.checked),
  })).filter((item) => item.label);
}

function isDoneStatus(status = '') {
  const normalized = String(status).trim().toLowerCase();
  return ['done', 'approved', 'затверджено', 'готово'].includes(normalized);
}

function buildAgentReelAnalysis(reel = {}, workspace = {}) {
  const base = analyzeReel(reel, workspace);
  const brief = buildBusinessBriefFromBrandBrain(workspace.brief || {});
  const sourceTitle = reel.title || reel.caption || reel.hook || 'market signal';
  return {
    ...base,
    topic: sourceTitle,
    audience: brief.audience || 'general audience until Brand Brain is filled',
    format: reel.market === 'ua' ? 'local proof reel' : 'global trend adaptation',
    hookPattern: reel.hook || sourceTitle,
    whyItWorked: [
      'clear first-frame promise',
      'simple repeatable structure',
      'visible business outcome',
    ],
    adaptation: {
      market: 'ua',
      rule: 'adapt the mechanism, not the original creative',
      angle: brief.brandBrainReady
        ? `Connect the trend to ${brief.product || 'the offer'} for ${brief.location || 'the selected market'}.`
        : 'Use consultant mode: ask for missing Brand Brain facts or make assumptions explicit.',
    },
    risks: [
      base.copyRisk === 'high' ? 'avoid copying brand-specific visuals' : 'keep visual execution original',
      'do not reuse original audio or copyrighted footage',
      'human approval required before publishing',
    ],
    nextActions: ['generate_script', 'create_shot_list', 'prepare_caption', 'queue_video_job'],
  };
}

function buildScriptFromIdea(idea = {}, workspace = {}) {
  const brief = buildBusinessBriefFromBrandBrain(workspace.brief || {});
  const product = brief.product || 'offer';
  const location = brief.location || 'the selected market';
  const title = idea.title || 'Content idea';
  const hook = idea.hook || title;
  return {
    title,
    hook,
    format: '15-25 sec Reels',
    productionMode: 'smartphone_first',
    scenes: [
      {
        time: '0:00-0:03',
        visual: 'Creator faces the camera and shows the problem in one concrete example.',
        overlay: hook,
        voiceover: hook,
      },
      {
        time: '0:03-0:12',
        visual: `Show ${product} or a simple proof/process from ${location}.`,
        overlay: '3 quick steps',
        voiceover: `Explain the useful mechanism without copying the source reel.`,
      },
      {
        time: '0:12-0:20',
        visual: 'Show result, checklist or before/after proof.',
        overlay: 'Save this before shooting',
        voiceover: 'Turn the insight into a practical action for the viewer.',
      },
      {
        time: '0:20-0:25',
        visual: 'Point to comments or Direct keyword.',
        overlay: 'Write PLAN in Direct',
        voiceover: 'Invite a low-friction next step.',
      },
    ],
    caption: `${title}\n\nUse this as a low-budget Ukrainian adaptation, not a copy of the original trend.`,
    cta: 'Write PLAN in Direct',
    humanApprovalRequired: true,
  };
}

const LEGAL_PAGES = {
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'How Dzhero collects, uses, stores, and protects user and business data.',
    sections: [
      ['Who we are', 'Dzhero is a web-based AI workspace that helps marketers, creators, and small businesses analyze short-form content signals and prepare original content plans.'],
      ['Data we collect', 'Dzhero may collect account information such as name, email address, connected social account identifiers, profile information, profile links, avatar images, and account statistics when a user authorizes a supported platform such as TikTok, Google, Meta, Instagram, or YouTube. Users may also provide business briefs, source links, notes, content ideas, drafts, and workspace settings.'],
      ['DZHERO CRM telemetry / Телеметрія CRM DZHERO', 'EN: The browser tracker sends only anonymous product analytics (page paths without query parameters, allowlisted CTA identifiers, anonymous visitor ID, UTM attribution, and successful-generation identifiers). After verified Google sign-in, the DZHERO backend sends verified account identity and the user’s three optional communication preferences to CRM through an authenticated server request. Preferences are off by default, revocable in Settings, and never gate product access. DZHERO does not send prompts, generated or source content, passwords, OAuth tokens, or session cookies to CRM. UA: Браузерний трекер передає лише анонімну продуктову аналітику (шляхи сторінок без query-параметрів, дозволені CTA, анонімний visitor ID, UTM-атрибуцію та ідентифікатори успішних генерацій). Після підтвердженого Google-входу бекенд DZHERO надсилає підтверджені дані акаунта та три добровільні налаштування комунікації в CRM через захищений серверний запит. Вони початково вимкнені, відкликаються в Налаштуваннях і не впливають на доступ до продукту. DZHERO не передає в CRM промпти, згенерований або вихідний контент, паролі, OAuth-токени чи сесійні cookie.'],
      ['TikTok data', 'When a user connects TikTok through Login Kit, Dzhero uses the approved permissions to identify the connected account, show profile context, and display profile statistics such as follower count, following count, likes count, and video count inside the user workspace. Dzhero does not sell TikTok data and does not post to TikTok or modify a TikTok account unless a user explicitly authorizes a future product feature for that purpose.'],
      ['How we use data', 'Dzhero uses data to provide the service, authenticate users, connect user-owned sources, analyze public and authorized content signals, generate content ideas, prepare scripts, build content plans, prevent abuse, enforce usage limits, and improve product reliability.'],
      ['AI processing', 'Dzhero may send user-provided briefs, source metadata, notes, and selected content context to AI service providers to generate drafts and recommendations. Users are responsible for reviewing AI output before publishing or using it externally.'],
      ['Sharing and service providers', 'Dzhero shares data only with service providers needed to operate the product, such as hosting, database, authentication, analytics, and AI infrastructure providers. Dzhero does not sell personal data.'],
      ['Security', 'Dzhero uses server-side storage for service credentials and access tokens, limits access to production secrets, and applies authentication and workspace access checks to protect user data.'],
      ['Retention and deletion', 'Dzhero keeps account, workspace, connected source, generated draft, and usage data while the account is active or as needed to provide the service. Users may request deletion of their account, connected account data, AI memory, and generated drafts through the data deletion page or support contact.'],
      ['Contact', 'For privacy, data access, or deletion requests, contact Dzhero support through the support channel provided in the app or submit a request at /data-deletion.'],
    ],
  },
  terms: {
    title: 'Terms of Service',
    subtitle: 'Rules for using Dzhero.',
    sections: [
      ['Use of service', 'Dzhero helps marketers, creators, businesses, and SMM teams analyze short-form content signals, prepare drafts, and organize content plans. Users remain responsible for the content they publish and for complying with applicable laws and platform rules.'],
      ['Account and access', 'Users must provide accurate account information and keep access to their account secure. Users may connect only accounts, websites, and sources they own or are authorized to use.'],
      ['Connected platforms', 'Some features use platform integrations such as TikTok Login Kit, Google, Meta, Instagram, and YouTube. Access to these integrations depends on the permissions granted by the user and by the platform. Dzhero uses connected platform data only to provide the requested workspace features.'],
      ['AI output', 'AI drafts are suggestions, not final legal, financial or professional advice. Human review is required before publishing or messaging customers.'],
      ['Content ownership', 'Users keep ownership of the business information, notes, briefs, and drafts they create in Dzhero. Users must not use Dzhero to copy third-party videos, audio, branding, private data, or protected creative assets without permission.'],
      ['Acceptable use', 'Users must not use Dzhero to break platform rules, scrape private data, impersonate others, distribute harmful content, or attempt to access accounts, workspaces, or systems without permission.'],
      ['Service availability', 'Dzhero may change, suspend, or discontinue features as the product evolves or as third-party platform requirements change. Dzhero is provided on an as-is basis to the extent permitted by law.'],
      ['Termination', 'Dzhero may limit or terminate access if a user violates these terms, misuses integrations, creates security risk, or uses the service in a way that may harm other users, Dzhero, or connected platforms.'],
    ],
  },
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderLegalPage(page) {
  const content = LEGAL_PAGES[page];
  const sections = content.sections.map(([title, text]) => (
    `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></section>`
  )).join('');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(content.title)} | Dzhero</title>
  <meta name="description" content="${escapeHtml(content.subtitle)}">
  <style>
    body{margin:0;background:#f7f7f8;color:#111827;font-family:Inter,Arial,sans-serif;line-height:1.6}
    main{max-width:860px;margin:0 auto;padding:48px 20px}
    article{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;box-shadow:0 18px 45px rgba(15,23,42,.08)}
    a{color:#111827} small{color:#6b7280;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
    h1{font-size:40px;line-height:1.1;margin:12px 0 8px} h2{font-size:20px;margin:28px 0 8px}
    p{margin:0 0 12px}.brand{display:inline-flex;gap:10px;align-items:center;margin-bottom:22px;text-decoration:none;font-weight:800}
  </style>
</head>
<body>
  <main>
    <a class="brand" href="/">Dzhero</a>
    <article>
      <small>Dzhero legal document</small>
      <h1>${escapeHtml(content.title)}</h1>
      <p>${escapeHtml(content.subtitle)}</p>
      ${sections}
    </article>
  </main>
</body>
</html>`;
}

app.get(['/privacy', '/privacy/'], (req, res) => {
  res.type('html').send(renderLegalPage('privacy'));
});

app.get(['/terms', '/terms/'], (req, res) => {
  res.type('html').send(renderLegalPage('terms'));
});

app.get('/api/health', async (req, res) => {
  const db = await readDb();
  const health = {
    ok: true,
    service: 'dzhero-api',
    version: '0.1.0',
    storage: DATABASE_URL ? 'postgres' : 'json',
  };
  if (!IS_PRODUCTION || (ADMIN_TOKEN && getAdminToken(req) === ADMIN_TOKEN)) {
    health.counts = {
      workspaces: db.workspaces.length,
      users: db.users.length,
      competitors: db.competitors.length,
      reels: db.reels.length,
      ideas: db.ideas.length,
      leads: db.leads.length,
      sources: db.sources.length,
      instagramAccounts: db.instagramAccounts.length,
      syncJobs: db.syncJobs.length,
      dataDeletionRequests: db.dataDeletionRequests.length,
    };
  }
  res.json(health);
});

app.post('/api/brand-scan/preview', async (req, res, next) => {
  try {
    const input = String(req.body.input || '').trim();
    if (!input) {
      res.status(400).json({ error: 'input_required', message: 'Paste a public source URL or describe the business.' });
      return;
    }
    if (input.length > 2000) {
      res.status(413).json({ error: 'input_too_large', message: 'Brand Scan input is too long.' });
      return;
    }
    if (APIFY_TOKEN || GEMINI_API_KEY) {
      try {
        await serializeBackgroundMutation(async () => {
          const db = await readDb();
          reserveUsageCounter(db, {
            workspaceId: 'platform_global',
            metric: 'public_brand_scan_preview',
            period: new Date().toISOString().slice(0, 10),
            limit: PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT,
          });
          await writeDb(db);
        });
      } catch (error) {
        if (error?.payload?.error === 'plan_limit_reached') {
          res.status(429).json({
            error: 'preview_global_daily_limit_reached',
            message: 'Daily preview capacity is used. Sign in with Google to continue.',
          });
          return;
        }
        throw error;
      }
    }
    const metadata = await fetchPublicSourceMetadata(input);
    let apifyBrandSignals = [];
    let brandBrainWarning = '';
    if (ENABLE_PUBLIC_APIFY_BRAND_SCAN && APIFY_TOKEN && shouldUseApifyForBrandScan(input, metadata)) {
      try {
        apifyBrandSignals = await fetchApifySignals({
          token: APIFY_TOKEN,
          platform: 'instagram',
          inputType: 'profile',
          inputValue: input,
          limit: 8,
          downloadVideo: false,
          market: 'brand',
        });
      } catch (error) {
        brandBrainWarning = error?.message || 'apify_brand_scan_failed';
      }
    }
    const brandBrain = await buildBrandBrainEnrichment({
      input,
      metadata,
      apifySignals: apifyBrandSignals,
      geminiClient: GEMINI_API_KEY
        ? (prompt) => generateGeminiJsonText(prompt, { maxOutputTokens: 1800, temperature: 0.2 })
        : null,
    });
    res.json({
      input,
      source: metadata.source,
      metadata,
      brandBrainDraft: brandBrain.brief,
      brandBrainEvidence: {
        ...brandBrain.evidence,
        warning: brandBrainWarning,
      },
      brandBrainConfidence: brandBrain.confidence,
      brandBrainMissingFields: brandBrain.missingFields,
      capabilities: {
        mode: metadata.sourceStatus === 'youtube_api'
          ? 'youtube_data_api'
          : ['public_metadata', 'instagram_web_profile', 'youtube_oembed'].includes(metadata.sourceStatus)
            ? 'public_profile_preview'
            : 'manual_preview',
        officialApi: metadata.sourceStatus === 'youtube_api',
        statsAreOfficial: metadata.sourceStatus === 'youtube_api',
        intelligence: metadata.videoIntelligence?.confidence || null,
        brandBrain: {
          mode: brandBrain.sourceStatus,
          apify: {
            configured: Boolean(APIFY_TOKEN),
            used: apifyBrandSignals.length > 0,
            returned: apifyBrandSignals.length,
          },
          gemini: {
            configured: Boolean(GEMINI_API_KEY),
            used: brandBrain.sourceStatus === 'brand_brain_gemini',
          },
          confidence: brandBrain.confidence,
          missingFields: brandBrain.missingFields,
        },
        note: ['public_metadata', 'instagram_web_profile'].includes(metadata.sourceStatus)
          ? 'Dzhero використав відкритий опис сторінки. Приватні дані акаунта не читались.'
          : ['youtube_oembed', 'youtube_api'].includes(metadata.sourceStatus)
            ? 'Dzhero використав відкриті дані YouTube: назву, автора, превʼю та доступні лічильники.'
          : 'Платформа не віддала достатньо відкритого контексту, тому Dzhero використав посилання або вставлений текст як ручний brief.',
      },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/data-deletion/request', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const instagramHandle = String(req.body.instagramHandle || '').trim();
  const reason = String(req.body.reason || '').trim();
  if (!email && !instagramHandle) {
    res.status(400).json({ error: 'contact_required', message: 'Email or Instagram handle is required.' });
    return;
  }

  const db = await readDb();
  const confirmationCode = `del_${crypto.randomBytes(8).toString('hex')}`;
  const user = email ? db.users.find((item) => normalizeEmail(item.email) === email) : null;
  const request = {
    id: createId('deletion'),
    confirmationCode,
    email,
    instagramHandle,
    reason,
    status: 'received',
    source: 'public_form',
    userId: user?.id || null,
    workspaceId: user?.workspaceId || null,
    createdAt: new Date().toISOString(),
  };
  db.dataDeletionRequests.unshift(request);
  await writeDb(db);
  res.status(201).json({
    status: request.status,
    confirmationCode,
    message: 'Data deletion request received. Dzhero will verify ownership before deleting account data.',
  });
});

app.get('/api/data-deletion/status/:confirmationCode', async (req, res) => {
  const db = await readDb();
  const request = db.dataDeletionRequests.find((item) => item.confirmationCode === req.params.confirmationCode);
  if (!request) {
    res.status(404).json({ error: 'deletion_request_not_found' });
    return;
  }
  res.json({
    confirmationCode: request.confirmationCode,
    status: request.status,
    createdAt: request.createdAt,
  });
});

app.post('/api/meta/data-deletion', async (req, res) => {
  const db = await readDb();
  const confirmationCode = `meta_del_${crypto.randomBytes(8).toString('hex')}`;
  const request = {
    id: createId('deletion'),
    confirmationCode,
    email: '',
    instagramHandle: '',
    reason: 'Meta data deletion callback',
    status: 'received',
    source: 'meta_callback',
    userId: req.body.user_id || null,
    workspaceId: null,
    rawPayload: req.body,
    createdAt: new Date().toISOString(),
  };
  db.dataDeletionRequests.unshift(request);
  await writeDb(db);
  res.status(200).json({
    url: `${CLIENT_URL.replace(/\/$/, '')}/data-deletion?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
});

app.get('/api/auth/meta/start', async (req, res) => {
  if (!META_APP_ID) {
    res.status(501).json({
      error: 'meta_not_configured',
      message: 'Set META_APP_ID, META_APP_SECRET and META_REDIRECT_URI in .env before using Meta Login.',
      redirectUri: META_REDIRECT_URI,
      requiredEnv: ['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI'],
      optionalEnv: ['META_LOGIN_CONFIG_ID', 'META_SCOPES'],
    });
    return;
  }
  const db = await readDb();
  const user = requireAuthUser(db, req, res);
  if (!user) return;
  const workspaceId = req.query.workspaceId || 'ws_demo_ua';
  const workspace = requireWorkspace(db, workspaceId, res);
  if (!workspace) return;
  if (!canAccessWorkspace(user, workspace.id)) {
    res.status(403).json({ error: 'workspace_forbidden' });
    return;
  }
  const state = createOAuthState(db, 'meta', { workspaceId, userId: user.id });
  await writeDb(db);
  const { authUrl } = buildMetaAuthUrl(state);
  res.json({
    authUrl,
    state,
    redirectUri: META_REDIRECT_URI,
    scopes: META_LOGIN_CONFIG_ID ? [] : META_SCOPE_LIST,
    configId: META_LOGIN_CONFIG_ID || null,
    accountDiscoveryEnabled: CAN_DISCOVER_META_ACCOUNTS,
  });
});

app.get('/api/auth/instagram/start', async (req, res) => {
  if (!INSTAGRAM_APP_ID) {
    res.status(501).json({
      error: 'instagram_not_configured',
      message: 'Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and INSTAGRAM_REDIRECT_URI in .env before using Instagram Login.',
      redirectUri: INSTAGRAM_REDIRECT_URI,
      requiredEnv: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_REDIRECT_URI', 'INSTAGRAM_SCOPES'],
      supportedAccounts: ['creator', 'business'],
      unsupportedAccounts: ['personal'],
    });
    return;
  }
  const db = await readDb();
  const user = requireAuthUser(db, req, res);
  if (!user) return;
  const workspaceId = req.query.workspaceId || 'ws_demo_ua';
  const workspace = requireWorkspace(db, workspaceId, res);
  if (!workspace) return;
  if (!canAccessWorkspace(user, workspace.id)) {
    res.status(403).json({ error: 'workspace_forbidden' });
    return;
  }
  const state = createOAuthState(db, 'instagram', { workspaceId, userId: user.id });
  await writeDb(db);
  const { authUrl } = buildInstagramAuthUrl(state);
  res.json({ authUrl, state, redirectUri: INSTAGRAM_REDIRECT_URI, scopes: INSTAGRAM_SCOPE_LIST });
});

app.get('/api/auth/google/start', async (req, res) => {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(501).json({
      error: 'google_not_configured',
      message: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in .env before using Google Login.',
      redirectUri: GOOGLE_REDIRECT_URI,
      requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    });
    return;
  }
  const db = await readDb();
  const state = createOAuthState(db, 'google');
  await writeDb(db);
  const { authUrl } = buildGoogleAuthUrl(state);
  res.json({ authUrl, state, redirectUri: GOOGLE_REDIRECT_URI, scopes: GOOGLE_SCOPES.split(' ') });
});

app.get('/api/auth/tiktok/start', async (req, res) => {
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
    res.status(501).json({
      error: 'tiktok_not_configured',
      message: 'Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REDIRECT_URI before using TikTok Login.',
      redirectUri: TIKTOK_REDIRECT_URI,
      requiredEnv: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REDIRECT_URI'],
      scopes: TIKTOK_SCOPE_LIST,
    });
    return;
  }
  const db = await readDb();
  const user = requireAuthUser(db, req, res);
  if (!user) return;
  const workspaceId = req.query.workspaceId || user.workspaceId || 'ws_demo_ua';
  const workspace = requireWorkspace(db, workspaceId, res);
  if (!workspace) return;
  if (!canAccessWorkspace(user, workspace.id)) {
    res.status(403).json({ error: 'workspace_forbidden' });
    return;
  }
  const state = createOAuthState(db, 'tiktok', { workspaceId, userId: user.id });
  await writeDb(db);
  const { authUrl } = buildTikTokAuthUrl(state);
  res.json({ authUrl, state, redirectUri: TIKTOK_REDIRECT_URI, scopes: TIKTOK_SCOPE_LIST });
});

app.get('/api/auth/meta/callback', async (req, res) => {
  if (req.query.error) {
    res.status(400).send(`Meta Login error: ${req.query.error_description || req.query.error}`);
    return;
  }
  if (!req.query.code) {
    res.status(400).send('Meta Login callback received without code.');
    return;
  }
  if (!META_APP_ID || !META_APP_SECRET) {
    res.status(501).send('Meta Login is not configured. Set META_APP_ID and META_APP_SECRET.');
    return;
  }
  try {
    const db = await readDb();
    const stateRecord = findValidOAuthState(db, String(req.query.state || ''), 'instagram');
    if (!stateRecord) {
      res.status(400).send('Instagram Login state is invalid or expired.');
      return;
    }
    const workspaceId = stateRecord.workspaceId;
    const tokenResult = await exchangeMetaCode(String(req.query.code));
    if (!CAN_DISCOVER_META_ACCOUNTS) {
      stateRecord.usedAt = new Date().toISOString();
      createSyncJob(db, workspaceId, 'meta_login_verified', {
        accountDiscoveryEnabled: false,
        scopes: META_SCOPE_LIST,
        configId: META_LOGIN_CONFIG_ID || null,
      });
      await writeDb(db);
      res.redirect(`${CLIENT_URL}/?meta=connected&accounts=0&discovery=disabled`);
      return;
    }
    const pages = await getMetaPages(tokenResult.access_token);
    const discoveredAccounts = pages
      .filter((page) => page.instagram_business_account)
      .map((page) => ({
        id: createId('ig'),
        workspaceId,
        metaPageId: page.id,
        pageName: page.name,
        instagramId: page.instagram_business_account.id,
        username: page.instagram_business_account.username || page.instagram_business_account.name || '',
        profilePictureUrl: page.instagram_business_account.profile_picture_url || '',
        permissions: META_SCOPE_LIST,
        status: 'connected',
        connectedAt: new Date().toISOString(),
        tokenMeta: {
          tokenType: tokenResult.token_type || 'bearer',
          expiresIn: tokenResult.expires_in || null,
        },
      }));

    const workspaceUser = db.users.find((item) => item.id === stateRecord.userId)
      || getWorkspaceUsers(db, workspaceId)[0]
      || null;
    const entitlements = buildEntitlements(db, workspaceId, workspaceUser);
    const allowedAccountCount = entitlements.unlimited
      ? discoveredAccounts.length
      : Math.max(0, Number(entitlements.plan.limits.instagramAccounts || 0));
    const connectedAccounts = discoveredAccounts.slice(0, allowedAccountCount);

    db.instagramAccounts = db.instagramAccounts.filter((account) => account.workspaceId !== workspaceId);
    db.instagramAccounts.unshift(...connectedAccounts);
    stateRecord.usedAt = new Date().toISOString();
    createSyncJob(db, workspaceId, 'meta_account_discovery', {
      pagesFound: pages.length,
      instagramAccountsFound: connectedAccounts.length,
    });
    await writeDb(db);
    res.redirect(`${CLIENT_URL}/?meta=connected&accounts=${connectedAccounts.length}`);
  } catch (err) {
    console.error('[MetaLogin]', err);
    res.status(502).send('Meta Login could not be completed. Please try again.');
  }
});

app.get('/api/auth/callback/google', async (req, res) => {
  if (req.query.error) {
    res.status(400).send(`Google Login error: ${req.query.error_description || req.query.error}`);
    return;
  }
  if (!req.query.code) {
    res.status(400).send('Google Login callback received without code.');
    return;
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    res.status(501).send('Google Login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
    return;
  }
  try {
    const db = await readDb();
    const stateRecord = findValidOAuthState(db, String(req.query.state || ''), 'google');
    if (!stateRecord) {
      res.status(400).send('Google Login state is invalid or expired.');
      return;
    }
    const tokenResult = await exchangeGoogleCode(String(req.query.code));
    const profile = await getGoogleProfile(tokenResult.access_token);
    if (profile.email_verified === false) {
      res.status(403).send('Google account email is not verified.');
      return;
    }
    const user = ensureOAuthUser(db, {
      provider: 'google',
      sub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
    linkTesterGrant(db, { user });
    stateRecord.usedAt = new Date().toISOString();
    const session = createSession(db, user.id);
    await writeDb(db);
    scheduleCrmSync(user);
    setSessionCookie(res, session.token);
    res.redirect(`${CLIENT_URL}/?auth=google`);
  } catch (err) {
    console.error('[GoogleLogin]', err);
    res.status(502).send('Google Login could not be completed. Please try again.');
  }
});

app.get('/api/auth/instagram/callback', async (req, res) => {
  if (req.query.error) {
    res.status(400).send(`Instagram Login error: ${req.query.error_description || req.query.error}`);
    return;
  }
  if (!req.query.code) {
    res.status(400).send('Instagram Login callback received without code.');
    return;
  }
  if (!INSTAGRAM_APP_ID || !INSTAGRAM_APP_SECRET) {
    res.status(501).send('Instagram Login is not configured. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET.');
    return;
  }
  try {
    const db = await readDb();
    const stateRecord = findValidOAuthState(db, String(req.query.state || ''), 'instagram');
    if (!stateRecord) {
      res.status(400).send('Instagram Login state is invalid or expired.');
      return;
    }
    const workspaceId = stateRecord.workspaceId;
    const tokenResult = await exchangeInstagramCode(String(req.query.code));
    const profile = await getInstagramProfile(tokenResult.access_token).catch(() => ({
      id: tokenResult.user_id,
      user_id: tokenResult.user_id,
      username: '',
      account_type: 'PROFESSIONAL',
    }));
    const accountId = String(profile.user_id || profile.id || tokenResult.user_id || '');
    const connectedAccount = {
      id: createId('ig'),
      workspaceId,
      provider: 'instagram_login',
      metaPageId: null,
      pageName: null,
      instagramId: accountId,
      username: profile.username || `instagram_${accountId}`,
      accountType: profile.account_type || 'PROFESSIONAL',
      profilePictureUrl: profile.profile_picture_url || '',
      permissions: INSTAGRAM_SCOPE_LIST,
      status: 'connected',
      connectedAt: new Date().toISOString(),
      tokenMeta: {
        tokenType: tokenResult.token_type || 'bearer',
        expiresIn: tokenResult.expires_in || null,
      },
    };

    const workspaceUser = db.users.find((item) => item.id === stateRecord.userId)
      || getWorkspaceUsers(db, workspaceId)[0]
      || null;
    const entitlements = buildEntitlements(db, workspaceId, workspaceUser);
    const existingWorkspaceAccounts = db.instagramAccounts.filter((account) => account.workspaceId === workspaceId);
    const replacesExisting = existingWorkspaceAccounts.some((account) => account.instagramId === connectedAccount.instagramId);
    const accountLimit = entitlements.plan.limits.instagramAccounts;
    if (!entitlements.unlimited && !replacesExisting && Number.isFinite(accountLimit) && existingWorkspaceAccounts.length >= accountLimit) {
      stateRecord.usedAt = new Date().toISOString();
      await writeDb(db);
      res.redirect(`${CLIENT_URL}/?instagram=limit_reached`);
      return;
    }

    db.instagramAccounts = db.instagramAccounts.filter((account) => (
      account.workspaceId !== workspaceId || account.instagramId !== connectedAccount.instagramId
    ));
    db.instagramAccounts.unshift(connectedAccount);
    stateRecord.usedAt = new Date().toISOString();
    createSyncJob(db, workspaceId, 'instagram_account_connected', {
      provider: 'instagram_login',
      accountType: connectedAccount.accountType,
      scopes: connectedAccount.permissions,
    });
    await writeDb(db);
    res.redirect(`${CLIENT_URL}/?instagram=connected&accounts=1`);
  } catch (err) {
    console.error('[InstagramLogin]', err);
    res.status(502).send('Instagram Login could not be completed. Please try again.');
  }
});

app.get('/api/auth/tiktok/callback', async (req, res) => {
  if (req.query.error) {
    res.status(400).send(`TikTok Login error: ${req.query.error_description || req.query.error}`);
    return;
  }
  if (!req.query.code) {
    res.status(400).send('TikTok Login callback received without code.');
    return;
  }
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
    res.status(501).send('TikTok Login is not configured.');
    return;
  }
  try {
    const db = await readDb();
    const stateRecord = findValidOAuthState(db, String(req.query.state || ''), 'tiktok');
    if (!stateRecord) {
      res.status(400).send('TikTok Login state is invalid or expired.');
      return;
    }
    const workspaceId = stateRecord.workspaceId;
    const tokenResult = getTikTokTokenPayload(await exchangeTikTokCode(String(req.query.code)));
    const accessToken = tokenResult.access_token || '';
    const profile = accessToken ? await getTikTokProfile(accessToken) : {};
    const openId = String(profile.open_id || tokenResult.open_id || '');
    const connectedAccount = {
      id: createId('tt'),
      workspaceId,
      provider: 'tiktok_login',
      openId,
      unionId: profile.union_id || '',
      displayName: profile.display_name || (openId ? `TikTok ${openId.slice(0, 6)}` : 'TikTok account'),
      profileDeepLink: profile.profile_deep_link || '',
      avatarUrl: profile.avatar_large_url || profile.avatar_url_100 || profile.avatar_url || '',
      bioDescription: profile.bio_description || '',
      isVerified: Boolean(profile.is_verified),
      stats: {
        followers: profile.follower_count ?? null,
        following: profile.following_count ?? null,
        likes: profile.likes_count ?? null,
        videos: profile.video_count ?? null,
      },
      permissions: TIKTOK_SCOPE_LIST,
      status: 'connected',
      connectedAt: new Date().toISOString(),
      tokenMeta: {
        tokenType: tokenResult.token_type || 'bearer',
        expiresIn: tokenResult.expires_in || null,
        refreshExpiresIn: tokenResult.refresh_expires_in || null,
      },
    };

    db.tiktokAccounts = db.tiktokAccounts.filter((account) => (
      account.workspaceId !== workspaceId || account.openId !== connectedAccount.openId
    ));
    db.tiktokAccounts.unshift(connectedAccount);
    stateRecord.usedAt = new Date().toISOString();
    createSyncJob(db, workspaceId, 'tiktok_account_connected', {
      provider: 'tiktok_login',
      scopes: connectedAccount.permissions,
      hasStats: Object.values(connectedAccount.stats).some((value) => value !== null),
    });
    await writeDb(db);
    res.redirect(`${CLIENT_URL}/?tiktok=connected&accounts=1`);
  } catch (err) {
    console.error('[TikTokLogin]', err);
    res.status(502).send('TikTok Login could not be completed. Please try again.');
  }
});

app.get('/api/auth/meta/status', async (req, res) => {
  const db = await readDb();
  const workspaceId = req.query.workspaceId || 'ws_demo_ua';
  const user = requireAuthUser(db, req, res);
  if (!user) return;
  const workspace = requireWorkspace(db, workspaceId, res);
  if (!workspace) return;
  if (!canAccessWorkspace(user, workspace.id)) {
    res.status(403).json({ error: 'workspace_forbidden' });
    return;
  }
  const accounts = db.instagramAccounts.filter((account) => account.workspaceId === workspaceId);
  res.json({
    configured: Boolean(META_APP_ID && META_APP_SECRET),
    redirectUri: META_REDIRECT_URI,
    scopes: META_SCOPE_LIST,
    configId: META_LOGIN_CONFIG_ID || null,
    accountDiscoveryEnabled: CAN_DISCOVER_META_ACCOUNTS,
    connectedAccounts: accounts.map((account) => ({
      id: account.id,
      username: account.username,
      pageName: account.pageName,
      status: account.status,
      connectedAt: account.connectedAt,
      permissions: account.permissions,
    })),
  });
});

app.post('/api/auth/register', async (req, res) => {
  const db = await readDb();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const name = String(req.body.name || '').trim() || email.split('@')[0] || 'User';
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'valid_email_required' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'password_too_short' });
    return;
  }
  if (db.users.some((user) => user.email === email)) {
    res.status(409).json({ error: 'email_already_exists' });
    return;
  }
  const workspace = {
    id: createId('ws'),
    name: `${name} workspace`,
    owner: name,
    mode: 'own_business',
    marketFocus: ['ua', 'us', 'eu', 'global'],
    createdAt: new Date().toISOString(),
    brief: {},
  };
  const user = {
    id: createId('usr'),
    name,
    email,
    role: 'owner',
    workspaceId: workspace.id,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  db.workspaces.unshift(workspace);
  db.users.unshift(user);
  ensureWorkspaceSubscription(db, workspace.id, { planId: 'trial' });
  const session = createSession(db, user.id);
  await writeDb(db);
  setSessionCookie(res, session.token);
  res.status(201).json({ ...buildAuthPayload(db, user), token: session.token });
});

app.post('/api/auth/login', async (req, res) => {
  const db = await readDb();
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  const user = db.users.find((item) => item.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }
  const session = createSession(db, user.id);
  await writeDb(db);
  setSessionCookie(res, session.token);
  res.json({ ...buildAuthPayload(db, user), token: session.token });
});

app.post('/api/auth/demo', async (req, res, next) => {
  let stage = 'validate';
  try {
    if (!ALLOW_DEMO_LOGIN) {
      res.status(403).json({ error: 'demo_login_disabled' });
      return;
    }
    stage = 'read';
    const db = await readDb();
    const agentStudioExperience = ENABLE_AGENT_STUDIO && req.body?.experience === 'agent_studio';
    const demoEmail = agentStudioExperience ? 'agent-studio-demo@dzhero.app' : 'demo@dzhero.app';
    const demoWorkspaceId = agentStudioExperience ? 'ws_demo_agent_studio_coffee' : 'ws_demo_ua';
    stage = 'seed';
    if (agentStudioExperience) {
      const coffeeWorkspace = {
      id: demoWorkspaceId,
      name: 'Reset Coffee Kyiv',
      owner: 'Coffee Demo User',
      mode: 'own_business',
      marketFocus: ['ua'],
      createdAt: new Date().toISOString(),
      brief: {
        businessType: 'Independent neighborhood coffee shop',
        product: 'Espresso drinks and fresh pastries',
        location: 'Kyiv, Ukraine',
        audience: 'Busy professionals walking to work on weekdays',
        objective: 'Bring more weekday morning visits',
        positioning: 'A warm five-minute morning reset before work',
        toneOfVoice: 'Warm, concise, lightly playful',
        cta: 'Visit before work',
        constraints: ['Low-budget production', 'Shootable by one person', 'No unsupported best-in-city claims'],
      },
    };
      const workspaceIndex = db.workspaces.findIndex((item) => item.id === demoWorkspaceId);
      if (workspaceIndex >= 0) {
        db.workspaces[workspaceIndex] = {
          ...db.workspaces[workspaceIndex],
          ...coffeeWorkspace,
          createdAt: db.workspaces[workspaceIndex].createdAt || coffeeWorkspace.createdAt,
        };
      } else {
        db.workspaces.unshift(coffeeWorkspace);
      }
    }
    let user = db.users.find((item) => item.email === demoEmail);
    if (!user) {
      user = {
        id: createId('usr'),
        name: agentStudioExperience ? 'Coffee Demo User' : 'Demo User',
        email: demoEmail,
        role: 'owner',
        workspaceId: demoWorkspaceId,
        passwordHash: hashPassword(crypto.randomBytes(12).toString('hex')),
        createdAt: new Date().toISOString(),
      };
      db.users.unshift(user);
    } else if (agentStudioExperience) {
      user.workspaceId = demoWorkspaceId;
      user.name = 'Coffee Demo User';
    }
    stage = 'subscription';
    ensureWorkspaceSubscription(db, user.workspaceId, { planId: 'demo' });
    stage = 'session';
    const session = createSession(db, user.id);
    stage = 'write';
    await writeDb(db);
    stage = 'response';
    setSessionCookie(res, session.token);
    res.json({ ...buildAuthPayload(db, user), token: session.token });
  } catch (error) {
    error.status = Number(error.status || 500);
    error.payload = {
      error: 'demo_login_failed',
      stage,
      providerCode: String(error.code || '').slice(0, 40) || undefined,
    };
    next(error);
  }
});

app.get('/api/auth/me', async (req, res) => {
  const db = await readDb();
  const user = getAuthUser(db, req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  scheduleCrmSync(user);
  res.json(buildAuthPayload(db, user));
});

app.get('/api/account/communication-preferences', async (req, res) => {
  const db = await readDb();
  const user = requireAuthUser(db, req, res);
  if (!user) return;
  scheduleCrmSync(user);
  res.json(publicCommunicationPreferences(user));
});

app.put('/api/account/communication-preferences', async (req, res) => {
  const db = await readDb();
  const user = requireAuthUser(db, req, res);
  if (!user) return;
  try {
    updateCommunicationPreferences(user, {
      product_updates: req.body?.product_updates,
      early_bird_offers: req.body?.early_bird_offers,
      research_invites: req.body?.research_invites,
      locale: req.body?.locale,
      source: req.body?.source || 'settings',
      recordedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({ error: 'invalid_communication_preferences', message: error.message });
    return;
  }
  await writeDb(db);
  const syncStatus = scheduleCrmSync(user);
  res.json({ ...publicCommunicationPreferences(user), sync_status: syncStatus });
});

app.post('/api/account/crm-sync', async (req, res) => {
  const db = await readDb();
  const user = requireAuthUser(db, req, res);
  if (!user) return;
  if (!isCrmSyncEligibleUser(user)) {
    res.status(409).json({ error: 'verified_google_identity_required' });
    return;
  }
  const syncStatus = scheduleCrmSync(user, {
    visitorId: req.body?.visitor_id,
    attribution: {
      utm_source: req.body?.utm_source,
      utm_medium: req.body?.utm_medium,
      utm_campaign: req.body?.utm_campaign,
    },
  });
  res.status(202).json({ status: syncStatus });
});

app.post('/api/auth/logout', async (req, res) => {
  const db = await readDb();
  const token = getAuthToken(req);
  db.sessions = db.sessions.filter((session) => session.token !== token);
  await writeDb(db);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/schema', (req, res) => {
  if (IS_PRODUCTION && !requireAdmin(req, res)) return;
  res.json({
    entities: [
      'users',
      'workspaces',
      'sources',
      'instagram_accounts',
      'competitors',
      'reels',
      'ideas',
      'remixes',
      'content_plan_items',
      'leads',
      'crm_tags',
      'ai_memory',
      'ai_jobs',
      'video_jobs',
      'sync_jobs',
      'plans',
      'subscriptions',
      'usage_counters',
      'demo_sessions',
    ],
    note: 'MVP API skeleton. Storage can run on Postgres JSONB while billing entities are being normalized.',
  });
});

app.get('/api/billing/plans', (req, res) => {
  res.json({
    purchaseEnabled: ENABLE_BILLING_PURCHASES,
    plans: PLAN_CATALOG.filter((plan) => !plan.internal).map((plan) => ({
      ...publicPlan(plan),
      availableForPurchase: ENABLE_BILLING_PURCHASES,
    })),
  });
});

app.get('/api/workspaces', async (req, res) => {
  const db = await readDb();
  const user = requireAuthUser(db, req, res);
  if (!user) return;
  const workspaces = db.workspaces.filter((workspace) => canAccessWorkspace(user, workspace.id));
  res.json({ workspaces });
});

app.post('/api/workspaces', async (req, res) => {
  const db = await readDb();
  const user = requireAuthUser(db, req, res);
  if (!user) return;
  const entitlementWorkspaceId = user.workspaceId || user.workspaceIds?.[0];
  if (entitlementWorkspaceId) {
    try {
      assertUsageAvailable(db, entitlementWorkspaceId, 'workspaces', 1, user);
    } catch (error) {
      res.status(error.status || 402).json(error.payload || { error: error.message });
      return;
    }
  }
  const workspace = {
    id: createId('ws'),
    name: req.body.name || 'New workspace',
    owner: user.name || user.email,
    ownerUserId: user.id,
    mode: req.body.mode || 'own_business',
    marketFocus: req.body.marketFocus || ['ua', 'us', 'eu', 'global'],
    createdAt: new Date().toISOString(),
    brief: req.body.brief || {},
  };
  db.workspaces.unshift(workspace);
  user.workspaceIds = Array.from(new Set([...(user.workspaceIds || []), workspace.id]));
  ensureWorkspaceSubscription(db, workspace.id, { planId: 'trial' });
  await writeDb(db);
  res.status(201).json({ workspace });
});

app.get('/api/workspaces/:workspaceId/billing', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const billing = buildEntitlements(db, req.params.workspaceId, req.authUser);
  await writeDb(db);
  res.json(billing);
});

app.get('/api/workspaces/:workspaceId/billing/checkout', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const planId = String(req.query.planId || '').trim();
  const plan = PLAN_CATALOG.find((item) => item.id === planId);
  if (!plan || plan.internal || ['demo', 'trial'].includes(plan.id)) {
    res.status(400).json({ error: 'valid_paid_plan_required' });
    return;
  }
  if (!ENABLE_BILLING_PURCHASES) {
    res.status(503).json({
      error: 'billing_coming_soon',
      message: 'Paid plans are coming soon. No payment can be created during public beta.',
    });
    return;
  }
  const reference = `${PAYMENT_NOTE_PREFIX}-${workspace.id}-${plan.id}`.replace(/\s+/g, '-');
  res.json({
    plan: publicPlan(plan),
    workspace: {
      id: workspace.id,
      name: workspace.name,
    },
    payment: {
      status: PAYMENT_CARD_NUMBER || PAYMENT_CARD_URL ? 'ready' : 'payment_details_missing',
      method: 'manual_card_transfer',
      provider: 'monobank_manual',
      currency: 'UAH',
      amount: plan.priceUah,
      cardNumber: PAYMENT_CARD_NUMBER,
      cardHolder: PAYMENT_CARD_HOLDER,
      paymentUrl: PAYMENT_CARD_URL,
      supportUrl: PAYMENT_SUPPORT_URL,
      reference,
      note: `Dzhero ${plan.name}`,
      activation: 'manual_after_payment_review',
    },
  });
});

app.post('/api/workspaces/:workspaceId/billing/select-plan', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const planId = String(req.body.planId || '').trim();
  const plan = PLAN_CATALOG.find((item) => item.id === planId);
  if (!plan || plan.internal || ['demo', 'trial'].includes(plan.id)) {
    res.status(400).json({ error: 'valid_paid_plan_required' });
    return;
  }
  if (!ENABLE_BILLING_PURCHASES) {
    res.status(503).json({
      error: 'billing_coming_soon',
      message: 'Paid plans are coming soon. No payment can be created during public beta.',
    });
    return;
  }
  const subscription = ensureWorkspaceSubscription(db, req.params.workspaceId);
  subscription.pendingPlanId = plan.id;
  subscription.status = 'pending_payment';
  subscription.provider = req.body.provider || 'manual';
  subscription.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.json({
    subscription,
    plan: publicPlan(plan),
    checkout: {
      status: PAYMENT_CARD_NUMBER || PAYMENT_CARD_URL ? 'manual_payment_ready' : 'payment_details_missing',
      url: `/api/workspaces/${req.params.workspaceId}/billing/checkout?planId=${plan.id}`,
      message: 'Manual card payment is available until payment provider webhooks are connected.',
    },
  });
});

app.post('/api/workspaces/:workspaceId/billing/manual-activate', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const planId = String(req.body.planId || 'pro').trim();
  const plan = PLAN_CATALOG.find((item) => item.id === planId);
  if (!plan || plan.internal || ['demo', 'trial'].includes(plan.id)) {
    res.status(400).json({ error: 'valid_paid_plan_required' });
    return;
  }
  activateWorkspacePlan(db, req.params.workspaceId, plan.id, {
    provider: 'manual',
    days: Number(req.body.days || 30),
    note: req.body.note || 'manual activation',
  });
  await writeDb(db);
  res.json(buildEntitlements(db, req.params.workspaceId, req.authUser));
});

function publicTesterGrant(db, grant) {
  const user = db.users.find((item) => item.id === grant.userId)
    || db.users.find((item) => normalizeTesterEmail(item.email) === normalizeTesterEmail(grant.email))
    || null;
  const workspaceId = grant.workspaceId || user?.workspaceId || '';
  const workspace = workspaceId
    ? db.workspaces.find((item) => item.id === workspaceId) || null
    : null;
  return {
    id: grant.id,
    email: grant.email,
    status: grant.status,
    planId: grant.planId,
    note: grant.note || '',
    userId: user?.id || null,
    workspaceId: workspace?.id || null,
    workspaceName: workspace?.name || '',
    grantedAt: grant.grantedAt || null,
    activatedAt: grant.activatedAt || null,
    revokedAt: grant.revokedAt || null,
    lastLoginAt: user?.lastLoginAt || null,
    billing: workspace ? buildEntitlements(db, workspace.id, user) : null,
    discovery: workspace ? buildDiscoveryStatusResponse(db, workspace.id, new Date()) : null,
  };
}

app.get('/api/owner/testers', async (req, res) => {
  const db = await readDb();
  if (!requireOwnerUser(db, req, res)) return;
  res.json({
    testers: db.testerAccessGrants.map((grant) => publicTesterGrant(db, grant)),
  });
});

app.post('/api/owner/testers', async (req, res) => {
  const db = await readDb();
  const owner = requireOwnerUser(db, req, res);
  if (!owner) return;
  const email = normalizeTesterEmail(req.body.email);
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'valid_email_required' });
    return;
  }
  const grant = upsertTesterGrant(db, {
    email,
    ownerUserId: owner.id,
    note: req.body.note,
    createId,
  });
  const user = db.users.find((item) => normalizeTesterEmail(item.email) === email);
  if (isVerifiedGoogleUser(user)) linkTesterGrant(db, { user });
  await writeDb(db);
  res.status(201).json({ tester: publicTesterGrant(db, grant) });
});

app.delete('/api/owner/testers/:grantId', async (req, res) => {
  const db = await readDb();
  if (!requireOwnerUser(db, req, res)) return;
  const grant = revokeTesterGrant(db, { grantId: req.params.grantId });
  if (!grant) {
    res.status(404).json({ error: 'tester_grant_not_found' });
    return;
  }
  await writeDb(db);
  res.json({ tester: publicTesterGrant(db, grant) });
});

app.post('/api/admin/testers/grant', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = await readDb();
  const email = normalizeTesterEmail(req.body.email);
  const requestedWorkspaceId = String(req.body.workspaceId || '').trim();
  const workspace = requestedWorkspaceId
    ? db.workspaces.find((item) => item.id === requestedWorkspaceId) || null
    : null;
  const user = email
    ? db.users.find((item) => normalizeTesterEmail(item.email) === email) || null
    : db.users.find((item) => item.workspaceId === workspace?.id) || null;
  const testerEmail = email || normalizeTesterEmail(user?.email);
  if (!testerEmail || !testerEmail.includes('@')) {
    res.status(400).json({ error: 'valid_email_required' });
    return;
  }
  const grant = upsertTesterGrant(db, {
    email: testerEmail,
    ownerUserId: 'admin_token',
    note: req.body.note,
    createId,
  });
  if (isVerifiedGoogleUser(user)) linkTesterGrant(db, { user });
  await writeDb(db);
  res.status(201).json({
    ok: true,
    tester: publicTesterGrant(db, grant),
  });
});

app.get('/api/admin/testers', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = await readDb();
  res.json({ testers: db.testerAccessGrants.map((grant) => publicTesterGrant(db, grant)) });
});

app.get('/api/workspaces/:workspaceId/brief', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  res.json({ brief: workspace.brief || {} });
});

function prepareBrandBrainWrite(existingBrief, input) {
  const patch = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const nextBrief = { ...(existingBrief || {}), ...patch };
  nextBrief.sourceLinks = normalizeBrandBrainSourceLinks(nextBrief.sourceLinks);
  return { nextBrief, missingFields: getMissingRequiredBrandFields(nextBrief) };
}

app.put('/api/workspaces/:workspaceId/brief', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  if (Number(workspace.brief?.schemaVersion) === 2) {
    res.status(409).json({ error: 'brand_brain_v2_finalize_required' });
    return;
  }
  const { nextBrief, missingFields } = prepareBrandBrainWrite(workspace.brief, req.body);
  if (missingFields.length) {
    res.status(422).json({ error: 'brand_brain_required_fields_missing', missingFields });
    return;
  }
  const shouldChargeSave = shouldChargeBrandBrainSave({
    existingBrief: workspace.brief || {},
    nextBrief,
  });
  if (shouldChargeSave) {
    assertUsageAvailable(db, req.params.workspaceId, 'brandBrainSaves', 1, req.authUser);
  }
  workspace.brief = {
    ...nextBrief,
    updatedAt: new Date().toISOString(),
  };
  if (shouldChargeSave) {
    incrementUsage(db, req.params.workspaceId, USAGE_METRICS.brandBrainSaves);
  }
  await writeDb(db);
  res.json({ brief: workspace.brief, billing: buildEntitlements(db, req.params.workspaceId, req.authUser) });
});

app.get('/api/workspaces/:workspaceId/content-plan', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  res.json({ posts: normalizeContentPlanPosts(workspace.contentPlanPosts || []) });
});

app.put('/api/workspaces/:workspaceId/content-plan', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const nextPosts = normalizeContentPlanPosts(req.body.posts);
  const billing = buildEntitlements(db, req.params.workspaceId, req.authUser);
  const limit = billing.plan.limits.contentPlanPosts;
  if (Number.isFinite(limit) && nextPosts.length > limit) {
    res.status(402).json({
      error: 'plan_limit_reached',
      usageKey: 'contentPlanPosts',
      limit,
      used: billing.usage.contentPlanPosts,
      requested: nextPosts.length,
      remaining: billing.remaining.contentPlanPosts,
      plan: billing.plan,
      message: 'Content plan post limit reached for this plan.',
    });
    return;
  }
  workspace.contentPlanPosts = nextPosts;
  workspace.contentPlanUpdatedAt = new Date().toISOString();
  await writeDb(db);
  res.json({ posts: workspace.contentPlanPosts, updatedAt: workspace.contentPlanUpdatedAt, billing: buildEntitlements(db, req.params.workspaceId, req.authUser) });
});

app.get('/api/workspaces/:workspaceId/agent-studio/config', async (req, res) => {
  res.json(getAgentStudioConfig());
});

app.post('/api/workspaces/:workspaceId/agent-studio/uploads', expensiveLimiter, agentStudioVideoBody, async (req, res, next) => {
  try {
    if (!requireAgentStudioEnabled(res)) return;
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    const file = await uploadAgentStudioVideo(req);
    const now = Date.now();
    const upload = {
      id: `agent_upload_${crypto.randomUUID().replaceAll('-', '')}`,
      workspaceId: workspace.id,
      userId: req.authUser.id,
      file,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + (45 * 60 * 1000)).toISOString(),
    };
    db.agentStudioUploads = (db.agentStudioUploads || [])
      .filter((item) => Date.parse(item.expiresAt || '') > now);
    db.agentStudioUploads.push(upload);
    await writeDb(db);
    res.status(201).json({
      uploadId: upload.id,
      file: { name: file.originalName, size: file.size, mimeType: file.mimeType },
    });
  } catch (error) {
    if (error?.status) {
      res.status(error.status).json({ error: error.message, message: error.message });
      return;
    }
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/agent-studio/runs', expensiveLimiter, async (req, res, next) => {
  try {
    if (!requireAgentStudioEnabled(res)) return;
    let input;
    try {
      input = normalizeAgentStudioInput(req.body || {});
    } catch (error) {
      res.status(400).json({
        error: 'invalid_agent_studio_input',
        message: error?.issues?.[0]?.message || 'Choose a mode, objective, and valid source.',
      });
      return;
    }
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    if (input.idempotencyKey) {
      const existing = (db.agentStudioRuns || []).find((run) => (
        run.workspaceId === workspace.id
        && run.input?.idempotencyKey === input.idempotencyKey
      ));
      if (existing) {
        res.status(200).json({ run: toPublicAgentStudioRun(existing), idempotent: true });
        return;
      }
    }
    const sourceUpload = input.uploadId
      ? (db.agentStudioUploads || []).find((item) => (
        item.id === input.uploadId
        && item.workspaceId === workspace.id
        && item.userId === req.authUser.id
        && Date.parse(item.expiresAt || '') > Date.now()
      ))
      : null;
    if (input.uploadId && !sourceUpload) {
      res.status(400).json({
        error: 'agent_studio_upload_invalid',
        message: 'The uploaded video expired or does not belong to this workspace.',
      });
      return;
    }
    assertUsageAvailable(db, workspace.id, 'aiOperations', 1, req.authUser);
    const run = createAgentStudioRun({
      workspaceId: workspace.id,
      userId: req.authUser.id,
      input,
    });
    if (sourceUpload) {
      run.sourceUpload = sourceUpload.file;
      db.agentStudioUploads = (db.agentStudioUploads || []).filter((item) => item.id !== sourceUpload.id);
    }
    db.agentStudioRuns.unshift(run);
    incrementUsage(db, workspace.id, USAGE_METRICS.aiOperations, 1);
    await writeDb(db);
    res.status(201).json({ run: toPublicAgentStudioRun(run) });
    scheduleAgentStudioRun(run.id);
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:workspaceId/agent-studio/runs/latest', async (req, res, next) => {
  try {
    const language = req.query.language === 'en' ? 'en' : 'uk';
    const db = await readDb();
    let run = (db.agentStudioRuns || []).find((item) => (
      item.workspaceId === req.params.workspaceId
      && getAgentStudioRunLanguage(item) === language
      && ['awaiting_approval', 'completed'].includes(item.status)
    ));
    if (!run) {
      run = await ensureAgentStudioDemoRun(db, req.params.workspaceId, req.authUser.id, language);
    }
    if (!run) {
      res.status(404).json({ error: 'agent_studio_run_not_found' });
      return;
    }
    res.json({ run: toPublicAgentStudioRun(run) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:workspaceId/agent-studio/runs/:runId', async (req, res) => {
  const db = await readDb();
  const run = findAgentStudioRun(db, req.params.workspaceId, req.params.runId);
  if (!run) {
    res.status(404).json({ error: 'agent_studio_run_not_found' });
    return;
  }
  res.json({ run: toPublicAgentStudioRun(run) });
});

app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/context', expensiveLimiter, async (req, res, next) => {
  try {
    if (!requireAgentStudioEnabled(res)) return;
    const userNotes = String(req.body?.userNotes || '').trim();
    if (userNotes.length < 10 || userNotes.length > 4000) {
      res.status(400).json({
        error: 'agent_studio_context_required',
        message: 'Add one or two sentences describing the key action and reveal.',
      });
      return;
    }
    const db = await readDb();
    const index = (db.agentStudioRuns || []).findIndex((run) => (
      run.id === req.params.runId && run.workspaceId === req.params.workspaceId
    ));
    if (index < 0) {
      res.status(404).json({ error: 'agent_studio_run_not_found' });
      return;
    }
    const run = db.agentStudioRuns[index];
    if (run.status !== 'needs_context') {
      res.status(409).json({ error: 'agent_studio_context_not_requested' });
      return;
    }
    let resumed = resumeAgentStudioRunWithContext(run, {
      userNotes,
      now: new Date().toISOString(),
    });
    resumed = {
      ...resumed,
      input: {
        ...resumed.input,
        userNotes,
      },
    };
    db.agentStudioRuns[index] = resumed;
    await writeDb(db);
    res.status(202).json({ run: toPublicAgentStudioRun(resumed) });
    scheduleAgentStudioRun(resumed.id);
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/source-file', expensiveLimiter, agentStudioVideoBody, async (req, res, next) => {
  let uploaded = null;
  try {
    if (!requireAgentStudioEnabled(res)) return;
    let db = await readDb();
    let index = (db.agentStudioRuns || []).findIndex((run) => (
      run.id === req.params.runId && run.workspaceId === req.params.workspaceId
    ));
    if (index < 0) {
      res.status(404).json({ error: 'agent_studio_run_not_found' });
      return;
    }
    if (db.agentStudioRuns[index].status !== 'needs_context') {
      res.status(409).json({ error: 'agent_studio_context_not_requested' });
      return;
    }
    uploaded = await uploadAgentStudioVideo(req);
    db = await readDb();
    index = (db.agentStudioRuns || []).findIndex((run) => (
      run.id === req.params.runId && run.workspaceId === req.params.workspaceId
    ));
    const run = index >= 0 ? db.agentStudioRuns[index] : null;
    if (!run || run.status !== 'needs_context') {
      await deleteGeminiFile({ fileName: uploaded.name, apiKey: GEMINI_API_KEY });
      res.status(409).json({ error: 'agent_studio_context_not_requested' });
      return;
    }
    const resumed = transitionAgentStudioRun(run, 'analyzing_video', {
      agent: 'Jeryk Manager',
      summary: 'The user uploaded the source video for automatic Gemini analysis.',
      now: new Date().toISOString(),
    });
    db.agentStudioRuns[index] = {
      ...resumed,
      sourceUpload: uploaded,
      contextRequest: null,
      error: null,
    };
    await writeDb(db);
    res.status(202).json({ run: toPublicAgentStudioRun(db.agentStudioRuns[index]) });
    scheduleAgentStudioRun(run.id);
  } catch (error) {
    if (uploaded?.name) await deleteGeminiFile({ fileName: uploaded.name, apiKey: GEMINI_API_KEY });
    if (error?.status) {
      res.status(error.status).json({ error: error.message, message: error.message });
      return;
    }
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/retry-source', expensiveLimiter, async (req, res, next) => {
  try {
    if (!requireAgentStudioEnabled(res)) return;
    const db = await readDb();
    const index = (db.agentStudioRuns || []).findIndex((run) => (
      run.id === req.params.runId && run.workspaceId === req.params.workspaceId
    ));
    if (index < 0) {
      res.status(404).json({ error: 'agent_studio_run_not_found' });
      return;
    }
    const run = db.agentStudioRuns[index];
    if (run.status !== 'needs_context') {
      res.status(409).json({ error: 'agent_studio_context_not_requested' });
      return;
    }
    const retried = transitionAgentStudioRun(run, 'analyzing_video', {
      agent: 'Jeryk Manager',
      summary: 'Retrying automatic source resolution through Apify and Gemini.',
      now: new Date().toISOString(),
    });
    db.agentStudioRuns[index] = {
      ...retried,
      contextRequest: null,
      error: null,
    };
    await writeDb(db);
    res.status(202).json({ run: toPublicAgentStudioRun(db.agentStudioRuns[index]) });
    scheduleAgentStudioRun(run.id);
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/cancel', async (req, res, next) => {
  try {
    const db = await readDb();
    const index = (db.agentStudioRuns || []).findIndex((run) => (
      run.id === req.params.runId && run.workspaceId === req.params.workspaceId
    ));
    if (index < 0) {
      res.status(404).json({ error: 'agent_studio_run_not_found' });
      return;
    }
    const run = db.agentStudioRuns[index];
    if (run.status === 'completed' || run.status === 'failed') {
      res.status(409).json({ error: 'agent_studio_run_terminal' });
      return;
    }
    const cancelled = cancelAgentStudioRun(run, {
      now: new Date().toISOString(),
      reason: 'The user cancelled this Agent Studio run.',
    });
    db.agentStudioRuns[index] = cancelled;
    await writeDb(db);
    res.json({ run: toPublicAgentStudioRun(cancelled) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/hybrid', expensiveLimiter, async (req, res, next) => {
  try {
    const candidateIds = [...new Set((Array.isArray(req.body?.candidateIds) ? req.body.candidateIds : [])
      .map((value) => String(value).trim())
      .filter(Boolean))];
    if (candidateIds.length !== 2) {
      res.status(400).json({ error: 'agent_studio_hybrid_candidates_required' });
      return;
    }
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    const index = (db.agentStudioRuns || []).findIndex((run) => (
      run.id === req.params.runId && run.workspaceId === workspace.id
    ));
    if (index < 0) {
      res.status(404).json({ error: 'agent_studio_run_not_found' });
      return;
    }
    const run = db.agentStudioRuns[index];
    if (run.status !== 'awaiting_approval') {
      res.status(409).json({ error: 'agent_studio_not_awaiting_approval' });
      return;
    }
    const candidates = [run.artifacts?.creative?.heroReel, ...(run.artifacts?.creative?.alternatives || [])].filter(Boolean);
    if (candidateIds.some((candidateId) => !candidates.some((candidate) => candidate.id === candidateId))) {
      res.status(400).json({ error: 'agent_studio_candidate_not_found' });
      return;
    }
    const now = new Date().toISOString();
    const hybridizing = transitionAgentStudioRun(run, 'producing', {
      agent: 'Jeryk Manager',
      summary: 'The user selected two creative directions for a hybrid production pass.',
      now,
    });
    db.agentStudioRuns[index] = {
      ...hybridizing,
      hybridRequest: { candidateIds, requestedAt: now },
      criticRevisionCount: 0,
      error: null,
    };
    await writeDb(db);
    res.status(202).json({ run: toPublicAgentStudioRun(db.agentStudioRuns[index]) });
    scheduleAgentStudioHybrid(run.id);
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/agent-studio/runs/:runId/approve', async (req, res, next) => {
  try {
    const candidateId = String(req.body?.candidateId || '').trim();
    const addToContentPlan = req.body?.addToContentPlan !== false;
    if (!candidateId) {
      res.status(400).json({ error: 'agent_studio_candidate_required' });
      return;
    }
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    const index = (db.agentStudioRuns || []).findIndex((run) => (
      run.id === req.params.runId && run.workspaceId === workspace.id
    ));
    if (index < 0) {
      res.status(404).json({ error: 'agent_studio_run_not_found' });
      return;
    }
    const run = db.agentStudioRuns[index];
    const hero = run.artifacts?.creative?.heroReel;
    const candidate = hero?.id === candidateId
      ? hero
      : (run.artifacts?.creative?.alternatives || []).find((item) => item.id === candidateId);
    if (!candidate) {
      res.status(400).json({ error: 'agent_studio_candidate_not_found' });
      return;
    }
    if (!isAgentStudioProductionReadyCandidate(candidate)) {
      res.status(409).json({ error: 'agent_studio_candidate_not_production_ready' });
      return;
    }
    let addedPosts = 0;
    let contentPlanWriteId = run.approval?.contentPlanWriteId || null;
    if (addToContentPlan) {
      const sourceKey = `agent-studio:${run.id}`;
      const existingPosts = normalizeContentPlanPosts(workspace.contentPlanPosts || []);
      // Keep the public demo repeatable: its newest approved package replaces older Agent Studio packages.
      const contentPlanBasePosts = String(workspace.id || '').startsWith('ws_demo_')
        ? existingPosts.filter((post) => !String(post.sourceKey || '').startsWith('agent-studio:'))
        : existingPosts;
      const generatedPosts = buildAgentStudioContentPlanPosts(run, candidateId);
      const uniquePosts = generatedPosts.filter((post) => !contentPlanBasePosts.some((existing) => (
        existing.sourceKey === sourceKey && existing.id === post.id
      )));
      const nextPosts = [...contentPlanBasePosts, ...uniquePosts];
      const billing = buildEntitlements(db, workspace.id, req.authUser);
      const limit = billing.plan.limits.contentPlanPosts;
      if (Number.isFinite(limit) && nextPosts.length > limit) {
        res.status(402).json({
          error: 'plan_limit_reached',
          usageKey: 'contentPlanPosts',
          limit,
          used: billing.usage.contentPlanPosts,
          requested: uniquePosts.length,
          remaining: billing.remaining.contentPlanPosts,
          plan: billing.plan,
          message: 'Content plan post limit reached for this plan.',
        });
        return;
      }
      workspace.contentPlanPosts = nextPosts;
      workspace.contentPlanUpdatedAt = new Date().toISOString();
      addedPosts = uniquePosts.length;
      contentPlanWriteId = `agent_studio_plan:${run.id}`;
    }
    let approved;
    try {
      approved = approveAgentStudioRun(run, {
        candidateId,
        contentPlanWriteId,
        now: new Date().toISOString(),
      });
    } catch (error) {
      if (error.message === 'agent_studio_already_approved') {
        res.status(409).json({ error: error.message });
        return;
      }
      if (error.message === 'agent_studio_not_awaiting_approval') {
        res.status(409).json({ error: error.message });
        return;
      }
      throw error;
    }
    if (approved === run && contentPlanWriteId && !approved.approval?.contentPlanWriteId) {
      approved = {
        ...approved,
        approval: {
          ...approved.approval,
          contentPlanWriteId,
        },
      };
    }
    db.agentStudioRuns[index] = approved;
    await writeDb(db);
    res.json({ run: toPublicAgentStudioRun(approved), addedPosts });
  } catch (error) {
    next(error);
  }
});

app.get('/api/workspaces/:workspaceId/checklists/:scope', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  workspace.checklists ||= {};
  const checklist = workspace.checklists[req.params.scope] || {
    scope: req.params.scope,
    parentStatus: 'В роботі',
    items: [],
    updatedAt: null,
  };
  res.json({ checklist });
});

app.put('/api/workspaces/:workspaceId/checklists/:scope', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const items = normalizeChecklistItems(req.body.items);
  const parentStatus = String(req.body.parentStatus || 'В роботі');
  const allChecked = items.length > 0 && items.every((item) => item.checked);
  if (isDoneStatus(parentStatus) && !allChecked) {
    res.status(409).json({
      error: 'checklist_incomplete',
      message: 'Parent status cannot be Done / Затверджено until every checklist item is checked.',
      allChecked,
    });
    return;
  }
  workspace.checklists ||= {};
  workspace.checklists[req.params.scope] = {
    scope: req.params.scope,
    parentStatus,
    items,
    allChecked,
    updatedAt: new Date().toISOString(),
  };
  await writeDb(db);
  res.json({ checklist: workspace.checklists[req.params.scope] });
});

app.get('/api/workspaces/:workspaceId/competitors', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const competitors = db.competitors.filter((item) => item.workspaceId === req.params.workspaceId);
  res.json({ competitors });
});

app.get('/api/workspaces/:workspaceId/sources', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const sources = db.sources.filter((item) => item.workspaceId === req.params.workspaceId);
  const instagramAccounts = db.instagramAccounts.filter((item) => item.workspaceId === req.params.workspaceId);
  res.json({ sources, instagramAccounts });
});

app.post('/api/workspaces/:workspaceId/sources', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const type = String(req.body.type || 'manual_competitor').trim();
  const label = String(req.body.label || req.body.handle || req.body.url || '').trim();
  if (!label) {
    res.status(400).json({ error: 'label_required' });
    return;
  }
  const source = {
    id: createId('src'),
    workspaceId: req.params.workspaceId,
    type,
    label,
    handle: req.body.handle || null,
    url: req.body.url || null,
    market: req.body.market || 'ua',
    status: 'active',
    createdAt: new Date().toISOString(),
    lastSyncAt: null,
  };
  db.sources.unshift(source);
  const job = createSyncJob(db, req.params.workspaceId, 'source_created', { sourceId: source.id, type });
  await writeDb(db);
  res.status(201).json({ source, syncJob: job });
});

app.post('/api/workspaces/:workspaceId/sources/:sourceId/sync', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const source = db.sources.find((item) => item.id === req.params.sourceId && item.workspaceId === req.params.workspaceId);
  if (!source) {
    res.status(404).json({ error: 'source_not_found' });
    return;
  }

  const job = createSyncJob(db, req.params.workspaceId, 'manual_source_sync', { sourceId: source.id });
  job.status = 'completed';
  job.startedAt = new Date().toISOString();
  job.finishedAt = new Date().toISOString();
  source.lastSyncAt = job.finishedAt;

  const importedReel = {
    id: createId('reel'),
    workspaceId: req.params.workspaceId,
    sourceId: source.id,
    sourceHandle: source.handle || source.label,
    market: source.market || 'global',
    title: req.body.title || `Signal from ${source.label}`,
    caption: req.body.caption || req.body.title || `Manual signal imported from ${source.label}`,
    transcript: req.body.transcript || '',
    views: Number(req.body.views || 0),
    likes: Number(req.body.likes || 0),
    comments: Number(req.body.comments || 0),
    shares: Number(req.body.shares || 0),
    saves: Number(req.body.saves || 0),
    hook: req.body.hook || req.body.title || '',
    status: ['imported', 'needs_analysis'],
    createdAt: new Date().toISOString(),
  };
  const analysis = analyzeReel(importedReel, workspace);
  importedReel.score = analysis.score;
  importedReel.analysis = analysis;
  importedReel.status = ['imported', analysis.qualityGate, analysis.recommendation];
  db.reels.unshift(importedReel);
  await writeDb(db);
  res.status(201).json({ syncJob: job, reel: importedReel, analysis });
});

app.post('/api/workspaces/:workspaceId/competitors', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  try {
    assertUsageAvailable(db, req.params.workspaceId, 'competitors', 1, req.authUser);
  } catch (err) {
    res.status(err.status || 402).json(err.payload || { error: err.message });
    return;
  }
  const handle = String(req.body.handle || '').trim();
  if (!handle || !handle.startsWith('@')) {
    res.status(400).json({ error: 'handle_required', message: 'Handle must start with @' });
    return;
  }
  const competitor = {
    id: createId('cmp'),
    workspaceId: req.params.workspaceId,
    handle,
    market: req.body.market || 'ua',
    niche: req.body.niche || 'manual source',
    score: Number(req.body.score || 0),
    status: 'queued_for_scan',
    createdAt: new Date().toISOString(),
  };
  db.competitors.unshift(competitor);
  const billing = buildEntitlements(db, req.params.workspaceId, req.authUser);
  await writeDb(db);
  res.status(201).json({ competitor, billing });
});

app.get('/api/workspaces/:workspaceId/reels', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const reels = getAccessibleWorkspaceSignals(db, req.params.workspaceId, req.authUser);
  const sharedBankReels = reels.filter((item) => item.sharedBank);
  res.json({
    reels,
    sharedBank: {
      enabled: sharedBankReels.length > 0,
      signalCount: sharedBankReels.length,
    },
  });
});

app.get('/api/workspaces/:workspaceId/signals/discovery', async (req, res) => {
  const accessDb = await readDb();
  if (!requireWorkspace(accessDb, req.params.workspaceId, res)) return;
  const sharedBankOnly = !canWorkspaceUsePaidDiscovery(accessDb, req.params.workspaceId, req.authUser);
  const payload = await withAutomaticDiscoveryStateLock(req.params.workspaceId, async (db) => {
    const now = new Date();
    const workspace = db.workspaces.find((item) => item.id === req.params.workspaceId);
    ensureWorkspaceDiscoverySettings(workspace, now);
    recoverAutomaticDiscoveryLeases(db, req.params.workspaceId, now);
    return buildDiscoveryStatusResponse(db, req.params.workspaceId, now);
  });
  res.json(sharedBankOnly ? buildSharedBankDiscoveryStatus(payload) : payload);
});

app.patch('/api/workspaces/:workspaceId/signals/discovery', async (req, res, next) => {
  try {
    const accessDb = await readDb();
    if (!requireWorkspace(accessDb, req.params.workspaceId, res)) return;
    assertWorkspaceCanUsePaidDiscovery(accessDb, req.params.workspaceId, req.authUser);
    const changes = parseDiscoverySettingsPatch(req.body || {});
    const payload = await withAutomaticDiscoveryStateLock(req.params.workspaceId, async (db) => {
      const workspace = db.workspaces.find((item) => item.id === req.params.workspaceId);
      const now = new Date();
      const policy = getWorkspaceTesterDiscoveryPolicy(db, req.params.workspaceId, req.authUser);
      if (policy && Object.prototype.hasOwnProperty.call(changes, 'dailyBudgetUsd')) {
        changes.dailyBudgetUsd = Math.min(changes.dailyBudgetUsd, policy.dailyBudgetUsd);
      }
      workspace.discoverySettings = createPersistedDiscoverySettings(workspace, changes, now);
      return buildDiscoveryStatusResponse(db, req.params.workspaceId, now);
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/signals/discovery/run', async (req, res, next) => {
  try {
    const accessDb = await readDb();
    if (!requireWorkspace(accessDb, req.params.workspaceId, res)) return;
    assertWorkspaceCanUsePaidDiscovery(accessDb, req.params.workspaceId, req.authUser);

    const result = await runAutomaticDiscoveryForWorkspace(req.params.workspaceId, {
      force: true,
      actorUser: req.authUser,
    });
    if (!result.run) {
      if (result.reason === 'daily_run_limit') {
        res.status(429).json({
          error: 'automatic_daily_run_limit_reached',
          message: "Today's Tester Pro signal run has already been used. New signals will be available after the next UTC day starts.",
        });
        return;
      }
      const refreshed = buildDiscoveryStatusResponse(await readDb(), req.params.workspaceId, new Date());
      res.status(409).json({
        error: 'automatic_discovery_running',
        message: 'Automatic discovery is already running for this workspace.',
        run: refreshed.status.activeRun,
      });
      return;
    }

    if (result.run.status === 'blocked_budget') {
      res.status(429).json({
        error: 'automatic_budget_reached',
        message: 'Automatic discovery metadata budget is exhausted for this UTC day.',
        run: sanitizeDiscoveryRun(result.run),
      });
      return;
    }

    res.status(201).json({
      run: sanitizeDiscoveryRun(result.run),
      acceptedSignals: result.acceptedSignals.length,
      updatedSignals: result.updatedSignals.length,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/reels/youtube/popular', async (req, res, next) => {
  try {
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    const beforeProviderAttempt = createPaidAiAttemptGuard({
      db,
      workspaceId: req.params.workspaceId,
      actorUser: req.authUser,
    });
    const requestedMaxResults = Math.min(Math.max(Number(req.body.maxResults || 24), 1), 24);
    const entitlements = buildEntitlements(db, req.params.workspaceId, req.authUser);
    const maxResults = getAllowedBatchSize({
      requested: requestedMaxResults,
      limit: entitlements.plan.limits.reelImports,
      used: entitlements.usage.reelImports,
      unlimited: entitlements.unlimited,
      perRequestLimit: entitlements.plan.id === 'tester_pro' ? 5 : undefined,
    });
    try {
      assertUsageAvailable(db, req.params.workspaceId, 'reelImports', Math.max(1, maxResults), req.authUser);
    } catch (err) {
      res.status(err.status || 402).json(err.payload || { error: err.message });
      return;
    }

    const baseMetadataItems = await fetchYouTubePopularMetadata({
      regionCode: req.body.regionCode,
      categoryId: req.body.categoryId,
      maxResults,
    });
    const metadataItems = await Promise.all(baseMetadataItems.map((metadata) => enrichVideoIntelligenceSafe(metadata, {
      beforeProviderAttempt,
    })));
    const existingByStableKey = getExistingReelByStableKey(db, req.params.workspaceId);
    const existingByVideoId = new Map();
    for (const reel of db.reels.filter((item) => item.workspaceId === req.params.workspaceId)) {
      const videoId = reel.importedMetadata?.youtube?.videoId || parseYouTubeInput(reel.sourceUrl)?.videoId;
      if (videoId && !existingByVideoId.has(videoId)) existingByVideoId.set(videoId, reel);
    }
    const importedReels = [];
    const returnedReels = [];
    for (const metadata of metadataItems) {
      const videoId = metadata.youtube?.videoId;
      const metadataStableKeys = getReelStableKeys({
        sourceUrl: metadata.url,
        importedMetadata: metadata,
      });
      const existingReel = (videoId && existingByVideoId.get(videoId))
        || metadataStableKeys.map((key) => existingByStableKey.get(key)).find(Boolean);
      if (existingReel) {
        const sourceLabel = metadata.source?.label || existingReel.scanLabel || existingReel.sourceType || 'YouTube';
        const status = Array.isArray(existingReel.status) ? existingReel.status : [];
        Object.assign(existingReel, {
          sourceUrl: existingReel.sourceUrl || metadata.url,
          sourceStatus: existingReel.sourceStatus || metadata.sourceStatus,
          scanLabel: existingReel.scanLabel || sourceLabel,
          sourceType: existingReel.sourceType || sourceLabel,
          sourceHandle: existingReel.sourceHandle || metadata.handle,
          handle: existingReel.handle || metadata.handle || existingReel.sourceHandle || '@youtube',
          image: existingReel.image || metadata.image || '',
          transcript: existingReel.transcript || metadata.transcriptText || metadata.videoIntelligence?.transcript?.text || '',
          views: existingReel.views || metadata.stats?.views || 0,
          likes: existingReel.likes || metadata.stats?.likes || 0,
          comments: existingReel.comments || metadata.stats?.comments || 0,
          status: Array.from(new Set([...status, 'YouTube', 'Популярне'])),
          importedMetadata: {
            ...(existingReel.importedMetadata || {}),
            ...metadata,
            youtube: metadata.youtube || existingReel.importedMetadata?.youtube,
            source: metadata.source || existingReel.importedMetadata?.source || { label: sourceLabel, tone: 'shorts' },
            url: metadata.url || existingReel.importedMetadata?.url || existingReel.sourceUrl,
            image: metadata.image || existingReel.importedMetadata?.image || existingReel.image || '',
            videoIntelligence: metadata.videoIntelligence || existingReel.importedMetadata?.videoIntelligence || null,
            transcriptText: metadata.transcriptText || existingReel.importedMetadata?.transcriptText || existingReel.transcript || '',
          },
        });
        returnedReels.push(existingReel);
        for (const key of getReelStableKeys(existingReel)) existingByStableKey.set(key, existingReel);
        continue;
      }
      const globalInsight = buildGlobalInsightFromReelMetadata(metadata);
      const sourceLabel = metadata.source?.label || 'YouTube';
      const tagSeed = metadata.youtube?.channelTitle || metadata.handle || sourceLabel;
      const importedReel = {
        id: createId('reel'),
        workspaceId: req.params.workspaceId,
        sourceId: null,
        sourceHandle: metadata.handle,
        handle: metadata.handle,
        sourceUrl: metadata.url,
        sourceStatus: metadata.sourceStatus,
        scanLabel: sourceLabel,
        market: req.body.market || (normalizeYouTubeRegionCode(req.body.regionCode) === 'UA' ? 'ua' : 'global'),
        title: metadata.title || 'YouTube signal',
        caption: metadata.description || '',
        transcript: metadata.transcriptText || metadata.videoIntelligence?.transcript?.text || '',
        image: metadata.image || '',
        views: metadata.stats?.views || 0,
        likes: metadata.stats?.likes || 0,
        comments: metadata.stats?.comments || 0,
        shares: 0,
        saves: 0,
        hook: globalInsight.hook || metadata.title || 'YouTube signal',
        status: ['YouTube', 'Популярне', 'Готово'],
        tag: (String(tagSeed).replace(/^@/, '').replace(/^https?:\/\/(www\.)?/, '')[0] || 'Y').toUpperCase(),
        importedMetadata: metadata,
        createdAt: new Date().toISOString(),
      };
      const analysis = analyzeReel(importedReel, workspace);
      importedReel.score = Math.max(analysis.score, 76);
      importedReel.analysis = analysis;
      importedReels.push(importedReel);
      returnedReels.push(importedReel);
      if (videoId) existingByVideoId.set(videoId, importedReel);
      for (const key of getReelStableKeys(importedReel)) existingByStableKey.set(key, importedReel);
    }

    db.reels.unshift(...importedReels);
    if (importedReels.length) {
      createSyncJob(db, req.params.workspaceId, 'youtube_popular_imported', {
        count: importedReels.length,
        regionCode: normalizeYouTubeRegionCode(req.body.regionCode),
        categoryId: normalizeYouTubeCategoryId(req.body.categoryId),
      });
      incrementUsage(db, req.params.workspaceId, USAGE_METRICS.reelImports, importedReels.length);
    }
    const billing = buildEntitlements(db, req.params.workspaceId, req.authUser);
    await writeDb(db);
    res.status(201).json({
      reels: returnedReels,
      importedCount: importedReels.length,
      reusedCount: returnedReels.length - importedReels.length,
      skipped: metadataItems.length - returnedReels.length,
      billing,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/signals/apify/import', async (req, res, next) => {
  try {
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    assertWorkspaceCanUsePaidDiscovery(db, req.params.workspaceId, req.authUser);
    if (!APIFY_TOKEN) {
      res.status(501).json({
        error: 'apify_not_configured',
        message: 'Set APIFY_TOKEN in .env before importing Instagram or TikTok signals.',
      });
      return;
    }

    const platform = String(req.body.platform || '').toLowerCase();
    const inputType = String(req.body.inputType || 'search').toLowerCase();
    const inputValue = String(req.body.inputValue || '').trim();
    const requestedLimit = Math.min(Math.max(Number(req.body.limit || 5), 1), 30);
    if (!['instagram', 'tiktok'].includes(platform) || !inputValue) {
      res.status(400).json({
        error: 'unsupported_apify_import',
        message: 'Choose Instagram or TikTok and provide an input value.',
      });
      return;
    }

    const entitlements = buildEntitlements(db, req.params.workspaceId, req.authUser);
    const maxResults = getAllowedBatchSize({
      requested: requestedLimit,
      limit: entitlements.plan.limits.reelImports,
      used: entitlements.usage.reelImports,
      unlimited: entitlements.unlimited,
      perRequestLimit: entitlements.plan.id === 'tester_pro' ? 5 : undefined,
    });
    if (maxResults <= 0) {
      res.status(402).json({
        error: 'usage_limit_reached',
        metric: 'reelImports',
        limit: entitlements.plan.limits.reelImports,
        used: entitlements.usage.reelImports,
      });
      return;
    }

    const mappedReels = await fetchApifySignals({
      token: APIFY_TOKEN,
      platform,
      inputType,
      inputValue,
      limit: maxResults,
      downloadVideo: Boolean(req.body.downloadVideo),
      workspaceId: req.params.workspaceId,
      market: req.body.market || 'global',
      createId,
    });

    const existingByKey = getExistingReelByApifyKey(db, req.params.workspaceId);
    const existingByStableKey = getExistingReelByStableKey(db, req.params.workspaceId);
    const importedReels = [];
    const returnedReels = [];
    for (const reel of mappedReels) {
      const key = getApifySignalKey(reel.importedMetadata || {});
      const stableKeys = getReelStableKeys(reel);
      const existing = (key && existingByKey.get(key))
        || stableKeys.map((stableKey) => existingByStableKey.get(stableKey)).find(Boolean);
      if (existing) {
        existing.importedMetadata = {
          ...(existing.importedMetadata || {}),
          ...(reel.importedMetadata || {}),
          apify: reel.importedMetadata?.apify || existing.importedMetadata?.apify,
        };
        existing.videoUrl = existing.videoUrl || reel.videoUrl || '';
        existing.image = existing.image || reel.image || '';
        existing.views = reel.views || existing.views;
        existing.likes = reel.likes || existing.likes;
        existing.comments = reel.comments || existing.comments;
        existing.shares = reel.shares || existing.shares || 0;
        existing.saves = reel.saves || existing.saves || 0;
        existing.updatedAt = new Date().toISOString();
        returnedReels.push(existing);
        if (key) existingByKey.set(key, existing);
        for (const stableKey of getReelStableKeys(existing)) existingByStableKey.set(stableKey, existing);
        continue;
      }
      const analysis = analyzeReel(reel, workspace);
      reel.score = Math.max(reel.score || 0, analysis.score);
      reel.analysis = analysis;
      importedReels.push(reel);
      returnedReels.push(reel);
      if (key) existingByKey.set(key, reel);
      for (const stableKey of getReelStableKeys(reel)) existingByStableKey.set(stableKey, reel);
    }

    db.reels.unshift(...importedReels);
    if (importedReels.length) {
      createSyncJob(db, req.params.workspaceId, 'apify_signals_imported', {
        platform,
        inputType,
        inputValue,
        importedCount: importedReels.length,
      });
      incrementUsage(db, req.params.workspaceId, USAGE_METRICS.reelImports, importedReels.length);
    }
    const billing = buildEntitlements(db, req.params.workspaceId, req.authUser);
    await writeDb(db);
    res.status(201).json({
      reels: returnedReels,
      importedCount: importedReels.length,
      reusedCount: returnedReels.length - importedReels.length,
      billing,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/workspaces/:workspaceId/reels/import-url', async (req, res, next) => {
  try {
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    const beforeProviderAttempt = createSerializedPaidAiAttemptGuard({
      workspaceId: req.params.workspaceId,
      actorUser: req.authUser,
    });
    try {
      assertUsageAvailable(db, req.params.workspaceId, 'reelImports', 1, req.authUser);
    } catch (err) {
      res.status(err.status || 402).json(err.payload || { error: err.message });
      return;
    }

    const url = parseAllowedSignalUrl(req.body.url);
    if (!url) {
      res.status(400).json({
        error: 'supported_signal_url_required',
        message: 'Paste a valid public Instagram, TikTok, or YouTube URL.',
      });
      return;
    }

    const metadata = await fetchPublicSourceMetadata(url, { beforeProviderAttempt });
    const globalInsight = buildGlobalInsightFromReelMetadata(metadata);
    const mergedBrief = mergeBusinessBriefWithBrandBrain(
      workspace.brief || {},
      req.body.businessBrief || {},
    );

    const remixResult = await generateRemix(globalInsight, mergedBrief, { beforeProviderAttempt });
    const sourceLabel = metadata.source?.label || 'URL import';
    const tagSeed = metadata.youtube?.channelTitle || metadata.handle || sourceLabel;
    const importedReel = {
      id: createId('reel'),
      workspaceId: req.params.workspaceId,
      sourceId: null,
      sourceHandle: metadata.handle,
      handle: metadata.handle,
      sourceUrl: metadata.url || url,
      sourceStatus: metadata.sourceStatus,
      scanLabel: sourceLabel,
      market: req.body.market || 'global',
      title: metadata.title,
      caption: metadata.description,
      transcript: metadata.transcriptText || metadata.videoIntelligence?.transcript?.text || '',
      image: metadata.image || '',
      views: metadata.stats?.views || 0,
      likes: metadata.stats?.likes || 0,
      comments: metadata.stats?.comments || 0,
      shares: 0,
      saves: 0,
      hook: globalInsight.hook,
      status: [sourceLabel, 'Контекст готовий', 'UA-адаптація'],
      tag: (String(tagSeed).replace(/^@/, '').replace(/^https?:\/\/(www\.)?/, '')[0] || 'R').toUpperCase(),
      remixResult,
      importedMetadata: metadata,
      createdAt: new Date().toISOString(),
    };
    const analysis = analyzeReel(importedReel, workspace);
    importedReel.score = Math.max(analysis.score, ['public_metadata', 'youtube_api', 'youtube_oembed'].includes(metadata.sourceStatus) ? 78 : 70);
    importedReel.analysis = analysis;
    const persisted = await serializeBackgroundMutation(async () => {
      const currentDb = await readDb();
      const current = assertCurrentWorkspaceAccess(currentDb, req.params.workspaceId, req.authUser);
      const existingByStableKey = getExistingReelByStableKey(currentDb, req.params.workspaceId);
      const existingReel = getReelStableKeys(importedReel)
        .map((key) => existingByStableKey.get(key))
        .find(Boolean);
      if (!existingReel) {
        assertUsageAvailable(currentDb, req.params.workspaceId, 'reelImports', 1, current.actorUser);
      }
      const returnedReel = existingReel
        ? Object.assign(existingReel, mergeDuplicateReelForDisplay(existingReel, importedReel), {
          updatedAt: new Date().toISOString(),
        })
        : importedReel;
      if (!existingReel) currentDb.reels.unshift(importedReel);
      currentDb.remixes.unshift({
        id: createId('remix'),
        workspaceId: req.params.workspaceId,
        reelId: returnedReel.id,
        sourceUrl: metadata.url || url,
        provider: getAiProviderStatus().textAgent.provider,
        result: remixResult,
        createdAt: new Date().toISOString(),
      });
      createSyncJob(currentDb, req.params.workspaceId, 'url_reel_imported', {
        reelId: returnedReel.id,
        sourceStatus: metadata.sourceStatus,
        reused: Boolean(existingReel),
      });
      if (!existingReel) incrementUsage(currentDb, req.params.workspaceId, USAGE_METRICS.reelImports);
      const billing = buildEntitlements(currentDb, req.params.workspaceId, current.actorUser);
      await writeDb(currentDb);
      return { billing, existingReel, returnedReel };
    });
    res.status(201).json({
      reel: persisted.returnedReel,
      analysis,
      remix: remixResult,
      metadata,
      importedCount: persisted.existingReel ? 0 : 1,
      reusedCount: persisted.existingReel ? 1 : 0,
      billing: persisted.billing,
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/workspaces/:workspaceId/reels/:reelId/analyze', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const reel = db.reels.find((item) => item.id === req.params.reelId && item.workspaceId === req.params.workspaceId);
  if (!reel) {
    res.status(404).json({ error: 'reel_not_found' });
    return;
  }
  const analysis = analyzeReel({ ...reel, ...req.body }, workspace);
  reel.analysis = analysis;
  reel.score = analysis.score;
  reel.status = Array.from(new Set([...(reel.status || []), analysis.qualityGate, analysis.recommendation]));
  reel.updatedAt = new Date().toISOString();
  createSyncJob(db, req.params.workspaceId, 'analyze_content', { reelId: reel.id, score: analysis.score });
  await writeDb(db);
  res.json({ reel, analysis });
});

app.post('/api/workspaces/:workspaceId/reels/:reelId/analyze-ai', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const beforeProviderAttempt = createPaidAiAttemptGuard({
    db,
    workspaceId: req.params.workspaceId,
    actorUser: req.authUser,
  });
  const reel = db.reels.find((item) => item.id === req.params.reelId && item.workspaceId === req.params.workspaceId);
  if (!reel) {
    res.status(404).json({ error: 'reel_not_found' });
    return;
  }
  if (reel.importedMetadata?.youtube?.videoId) {
    const refreshedMetadata = await enrichVideoIntelligenceSafe(reel.importedMetadata, { beforeProviderAttempt });
    reel.importedMetadata = {
      ...reel.importedMetadata,
      ...refreshedMetadata,
    };
    reel.transcript = reel.transcript || refreshedMetadata.transcriptText || refreshedMetadata.videoIntelligence?.transcript?.text || '';
    reel.image = reel.image || refreshedMetadata.image || refreshedMetadata.youtube?.thumbnailUrl || '';
  }
  const analysis = buildAgentReelAnalysis({ ...reel, ...req.body }, workspace);
  const job = {
    id: createId('ai_job'),
    workspaceId: req.params.workspaceId,
    type: 'reel_agent_analysis',
    status: 'completed',
    provider: getAiProviderStatus().textAgent.provider,
    sourceType: 'reel',
    sourceId: reel.id,
    result: analysis,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  reel.aiAnalysis = analysis;
  reel.status = Array.from(new Set([...(reel.status || []), 'ai_analyzed', analysis.recommendation]));
  db.aiJobs.unshift(job);
  createSyncJob(db, req.params.workspaceId, 'ai_reel_analysis', { reelId: reel.id, provider: job.provider });
  await writeDb(db);
  res.status(201).json({ aiJob: job, reel, analysis });
});

app.post('/api/workspaces/:workspaceId/reels/:reelId/generate-ideas', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const reel = db.reels.find((item) => item.id === req.params.reelId && item.workspaceId === req.params.workspaceId);
  if (!reel) {
    res.status(404).json({ error: 'reel_not_found' });
    return;
  }
  const analysis = reel.analysis || analyzeReel(reel, workspace);
  const generatedIdeas = generateIdeasFromReel(reel, analysis, workspace).map((idea) => ({
    id: createId('idea'),
    workspaceId: req.params.workspaceId,
    source: reel.id,
    sourceContentId: reel.id,
    market: reel.market || 'global',
    createdAt: new Date().toISOString(),
    ...idea,
  }));
  db.ideas.unshift(...generatedIdeas);
  createSyncJob(db, req.params.workspaceId, 'generate_ideas', {
    reelId: reel.id,
    ideasCreated: generatedIdeas.length,
  });
  await writeDb(db);
  res.status(201).json({ ideas: generatedIdeas, analysis });
});

app.get('/api/workspaces/:workspaceId/ideas', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const ideas = db.ideas.filter((item) => item.workspaceId === req.params.workspaceId);
  res.json({ ideas });
});

app.post('/api/workspaces/:workspaceId/ideas', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const title = String(req.body.title || '').trim();
  if (!title) {
    res.status(400).json({ error: 'title_required' });
    return;
  }
  const idea = {
    id: createId('idea'),
    workspaceId: req.params.workspaceId,
    title,
    source: req.body.source || 'manual',
    hook: req.body.hook || title,
    score: Number(req.body.score || 70),
    status: req.body.status || 'draft',
    createdAt: new Date().toISOString(),
  };
  db.ideas.unshift(idea);
  await writeDb(db);
  res.status(201).json({ idea });
});

app.post('/api/workspaces/:workspaceId/ideas/:ideaId/generate-script', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const idea = db.ideas.find((item) => item.id === req.params.ideaId && item.workspaceId === req.params.workspaceId);
  if (!idea) {
    res.status(404).json({ error: 'idea_not_found' });
    return;
  }
  const script = buildScriptFromIdea({ ...idea, ...req.body }, workspace);
  const job = {
    id: createId('ai_job'),
    workspaceId: req.params.workspaceId,
    type: 'script_generation',
    status: 'completed',
    provider: getAiProviderStatus().textAgent.provider,
    sourceType: 'idea',
    sourceId: idea.id,
    result: script,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  idea.script = script;
  idea.status = 'script_ready';
  idea.updatedAt = new Date().toISOString();
  db.aiJobs.unshift(job);
  createSyncJob(db, req.params.workspaceId, 'generate_script', { ideaId: idea.id, provider: job.provider });
  await writeDb(db);
  res.status(201).json({ aiJob: job, idea, script });
});

app.get('/api/workspaces/:workspaceId/ai/status', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const aiJobs = db.aiJobs.filter((job) => job.workspaceId === req.params.workspaceId);
  const videoJobs = db.videoJobs.filter((job) => job.workspaceId === req.params.workspaceId);
  res.json({
    providers: getAiProviderStatus(),
    counts: {
      aiJobs: aiJobs.length,
      videoJobs: videoJobs.length,
      completedAiJobs: aiJobs.filter((job) => job.status === 'completed').length,
      queuedVideoJobs: videoJobs.filter((job) => job.status === 'queued').length,
    },
    latestAiJobs: aiJobs.slice(0, 5),
    latestVideoJobs: videoJobs.slice(0, 5),
  });
});

app.get('/api/workspaces/:workspaceId/agent/context', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const brief = workspace.brief || {};
  const complete = isBrandContextComplete(brief);
  res.json({
    workspaceId: workspace.id,
    complete,
    brief,
    brandBrain: normalizeBrandBrain(projectBrandBrainCompatibility(brief)),
    draft: complete ? null : normalizeBrandBrainDraft(workspace.brandBrainDraft),
    recommendation: brief.recommendation || null,
    providers: getAiProviderStatus(),
    memory: db.aiMemory.filter((item) => item.workspaceId === req.params.workspaceId).slice(0, 20),
  });
});

app.put('/api/workspaces/:workspaceId/agent/context/draft', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  if (isBrandContextComplete(workspace.brief || {})) {
    res.status(409).json({ error: 'brand_brain_already_complete' });
    return;
  }
  workspace.brandBrainDraft = {
    ...normalizeBrandBrainDraft(req.body),
    updatedAt: new Date().toISOString(),
  };
  await writeDb(db);
  res.json({ complete: false, draft: workspace.brandBrainDraft });
});

app.post('/api/workspaces/:workspaceId/agent/context/finalize', async (req, res, next) => {
  try {
    const requestedAnswers = normalizeBrandAnswers(req.body?.answers);
    const missingFields = getMissingBrandAnswers(requestedAnswers);
    if (missingFields.length) {
      res.status(422).json({ error: 'brand_brain_required_fields_missing', missingFields });
      return;
    }
    const fingerprint = buildBrandAnswerFingerprint(requestedAnswers);
    const initialDb = await readDb();
    const initialWorkspace = requireWorkspace(initialDb, req.params.workspaceId, res);
    if (!initialWorkspace) return;
    const flightKey = `${req.params.workspaceId}:${fingerprint}`;
    await runBrandBrainFinalizeSingleFlight(flightKey, async () => {
      const reservation = await reserveBrandBrainFinalizeIntent({
        workspaceId: req.params.workspaceId,
        fingerprint,
        actorUser: req.authUser,
      });
      if (reservation.persisted) return reservation.persisted;
      const {
        token,
        accessibleSignals,
        mandatoryOnboarding,
        onboardingProviderBlocked: initiallyBlockedProvider,
      } = reservation;
      try {
        let instagramMetadata = {};
        if (requestedAnswers.instagramUrl) {
          try {
            instagramMetadata = await Promise.race([
              fetchPublicSourceMetadata(requestedAnswers.instagramUrl),
              new Promise((resolve) => setTimeout(() => resolve({}), 2500)),
            ]);
          } catch {
            instagramMetadata = {};
          }
        }
        const beforeProviderAttempt = createSerializedPaidAiAttemptGuard({
          workspaceId: req.params.workspaceId,
          actorUser: req.authUser,
        });
        let onboardingProviderBlocked = Boolean(initiallyBlockedProvider);
        const generateBrandBrainText = async (prompt, options) => {
          if (mandatoryOnboarding && onboardingProviderBlocked) return '';
          try {
            return await generateGeminiJsonText(prompt, options);
          } catch (error) {
            if (!mandatoryOnboarding || !error?.providerAttemptBlocked || !isBrandBrainUsageBlock(error)) {
              throw error;
            }
            onboardingProviderBlocked = true;
            return '';
          }
        };
        const deriveClient = GEMINI_API_KEY
          ? (prompt) => generateBrandBrainText(prompt, {
              maxOutputTokens: 1600,
              temperature: 0.2,
              operation: 'brand_brain_derive_v2',
              beforeProviderAttempt,
            })
          : null;
        const rerankClient = GEMINI_API_KEY
          ? (prompt) => generateBrandBrainText(prompt, {
              maxOutputTokens: 500,
              temperature: 0.1,
              operation: 'brand_signal_rerank',
              beforeProviderAttempt,
            })
          : null;
        const finalized = await finalizeBrandBrainV2({
          answers: requestedAnswers,
          signals: accessibleSignals,
          instagramMetadata,
          deriveClient,
          rerankClient,
        });
        if (!finalized.ok) {
          throw createBrandBrainFinalizeError('brand_brain_required_fields_missing', 422);
        }
        return persistBrandBrainFinalizeResult({
          workspaceId: req.params.workspaceId,
          fingerprint,
          token,
          actorUser: req.authUser,
          finalized,
        });
      } finally {
        await clearBrandBrainFinalizeIntent({
          workspaceId: req.params.workspaceId,
          token,
        });
      }
    });

    const responseDb = await readDb();
    const current = assertCurrentWorkspaceAccess(
      responseDb,
      req.params.workspaceId,
      req.authUser,
    );
    const accessibleSignals = getAccessibleWorkspaceSignals(
      responseDb,
      req.params.workspaceId,
      current.actorUser,
    );
    const payload = buildPersistedBrandBrainFinalizePayload(
      current.workspace,
      accessibleSignals,
      fingerprint,
    );
    if (!payload) throw createBrandBrainFinalizeError('brand_brain_finalize_superseded');
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.put('/api/workspaces/:workspaceId/agent/context', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  if (Number(workspace.brief?.schemaVersion) === 2) {
    res.status(409).json({ error: 'brand_brain_v2_finalize_required' });
    return;
  }
  const { nextBrief, missingFields } = prepareBrandBrainWrite(workspace.brief, req.body);
  if (missingFields.length) {
    res.status(422).json({ error: 'brand_brain_required_fields_missing', missingFields });
    return;
  }
  const shouldChargeSave = shouldChargeBrandBrainSave({
    existingBrief: workspace.brief || {},
    nextBrief,
  });
  if (shouldChargeSave) {
    assertUsageAvailable(db, req.params.workspaceId, 'brandBrainSaves', 1, req.authUser);
  }
  workspace.brief = {
    ...nextBrief,
    updatedAt: new Date().toISOString(),
  };
  const memory = {
    id: createId('mem'),
    workspaceId: req.params.workspaceId,
    type: 'brand_context_update',
    value: nextBrief,
    createdAt: new Date().toISOString(),
  };
  db.aiMemory.unshift(memory);
  if (shouldChargeSave) {
    incrementUsage(db, req.params.workspaceId, USAGE_METRICS.brandBrainSaves);
  }
  await writeDb(db);
  res.json({
    brief: workspace.brief,
    brandBrain: normalizeBrandBrain(workspace.brief || {}),
    memory,
    billing: buildEntitlements(db, req.params.workspaceId, req.authUser),
  });
});

app.post('/api/workspaces/:workspaceId/agent/chat', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const message = String(req.body.message || '').trim();
  if (!message) {
    res.status(400).json({ error: 'message_required' });
    return;
  }
  if (message.length > 4000) {
    res.status(413).json({ error: 'message_too_large', message: 'Agent message is too long.' });
    return;
  }
  let billing;
  try {
    billing = assertUsageAvailable(db, req.params.workspaceId, 'aiOperations', 1, req.authUser);
  } catch (err) {
    res.status(err.status || 402).json(err.payload || { error: err.message });
    return;
  }
  const history = Array.isArray(req.body.history) ? req.body.history.slice(-20) : [];
  const snapshot = {
    reels: db.reels.filter((item) => item.workspaceId === req.params.workspaceId),
    ideas: db.ideas.filter((item) => item.workspaceId === req.params.workspaceId),
    sources: db.sources.filter((item) => item.workspaceId === req.params.workspaceId),
  };
  const beforeProviderAttempt = createSerializedPaidAiAttemptGuard({
    workspaceId: req.params.workspaceId,
    actorUser: req.authUser,
  });

  try {
    const result = await generateAgentReply({ message, history, workspace, snapshot, beforeProviderAttempt });
    const persisted = await serializeBackgroundMutation(async () => {
      const currentDb = await readDb();
      const current = assertCurrentWorkspaceAccess(currentDb, req.params.workspaceId, req.authUser);
      const job = {
        id: createId('ai_job'),
        workspaceId: req.params.workspaceId,
        type: 'agent_chat',
        status: 'completed',
        provider: result.provider,
        model: result.model,
        sourceType: 'chat',
        sourceId: null,
        result: { text: result.text },
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      currentDb.aiJobs.unshift(job);
      currentDb.aiMemory.unshift({
        id: createId('mem'),
        workspaceId: req.params.workspaceId,
        type: 'agent_exchange',
        value: {
          user: message,
          assistant: result.text,
          provider: result.provider,
          model: result.model,
        },
        createdAt: new Date().toISOString(),
      });
      incrementUsage(currentDb, req.params.workspaceId, USAGE_METRICS.agentChat);
      const currentBilling = buildEntitlements(currentDb, req.params.workspaceId, current.actorUser);
      await writeDb(currentDb);
      return { billing: currentBilling, job };
    });
    billing = persisted.billing;
    res.status(201).json({
      reply: result.text,
      provider: result.provider,
      model: result.model,
      aiJob: persisted.job,
      billing,
    });
  } catch (err) {
    console.error('[AgentChat]', err);
    if (err.status && err.payload) {
      res.status(err.status).json(err.payload);
      return;
    }
    res.status(502).json({
      error: 'agent_provider_failed',
      message: IS_PRODUCTION ? 'AI provider request failed. Please try again.' : err.message,
      provider: 'gemini',
    });
  }
});

app.post('/api/workspaces/:workspaceId/agent/actions', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;

  const action = String(req.body.action || '').trim();
  const text = String(req.body.text || '').trim();
  if (!text) {
    res.status(400).json({ error: 'text_required' });
    return;
  }

  const allowedActions = new Set(['save_idea', 'generate_script', 'create_video_job']);
  if (!allowedActions.has(action)) {
    res.status(400).json({ error: 'unknown_agent_action' });
    return;
  }

  const title = String(req.body.title || '')
    .trim()
    || text
      .split('\n')
      .map((line) => line.replace(/^[#*\s0-9.)-]+/, '').trim())
      .find(Boolean)
    || 'AI assistant idea';

  const idea = {
    id: createId('idea'),
    workspaceId: req.params.workspaceId,
    title: title.slice(0, 140),
    source: 'assistant',
    hook: text.slice(0, 700),
    score: Number(req.body.score || 82),
    status: action === 'save_idea' ? 'assistant_draft' : 'script_ready',
    createdAt: new Date().toISOString(),
  };

  db.ideas.unshift(idea);

  let script = null;
  let aiJob = null;
  let videoJob = null;

  if (action === 'generate_script' || action === 'create_video_job') {
    script = buildScriptFromIdea(idea, workspace);
    idea.script = script;
    idea.status = 'script_ready';
    idea.updatedAt = new Date().toISOString();

    aiJob = {
      id: createId('ai_job'),
      workspaceId: req.params.workspaceId,
      type: 'script_generation',
      status: 'completed',
      provider: getAiProviderStatus().textAgent.provider,
      sourceType: 'assistant',
      sourceId: idea.id,
      result: script,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    db.aiJobs.unshift(aiJob);
  }

  if (action === 'create_video_job') {
    videoJob = {
      id: createId('video_job'),
      workspaceId: req.params.workspaceId,
      sourceType: 'idea',
      sourceId: idea.id,
      status: getAiProviderStatus().videoGeneration.configured ? 'queued' : 'configuration_required',
      provider: process.env.VIDEO_PROVIDER || 'not_configured',
      prompt: {
        title: script.title,
        format: script.format || '15-25 sec Reels',
        scenes: script.scenes || [],
        caption: script.caption || '',
        cta: script.cta || '',
      },
      humanApprovalRequired: true,
      createdAt: new Date().toISOString(),
    };
    db.videoJobs.unshift(videoJob);
  }

  db.aiMemory.unshift({
    id: createId('mem'),
    workspaceId: req.params.workspaceId,
    type: 'agent_action',
    value: {
      action,
      ideaId: idea.id,
      aiJobId: aiJob?.id || null,
      videoJobId: videoJob?.id || null,
    },
    createdAt: new Date().toISOString(),
  });

  createSyncJob(db, req.params.workspaceId, 'agent_action', {
    action,
    ideaId: idea.id,
    videoJobId: videoJob?.id || null,
  });

  await writeDb(db);
  res.status(201).json({ action, idea, script, aiJob, videoJob });
});

app.get('/api/workspaces/:workspaceId/video-jobs', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const videoJobs = db.videoJobs.filter((job) => job.workspaceId === req.params.workspaceId);
  res.json({ videoJobs });
});

app.post('/api/workspaces/:workspaceId/video-jobs', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  const idea = req.body.ideaId
    ? db.ideas.find((item) => item.id === req.body.ideaId && item.workspaceId === req.params.workspaceId)
    : null;
  const script = req.body.script || idea?.script || buildScriptFromIdea(idea || req.body, workspace);
  const videoJob = {
    id: createId('video_job'),
    workspaceId: req.params.workspaceId,
    sourceType: idea ? 'idea' : 'manual',
    sourceId: idea?.id || null,
    status: getAiProviderStatus().videoGeneration.configured ? 'queued' : 'configuration_required',
    provider: process.env.VIDEO_PROVIDER || 'not_configured',
    prompt: {
      title: script.title,
      format: script.format || '15-25 sec Reels',
      scenes: script.scenes || [],
      caption: script.caption || '',
      cta: script.cta || '',
    },
    humanApprovalRequired: true,
    createdAt: new Date().toISOString(),
  };
  db.videoJobs.unshift(videoJob);
  createSyncJob(db, req.params.workspaceId, 'video_job_created', {
    videoJobId: videoJob.id,
    status: videoJob.status,
  });
  await writeDb(db);
  res.status(201).json({ videoJob });
});

app.post('/api/workspaces/:workspaceId/remix/generate', async (req, res, next) => {
  try {
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    const beforeProviderAttempt = createSerializedPaidAiAttemptGuard({
      workspaceId: req.params.workspaceId,
      actorUser: req.authUser,
    });

    const { globalInsight, businessBrief } = req.body;
    
    if (!globalInsight) {
      res.status(400).json({ error: 'global_insight_required', message: 'Global insight object is required' });
      return;
    }

    const finalBrief = mergeBusinessBriefWithBrandBrain(
      workspace.brief || {},
      businessBrief || {},
    );

    const result = await generateRemix(globalInsight, finalBrief, { beforeProviderAttempt });
    const generationId = `remix_generation_${crypto.randomUUID().replaceAll('-', '')}`;
    res.json({ ...result, generationId });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  const requestId = crypto.randomBytes(6).toString('hex');
  console.error(`[${requestId}]`, err);
  if (err.status && err.payload) {
    res.status(err.status).json({
      ...err.payload,
      requestId,
    });
    return;
  }
  const status = Number(err.status || 500);
  const error = status >= 500 && IS_PRODUCTION
    ? 'internal_server_error'
    : String(err.message || 'internal_server_error');
  const message = status >= 500 && IS_PRODUCTION
    ? 'Something went wrong. Please try again.'
    : undefined;
  res.status(status).json({ error, message, requestId });
});

app.use(express.static(CLIENT_DIST_PATH));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
});

async function startServer() {
  await recoverInterruptedAgentStudioRunsOnStartup();
  app.listen(PORT, HOST, () => {
    console.log(`Dzhero listening on http://${HOST}:${PORT}`);
    startAutomaticDiscoveryWorker();
  });
}

void startServer().catch((error) => {
  console.error('[ServerStartup]', error);
  process.exitCode = 1;
});
