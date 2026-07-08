const APIFY_API_BASE = 'https://api.apify.com/v2';

function compactText(value = '', maxLength = 1600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function parseTikTokVideoId(url = '') {
  const match = String(url || '').match(/\/video\/(\d+)/);
  return match?.[1] || '';
}

function buildScore({ views, likes, comments, shares, saves, publishedAt, sourceQuality = 8 }) {
  const safeViews = toNumber(views);
  const viewScore = Math.min(36, Math.log10(Math.max(safeViews, 1)) * 6);
  const engagementTotal = toNumber(likes) + toNumber(comments) * 3 + toNumber(shares) * 4 + toNumber(saves) * 3;
  const engagementRate = safeViews > 0 ? engagementTotal / safeViews : 0;
  const engagementScore = Math.min(28, engagementRate * 160);
  const ageMs = publishedAt ? Date.now() - new Date(publishedAt).getTime() : Number.POSITIVE_INFINITY;
  const ageDays = Number.isFinite(ageMs) ? Math.max(0, ageMs / 86400000) : 999;
  const freshnessScore = ageDays <= 7 ? 18 : ageDays <= 30 ? 12 : ageDays <= 90 ? 7 : 3;
  return Math.max(55, Math.min(96, Math.round(30 + viewScore + engagementScore + freshnessScore + sourceQuality)));
}

function getApifySignalKey(metadata = {}) {
  const platform = metadata.platform || metadata.providerPlatform || metadata.source?.tone || '';
  const stableId = metadata.shortCode || metadata.externalId || metadata.tiktokVideoId || metadata.id || '';
  return [platform, stableId || metadata.url || metadata.webVideoUrl].filter(Boolean).join(':').toLowerCase();
}

function mapInstagramApifyItem(item = {}, context = {}) {
  const views = toNumber(item.videoPlayCount);
  const likes = toNumber(item.likesCount);
  const comments = toNumber(item.commentsCount);
  const thumbnailUrl = item.displayUrl || item.images?.[0] || '';
  const handle = item.ownerUsername ? `@${item.ownerUsername}` : '@instagram';
  const title = compactText(item.caption || `Instagram Reel ${item.shortCode || item.id || ''}`, 180);
  const url = item.url || (item.shortCode ? `https://www.instagram.com/reel/${item.shortCode}/` : '');
  const metadata = {
    provider: 'apify',
    providerActor: 'apify/instagram-scraper',
    platform: 'instagram',
    externalId: item.id || '',
    shortCode: item.shortCode || '',
    url,
    title,
    description: item.caption || '',
    handle,
    image: thumbnailUrl,
    videoUrl: item.videoUrl || '',
    audioUrl: item.audioUrl || '',
    publishedAt: item.timestamp || '',
    stats: { views, likes, comments },
    rawStats: { views, likes, comments },
    source: { label: 'Instagram', tone: 'instagram' },
    sourceStatus: item.videoUrl ? 'apify_video' : 'apify_metadata',
    duration: item.videoDuration || '',
    apify: item,
    analysisText: compactText([item.caption, handle, url].filter(Boolean).join(' '), 2400),
  };
  return {
    id: context.createId ? context.createId('reel') : undefined,
    workspaceId: context.workspaceId,
    sourceId: null,
    sourceHandle: handle,
    handle,
    sourceUrl: url,
    sourceStatus: metadata.sourceStatus,
    scanLabel: 'Instagram',
    sourceType: 'Instagram',
    market: context.market || 'global',
    title,
    caption: item.caption || '',
    transcript: '',
    image: thumbnailUrl,
    videoUrl: item.videoUrl || '',
    views,
    likes,
    comments,
    shares: 0,
    saves: 0,
    hook: title,
    status: ['Instagram', 'Apify', item.videoUrl ? 'Player ready' : 'Metadata'],
    tag: (item.ownerUsername?.[0] || 'I').toUpperCase(),
    score: buildScore({ views, likes, comments, publishedAt: item.timestamp, sourceQuality: item.videoUrl ? 12 : 8 }),
    importedMetadata: metadata,
    createdAt: new Date().toISOString(),
  };
}

function mapTikTokApifyItem(item = {}, context = {}) {
  const url = item.webVideoUrl || item.url || '';
  const tiktokVideoId = parseTikTokVideoId(url);
  const views = toNumber(item.playCount);
  const likes = toNumber(item.diggCount);
  const comments = toNumber(item.commentCount);
  const shares = toNumber(item.shareCount);
  const saves = toNumber(item.collectCount);
  const mediaUrls = Array.isArray(item.mediaUrls) ? item.mediaUrls : [];
  const videoUrl = mediaUrls[0] || item.videoUrl || '';
  const thumbnailUrl = item['videoMeta.coverUrl']
    || item.videoMeta?.coverUrl
    || item.covers?.[0]
    || item['authorMeta.avatar']
    || item.authorMeta?.avatar
    || '';
  const authorName = item['authorMeta.name'] || item.authorMeta?.name || 'tiktok';
  const handle = authorName.startsWith('@') ? authorName : `@${authorName}`;
  const title = compactText(item.text || `TikTok ${tiktokVideoId}`, 180);
  const publishedAt = item.createTimeISO || '';
  const metadata = {
    provider: 'apify',
    providerActor: 'clockworks/tiktok-scraper',
    platform: 'tiktok',
    externalId: tiktokVideoId,
    tiktokVideoId,
    url,
    title,
    description: item.text || '',
    handle,
    image: thumbnailUrl,
    videoUrl,
    mediaUrls,
    publishedAt,
    stats: { views, likes, comments, shares, saves },
    rawStats: { views, likes, comments, shares, saves },
    source: { label: 'TikTok', tone: 'tiktok' },
    sourceStatus: videoUrl ? 'apify_video' : 'apify_metadata',
    duration: item['videoMeta.duration'] || item.videoMeta?.duration || '',
    apify: item,
    analysisText: compactText([item.text, handle, url].filter(Boolean).join(' '), 2400),
  };
  return {
    id: context.createId ? context.createId('reel') : undefined,
    workspaceId: context.workspaceId,
    sourceId: null,
    sourceHandle: handle,
    handle,
    sourceUrl: url,
    sourceStatus: metadata.sourceStatus,
    scanLabel: 'TikTok',
    sourceType: 'TikTok',
    market: context.market || 'global',
    title,
    caption: item.text || '',
    transcript: '',
    image: thumbnailUrl,
    videoUrl,
    views,
    likes,
    comments,
    shares,
    saves,
    hook: title,
    status: ['TikTok', 'Apify', videoUrl ? 'Player ready' : 'Metadata'],
    tag: (authorName[0] || 'T').toUpperCase(),
    score: buildScore({ views, likes, comments, shares, saves, publishedAt, sourceQuality: videoUrl ? 12 : 8 }),
    importedMetadata: metadata,
    createdAt: new Date().toISOString(),
  };
}

async function runApifyActor({ token, actorId, input }) {
  if (!token) {
    const error = new Error('apify_not_configured');
    error.status = 501;
    throw error;
  }
  const actorPath = encodeURIComponent(actorId).replace('%2F', '~');
  const runResponse = await fetch(`${APIFY_API_BASE}/acts/${actorPath}/runs?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const runPayload = await runResponse.json().catch(() => ({}));
  if (!runResponse.ok) {
    const error = new Error(runPayload?.error?.message || `apify_run_failed_${runResponse.status}`);
    error.status = runResponse.status;
    error.payload = runPayload;
    throw error;
  }
  const runId = runPayload?.data?.id;
  if (!runId) throw new Error('apify_run_id_missing');

  const deadline = Date.now() + 180000;
  let run = runPayload.data;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) {
    if (Date.now() > deadline) {
      const error = new Error('apify_run_timeout');
      error.status = 504;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const statusResponse = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}?token=${encodeURIComponent(token)}`);
    const statusPayload = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new Error(statusPayload?.error?.message || `apify_status_failed_${statusResponse.status}`);
    run = statusPayload.data;
  }
  if (run.status !== 'SUCCEEDED') {
    const error = new Error(`apify_run_${String(run.status).toLowerCase()}`);
    error.status = 502;
    error.run = run;
    throw error;
  }

  const datasetId = run.defaultDatasetId;
  if (!datasetId) return [];
  const itemResponse = await fetch(`${APIFY_API_BASE}/datasets/${datasetId}/items?clean=true&format=json&token=${encodeURIComponent(token)}`);
  const items = await itemResponse.json().catch(() => []);
  if (!itemResponse.ok) {
    const error = new Error(items?.error?.message || `apify_dataset_failed_${itemResponse.status}`);
    error.status = itemResponse.status;
    throw error;
  }
  return Array.isArray(items) ? items : [];
}

