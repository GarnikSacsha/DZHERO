const paidRun = require('./signal-filter-paid-consistency-2026-07-30.json');

const SOURCE_MAP = {
  audio_observation: 'spoken',
  on_screen_text: 'onscreen_text',
  video_observation: 'visual',
};

// These annotations are owner-authored labels for the immutable v2 paid payloads.
// They are deliberately separate so no v3 field is misrepresented as Gemini output.
const annotations = {
  'mindstudio-accept:0': {
    kinds: { obs_1: 'claim', obs_2: 'process' },
    centralIdea: 'explicit',
    contentMechanic: 'demonstrated',
    visualExecution: 'demonstrated',
    adaptationTemplate: 'inferred',
  },
  'mindstudio-accept:1': {
    kinds: { obs_1: 'setup', obs_2: 'process', obs_3: 'claim' },
    centralIdea: 'explicit',
    contentMechanic: 'explicit',
    visualExecution: 'demonstrated',
    adaptationTemplate: 'inferred',
  },
  'mindstudio-accept:2': {
    kinds: { obs_1: 'claim', obs_2: 'setup' },
    centralIdea: 'explicit',
    contentMechanic: 'demonstrated',
    visualExecution: 'demonstrated',
    adaptationTemplate: 'inferred',
  },
  'axial-teaser-reject:0': {
    kinds: { obs_1: 'visual_device', obs_2: 'claim' },
    centralIdea: 'demonstrated',
    contentMechanic: 'inferred',
    visualExecution: 'demonstrated',
    adaptationTemplate: 'inferred',
  },
  'axial-teaser-reject:1': {
    kinds: { obs_1: 'claim', obs_2: 'visual_device' },
    centralIdea: 'demonstrated',
    contentMechanic: 'inferred',
    visualExecution: 'demonstrated',
    adaptationTemplate: 'inferred',
  },
  'axial-teaser-reject:2': {
    kinds: { obs_01: 'claim', obs_02: 'visual_device', obs_03: 'setup' },
    centralIdea: 'demonstrated',
    contentMechanic: 'inferred',
    visualExecution: 'demonstrated',
    adaptationTemplate: 'inferred',
  },
};

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

const immutablePaidRun = deepFreeze(paidRun);

function claim(text, evidenceIds, supportLevel) {
  return {
    text: String(text || ''),
    evidenceIds: text ? [...evidenceIds] : [],
    supportLevel,
  };
}

function toV3PaidAssessment(evaluation) {
  const key = `${evaluation.caseId}:${evaluation.repeatIndex}`;
  const ownerAnnotation = annotations[key];
  if (!ownerAnnotation) throw new Error(`missing_v3_owner_annotation:${key}`);
  const evidenceIds = [...evaluation.contentMechanicEvidenceIds];
  const allEvidenceIds = evaluation.observations.map((observation) => observation.id);
  return {
    accessible: !evaluation.inaccessible,
    summary: evaluation.summary,
    derivedClaims: {
      centralIdea: claim(
        evaluation.centralIdea,
        evidenceIds,
        ownerAnnotation.centralIdea,
      ),
      contentMechanic: claim(
        evaluation.contentMechanic,
        evidenceIds,
        ownerAnnotation.contentMechanic,
      ),
      visualExecution: claim(
        evaluation.visualExecution,
        allEvidenceIds,
        ownerAnnotation.visualExecution,
      ),
      adaptationTemplate: claim(
        evaluation.adaptationTemplate,
        evidenceIds,
        ownerAnnotation.adaptationTemplate,
      ),
    },
    scores: { ...evaluation.scores },
    evidenceConfidence: evaluation.evidenceConfidence,
    slopIndicators: [],
    observations: evaluation.observations.map((observation) => ({
      id: observation.id,
      timestamp: observation.timestamp,
      source: SOURCE_MAP[observation.sourceType],
      kind: ownerAnnotation.kinds[observation.id],
      description: observation.text,
      confidence: observation.confidence,
    })),
    unknowns: [],
  };
}

function getPaidCases(caseId) {
  return immutablePaidRun.evaluations
    .filter((evaluation) => evaluation.caseId === caseId)
    .map((evaluation) => ({
      raw: evaluation,
      assessment: toV3PaidAssessment(evaluation),
    }));
}

module.exports = {
  immutablePaidRun,
  annotations: deepFreeze(annotations),
  getPaidCases,
  toV3PaidAssessment,
};
