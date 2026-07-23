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
    .replace(/^from\s+/i, '')
    .replace(/^[-–—|:]+/, '')
    .replace(/[-–—|:]+$/, '')
    .replace(/\(\s*\)/g, '')
    .trim();
  const parts = text.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return text;
  const [first, ...rest] = parts;
  const firstLooksLikeBrand = /^[A-Z0-9_ .]{3,}$/.test(first) || /^[\w.]+$/i.test(first);
  return firstLooksLikeBrand ? rest.join(' - ') : text;
}

function normalizeProductPhrase(value) {
  const text = compactText(value)
    .replace(/^from\s+/i, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (/майк|футбол|бод[іи]|лонгслів|сукн|комбінез|топ|одяг|clothes|fashion/i.test(text)) {
    return text.toLowerCase();
  }
  return text;
}

function isGenericPlatformMeta(value) {
  const text = compactText(value);
  return /^(?:watch\s+on\s+)?(?:instagram|tiktok|youtube)(?:\s+(?:profile|page|account|channel|videos?|shorts|reels|photos?|posts))?$/i.test(text)
    || /create an account|log in to instagram|share what you're into|people who get you|instagram\.com|see instagram photos and videos/i.test(text);
}

function isProductionDraftTitle(value) {
  return /^(short-form|reels|shorts|stories|story|carousel|пост|сторіс|карусель)\s*:/i.test(compactText(value));
}

export function extractCleanBrandProduct({ title = '', description = '', handle = '', label = '' } = {}) {
  const candidates = [description, title]
    .map((value) => stripBrandPrefix(stripHandle(stripProfileStats(value), handle)))
    .map((value) => value.replace(/^[-–—|:]+/, '').trim())
    .filter(Boolean)
    .filter((value) => !/^(followers|following|posts)$/i.test(value))
    .filter((value) => !/See Instagram photos and videos/i.test(value))
    .filter((value) => !isGenericPlatformMeta(value))
    .filter((value) => !isProductionDraftTitle(value));

  const useful = candidates.find((value) => /workout|training|трен|beauty|health|курс|послуг|shop|store|studio|salon|fitness|wellness|app|майк|футбол|бод[іи]|лонгслів|сукн|комбінез|топ|одяг|clothes|fashion/i.test(value));
  if (useful) return normalizeProductPhrase(useful);
  const fallback = candidates[0] || '';
  if (label && (!fallback || /\bstats?\b/i.test(fallback) || fallback.split(/\s+/).length <= 2)) return compactText(label);
  return normalizeProductPhrase(fallback || label || '');
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
  if (/майк|футбол|бод[іи]|лонгслів|сукн|комбінез|топ|одяг|clothes|fashion/.test(text)) {
    return isEnglish(language)
      ? 'women choosing stylish everyday clothes online and wanting to see fit, fabric and outfit ideas before buying'
      : 'жінки, які обирають стильний повсякденний одяг онлайн і хочуть бачити посадку, тканину та готові образи перед покупкою';
  }
  if (/shop|store|магаз|товар/.test(text)) {
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
  if (/майк|футбол|бод[іи]|лонгслів|сукн|комбінез|топ|одяг|clothes|fashion/.test(text)) {
    return isEnglish(language)
      ? 'everyday clothing pieces and ready outfit ideas people can order in Direct'
      : 'актуальні речі для повсякденних образів, які можна замовити в Direct';
  }
  if (/shop|store|магаз|товар/.test(text)) {
    return isEnglish(language)
      ? 'a clear product selection with details, proof and an easy order step'
      : 'зрозумілий вибір товарів з деталями, доказами і простим кроком до замовлення';
  }
  return isEnglish(language)
    ? `clear next step for people interested in ${product || label || 'the product'}`
    : `зрозуміла пропозиція для людей, яким потрібен ${product || label || 'цей продукт'}`;
}

function buildCta(product, exampleCaption = '', language = 'uk') {
  const text = `${product} ${exampleCaption}`.toLowerCase();
  if (/\bstart\b/.test(text) && /workout|training|20[-\s]?minute|трен/.test(text)) {
    return isEnglish(language)
      ? 'write START to get the first mini workout'
      : 'написати START, щоб отримати перше міні-тренування';
  }
  if (/майк|футбол|бод[іи]|лонгслів|сукн|комбінез|топ|одяг|clothes|fashion/.test(text)) {
    return isEnglish(language)
      ? 'write in Direct to check availability, size or order'
      : 'написати в Direct, щоб уточнити наявність, розмір або замовити';
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
  const product = extractCleanBrandProduct({ title, description, handle, label: '' });
  const proof = [
    stats.followers && `${stats.followers} followers`,
    stats.posts && `${stats.posts} posts`,
    compactText(title) && !isProductionDraftTitle(title) && !isGenericPlatformMeta(title) && normalizeProductPhrase(stripBrandPrefix(stripHandle(stripProfileStats(title), handle))),
  ].filter(Boolean).join(' · ');

  return {
    businessType,
    product,
    audience: '',
    offer: '',
    cta: '',
    toneOfVoice: '',
    proof,
  };
}
