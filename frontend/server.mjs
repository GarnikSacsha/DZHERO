import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5180);
const HOST = process.env.HOST || '0.0.0.0';
const CLIENT_DIST_PATH = path.resolve(process.env.FRONTEND_DIST_PATH || path.join(ROOT_DIR, 'dist'));
const API_PROXY_TARGET = parseApiProxyTarget(process.env.API_PROXY_TARGET);
const REQUEST_TARGET_BASE = new URL('http://request-target.invalid');
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function parseApiProxyTarget(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('API_PROXY_TARGET is required for the frontend runtime.');
  const target = new URL(raw);
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('API_PROXY_TARGET must use http: or https:.');
  }
  if (target.username || target.password || target.search || target.hash) {
    throw new Error('API_PROXY_TARGET must not contain credentials, a query, or a fragment.');
  }
  if (target.pathname !== '/' && target.pathname !== '') {
    throw new Error('API_PROXY_TARGET must be an origin without a path.');
  }
  return target;
}

function withoutHopByHopHeaders(headers) {
  const clean = { ...headers };
  const connectionTokens = String(clean.connection || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  for (const name of [...HOP_BY_HOP_HEADERS, ...connectionTokens]) delete clean[name];
  return clean;
}

function parseOriginFormRequestTarget(value, { requireApiPath = false } = {}) {
  const raw = String(value || '');
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (/[\u0000-\u0020\u007f\\#]/.test(raw) || /%(?![0-9A-Fa-f]{2})/.test(raw)) return null;
  try {
    const parsed = new URL(raw, REQUEST_TARGET_BASE);
    if (parsed.origin !== REQUEST_TARGET_BASE.origin || parsed.hash) return null;
    if (requireApiPath && parsed.pathname !== '/api' && !parsed.pathname.startsWith('/api/')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildApiProxyUrl(requestTarget) {
  const requested = parseOriginFormRequestTarget(requestTarget, { requireApiPath: true });
  if (!requested) return null;
  const target = new URL(API_PROXY_TARGET);
  target.pathname = requested.pathname;
  target.search = requested.search;
  return target;
}

function requireOriginFormRequestTarget(req, res, next) {
  if (!parseOriginFormRequestTarget(req.originalUrl)) {
    res.status(400).json({ error: 'invalid_request_target' });
    return;
  }
  next();
}

function proxyApiRequest(req, res) {
  const targetUrl = buildApiProxyUrl(req.originalUrl);
  if (!targetUrl) {
    res.status(400).json({ error: 'invalid_api_request_target' });
    return;
  }
  const headers = withoutHopByHopHeaders(req.headers);
  headers.host = targetUrl.host;
  headers['x-forwarded-for'] = req.ip;
  headers['x-forwarded-host'] = String(req.headers.host || '');
  headers['x-forwarded-proto'] = req.secure ? 'https' : 'http';

  const transport = targetUrl.protocol === 'https:' ? https : http;
  const proxyRequest = transport.request(targetUrl, {
    method: req.method,
    headers,
  }, (proxyResponse) => {
    const responseHeaders = withoutHopByHopHeaders(proxyResponse.headers);
    res.writeHead(proxyResponse.statusCode || 502, responseHeaders);
    proxyResponse.pipe(res);
  });

  proxyRequest.on('error', (error) => {
    console.error(`[FrontendApiProxy] ${String(error?.message || 'proxy_failed').slice(0, 180)}`);
    if (!res.headersSent) {
      res.status(502).json({ error: 'backend_unavailable' });
      return;
    }
    res.destroy(error);
  });
  req.on('aborted', () => proxyRequest.destroy());
  res.on('close', () => {
    if (!res.writableEnded) proxyRequest.destroy();
  });
  req.pipe(proxyRequest);
}

const indexPath = path.join(CLIENT_DIST_PATH, 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error(`Frontend build is missing at ${indexPath}. Run npm run build before start:frontend.`);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(requireOriginFormRequestTarget);
app.use('/api', proxyApiRequest);
app.use(express.static(CLIENT_DIST_PATH));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(indexPath);
});

const server = http.createServer((req, res) => {
  if (!parseOriginFormRequestTarget(req.url)) {
    res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'invalid_request_target' }));
    return;
  }
  app(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Dzhero frontend listening on http://${HOST}:${PORT}`);
});
