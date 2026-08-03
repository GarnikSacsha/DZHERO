const APIFY_API_BASE = 'https://api.apify.com/v2';

function compactText(value = '', maxLength = 1600) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function cleanSocialToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/^instagram\s+/i, '')
    .replace(/^#|^@/, '')
    .replace(/[^a-zA-Z0-9_]/g, '');
}

function cleanSocialHandleToken(value = '') {
  return String(value || '')
    .trim()
    .replace(/^instagram\s+/i, '')
    .replace(/^#|^@/, '')
    .replace(/[^a-zA-Z0-9._]/g, '');
}

function getInstagramProfileHandle(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw) && !/instagram\.com\//i.test(raw)) {
    return cleanSocialHandleToken(raw);
  }
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!/instagram\.com$/i.test(url.hostname.replace(/^www\./, ''))) return '';
    const [handle] = url.pathname.split('/').filter(Boolean);
    if (!handle || ['p', 'reel', 'reels', 'tv', 'explore'].includes(handle.toLowerCase())) return '';
    return cleanSocialHandleToken(handle);
  } catch {
    return cleanSocialHandleToken(raw);
  }
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function readOptionalMetric(item = {}, keys = []) {
  const presentKeys = keys.filter((key) => Object.prototype.hasOwnProperty.call(item, key));
  if (!presentKeys.length) return { available: false, invalid: false, status: 'unavailable', value: null, sourceField: null };
  const sourceField = presentKeys.find((key) => Boolean(item[key])) || presentKeys[0];
  const rawValue = item[sourceField];
  if (rawValue === null || rawValue === undefined) {
    return { available: false, invalid: false, status: 'unavailable', value: null, sourceField };
  }
  if ((typeof rawValue !== 'number' && typeof rawValue !== 'string') || String(rawValue).trim() === '') {
    return { available: false, invalid: true, status: 'invalid', value: null, sourceField };
  }
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return { available: false, invalid: true, status: 'invalid', value: null, sourceField };
  }
  const value = Math.min(numericValue, Number.MAX_SAFE_INTEGER);
  return {
    available: true,
    invalid: false,
    status: value === 0 ? 'confirmed_zero' : 'positive',
    value,
    sourceField,
  };
}

function canonicalSocialHandle(value = '') {
  const handle = cleanSocialHandleToken(value).toLowerCase();
  return handle ? `@${handle}` : '';
}

function collectSocialHandles(values = []) {
  const entries = Array.isArray(values) ? values : [];
  return [...new Set(entries.map((entry) => canonicalSocialHandle(
    typeof entry === 'string'
      ? entry
      : entry?.username || entry?.userName || entry?.handle || entry?.ownerUsername || '',
  )).filter(Boolean))];
}

function getInstagramSourceScope(item = {}, context = {}) {
  const requestedProfile = getInstagramProfileHandle(
    context.requestedSourceHandle || context.inputValue || context.input || '',
  );
  const requestedSourceHandle = context.inputType === 'profile' || context.mode === 'profile'
    ? canonicalSocialHandle(requestedProfile)
    : '';
  const contentOwnerHandle = canonicalSocialHandle(
    item.ownerUsername || item.username || item.owner?.username || item.user?.username || '',
  );
  const coauthorHandles = collectSocialHandles(item.coauthorProducers);
  const taggedHandles = collectSocialHandles(item.taggedUsers);
  const sourceRelationship = !requestedSourceHandle
    ? null
    : contentOwnerHandle === requestedSourceHandle
      ? 'owner'
      : coauthorHandles.includes(requestedSourceHandle)
        ? 'coauthor'
        : 'unrelated';
  return {
    requestedSourceHandle,
    contentOwnerHandle,
    coauthorHandles,
    taggedHandles,
    sourceRelationship,
  };
}

