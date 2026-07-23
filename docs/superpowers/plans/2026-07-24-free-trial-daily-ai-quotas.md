# Free Trial Daily AI Quotas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every active three-day Free Trial workspace five successful Studio adaptations and one hundred successful Jeryk replies per Kyiv day while ensuring production AI success always comes from a real provider.

**Architecture:** Add a focused daily-quota service that uses Kyiv date keys and reversible counter reservations. Keep successful product outcomes separate from a 250-attempt daily provider safety budget, integrate the reservations into the two generation routes, and make both provider engines fail closed instead of silently returning local templates. Expose the resulting daily snapshot through billing and generation responses so the React UI can show truthful counters and typed errors.

**Tech Stack:** Node.js 18+, CommonJS backend services, Express 5, JSON/PostgreSQL application-state storage, React 19, Vite 8, Node `assert`, Playwright 1.60.

## Global Constraints

- Work only on `main`; do not modify the hackathon branch or worktree.
- Do not edit, stage, or commit `backend/data/db.json`.
- Free Trial lasts three days.
- Free Trial allows five successful Studio adaptations per `Europe/Kyiv` calendar day.
- Free Trial allows one hundred successful Jeryk replies per `Europe/Kyiv` calendar day.
- The internal Free Trial provider-attempt ceiling is 250 attempts per Kyiv calendar day.
- Brand Brain consumes neither daily product allowance.
- Failed provider requests and bounded retries consume no successful product action.
- Production Studio and Jeryk success must identify a real provider; local templates are non-AI drafts only.
- Owner-unlimited and active tester access retain their existing entitlements.
- User-facing copy must remain complete in Ukrainian and English.

---

## File Structure

- Create `backend/services/dailyTrialQuota.cjs`: Kyiv periods, daily limits, reversible product reservations, provider-attempt budget selection, and public daily snapshots.
- Modify `backend/services/paidUsage.cjs`: add a bounded counter release operation used by failed reservations.
- Modify `backend/services/agentEngine.js`: remove successful local fallback behavior in production generation paths and emit typed provider errors.
- Modify `backend/services/remixEngine.js`: remove successful fallback generation, preserve usage errors, and emit typed provider errors.
- Modify `backend/server.js`: define trial daily limits, expose daily usage, reserve/release product outcomes, and use the daily provider-attempt budget.
- Modify `src/interfaceErrors.mjs`: map new typed errors.
- Modify `src/locales/uk.mjs` and `src/locales/en.mjs`: add daily quota and provider copy.
- Modify `src/main.jsx`: preserve backend error codes, show daily counters, and distinguish draft/provider/quota states.
- Modify `src/styles.css`: style compact daily usage and draft/error states.
- Create `scripts/test-daily-trial-quota.js`: pure unit coverage for Kyiv reset, reservations, refunds, and limits.
- Create `scripts/test-free-trial-ai-api.mjs`: isolated backend regression coverage for daily outcomes and real-provider enforcement.
- Create `scripts/test-free-trial-ai-ui.js`: browser coverage for counters, typed errors, and draft labelling.
- Modify `scripts/test-interface-errors.mjs`: localization coverage for new stable codes.
- Modify `package.json`: add one focused verification command.

---

### Task 1: Reproduce the Current Shared-Limit and Mock-Success Defects

**Files:**
- Create: `scripts/test-free-trial-ai-api.mjs`
- Create: `scripts/test-free-trial-ai-ui.js`

**Interfaces:**
- Consumes: existing `/api/workspaces/:workspaceId/agent/chat`, `/api/workspaces/:workspaceId/remix/generate`, and React Studio/Jeryk behavior.
- Produces: red regression cases that later tasks must turn green without weakening their assertions.

- [ ] **Step 1: Write the failing API reproduction**

Create an isolated temporary database with an active `trial` subscription, an exhausted legacy `ai_operations` counter, and an authenticated workspace. Spawn `backend/server.js` with that database and assert the desired behavior:

```js
const chat = await requestJson('/api/workspaces/ws_trial/agent/chat', {
  method: 'POST',
  body: { message: 'Прочитай мій Brand Brain' },
});
assert.notEqual(chat.status, 402, 'legacy ai_operations must not block the promised daily chat quota');

const remix = await requestJson('/api/workspaces/ws_trial/remix/generate', {
  method: 'POST',
  body: { globalInsight: { title: 'Signal', hook: 'Hook', script: 'Observed source facts' } },
});
assert.notEqual(remix.body?._generation?.provider, 'fallback');
assert.notEqual(remix.body?.provider, 'fallback');
```

Add a second fixture without `GEMINI_API_KEY` and require both routes to reject with `ai_provider_not_configured`, rather than returning a successful local template.

- [ ] **Step 2: Run the API reproduction and verify red**

Run:

```powershell
node scripts/test-free-trial-ai-api.mjs
```

Expected: FAIL because legacy `ai_operations` blocks chat, Remix can wrap a usage denial as `remix_provider_failed`, and provider-less routes can return fallback success.

- [ ] **Step 3: Write the failing UI reproduction**

Route the Studio request to a typed failure and assert the screen does not present the deterministic scenario as a completed AI result:

```js
await page.route('**/api/workspaces/*/remix/generate', (route) => route.fulfill({
  status: 503,
  contentType: 'application/json',
  body: JSON.stringify({ error: 'ai_provider_not_configured' }),
}));
await page.locator('.signal-adapt-button').first().click();
await page.waitForSelector('.studio-error-note');
assert.doesNotMatch(await page.locator('.remix-bottom').innerText(), /Готова структура/);
assert.match(await page.locator('.remix-bottom').innerText(), /чернетк|draft/i);
```

Route Jeryk to `daily_agent_chat_limit_reached` and assert the provider badge does not say `OFFLINE`.

- [ ] **Step 4: Run the UI reproduction and verify red**

Run:

```powershell
node scripts/test-free-trial-ai-ui.js
```

Expected: FAIL because Studio retains `Готова структура` and Jeryk converts every error into `OFFLINE`.

- [ ] **Step 5: Commit the reproduction only**

```powershell
git add -- scripts/test-free-trial-ai-api.mjs scripts/test-free-trial-ai-ui.js
git commit -m "test: reproduce free trial AI lockouts"
```

---

### Task 2: Add Reversible Kyiv-Day Quota Primitives

**Files:**
- Create: `backend/services/dailyTrialQuota.cjs`
- Modify: `backend/services/paidUsage.cjs`
- Create: `scripts/test-daily-trial-quota.js`

**Interfaces:**
- Consumes: `reserveUsageCounter(db, options)` from `backend/services/paidUsage.cjs`.
- Produces:
  - `TRIAL_DAILY_LIMITS`
  - `getKyivDayKey(now)`
  - `getNextKyivResetAt(now)`
  - `buildDailyTrialSnapshot(db, options)`
  - `reserveDailyTrialAction(db, options)`
  - `releaseDailyTrialAction(db, reservation, options)`
  - `resolveProviderAttemptBudget(entitlements, now)`
  - `releaseUsageCounter(db, options)`

- [ ] **Step 1: Write the failing unit tests**

Cover the exact contract:

```js
assert.equal(getKyivDayKey(new Date('2026-07-24T20:59:59.000Z')), '2026-07-24');
assert.equal(getKyivDayKey(new Date('2026-07-24T21:00:00.000Z')), '2026-07-25');

for (let index = 0; index < 5; index += 1) {
  reserveDailyTrialAction(db, {
    workspaceId: 'ws_trial',
    action: 'remix',
    planId: 'trial',
    now: new Date('2026-07-24T10:00:00.000Z'),
  });
}
assert.throws(
  () => reserveDailyTrialAction(db, {
    workspaceId: 'ws_trial',
    action: 'remix',
    planId: 'trial',
    now: new Date('2026-07-24T10:00:00.000Z'),
  }),
  (error) => error.payload?.error === 'daily_remix_limit_reached',
);

const reservation = reserveDailyTrialAction(db, {
  workspaceId: 'ws_chat',
  action: 'agentChat',
  planId: 'trial',
  now,
});
releaseDailyTrialAction(db, reservation, { now });
assert.equal(buildDailyTrialSnapshot(db, {
  workspaceId: 'ws_chat',
  planId: 'trial',
  now,
}).agentChat.used, 0);
```

