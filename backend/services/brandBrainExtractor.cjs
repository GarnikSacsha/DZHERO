function compactText(value = '', maxLength = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

const REQUIRED_FACT_FIELDS = ['businessType', 'product', 'audience', 'offer', 'cta', 'toneOfVoice'];

function unique(values = [], limit = 8) {
  const seen = new Set();
  return values.reduce((result, value) => {
    const text = compactText(value, 120);
    if (text && !seen.has(text.toLowerCase()) && result.length < limit) {
      seen.add(text.toLowerCase());
      result.push(text);
    }
    return result;
  }, []);
}

function normalizeArray(value, limit = 8) {
  return unique(Array.isArray(value) ? value : String(value || '').split(/[,;\n]/), limit);
}

function normalizeSourceLinks(value) {
  const candidates = Array.isArray(value) ? value : String(value || '').match(/https?:\/\/[^\s<>'"`]+/gi) || [];
  const seen = new Set();
  return candidates.reduce((links, candidate) => {
    try {
      const url = new URL(String(candidate).replace(/[),.;]+$/, ''));
      if (!/^https?:$/.test(url.protocol)) return links;
      url.hash = '';
      const normalized = url.toString();
      if (!seen.has(normalized.toLowerCase())) {
        seen.add(normalized.toLowerCase());
        links.push(normalized);
      }
    } catch {}
    return links;
  }, []);
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
    sourceLinks: normalizeSourceLinks(value.sourceLinks),
  };
}

function getSignalStats(signal = {}) {
  const stats = signal.importedMetadata?.stats || {};
  return { views: Number(signal.views || stats.views || 0) || 0, likes: Number(signal.likes || stats.likes || 0) || 0, comments: Number(signal.comments || stats.comments || 0) || 0 };
}

function summarizeApifySignals(apifySignals = []) {
  return (Array.isArray(apifySignals) ? apifySignals : []).slice(0, 12).map((signal) => ({
    handle: signal.handle || signal.sourceHandle || signal.importedMetadata?.handle || '',
    title: compactText(signal.title, 160),
    caption: compactText(signal.caption || signal.importedMetadata?.description, 420),
    url: signal.sourceUrl || signal.importedMetadata?.url || '',
    stats: getSignalStats(signal),
    text: compactText([signal.title, signal.caption, signal.transcript, signal.importedMetadata?.description].filter(Boolean).join(' '), 700),
  })).filter((item) => item.text || item.title || item.caption);
}

function cleanSourceText(value = '') {
  return compactText(value)
    .replace(/\b[\d,.]+\s*[KMB]?\s+(?:followers|following|posts)\b,?\s*/gi, '')
    .replace(/\bsee instagram photos and videos(?: from)?\b/gi, '')
    .replace(/\bcreate an account or log in to instagram\b/gi, '')
    .replace(/\bshare what you're into with the people who get you\b/gi, '')
    .trim();
}

function stripNonEvidenceIdentifiers(value = '', handle = '') {
  const cleanHandle = compactText(handle).replace(/^@/, '');
  const escapedHandle = cleanHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return cleanSourceText(value)
    .replace(/https?:\/\/[^\s<>'"`]+/gi, '')
    .replace(/\/[a-z0-9._-]+(?:\/|$)/gi, '')
    .replace(/@[a-z0-9._-]+\b/gi, '')
    .replace(/\b[a-z0-9.-]*_[a-z0-9._-]*\b/gi, '')
    .replace(escapedHandle ? new RegExp(`@?${escapedHandle}\\b`, 'gi') : /$^/, '')
    .trim();
}

function combinedSourceMaterial({ input = '', metadata = {}, apifySignals = [] } = {}) {
  return compactText([input, metadata.title, metadata.description, metadata.analysisText, ...summarizeApifySignals(apifySignals).map((signal) => signal.text)]
    .map((value) => stripNonEvidenceIdentifiers(value, metadata.handle)).filter(Boolean).join(' '), 5000);
}

function buildGeminiBrandBrainPrompt({ input = '', metadata = {}, apifySignals = [] } = {}) {
  const sanitize = (value) => stripNonEvidenceIdentifiers(value, metadata.handle);
  const promptMetadata = {
    title: sanitize(metadata.title),
    description: sanitize(metadata.description),
    analysisText: sanitize(metadata.analysisText),
    stats: metadata.stats || {},
    sourceStatus: metadata.sourceStatus || '',
  };
  const promptSignals = summarizeApifySignals(apifySignals).map((signal) => ({
    title: sanitize(signal.title),
    caption: sanitize(signal.caption),
    text: sanitize(signal.text),
    stats: signal.stats,
  }));
  return [
    'You are Dzhero Brand Brain extractor.',
    'Return only valid JSON. Do not wrap it in markdown.',
    'Do not invent facts. Leave unsupported facts empty.',
    'Required JSON keys: brandName, businessType, product, audience, location, offer, cta, toneOfVoice, proof, contentPillars, keywords, stopTopics, confidence, missingFields, evidenceByField.',
    'For every populated required fact (businessType, product, audience, offer, cta, toneOfVoice), evidenceByField must include an exact snippet copied from the submitted source material.',
    `Sanitized user description: ${sanitize(input)}`,
    `Public metadata: ${JSON.stringify(promptMetadata)}`,
    `Apify profile signals: ${JSON.stringify(promptSignals)}`,
  ].join('\n');
}

function extractJsonObject(text = '') {
  const raw = String(text || '').trim();
  const candidate = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;
  try { return JSON.parse(candidate); } catch {
    const start = candidate.indexOf('{'); const end = candidate.lastIndexOf('}');
    try { return start >= 0 && end > start ? JSON.parse(candidate.slice(start, end + 1)) : null; } catch { return null; }
  }
}

function inferBusinessType(text = '') {
  if (/\bcoffee|cafe|restaurant|breakfast\b|\u043a\u0430\u0432|\u0441\u043d\u0456\u0434\u0430\u043d|\u0434\u0435\u0441\u0435\u0440\u0442/i.test(text)) return '\u043a\u0430\u0444\u0435 / \u0457\u0436\u0430';
  if (/\bbeauty|salon|nails\b|\u043c\u0430\u043d\u0456\u043a|\u0431\u0440\u043e\u0432/i.test(text)) return '\u0441\u0430\u043b\u043e\u043d \u043a\u0440\u0430\u0441\u0438 / beauty';
  if (/\bfashion|clothes|wear\b|\u043e\u0434\u044f\u0433|\u0441\u0443\u043a\u043d|\u0444\u0443\u0442\u0431\u043e\u043b/i.test(text)) return '\u043c\u0430\u0433\u0430\u0437\u0438\u043d \u043e\u0434\u044f\u0433\u0443';
  if (/\bfitness|workout\b|\u043f\u0456\u043b\u0430\u0442\u0435\u0441|\u0439\u043e\u0433|\u0442\u0440\u0435\u043d\u0443\u0432/i.test(text)) return '\u0444\u0456\u0442\u043d\u0435\u0441 / wellness';
  return '';
}

function inferLocation(text = '') {
  const known = [['\u0427\u0435\u0440\u043d\u0456\u0432\u0446\u0456', /\u0447\u0435\u0440\u043d\u0456\u0432\u0446/i], ['\u041a\u0438\u0457\u0432', /\u043a\u0438\u0457\u0432/i], ['\u041b\u044c\u0432\u0456\u0432', /\u043b\u044c\u0432\u0456\u0432/i], ['\u0423\u043a\u0440\u0430\u0457\u043d\u0430', /\u0443\u043a\u0440\u0430\u0457\u043d/i]];
  return known.find(([, pattern]) => pattern.test(text))?.[0] || '';
}

function inferKeywords(text = '') {
  const dictionary = ['\u043a\u0430\u0432\u0430', '\u0441\u043d\u0456\u0434\u0430\u043d\u043a\u0438', '\u0434\u0435\u0441\u0435\u0440\u0442\u0438', '\u043c\u0430\u0442\u0447\u0430', '\u043a\u0440\u0443\u0430\u0441\u0430\u043d', '\u043c\u0430\u043d\u0456\u043a\u044e\u0440', '\u043e\u0434\u044f\u0433', '\u0442\u0440\u0435\u043d\u0443\u0432\u0430\u043d\u043d\u044f'];
  return dictionary.filter((word) => text.toLowerCase().includes(word));
}

function inferCta(text = '') {
  return compactText(text.match(/[^.!?\n]*(?:direct|\u0434\u0438\u0440\u0435\u043a\u0442|\u043d\u0430\u043f\u0438\u0448\u0438|\u0437\u0430\u043c\u043e\u0432|order|\u043a\u0443\u043f|book|visit)[^.!?\n]*/i)?.[0], 220);
}

function buildHeuristicBrief({ input = '', metadata = {}, apifySignals = [] } = {}) {
  const signals = summarizeApifySignals(apifySignals);
  const text = combinedSourceMaterial({ input, metadata, apifySignals });
  const keywords = inferKeywords(text);
  const proof = [metadata.stats?.followers && `${metadata.stats.followers} followers`, metadata.stats?.posts && `${metadata.stats.posts} posts`, signals[0]?.stats?.views && `${signals[0].stats.views} views`].filter(Boolean).join('; ');
  return normalizeBrief({
    brandName: metadata.handle || '', businessType: inferBusinessType(text), product: keywords.join(', '), audience: '', location: inferLocation(text), offer: '', cta: inferCta(text), toneOfVoice: '', proof,
    contentPillars: keywords, keywords, stopTopics: [], sourceLinks: normalizeSourceLinks(input),
  });
}

function hasSubmittedEvidence(field, evidenceByField, sourceMaterial) {
  const source = String(sourceMaterial || '').toLowerCase();
  const snippets = unique(Array.isArray(evidenceByField?.[field]) ? evidenceByField[field] : [evidenceByField?.[field]], 8);
  const value = compactText(evidenceByField?.[field]);
  if (isSocialMetricOrPlatformBoilerplate(value) || snippets.some(isSocialMetricOrPlatformBoilerplate)) return false;
  return snippets.some((snippet) => source.includes(snippet.toLowerCase()));
}

function isSocialMetricOrPlatformBoilerplate(value = '') {
  const text = compactText(value);
  return /\b\d[\d,.]*\s*[kmb]?\s*(?:views?|likes?|comments?|followers?|following|posts?|subscribers?)\b/i.test(text)
    || /\b(?:views?|likes?|comments?|followers?|following|posts?|subscribers?)\s*:\s*\d[\d,.]*\s*[kmb]?\b/i.test(text)
    || /^(?:watch\s+on\s+)?(?:instagram|tiktok|youtube)(?:\s+(?:profile|page|account|channel|videos?|shorts|reels|photos?|posts))?$/i.test(text)
    || /\b(?:see instagram photos and videos|create an account|log in to instagram|share what you're into)\b/i.test(text);
}

function mergeGroundedGeminiBrief(fallbackBrief, geminiBrief, sourceMaterial) {
  const normalized = normalizeBrief(geminiBrief); const result = { ...fallbackBrief };
  for (const [field, value] of Object.entries(normalized)) {
    if (REQUIRED_FACT_FIELDS.includes(field)) result[field] = value && !isSocialMetricOrPlatformBoilerplate(value) && hasSubmittedEvidence(field, geminiBrief.evidenceByField, sourceMaterial) ? value : fallbackBrief[field] || '';
    else if (Array.isArray(value)) { if (value.length) result[field] = value; } else if (value) result[field] = value;
  }
  return result;
}

function missingRequiredFacts(brief = {}) { return REQUIRED_FACT_FIELDS.filter((field) => !compactText(brief[field])); }

async function buildBrandBrainEnrichment({ input = '', metadata = {}, apifySignals = [], geminiClient = null } = {}) {
  const fallbackBrief = buildHeuristicBrief({ input, metadata, apifySignals });
  const evidence = { publicSourceStatus: metadata.sourceStatus || '', publicHandle: metadata.handle || '', apifySignalsUsed: Array.isArray(apifySignals) ? apifySignals.length : 0, apifyCaptionsUsed: summarizeApifySignals(apifySignals).filter((signal) => signal.caption || signal.text).length };
  const sourceMaterial = combinedSourceMaterial({ input, metadata, apifySignals });
  if (typeof geminiClient === 'function') {
    try {
      const parsed = extractJsonObject(await geminiClient(buildGeminiBrandBrainPrompt({ input, metadata, apifySignals })));
      if (parsed && typeof parsed === 'object') {
        const brief = mergeGroundedGeminiBrief(fallbackBrief, parsed, sourceMaterial);
        return { brief, evidence, sourceStatus: 'brand_brain_gemini', confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.78)), missingFields: missingRequiredFacts(brief) };
      }
    } catch (error) { evidence.geminiError = error.message || 'gemini_failed'; }
  }
  return { brief: fallbackBrief, evidence, sourceStatus: 'brand_brain_heuristic', confidence: evidence.apifySignalsUsed ? 0.62 : 0.42, missingFields: missingRequiredFacts(fallbackBrief) };
}

function shouldUseApifyForBrandScan(input = '', metadata = {}) {
  const raw = String(input || '').trim();
  return /(^@[\w.]+$|instagram\.com\/)/i.test(raw) && !/instagram\.com\/(?:p|reel|reels|tv|stories|explore)\//i.test(raw) && (!metadata.source?.tone || metadata.source.tone === 'instagram') && metadata.sourceStatus !== 'manual_text';
}

module.exports = { buildBrandBrainEnrichment, buildGeminiBrandBrainPrompt, buildHeuristicBrief, extractJsonObject, normalizeSourceLinks, shouldUseApifyForBrandScan, summarizeApifySignals };
