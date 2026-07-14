const { z } = require('zod');

const NonEmptyText = z.string().trim().min(1);
const ShortText = NonEmptyText.max(500);
const LongText = NonEmptyText.max(5000);
const Identifier = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9:_-]+$/);
const OptionalUrl = z.string().trim().url().max(2048).optional();

const AgentStudioInputSchema = z.object({
  mode: z.enum(['find_trend', 'adapt_reel']),
  objective: ShortText,
  signalId: Identifier.optional(),
  sourceUrl: OptionalUrl,
  userNotes: z.string().trim().max(4000).optional(),
  idempotencyKey: Identifier.optional(),
}).strict().superRefine((value, context) => {
  if (value.mode !== 'adapt_reel') return;
  if (value.signalId || value.sourceUrl || value.userNotes) return;
  context.addIssue({
    code: 'custom',
    path: ['signalId'],
    message: 'Adapt Reel requires a signal, URL, or user notes.',
  });
});

const EvidenceSourceSchema = z.object({
  kind: z.enum(['signal', 'url', 'upload', 'fixture']),
  signalId: Identifier.optional(),
  url: OptionalUrl,
  title: z.string().trim().max(500).optional(),
}).strict();

const EvidenceItemSchema = z.object({
  id: Identifier,
  sourceType: z.enum([
    'video_observation',
    'audio_observation',
    'on_screen_text',
    'source_metadata',
    'user_note',
  ]),
  text: LongText,
  timestamp: z.string().trim().max(80).optional(),
  confidence: z.number().min(0).max(1),
}).strict();

const EvidencePackageSchema = z.object({
  source: EvidenceSourceSchema,
  availability: z.enum(['reliable', 'partial', 'unavailable']),
  summary: LongText,
  transferableMechanic: LongText,
  items: z.array(EvidenceItemSchema).max(80),
  unknowns: z.array(ShortText).max(20),
  requiresContext: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.availability === 'reliable' && value.items.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'Reliable evidence must contain at least one evidence item.',
    });
  }
  if (value.availability === 'unavailable' && !value.requiresContext) {
    context.addIssue({
      code: 'custom',
      path: ['requiresContext'],
      message: 'Unavailable evidence must request context.',
    });
  }
});

const TrendBriefSchema = z.object({
  title: ShortText,
  rationale: LongText,
  signalId: Identifier.optional(),
  sourceUrl: OptionalUrl,
  objectiveFit: z.number().min(0).max(100).optional(),
}).strict();

const BrandStrategySchema = z.object({
  audienceInsight: LongText,
  brandAngle: LongText,
  localContext: LongText,
  tone: ShortText,
  mustInclude: z.array(ShortText).max(12),
  mustAvoid: z.array(ShortText).max(12),
  brandRefs: z.array(Identifier).max(30),
}).strict();

const SceneSchema = z.object({
  timeframe: z.string().trim().min(1).max(80),
  action: LongText,
  onScreenText: z.string().trim().max(1000),
  voiceover: z.string().trim().max(2000),
  evidenceRefs: z.array(Identifier).min(1).max(20),
}).strict();

const HeroReelSchema = z.object({
  id: Identifier,
  title: ShortText,
  concept: LongText,
  hook: ShortText,
  durationSeconds: z.number().int().min(5).max(90),
  scenes: z.array(SceneSchema).min(2).max(16),
  cta: ShortText,
  productionNotes: z.array(ShortText).min(1).max(20),
  brandRefs: z.array(Identifier).max(30),
}).strict();

const AlternativeConceptSchema = z.object({
  id: Identifier,
  title: ShortText,
  concept: LongText,
  hook: ShortText,
  cta: ShortText,
  evidenceRefs: z.array(Identifier).min(1).max(20),
  brandRefs: z.array(Identifier).max(30),
}).strict();

const CreativeBundleSchema = z.object({
  heroReel: HeroReelSchema,
  alternatives: z.array(AlternativeConceptSchema).length(2),
}).strict().superRefine((value, context) => {
  const ids = [value.heroReel.id, ...value.alternatives.map((item) => item.id)];
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: 'custom',
      path: ['alternatives'],
      message: 'Creative concepts must have unique ids.',
    });
  }
});

const EvaluationScoresSchema = z.object({
  grounding: z.number().min(0).max(100),
  brandFit: z.number().min(0).max(100),
  originality: z.number().min(0).max(100),
  feasibility: z.number().min(0).max(100),
  language: z.number().min(0).max(100),
  commercialFit: z.number().min(0).max(100),
}).strict();