Also prove the next Kyiv day starts at zero, 100 chat reservations succeed and the 101st fails, unlimited/tester plans return unbounded snapshots, releases never make a counter negative, and the provider budget resolves to `250` with a Kyiv day period for trial.

- [ ] **Step 2: Run the unit test and verify red**

Run:

```powershell
node scripts/test-daily-trial-quota.js
```

Expected: FAIL with `MODULE_NOT_FOUND` for `dailyTrialQuota.cjs`.

- [ ] **Step 3: Add the bounded release primitive**

Export this behavior from `backend/services/paidUsage.cjs`:

```js
function releaseUsageCounter(db, {
  workspaceId,
  metric,
  period,
  amount = 1,
  now = new Date(),
}) {
  const counter = (db.usageCounters || []).find((item) => (
    item.workspaceId === workspaceId
    && item.metric === metric
    && item.period === period
  ));
  if (!counter) return null;
  const units = Math.max(1, Math.trunc(Number(amount || 1)));
  counter.value = Math.max(0, Number(counter.value || 0) - units);
  counter.updatedAt = new Date(now).toISOString();
  return counter;
}
```

- [ ] **Step 4: Implement the focused daily quota module**

Use fixed action descriptors and typed errors:

```js
const TRIAL_DAILY_LIMITS = Object.freeze({
  remix: 5,
  agentChat: 100,
  providerAttempts: 250,
});

const ACTIONS = Object.freeze({
  remix: {
    metric: 'trial_remix_daily',
    limit: TRIAL_DAILY_LIMITS.remix,
    error: 'daily_remix_limit_reached',
  },
  agentChat: {
    metric: 'trial_agent_chat_daily',
    limit: TRIAL_DAILY_LIMITS.agentChat,
    error: 'daily_agent_chat_limit_reached',
  },
});
```

`reserveDailyTrialAction` must skip reservations for non-trial or unlimited access, translate `plan_limit_reached` into the action-specific error, and include `limit`, `used`, `remaining`, `period`, and `resetsAt` in the payload.

- [ ] **Step 5: Run the unit test and verify green**

Run:

```powershell
node scripts/test-daily-trial-quota.js
node scripts/test-paid-usage.js
```

Expected: both scripts print their passing messages and exit `0`.

- [ ] **Step 6: Commit the quota primitives**

```powershell
git add -- backend/services/dailyTrialQuota.cjs backend/services/paidUsage.cjs scripts/test-daily-trial-quota.js
git commit -m "feat: add daily free trial quota primitives"
```

---

### Task 3: Enforce Real Providers and Daily Outcomes in the API

**Files:**
- Modify: `backend/services/agentEngine.js`
- Modify: `backend/services/remixEngine.js`
- Modify: `backend/server.js`
- Modify: `scripts/test-free-trial-ai-api.mjs`

**Interfaces:**
- Consumes: all Task 2 exports.
- Produces:
  - `billing.daily`
  - successful chat/remix responses with `daily` and real `_generation.provider`
  - typed `daily_*`, `ai_provider_not_configured`, `ai_provider_failed`, and `ai_provider_capacity_reached` errors.

- [ ] **Step 1: Extend the red API test to cover daily success semantics**

Add a local controlled Gemini HTTP server and start Dzhero with:

```js
GEMINI_API_KEY: 'controlled-test-key',
GEMINI_API_BASE: controlledGemini.baseUrl,
GEMINI_TEXT_MODEL: 'controlled-model',
GEMINI_REMIX_MODEL: 'controlled-model',
```

