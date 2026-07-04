export function stripHashtags(text) {
  return String(text || '').replace(/#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function hasMojibake(text) {
  const value = String(text || '');
  const mojibakeMatches = value.match(/[Р РЎ][\u0400-\u04ffA-Za-z0-9вЂ“-]{1,}/g) || [];
  return mojibakeMatches.length >= 3 || /[Р РЎ][A-Za-z]?РІР‚|Р [В Р РЋ]/.test(value);
}

export function hasUsefulSourceContext(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (hasMojibake(raw)) return false;
  const withoutHashtags = stripHashtags(raw);
  if (withoutHashtags.length < 24) return false;
  const hashtagCount = (raw.match(/#[\p{L}\p{N}_-]+/gu) || []).length;
  const wordCount = (withoutHashtags.match(/[\p{L}\p{N}'"$@]+/gu) || []).length;
  return !(hashtagCount >= 3 && wordCount < 8);
}

export function sanitizeSourceContext(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!hasUsefulSourceContext(raw)) return '';
  return raw;
}
