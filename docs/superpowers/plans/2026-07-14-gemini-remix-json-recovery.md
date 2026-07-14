# Gemini Remix JSON Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover one malformed Gemini JSON response with a single retry and stop reporting deterministic fallback output as successful AI adaptation.

**Architecture:** Keep provider parsing and retry policy inside `backend/services/remixEngine.js`. Parse all Gemini text parts through a small JSON extractor, let the existing two-attempt quality loop retry thrown parse errors, and surface a safe 502 after configured-provider exhaustion. The frontend already keeps the draft and shows API failures, so no unrelated UI refactor is required.

**Tech Stack:** Node.js CommonJS backend, native `fetch`, Node `assert`, React/Vite build.

## Global Constraints

- Never expose `GEMINI_API_KEY` in logs, API responses, tests, or client code.
- Retry at most once per adaptation request.
- Do not repair arbitrary malformed JSON by inserting model content.
- Keep deterministic fallback only when neither Gemini nor OpenAI is configured.
- Preserve unrelated dirty-worktree changes, especially `backend/data/db.json`.

---

### Task 1: Reproduce malformed Gemini output and retry behavior

**Files:**
- Create: `scripts/test-remix-json-recovery.mjs`
- Test: `scripts/test-remix-json-recovery.mjs`

**Interfaces:**
- Consumes: `generateRemix(globalInsight, businessBrief)` from `backend/services/remixEngine.js`.
- Produces: regression coverage for split/code-fenced JSON, malformed-first-response retry, configured-provider rejection, and no-provider fallback.

- [ ] **Step 1: Write the failing regression test**

Create a provider-boundary test that installs a fake `globalThis.fetch` before importing the CommonJS module. Use a quality-valid result with three distinct remixes, return malformed JSON on the first response, and return the valid JSON split across two text parts inside a Markdown code fence on the second response.

```js
import assert from 'node:assert/strict';

const previousGeminiKey = process.env.GEMINI_API_KEY;
const previousOpenAiKey = process.env.OPENAI_API_KEY;
process.env.GEMINI_API_KEY = 'test-key';
delete process.env.OPENAI_API_KEY;

const source = {
  title: 'Customer surprise mechanic',
  hook: 'The customer expects one outcome and gets a useful surprise.',
  script: 'Show the choice, reveal the bonus, capture the reaction.',
};

const strong = {
  deconstruction: { coreMechanics: 'choice -> surprise -> reaction', psychologicalTriggers: [], removedCulturalContext: [] },
  viabilityFilter: { isAdaptable: true, uaMentalityCheck: 'Works through visible proof.', productionFeasibility: 'Phone shoot.' },
  remixes: Array.from({ length: 3 }, (_, index) => ({
    title: `Сюрприз для клієнта ${index + 1}`,
    hook: `Клієнт робить звичайний вибір, але фінал ${index + 1} перетворює його на маленьку подію.`,
    visualFlow: [
      { timeframe: '0:00-0:03', actionDescription: 'Покажи клієнта перед простим вибором біля полиці.', onScreenText: 'Звичайна покупка?', audioVoiceover: 'Зараз буде неочікуваний поворот.' },
      { timeframe: '0:03-0:09', actionDescription: 'Працівник додає персональний бонус і показує реакцію.', onScreenText: 'Бонус обирає випадок', audioVoiceover: 'Кожне замовлення отримує свій сюрприз.' },
      { timeframe: '0:09-0:15', actionDescription: 'Крупно покажи товар, бонус і справжню реакцію клієнта.', onScreenText: 'Що додати далі?', audioVoiceover: 'Напиши наступний варіант у коментарях.' },
    ],
    cta: 'Напиши наступний бонус у коментарях.',
  })),
};

const validText = JSON.stringify(strong);
const responses = [
  '{"remixes":[{"title":"broken"}',
  `\`\`\`json\n${validText}\n\`\`\``,
];
let fetchCalls = 0;
globalThis.fetch = async () => {
  const text = responses[fetchCalls++];
  const midpoint = Math.floor(text.length / 2);
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: text.slice(0, midpoint) }, { text: text.slice(midpoint) }] } }],
    }),
  };
};

