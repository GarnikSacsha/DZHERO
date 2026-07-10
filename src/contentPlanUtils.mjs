export function normalizeContentIdentity(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

export function buildReelFromCalendarPost(post = {}) {
  const title = String(post.title || 'Контент-план draft').trim();
  const sourceUrl = String(post.sourceUrl || '').trim();
  return {
    id: post.sourceReelId || post.id || `calendar-${Date.now()}`,
    title,
    hook: title,
    handle: post.sourceHandle || post.source || 'content-plan',
    market: 'ua',
    score: 78,
    views: '-',
    likes: '-',
    comments: '-',
    sourceUrl,
    status: [post.format || 'Post', 'Контент-план'],
    importedMetadata: {
      url: sourceUrl,
      source: { label: post.source || 'content-plan' },
    },
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