function getTikTokSourceScope(item = {}, context = {}) {
  const requestedSourceHandle = context.inputType === 'profile' || context.mode === 'profile'
    ? canonicalSocialHandle(context.requestedSourceHandle || context.inputValue || context.input || '')
    : '';
  const contentOwnerHandle = canonicalSocialHandle(
    item['authorMeta.name'] || item.authorMeta?.name || item.authorName || item.username || '',
  );
  return {
    requestedSourceHandle,
    contentOwnerHandle,
    coauthorHandles: [],
    taggedHandles: [],
    sourceRelationship: !requestedSourceHandle
      ? null
      : contentOwnerHandle === requestedSourceHandle
        ? 'owner'
        : 'unrelated',
  };
}

function buildRankingAvailability({ views, shares, saves, duration }) {
  const protectedIntentAvailable = views.available && shares.available && saves.available;
  const hasInvalidRankingMetadata = views.invalid || shares.invalid || saves.invalid || duration.invalid;
  return {
    sharesAvailable: shares.available,
    savesAvailable: saves.available,
    viewsAvailable: views.available,
    durationAvailable: duration.available,
    protectedIntentAvailable,
    rankingMetadataStatus: hasInvalidRankingMetadata
      ? 'invalid_ranking_metadata'
      : protectedIntentAvailable
        ? 'ready'
        : 'insufficient_ranking_metadata',
  };
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
  const snapshotAt = context.now instanceof Date
    ? context.now.toISOString()
    : new Date(context.now || Date.now()).toISOString();
  const viewsMetric = readOptionalMetric(item, [
    'videoPlayCount',
    'videoViewCount',
    'viewCount',
    'viewsCount',
    'playsCount',
    'playCount',
    'views',
    'plays',
  ]);
  const sharesMetric = readOptionalMetric(item, ['sharesCount', 'shareCount', 'shares']);
  const savesMetric = readOptionalMetric(item, ['savesCount', 'saveCount', 'saves']);
  const durationMetric = readOptionalMetric(item, ['videoDuration', 'duration']);
  const views = viewsMetric.value;
  const likes = toNumber(item.likesCount || item.likes);
  const comments = toNumber(item.commentsCount || item.comments);
  const shares = sharesMetric.value;
  const saves = savesMetric.value;
  const thumbnailUrl = item.displayUrl || item.thumbnailUrl || item.coverUrl || item.imageUrl || item.images?.[0] || '';
  const ownerUsername = item.ownerUsername || item.username || item.owner?.username || item.user?.username || '';
  const handle = ownerUsername ? `@${String(ownerUsername).replace(/^@/, '')}` : '@instagram';
  const sourceScope = getInstagramSourceScope(item, context);
  const rankingAvailability = buildRankingAvailability({
    views: viewsMetric,
    shares: sharesMetric,
    saves: savesMetric,
    duration: durationMetric,
  });
  const title = compactText(item.caption || item.text || item.description || `Instagram Reel ${item.shortCode || item.code || item.id || ''}`, 180);
  const shortCode = item.shortCode || item.code || '';
  const url = item.url || item.inputUrl || (shortCode ? `https://www.instagram.com/reel/${shortCode}/` : '');
  const videoUrl = item.downloadedVideo
    || item.downloadedVideoUrl
    || item.videoUrl
    || item.video_url
    || item.mediaUrl
    || item.mediaUrls?.[0]
    || item.media_urls?.[0]
    || '';
  const publishedAt = item.timestamp || item.takenAtTimestamp || item.createdAt || item.date || '';
  const metadata = {
    provider: 'apify',
    providerActor: context.providerActor || 'apify/instagram-scraper',
    platform: 'instagram',
    externalId: item.id || '',
    shortCode,
    url,
    title,
    description: item.caption || item.text || item.description || '',
    handle,
    image: thumbnailUrl,
    videoUrl,
    downloadedVideoUrl: item.downloadedVideo || item.downloadedVideoUrl || '',
    audioUrl: item.audioUrl || '',
    publishedAt,
    snapshotAt,
    stats: { views, likes, comments, shares, saves },
    rawStats: {
      views,
      likes,
      comments,
      shares,
      saves,
      videoPlayCount: item.videoPlayCount ?? null,
      videoViewCount: item.videoViewCount ?? null,
      videoDuration: item.videoDuration ?? null,
    },
    rankingAvailability,
    ...sourceScope,
    source: { label: 'Instagram', tone: 'instagram' },
    sourceStatus: videoUrl ? 'apify_video' : 'apify_metadata',
    duration: durationMetric.value,
    apify: item,
    analysisText: compactText([item.caption, item.text, handle, url].filter(Boolean).join(' '), 2400),
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
    caption: item.caption || item.text || item.description || '',
    transcript: item.transcript || item.transcription || '',
    image: thumbnailUrl,
    videoUrl,
    views,
    likes,
    comments,
    shares,
    saves,
    ...rankingAvailability,
    ...sourceScope,
    hook: title,
    status: ['Instagram', 'Apify', videoUrl ? 'Player ready' : 'Metadata'],
    tag: (String(ownerUsername || 'I')[0] || 'I').toUpperCase(),
    score: buildScore({ views, likes, comments, shares, saves, publishedAt, sourceQuality: videoUrl ? 12 : 8 }),
    importedMetadata: metadata,
    createdAt: snapshotAt,
  };
}

