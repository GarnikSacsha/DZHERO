function compactText(value) {
  return String(value || '')
    .replace(/\bтут\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isEnglish(language) {
  return language === 'en';
}

function stripProfileStats(value) {
  return compactText(value)
    .replace(/\b[\d,.]+\s*[KMB]?\s+Followers\b,?\s*/gi, '')
    .replace(/\b[\d,.]+\s*[KMB]?\s+Following\b,?\s*/gi, '')
    .replace(/\b[\d,.]+\s*[KMB]?\s+Posts\b,?\s*/gi, '')
    .replace(/\s*-\s*See Instagram photos and videos\s*/gi, ' ')
    .replace(/\s*See Instagram photos and videos from\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHandle(value, handle = '') {
  const cleanHandle = compactText(handle).replace(/^@/, '');
  if (!cleanHandle) return compactText(value);
  const escaped = cleanHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return compactText(value)
    .replace(new RegExp(`@${escaped}\\b`, 'gi'), '')
    .replace(new RegExp(`\\(@?${escaped}\\)`, 'gi'), '')
    .trim();
}

function stripBrandPrefix(value) {
  const text = compactText(value)
    .replace(/^[-–—|:]+/, '')
    .replace(/[-–—|:]+$/, '')
    .trim();
  const parts = text.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return text;
  const [first, ...rest] = parts;
  const firstLooksLikeBrand = /^[A-Z0-9_ .]{3,}$/.test(first) || /^[\w.]+$/i.test(first);
  return firstLooksLikeBrand ? rest.join(' - ') : text;
}

function isGenericPlatformMeta(value) {
  return /create an account|log in to instagram|share what you're into|people who get you|instagram\.com/i.test(compactText(value));
}

export function extractCleanBrandProduct({ title = '', description = '', handle = '', label = '' } = {}) {
  const candidates = [description, title]
    .map((value) => stripBrandPrefix(stripHandle(stripProfileStats(value), handle)))
    .map((value) => value.replace(/^[-–—|:]+/, '').trim())
    .filter(Boolean)
    .filter((value) => !/^(followers|following|posts)$/i.test(value))
    .filter((value) => !/See Instagram photos and videos/i.test(value))
    .filter((value) => !isGenericPlatformMeta(value));

  const useful = candidates.find((value) => /workout|training|трен|beauty|health|курс|послуг|shop|store|studio|salon|fitness|wellness|app/i.test(value));
  if (useful) return compactText(useful);
  const fallback = candidates[0] || '';
  if (label && (!fallback || /\bstats?\b/i.test(fallback) || fallback.split(/\s+/).length <= 2)) return compactText(label);
  return compactText(fallback || label || '');
}

function buildAudience(product, label, language = 'uk') {
  const text = `${product} ${label}`.toLowerCase();
  if (/workout|training|fitness|wellness|health|трен/.test(text)) {
    return isEnglish(language)
      ? 'people who want short health and beauty workouts without a long gym routine'
      : 'люди, які хочуть короткі тренування для здоровʼя і краси без довгої рутини в залі';
  }
  if (/beauty|salon|манік|крас/.test(text)) {
    return isEnglish(language)
      ? 'people who want a simple beauty service booking with a clear result'
      : 'люди, які хочуть швидко записатися на beauty-послугу і бачити зрозумілий результат';
  }
  if (/shop|store|одяг|clothes|fashion/.test(text)) {
    return isEnglish(language)
      ? 'people choosing a product now and needing clear styles, prices and proof'
      : 'люди, які обирають товар зараз і хочуть бачити стиль, ціну та докази';
  }
  return isEnglish(language)
    ? `people who need ${product || label || 'this product'} and are likely to buy now`
    : `люди, яким потрібен ${product || label || 'цей продукт'} і які можуть купити зараз`;
}

function buildOffer(product, label, language = 'uk') {
  const text = `${product} ${label}`.toLowerCase();
  if (/20[-\s]?minute|workout|training|трен/.test(text)) {
    return isEnglish(language)
      ? 'a 20-minute starter workout people can save and try today'
      : '20-хвилинне стартове тренування, яке можна зберегти і спробувати сьогодні';
  }
  return isEnglish(language)
    ? `main offer for ${product || label || 'the product'}`
    : `головна пропозиція для ${product || label || 'продукту'}`;
}

function buildCta(product, exampleCaption = '', language = 'uk') {
  const text = `${product} ${exampleCaption}`.toLowerCase();
  if (/\bstart\b/.test(text) && /workout|training|20[-\s]?minute|трен/.test(text)) {
    return isEnglish(language)
      ? 'write START to get the first mini workout'
      : 'написати START, щоб отримати перше міні-тренування';
  }
  if (/direct|dm|message|напис/.test(text)) {
    return isEnglish(language)
      ? 'write in Direct to get details or book'
      : 'написати в Direct, щоб отримати деталі або записатися';
  }
  return isEnglish(language)
    ? 'write in Direct to book or ask for details'
    : 'написати в Direct, щоб записатися або уточнити деталі';
}

export function buildBrandBrainDraft({
  label = '',
  title = '',
  description = '',
  handle = '',
  stats = {},
  exampleCaption = '',
  language = 'uk',
} = {}) {
  const businessType = compactText(label || (isEnglish(language) ? 'local business' : 'локальний бізнес'));
  const product = extractCleanBrandProduct({ title, description, handle, label: businessType }) || businessType;
  const proof = [
    stats.followers && `${stats.followers} followers`,
    stats.posts && `${stats.posts} posts`,
    compactText(title) && stripHandle(stripProfileStats(title), handle),
  ].filter(Boolean).join(' · ');

  return {
    businessType,
    product,
    audience: buildAudience(product, businessType, language),
    offer: buildOffer(product, businessType, language),
    cta: buildCta(product, exampleCaption, language),
    proof,
  };
}
