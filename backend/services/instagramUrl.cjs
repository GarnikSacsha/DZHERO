const INSTAGRAM_HOSTNAMES = new Set([
  'instagram.com',
  'www.instagram.com',
]);

function normalizeHostname(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\.$/, '');
}

function isInstagramHostname(value = '') {
  return INSTAGRAM_HOSTNAMES.has(normalizeHostname(value));
}

function getInstagramUsernameFromUrl(url = '') {
  try {
    const parsed = new URL(url);
    if (!isInstagramHostname(parsed.hostname)) return '';
    const firstPath = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (!firstPath || /^(p|reel|reels|stories|explore|accounts|about|developer)$/i.test(firstPath)) return '';
    return firstPath.replace(/^@/, '');
  } catch {
    return '';
  }
}

module.exports = {
  getInstagramUsernameFromUrl,
  isInstagramHostname,
};
