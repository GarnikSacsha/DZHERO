const FORBIDDEN_GENERIC_PHRASES = [
  'discover',
  'unlock',
  'revolutionary',
  'unique solution',
  "don't miss out",
  'key to success',
  'change your life',
  'immerse yourself',
  'game changer',
  'унікальне рішення',
  'революційний',
  'не пропусти',
  'ключ до успіху',
  'зміни своє життя',
  'відкрий для себе',
  'поринь у світ',
];

const ACCEPT_THRESHOLDS = {
  grounding: 85,
  brandFit: 85,
  originality: 85,
  feasibility: 75,
  language: 80,
  commercialFit: 80,
  hookStrength: 85,
  mechanicFidelity: 85,
  creativeBoldness: 82,
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasBrandContext(brandBrain = {}) {
  return Object.values(brandBrain || {}).some((value) => (
    Array.isArray(value) ? value.length > 0 : String(value || '').trim().length > 0
  ));
}

function getFirstBeatEndSeconds(timeframe = '') {
  const normalized = String(timeframe || '').replace(/[–—]/g, '-');
  const parts = normalized.split('-').map((value) => value.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const end = parts[1];
  const segments = end.split(':').map(Number);
  if (segments.some((value) => !Number.isFinite(value))) return null;
  if (segments.length === 1) return segments[0];
  return segments.reduce((total, value) => (total * 60) + value, 0);
}

function collectCreativeText(creative = {}) {
  const hero = creative.heroReel || {};
  return [
    hero.title,
    hero.concept,
    hero.hook,
    hero.cta,
    ...(hero.scenes || []).flatMap((scene) => [scene.action, scene.onScreenText, scene.voiceover]),
    ...(creative.alternatives || []).flatMap((item) => [item.title, item.concept, item.hook, item.cta]),
  ].filter(Boolean).join(' ');
}

function assessAgentStudioCreative(creative = {}, { brandBrain = {} } = {}) {
  const issues = [];
  const hero = creative.heroReel || {};
  const scenes = Array.isArray(hero.scenes) ? hero.scenes : [];
  const alternatives = Array.isArray(creative.alternatives) ? creative.alternatives : [];

  if (scenes.length < 3) {
    issues.push('heroReel.scenes: Build at least three concrete beats: hook, development/proof, and reveal/CTA.');
  }
  const firstBeatEnd = getFirstBeatEndSeconds(scenes[0]?.timeframe);
  if (firstBeatEnd === null || firstBeatEnd > 3) {
    issues.push('heroReel.scenes[0].timeframe: Make the first pattern-interrupt beat end no later than 0:03.');
  }
  if (String(hero.hook || '').trim().length < 12) {
    issues.push('heroReel.hook: Write a specific two-second hook with visible or verbal tension.');
  }
  scenes.forEach((scene, index) => {
    if (String(scene?.action || '').trim().length < 24) {
      issues.push(`heroReel.scenes[${index}].action: Name the framing, subject or hands, prop, and concrete action.`);
    }
    if (!String(scene?.onScreenText || '').trim() && !String(scene?.voiceover || '').trim()) {
      issues.push(`heroReel.scenes[${index}]: Supply on-screen copy or a spoken line.`);
    }
  });
  if (!Array.isArray(hero.productionNotes) || hero.productionNotes.length < 2) {
    issues.push('heroReel.productionNotes: Add at least two solo-phone production instructions.');
  }
  if (hasBrandContext(brandBrain) && (!Array.isArray(hero.brandRefs) || hero.brandRefs.length === 0)) {
    issues.push('heroReel.brandRefs: Ground the hero in exact Brand Brain fields.');
  }
  if (alternatives.length !== 2) {
    issues.push('alternatives: Return exactly two genuinely different creative routes.');
  }
  const hooks = [hero, ...alternatives].map((item) => normalizeText(item?.hook)).filter(Boolean);
  if (new Set(hooks).size !== hooks.length) {
    issues.push('alternatives: Hero and alternative hooks must use different attention routes, not rewritten wording.');
  }
  const concepts = alternatives.map((item) => normalizeText(item?.concept)).filter(Boolean);
  if (new Set(concepts).size !== concepts.length) {
    issues.push('alternatives: Alternative concepts must be mechanically distinct.');
  }
  if (hasBrandContext(brandBrain)) {
    alternatives.forEach((item, index) => {
      if (!Array.isArray(item?.brandRefs) || item.brandRefs.length === 0) {
        issues.push(`alternatives[${index}].brandRefs: Ground this direction in exact Brand Brain fields.`);
      }
    });
  }
  const normalizedCreative = normalizeText(collectCreativeText(creative));
  const genericPhrase = FORBIDDEN_GENERIC_PHRASES.find((phrase) => normalizedCreative.includes(normalizeText(phrase)));
  if (genericPhrase) {
    issues.push(`creative: Remove generic AI/agency phrase "${genericPhrase}" and replace it with a visible action or concrete claim.`);
  }

  return { ok: issues.length === 0, issues };
}

function uniqueIssues(...collections) {
  return [...new Set(collections.flat().map((issue) => String(issue || '').trim()).filter(Boolean))];
}

function getScoreIssues(evaluation = {}, fields = Object.keys(ACCEPT_THRESHOLDS)) {
  return fields.flatMap((field) => {
    const minimum = ACCEPT_THRESHOLDS[field];
    const value = Number(evaluation?.scores?.[field]);
    return Number.isFinite(value) && value >= minimum
      ? []
      : [`scores.${field}: Raise ${field} to at least ${minimum} with a concrete field-level revision.`];
  });
}

function enforceAgentStudioEvaluation(evaluation = {}, quality = {}, { finalPass = false } = {}) {
  const scoreIssues = getScoreIssues(evaluation);
  const gateIssues = Array.isArray(quality?.issues) ? quality.issues : [];
  const allIssues = uniqueIssues(gateIssues, scoreIssues);
  if (allIssues.length === 0) return evaluation;

  const blockingIssues = uniqueIssues(evaluation.blockingIssues || [], allIssues);
  if (evaluation.decision === 'reject') {
    return {
      ...evaluation,
      blockingIssues,
      revisionInstructions: [],
    };
  }

  if (evaluation.decision === 'revise' && !finalPass) {
    return {
      ...evaluation,
      blockingIssues,
      revisionInstructions: uniqueIssues(evaluation.revisionInstructions || [], allIssues),
    };
  }

  return {
    ...evaluation,
    decision: finalPass ? 'reject' : 'revise',
    blockingIssues,
    revisionInstructions: finalPass
      ? []
      : uniqueIssues(evaluation.revisionInstructions || [], allIssues),
    summary: finalPass
      ? 'The creative still fails the DZHERO creative quality gate after revision.'
      : 'The draft is grounded but does not yet meet the DZHERO creative quality gate.',
  };
}

function createAgentStudioRevisionContract(evaluation = {}) {
  const scores = { ...(evaluation.scores || {}) };
  const scoreFields = Object.keys(ACCEPT_THRESHOLDS).filter((field) => {
    const value = Number(scores[field]);
    return !Number.isFinite(value) || value < ACCEPT_THRESHOLDS[field];
  });
  return {
    instructions: uniqueIssues(evaluation.revisionInstructions || [], evaluation.blockingIssues || []),
    scoreFields,
    baselineScores: scores,
  };
}

function normalizeIssue(issue) {
  return String(issue || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function enforceAgentStudioFinalEvaluation(evaluation = {}, quality = {}, revisionContract = {}) {
  const contractInstructions = uniqueIssues(revisionContract.instructions || []);
  const normalizedContractInstructions = new Set(contractInstructions.map(normalizeIssue));
  const contractedScoreFields = new Set(
    (revisionContract.scoreFields || []).filter((field) => Object.hasOwn(ACCEPT_THRESHOLDS, field)),
  );
  const baselineScores = revisionContract.baselineScores || {};
  const reportedScores = evaluation.scores || {};
  const scores = Object.fromEntries(Object.keys(ACCEPT_THRESHOLDS).map((field) => {
    const useFinalScore = contractedScoreFields.has(field);
    const baseline = Number(baselineScores[field]);
    const reported = Number(reportedScores[field]);
    return [field, useFinalScore || !Number.isFinite(baseline) ? reported : baseline];
  }));

  const reportedIssues = uniqueIssues(evaluation.blockingIssues || [], evaluation.revisionInstructions || []);
  const unresolvedContractIssues = reportedIssues.filter((issue) => (
    normalizedContractInstructions.has(normalizeIssue(issue))
  ));
  const newCriticalIssues = reportedIssues.filter((issue) => /^NEW_CRITICAL:/i.test(issue));
  const gateIssues = Array.isArray(quality?.issues) ? quality.issues : [];
  const scoreIssues = getScoreIssues({ scores }, [...contractedScoreFields]);
  const blockingIssues = uniqueIssues(
    gateIssues,
    scoreIssues,
    unresolvedContractIssues,
    newCriticalIssues,
  );

  if (blockingIssues.length > 0) {
    return {
      ...evaluation,
      decision: 'reject',
      scores,
      blockingIssues,
      revisionInstructions: [],
      summary: 'The creative still has unresolved items from the agreed revision contract.',
    };
  }

  const nonBlockingSuggestions = reportedIssues.filter((issue) => (
    !normalizedContractInstructions.has(normalizeIssue(issue)) && !/^NEW_CRITICAL:/i.test(issue)
  ));
  return {
    ...evaluation,
    decision: 'accept',
    scores,
    blockingIssues: [],
    revisionInstructions: [],
    summary: nonBlockingSuggestions.length > 0
      ? `${evaluation.summary} New creative suggestions were kept as non-blocking notes for human review.`
      : evaluation.summary,
  };
}

module.exports = {
  ACCEPT_THRESHOLDS,
  FORBIDDEN_GENERIC_PHRASES,
  assessAgentStudioCreative,
  createAgentStudioRevisionContract,
  enforceAgentStudioEvaluation,
  enforceAgentStudioFinalEvaluation,
  getFirstBeatEndSeconds,
};