Assert five successful remixes followed by `daily_remix_limit_reached`, one hundred successful Jeryk replies followed by `daily_agent_chat_limit_reached`, and no lost product slot after a controlled provider failure. Prove reset by seeding a counter under the previous Kyiv date and making the request on the current Kyiv date; do not add a test-only clock or request header to production code.

- [ ] **Step 2: Run the API test and verify red**

Run:

```powershell
node scripts/test-free-trial-ai-api.mjs
```

Expected: FAIL because the engines have fixed provider URLs/fallback behavior and the server has no daily reservation lifecycle.

- [ ] **Step 3: Make provider base URLs injectable and fail closed**

In `agentEngine.js`, use:

```js
const GEMINI_API_BASE = process.env.GEMINI_API_BASE
  || 'https://generativelanguage.googleapis.com/v1beta';
```

In `remixEngine.js`, define the same constant and replace both hard-coded `https://generativelanguage.googleapis.com/v1beta` URL prefixes with `GEMINI_API_BASE`.

Replace provider-less fallback success with a typed error:

```js
function createAgentProviderError(code, status, message, cause) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.payload = { error: code, message };
  error.cause = cause;
  return error;
}
```

Return `ai_provider_not_configured` when no key exists, `ai_provider_failed` on provider/validation failure, and never substitute `fallbackAgentReplyV2` for an empty real-provider result.

Apply the same `GEMINI_API_BASE` injection and typed errors in `remixEngine.js`. If `error.providerAttemptBlocked` is true, rethrow it unchanged so daily/provider capacity errors are not wrapped as Gemini failures.

- [ ] **Step 4: Add trial daily limits and snapshots to billing**

Add `dailyLimits` to the `trial` plan:

```js
dailyLimits: {
  remix: 5,
  agentChat: 100,
  providerAttempts: 250,
  timezone: 'Europe/Kyiv',
},
```

Have `publicPlan` include `dailyLimits`, and have `buildEntitlements` include:

```js
daily: buildDailyTrialSnapshot(db, {
  workspaceId,
  planId: plan.id,
  unlimited,
  now,
}),
```

Keep legacy aggregate trial values compatible (`agentChat: 300`, `aiOperations: 750`) while all new provider guarding uses the daily provider budget.

- [ ] **Step 5: Switch provider attempt guarding to the resolved budget**

Inside `createSerializedPaidAiAttemptGuard`, call `resolveProviderAttemptBudget(billing, now)` and reserve the returned `metric`, `period`, and `limit`. Translate trial provider-attempt exhaustion into:

```js
{
  error: 'ai_provider_capacity_reached',
  limit: 250,
  period: 'YYYY-MM-DD',
  resetsAt: 'ISO timestamp',
}
```

Paid plans retain their current monthly provider-attempt limit and owner-unlimited remains unbounded.

- [ ] **Step 6: Reserve and refund Jeryk outcomes**

Before `generateAgentReply`, atomically reserve `agentChat` through `serializeBackgroundMutation`. On any error before a successful response, atomically release that reservation. On success, keep the reservation and return the refreshed daily snapshot:

```js
res.status(201).json({
  reply: result.text,
  provider: result.provider,
  model: result.model,
  aiJob: persisted.job,
  billing,
  daily: billing.daily,
});
```

Remove the legacy upfront `assertUsageAvailable(..., 'aiOperations')` check from the chat route.

- [ ] **Step 7: Reserve and refund Studio outcomes**

Reserve `remix` before `generateRemix`, release it in the route catch path, and keep it only after validated real-provider success. Include refreshed daily usage in the successful response without placing `daily` inside the remix result object consumed by scenario rendering.

- [ ] **Step 8: Prove Brand Brain does not consume product outcomes**

Extend the API test to finalize Brand Brain and compare both daily product counters before and after. Provider-attempt usage may change; `remix.used` and `agentChat.used` must not.

- [ ] **Step 9: Run focused backend tests and verify green**

Run:

