'use strict';

const OFFICIAL_OEMBED_ORIGIN = 'https://www.tiktok.com/oembed';
const MAX_OEMBED_RESPONSE_BYTES = 100_000;

function createThumbnailError(code, status) {
  const error = new Error(code);
  error.status = status;
  error.payload = { error: code };
  return error;
}

function normalizeTikTokVideoUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'https:') return '';
    if (!['www.tiktok.com', 'm.tiktok.com'].includes(parsed.hostname.toLowerCase())) return '';
    const match = parsed.pathname.match(/^\/(@[^/]+)\/video\/(\d+)\/?$/);
    if (!match) return '';
    return `https://www.tiktok.com/${match[1]}/video/${match[2]}`;
  } catch {
    return '';
  }
}

async function fetchTikTokThumbnail(value, options = {}) {
  const videoUrl = normalizeTikTokVideoUrl(value);
  if (!videoUrl) {
    throw createThumbnailError('tiktok_video_url_required', 400);
  }

  const fetcher = options.fetcher || globalThis.fetch;
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 10_000);
  const oEmbedOrigin = options.oEmbedOrigin || OFFICIAL_OEMBED_ORIGIN;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const endpoint = new URL(oEmbedOrigin);
    endpoint.searchParams.set('url', videoUrl);
    const response = await fetcher(endpoint, {
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw createThumbnailError('tiktok_thumbnail_unavailable', 404);
    }
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_OEMBED_RESPONSE_BYTES) {
      throw createThumbnailError('tiktok_thumbnail_unavailable', 404);
    }
    const payload = JSON.parse(body);
    const thumbnailUrl = String(payload?.thumbnail_url || '').trim();
    const parsedThumbnail = new URL(thumbnailUrl);
    if (parsedThumbnail.protocol !== 'https:') {
      throw createThumbnailError('tiktok_thumbnail_unavailable', 404);
    }
    return parsedThumbnail.href;
  } catch (error) {
    if (error?.payload?.error) throw error;
    throw createThumbnailError('tiktok_thumbnail_unavailable', 404);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  OFFICIAL_OEMBED_ORIGIN,
  fetchTikTokThumbnail,
  normalizeTikTokVideoUrl,
};
