'use strict';

function stripWww(hostname) {
  return String(hostname || '').toLowerCase().replace(/^www\./, '');
}

function cleanPath(pathname) {
  const decoded = String(pathname || '').trim();
  const withLeadingSlash = decoded.startsWith('/') ? decoded : `/${decoded}`;
  const withoutRepeatedSlashes = withLeadingSlash.replace(/\/{2,}/g, '/');
  const withoutTrailingSlash = withoutRepeatedSlashes.replace(/\/$/, '');
  return withoutTrailingSlash || '/';
}

function cleanVideoId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
}

function canonicalUrlFor(parsed, platform, kind, value) {
  const host = platform === 'instagram'
    ? 'instagram.com'
    : platform === 'tiktok'
      ? 'tiktok.com'
      : 'youtube.com';
  if (platform === 'instagram') return `https://${host}/${kind}/${value}`;
  if (platform === 'tiktok') {
    if (kind === 'short') return `https://${stripWww(parsed.hostname)}/${value}`;
    return `https://${host}${cleanPath(value)}`;
  }
  if (kind === 'shorts') return `https://${host}/shorts/${value}`;
  return `https://${host}/watch?v=${value}`;
}

function invalidResult(reason = 'unsupported_url') {
  return { valid: false, reason };
}

/**
 * Product-only URL parser. It intentionally does not resolve redirects or
 * fetch provider metadata; short TikTok hosts remain canonical short-host
 * records until a later, explicit analyze action.
 */
function parseProductSavedUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw || raw.length > 4096 || /[\u0000-\u001f\u007f]/.test(raw)) return invalidResult('invalid_url');

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return invalidResult('invalid_url');
  }
  if (parsed.protocol !== 'https:') return invalidResult('https_required');
  if (parsed.username || parsed.password) return invalidResult('credentials_not_allowed');

  const host = stripWww(parsed.hostname);
  const path = cleanPath(parsed.pathname);
  const instagramHosts = new Set(['instagram.com']);
  const tiktokHosts = new Set(['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);
  const youtubeHosts = new Set(['youtube.com', 'm.youtube.com', 'youtu.be']);

  if (instagramHosts.has(host)) {
    const match = path.match(/^\/(reel|reels|p)\/([^/]+)$/i);
    if (!match || !cleanVideoId(match[2])) return invalidResult('instagram_video_url_required');
    return {
      valid: true,
      platform: 'instagram',
      canonicalUrl: canonicalUrlFor(parsed, 'instagram', match[1].toLowerCase() === 'reels' ? 'reel' : match[1].toLowerCase(), cleanVideoId(match[2])),
    };
  }

  if (tiktokHosts.has(host)) {
    if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
      const shortPath = path.match(/^\/([^/]+)$/);
      if (!shortPath || !/^[A-Za-z0-9_-]{3,128}$/.test(shortPath[1])) return invalidResult('tiktok_video_url_required');
      return { valid: true, platform: 'tiktok', canonicalUrl: canonicalUrlFor(parsed, 'tiktok', 'short', shortPath[1]) };
    }
    const match = path.match(/^(?:\/@[^/]+\/)?video\/([0-9]+)$/i);
    if (!match) return invalidResult('tiktok_video_url_required');
    return { valid: true, platform: 'tiktok', canonicalUrl: canonicalUrlFor(parsed, 'tiktok', 'video', path) };
  }

  if (youtubeHosts.has(host)) {
    if (host === 'youtu.be') {
      const id = cleanVideoId(path.slice(1).split('/')[0]);
      if (!id) return invalidResult('youtube_video_url_required');
      return { valid: true, platform: 'youtube', canonicalUrl: canonicalUrlFor(parsed, 'youtube', 'watch', id) };
    }
    const shortsMatch = path.match(/^\/shorts\/([^/]+)$/i);
    if (shortsMatch && cleanVideoId(shortsMatch[1])) {
      return { valid: true, platform: 'youtube', canonicalUrl: canonicalUrlFor(parsed, 'youtube', 'shorts', cleanVideoId(shortsMatch[1])) };
    }
    if (path === '/watch') {
      const id = cleanVideoId(parsed.searchParams.get('v'));
      if (!id) return invalidResult('youtube_video_url_required');
      return { valid: true, platform: 'youtube', canonicalUrl: canonicalUrlFor(parsed, 'youtube', 'watch', id) };
    }
    return invalidResult('youtube_video_url_required');
  }

  return invalidResult('unsupported_host');
}

module.exports = {
  parseProductSavedUrl,
};
