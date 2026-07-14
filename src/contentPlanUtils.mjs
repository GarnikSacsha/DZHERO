import { createTranslator } from './i18nCore.mjs';

export function normalizeContentIdentity(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function cleanContentPlanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function buildStudioContentPlanDraft(reel = {}) {
  const remix = reel.remixResult?.remixes?.[0];
  if (!remix) return null;

  const hook = cleanContentPlanText(remix.hook);
  const title = (cleanContentPlanText(remix.title)
    || hook.slice(0, 120)
    || 'AI-адаптація для Reels').slice(0, 180);
  const shotBlocks = (Array.isArray(remix.visualFlow) ? remix.visualFlow : [])
    .map((step) => {
      const timeframe = cleanContentPlanText(step?.timeframe);
      const action = cleanContentPlanText(step?.actionDescription);
      const onScreenText = cleanContentPlanText(step?.onScreenText);
      const voiceover = cleanContentPlanText(step?.audioVoiceover);
      return [
        timeframe,
        action && `Кадр: ${action}`,
        onScreenText && `Текст на екрані: ${onScreenText}`,
        voiceover && `Озвучка: ${voiceover}`,
      ].filter(Boolean).join('\n');
    })
    .filter(Boolean);
  const cta = cleanContentPlanText(remix.cta);
  const body = [
    hook && `Хук: ${hook}`,
    ...shotBlocks,
    cta && `CTA: ${cta}`,
  ].filter(Boolean).join('\n\n');

  return { title, body };
}

export function buildCalendarPostSourceKey(source = {}) {
  const existingSourceKey = normalizeContentIdentity(source.sourceKey);
  if (existingSourceKey) return existingSourceKey;

  const identity = normalizeContentIdentity(
    source.sourceUrl
    || source.profileUrl
    || source.importedMetadata?.url
    || source.id
    || source.scanLabel
    || source.title
    || source.scanExample?.title
  );
  return identity ? `brand-scan:${identity.slice(0, 140)}` : '';
}

export function findReelForCalendarPost(post = {}, reels = []) {
  const postSourceKey = normalizeContentIdentity(post.sourceKey);
  if (!postSourceKey) return null;

  return reels.find((reel) => {
    const reelKeys = [
      buildCalendarPostSourceKey(reel),
      normalizeContentIdentity(reel.id),
      normalizeContentIdentity(reel.sourceUrl),
      normalizeContentIdentity(reel.importedMetadata?.url),
      normalizeContentIdentity(reel.title),
    ].filter(Boolean);
    return reelKeys.includes(postSourceKey);
  }) || null;
}

export function isDuplicateContentPlanPost(existing = {}, candidate = {}) {
  const existingSourceKey = normalizeContentIdentity(existing.sourceKey);
  const sameSource = existingSourceKey
    && existingSourceKey === normalizeContentIdentity(candidate.sourceKey);
  const sameTitle = normalizeContentIdentity(existing.title) === normalizeContentIdentity(candidate.title);
  const sameFormat = normalizeContentIdentity(existing.format) === normalizeContentIdentity(candidate.format);
  return candidate.source === 'studio_ai'
    ? Boolean(sameSource && sameTitle)
    : Boolean(sameSource || (sameTitle && sameFormat));
}

export function buildReelFromCalendarPost(post = {}, { language = 'uk' } = {}) {
  const t = createTranslator(language);
  const title = String(post.title || t('plan.fallbackDraft')).trim();
  const body = String(post.body || '').trim();
  const sourceTitle = String(post.sourceTitle || '').trim();
  const sourceUrl = String(post.sourceUrl || '').trim();
  return {
    id: post.sourceReelId || post.id || `calendar-${Date.now()}`,
    title,
    sourceTitle,
    hook: body || title,
    caption: body || title,
    calendarScenario: body,
    handle: post.sourceHandle || post.source || 'content-plan',
    market: 'ua',
    score: 78,
    views: '-',
    likes: '-',
    comments: '-',
    quality: t('plan.quality.calendar'),
    sourceUrl,
    status: [post.format || 'Post', t('plan.status.contentPlan')],
    importedMetadata: {
      url: sourceUrl,
      source: { label: post.source || 'content-plan' },
    },
  };
}

export function buildReelForCalendarPost(post = {}, reels = [], { language = 'uk' } = {}) {
  const calendarDraft = buildReelFromCalendarPost(post, { language });
  const sourceReel = findReelForCalendarPost(post, reels);
  if (!sourceReel) return calendarDraft;

  return {
    ...sourceReel,
    title: calendarDraft.title,
    sourceTitle: calendarDraft.sourceTitle || sourceReel.sourceTitle || sourceReel.title || '',
    hook: calendarDraft.hook,
    caption: calendarDraft.caption,
    calendarScenario: calendarDraft.calendarScenario,
  };
}

export function buildCalendarRemixScenario(reel = {}) {
  const body = String(reel.calendarScenario || '').trim();
  if (!body) return null;

  const sections = body.split(/\n{2,}/).map((section) => section.trim()).filter(Boolean);
  return {
    quality: 'Сценарій відкрито з контент-плану',
    insight: 'Це збережена версія сценарію з календарної події.',
    checklist: [],
    script: sections.map((section, index) => ({
      time: index === 0 ? 'Draft' : '',
      frame: index === 0 ? reel.title || 'Збережений сценарій' : `Блок ${index + 1}`,
      voice: section,
    })),
    variants: [{
      title: reel.title || 'AI-адаптація для Reels',
      hook: sections[0] || '',
      structure: sections,
    }],
  };
}

export function buildEditableContentNote(note = {}, index = 0) {
  const id = String(note.id || `generated-note-${index}`);
  const title = String(note.title || note.hook || 'Note').trim();
  const body = String(note.hook || note.angle || note.body || 'Ідея готова до сценарію або календаря.').trim();
  return {
    ...note,
    id,
    title,
    hook: body,
    source: note.source || note.status || 'generated',
    origin: String(note.origin || '').trim() || (id.startsWith('manual-note-') ? 'manual' : 'generated'),
  };
}

export function mergeEditableNotes(storedNotes = [], generatedIdeas = []) {
  const stored = Array.isArray(storedNotes) ? storedNotes.map(buildEditableContentNote) : [];
  const storedIds = new Set(stored.map((note) => String(note.id)));
  const generated = Array.isArray(generatedIdeas)
    ? generatedIdeas
      .map(buildEditableContentNote)
      .filter((note) => !storedIds.has(String(note.id)))
    : [];
  return [...stored, ...generated];
}

export function updateEditableNote(notes = [], noteId, patch = {}) {
  return notes.map((note) => (
    String(note.id) === String(noteId)
      ? buildEditableContentNote({ ...note, ...patch, origin: note.origin || 'manual' })
      : note
  ));
}
