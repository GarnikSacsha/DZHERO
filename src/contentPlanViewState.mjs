export const CONTENT_PLAN_FORMATS = Object.freeze(['Reels', 'Stories', 'Post', 'TikTok']);
export const CONTENT_PLAN_STATUSES = Object.freeze(['scheduled', 'completed']);
export const CONTENT_PLAN_STORAGE_PREFIX = 'dzhero-preview-content-plan-v2';

function clean(value) {
  return String(value || '').trim();
}

export function toLocalIsoDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalIsoDate(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getContentPlanStorageKey(brandId) {
  const normalizedBrand = clean(brandId).replace(/[^a-z0-9_-]+/gi, '-').slice(0, 120);
  return `${CONTENT_PLAN_STORAGE_PREFIX}:${normalizedBrand || 'primary-brand'}`;
}

export function normalizeContentPlanEntry(entry = {}) {
  const date = parseLocalIsoDate(entry.date);
  const title = clean(entry.title || entry.customTitle);
  if (!title || !date) return null;
  const format = CONTENT_PLAN_FORMATS.includes(entry.format) ? entry.format : 'Reels';
  const status = CONTENT_PLAN_STATUSES.includes(entry.status)
    ? entry.status
    : entry.done === true
      ? 'completed'
      : 'scheduled';
  const time = /^\d{2}:\d{2}$/.test(clean(entry.time)) ? clean(entry.time) : '10:00';
  const id = clean(entry.id) || `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    title,
    date: toLocalIsoDate(date),
    time,
    format,
    status,
    body: clean(entry.body || entry.script),
    source: clean(entry.source),
    sourceTitle: clean(entry.sourceTitle),
    sourceUrl: clean(entry.sourceUrl),
    sourceSignalId: clean(entry.sourceSignalId),
    origin: clean(entry.origin),
    sourceAdaptationId: clean(entry.sourceAdaptationId),
    sourceGenerationId: clean(entry.sourceGenerationId),
    sourceVariantIndex: Number.isInteger(entry.sourceVariantIndex) ? entry.sourceVariantIndex : null,
    hook: clean(entry.hook),
    cta: clean(entry.cta),
    scenes: Array.isArray(entry.scenes) ? entry.scenes.slice(0, 20) : [],
    brandId: clean(entry.brandId),
    brandKey: clean(entry.brandKey),
    brandVersion: clean(entry.brandVersion),
    createdAt: clean(entry.createdAt) || new Date().toISOString(),
    updatedAt: clean(entry.updatedAt) || new Date().toISOString(),
  };
}

export function sortContentPlanEntries(entries = []) {
  return [...entries].sort((a, b) => (
    a.date.localeCompare(b.date)
    || a.time.localeCompare(b.time)
    || a.title.localeCompare(b.title)
  ));
}

export function readContentPlanEntries(storage, brandId) {
  try {
    const parsed = JSON.parse(storage?.getItem(getContentPlanStorageKey(brandId)) || '[]');
    return sortContentPlanEntries(
      (Array.isArray(parsed) ? parsed : []).map(normalizeContentPlanEntry).filter(Boolean),
    );
  } catch {
    return [];
  }
}

export function writeContentPlanEntries(storage, brandId, entries = []) {
  const normalized = sortContentPlanEntries(entries.map(normalizeContentPlanEntry).filter(Boolean));
  storage?.setItem(getContentPlanStorageKey(brandId), JSON.stringify(normalized));
  return normalized;
}

export function upsertContentPlanEntry(entries = [], draft = {}, existingId = '') {
  const now = new Date().toISOString();
  const candidate = normalizeContentPlanEntry({
    ...draft,
    id: existingId || draft.id || `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: draft.createdAt || now,
    updatedAt: now,
  });
  if (!candidate) return sortContentPlanEntries(entries);
  const previous = entries.find((entry) => entry.id === existingId);
  const next = existingId
    ? entries.map((entry) => (entry.id === existingId ? {
      ...candidate,
      createdAt: previous?.createdAt || candidate.createdAt,
    } : entry))
    : [...entries, candidate];
  return sortContentPlanEntries(next);
}

export function mergeStudioDraftIntoPlan(entries = [], draft = {}, fallbackDate = toLocalIsoDate()) {
  const title = clean(draft.title);
  if (!title) return sortContentPlanEntries(entries);
  const sourceSignalId = clean(draft.sourceSignalId);
  const sourceUrl = clean(draft.sourceUrl);
  const duplicate = entries.some((entry) => (
    sourceSignalId && entry.sourceSignalId === sourceSignalId
  ) || (
    sourceUrl && entry.sourceUrl === sourceUrl && entry.title === title
  ));
  if (duplicate) return sortContentPlanEntries(entries);

  return upsertContentPlanEntry(entries, {
    title,
    body: draft.body,
    date: parseLocalIsoDate(draft.date) ? draft.date : fallbackDate,
    time: draft.time || '10:00',
    format: CONTENT_PLAN_FORMATS.includes(draft.format) ? draft.format : 'Reels',
    status: 'scheduled',
    source: clean(draft.source) || 'Studio',
    sourceTitle: draft.sourceTitle,
    sourceUrl,
    sourceSignalId,
  });
}

export function buildMonthCells(anchorDate) {
  const anchor = anchorDate instanceof Date ? anchorDate : new Date(anchorDate);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date,
      iso: toLocalIsoDate(date),
      day: date.getDate(),
      outside: date.getMonth() !== anchor.getMonth(),
    };
  });
}

export function buildWeekDays(anchorDate) {
  const anchor = anchorDate instanceof Date ? new Date(anchorDate) : new Date(anchorDate);
  const offset = (anchor.getDay() + 6) % 7;
  anchor.setHours(12, 0, 0, 0);
  anchor.setDate(anchor.getDate() - offset);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() + index);
    return { date, iso: toLocalIsoDate(date), day: date.getDate() };
  });
}

function escapeCsv(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildContentPlanCsv(entries = [], {
  scheduledLabel = 'Scheduled',
  completedLabel = 'Completed',
  headers = ['Title', 'Date', 'Time', 'Format', 'Status', 'Source', 'Source URL', 'Script'],
} = {}) {
  const rows = sortContentPlanEntries(entries).map((entry) => [
    entry.title,
    entry.date,
    entry.time,
    entry.format,
    entry.status === 'completed' ? completedLabel : scheduledLabel,
    entry.source || entry.sourceTitle,
    entry.sourceUrl,
    entry.body,
  ]);
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}
