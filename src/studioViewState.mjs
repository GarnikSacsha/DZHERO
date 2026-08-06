const GENERATING_STATES = new Set([
  'analyzing',
  'generating',
  'loading',
  'pending',
  'processing',
  'queued',
  'running',
]);

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function safeExternalUrl(value) {
  const raw = cleanText(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function formatTimestamp(value) {
  if (typeof value === 'string' && /^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.trim())) {
    return value.trim();
  }
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
}

function normalizeSegment(segment, index) {
  if (typeof segment === 'string') {
    const text = cleanText(segment);
    return text ? { id: `segment-${index}`, time: '', text } : null;
  }
  if (!segment || typeof segment !== 'object') return null;
  const text = cleanText(segment.text || segment.transcript || segment.caption || segment.value);
  if (!text) return null;
  return {
    id: cleanText(segment.id) || `segment-${index}`,
    time: formatTimestamp(
      segment.start
      ?? segment.startTime
      ?? segment.offset
      ?? segment.timestamp
      ?? segment.startSeconds,
    ),
    text,
  };
}

function normalizeSegments(value) {
  return Array.isArray(value)
    ? value.map(normalizeSegment).filter(Boolean)
    : [];
}

function normalizeStatus(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, '_');
}

export function getStudioSourceLinks(signal = {}) {
  const metadata = signal.importedMetadata || {};
  const youtube = metadata.youtube || {};
  const originalUrl = safeExternalUrl(
    signal.sourceUrl
    || metadata.url
    || signal.url,
  );
  const explicitProfileUrl = safeExternalUrl(
    signal.profileUrl
    || signal.sourceProfileUrl
    || metadata.sourceProfileUrl
    || metadata.profileUrl
    || youtube.channelUrl,
  );
  const channelId = cleanText(youtube.channelId);
  const profileUrl = explicitProfileUrl
    || (channelId ? `https://www.youtube.com/channel/${encodeURIComponent(channelId)}` : '');

  return { originalUrl, profileUrl };
}

export function deriveStudioTranscript(signal = {}) {
  const intelligence = signal.importedMetadata?.videoIntelligence || {};
  const transcript = intelligence.transcript || {};
  const video = intelligence.video || {};
  const directSegments = normalizeSegments(transcript.segments);
  const reelSegments = normalizeSegments(signal.transcript);
  const segments = directSegments.length ? directSegments : reelSegments;
  const transcriptText = cleanText(
    transcript.text
    || (typeof signal.transcript === 'string' ? signal.transcript : ''),
  );
  const spokenText = cleanText(video.spokenText);
  const onScreenText = cleanText(video.onScreenText);
  const statusValue = normalizeStatus(
    transcript.status
    || signal.transcriptStatus
    || intelligence.transcriptStatus,
  );
  const hasContent = Boolean(segments.length || transcriptText || spokenText || onScreenText);

  return {
    status: hasContent
      ? 'available'
      : GENERATING_STATES.has(statusValue)
        ? 'generating'
        : 'unavailable',
    language: cleanText(transcript.language || transcript.languageCode),
    segments,
    spokenText: segments.length ? '' : (spokenText || transcriptText),
    onScreenText,
  };
}

function pushAnalysisItem(items, id, label, value) {
  const text = cleanText(value);
  if (text && !items.some((item) => item.text === text)) items.push({ id, label, text });
}

export function deriveStudioAnalysis(signal = {}) {
  const analysis = signal.analysis && typeof signal.analysis === 'object' ? signal.analysis : {};
  const video = signal.importedMetadata?.videoIntelligence?.video || {};
  const items = [];

  pushAnalysisItem(items, 'recommendation', 'recommendation', analysis.recommendation);
  pushAnalysisItem(items, 'notes', 'notes', analysis.notes);
  pushAnalysisItem(items, 'summary', 'summary', video.videoSummary);
  pushAnalysisItem(items, 'hook', 'hook', video.hook);
  pushAnalysisItem(items, 'mechanic', 'mechanic', video.contentMechanic);

  if (Array.isArray(analysis.signals)) {
    analysis.signals.forEach((value, index) => pushAnalysisItem(items, `signal-${index}`, 'signal', value));
  } else if (analysis.signals && typeof analysis.signals === 'object') {
    Object.entries(analysis.signals).forEach(([key, value]) => pushAnalysisItem(items, `signal-${key}`, 'signal', value));
  }
  if (Array.isArray(video.sceneBeats)) {
    video.sceneBeats.forEach((value, index) => pushAnalysisItem(items, `beat-${index}`, 'scene', value));
  }

  const statusValue = normalizeStatus(
    signal.analysisStatus
    || signal.importedMetadata?.videoIntelligence?.readiness?.status,
  );

  return {
    status: items.length
      ? 'available'
      : GENERATING_STATES.has(statusValue)
        ? 'generating'
        : 'unavailable',
    items,
  };
}

export function getStudioRemixes(signal = {}, adaptation = null) {
  const remixes = adaptation?.result?.remixes
    || adaptation?.remixes
    || signal.remixResult?.remixes;
  return Array.isArray(remixes)
    ? remixes.filter((remix) => remix && typeof remix === 'object')
    : [];
}

export function getStudioRemix(signal = {}, adaptation = null) {
  return getStudioRemixes(signal, adaptation)[0] || null;
}

export function normalizeStudioScriptScenes(signal = {}, adaptation = null, remixOverride = null) {
  const remix = remixOverride || getStudioRemix(signal, adaptation);
  if (!remix || !Array.isArray(remix.visualFlow)) return [];
  return remix.visualFlow
    .map((scene, index) => {
      if (!scene || typeof scene !== 'object') return null;
      const direction = cleanText(scene.actionDescription);
      const onScreenText = cleanText(scene.onScreenText);
      const voiceover = cleanText(scene.audioVoiceover);
      if (!direction && !onScreenText && !voiceover) return null;
      return {
        id: `scene-${index}`,
        time: cleanText(scene.timeframe),
        direction,
        onScreenText,
        voiceover,
      };
    })
    .filter(Boolean);
}