const remixEngine = (await import('../backend/services/remixEngine.js')).default;
const result = await remixEngine.generateRemix(source, { niche: 'кафе', product: 'десерти', location: 'Чернівці' });
assert.equal(fetchCalls, 2);
assert.deepEqual(result._generation, {
  provider: 'gemini', model: 'gemini-3.5-flash', attempts: 2, fallback: false,
});

fetchCalls = 0;
responses.splice(0, responses.length, '{"broken":', '{"stillBroken":');
await assert.rejects(
  remixEngine.generateRemix(source, { niche: 'кафе', product: 'десерти', location: 'Чернівці' }),
  (error) => error.code === 'remix_provider_failed' && error.status === 502,
);
assert.equal(fetchCalls, 2);

delete process.env.GEMINI_API_KEY;
const fallback = await remixEngine.generateRemix(source, { niche: 'кафе', product: 'десерти', location: 'Чернівці' });
assert.equal(fallback._generation.fallback, true);

if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
else process.env.GEMINI_API_KEY = previousGeminiKey;
if (previousOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
else process.env.OPENAI_API_KEY = previousOpenAiKey;

console.log('remix JSON recovery tests passed');
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node scripts/test-remix-json-recovery.mjs
```

Expected: FAIL on the first malformed response with a `SyntaxError`, proving that provider exceptions currently bypass the second attempt.

- [ ] **Step 3: Commit the failing test**

```powershell
git add scripts/test-remix-json-recovery.mjs
git commit -m "test: reproduce malformed Gemini remix JSON"
```

---

### Task 2: Parse Gemini response parts and retry provider-output errors

**Files:**
- Modify: `backend/services/remixEngine.js:206-288`
- Test: `scripts/test-remix-json-recovery.mjs`
- Test: `scripts/test-remix-provider-quality.mjs`

**Interfaces:**
- Consumes: Gemini REST payload `candidates[0].content.parts[].text` and existing `assessRemixQuality(result, { globalInsight })`.
- Produces: `parseProviderJson(text) -> object`, `parseGeminiResponse(payload) -> object`, and two-attempt `generateValidatedProviderResult(...)` covering both thrown generation failures and quality rejection.

- [ ] **Step 1: Add minimal JSON extraction helpers**

Add helpers before `generateValidatedProviderResult`:

```js
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
    error.code = 'provider_invalid_json';
    error.cause = cause;
    throw error;
  }
}

