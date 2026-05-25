function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function analyzeReel(reel = {}, workspace = {}) {
  const views = toNumber(reel.views);
  const likes = toNumber(reel.likes);
  const comments = toNumber(reel.comments);
  const shares = toNumber(reel.shares);
  const saves = toNumber(reel.saves);
  const title = compactText(reel.title || reel.caption || reel.hook);
  const hook = compactText(reel.hook || title);
  const brief = workspace.brief || {};
  const markets = workspace.marketFocus || ['ua', 'us', 'eu', 'global'];

  const engagementRate = views > 0
    ? ((likes + comments * 2 + shares * 3 + saves * 2) / views) * 100
    : 0;
  const marketFit = reel.market === 'ua'
    ? 96
    : markets.includes(reel.market)
      ? 82
      : 62;
  const hasClearHook = hook.length >= 24;
  const hasBusinessContext = Boolean(brief.businessType || brief.product || brief.niche);
  const viewSignal = views >= 1000000 ? 95 : views >= 250000 ? 86 : views >= 50000 ? 74 : 58;
  const engagementSignal = clamp(engagementRate * 9, 35, 98);
  const copyRisk = title.toLowerCase().includes('copyright') || title.toLowerCase().includes('brand')
    ? 'high'
    : reel.market === 'ua'
      ? 'medium'
      : 'low';
  const score = Math.round(clamp(
    viewSignal * 0.35
    + engagementSignal * 0.25
    + marketFit * 0.25
    + (hasClearHook ? 8 : 0)
    + (hasBusinessContext ? 7 : 0)
  ));

  return {
    score,
    qualityGate: score >= 70 ? 'passes_gate' : 'needs_review',
    copyRisk,
    signals: {
      views,
      engagementRate: Number(engagementRate.toFixed(2)),
      marketFit,
      hasClearHook,
      hasBusinessContext,
    },
    recommendation: score >= 82
      ? 'ready_for_remix'
      : score >= 70
        ? 'needs_human_review'
        : 'archive',
    notes: [
      hasClearHook ? 'clear_hook' : 'weak_hook',
      hasBusinessContext ? 'brief_connected' : 'brief_missing',
      `copy_risk_${copyRisk}`,
    ],
  };
}

function generateIdeasFromReel(reel = {}, analysis = {}, workspace = {}) {
  const brief = workspace.brief || {};
  const businessType = compactText(brief.businessType || brief.niche || 'local business');
  const product = compactText(brief.product || 'product or service');
  const location = compactText(brief.location || 'Ukraine');
  const sourceTitle = compactText(reel.title || reel.caption || reel.hook || 'market signal');
  const baseScore = toNumber(analysis.score, toNumber(reel.score, 72));

  return [
    {
      title: `Adapt ${sourceTitle.slice(0, 72)} for ${businessType}`,
      hook: `Show how ${product} solves this problem for clients in ${location}.`,
      angle: 'local_proof',
      status: baseScore >= 82 ? 'ready_for_remix' : 'needs_review',
      score: clamp(baseScore + 2),
      fitReason: 'Uses a proven hook, but replaces global context with Ukrainian business proof.',
    },
    {
      title: `Turn the trend into a practical checklist`,
      hook: `Give the audience 3 clear steps instead of a broad inspiration post.`,
      angle: 'educational_checklist',
      status: 'draft',
      score: clamp(baseScore - 3),
      fitReason: 'Safer format for experts, SMM teams and service businesses.',
    },
    {
      title: `Convert the signal into a Direct CTA`,
      hook: `End the reel with a keyword that qualifies warm leads in Direct.`,
      angle: 'direct_conversion',
      status: 'draft',
      score: clamp(baseScore),
      fitReason: 'Connects reach with measurable lead intent and CRM tagging.',
    },
  ];
}

module.exports = {
  analyzeReel,
  generateIdeasFromReel,
};