```powershell
node scripts/test-free-trial-ai-api.mjs
node scripts/test-daily-trial-quota.js
node scripts/test-brand-brain-finalize-hardening.mjs
node scripts/test-remix-json-recovery.mjs
node scripts/test-owner-tester-api.mjs
node --check backend/server.js
```

Expected: every command exits `0`; controlled provider call counts show that retries do not consume extra product actions.

- [ ] **Step 10: Commit the backend behavior**

```powershell
git add -- backend/server.js backend/services/agentEngine.js backend/services/remixEngine.js scripts/test-free-trial-ai-api.mjs
git commit -m "feat: enforce daily trial AI outcomes"
```

---

### Task 4: Show Truthful Daily Usage and Typed Errors

**Files:**
- Modify: `src/interfaceErrors.mjs`
- Modify: `src/locales/uk.mjs`
- Modify: `src/locales/en.mjs`
- Modify: `src/main.jsx`
- Modify: `src/styles.css`
- Modify: `scripts/test-interface-errors.mjs`
- Modify: `scripts/test-free-trial-ai-ui.js`

**Interfaces:**
- Consumes: `daily` response objects and stable error codes from Task 3.
- Produces: exact localized errors, daily counter badges, provider-only `OFFLINE`, and explicit non-AI draft labelling.

- [ ] **Step 1: Add failing localization assertions**

Add:

```js
assert.equal(
  localizeInterfaceError('daily_remix_limit_reached', ukT),
  'Сьогодні використано 5 із 5 адаптацій. Новий ліміт буде доступний після 00:00 за Києвом.',
);
assert.equal(
  localizeInterfaceError('daily_agent_chat_limit_reached', enT),
  'You have used 100 of 100 Jeryk messages today. Your daily allowance resets at midnight Kyiv time.',
);
assert.equal(
  localizeInterfaceError('ai_provider_not_configured', ukT),
  'Gemini не налаштований на сервері.',
);
```

- [ ] **Step 2: Run localization tests and verify red**

Run:

```powershell
node scripts/test-interface-errors.mjs
```

Expected: FAIL because the new codes are not mapped.

- [ ] **Step 3: Add stable mappings and complete locale copy**

Map:

```js
daily_remix_limit_reached: 'errors.dailyRemixLimit',
daily_agent_chat_limit_reached: 'errors.dailyAgentChatLimit',
ai_provider_not_configured: 'errors.aiProviderNotConfigured',
ai_provider_failed: 'errors.aiProviderFailed',
ai_provider_capacity_reached: 'errors.aiProviderCapacity',
```

Add matching Ukrainian and English messages. Do not expose raw provider payloads, keys, model URLs, or stack traces.

- [ ] **Step 4: Preserve error codes from API payloads**

Replace message-only throws in Studio and Jeryk with an error carrying the stable code:

```js
function createInterfaceApiError(payload, fallbackCode) {
  const code = extractInterfaceErrorCode(payload, fallbackCode);
  const error = new Error(code);
  error.code = code;
  error.payload = payload;
  return error;
}
```

Use it after `response.json()` so a `daily_*` or provider code is not lost in `payload.message`.

- [ ] **Step 5: Render daily counter badges**

At the authenticated app root, add:

```jsx
const [dailyAiUsage, setDailyAiUsage] = useState(null);

useEffect(() => {
  if (!currentUser || !workspaceId) {
    setDailyAiUsage(null);
    return undefined;
  }
  let active = true;
  authFetch(`${API_BASE}/workspaces/${workspaceId}/billing`)
    .then((response) => response.ok ? response.json() : null)
    .then((payload) => {
      if (active) setDailyAiUsage(payload?.daily || null);
    })
    .catch(() => {});
  return () => {
    active = false;
  };
}, [currentUser, workspaceId]);
```

Pass `dailyAiUsage` and `onDailyUsageChanged={setDailyAiUsage}` to `RemixStudio` and `AssistantDrawer`. After successful generation, each component calls `onDailyUsageChanged(payload.daily)`.

Render in Studio:

