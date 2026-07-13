function compactText(value = '', maxLength = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function clampConfidence(value, fallback = 0.54) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function unique(values = [], limit = 8) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = compactText(value, 120);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeArray(value, limit = 8) {
  if (Array.isArray(value)) return unique(value, limit);
  if (!value) return [];
  return unique(String(value).split(/[,;\n]/), limit);
}

function normalizeBrief(value = {}) {
  return {
    brandName: compactText(value.brandName, 120),
    businessType: compactText(value.businessType || value.niche, 180),
    product: compactText(value.product || value.offer, 260),
    audience: compactText(value.audience, 360),
    location: compactText(value.location, 160),
    offer: compactText(value.offer, 360),
    cta: compactText(value.cta, 220),
    toneOfVoice: compactText(value.toneOfVoice || value.tone, 220),
    proof: compactText(value.proof, 420),
    contentPillars: normalizeArray(value.contentPillars || value.pillars, 8),
    keywords: normalizeArray(value.keywords, 10),
    stopTopics: normalizeArray(value.stopTopics, 8),
  };
}

function getSignalStats(signal = {}) {
  const metadataStats = signal.importedMetadata?.stats || {};
  return {
    views: Number(signal.views || metadataStats.views || 0) || 0,
    likes: Number(signal.likes || metadataStats.likes || 0) || 0,
    comments: Number(signal.comments || metadataStats.comments || 0) || 0,
  };
}

function summarizeApifySignals(apifySignals = []) {
  return (Array.isArray(apifySignals) ? apifySignals : [])
    .slice(0, 12)
    .map((signal) => {
      const stats = getSignalStats(signal);
      const text = compactText([
        signal.title,
        signal.caption,
        signal.transcript,
        signal.importedMetadata?.description,
      ].filter(Boolean).join(' '), 700);
      return {
        handle: signal.handle || signal.sourceHandle || signal.importedMetadata?.handle || '',
        title: compactText(signal.title, 160),
        caption: compactText(signal.caption || signal.importedMetadata?.description, 420),
        url: signal.sourceUrl || signal.importedMetadata?.url || '',
        stats,
        text,
      };
    })
    .filter((item) => item.text || item.title || item.caption);
}

function buildGeminiBrandBrainPrompt({ input = '', metadata = {}, apifySignals = [] } = {}) {
  const signalSummary = summarizeApifySignals(apifySignals);
  return [
    'You are Dzhero Brand Brain extractor.',
    'Return only valid JSON. Do not wrap it in markdown.',
    'Do not invent facts. If a field is inferred from weak evidence, keep it practical and add the gap to missingFields.',
    'Use Ukrainian for user-facing fields unless the source is clearly English-only.',
    '',
    'Required JSON keys:',
    'brandName, businessType, product, audience, location, offer, cta, toneOfVoice, proof, contentPillars, keywords, stopTopics, confidence, missingFields.',
    '',
    `User input: ${compactText(input, 500)}`,
    `Public metadata: ${JSON.stringify({
      handle: metadata.handle || '',
      title: metadata.title || '',
      description: metadata.description || '',
      stats: metadata.stats || {},
      sourceStatus: metadata.sourceStatus || '',
    })}`,
    `Apify profile signals: ${JSON.stringify(signalSummary)}`,
  ].join('\n');
}

function extractJsonObject(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function inferBusinessType(text = '') {
  const lower = text.toLowerCase();
  if (/кава|кав|coffee|снідан|десерт|круасан|матча|cafe|restaurant|breakfast/.test(lower)) return 'кафе / їжа';
  if (/манік|beauty|salon|nails|бров/.test(lower)) return 'салон краси / beauty';
  if (/одяг|сукн|футбол|fashion|clothes|wear/.test(lower)) return 'магазин одягу';
  if (/fitness|workout|пілатес|йога|тренув|спорт/.test(lower)) return 'фітнес / wellness';
  return 'локальний бізнес';
}

function inferLocation(text = '') {
  const lower = text.toLowerCase();
  const known = [
    ['Чернівці', /чернівц/i],
    ['Київ', /київ|києв/i],
    ['Львів', /львів|львов/i],
    ['Одеса', /одес/i],
    ['Дніпро', /дніпр/i],
    ['Харків', /харків|харьк/i],
    ['Україна', /україн|украин/i],
  ];
  return known.find(([, pattern]) => pattern.test(lower))?.[0] || '';
}

function inferKeywords(text = '') {
  const dictionary = [
    'кава',
    'сніданки',
    'десерти',
    'матча',
    'круасан',
    'бронювання',
    'манікюр',
    'одяг',
    'тренування',
    'консультація',
  ];
  const lower = text.toLowerCase();
  return dictionary.filter((word) => lower.includes(word.toLowerCase()));
}

function inferCta(text = '') {
  if (/direct|директ|напиши|брон/i.test(text)) return 'написати в Direct, щоб забронювати або уточнити деталі';
  if (/замов|order|куп/i.test(text)) return 'написати в Direct або перейти за лінком, щоб замовити';
  return 'написати в Direct, щоб уточнити деталі';
}

function buildHeuristicBrief({ input = '', metadata = {}, apifySignals = [] } = {}) {
  const signalSummary = summarizeApifySignals(apifySignals);
  const combinedText = compactText([
    input,
    metadata.title,
    metadata.description,
    metadata.handle,
    ...signalSummary.map((signal) => signal.text),
  ].filter(Boolean).join(' '), 5000);
  const keywords = inferKeywords(combinedText);
  const businessType = inferBusinessType(combinedText);
  const location = inferLocation(combinedText);
  const product = keywords.length
    ? unique(keywords, 5).join(', ')
    : compactText(metadata.description || metadata.title || input, 220);
  const audience = location
    ? `люди у ${location}, які шукають ${businessType === 'кафе / їжа' ? 'кафе, каву або сніданок' : product || 'це рішення'}`
    : `люди, яким потрібен ${product || businessType} і які можуть купити зараз`;
  const statParts = [
    metadata.stats?.followers && `${metadata.stats.followers} followers`,
    metadata.stats?.posts && `${metadata.stats.posts} posts`,
    signalSummary[0]?.stats?.views && `${signalSummary[0].stats.views} views на одному з роликів`,
  ].filter(Boolean);

  return normalizeBrief({
    brandName: metadata.handle || '',
    businessType,
    product,
    audience,
    location,
    offer: businessType === 'кафе / їжа'
      ? `зайти на ${keywords.includes('сніданки') ? 'сніданок, ' : ''}каву або десерт`
      : `зрозуміла пропозиція навколо: ${product || businessType}`,
    cta: inferCta(combinedText),
    toneOfVoice: 'коротко, конкретно, дружньо, без перебільшень',
    proof: statParts.join('; '),
    contentPillars: unique(keywords.length ? keywords : [businessType, product], 6),
    keywords: unique([...(location ? [`${product} ${location}`] : []), ...keywords], 10),
    stopTopics: ['не вигадувати цифри', 'не обіцяти результат без доказу', 'не копіювати чужий контент дослівно'],
  });
}

function mergeBriefs(fallbackBrief, geminiBrief) {
  const normalizedGemini = normalizeBrief(geminiBrief);
  const result = { ...fallbackBrief };
  for (const [key, value] of Object.entries(normalizedGemini)) {
    if (Array.isArray(value)) {
      if (value.length) result[key] = value;
    } else if (value) {
      result[key] = value;
    }
  }
  return result;
}

async function buildBrandBrainEnrichment({ input = '', metadata = {}, apifySignals = [], geminiClient = null } = {}) {
  const fallbackBrief = buildHeuristicBrief({ input, metadata, apifySignals });
  const evidence = {
    publicSourceStatus: metadata.sourceStatus || '',
    publicHandle: metadata.handle || '',
    apifySignalsUsed: Array.isArray(apifySignals) ? apifySignals.length : 0,
    apifyCaptionsUsed: summarizeApifySignals(apifySignals).filter((signal) => signal.caption || signal.text).length,
  };

  if (typeof geminiClient === 'function') {
    const prompt = buildGeminiBrandBrainPrompt({ input, metadata, apifySignals });
    try {
      const responseText = await geminiClient(prompt);
      const parsed = extractJsonObject(responseText);
      if (parsed && typeof parsed === 'object') {
        return {
          brief: mergeBriefs(fallbackBrief, parsed),
          evidence,
          sourceStatus: 'brand_brain_gemini',
          confidence: clampConfidence(parsed.confidence, 0.78),
          missingFields: normalizeArray(parsed.missingFields, 10),
        };
      }
    } catch (error) {
      evidence.geminiError = error.message || 'gemini_failed';
    }
  }

  return {
    brief: fallbackBrief,
    evidence,
    sourceStatus: 'brand_brain_heuristic',
    confidence: evidence.apifySignalsUsed ? 0.62 : 0.42,
    missingFields: evidence.apifySignalsUsed ? ['ціни', 'точна адреса', 'унікальна перевага'] : ['опис бізнесу', 'продукт', 'аудиторія'],
  };
}

function shouldUseApifyForBrandScan(input = '', metadata = {}) {
  const raw = String(input || '').trim();
  if (!/(^@[\w.]+$|instagram\.com\/)/i.test(raw)) return false;
  if (/instagram\.com\/(?:p|reel|reels|tv|stories|explore)\//i.test(raw)) return false;
  if (metadata.source?.tone && metadata.source.tone !== 'instagram') return false;
  if (metadata.sourceStatus === 'manual_text') return false;
  return true;
}

module.exports = {
  buildBrandBrainEnrichment,
  buildGeminiBrandBrainPrompt,
  buildHeuristicBrief,
  extractJsonObject,
  shouldUseApifyForBrandScan,
  summarizeApifySignals,
};
