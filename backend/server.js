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
const { analyzeReel, generateIdeasFromReel } = require('./services/scoringEngine');

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
const ALLOW_DEMO_LOGIN = process.env.ALLOW_DEMO_LOGIN === 'true' || process.env.NODE_ENV !== 'production';
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
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
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_VISION_MODEL = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_TEXT_MODEL || process.env.GEMINI_REMIX_MODEL || 'gemini-3.5-flash';
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
];

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
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", ...Array.from(allowedOrigins), 'https://www.googleapis.com'],
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
    callback(new Error(`CORS blocked for origin: ${origin}`));
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
app.use('/api/auth/meta/start', oauthLimiter);
app.use('/api/auth/instagram/start', oauthLimiter);
app.use('/api/auth/google/start', oauthLimiter);
app.use('/api/auth/tiktok/start', oauthLimiter);
app.use('/api/auth/meta/callback', oauthLimiter);
app.use('/api/auth/instagram/callback', oauthLimiter);
app.use('/api/auth/callback/google', oauthLimiter);
app.use('/api/auth/tiktok/callback', oauthLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/email', authLimiter);
app.use('/api/auth/demo', authLimiter);
app.use('/api/data-deletion/request', authLimiter);
app.use('/api/brand-scan/preview', publicPreviewDailyLimiter, expensiveLimiter);
app.use('/api/workspaces/:workspaceId/reels/import-url', expensiveLimiter);
app.use('/api/workspaces/:workspaceId/reels/youtube/popular', expensiveLimiter);
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
  db.users ||= [];
  db.sessions ||= [];
  db.workspaces ||= [];
  db.competitors ||= [];
  db.reels ||= [];
  db.ideas ||= [];
  db.leads ||= [];
  db.syncJobs ||= [];
  db.sources ||= [];
  db.metaStates ||= [];
  db.instagramAccounts ||= [];
  db.tiktokAccounts ||= [];
  db.aiMemory ||= [];
  db.aiJobs ||= [];
  db.remixes ||= [];
  db.contentPlanItems ||= [];
  db.videoJobs ||= [];
  db.dataDeletionRequests ||= [];
  db.plans ||= PLAN_CATALOG;
  db.subscriptions ||= [];
  db.usageCounters ||= [];
  db.demoSessions ||= [];
  return db;
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

async function readDb() {
  if (DATABASE_URL) {
    await ensurePostgresState();
    const result = await getPgPool().query('SELECT data FROM app_state WHERE key = $1', [APP_STATE_KEY]);
    return normalizeDbShape(result.rows[0]?.data || {});
  }

  await ensureDbFile();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  return normalizeDbShape(JSON.parse(raw));
}

async function writeDb(db) {
  if (DATABASE_URL) {
    await ensurePostgresState();
    await getPgPool().query(
      `
        UPDATE app_state
        SET data = $2::jsonb,
            updated_at = now()
        WHERE key = $1
      `,
      [APP_STATE_KEY, JSON.stringify(normalizeDbShape(db))]
    );
    return;
  }

  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, `${JSON.stringify(normalizeDbShape(db), null, 2)}\n`, 'utf8');
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

function normalizeContentPlanPosts(posts) {
  if (!Array.isArray(posts)) return [];
  return posts.slice(0, 2000).map((post, index) => ({
    id: String(post?.id || createId('post')).slice(0, 80),
    day: Math.min(31, Math.max(1, Number(post?.day || index + 1))),
    title: String(post?.title || '').trim().slice(0, 180) || 'Untitled post',
    format: normalizeContentFormat(post?.format),
    time: /^\d{2}:\d{2}$/.test(String(post?.time || '')) ? post.time : '10:00',
    done: Boolean(post?.done),
    source: String(post?.source || '').trim().slice(0, 80),
    sourceKey: String(post?.sourceKey || '').trim().slice(0, 180),
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

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    workspaceId: user.workspaceId,
    createdAt: user.createdAt,
  };
}

function ensureOAuthUser(db, profile) {
  const email = normalizeEmail(profile.email);
  if (!email || !email.includes('@')) {
    throw new Error('OAuth provider did not return a verified email.');
  }
  let user = db.users.find((item) => normalizeEmail(item.email) === email);
  if (user) {
    user.name = user.name || profile.name || email.split('@')[0];
    user.avatarUrl = user.avatarUrl || profile.picture || '';
    user.oauthProviders = Array.from(new Set([...(user.oauthProviders || []), profile.provider]));
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
  const plan = unlimited ? buildUnlimitedPlan(basePlan) : basePlan;
  const period = getUsagePeriod();
  const usage = {
    agentChat: getUsageCounter(db, workspaceId, USAGE_METRICS.agentChat, period).value,
    reelImports: getUsageCounter(db, workspaceId, USAGE_METRICS.reelImports, period).value,
    brandBrainSaves: getUsageCounter(db, workspaceId, USAGE_METRICS.brandBrainSaves, period).value,
    competitors: db.competitors.filter((item) => item.workspaceId === workspaceId).length,
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
  const trial = {
    active: !unlimited && subscription.status === 'trialing' && (!trialEndsAt || trialEndsAt > Date.now()),
    expired: !unlimited && subscription.status === 'trialing' && Boolean(trialEndsAt) && trialEndsAt <= Date.now(),
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

function activateWorkspacePlan(db, workspaceId, planId, options = {}) {
  const plan = PLAN_CATALOG.find((item) => item.id === planId);
  if (!plan || ['demo', 'trial'].includes(plan.id)) {
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

async function analyzeSourceImageWithGemini(metadata) {
  if (!GEMINI_API_KEY || !metadata?.image) return null;
  const inlineData = await fetchImageInlineData(metadata.image);
  if (!inlineData) return null;
  try {
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
    return { source: 'gemini_thumbnail_vision', error: error.message };
  }
}

async function analyzeYouTubeVideoWithGemini(metadata) {
  const videoUrl = metadata?.url || metadata?.youtube?.url || '';
  if (!GEMINI_API_KEY || !metadata?.youtube?.videoId || !videoUrl) return null;
  try {
    const response = await fetch(`${GEMINI_API_BASE}/models/${process.env.GEMINI_VIDEO_MODEL || GEMINI_VISION_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              text: [
                'Analyze this public YouTube Shorts video for Dzhero, an AI producer for Ukrainian businesses.',
                'Use the actual video/audio when available. Do not rely only on title or thumbnail if video understanding is available.',
                'Return valid JSON only with keys: videoSummary, spokenText, onScreenText, hook, twist, sceneBeats, contentMechanic, ukrainianAdaptation, shotList, ctaIdeas, guardrails.',
                'Keep it practical for creating an original Ukrainian adaptation. Do not suggest copying the original video, audio, faces, or copyrighted creative.',
                `Title: ${metadata.title || ''}`,
                `Description: ${metadata.description || ''}`,
                `Channel: ${metadata.handle || metadata.youtube?.channelTitle || ''}`,
                `Stats: ${JSON.stringify(metadata.stats || {})}`,
              ].join('\n'),
            },
            {
              fileData: {
                mimeType: 'video/mp4',
                fileUri: videoUrl,
              },
            },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.25,
          topP: 0.75,
          maxOutputTokens: 1800,
        },
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
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    const parsed = parseGeminiJson(text);
    if (!parsed) return { source: 'gemini_youtube_video', status: 'unavailable', reason: 'empty_or_unparseable_response' };
    return {
      source: 'gemini_youtube_video',
      status: 'available',
      model: process.env.GEMINI_VIDEO_MODEL || GEMINI_VISION_MODEL,
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

async function enrichVideoIntelligence(metadata) {
  const transcript = metadata.youtube?.videoId ? await fetchYouTubeTranscript(metadata.youtube.videoId) : null;
  const [video, visual] = await Promise.all([
    analyzeYouTubeVideoWithGemini(metadata),
    analyzeSourceImageWithGemini(metadata),
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
  const maxResults = Math.min(Math.max(Number(options.maxResults || 8), 1), 12);
  const popularData = await fetchYouTubeApi('videos', {
    part: 'snippet,statistics,contentDetails',
    chart: 'mostPopular',
    regionCode,
    videoCategoryId: categoryId,
    maxResults: String(maxResults),
  });
  const videos = popularData.items || [];
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

async function fetchPublicSourceMetadata(rawInput) {
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

  if (source.tone === 'shorts') {
    try {
      const youtubeMetadata = await fetchYouTubeMetadata(rawInput);
      if (youtubeMetadata) return await enrichVideoIntelligence(youtubeMetadata);
    } catch (error) {
      fallback.youtubeError = error.message;
    }
    try {
      const oEmbedMetadata = await fetchYouTubeOEmbedMetadata(rawInput);
      if (oEmbedMetadata) return await enrichVideoIntelligence({
        ...oEmbedMetadata,
        youtubeError: fallback.youtubeError,
      });
    } catch (error) {
      fallback.youtubeOEmbedError = error.message;
    }
  }

  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'Mozilla/5.0 (compatible; DzheroBot/1.0; +https://dzhero.com.ua)',
      },
      redirect: 'follow',
    });
    if (!response.ok) {
      return { ...fallback, url, sourceStatus: `metadata_unavailable_${response.status}` };
    }

    const html = await response.text();
    const rawTitle = extractMetaContent(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
    const rawDescription = extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description') || '';
    const title = decodeHtml(rawTitle)
      .replace(/\s*•\s*Instagram.*$/i, '')
      .replace(/\s*on Instagram.*$/i, '')
      .replace(/\s*-\s*TikTok.*$/i, '')
      .trim();
    const description = decodeHtml(rawDescription);
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
    });
  } catch (error) {
    return { ...fallback, url, sourceStatus: 'metadata_fetch_failed', fetchError: error.message };
  }
}

async function enrichVideoIntelligenceSafe(metadata) {
  try {
    return await enrichVideoIntelligence(metadata);
  } catch (error) {
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

function safeDecodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookies(req) {
  const header = String(req.headers.cookie || '');
  return Object.fromEntries(header.split(';').map((part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return null;
    return [safeDecodeCookieValue(rawKey), safeDecodeCookieValue(rawValue.join('='))];
  }).filter(Boolean));
}

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

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

function getAuthToken(req) {
  return getBearerToken(req) || parseCookies(req)[SESSION_COOKIE_NAME] || '';
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
  const token = getAuthToken(req);
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  if (session.expiresAt && Date.parse(session.expiresAt) <= Date.now()) return null;
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
  const brief = workspace.brief || {};
  const sourceTitle = reel.title || reel.caption || reel.hook || 'market signal';
  return {
    ...base,
    topic: sourceTitle,
    audience: brief.audience || 'Ukrainian Instagram audience',
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
      angle: `Connect the trend to ${brief.product || 'the offer'} for ${brief.location || 'Ukraine'}.`,
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
  const brief = workspace.brief || {};
  const product = brief.product || 'offer';
  const location = brief.location || 'Ukraine';
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
    const metadata = await fetchPublicSourceMetadata(input);
    res.json({
      input,
      source: metadata.source,
      metadata,
      capabilities: {
        mode: metadata.sourceStatus === 'youtube_api'
          ? 'youtube_data_api'
          : ['public_metadata', 'youtube_oembed'].includes(metadata.sourceStatus)
            ? 'public_profile_preview'
            : 'manual_preview',
        officialApi: metadata.sourceStatus === 'youtube_api',
        statsAreOfficial: metadata.sourceStatus === 'youtube_api',
        intelligence: metadata.videoIntelligence?.confidence || null,
        note: metadata.sourceStatus === 'public_metadata'
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
    const connectedAccounts = pages
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
    stateRecord.usedAt = new Date().toISOString();
    const session = createSession(db, user.id);
    await writeDb(db);
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
  res.status(201).json({ user: publicUser(user), token: session.token });
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
  res.json({ user: publicUser(user), token: session.token });
});

app.post('/api/auth/email', async (req, res) => {
  const db = await readDb();
  const email = normalizeEmail(req.body.email);
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'valid_email_required' });
    return;
  }
  let user = db.users.find((item) => item.email === email);
  if (!user) {
    const name = email.split('@')[0] || 'User';
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
      authProvider: 'email_trial',
      createdAt: new Date().toISOString(),
    };
    db.workspaces.unshift(workspace);
    db.users.unshift(user);
  }
  ensureWorkspaceSubscription(db, user.workspaceId, { planId: 'trial' });
  const session = createSession(db, user.id);
  await writeDb(db);
  setSessionCookie(res, session.token);
  res.status(user.authProvider === 'email_trial' ? 201 : 200).json({ user: publicUser(user), token: session.token });
});

app.post('/api/auth/demo', async (req, res) => {
  if (!ALLOW_DEMO_LOGIN) {
    res.status(403).json({ error: 'demo_login_disabled' });
    return;
  }
  const db = await readDb();
  let user = db.users.find((item) => item.email === 'demo@dzhero.app');
  if (!user) {
    user = {
      id: createId('usr'),
      name: 'Demo User',
      email: 'demo@dzhero.app',
      role: 'owner',
      workspaceId: 'ws_demo_ua',
      passwordHash: hashPassword(crypto.randomBytes(12).toString('hex')),
      createdAt: new Date().toISOString(),
    };
    db.users.unshift(user);
  }
  ensureWorkspaceSubscription(db, user.workspaceId, { planId: 'demo' });
  const session = createSession(db, user.id);
  await writeDb(db);
  setSessionCookie(res, session.token);
  res.json({ user: publicUser(user), token: session.token });
});

app.get('/api/auth/me', async (req, res) => {
  const db = await readDb();
  const user = getAuthUser(db, req);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  res.json({ user: publicUser(user) });
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
  res.json({ plans: PLAN_CATALOG.map(publicPlan) });
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
  if (!plan || ['demo', 'trial'].includes(plan.id)) {
    res.status(400).json({ error: 'valid_paid_plan_required' });
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
  if (!plan || ['demo', 'trial'].includes(plan.id)) {
    res.status(400).json({ error: 'valid_paid_plan_required' });
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
  if (!plan || ['demo', 'trial'].includes(plan.id)) {
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

app.post('/api/admin/testers/grant', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = await readDb();
  const email = normalizeEmail(req.body.email);
  const requestedWorkspaceId = String(req.body.workspaceId || '').trim();
  const user = email ? db.users.find((item) => normalizeEmail(item.email) === email) : null;
  const workspaceId = requestedWorkspaceId || user?.workspaceId || '';
  const workspace = workspaceId ? requireWorkspace(db, workspaceId, res) : null;
  if (!workspace) {
    if (!res.headersSent) res.status(404).json({ error: 'tester_workspace_not_found' });
    return;
  }
  const planId = String(req.body.planId || 'agency').trim();
  const plan = PLAN_CATALOG.find((item) => item.id === planId);
  if (!plan || ['demo', 'trial'].includes(plan.id)) {
    res.status(400).json({ error: 'valid_paid_plan_required' });
    return;
  }
  const subscription = activateWorkspacePlan(db, workspace.id, plan.id, {
    provider: 'tester_grant',
    days: Number(req.body.days || 90),
    tester: true,
    note: req.body.note || `Tester access${email ? ` for ${email}` : ''}`,
  });
  workspace.testerAccess = {
    enabled: true,
    email: email || user?.email || '',
    planId: plan.id,
    grantedAt: new Date().toISOString(),
    expiresAt: subscription.currentPeriodEnd,
  };
  await writeDb(db);
  res.json({
    ok: true,
    user: user ? publicUser(user) : null,
    workspace: {
      id: workspace.id,
      name: workspace.name,
    },
    billing: buildEntitlements(db, workspace.id),
  });
});

app.get('/api/admin/testers', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const db = await readDb();
  const testers = db.subscriptions
    .filter((subscription) => subscription.tester || subscription.provider === 'tester_grant')
    .map((subscription) => {
      const workspace = db.workspaces.find((item) => item.id === subscription.workspaceId);
      const user = db.users.find((item) => item.workspaceId === subscription.workspaceId);
      return {
        workspaceId: subscription.workspaceId,
        workspaceName: workspace?.name || '',
        email: user?.email || workspace?.testerAccess?.email || '',
        planId: subscription.planId,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        note: subscription.note || '',
      };
    });
  res.json({ testers });
});

app.get('/api/workspaces/:workspaceId/brief', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  res.json({ brief: workspace.brief || {} });
});

app.put('/api/workspaces/:workspaceId/brief', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  assertUsageAvailable(db, req.params.workspaceId, 'brandBrainSaves', 1, req.authUser);
  workspace.brief = {
    ...(workspace.brief || {}),
    ...req.body,
    updatedAt: new Date().toISOString(),
  };
  incrementUsage(db, req.params.workspaceId, USAGE_METRICS.brandBrainSaves);
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
  const reels = db.reels.filter((item) => item.workspaceId === req.params.workspaceId);
  res.json({ reels });
});

app.post('/api/workspaces/:workspaceId/reels/youtube/popular', async (req, res, next) => {
  try {
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
    const maxResults = Math.min(Math.max(Number(req.body.maxResults || 8), 1), 12);
    try {
      assertUsageAvailable(db, req.params.workspaceId, 'reelImports', maxResults, req.authUser);
    } catch (err) {
      res.status(err.status || 402).json(err.payload || { error: err.message });
      return;
    }

    const baseMetadataItems = await fetchYouTubePopularMetadata({
      regionCode: req.body.regionCode,
      categoryId: req.body.categoryId,
      maxResults,
    });
    const metadataItems = await Promise.all(baseMetadataItems.map((metadata) => enrichVideoIntelligenceSafe(metadata)));
    const existingByVideoId = new Map();
    for (const reel of db.reels.filter((item) => item.workspaceId === req.params.workspaceId)) {
      const videoId = reel.importedMetadata?.youtube?.videoId || parseYouTubeInput(reel.sourceUrl)?.videoId;
      if (videoId && !existingByVideoId.has(videoId)) existingByVideoId.set(videoId, reel);
    }
    const importedReels = [];
    const returnedReels = [];
    for (const metadata of metadataItems) {
      const videoId = metadata.youtube?.videoId;
      if (videoId && existingByVideoId.has(videoId)) {
        const existingReel = existingByVideoId.get(videoId);
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

app.post('/api/workspaces/:workspaceId/reels/import-url', async (req, res, next) => {
  try {
    const db = await readDb();
    const workspace = requireWorkspace(db, req.params.workspaceId, res);
    if (!workspace) return;
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

    const metadata = await fetchPublicSourceMetadata(url);
    const globalInsight = buildGlobalInsightFromReelMetadata(metadata);
    const mergedBrief = {
      niche: req.body.businessBrief?.niche || workspace.brief?.businessType || 'Локальний бізнес',
      product: req.body.businessBrief?.product || workspace.brief?.product || 'продукт або послуга бренду',
      location: req.body.businessBrief?.location || workspace.brief?.location || 'Україна',
      toneOfVoice: req.body.businessBrief?.toneOfVoice || workspace.brief?.toneOfVoice || 'коротко, конкретно, дружньо, без перебільшень',
    };

    const remixResult = await generateRemix(globalInsight, mergedBrief);
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
    db.reels.unshift(importedReel);
    db.remixes.unshift({
      id: createId('remix'),
      workspaceId: req.params.workspaceId,
      reelId: importedReel.id,
      sourceUrl: metadata.url || url,
      provider: getAiProviderStatus().textAgent.provider,
      result: remixResult,
      createdAt: new Date().toISOString(),
    });
    createSyncJob(db, req.params.workspaceId, 'url_reel_imported', {
      reelId: importedReel.id,
      sourceStatus: metadata.sourceStatus,
    });
    incrementUsage(db, req.params.workspaceId, USAGE_METRICS.reelImports);
    const billing = buildEntitlements(db, req.params.workspaceId, req.authUser);
    await writeDb(db);
    res.status(201).json({
      reel: importedReel,
      analysis,
      remix: remixResult,
      metadata,
      billing,
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
  const reel = db.reels.find((item) => item.id === req.params.reelId && item.workspaceId === req.params.workspaceId);
  if (!reel) {
    res.status(404).json({ error: 'reel_not_found' });
    return;
  }
  if (reel.importedMetadata?.youtube?.videoId) {
    const refreshedMetadata = await enrichVideoIntelligenceSafe(reel.importedMetadata);
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
  res.json({
    workspaceId: workspace.id,
    brief: workspace.brief || {},
    providers: getAiProviderStatus(),
    memory: db.aiMemory.filter((item) => item.workspaceId === req.params.workspaceId).slice(0, 20),
  });
});

app.put('/api/workspaces/:workspaceId/agent/context', async (req, res) => {
  const db = await readDb();
  const workspace = requireWorkspace(db, req.params.workspaceId, res);
  if (!workspace) return;
  assertUsageAvailable(db, req.params.workspaceId, 'brandBrainSaves', 1, req.authUser);
  workspace.brief = {
    ...(workspace.brief || {}),
    ...req.body,
    updatedAt: new Date().toISOString(),
  };
  const memory = {
    id: createId('mem'),
    workspaceId: req.params.workspaceId,
    type: 'brand_context_update',
    value: req.body,
    createdAt: new Date().toISOString(),
  };
  db.aiMemory.unshift(memory);
  incrementUsage(db, req.params.workspaceId, USAGE_METRICS.brandBrainSaves);
  await writeDb(db);
  res.json({ brief: workspace.brief, memory, billing: buildEntitlements(db, req.params.workspaceId, req.authUser) });
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
    billing = assertUsageAvailable(db, req.params.workspaceId, 'agentChat', 1, req.authUser);
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

  try {
    const result = await generateAgentReply({ message, history, workspace, snapshot });
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
    db.aiJobs.unshift(job);
    db.aiMemory.unshift({
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
    incrementUsage(db, req.params.workspaceId, USAGE_METRICS.agentChat);
    billing = buildEntitlements(db, req.params.workspaceId, req.authUser);
    await writeDb(db);
    res.status(201).json({
      reply: result.text,
      provider: result.provider,
      model: result.model,
      aiJob: job,
      billing,
    });
  } catch (err) {
    console.error('[AgentChat]', err);
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

    const { globalInsight, businessBrief } = req.body;
    
    if (!globalInsight) {
      res.status(400).json({ error: 'global_insight_required', message: 'Global insight object is required' });
      return;
    }

    // Merge supplied brief with workspace stored brief if empty
    const mergedBrief = {
      niche: businessBrief?.niche || workspace.brief?.businessType || 'Локальний бізнес',
      product: businessBrief?.product || workspace.brief?.product || 'продукт або послуга бренду',
      location: businessBrief?.location || workspace.brief?.location || 'Україна',
      toneOfVoice: businessBrief?.toneOfVoice || workspace.brief?.toneOfVoice || 'коротко, конкретно, дружньо, без перебільшень'
    };

    const result = await generateRemix(globalInsight, mergedBrief);
    res.json(result);
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

app.listen(PORT, HOST, () => {
  console.log(`Dzhero listening on http://${HOST}:${PORT}`);
});