function mapTikTokApifyItem(item = {}, context = {}) {
  const snapshotAt = context.now instanceof Date
    ? context.now.toISOString()
    : new Date(context.now || Date.now()).toISOString();
  const url = item.webVideoUrl || item.url || '';
  const tiktokVideoId = parseTikTokVideoId(url);
  const viewsMetric = readOptionalMetric(item, ['playCount']);
  const sharesMetric = readOptionalMetric(item, ['shareCount']);
  const savesMetric = readOptionalMetric(item, ['collectCount']);
  const durationMetric = readOptionalMetric(item, ['videoMeta.duration']);
  if (!durationMetric.available && !durationMetric.invalid && item.videoMeta) {
    Object.assign(durationMetric, readOptionalMetric(item.videoMeta, ['duration']));
  }
  const views = viewsMetric.value;
  const likes = toNumber(item.diggCount);
  const comments = toNumber(item.commentCount);
  const shares = sharesMetric.value;
  const saves = savesMetric.value;
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
  const sourceScope = getTikTokSourceScope(item, context);
  const rankingAvailability = buildRankingAvailability({
    views: viewsMetric,
    shares: sharesMetric,
    saves: savesMetric,
    duration: durationMetric,
  });
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
    snapshotAt,
    stats: { views, likes, comments, shares, saves },
    rawStats: { views, likes, comments, shares, saves, playCount: item.playCount ?? null },
    rankingAvailability,
    ...sourceScope,
    source: { label: 'TikTok', tone: 'tiktok' },
    sourceStatus: videoUrl ? 'apify_video' : 'apify_metadata',
    duration: durationMetric.value,
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
    ...rankingAvailability,
    ...sourceScope,
    hook: title,
    status: ['TikTok', 'Apify', videoUrl ? 'Player ready' : 'Metadata'],
    tag: (authorName[0] || 'T').toUpperCase(),
    score: buildScore({ views, likes, comments, shares, saves, publishedAt, sourceQuality: videoUrl ? 12 : 8 }),
    importedMetadata: metadata,
    createdAt: snapshotAt,
  };
}

