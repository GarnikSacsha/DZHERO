const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const { generateAgentReply } = require('./services/agentEngine');
const { generateRemix } = require('./services/remixEngine');
const { analyzeReel, generateIdeasFromReel } = require('./services/scoringEngine');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_DB_PATH = path.join(__dirname, 'data', 'db.json');
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;
const CLIENT_DIST_PATH = path.join(__dirname, '..', 'dist');
const META_AUTH_BASE_URL = process.env.META_AUTH_BASE_URL || 'https://www.facebook.com/v20.0/dialog/oauth';
const META_GRAPH_BASE_URL = process.env.META_GRAPH_BASE_URL || 'https://graph.facebook.com/v20.0';
const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || `http://127.0.0.1:${PORT}/api/auth/meta/callback`;
const CLIENT_URL = process.env.CLIENT_URL || 'http://127.0.0.1:5173';
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
const META_SCOPES = process.env.META_SCOPES || [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
].join(',');

const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  CLIENT_URL,
].filter(Boolean));

app.use('/api', cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(express.json({ limit: '1mb' }));

async function readDb() {
  await ensureDbFile();
  const raw = await fs.readFile(DB_PATH, 'utf8');
  const db = JSON.parse(raw);
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
  db.aiMemory ||= [];
  db.aiJobs ||= [];
  db.remixes ||= [];
  db.contentPlanItems ||= [];
  db.videoJobs ||= [];
  db.dataDeletionRequests ||= [];
  return db;
}

async function writeDb(db) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
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
  return hashPassword(password, salt) === storedHash;
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

function createSession(db, userId) {
  const session = {
    token: crypto.randomBytes(32).toString('hex'),
    userId,
    createdAt: new Date().toISOString(),
  };
  db.sessions.unshift(session);
  return session;
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

function getAuthUser(db, req) {
  const token = getBearerToken(req);
  const session = db.sessions.find((item) => item.token === token);
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

function buildMetaAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: META_REDIRECT_URI,
    response_type: 'code',
    scope: META_SCOPES,
    state,
  });
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

async function getInstagramProfile(accessToken) {
  const params = new URLSearchParams({
    fields: 'id,user_id,username,account_type,profile_picture_url',
    access_token: accessToken,
  });
  return fetchMetaJson(`${INSTAGRAM_GRAPH_BASE_URL}/me?${params.toString()}`);
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
  if (!workspace) {
    res.status(404).json({ error: 'workspace_not_found' });
    return null;
  }
  return workspace;
}

function getAiProviderStatus() {
  return {
    instagram: {
      configured: Boolean(INSTAGRAM_APP_ID && INSTAGRAM_APP_SECRET),
      status: INSTAGRAM_APP_ID && INSTAGRAM_APP_SECRET ? 'ready' : 'configuration_required',
      requiredEnv: ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_REDIRECT_URI'],
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

app.get('/api/health', async (req, res) => {
  const db = await readDb();
  res.json({
    ok: true,
    service: 'dzhero-api',
    version: '0.1.0',
    counts: {
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
    },
  });
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
      requiredEnv: ['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI', 'META_SCOPES'],
    });
    return;
  }
  const db = await readDb();
  const workspaceId = req.query.workspaceId || 'ws_demo_ua';
  if (!requireWorkspace(db, workspaceId, res)) return;
  const state = crypto.randomBytes(16).toString('hex');
  db.metaStates.unshift({
    state,
    workspaceId,
    createdAt: new Date().toISOString(),
    usedAt: null,
  });
  await writeDb(db);
  const { authUrl } = buildMetaAuthUrl(state);
  res.json({ authUrl, state, redirectUri: META_REDIRECT_URI, scopes: META_SCOPES.split(',') });
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
  const workspaceId = req.query.workspaceId || 'ws_demo_ua';
  if (!requireWorkspace(db, workspaceId, res)) return;
  const state = crypto.randomBytes(16).toString('hex');
  db.metaStates.unshift({
    state,
    workspaceId,
    provider: 'instagram',
    createdAt: new Date().toISOString(),
    usedAt: null,
  });
  await writeDb(db);
  const { authUrl } = buildInstagramAuthUrl(state);
  res.json({ authUrl, state, redirectUri: INSTAGRAM_REDIRECT_URI, scopes: INSTAGRAM_SCOPES.split(',') });
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
    const stateRecord = db.metaStates.find((item) => item.state === req.query.state);
    const workspaceId = stateRecord?.workspaceId || 'ws_demo_ua';
    const tokenResult = await exchangeMetaCode(String(req.query.code));
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
        permissions: META_SCOPES.split(','),
        status: 'connected',
        connectedAt: new Date().toISOString(),
        tokenMeta: {
          tokenType: tokenResult.token_type || 'bearer',
          expiresIn: tokenResult.expires_in || null,
        },
      }));

    db.instagramAccounts = db.instagramAccounts.filter((account) => account.workspaceId !== workspaceId);
    db.instagramAccounts.unshift(...connectedAccounts);
    if (stateRecord) stateRecord.usedAt = new Date().toISOString();
    createSyncJob(db, workspaceId, 'meta_account_discovery', {
      pagesFound: pages.length,
      instagramAccountsFound: connectedAccounts.length,
    });
    await writeDb(db);
    res.redirect(`${CLIENT_URL}/?meta=connected&accounts=${connectedAccounts.length}`);
  } catch (err) {
    console.error('[MetaLogin]', err);
    res.status(502).send(`Meta Login token exchange failed: ${err.message}`);
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
    const stateRecord = db.metaStates.find((item) => item.state === req.query.state);
    const workspaceId = stateRecord?.workspaceId || 'ws_demo_ua';
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
      permissions: INSTAGRAM_SCOPES.split(','),
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
    if (stateRecord) stateRecord.usedAt = new Date().toISOString();
    createSyncJob(db, workspaceId, 'instagram_account_connected', {
      provider: 'instagram_login',
      accountType: connectedAccount.accountType,
      scopes: connectedAccount.permissions,
    });
    await writeDb(db);
    res.redirect(`${CLIENT_URL}/?instagram=connected&accounts=1`);
  } catch (err) {
    console.error('[InstagramLogin]', err);
    res.status(502).send(`Instagram Login token exchange failed: ${err.message}`);
  }
});

