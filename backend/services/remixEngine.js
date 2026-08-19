/**
 * Remix Engine (Ремикс-студия) Service for Dzhero SaaS
 * Handles the deconstruction of global Reels and generates 3 customized Ukrainian script remixes.
 */

// Safely use global fetch (available in Node 18+) or fallback
const fetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : async (...args) => {
  try {
    const nodeFetch = require('node-fetch');
    return (nodeFetch.default || nodeFetch)(...args);
  } catch (e) {
    throw new Error("Native fetch is not available and 'node-fetch' is not installed. Please upgrade to Node 18+ or run 'npm install node-fetch'.");
  }
};

const DEFAULT_GEMINI_REMIX_MODEL = 'gemini-3.5-flash';
const DEFAULT_GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_FINISH_REASONS = new Set([
  'STOP',
  'MAX_TOKENS',
  'SAFETY',
  'RECITATION',
  'LANGUAGE',
  'OTHER',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
  'MALFORMED_FUNCTION_CALL',
  'IMAGE_SAFETY',
  'UNEXPECTED_TOOL_CALL',
  'NO_IMAGE',
]);
const GEMINI_CANDIDATE_COUNT_LIMIT = 8;
const GEMINI_RESPONSE_TEXT_LENGTH_LIMIT = 120_000;
const {
  normalizeBrandBrain,
  buildBrandBrainPromptBlock,
} = require('./brandBrainContext.cjs');
const {
  DEFAULT_REMIX_MAX_OUTPUT_TOKENS,
  DEFAULT_REMIX_RETRY_MAX_OUTPUT_TOKENS,
} = require('./remixConfig.cjs');
const { SEMANTIC_ANGLES, assessRemixQuality } = require('./remixQuality.cjs');

// Human-readable example retained for prompt documentation and fallbacks.
const REMIX_OUTPUT_SCHEMA = {
  deconstruction: {
    coreMechanics: "Psychological hook and core value loop used in the global video",
    psychologicalTriggers: ["List of 3 key psychological triggers used to keep viewers hooked"],
    removedCulturalContext: ["US/Global cultural memes, high budgets, currency references or specific brands stripped away"]
  },
  viabilityFilter: {
    isAdaptable: true,
    uaMentalityCheck: "Why this structure works specifically for the Ukrainian consumer/business owner mindset",
    productionFeasibility: "Production guidelines indicating low-budget execution for small teams (e.g. self-shooting, smartphone-only)"
  },
  remixes: [
    {
      title: "Name/Angle of this UA-remix variant (e.g., 'Сміливий виклик', 'Чесний розбір', 'Швидкий лайфхак')",
      hook: "Ukrainian hook for the first 2 seconds of the video, designed to grab immediate attention",
      semanticAngle: "One of: visible_source_conflict, mechanism_walkthrough, viewer_decision",
      centralClaim: "One distinct one-sentence claim expressed by this title and hook",
      sourceConflict: "Concrete conflict/tension observed in the source that remains visible in this variant",
      preservedMechanic: "Concrete source action, reveal, proof, or visual structure recreated in this variant",
      brandTranslation: "How actual Brand Brain facts translate the source without replacing its conflict",
      productionProof: "Real prop, action, screen, process, or customer moment the brand can shoot to prove this scenario",
      adaptationLogic: "Short user-visible explanation of source conflict -> preserved mechanic -> brand translation",
      visualFlow: [
        {
          timeframe: "0:00-0:03",
          actionDescription: "What the person does in the frame (e.g., наливає каву, дивиться прямо в камеру з посмішкою, показує екран телефону)",
          onScreenText: "Text overlay shown on the screen",
          audioVoiceover: "What to say out loud in Ukrainian (natural, spoken, matching the Tone of Voice)"
        },
        {
          timeframe: "0:03-0:10",
          actionDescription: "Visual progression showing the problem or product process",
          onScreenText: "Main learning point text overlay",
          audioVoiceover: "Explanation of the pain point or solution"
        },
        {
          timeframe: "0:10-0:15",
          actionDescription: "Visual proof, results, or engaging gesture",
          onScreenText: "Offer or CTA text",
          audioVoiceover: "Call to action details"
        }
      ],
      cta: "Clear Ukrainian Call to Action (e.g., напиши 'КАВА' в Дірект, залиш коментар, забронюй столик)"
    }
  ]
};

const REMIX_RESPONSE_SCHEMA = Object.freeze({
  type: 'OBJECT',
  required: ['deconstruction', 'viabilityFilter', 'remixes'],
  properties: {
    deconstruction: {
      type: 'OBJECT',
      required: ['coreMechanics', 'psychologicalTriggers', 'removedCulturalContext'],
      properties: {
        coreMechanics: { type: 'STRING' },
        psychologicalTriggers: { type: 'ARRAY', items: { type: 'STRING' } },
        removedCulturalContext: { type: 'ARRAY', items: { type: 'STRING' } },
      },
    },
    viabilityFilter: {
      type: 'OBJECT',
      required: ['isAdaptable', 'uaMentalityCheck', 'productionFeasibility'],
      properties: {
        isAdaptable: { type: 'BOOLEAN' },
        uaMentalityCheck: { type: 'STRING' },
        productionFeasibility: { type: 'STRING' },
      },
    },
    remixes: {
      type: 'ARRAY',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'OBJECT',
        required: [
          'title',
          'hook',
          'semanticAngle',
          'centralClaim',
          'sourceConflict',
          'preservedMechanic',
          'brandTranslation',
          'productionProof',
          'adaptationLogic',
          'visualFlow',
          'cta',
        ],
        properties: {
          title: { type: 'STRING' },
          hook: { type: 'STRING' },
          semanticAngle: {
            type: 'STRING',
            enum: ['visible_source_conflict', 'mechanism_walkthrough', 'viewer_decision'],
          },
          centralClaim: { type: 'STRING' },
          sourceConflict: { type: 'STRING' },
          preservedMechanic: { type: 'STRING' },
          brandTranslation: { type: 'STRING' },
          productionProof: { type: 'STRING' },
          adaptationLogic: { type: 'STRING' },
          visualFlow: {
            type: 'ARRAY',
            minItems: 1,
            items: {
              type: 'OBJECT',
              required: ['timeframe', 'actionDescription', 'onScreenText', 'audioVoiceover'],
              properties: {
                timeframe: { type: 'STRING' },
                actionDescription: { type: 'STRING' },
                onScreenText: { type: 'STRING' },
                audioVoiceover: { type: 'STRING' },
              },
            },
          },
          cta: { type: 'STRING' },
        },
      },
    },
  },
});