async function runApifyActor({
  token,
  actorId,
  input,
  maxTotalChargeUsd = null,
  maxItems = null,
  fetchImpl = globalThis.fetch,
  sleepImpl = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
}) {
  if (!token) {
    const error = new Error('apify_not_configured');
    error.status = 501;
    throw error;
  }
  if (typeof fetchImpl !== 'function') throw new Error('apify_fetch_unavailable');
  const actorPath = encodeURIComponent(actorId).replace('%2F', '~');
  const runParams = new URLSearchParams();
  if (Number.isFinite(Number(maxTotalChargeUsd)) && Number(maxTotalChargeUsd) > 0) {
    runParams.set('maxTotalChargeUsd', String(Number(maxTotalChargeUsd)));
  }
  if (Number.isFinite(Number(maxItems)) && Number(maxItems) > 0) {
    runParams.set('maxItems', String(Math.trunc(Number(maxItems))));
  }
  const authorizationHeaders = { Authorization: `Bearer ${token}` };
  const runUrl = `${APIFY_API_BASE}/acts/${actorPath}/runs${runParams.size ? `?${runParams}` : ''}`;
  const runResponse = await fetchImpl(runUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authorizationHeaders },
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
    await sleepImpl(2500);
    const statusResponse = await fetchImpl(`${APIFY_API_BASE}/actor-runs/${runId}`, {
      headers: authorizationHeaders,
    });
    const statusPayload = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) throw new Error(statusPayload?.error?.message || `apify_status_failed_${statusResponse.status}`);
    run = statusPayload.data;
  }
  if (run.status !== 'SUCCEEDED') {
    const error = new Error(`apify_run_${String(run.status).toLowerCase()}`);
    error.status = 502;
    error.run = run;
    error.runId = runId;
    error.actualCostUsd = Number.isFinite(Number(run.usageTotalUsd))
      ? Number(run.usageTotalUsd)
      : null;
    throw error;
  }

  const actualCostUsd = run.usageTotalUsd === null || run.usageTotalUsd === undefined
    ? null
    : Number(run.usageTotalUsd);
  const billedCostUsd = Number.isFinite(actualCostUsd) && actualCostUsd >= 0
    ? actualCostUsd
    : null;
  const datasetId = run.defaultDatasetId;
  if (!datasetId) return { items: [], actualCostUsd: billedCostUsd, runId };
  const itemParams = new URLSearchParams({ clean: 'true', format: 'json' });
  if (Number.isFinite(Number(maxItems)) && Number(maxItems) > 0) {
    itemParams.set('limit', String(Math.trunc(Number(maxItems))));
  }
  const itemResponse = await fetchImpl(`${APIFY_API_BASE}/datasets/${datasetId}/items?${itemParams}`, {
    headers: authorizationHeaders,
  });
  const items = await itemResponse.json().catch(() => []);
  if (!itemResponse.ok) {
    const error = new Error(items?.error?.message || `apify_dataset_failed_${itemResponse.status}`);
    error.status = itemResponse.status;
    error.runId = runId;
    error.actualCostUsd = billedCostUsd;
    throw error;
  }
  return {
    items: Array.isArray(items) ? items : [],
    actualCostUsd: billedCostUsd,
    runId,
  };
}

function attachProviderRunMetadata(signals, { actualCostUsd = null, runId = null } = {}) {
  for (const [key, value] of Object.entries({ actualCostUsd, runId })) {
    Object.defineProperty(signals, key, {
      configurable: true,
      enumerable: false,
      value,
      writable: false,
    });
  }
  return signals;
}

function buildInstagramInput({ inputValue, inputType, limit, downloadVideo }) {
  const rawValue = String(inputValue || '').trim();
  const isUrl = /^https?:\/\//i.test(rawValue) || /instagram\.com\//i.test(rawValue);
  const normalizedUrl = isUrl && /^https?:\/\//i.test(rawValue) ? rawValue : isUrl ? `https://${rawValue}` : '';
  const profileHandle = inputType === 'profile'
    ? getInstagramProfileHandle(rawValue)
    : '';
  const hashtagInput = cleanSocialToken(rawValue);
  if (inputType === 'profile' || inputType === 'url') {
    const input = {
      username: profileHandle ? [profileHandle] : normalizedUrl ? [normalizedUrl] : [],
      resultsLimit: limit,
      skipPinnedPosts: true,
      skipTrialReels: false,
      includeDownloadedVideo: Boolean(downloadVideo),
    };
    if (inputType === 'profile') input.onlyPostsNewerThan = '3 months';
    return {
      actorId: 'apify/instagram-reel-scraper',
      input,
    };
  }
  if (inputType === 'search') {
    if (!rawValue) {
      const error = new Error('instagram_search_input_empty');
      error.code = 'provider_input_unsupported';
      error.status = 422;
      throw error;
    }
    return {
      actorId: 'apify/instagram-search-scraper',
      input: {
        search: rawValue,
        searchType: 'popular',
        searchLimit: limit,
      },
    };
  }
  if (inputType === 'hashtag' && !hashtagInput) {
    const error = new Error('instagram_hashtag_input_empty');
    error.code = 'provider_input_unsupported';
    error.status = 422;
    throw error;
  }
  return {
    actorId: 'apify/instagram-hashtag-scraper',
    input: {
      hashtags: hashtagInput ? [hashtagInput] : [],
      resultsType: 'reels',
      resultsLimit: limit,
      keywordSearch: inputType === 'search',
    },
  };
}

