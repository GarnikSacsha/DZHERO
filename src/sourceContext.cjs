function stripHashtags(text) {
  return String(text || '').replace(/#[\p{L}\p{N}_-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function hasMojibake(text) {
  const value = String(text || '');
  const mojibakeMatches = value.match(/[РС][\u0400-\u04ffA-Za-z0-9–-]{1,}/g) || [];
  return mojibakeMatches.length >= 3 || /[РС][A-Za-z]?вЂ|Р[ РЎ]/.test(value);
}

function hasUsefulSourceContext(text) {
  const raw = String(text || '').trim();
  if (!raw) return false;
  if (hasMojibake(raw)) return false;
  const withoutHashtags = stripHashtags(raw);
  if (withoutHashtags.length < 24) return false;
  const hashtagCount = (raw.match(/#[\p{L}\p{N}_-]+/gu) || []).length;
  const wordCount = (withoutHashtags.match(/[\p{L}\p{N}'"$@]+/gu) || []).length;
  return !(hashtagCount >= 3 && wordCount < 8);
}

function sanitizeSourceContext(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!hasUsefulSourceContext(raw)) return '';
  return raw;
}

module.exports = {
  hasMojibake,
  hasUsefulSourceContext,
  sanitizeSourceContext,
  stripHashtags,
};