const GEMINI_CONTENT_BLOCK_REASONS = new Set([
  'PROHIBITED_CONTENT',
  'SAFETY',
  'BLOCKLIST',
  'SPII',
  'RECITATION',
]);
// System Prompt for the LLM
const REMIX_SYSTEM_PROMPT = `
You are the core AI of the Dzhero SMM platform ("Ремикс-студия"), a practical marketing producer for SMM experts and local business owners in Ukraine.
Your primary task is "Global Scouting & UA Adaptation": taking a highly viral global English Reel/Short video ("Global Insight"), deconstructing its marketing essence, filtering it for cultural viability, and rewriting it into 3 highly engaging, localized, and natural-sounding Reels scripts in Ukrainian (UA).

Here are your instructions:

1. DECONSTRUCTION PHASE:
   - Identify the psychological and marketing core of the original trend.
   - If Video Intelligence is present, prioritize visible facts, transcript/captions, and thumbnail/frame descriptions over generic assumptions.
   - Do not change the source scene into another random niche. If the original visible mechanic is "person stretches leg", adapt the visual mechanic (flexibility, surprise, impossible-looking movement, physical proof), not a coffee pour or unrelated product demo.
   - When only a thumbnail is available, say "visible thumbnail/frame suggests" internally and keep the scenario grounded in what is actually visible.
   - Strip away all foreign cultural artifacts: US memes, references to dollars/Euros, expensive studio setups, global enterprise brands, and massive production budgets.
   - Break it down into pure human psychology and a core marketing funnel (e.g., "Hook -> Agitate Pain -> Introduce AI/Simple Solution -> Interactive CTA").

2. QUALITY & VIABILITY FILTER:
   - Check if this format is adaptable to the Ukrainian local market context.
   - Explain why this appeals to the Ukrainian consumer mindset (who value authenticity, pragmatism, clever lifehacks, and supporting local businesses).
   - Ensure the execution is affordable, requiring only a smartphone, basic lighting, and a single speaker (no complex CGI or expensive sets).

3. 3x UKRAINIAN REMIX GENERATION:
   - Produce exactly 3 distinct script adaptations in natural, modern, native Ukrainian.
   - Avoid Google Translate-style or dry textbook language. Use natural spoken Ukrainian, slang if appropriate, and highly engaging conversational structures.
   - Brand Brain is optional. First inspect the BRAND BRAIN MODE block in the user prompt.
   - BRAND MODE: align each remix with the supplied niche, offer, audience, location, proof, Tone of Voice, and CTA. Every visualFlow step must name the concrete object, process, result, or customer pain the brand can actually show.
   - CONSULTANT MODE: when Brand Brain is empty, never invent a niche, product, location, customer result, or offer. Build a polished demonstration from the source's visible mechanic and human situation. Use concrete roles and props visible or implied by the source (for example customer, seller, product, receipt, reward), and use an engagement CTA that does not require a fabricated offer.
   - Do not copy or translate the original video title as the remix title, hook, or structure. In Brand Mode rebuild the mechanism around the brand's niche, offer, location, proof, and CTA. In Consultant Mode rebuild it around the source action, tension, reveal, and viewer interaction.
   - NEVER use these generic AI words or phrases: "унікальний", "революційний", "зануртесь", "сфера", "інноваційний", "не пропустіть", "ключ до успіху", "готовий змінити життя?", "відкрийте для себе".
   - Never invent private metrics, client results, testimonials, or revenue numbers. If proof is missing, use safe proof placeholders such as "покажи відгук", "покажи процес", "покажи результат".
   - Use this bounded semantic-angle contract exactly once each across the three remixes: "visible_source_conflict", "mechanism_walkthrough", and "viewer_decision". Do not invent angle names and do not use one angle three times with different wording.
   - Every remix must include: semanticAngle, centralClaim, sourceConflict, preservedMechanic, brandTranslation, productionProof, and adaptationLogic.
   - sourceConflict and preservedMechanic must be specific to the grounded source. The title, hook, and at least two visualFlow beats must visibly enact both; a hidden note or generic AI-marketing replacement is not enough.
   - centralClaim must differ materially across all three variants. A synonym, reworded hook, or another list of the same "AI mistakes" is not a different angle.
   - Brand Brain changes the setting, proof, offer, and CTA, but may never replace the source conflict with a generic niche topic. Use only concrete facts the brand can actually show.
   - Format each remix with:
     - A unique semantic angle/title.
     - A killer Hook (Хук) for the first 2 seconds.
     - A step-by-step Visual Flow (Visual Row / Сценарій) mapping timestamp ranges, action descriptions, on-screen text overlays, and spoken audio voiceover.
     - A clear local Call to Action (CTA) tailored to Instagram Direct messages, comments, or bio links.

FEW-SHOT QUALITY TARGETS:
- Pain + visual shock: "От через це ти втрачаєш клієнтів щодня." Show one visible operational failure, then one fix.
- Myth-busting: "Перестань лити гроші в таргет, якщо ця штука не налаштована." Destroy a common belief and show a cheaper retention loop.
- BTS authority: "Як я роблю контент на тиждень за одну годину." Show the actual workflow, not a motivational monologue.

4. STRICT JSON OUTPUT FORMAT:
   Return ONLY a valid JSON object matching this schema. Do not enclose it in markdown code blocks unless requested by JSON mode, but strictly output valid parsing JSON.
   JSON schema to fulfill:
   {
     "deconstruction": {
       "coreMechanics": "string explaining the underlying psychological or marketing pattern",
       "psychologicalTriggers": ["string trigger 1", "string trigger 2", "string trigger 3"],
       "removedCulturalContext": ["string describing what was stripped"]
     },
     "viabilityFilter": {
       "isAdaptable": true,
       "uaMentalityCheck": "string explaining the fit for UA audience",
       "productionFeasibility": "string describing how easily a local business can shoot this"
     },
     "remixes": [
       {
          "title": "string (creative angle title in UA)",
          "hook": "string (UA hook)",
          "semanticAngle": "visible_source_conflict | mechanism_walkthrough | viewer_decision",
          "centralClaim": "string",
          "sourceConflict": "string",
          "preservedMechanic": "string",
          "brandTranslation": "string",
          "productionProof": "string",
          "adaptationLogic": "string",
         "visualFlow": [
           {
             "timeframe": "string (e.g. 0:00-0:02)",
             "actionDescription": "string (visual action details)",
             "onScreenText": "string (on-screen text overlay in UA)",
             "audioVoiceover": "string (verbal script in UA)"
           }
         ],
         "cta": "string (UA CTA)"
       }
     ]
   }
   Generate exactly 3 entries in the "remixes" array. Keep all Ukrainian translations natural, emotional, and persuasive.
`;

/**
 * Main Remix Engine Generator Function
 */
function createRemixProviderError(code, status, message, cause) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.payload = { error: code, message };
  error.cause = cause;
  return error;
}

function createRemixGenerationFailure(cause) {
  const error = createRemixProviderError(
    'ai_provider_failed',
    502,
    'AI adaptation failed. Please try again in a minute.',
    cause,
  );
  error.category = cause?.category || cause?.code || 'provider_transport';
  error.diagnostic = cause?.diagnostic || null;
  error.payload.category = error.category;
  if (error.diagnostic) error.payload.diagnostic = error.diagnostic;
  if (error.category === 'provider_content_blocked') {
    error.payload.message = 'The provider blocked this adaptation request. Change the source or requested framing and try again.';
  }
  return error;
}

function normalizeFinishReason(value) {
  return String(value || '').trim().toUpperCase();
}

function classifyGeminiProviderResult({
  finishReason = '',
  blockReason = '',
  status = 0,
  error = null,
  responseTextLength,
} = {}) {
  const normalizedFinishReason = normalizeFinishReason(finishReason);
  const normalizedBlockReason = normalizeFinishReason(blockReason);
  if (normalizedFinishReason === 'MAX_TOKENS') return { category: 'output_token_limit', retryable: true };
  if (GEMINI_CONTENT_BLOCK_REASONS.has(normalizedFinishReason) || GEMINI_CONTENT_BLOCK_REASONS.has(normalizedBlockReason)) {
    return { category: 'provider_content_blocked', retryable: false };
  }
  if (Number(status) === 429) return { category: 'provider_rate_limited', retryable: true };
  if ([408, 504].includes(Number(status)) || error?.name === 'TimeoutError' || error?.name === 'AbortError') {
    return { category: 'provider_timeout', retryable: true };
  }
  if (error?.code === 'invalid_provider_json') return { category: 'invalid_provider_json', retryable: true };
  if (error?.code === 'provider_empty_response' || Number(responseTextLength) === 0) {
    return { category: 'provider_empty_response', retryable: true };
  }
  if (error || Number(status) >= 500) return { category: 'provider_transport', retryable: true };
  return { category: 'provider_ok', retryable: false };
}

