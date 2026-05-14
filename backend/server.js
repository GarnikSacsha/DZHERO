const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const META_AUTH_BASE_URL = process.env.META_AUTH_BASE_URL || 'https://www.facebook.com/v20.0/dialog/oauth';
const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || `http://127.0.0.1:${PORT}/api/auth/meta/callback`;
const META_SCOPES = process.env.META_SCOPES || [
  'instagram_basic',
  'instagram_manage_insights',
  'pages_show_list',
  'pages_read_engagement',
].join(',');

app.use(cors({ origin: ['http://127.0.0.1:5173', 'http://localhost:5173'] }));
app.use(express.json({ limit: '1mb' }));

async function readDb() {
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
  return db;
}

async function writeDb(db) {
  await fs.writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
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

function buildMetaAuthUrl() {
  const state = crypto.randomBytes(16).toString('hex');
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

function requireWorkspace(db, workspaceId, res) {
  const workspace = db.workspaces.find((item) => item.id === workspaceId);
  if (!workspace) {
    res.status(404).json({ error: 'workspace_not_found' });
    return null;
  }
  return workspace;
}

app.get('/api/health', async (req, res) => {
  const db = await readDb();
  res.json({
    ok: true,
    service: 'insta-producer-api',
    version: '0.1.0',
    counts: {
      workspaces: db.workspaces.length,
      users: db.users.length,
      competitors: db.competitors.length,
      reels: db.reels.length,
      ideas: db.ideas.length,
      leads: db.leads.length,
    },
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
  const { authUrl, state } = buildMetaAuthUrl();
  res.json({ authUrl, state, redirectUri: META_REDIRECT_URI, scopes: META_SCOPES.split(',') });
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
  res.send([
    'Meta Login code received.',
    'Next step: exchange this code for an access token, fetch connected Instagram Business accounts, then create a workspace session.',
  ].join('\n'));
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
  let user = db.users.find((item) => item.email === 'demo@instaproducer.local');
  if (!user) {
    user = {
      id: createId('usr'),
      name: 'Demo User',
      email: 'demo@instaproducer.local',
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
      'instagram_accounts',
      'competitors',
      'reels',
      'ideas',
      'remixes',
      'content_plan_items',
      'leads',
      'crm_tags',
      'ai_memory',
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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`InstaProducer API listening on http://127.0.0.1:${PORT}`);
});