app.get('/api/auth/meta/status', async (req, res) => {
  const db = await readDb();
  const workspaceId = req.query.workspaceId || 'ws_demo_ua';
  const accounts = db.instagramAccounts.filter((account) => account.workspaceId === workspaceId);
  res.json({
    configured: Boolean(META_APP_ID && META_APP_SECRET),
    redirectUri: META_REDIRECT_URI,
    scopes: META_SCOPES.split(','),
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
  const session = createSession(db, user.id);
  await writeDb(db);
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
  res.json({ user: publicUser(user), token: session.token });
});

app.post('/api/auth/demo', async (req, res) => {
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
  const session = createSession(db, user.id);
  await writeDb(db);
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
  const token = getBearerToken(req);
  db.sessions = db.sessions.filter((session) => session.token !== token);
  await writeDb(db);
  res.json({ ok: true });
});

app.get('/api/schema', (req, res) => {
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
    ],
    note: 'MVP API skeleton. JSON storage is temporary and should be replaced with a real database.',
  });
});

app.get('/api/workspaces', async (req, res) => {
  const db = await readDb();
  res.json({ workspaces: db.workspaces });
});

app.post('/api/workspaces', async (req, res) => {
  const db = await readDb();
  const workspace = {
    id: createId('ws'),
    name: req.body.name || 'New workspace',
    owner: req.body.owner || 'Admin',
    mode: req.body.mode || 'own_business',
    marketFocus: req.body.marketFocus || ['ua', 'us', 'eu', 'global'],
    createdAt: new Date().toISOString(),
    brief: req.body.brief || {},
  };
  db.workspaces.unshift(workspace);
  await writeDb(db);
  res.status(201).json({ workspace });
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
  workspace.brief = {
    ...(workspace.brief || {}),
    ...req.body,
    updatedAt: new Date().toISOString(),
  };
  await writeDb(db);
  res.json({ brief: workspace.brief });
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
  await writeDb(db);
  res.status(201).json({ competitor });
});

app.get('/api/workspaces/:workspaceId/reels', async (req, res) => {
  const db = await readDb();
  if (!requireWorkspace(db, req.params.workspaceId, res)) return;
  const reels = db.reels.filter((item) => item.workspaceId === req.params.workspaceId);
  res.json({ reels });
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
  await writeDb(db);
  res.json({ brief: workspace.brief, memory });
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
  const history = Array.isArray(req.body.history) ? req.body.history : [];
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
    await writeDb(db);
    res.status(201).json({
      reply: result.text,
      provider: result.provider,
      model: result.model,
      aiJob: job,
    });
  } catch (err) {
    console.error('[AgentChat]', err);
    res.status(502).json({
      error: 'agent_provider_failed',
      message: err.message,
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
      niche: businessBrief?.niche || workspace.brief?.businessType || 'Кафе/Ресторан',
      product: businessBrief?.product || workspace.brief?.product || 'Спешелти кава та десерти',
      location: businessBrief?.location || workspace.brief?.location || 'Київ',
      toneOfVoice: businessBrief?.toneOfVoice || workspace.brief?.toneOfVoice || 'дружній, але професійний'
    };

    const result = await generateRemix(globalInsight, mergedBrief);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
});

app.use(express.static(CLIENT_DIST_PATH));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(CLIENT_DIST_PATH, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Dzhero listening on http://${HOST}:${PORT}`);
});