function getRemixRetryDecision({ category = '', attempt = 1 } = {}) {
  if (Number(attempt) >= 2) return { retry: false, reason: 'attempt_limit' };
  if (category === 'provider_content_blocked') return { retry: false, reason: 'content_blocked' };
  if ([
    'output_token_limit',
    'invalid_provider_json',
    'provider_empty_response',
    'provider_rate_limited',
    'provider_timeout',
    'provider_transport',
    'remix_quality_rejected',
  ].includes(category)) {
    return {
      retry: true,
      reason: category === 'output_token_limit' ? 'increase_output_budget' : 'bounded_retry',
    };
  }
  return { retry: false, reason: 'not_retryable' };
}

function createClassifiedProviderError(category, message, diagnostic = {}, cause) {
  const error = new Error(message || category);
  error.code = category;
  error.category = category;
  error.diagnostic = diagnostic;
  error.cause = cause;
  return error;
}

function getGeminiApiBase() {
  return process.env.GEMINI_API_BASE || DEFAULT_GEMINI_API_BASE;
}

function normalizeRemixLanguage(value = '') {
  return String(value || '').trim().toLowerCase() === 'en' ? 'en' : 'uk';
}

function getRemixLanguageInstruction(language = 'uk') {
  return normalizeRemixLanguage(language) === 'en'
    ? 'Write every descriptive and user-visible output field in natural English. Preserve the source conflict and mechanic semantically, but do not copy non-English speech or OCR into the adaptation.'
    : 'Write every descriptive and user-visible output field in natural Ukrainian. Preserve the source conflict and mechanic semantically, but do not copy non-Ukrainian speech or OCR into the adaptation.';
}

async function generateRemix(globalInsight, businessBrief, options = {}) {
  const analysisLanguage = normalizeRemixLanguage(options.language);
  const normalizedBrandBrain = normalizeBrandBrain(businessBrief);
  const enrichedBusinessBrief = {
    ...(businessBrief || {}),
    niche: businessBrief?.niche || normalizedBrandBrain.businessType || '',
    product: businessBrief?.product || normalizedBrandBrain.product || normalizedBrandBrain.offer || '',
    location: businessBrief?.location || normalizedBrandBrain.location || '',
    toneOfVoice: businessBrief?.toneOfVoice || normalizedBrandBrain.toneOfVoice || '',
    audience: businessBrief?.audience || normalizedBrandBrain.audience || '',
    goals: businessBrief?.goals || normalizedBrandBrain.goals || [],
    stopTopics: businessBrief?.stopTopics || normalizedBrandBrain.stopTopics || [],
    contentFocus: businessBrief?.contentFocus || normalizedBrandBrain.contentFocus || '',
    cta: businessBrief?.cta || normalizedBrandBrain.cta || '',
    proof: businessBrief?.proof || normalizedBrandBrain.proof || '',
    brandBrainMode: normalizedBrandBrain.mode,
    brandBrainReady: normalizedBrandBrain.ready,
  };
  const {
    title: globalTitle = "",
    hook: globalHook = "",
    script: globalScript = "",
    marketingMechanics: globalMechanics = ""
  } = globalInsight || {};

  const {
    niche = "Кафе/Ресторан",
    product = "Спешелті кава та десерти",
    location = "Київ",
    toneOfVoice = "дружній, але професійний"
  } = enrichedBusinessBrief || {};

  console.log('[RemixEngine] Generating remixes', JSON.stringify({
    brandMode: enrichedBusinessBrief.brandBrainMode,
    brandReady: enrichedBusinessBrief.brandBrainReady,
    populatedBrandFieldCount: [niche, product, location, toneOfVoice].filter(Boolean).length,
  }));

  // Check if API keys are present in process.env
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (geminiApiKey) {
    try {
      return await generateValidatedProviderResult({
        provider: 'gemini',
        model: process.env.GEMINI_REMIX_MODEL || process.env.GEMINI_TEXT_MODEL || DEFAULT_GEMINI_REMIX_MODEL,
        generate: (qualityFeedback = '', attemptContext = {}) => generateWithGemini(
          geminiApiKey,
          globalInsight,
          enrichedBusinessBrief,
          {
            ...attemptContext,
            qualityFeedback,
            language: analysisLanguage,
            maxRequestBytes: options.maxRequestBytes,
          },
        ),
        globalInsight,
        businessBrief: enrichedBusinessBrief,
        beforeProviderAttempt: options.beforeProviderAttempt,
        maxAttempts: options.maxAttempts,
        route: options.route,
        workspaceId: options.workspaceId,
        inputSizeBytes: options.inputSizeBytes,
        maxOutputTokens: options.maxOutputTokens,
        retryMaxOutputTokens: options.retryMaxOutputTokens,
      });
    } catch (err) {
      console.error(`[RemixEngine] Gemini generation failed (${err.code || 'provider_error'}): ${err.message}`);
      if (err?.providerAttemptBlocked) throw err;
      throw createRemixGenerationFailure(err);
    }
  } else if (openaiApiKey) {
    try {
      return await generateValidatedProviderResult({
        provider: 'openai',
        model: 'gpt-4o-mini',
        generate: (qualityFeedback = '', attemptContext = {}) => generateWithOpenAI(
          openaiApiKey,
          globalInsight,
          enrichedBusinessBrief,
          { ...attemptContext, qualityFeedback, language: analysisLanguage },
        ),
        globalInsight,
        businessBrief: enrichedBusinessBrief,
        beforeProviderAttempt: options.beforeProviderAttempt,
        maxAttempts: options.maxAttempts,
        route: options.route,
        workspaceId: options.workspaceId,
        inputSizeBytes: options.inputSizeBytes,
        maxOutputTokens: options.maxOutputTokens,
        retryMaxOutputTokens: options.retryMaxOutputTokens,
      });
    } catch (err) {
      console.error(`[RemixEngine] OpenAI generation failed (${err.code || 'provider_error'}): ${err.message}`);
      if (err?.providerAttemptBlocked) throw err;
      throw createRemixGenerationFailure(err);
    }
  }

  throw createRemixProviderError(
    'ai_provider_not_configured',
    503,
    'AI provider is not configured.',
  );
}

function parseProviderJson(text) {
  const source = String(text || '').trim();
  const unfenced = source
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  const candidate = start >= 0 && end >= start ? unfenced.slice(start, end + 1) : unfenced;

  try {
    return JSON.parse(candidate);
  } catch (cause) {
    const error = new Error(`Invalid provider JSON: ${cause.message}`);
    error.code = 'invalid_provider_json';
    error.cause = cause;
    throw error;
  }
}

function buildSafeGeminiResponseDiagnostic(payload = {}, responseText = '') {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const rawFinishReason = String(
    candidates[0]?.finishReason || payload?.promptFeedback?.blockReason || '',
  ).trim().toUpperCase().slice(0, 60);
  return {
    finishReason: GEMINI_FINISH_REASONS.has(rawFinishReason) ? rawFinishReason : '',
    candidateCount: Math.min(candidates.length, GEMINI_CANDIDATE_COUNT_LIMIT),
    responseTextLength: Math.min(
      Buffer.byteLength(String(responseText || ''), 'utf8'),
      GEMINI_RESPONSE_TEXT_LENGTH_LIMIT,
    ),
  };
}

function parseGeminiResponse(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const candidate = candidates[0] || {};
  const finishReason = normalizeFinishReason(candidate.finishReason);
  const blockReason = normalizeFinishReason(payload?.promptFeedback?.blockReason);
  const text = (candidate?.content?.parts || [])
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
  const diagnostic = buildSafeGeminiResponseDiagnostic(payload, text);
  diagnostic.blockReason = blockReason || null;
  const classification = classifyGeminiProviderResult({
    finishReason,
    blockReason,
    responseTextLength: text.length,
  });
  if (classification.category !== 'provider_ok') {
    throw createClassifiedProviderError(
      classification.category,
      classification.category === 'provider_content_blocked'
        ? 'Gemini blocked the response.'
        : classification.category === 'output_token_limit'
          ? 'Gemini reached the output token limit.'
          : 'Empty response from Gemini API',
      diagnostic,
    );
  }
  try {
    const result = parseProviderJson(text);
    Object.defineProperty(result, '_providerUsage', {
      value: payload?.usageMetadata || null,
      enumerable: false,
    });
    return { result, diagnostic };
  } catch (cause) {
    throw createClassifiedProviderError('invalid_provider_json', cause.message, diagnostic, cause);
  }
}

