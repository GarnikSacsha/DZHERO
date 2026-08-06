const DEFAULT_SHORTLIST_LIMIT = 24;

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return [...new Set(
    compactText(value)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 3),
  )];
}

function normalizeSignalCandidate(signal = {}) {
  return {
    id: compactText(signal.id),
    title: compactText(signal.title),
    caption: compactText(signal.caption),
    market: compactText(signal.market),
    platform: compactText(signal.platform || signal.source),
    tags: Array.isArray(signal.status)
      ? signal.status.map(compactText).filter(Boolean)
      : [],
    qualityScore: Number.isFinite(Number(signal.score)) ? Number(signal.score) : 0,
  };
}

function scoreTokenOverlap(queryTokens, candidateText) {
  const haystack = new Set(tokenize(candidateText));
  return queryTokens.reduce((score, token) => score + (haystack.has(token) ? 1 : 0), 0);
}

function normalizeLimit(limit) {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || !Number.isInteger(limit)) {
    return DEFAULT_SHORTLIST_LIMIT;
  }
  return Math.max(1, Math.min(DEFAULT_SHORTLIST_LIMIT, limit));
}

function scoreSignalForBrand({
  answers = {},
  derivedBrief = {},
  signal = {},
} = {}) {
  const candidate = normalizeSignalCandidate(signal);
  const queryTokens = tokenize([
    answers.profileDescription,
    answers.audience,
    answers.niche,
    answers.market,
    derivedBrief.summary,
  ].filter(Boolean).join(' '));
  const searchable = [
    candidate.title,
    candidate.caption,
    candidate.market,
    candidate.platform,
    candidate.tags.join(' '),
  ].join(' ');
  const semanticScore = scoreTokenOverlap(queryTokens, searchable) * 12;
  const marketScore = answers.market
    && tokenize(answers.market).some((token) => tokenize(candidate.market).includes(token))
    ? 18
    : 0;
  const qualityScore = Math.max(0, Math.min(100, candidate.qualityScore)) * 0.18;
  return semanticScore + marketScore + qualityScore;
}

function rankSignalsForBrand({
  answers = {},
  derivedBrief = {},
  signals = [],
  limit = DEFAULT_SHORTLIST_LIMIT,
} = {}) {
  const shortlistLimit = normalizeLimit(limit);

  return signals
    .map((signal) => {
      const candidate = normalizeSignalCandidate(signal);
      return {
        signal,
        candidate,
        deterministicScore: scoreSignalForBrand({ answers, derivedBrief, signal }),
      };
    })
    .filter((entry) => entry.candidate.id)
    .sort((left, right) => (
      right.deterministicScore - left.deterministicScore
      || left.candidate.id.localeCompare(right.candidate.id)
    ))
    .slice(0, shortlistLimit);
}

function buildWorkspaceBrandMatchSignal(signal = {}) {
  const qualityGate = signal.importedMetadata?.qualityGate || {};
  return {
    ...signal,
    // Shared-bank admission quality is intentionally not part of this score.
    score: 0,
    title: [signal.title, qualityGate.centralIdea].filter(Boolean).join(' '),
    caption: [
      signal.caption,
      qualityGate.summary,
      qualityGate.contentMechanic,
      qualityGate.transferableMechanic,
    ].filter(Boolean).join(' '),
    status: [
      ...(Array.isArray(signal.status) ? signal.status : []),
      qualityGate.centralIdea,
      qualityGate.contentMechanic,
      qualityGate.transferableMechanic,
    ].filter(Boolean),
  };
}

function computeWorkspaceBrandMatchScores({
  productBrandBrain = null,
  signals = [],
} = {}) {
  const brain = productBrandBrain?.brain || productBrandBrain || {};
  const answers = brain && typeof brain === 'object' ? brain : {};
  if (!compactText(answers.profileDescription) || !compactText(answers.audience)) {
    return { status: 'unavailable', scores: new Map() };
  }

  const derivedBrief = {
    summary: [
      answers.contentFocus,
      answers.offer,
      answers.cta,
      answers.proof,
      ...(Array.isArray(answers.contentPillars) ? answers.contentPillars : []),
      ...(Array.isArray(answers.goals) ? answers.goals : []),
    ].filter(Boolean).join(' '),
  };
  const scores = new Map();
  for (const signal of Array.isArray(signals) ? signals : []) {
    const qualityGate = signal?.importedMetadata?.qualityGate || {};
    if (qualityGate.decision !== 'accept' || qualityGate.admittedToBank !== true) continue;
    const signalId = compactText(signal.sharedSourceId || signal.id);
    if (!signalId) continue;
    const rawScore = scoreSignalForBrand({
      answers,
      derivedBrief,
      signal: buildWorkspaceBrandMatchSignal(signal),
    });
    scores.set(signalId, Math.round(Math.max(0, Math.min(100, rawScore))));
  }
  return { status: 'ready', scores };
}

function parseGeminiChoice(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(String(value || ''));
  } catch {
    return {};
  }
}

async function selectBestSignalForBrand({
  answers = {},
  derivedBrief = {},
  signals = [],
  geminiClient = null,
  now = () => new Date(),
} = {}) {
  const shortlist = rankSignalsForBrand({ answers, derivedBrief, signals });
  if (!shortlist.length) return null;

  const fallback = {
    signalId: shortlist[0].candidate.id,
    reason: 'Best deterministic match for the saved Brand Brain.',
    selectionMode: 'deterministic',
    createdAt: now().toISOString(),
  };
  if (typeof geminiClient !== 'function') return fallback;

  const authoredFacts = {
    profileDescription: answers.profileDescription,
    audience: answers.audience,
    niche: answers.niche,
    market: answers.market,
  };
  const prompt = JSON.stringify({
    task: 'Choose exactly one existing signal ID that best matches the brand.',
    brand: { answers: authoredFacts, derivedBrief },
    candidates: shortlist.map(({ candidate, deterministicScore }) => ({
      ...candidate,
      deterministicScore,
    })),
    responseSchema: { signalId: 'string', reason: 'string' },
  });

  try {
    const parsed = parseGeminiChoice(await geminiClient(prompt));
    const selected = shortlist.find(({ candidate }) => candidate.id === compactText(parsed.signalId));
    if (!selected) return fallback;
    return {
      signalId: selected.candidate.id,
      reason: compactText(parsed.reason) || fallback.reason,
      selectionMode: 'gemini',
      createdAt: now().toISOString(),
    };
  } catch (error) {
    if (error?.providerAttemptBlocked) throw error;
    return fallback;
  }
}

module.exports = {
  computeWorkspaceBrandMatchScores,
  normalizeSignalCandidate,
  rankSignalsForBrand,
  scoreSignalForBrand,
  selectBestSignalForBrand,
};