function buildInstagramInput({ inputValue, inputType, limit }) {
  const directUrlTypes = new Set(['url', 'profile']);
  const normalizedProfileUrl = (() => {
    if (inputType !== 'profile') return inputValue;
    const rawValue = String(inputValue || '').trim();
    if (!rawValue) return '';
    const urlMatch = rawValue.match(/instagram\.com\/([^/?#]+)/i);
    const handle = (urlMatch?.[1] || rawValue).replace(/^@/, '').replace(/\/+$/, '');
    if (!handle) return '';
    return `https://www.instagram.com/${handle}/`;
  })();
  return {
    directUrls: directUrlTypes.has(inputType) ? [normalizedProfileUrl] : [],
    search: directUrlTypes.has(inputType) ? '' : inputValue,
    resultsType: 'posts',
    resultsLimit: limit,
  };
}

function buildTikTokInput({ inputValue, inputType, limit, downloadVideo }) {
  const input = {
    resultsPerPage: limit,
    maxItems: limit,
    shouldDownloadVideos: Boolean(downloadVideo),
    shouldDownloadCovers: Boolean(downloadVideo),
    shouldDownloadSlideshowImages: false,
    shouldDownloadSubtitles: false,
    shouldDownloadComments: false,
  };
  if (inputType === 'hashtag') input.hashtags = [inputValue.replace(/^#/, '')];
  else if (inputType === 'profile') input.profiles = [inputValue.replace(/^@/, '')];
  else if (inputType === 'url') input.postURLs = [inputValue];
  else input.searchQueries = [inputValue];
  return input;
}

function buildApifyActorRequest(options = {}) {
  const platform = String(options.platform || '').trim().toLowerCase();
  const inputType = options.inputType || options.mode || 'search';
  const inputValue = options.inputValue ?? options.input ?? '';
  const downloadVideo = options.downloadVideo ?? options.downloadVideos ?? false;
  const limit = options.limit ?? 5;
  const boundedLimit = Math.min(Math.max(Number(limit || 5), 1), 30);

  if (platform === 'instagram') {
    return {
      actorId: 'apify/instagram-scraper',
      input: buildInstagramInput({ inputValue, inputType, limit: boundedLimit }),
    };
  }

  if (platform === 'tiktok') {
    return {
      actorId: 'clockworks/tiktok-scraper',
      input: buildTikTokInput({ inputValue, inputType, limit: boundedLimit, downloadVideo }),
    };
  }

  const error = new Error('unsupported_apify_platform');
  error.status = 400;
  throw error;
}

async function fetchApifySignals(options = {}) {
  const {
    token,
    platform,
    workspaceId,
    market,
    createId,
  } = options;
  const actorRequest = buildApifyActorRequest(options);
  if (platform === 'instagram') {
    const items = await runApifyActor({
      token,
      actorId: actorRequest.actorId,
      input: actorRequest.input,
    });
    return items.map((item) => mapInstagramApifyItem(item, { workspaceId, market, createId }));
  }
  if (platform === 'tiktok') {
    const items = await runApifyActor({
      token,
      actorId: actorRequest.actorId,
      input: actorRequest.input,
    });
    return items.map((item) => mapTikTokApifyItem(item, { workspaceId, market, createId }));
  }
  const error = new Error('unsupported_apify_platform');
  error.status = 400;
  throw error;
}

module.exports = {
  buildApifyActorRequest,
  buildScore,
  fetchApifySignals,
  getApifySignalKey,
  mapInstagramApifyItem,
  mapTikTokApifyItem,
  parseTikTokVideoId,
};