async function generateValidatedProviderResult({
  provider,
  model,
  generate,
  globalInsight,
  businessBrief,
  beforeProviderAttempt,
  maxAttempts = 2,
  route = 'unknown',
  workspaceId = '',
  inputSizeBytes = 0,
  maxOutputTokens = DEFAULT_REMIX_MAX_OUTPUT_TOKENS,
  retryMaxOutputTokens = DEFAULT_REMIX_RETRY_MAX_OUTPUT_TOKENS,
}) {
  const attemptLimit = Math.min(2, Math.max(1, Number(maxAttempts) || 2));
  let qualityFeedback = '';
  let lastError = null;
  const diagnostics = [];
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    let result;
    const attemptOutputLimit = attempt > 1 && lastError?.category === 'output_token_limit'
      ? Math.max(
        Number(maxOutputTokens) || DEFAULT_REMIX_MAX_OUTPUT_TOKENS,
        Number(retryMaxOutputTokens) || DEFAULT_REMIX_RETRY_MAX_OUTPUT_TOKENS,
      )
      : Number(maxOutputTokens) || DEFAULT_REMIX_MAX_OUTPUT_TOKENS;
    try {
      if (typeof beforeProviderAttempt === 'function') {
        await beforeProviderAttempt({
          provider,
          model,
          operation: 'remix',
          attempt,
        });
      }
      const generated = await generate(qualityFeedback, {
        attempt,
        maxOutputTokens: attemptOutputLimit,
      });
      result = generated?.result || generated;
      const providerDiagnostic = generated?.diagnostic || {};
      diagnostics.push({
        provider,
        model,
        route,
        workspaceId,
        attempt,
        finishReason: providerDiagnostic.finishReason || null,
        candidateCount: Number(providerDiagnostic.candidateCount) || 0,
        responseTextLength: Number(providerDiagnostic.responseTextLength) || 0,
        inputSizeBytes: Number(inputSizeBytes) || 0,
        outputLimit: attemptOutputLimit,
        errorCategory: null,
        retryDecision: 'accepted_for_validation',
      });
      lastError = null;
    } catch (error) {
      if (error?.providerAttemptBlocked) throw error;
      const providerDiagnostic = error?.diagnostic || {};
      const classification = provider === 'gemini'
        ? classifyGeminiProviderResult({
          finishReason: providerDiagnostic.finishReason,
          blockReason: providerDiagnostic.blockReason,
          status: error?.status,
          error,
          responseTextLength: providerDiagnostic.responseTextLength,
        })
        : { category: error?.category || error?.code || 'provider_transport' };
      error.category = error.category || classification.category;
      lastError = error;
      const retryDecision = attempt >= attemptLimit
        ? { retry: false, reason: 'attempt_limit' }
        : getRemixRetryDecision({ category: error.category, attempt });
      diagnostics.push({
        provider,
        model,
        route,
        workspaceId,
        attempt,
        finishReason: providerDiagnostic.finishReason || null,
        candidateCount: Number(providerDiagnostic.candidateCount) || 0,
        responseTextLength: Number(providerDiagnostic.responseTextLength) || 0,
        inputSizeBytes: Number(inputSizeBytes) || 0,
        outputLimit: attemptOutputLimit,
        errorCategory: error.category,
        retryDecision: retryDecision.retry ? retryDecision.reason : 'no_retry',
      });
      error.diagnostic = { attempts: diagnostics };
      if (error.category === 'invalid_provider_json') {
        qualityFeedback = 'Previous response was not valid complete JSON. Return one complete JSON object only.';
      } else if (error.category === 'provider_empty_response') {
        qualityFeedback = 'Previous response was empty. Return one complete JSON object only.';
      }
      console.warn(`[RemixEngine] ${provider}/${model} category=${error.category} attempt=${attempt} retry=${retryDecision.retry}`);
      if (!retryDecision.retry) throw error;
      if (['provider_rate_limited', 'provider_timeout', 'provider_transport'].includes(error.category)) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(250, 75 * attempt)));
      }
      continue;
    }
    const assessment = assessRemixQuality(result, { globalInsight, businessBrief });
    if (assessment.ok) {
      result._generation = {
        provider,
        model,
        attempts: attempt,
        fallback: false,
        diagnostics,
        ...(result._providerUsage ? { usage: result._providerUsage } : {}),
      };
      diagnostics[diagnostics.length - 1].retryDecision = 'accepted';
      console.log(`[RemixEngine] ${provider}/${model} accepted on attempt ${attempt}`);
      return result;
    }
    qualityFeedback = assessment.reasons.join(' ');
    diagnostics[diagnostics.length - 1].errorCategory = 'remix_quality_rejected';
    const retryDecision = attempt >= attemptLimit
      ? { retry: false, reason: 'attempt_limit' }
      : getRemixRetryDecision({ category: 'remix_quality_rejected', attempt });
    diagnostics[diagnostics.length - 1].retryDecision = retryDecision.retry ? retryDecision.reason : 'no_retry';
    console.warn(`[RemixEngine] ${provider}/${model} rejected on attempt ${attempt}: ${qualityFeedback}`);
    if (!retryDecision.retry) break;
  }
  if (lastError) {
    lastError.diagnostic = { attempts: diagnostics };
    throw lastError;
  }
  const error = new Error(`Provider output failed quality validation: ${qualityFeedback}`);
  error.code = 'remix_quality_rejected';
  error.category = 'remix_quality_rejected';
  error.diagnostic = { attempts: diagnostics };
  throw error;
}

/**
 * Gemini SDK or REST API integration
 */
