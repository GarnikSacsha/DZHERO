'use strict';

function safeDecodeCookieValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookiePairs(req) {
  const header = String(req.headers?.cookie || '');
  return header.split(';').map((part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return null;
    return [safeDecodeCookieValue(rawKey), safeDecodeCookieValue(rawValue.join('='))];
  }).filter(Boolean);
}

function parseCookies(req) {
  return Object.fromEntries(parseCookiePairs(req));
}

function getBearerToken(req) {
  const header = String(req.headers?.authorization || '');
  if (!header.startsWith('Bearer ')) return '';
  return header.slice('Bearer '.length).trim();
}

function getAuthTokenCandidates(req, cookieName) {
  const bearerToken = getBearerToken(req);
  if (bearerToken) return [bearerToken];
  const seen = new Set();
  return parseCookiePairs(req)
    .filter(([key, value]) => key === cookieName && value)
    .map(([, value]) => value)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
}

function findAuthSession(db, req, cookieName, now = Date.now()) {
  const candidates = getAuthTokenCandidates(req, cookieName);
  const validSessions = candidates
    .map((token) => (db.sessions || []).find((item) => item.token === token))
    .filter((session) => session && (!session.expiresAt || Date.parse(session.expiresAt) > now));
  if (!validSessions.length) return null;
  return validSessions.sort((left, right) => (
    Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0)
  ))[0];
}

module.exports = {
  findAuthSession,
  getAuthTokenCandidates,
  getBearerToken,
  parseCookies,
};