function parseGeminiResponse(payload) {
  const text = (payload?.candidates?.[0]?.content?.parts || [])
    .map((part) => typeof part?.text === 'string' ? part.text : '')
    .join('')
    .trim();
  if (!text) {
    const error = new Error('Empty response from Gemini API');
    error.code = 'provider_empty_response';
    throw error;
  }
  return parseProviderJson(text);
}
```

- [ ] **Step 2: Make the existing two-attempt loop retry thrown provider errors**

Wrap `generate(qualityFeedback)` in `try/catch`. On attempt one, set correction feedback to `Previous response was not valid complete JSON. Return one complete JSON object only.` and continue. After attempt two, throw the last provider error. Preserve the existing quality-validation retry and `_generation.attempts` behavior.

```js
async function generateValidatedProviderResult({ provider, model, generate, globalInsight }) {
  let qualityFeedback = '';
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let result;
    try {
      result = await generate(qualityFeedback);
    } catch (error) {
      lastError = error;
      qualityFeedback = 'Previous response was not valid complete JSON. Return one complete JSON object only.';
      console.warn(`[RemixEngine] ${provider}/${model} failed on attempt ${attempt}: ${error.message}`);
      continue;
    }
    const assessment = assessRemixQuality(result, { globalInsight });
    if (assessment.ok) {
      result._generation = { provider, model, attempts: attempt, fallback: false };
      console.log(`[RemixEngine] ${provider}/${model} accepted on attempt ${attempt}`);
      return result;
    }
    lastError = null;
    qualityFeedback = assessment.reasons.join(' ');
    console.warn(`[RemixEngine] ${provider}/${model} rejected on attempt ${attempt}: ${qualityFeedback}`);
  }
  if (lastError) throw lastError;
  const error = new Error(`Provider output failed quality validation: ${qualityFeedback}`);
  error.code = 'remix_quality_rejected';
  throw error;
}
```

- [ ] **Step 3: Use the parser for Gemini payloads**

Replace the first-part `JSON.parse` block in `generateWithGemini` with:

```js
const jsonResult = await response.json();
return parseGeminiResponse(jsonResult);
```

- [ ] **Step 4: Run focused tests and verify GREEN for recovery**

Run:

```powershell
node scripts/test-remix-json-recovery.mjs
node scripts/test-remix-provider-quality.mjs
```

Expected: both scripts print their success messages and exit 0.

- [ ] **Step 5: Commit parser and retry behavior**

```powershell
git add backend/services/remixEngine.js scripts/test-remix-json-recovery.mjs
git commit -m "fix: retry malformed Gemini remix JSON"
```

---

### Task 3: Stop silent fallback for configured providers

**Files:**
- Modify: `backend/services/remixEngine.js:140-204`
- Test: `scripts/test-remix-json-recovery.mjs`

**Interfaces:**
- Consumes: final Gemini/OpenAI provider error after two attempts.
- Produces: safe error with `code: 'remix_provider_failed'`, `status: 502`, and an API payload consumed by existing Studio error handling.

- [ ] **Step 1: Wrap configured-provider exhaustion in a safe API error**

Add:

```js
function createRemixProviderError(provider, cause) {
  const error = new Error(`${provider} remix generation failed`);
  error.code = 'remix_provider_failed';
  error.status = 502;
  error.payload = {
    error: 'remix_provider_failed',
    message: 'AI-адаптація не завершилась. Спробуй ще раз за хвилину.',
  };
  error.cause = cause;
  return error;
}
```

In the Gemini and OpenAI catches, keep the existing server log and immediately throw `createRemixProviderError(provider, err)`. Leave `generateHighFidelityFallback` reachable only when neither provider key exists.

- [ ] **Step 2: Run the configured-provider and no-provider assertions**

Run:

```powershell
node scripts/test-remix-json-recovery.mjs
```

Expected: two malformed responses reject with `remix_provider_failed` and no-provider mode returns `_generation.fallback === true`.

- [ ] **Step 3: Run backend syntax and existing remix checks**

Run:

```powershell
node --check backend/services/remixEngine.js
node scripts/test-remix-quality.mjs
node scripts/test-remix-provider-quality.mjs
node scripts/test-brand-brain-context.js
```

Expected: syntax check exits 0; all three test scripts print success messages.

- [ ] **Step 4: Commit honest provider failure behavior**

```powershell
git add backend/services/remixEngine.js scripts/test-remix-json-recovery.mjs
git commit -m "fix: surface Gemini remix provider failures"
```

---

### Task 4: Verify the full application build and hand off production validation

**Files:**
- Verify only: `backend/services/remixEngine.js`, `scripts/test-remix-json-recovery.mjs`

**Interfaces:**
- Consumes: completed backend behavior.
- Produces: fresh verification evidence and an exact Railway validation sequence.

- [ ] **Step 1: Run all focused verification commands fresh**

```powershell
node scripts/test-remix-json-recovery.mjs
node scripts/test-remix-provider-quality.mjs
node scripts/test-remix-quality.mjs
node --check backend/services/remixEngine.js
npm.cmd run build
```

Expected: every command exits 0 and Vite reports a completed production build.

- [ ] **Step 2: Review the final diff without touching unrelated files**

```powershell
git diff HEAD~2 -- backend/services/remixEngine.js scripts/test-remix-json-recovery.mjs
git status --short
```

Expected: implementation commits contain only the remix engine and its regression test; pre-existing user changes remain unstaged and intact.

- [ ] **Step 3: Production validation after push/deploy**

Open Railway deploy logs, trigger one adaptation, and verify either:

```text
[RemixEngine] gemini/gemini-3.5-flash accepted on attempt 1
```

or, after one malformed response:

```text
[RemixEngine] gemini/gemini-3.5-flash failed on attempt 1: Invalid provider JSON: ...
[RemixEngine] gemini/gemini-3.5-flash accepted on attempt 2
```

The UI must not display a generated scenario when both attempts fail.