async function generateWithGemini(apiKey, globalInsight, businessBrief, attemptContext = {}) {
  const model = process.env.GEMINI_REMIX_MODEL || process.env.GEMINI_TEXT_MODEL || DEFAULT_GEMINI_REMIX_MODEL;
  const url = `${getGeminiApiBase()}/models/${model}:generateContent?key=${apiKey}`;
  const qualityFeedback = attemptContext.qualityFeedback || '';
  const language = normalizeRemixLanguage(attemptContext.language);
  const options = attemptContext;
  const canonicalPayload = globalInsight?.generationPayload;
  const prompt = canonicalPayload ? `
=== CANONICAL REMIX GENERATION PAYLOAD ===
${JSON.stringify(canonicalPayload, null, 2)}

Use every supplied source fact once, preserve its grounding and limitations, and generate exactly ${canonicalPayload.variantCount || 3} adaptations in ${canonicalPayload.targetLanguage || 'uk'}.
Respond strictly with a JSON object that satisfies the response schema.
${qualityFeedback ? `\nCORRECTION REQUIRED AFTER VALIDATION:\n${qualityFeedback}\n` : ''}
` : `
=== BUSINESS BRIEF ===
Niche: ${businessBrief.niche}
Product/Offer: ${businessBrief.product}
Location: ${businessBrief.location || 'Ukraine'}
Tone of Voice: ${businessBrief.toneOfVoice}
Audience: ${businessBrief.audience || ''}
Content Focus: ${businessBrief.contentFocus || ''}
CTA: ${businessBrief.cta || ''}
Proof: ${businessBrief.proof || ''}
Goals: ${Array.isArray(businessBrief.goals) ? businessBrief.goals.join('; ') : businessBrief.goals || ''}
Stop Topics: ${Array.isArray(businessBrief.stopTopics) ? businessBrief.stopTopics.join('; ') : businessBrief.stopTopics || ''}

${buildBrandBrainPromptBlock(businessBrief)}

=== GLOBAL INSIGHT TO ADAPT ===
Original Video Description: ${globalInsight.title || 'Viral Reels Trend'}
Original Hook: ${globalInsight.hook}
Original Script/Text: ${globalInsight.script}
Marketing Mechanics: ${globalInsight.marketingMechanics}
Source Grounding Contract: ${JSON.stringify(globalInsight.sourceGrounding || {}, null, 2)}
Video Intelligence: ${JSON.stringify(globalInsight.videoIntelligence || {}, null, 2)}

Please deconstruct and generate 3 custom adaptations. Respond strictly with a JSON object that satisfies the output schema.
${qualityFeedback ? `\nCORRECTION REQUIRED AFTER QUALITY REVIEW:\n${qualityFeedback}\nRewrite all three variants from scratch. Do not repeat the rejected wording.` : ''}
`;

  const requestBody = {
    contents: [{
      role: "user",
      parts: [{ text: prompt }]
    }],
    systemInstruction: {
      parts: [{ text: `${REMIX_SYSTEM_PROMPT}\n\n${getRemixLanguageInstruction(language)}` }]
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: REMIX_RESPONSE_SCHEMA,
      temperature: 0.75,
      topP: 0.9,
      thinkingConfig: { thinkingLevel: 'low' },
      ...(Number.isInteger(options.maxOutputTokens) && options.maxOutputTokens > 0
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
    }
  };
  const serializedRequestBody = JSON.stringify(requestBody);
  const configuredMaxRequestBytes = Number(options.maxRequestBytes);
  if (
    Number.isFinite(configuredMaxRequestBytes)
    && configuredMaxRequestBytes > 0
    && Buffer.byteLength(serializedRequestBody, 'utf8') > configuredMaxRequestBytes
  ) {
    const error = new Error('remix_request_size_limit_exceeded');
    error.code = 'remix_request_size_limit_exceeded';
    throw error;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: serializedRequestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    const classification = classifyGeminiProviderResult({
      status: response.status,
      error: new Error(errorText),
      responseTextLength: errorText.length,
    });
    const error = createClassifiedProviderError(
      classification.category,
      `Gemini API HTTP ${response.status}`,
      { finishReason: null, candidateCount: 0, responseTextLength: errorText.length, status: response.status },
    );
    error.status = response.status;
    throw error;
  }

  const jsonResult = await response.json();
  return parseGeminiResponse(jsonResult);
}

/**
 * OpenAI REST API integration
 */
async function generateWithOpenAI(apiKey, globalInsight, businessBrief, attemptContext = {}) {
  const url = "https://api.openai.com/v1/chat/completions";
  const qualityFeedback = attemptContext.qualityFeedback || '';
  const language = normalizeRemixLanguage(attemptContext.language);
  const canonicalPayload = globalInsight?.generationPayload;
  const prompt = canonicalPayload ? `
=== CANONICAL REMIX GENERATION PAYLOAD ===
${JSON.stringify(canonicalPayload, null, 2)}
Respond with exactly ${canonicalPayload.variantCount || 3} adaptations as one valid JSON object.
${qualityFeedback ? `\nCORRECTION REQUIRED AFTER VALIDATION:\n${qualityFeedback}\n` : ''}
` : `
=== BUSINESS BRIEF ===
Niche: ${businessBrief.niche}
Product/Offer: ${businessBrief.product}
Location: ${businessBrief.location || 'Ukraine'}
Tone of Voice: ${businessBrief.toneOfVoice}
Audience: ${businessBrief.audience || ''}
Content Focus: ${businessBrief.contentFocus || ''}
CTA: ${businessBrief.cta || ''}
Proof: ${businessBrief.proof || ''}
Goals: ${Array.isArray(businessBrief.goals) ? businessBrief.goals.join('; ') : businessBrief.goals || ''}
Stop Topics: ${Array.isArray(businessBrief.stopTopics) ? businessBrief.stopTopics.join('; ') : businessBrief.stopTopics || ''}

${buildBrandBrainPromptBlock(businessBrief)}

=== GLOBAL INSIGHT TO ADAPT ===
Original Video Description: ${globalInsight.title || 'Viral Reels Trend'}
Original Hook: ${globalInsight.hook}
Original Script/Text: ${globalInsight.script}
Marketing Mechanics: ${globalInsight.marketingMechanics}
Source Grounding Contract: ${JSON.stringify(globalInsight.sourceGrounding || {}, null, 2)}
Video Intelligence: ${JSON.stringify(globalInsight.videoIntelligence || {}, null, 2)}
${qualityFeedback ? `\nCORRECTION REQUIRED AFTER QUALITY REVIEW:\n${qualityFeedback}\nRewrite all three variants from scratch. Do not repeat the rejected wording.` : ''}
`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: Number(attemptContext.maxOutputTokens) || DEFAULT_REMIX_MAX_OUTPUT_TOKENS,
      messages: [
        { role: "system", content: `${REMIX_SYSTEM_PROMPT}\n\n${getRemixLanguageInstruction(language)}` },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API HTTP ${response.status}: ${errorText}`);
  }

  const jsonResult = await response.json();
  const textResponse = jsonResult.choices?.[0]?.message?.content;
  if (!textResponse) {
    throw new Error("Empty response from OpenAI API");
  }

  const result = parseProviderJson(textResponse);
  Object.defineProperty(result, '_providerUsage', {
    value: jsonResult.usage || null,
    enumerable: false,
  });
  return {
    result,
    diagnostic: {
      finishReason: jsonResult.choices?.[0]?.finish_reason || null,
      candidateCount: Array.isArray(jsonResult.choices) ? jsonResult.choices.length : 0,
      responseTextLength: textResponse.length,
    },
  };
}

function cleanBriefValue(value, fallback) {
  return String(value || fallback || '').replace(/\s+/g, ' ').trim();
}

function getMechanicSummary(globalInsight = {}) {
  const video = globalInsight.videoIntelligence?.video || {};
  const candidates = [
    video.contentMechanic,
    video.videoSummary,
    globalInsight.marketingMechanics,
    globalInsight.script,
    globalInsight.hook
  ];

  const summary = candidates
    .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
    .find((value) => value.length > 12);

  return summary || 'visual surprise -> proof -> simple repeatable routine -> CTA';
}

function compactSourceText(value, fallback) {
  const text = cleanBriefValue(value, fallback);
  return text.length > 360 ? `${text.slice(0, 357)}...` : text;
}

function buildSourceAdaptationContext(globalInsight = {}) {
  const video = globalInsight.videoIntelligence?.video || {};
  const sourceConflict = compactSourceText(
    globalInsight.script || video.videoSummary || globalInsight.marketingMechanics || globalInsight.hook,
    'видима напруга та конкретний момент, коли очікування не збігається з результатом',
  );
  const mechanismSources = [
    video.contentMechanic,
    globalInsight.marketingMechanics,
    video.videoSummary,
  ].map((value) => cleanBriefValue(value, '')).filter(Boolean);
  const preservedMechanic = compactSourceText(
    [...new Set(mechanismSources)].join(' | ') || globalInsight.script,
    'показати дію, видимий поворот і доказ у кадрі',
  );
  return { sourceConflict, preservedMechanic };
}

function buildSourceFaithfulRemixes(globalInsight = {}, brand = {}) {
  const source = buildSourceAdaptationContext(globalInsight);
  const hasBrand = Boolean(brand.hasBrand);
  const niche = cleanBriefValue(brand.niche, 'автор або локальний бізнес');
  const product = cleanBriefValue(brand.product, 'наступний корисний крок');
  const audience = cleanBriefValue(brand.audience, 'глядач');
  const location = cleanBriefValue(brand.location, 'Україна');
  const directKeyword = product.split(/\s+/).slice(0, 2).join(' ') || 'ідея';
  const brandTranslation = hasBrand
    ? `Для ${niche}: ${product} для ${audience} у ${location}; бренд змінює контекст і CTA, але не конфлікт джерела.`
    : 'Консультантський режим: не вигадувати продукт або результат, а пояснити дію джерела через безпечний інтерактив.';
  const consultantRewardCue = /reward|prize|surprise|random|purchase|checkout|винагород|сюрприз|покуп/u.test(`${source.sourceConflict} ${source.preservedMechanic}`)
    ? 'покупка, винагорода і жива реакція клієнта'
    : 'конкретна дія, напруга і видимий фінал із джерела';
  const plans = [
    {
      semanticAngle: SEMANTIC_ANGLES[0],
      title: hasBrand ? `${product}: конфлікт у кадрі` : 'Конфлікт без пояснення',
      hook: `Спершу покажи цей конфлікт: ${source.sourceConflict}`,
      centralClaim: `Конфлікт джерела ${source.sourceConflict} треба показати до пропозиції ${product}.`,
      opener: 'Почни з моменту, коли очікування ламається, без пояснення в першу секунду.',
      ctaVerb: hasBrand ? 'Напиши' : 'Опиши',
    },
    {
      semanticAngle: SEMANTIC_ANGLES[1],
      title: hasBrand ? `${product}: механіка в дії` : 'Повтори механіку',
      hook: `Не розказуй про рішення — відтвори механіку: ${source.preservedMechanic}`,
      centralClaim: `Механіка джерела ${source.preservedMechanic} має стати видимою дією для ${product}.`,
      opener: 'Покажи руки, екран або предмет саме в моменті, коли механіка змінює ситуацію.',
      ctaVerb: hasBrand ? 'Коментуй' : 'Запропонуй',
    },
    {
      semanticAngle: SEMANTIC_ANGLES[2],
      title: hasBrand ? `${product}: рішення глядача` : 'Глядач обирає крок',
      hook: hasBrand
        ? `Глядач обирає наступний крок, який варто перевірити для ${product}.`
        : 'Глядач обирає наступний крок, який варто перевірити в цій ситуації.',
      centralClaim: hasBrand
        ? `Глядач обирає наступний крок для перевірки ${product}.`
        : 'Глядач обирає наступний крок для перевірки ситуації.',
      opener: 'Відкрий короткою паузою перед вибором і залиш у кадрі предмет або екран із джерельної ситуації.',
      ctaVerb: hasBrand ? 'Надішли' : 'Обери',
    },
  ];

  return plans.map((plan) => ({
    title: plan.title,
    hook: plan.hook,
    semanticAngle: plan.semanticAngle,
    centralClaim: plan.centralClaim,
    sourceConflict: source.sourceConflict,
    preservedMechanic: source.preservedMechanic,
    brandTranslation,
    productionProof: `Телефон, один виконавець і конкретний доказ у кадрі: ${hasBrand ? product : consultantRewardCue}.`,
    adaptationLogic: `Конфлікт: ${source.sourceConflict}. Механіка: ${source.preservedMechanic}. Переклад: ${brandTranslation}`,
    strategicNote: `Source-faithful ${plan.semanticAngle}: ${source.preservedMechanic}`,
    visualFlow: [
      {
        timeframe: '0:00-0:03',
        actionDescription: `${plan.opener} Конфлікт джерела в кадрі: ${source.sourceConflict}.`,
        onScreenText: plan.title,
        audioVoiceover: plan.hook,
      },
      {
        timeframe: '0:03-0:09',
        actionDescription: `Відтвори механіку джерела без заміни теми: ${source.preservedMechanic}. Потім покажи реальний процес ${hasBrand ? product : consultantRewardCue}.`,
        onScreenText: hasBrand ? `${product}: дія, не обіцянка` : 'Дія, не вигаданий офер',
        audioVoiceover: `Не підмінюй ситуацію загальною порадою. У кадрі має залишитися: ${source.preservedMechanic}.`,
      },
      {
        timeframe: '0:09-0:15',
        actionDescription: `Покажи наступний крок для ${hasBrand ? product : consultantRewardCue}, але поверни глядача до конфлікту: ${source.sourceConflict}.`,
        onScreenText: hasBrand ? `${product} у ${location}` : 'Що перевірити наступним?',
        audioVoiceover: hasBrand
          ? `Це ${product} для ${audience}: не обіцянка, а спосіб перевірити конкретну ситуацію.`
          : 'Запропонуй наступну перевірку без вигаданого бренду або результату.',
      },
    ],
    cta: hasBrand
      ? `${plan.ctaVerb} "${directKeyword}" у Direct або коментарі, щоб обговорити ${product}.`
      : `${plan.ctaVerb} наступний варіант у коментарях, який варто перевірити в цій ситуації.`,
  }));
}

function generateBrandAdaptedFallback(globalInsight, businessBrief) {
  const normalized = normalizeBrandBrain(businessBrief);
  const niche = cleanBriefValue(normalized.businessType, 'локальний сервісний бренд');
  const product = cleanBriefValue(normalized.product || normalized.offer, 'стартова пропозиція');
  const location = cleanBriefValue(normalized.location, 'Україна');
  const toneOfVoice = cleanBriefValue(normalized.toneOfVoice, 'спокійний, практичний, експертний');
  const source = buildSourceAdaptationContext(globalInsight);

  return {
    deconstruction: {
      coreMechanics: `Конфлікт джерела: ${source.sourceConflict}. Збережена механіка: ${source.preservedMechanic}. Бренд перекладає їх у свій контекст, не замінюючи загальним AI-маркетингом.`,
      psychologicalTriggers: ['видима конкретна напруга', 'дія або поворот, який можна перевірити', 'простий наступний крок без вигаданих результатів'],
      removedCulturalContext: ['назву та дослівний текст оригіналу', 'непідтверджені метрики й сторонні бренди', `подачу, що не відповідає тону ${toneOfVoice}`],
    },
    viabilityFilter: {
      isAdaptable: true,
      uaMentalityCheck: `Працює для ${niche} у ${location}, бо спершу показує конкретну ситуацію, а ${product} додає лише реальний наступний крок.`,
      productionFeasibility: 'Можна зняти на телефон у реальному просторі: один виконавець, один конкретний процес і три короткі кадри без студії.',
    },
    remixes: buildSourceFaithfulRemixes(globalInsight, {
      hasBrand: true,
      niche,
      product,
      audience: normalized.audience,
      location,
    }),
  };
}

function generateConsultantFallback(globalInsight = {}) {
  const source = buildSourceAdaptationContext(globalInsight);
  return {
    deconstruction: {
      coreMechanics: `Конфлікт джерела: ${source.sourceConflict}. Збережена механіка: ${source.preservedMechanic}.`,
      psychologicalTriggers: ['цікавість до конкретного повороту', 'видимий доказ замість загальної поради', 'безпечний інтерактив без вигаданого оферу'],
      removedCulturalContext: ['назва, хештеги та персонажі джерела', 'непідтверджені дані про бренд', 'складний продакшн'],
    },
    viabilityFilter: {
      isAdaptable: true,
      uaMentalityCheck: 'Сценарій тримається на видимій людській дії та чесній реакції, тому не вимагає вигаданого Brand Brain.',
      productionFeasibility: 'Потрібні телефон, один учасник, предмет або екран із ситуації джерела та три короткі плани без студійного світла.',
    },
    remixes: buildSourceFaithfulRemixes(globalInsight),
  };
}

function generateHighFidelityFallback(globalInsight, businessBrief) {
  const normalized = normalizeBrandBrain(businessBrief);
  const hasUsableBrandFacts = Boolean(normalized.businessType || normalized.product || normalized.offer);
  if (!hasUsableBrandFacts) {
    return generateConsultantFallback(globalInsight);
  }
  return generateBrandAdaptedFallback(globalInsight, businessBrief);

  const {
    niche = "Кафе/Ресторан",
    product = "Спешелті кава та десерти",
    location = "Львів",
    toneOfVoice = "дружній, але професійний"
  } = businessBrief || {};

  const {
    title: globalTitle = "AI workflow for content creation",
    hook: globalHook = "How to make 5 ad creatives in 10 minutes",
    script: globalScript = "Stop paying for photoshoots. Just take one product photo and use this AI...",
    marketingMechanics = "pain point -> fast AI solution -> call to action on Direct keyword"
  } = globalInsight || {};

  // Formulate tailored Ukrainian terms based on niche and tone
  const lowerNiche = niche.toLowerCase();
  const lowerTone = toneOfVoice.toLowerCase();
  
  // Decide vocabulary based on Tone of Voice
  const isBold = lowerTone.includes('дерзк') || lowerTone.includes('молодеж') || lowerTone.includes('зухвал') || lowerTone.includes('хайп');
  const isExpert = lowerTone.includes('профес') || lowerTone.includes('експерт') || lowerTone.includes('серйозн');
  
  // Custom greetings & verbs based on tone
  const greeting = isBold ? "Йоу!" : isExpert ? "Вітаю!" : "Привіт!";
  const verbDirect = isBold ? "залітай у Дірект і пиши" : isExpert ? "надішліть повідомлення" : "пиши в Дірект";
  const ctaKeyword = isBold ? "СТАРТ" : isExpert ? "ОФФЕР" : "ХОЧУ";

  // Build beautiful custom scenarios depending on niche
  let coreMechanicsText = `Перетворення тренду "${globalTitle}" на локальну механіку взаємодії. Глобальний хук про швидке вирішення болю адаптовано під локальний контекст: український споживач реагує на конкретну вигоду та простоту дій.`;
  let mentalityCheck = `В Україні зараз надвисокий рівень диджиталізації та очікування швидкого сервісу. Споживачі цінують щирість та локальний бізнес, тому відкидаємо пафосні американські обіцянки мільйонів і переходимо до реальної щоденної користі.`;
  let feasibility = `Максимально просто. Не потрібна студія чи дороге світло. Достатньо записати одне розмовне відео на телефон прямо на робочому місці (в ${location}) та додати динамічні субтитри.`;

  let remixes = [];

  if (lowerNiche.includes('кафе') || lowerNiche.includes('ресторан') || lowerNiche.includes('їж') || lowerNiche.includes('коф')) {
    remixes = [
      {
        title: "Ремікс 1: Інтерактивний гастро-хук (Емоційний)",
        hook: `Чому звичайна кава в ${location} більше не працює?`,
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Спікер крупним планом робить перший ковток свіжої кави, на фоні грає затишний неоновий надпис закладу.",
            onScreenText: "Кава більше не працює? ☕️",
            audioVoiceover: `${greeting} Думаєш, люди приходять до нас просто за кофеїном? Насправді вони шукають ту саму атмосферу та емоцію в ${location}.`
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Камера плавно переходить на десертну вітрину, показуючи текстуру фірмового круасана з фісташкою.",
            onScreenText: "Секретний спешелті-оффер 👇",
            audioVoiceover: `Замість того, щоб купувати звичайне американо на ходу, спробуй поєднання нашої спешелті кави та свіжовипечених десертів.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Бариста посміхається і простягає чашку з лате-артом прямо в об'єктив камери.",
            onScreenText: "Напиши 'СПЕШЕЛТІ' в Дірект",
            audioVoiceover: `Хочеш отримати фірмовий макарон у подарунок до першого візиту? Просто ${verbDirect} кодове слово 'СПЕШЕЛТІ' нам у Дірект!`
          }
        ],
        cta: `Напиши кодове слово 'СПЕШЕЛТІ' в Дірект і отримай бонус`
      },
      {
        title: "Ремікс 2: Бекстейдж-тренд (Чесна кухня)",
        hook: "Скільки насправді коштує зробити один крутий десерт?",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Шеф-кондитер розбиває шоколадну сферу, з якої витікає гарячий карамельний соус.",
            onScreenText: "Чесна математика десерту 🍫",
            audioVoiceover: "Більшість людей думають, що кондитерка — це просто борошно та цукор. Але за цим стоять години підбору бельгійського шоколаду."
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Швидка динамічна нарізка кадрів: зважування інгредієнтів, випікання, декорування вручну.",
            onScreenText: "100% натуральні інгредієнти",
            audioVoiceover: `Ми в ${location} не використовуємо готові суміші. Тільки натуральне вершкове масло та фермерські ягоди.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Спікер відкушує десерт і показує задоволене обличчя з піднятим догори пальцем.",
            onScreenText: "Забронювати столик → Директ",
            audioVoiceover: `Спробуй справжній смак вже сьогодні. Напиши нам 'МЕНЮ' в Дірект, і ми надішлемо повну карту десертів та забронюємо для тебе найкращий столик.`
          }
        ],
        cta: "Напиши кодове слово 'МЕНЮ' в Дірект для бронювання та перегляду меню"
      },
      {
        title: "Ремікс 3: Локальна гордість (Дерзкий/Спільнота)",
        hook: `Секретне місце в ${location}, про яке ще не знають твої друзі`,
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Естетичний кадр входу у заклад через зелену арку, камера швидко залітає всередину.",
            onScreenText: "Таємна локація знайдена! 📍",
            audioVoiceover: "Шукаєш ідеальне спокійне місце для роботи з ноутбуком або побачення, де немає натовпу?"
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Показ затишного куточка з м'якими кріслами, розетками та ідеально налаштованим освітленням.",
            onScreenText: "Dzhero Vibes: Коворкінг + Релакс",
            audioVoiceover: `Ми створили простір, де є швидкий інтернет, генератори на випадок відключень і неймовірні спешелті кава та десерти.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Камера показує екран телефона з чат-ботом закладу, який видає знижку.",
            onScreenText: "Пиши 'ЗАТИШОК' в Дірект",
            audioVoiceover: `Хочеш секретну знижку 15% на перше замовлення? Просто ${verbDirect} 'ЗАТИШОК' прямо зараз!`
          }
        ],
        cta: "Пиши кодове слово 'ЗАТИШОК' в Дірект і забирай знижку 15%"
      }
    ];
  } else if (lowerNiche.includes('одяг') || lowerNiche.includes('шоп') || lowerNiche.includes('бренд') || lowerNiche.includes('гардероб') || lowerNiche.includes('fashion')) {
    remixes = [
      {
        title: "Ремікс 1: Капсульний лайфхак (Корисний експерт)",
        hook: "Як зібрати 7 стильних образів всього з 3 речей?",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Модель стоїть біля вішака з одягом, клацає пальцями — і на ній миттєво змінюється образ.",
            onScreenText: "Магія капсульного гардеробу 🪄",
            audioVoiceover: `${greeting} Втомилася від вічного 'нічого одягнути', хоча шафа ломиться від речей? Тобі не потрібна валіза одягу.`
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Динамічна зміна кадрів: модель комбінує базові штани, піджак та топ під різні аксесуари.",
            onScreenText: "База від нашого бренду в Одесі",
            audioVoiceover: `Достатньо мати якісну базу. Наші вироби в ${location} шиються за авторськими лекалами з натуральних італійських тканин.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Модель показує коробку з брендованим пакуванням і посміхається.",
            onScreenText: "Напиши 'КАПСУЛА' в Дірект",
            audioVoiceover: `Хочеш безкоштовний гайд з підбору капсульного гардероба на це літо? ${verbDirect} кодове слово 'КАПСУЛА'!`
          }
        ],
        cta: "Пиши кодове слово 'КАПСУЛА' в Дірект для отримання безкоштовного гайду"
      },
      {
        title: "Ремікс 2: Анти-шопінг маніфест (Зухвалий)",
        hook: "Перестань купувати дешевий одноразовий одяг!",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Дівчина кидає на підлогу кофту з мас-маркету, яка розтягнулася після першого прання.",
            onScreenText: "Досить викидати гроші! ❌",
            audioVoiceover: "Купуєш дешеву річ, вона втрачає вигляд після першого ж прання, і ти знову йдеш витрачати гроші. Знайомо?"
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Камера макро-зйомкою показує ідеальні шви та міцну фурнітуру нашого одягу.",
            onScreenText: "Якість, яка служить роками ✨",
            audioVoiceover: `Ми створюємо речі, які витримують сотні прань і сидять ідеально. Наш бренд у ${location} гарантує якість кожної ниточки.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Модель загортається у теплий м'який світшот і показує серце руками.",
            onScreenText: "Напиши 'ЯКІСТЬ' в Дірект",
            audioVoiceover: `Спробуй преміум-якість без переплат. Напиши нам 'ЯКІСТЬ' в Дірект, і ми дамо безкоштовну доставку на перше замовлення.`
          }
        ],
        cta: "Напиши кодове слово 'ЯКІСТЬ' в Дірект, щоб отримати безкоштовну доставку"
      },
      {
        title: "Ремікс 3: Естетика примірки (Шоукейс)",
        hook: "Знайшли сукню, яка підкреслює фігуру на всі 100%",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Дівчина крутиться перед дзеркалом у неймовірно красивій вечірній сукні, яка ідеально сідає по талії.",
            onScreenText: "Сукня-мрія знайдена 😍",
            audioVoiceover: "Шукаєш той самий образ для особливої події, який змусить усіх обертатися тобі вслід?"
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Камера показує деталі сукні: відкриту спину, легкість тканини при русі, блиск матеріалу.",
            onScreenText: "Лімітована колекція",
            audioVoiceover: `Це наша нова лімітована колекція. Всього 20 штук на всю країну, пошито вручну нашими майстрами.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Показ подарункового сертифікату або інтер'єру шоуруму.",
            onScreenText: "Пиши 'ОБРАЗ' в Дірект",
            audioVoiceover: `Забронювати свій розмір на примірку в ${location} або отримати онлайн-консультацію стиліста можна написавши 'ОБРАЗ' нам у Дірект!`
          }
        ],
        cta: "Напиши кодове слово 'ОБРАЗ' в Дірект для консультації стиліста та броні розміру"
      }
    ];
  } else {
    // Default tailored to "Эксперт" / "AI-маркетинг" or general business
    remixes = [
      {
        title: "Ремікс 1: Руйнування міфів (Професійний)",
        hook: `Ти використовуєш AI як звичайний Google. Саме тому він не дає бізнес-результату.`,
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Спікер сидить за столом з ноутбуком, рішуче закриває кришку і дивиться в об'єктив.",
            onScreenText: "Досить гуглити в ChatGPT! ❌",
            audioVoiceover: `${greeting} Більшість підприємців думають, що штучний інтелект — це просто заміна пошуковика для написання текстів. Але це помилка.`
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Швидкий запис екрану, де показано автоматизований воркфлоу, що створює контент-план за 10 секунд.",
            onScreenText: "AI як система автоматизації",
            audioVoiceover: `Справжня сила штучного інтелекту — в налаштуванні систем, які автоматизують твої продажі, аналізують конкурентів та пишуть сценарії.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Спікер посміхається і вказує пальцем вниз, де з'являється кодове слово.",
            onScreenText: "Напиши 'СИСТЕМА' в Дірект",
            audioVoiceover: `Хочеш впровадити таку систему у свій бізнес у місті ${location}? Просто ${verbDirect} мені слово 'СИСТЕМА' у приватні повідомлення.`
          }
        ],
        cta: `Напиши кодове слово 'СИСТЕМА' в Дірект для отримання безкоштовного чек-листа`
      },
      {
        title: "Ремікс 2: Крок за кроком (Інструкція)",
        hook: "Як звільнити 20 годин на тиждень за допомогою лише однієї безкоштовної програми",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Спікер з полегшенням видихає, відкидаючись на спинку офісного крісла.",
            onScreenText: "Поверни свій вільний час! ⏱️",
            audioVoiceover: "Постійно тонеш в операційці, рутині та підготовці звітів? Є один простий спосіб це змінити."
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Камера фокусується на телефоні спікера, де видно, як завдання автоматично виконуються.",
            onScreenText: "3 кроки до авто-пілота",
            audioVoiceover: `Замість ручного копіювання, налаштуй один раз інтеграцію між вашими CRM, месенджерами та AI.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Спікер показує жест рукою 'Окей' та киває головою.",
            onScreenText: "Пиши 'АВТО' в Дірект",
            audioVoiceover: `Я підготував детальну відео-інструкцію з налаштування. Напиши слово 'АВТО' в Дірект, і я надішлю її миттєво.`
          }
        ],
        cta: "Напиши кодове слово 'АВТО' в Дірект, щоб отримати відео-інструкцію"
      },
      {
        title: "Ремікс 3: Зухвалий виклик (Кейс-перформанс)",
        hook: "Я докажу, що твій відділ продажів втрачає до 40% клієнтів прямо зараз!",
        visualFlow: [
          {
            timeframe: "0:00-0:03",
            actionDescription: "Спікер тримає в руках пачку аркушів із закресленими графіками і кидає їх на стіл.",
            onScreenText: "Твій бізнес втрачає гроші! 💸",
            audioVoiceover: "Твої менеджери відповідають клієнтам по 2 години? В цей час вони просто купують у конкурентів, які відповідають за хвилину."
          },
          {
            timeframe: "0:03-0:10",
            actionDescription: "Показ аналітичної панелі Dzhero з моментальною авто-відповіддю та кваліфікацією лідів.",
            onScreenText: "Рішення: Миттєва AI-кваліфікація лідів",
            audioVoiceover: `Завдяки нашій платформі Dzhero, кожен клієнт у ${location} отримує відповідь за 5 секунд та кваліфікується автоматично.`
          },
          {
            timeframe: "0:10-0:15",
            actionDescription: "Спікер робить дружній жест, запрошуючи до діалогу.",
            onScreenText: "Напиши 'АУДИТ' в Дірект",
            audioVoiceover: `Хочеш безкоштовний аудит швидкості відповідей твоєї команди? ${verbDirect} мені кодове слово 'АУДИТ'!`
          }
        ],
        cta: "Напиши кодове слово 'АУДИТ' в Дірект для отримання безкоштовного аудиту швидкості відповідей"
      }
    ];
  }

  return {
    deconstruction: {
      coreMechanics: coreMechanicsText,
      psychologicalTriggers: [
        "Апеляція до болю втрати часу та грошей (FOMO/Pain points)",
        "Демонстрація надзвичайно легкого та доступного рішення без бюджету",
        "Моментальний тригер та заклик до простої інтерактивної дії (кодове слово в Директ)"
      ],
      removedCulturalContext: [
        "Прибрано американські приклади масштабу мільйонів доларів",
        "Специфічні зарубіжні платформи замінено локальними інструментами (Instagram Direct, Telegram)",
        "Прибрано очікування великих рекламних бюджетів — сценарії адаптовано під самостійну зйомку на телефон в українському офісі чи закладі"
      ]
    },
    viabilityFilter: {
      isAdaptable: true,
      uaMentalityCheck: mentalityCheck,
      productionFeasibility: feasibility
    },
    remixes: remixes
  };
}

module.exports = {
  generateRemix,
  generateValidatedProviderResult,
  generateHighFidelityFallback,
  classifyGeminiProviderResult,
  getRemixRetryDecision,
  REMIX_OUTPUT_SCHEMA,
  REMIX_RESPONSE_SCHEMA,
  REMIX_SYSTEM_PROMPT
};
