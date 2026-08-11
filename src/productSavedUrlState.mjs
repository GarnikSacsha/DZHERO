const PLATFORM_LABELS = Object.freeze({
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
});

export function getSavedUrlPlatformLabel(platform) {
  return PLATFORM_LABELS[String(platform || '').toLowerCase()] || 'Video';
}

export function getSavedUrlIdentity({ workspaceId = '' } = {}) {
  return String(workspaceId || '');
}

export function getPersonalUrlAdaptationIdentity({ workspaceId = '', savedUrlId = '', brandRevision = '' } = {}) {
  return `${workspaceId}:${savedUrlId}:${brandRevision}`;
}

export function isCurrentSavedUrlResponse({ requestRevision, currentRevision, requestWorkspaceId, currentWorkspaceId, cancelled = false } = {}) {
  return !cancelled
    && requestRevision === currentRevision
    && requestWorkspaceId === currentWorkspaceId;
}

export function isCurrentPersonalUrlAdaptationResponse({ requestRevision, currentRevision, requestIdentity, currentIdentity, cancelled = false } = {}) {
  return !cancelled
    && requestRevision === currentRevision
    && requestIdentity === currentIdentity;
}

export function mapSavedUrlToProductSignal(savedUrl, adaptation = null) {
  if (!savedUrl?.id) return null;
  const sourceContext = adaptation?.sourceContext || {};
  const sourceMetadata = sourceContext.metadata && typeof sourceContext.metadata === 'object'
    ? sourceContext.metadata
    : {};
  const youtube = sourceMetadata.youtube && typeof sourceMetadata.youtube === 'object'
    ? sourceMetadata.youtube
    : {};
  const platformLabel = getSavedUrlPlatformLabel(savedUrl.platform);
  const title = String(sourceContext.title || '').trim() || `Personal ${platformLabel} video`;
  const description = String(sourceContext.description || sourceMetadata.description || '').trim();
  const handle = String(sourceContext.handle || sourceMetadata.handle || '').trim();
  const image = String(
    sourceContext.image
    || sourceMetadata.image
    || sourceContext.thumbnail
    || sourceMetadata.thumbnail
    || youtube.thumbnail
    || '',
  ).trim();
  const thumbnail = String(
    sourceContext.thumbnail
    || sourceMetadata.thumbnail
    || youtube.thumbnail
    || sourceContext.image
    || sourceMetadata.image
    || '',
  ).trim();
  const profileUrl = String(
    sourceContext.profileUrl
    || sourceMetadata.profileUrl
    || sourceContext.sourceProfileUrl
    || sourceMetadata.sourceProfileUrl
    || youtube.channelUrl
    || '',
  ).trim();
  const sourceProfileUrl = String(
    sourceContext.sourceProfileUrl
    || sourceMetadata.sourceProfileUrl
    || profileUrl
    || '',
  ).trim();
  const canonicalUrl = String(savedUrl.canonicalUrl || sourceContext.canonicalUrl || '').trim();
  return {
    id: `personal_url:${savedUrl.id}`,
    sourceType: 'personal_url',
    personalUrl: true,
    savedUrlId: savedUrl.id,
    sourceUrl: canonicalUrl,
    canonicalUrl,
    originalUrl: savedUrl.originalUrl || canonicalUrl,
    platform: savedUrl.platform || 'video',
    title,
    description,
    creator: handle,
    handle,
    image,
    thumbnail,
    profileUrl,
    sourceProfileUrl,
    views: null,
    likes: null,
    aiMatch: null,
    niche: '',
    tags: [],
    importedMetadata: {
      source: { label: platformLabel, tone: 'personal_url' },
      url: canonicalUrl,
      title,
      description,
      handle,
      image,
      thumbnail,
      profileUrl,
      sourceProfileUrl,
      youtube,
      sourceStatus: sourceContext.sourceStatus || sourceMetadata.sourceStatus || '',
      readiness: sourceContext.readiness || sourceContext.videoIntelligence?.readiness || null,
      grounding: sourceContext.grounding || sourceContext.sourceGrounding || null,
      visual: sourceContext.visual || sourceContext.videoIntelligence?.visual || null,
      videoIntelligence: sourceContext.videoIntelligence || null,
    },
    transcript: sourceContext.transcript?.text || '',
    analysis: sourceContext.analysis || {},
    rawPersonalUrl: savedUrl,
    personalUrlAdaptation: adaptation,
  };
}

export function upsertSavedUrl(savedUrls, savedUrl) {
  if (!savedUrl?.id) return Array.isArray(savedUrls) ? savedUrls : [];
  const current = Array.isArray(savedUrls) ? savedUrls : [];
  return [savedUrl, ...current.filter((item) => item.id !== savedUrl.id && item.canonicalUrl !== savedUrl.canonicalUrl)];
}