const EvaluationReportSchema = z.object({
  decision: z.enum(['accept', 'revise', 'reject']),
  scores: EvaluationScoresSchema,
  blockingIssues: z.array(ShortText).max(20),
  revisionInstructions: z.array(ShortText).max(20),
  summary: LongText,
}).strict().superRefine((value, context) => {
  if (value.decision === 'revise' && value.revisionInstructions.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['revisionInstructions'],
      message: 'A revision decision requires specific instructions.',
    });
  }
  if (value.decision === 'reject' && value.blockingIssues.length === 0) {
    context.addIssue({
      code: 'custom',
      path: ['blockingIssues'],
      message: 'A rejection requires at least one blocking issue.',
    });
  }
});

const ContentPlanDaySchema = z.object({
  day: z.number().int().min(1).max(7),
  title: ShortText,
  format: z.enum(['Reels', 'Stories', 'Post', 'Shorts', 'Tik - Tok', 'Video']),
  objective: ShortText,
  hook: ShortText,
  cta: ShortText,
}).strict();

const ContentPlanSchema = z.object({
  strategy: LongText,
  days: z.array(ContentPlanDaySchema).length(7),
}).strict().superRefine((value, context) => {
  const days = value.days.map((item) => item.day);
  if (new Set(days).size !== 7) {
    context.addIssue({
      code: 'custom',
      path: ['days'],
      message: 'The content plan must contain each day from 1 through 7 exactly once.',
    });
  }
});

const ManagerReviewSchema = z.object({
  headline: ShortText,
  whyItWorks: LongText,
  agentContributions: z.array(z.object({
    agent: ShortText,
    summary: LongText,
  }).strict()).min(4).max(8),
  approvalPrompt: ShortText,
}).strict();

const PublicTraceEntrySchema = z.object({
  id: Identifier,
  agent: ShortText,
  stage: Identifier,
  status: z.enum(['started', 'completed', 'needs_context', 'revised', 'failed', 'cancelled']),
  summary: LongText,
  createdAt: z.string().datetime(),
}).strict();

const FinalPackageSchema = z.object({
  evidence: EvidencePackageSchema,
  selectedTrend: TrendBriefSchema,
  brandStrategy: BrandStrategySchema.optional(),
  creative: CreativeBundleSchema,
  evaluation: EvaluationReportSchema,
  contentPlan: ContentPlanSchema,
  managerReview: ManagerReviewSchema,
  hybrid: z.object({
    sourceCandidateIds: z.array(Identifier).length(2),
  }).strict().optional(),
}).strict().superRefine((value, context) => {
  const evidenceIds = new Set(value.evidence.items.map((item) => item.id));
  const references = [
    ...value.creative.heroReel.scenes.flatMap((scene) => scene.evidenceRefs),
    ...value.creative.alternatives.flatMap((concept) => concept.evidenceRefs),
  ];
  const missing = [...new Set(references.filter((reference) => !evidenceIds.has(reference)))];
  if (missing.length > 0) {
    context.addIssue({
      code: 'custom',
      path: ['creative'],
      message: `Creative output references unknown evidence: ${missing.join(', ')}`,
    });
  }
});

function cleanOptional(value) {
  const normalized = typeof value === 'string' ? value.trim() : value;
  return normalized === '' || normalized === undefined || normalized === null ? undefined : normalized;
}

function normalizeAgentStudioInput(input = {}) {
  const candidate = {
    mode: cleanOptional(input.mode),
    objective: cleanOptional(input.objective),
    signalId: cleanOptional(input.signalId),
    sourceUrl: cleanOptional(input.sourceUrl),
    userNotes: cleanOptional(input.userNotes),
    idempotencyKey: cleanOptional(input.idempotencyKey),
  };
  const compact = Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined));
  return AgentStudioInputSchema.parse(compact);
}

function redactTraceSummary(value) {
  return String(value || '')
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(api[_ -]?key|token|secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .trim();
}

function toPublicTraceEntry(entry = {}) {
  return PublicTraceEntrySchema.parse({
    id: entry.id,
    agent: entry.agent,
    stage: entry.stage,
    status: entry.status,
    summary: redactTraceSummary(entry.summary),
    createdAt: entry.createdAt,
  });
}

module.exports = {
  AgentStudioInputSchema,
  EvidenceItemSchema,
  EvidencePackageSchema,
  TrendBriefSchema,
  BrandStrategySchema,
  SceneSchema,
  HeroReelSchema,
  AlternativeConceptSchema,
  CreativeBundleSchema,
  EvaluationReportSchema,
  ContentPlanSchema,
  ManagerReviewSchema,
  PublicTraceEntrySchema,
  FinalPackageSchema,
  normalizeAgentStudioInput,
  redactTraceSummary,
  toPublicTraceEntry,
};