```jsx
<span className="daily-ai-usage">
  Адаптації сьогодні: {dailyAiUsage.remix.used}/{dailyAiUsage.remix.limit}
</span>
```

Render in Jeryk:

```jsx
<span className="daily-ai-usage">
  Повідомлення сьогодні: {dailyAiUsage.agentChat.used}/{dailyAiUsage.agentChat.limit}
</span>
```

Hide numeric limits for unlimited owner/tester snapshots.

- [ ] **Step 6: Make Studio draft state explicit**

When there is no validated `generatedRemix`, replace the success-looking heading with `Чернетка без AI` / `Non-AI draft`. Show `Готова структура` / `Ready structure` only when `_generation.provider` is real and `fallback !== true`.

- [ ] **Step 7: Restrict `OFFLINE` to provider errors**

In the Jeryk catch path, derive the code before updating metadata:

```js
const code = extractInterfaceErrorCode(agentError);
setAgentMeta(code === 'ai_provider_not_configured' || code === 'ai_provider_failed'
  ? { provider: 'offline', model: 'unavailable' }
  : { provider: 'ready', model: 'dzhero' });
```

Daily quota errors must keep a quota-specific state and localized reply.

- [ ] **Step 8: Run UI and localization tests and verify green**

Run:

```powershell
node scripts/test-interface-errors.mjs
node scripts/test-free-trial-ai-ui.js
```

Expected: both scripts exit `0`; Studio never reports draft success after a provider error and Jeryk does not show `OFFLINE` for daily quota.

- [ ] **Step 9: Commit the truthful UI**

```powershell
git add -- src/interfaceErrors.mjs src/locales/uk.mjs src/locales/en.mjs src/main.jsx src/styles.css scripts/test-interface-errors.mjs scripts/test-free-trial-ai-ui.js
git commit -m "fix: show truthful AI quota and provider states"
```

---

### Task 5: Integrate Verification and Finish Main

**Files:**
- Modify: `package.json`
- Modify: `docs/agent-context/WORKING-MEMORY.md`
- Modify: `docs/agent-context/OPEN-ISSUES.md`

**Interfaces:**
- Consumes: all earlier task deliverables.
- Produces: one repeatable test command and an updated operational handoff.

- [ ] **Step 1: Add the focused package command**

Add:

```json
"test:free-trial-ai": "node scripts/test-daily-trial-quota.js && node scripts/test-free-trial-ai-api.mjs && node scripts/test-interface-errors.mjs && node scripts/test-free-trial-ai-ui.js"
```

- [ ] **Step 2: Run the complete focused and regression verification**

Run:

```powershell
npm.cmd run test:free-trial-ai
node scripts/test-brand-brain-wizard-api.mjs
node scripts/test-brand-brain-finalize-hardening.mjs
node scripts/test-owner-tester-api.mjs
node scripts/test-remix-json-recovery.mjs
npm.cmd run test:public-beta
npm.cmd run build
git diff --check
git status --short
```

Expected:

- all tests exit `0`;
- Vite build completes successfully;
- only intended source, test, and documentation files are staged or modified;
- `backend/data/db.json` remains unstaged and uncommitted.

- [ ] **Step 3: Update agent context**

Record the new daily quotas, real-provider requirement, test command, and the distinction between product outcomes and provider attempts. Remove the current Gemini/Free Trial lockout from open issues only after all verification passes.

- [ ] **Step 4: Commit the final integration**

```powershell
git add -- package.json docs/agent-context/WORKING-MEMORY.md docs/agent-context/OPEN-ISSUES.md
git commit -m "docs: record free trial AI quota behavior"
```

- [ ] **Step 5: Review the final commit range**

Run:

```powershell
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
git status --short --branch
```

Expected: only the approved Free Trial AI quota work and its specification/plan are ahead of `origin/main`; `backend/data/db.json` is the only unrelated local runtime modification.

- [ ] **Step 6: Push `main` after verification**

```powershell
git push origin main
```

Expected: the remote reports a successful update of `main`.