function getApifyInputSupport(options = {}) {
  const platform = String(options.platform || '').trim().toLowerCase();
  const inputType = String(options.inputType || options.mode || 'search').trim().toLowerCase();
  const inputValue = String(options.inputValue ?? options.input ?? '').trim();
  if (platform === 'instagram' && inputType === 'search') {
    return {
      supported: false,
      code: 'provider_input_unsupported',
      reason: 'instagram_search_missing_shares_saves_contract',
    };
  }
  if (platform === 'instagram' && inputType === 'hashtag' && !cleanSocialToken(inputValue)) {
    return {
      supported: false,
      code: 'provider_input_unsupported',
      reason: 'instagram_hashtag_requires_non_empty_value',
    };
  }
  return { supported: true, code: null, reason: null };
}

function assertApifyInputSupported(options = {}) {
  const support = getApifyInputSupport(options);
  if (support.supported) return support;
  const error = new Error(support.reason);
  error.code = support.code;
  error.status = 422;
  error.details = { reason: support.reason };
  throw error;
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
    return buildInstagramInput({ inputValue, inputType, limit: boundedLimit, downloadVideo });
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
    maxTotalChargeUsd,
    maxItems,
    fetchImpl,
    sleepImpl,
  } = options;
  const actorRequest = buildApifyActorRequest(options);
  assertApifyInputSupported(options);
  if (platform === 'instagram') {
    const result = await runApifyActor({
      token,
      actorId: actorRequest.actorId,
      input: actorRequest.input,
      maxTotalChargeUsd,
      maxItems,
      ...(typeof fetchImpl === 'function' ? { fetchImpl } : {}),
      ...(typeof sleepImpl === 'function' ? { sleepImpl } : {}),
    });
    return attachProviderRunMetadata(
      result.items.map((item) => mapInstagramApifyItem(item, {
        workspaceId,
        market,
        createId,
        inputType: options.inputType || options.mode,
        inputValue: options.inputValue ?? options.input,
        requestedSourceHandle: options.inputType === 'profile' || options.mode === 'profile'
          ? options.inputValue ?? options.input
          : '',
        providerActor: actorRequest.actorId,
      })),
      { actualCostUsd: result.actualCostUsd, runId: result.runId },
    );
  }
  if (platform === 'tiktok') {
    const result = await runApifyActor({
      token,
      actorId: actorRequest.actorId,
      input: actorRequest.input,
      maxTotalChargeUsd,
      maxItems,
      ...(typeof fetchImpl === 'function' ? { fetchImpl } : {}),
      ...(typeof sleepImpl === 'function' ? { sleepImpl } : {}),
    });
    return attachProviderRunMetadata(
      result.items.map((item) => mapTikTokApifyItem(item, {
        workspaceId,
        market,
        createId,
        inputType: options.inputType || options.mode,
        inputValue: options.inputValue ?? options.input,
        requestedSourceHandle: options.inputType === 'profile' || options.mode === 'profile'
          ? options.inputValue ?? options.input
          : '',
      })),
      { actualCostUsd: result.actualCostUsd, runId: result.runId },
    );
  }
  const error = new Error('unsupported_apify_platform');
  error.status = 400;
  throw error;
}

module.exports = {
  buildApifyActorRequest,
  buildScore,
  fetchApifySignals,
  getApifyInputSupport,
  getApifySignalKey,
  mapInstagramApifyItem,
  mapTikTokApifyItem,
  parseTikTokVideoId,
  runApifyActor,
};
