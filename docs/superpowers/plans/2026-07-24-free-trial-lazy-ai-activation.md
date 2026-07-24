# Free Trial Lazy AI Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Free Trial workspace one fresh 72-hour AI window beginning with its first accepted Studio or Jeryk action, while reporting real trial expiration separately from Gemini outages.

**Architecture:** Add a focused subscription helper that owns the versioned AI-trial lifecycle and use it inside the existing serialized daily-action reservation. Historical subscriptions migrate lazily on first use; new subscriptions are created pending activation. Keep the existing daily quota service unchanged and make the frontend recognize `trial_expired` as a typed, non-provider error.

**Tech Stack:** Node.js 22, CommonJS backend services, Express 5, PostgreSQL JSONB/local JSON state, React 19, Vite 8, Playwright, Node `assert`.

## Global Constraints

- The grant version is exactly `2026-07-24-public-beta-ai-v1`.
- One activation gives exactly 72 hours.
- Only accepted Studio adaptation and Jeryk message flows activate the window.
- Daily quotas remain 5 successful Studio adaptations and 100 successful Jeryk replies per `Europe/Kyiv` calendar day.
- Failed provider calls release successful-outcome quota reservations but do not roll back activation.
- Paid, owner, tester, demo, Brand Brain, shared Signals, discovery, Agent Studio, and checkout behavior do not change.
- `trial_expired` must never be presented as a Gemini failure or `OFFLINE`.
- Do not edit, stage, or commit `backend/data/db.json`.
- Keep English and Ukrainian error copy complete and unmixed.

## File Map

- Create `backend/services/freeTrialAccess.cjs`: grant constants, pending-state detection, idempotent activation, and public trial-state construction.
- Modify `backend/server.js`: initialize pending subscriptions, use the helper in entitlements, and activate inside the serialized AI reservation.
- Modify `scripts/test-free-trial-ai-api.mjs`: API regressions for historical, new, concurrent, failed-provider, and genuinely expired trials.
- Modify `src/interfaceErrors.mjs`: map `trial_expired` to a dedicated translation key.
- Modify `src/locales/en.mjs`: English trial-ended copy.
- Modify `src/locales/uk.mjs`: Ukrainian trial-ended copy.
- Modify `src/main.jsx`: preserve typed API errors in both Jeryk surfaces and classify trial expiration separately from provider outages.
- Modify `scripts/test-interface-errors.mjs`: direct error-code and localization assertions.
- Modify `scripts/test-free-trial-ai-ui.js`: Studio and Jeryk regression coverage for trial-ended versus provider-offline states.
- Modify `docs/agent-context/WORKING-MEMORY.md`: record the lazy activation contract after it passes.
- Modify `docs/agent-context/OPEN-ISSUES.md`: add the one required production verification.

---

### Task 1: Versioned Backend Trial Activation

**Files:**
- Create: `backend/services/freeTrialAccess.cjs`
- Modify: `backend/server.js:100-115`
- Modify: `backend/server.js:1811-1835`
- Modify: `backend/server.js:1858-1903`
- Modify: `backend/server.js:2113-2133`
- Test: `scripts/test-free-trial-ai-api.mjs`

**Interfaces:**
- Produces: `FREE_TRIAL_AI_GRANT_VERSION: string`
- Produces: `FREE_TRIAL_AI_WINDOW_MS: number`
- Produces: `isPendingFreeTrialAiActivation(subscription): boolean`
- Produces: `activateFreeTrialAiWindow(subscription, { now, eligible }): boolean`
- Produces: `buildFreeTrialState(subscription, { hasTrialPlanAccess, now }): { pendingActivation, active, expired, endsAt, daysRemaining }`
- Consumes: the existing mutable subscription object, `buildEntitlements`, `serializeBackgroundMutation`, and `reserveDailyTrialAction`.

- [ ] **Step 1: Extend API fixtures with pending, concurrent, and already-used grants**

In `scripts/test-free-trial-ai-api.mjs`, add the contract constants beside `NOW`:

```js
const FREE_TRIAL_AI_GRANT_VERSION = '2026-07-24-public-beta-ai-v1';
const FREE_TRIAL_AI_WINDOW_MS = 72 * 60 * 60 * 1000;
```

Extend the non-chat-only actor list with:

```js
'new_trial',
'concurrent_activation',
'invalid_activation',
'brand_brain_only',
'expired_activated',
```

Keep `expired_pending` as the historical subscription with no grant marker, and
add an already-activated expired subscription:

```js
const expiredPending = actors.find((actor) => actor.workspace.id === 'ws_expired_pending');
expiredPending.subscription.status = 'pending_payment';
expiredPending.subscription.trialEndsAt = '2020-01-01T00:00:00.000Z';

const expiredActivated = actors.find((actor) => actor.workspace.id === 'ws_expired_activated');
expiredActivated.subscription.status = 'trialing';
expiredActivated.subscription.aiTrialGrantVersion = FREE_TRIAL_AI_GRANT_VERSION;
expiredActivated.subscription.aiTrialStartedAt = '2020-01-01T00:00:00.000Z';
expiredActivated.subscription.trialEndsAt = '2020-01-04T00:00:00.000Z';
```

Make `ws_new_trial` exercise `ensureWorkspaceSubscription` by omitting its
fixture subscription:

```js
subscriptions: actors
  .filter((actor) => actor.workspace.id !== 'ws_new_trial')
  .map((actor) => actor.subscription),
```

- [ ] **Step 2: Add failing API assertions for pending activation**

Immediately after the first `ws_trial` billing request, add:

```js
assert.equal(billing.body.trial.pendingActivation, true);
assert.equal(billing.body.trial.active, false);
assert.equal(billing.body.trial.expired, false);
assert.equal(billing.body.trial.endsAt, null);
assert.equal(billing.body.trial.daysRemaining, 3);
```

Before the first `ws_trial` chat, record `const firstActivationBefore = Date.now()`.
After it succeeds, read `server.dbPath` and assert the persisted window:

```js
const firstActivationAfter = Date.now();
const firstActivationDb = JSON.parse(await readFile(server.dbPath, 'utf8'));
const firstActivation = firstActivationDb.subscriptions.find(
  (item) => item.workspaceId === 'ws_trial',
);
assert.equal(firstActivation.aiTrialGrantVersion, FREE_TRIAL_AI_GRANT_VERSION);
assert.ok(Date.parse(firstActivation.aiTrialStartedAt) >= firstActivationBefore);
assert.ok(Date.parse(firstActivation.aiTrialStartedAt) <= firstActivationAfter);
assert.equal(
  Date.parse(firstActivation.trialEndsAt) - Date.parse(firstActivation.aiTrialStartedAt),
  FREE_TRIAL_AI_WINDOW_MS,
);
const originalTrialStart = firstActivation.aiTrialStartedAt;
const originalTrialEnd = firstActivation.trialEndsAt;
```

After the next successful `ws_trial` remix, re-read the DB and prove that the
window did not move:

```js
const repeatedActionDb = JSON.parse(await readFile(server.dbPath, 'utf8'));
const repeatedActionTrial = repeatedActionDb.subscriptions.find(
  (item) => item.workspaceId === 'ws_trial',
);
assert.equal(repeatedActionTrial.aiTrialStartedAt, originalTrialStart);
assert.equal(repeatedActionTrial.trialEndsAt, originalTrialEnd);
```

- [ ] **Step 3: Add failing API assertions for failure persistence, new accounts, and concurrency**

After the controlled failed Jeryk call for `ws_failure`, read and retain its
activation timestamps:

```js
const failedActivationDb = JSON.parse(await readFile(server.dbPath, 'utf8'));
const failedActivation = failedActivationDb.subscriptions.find(
  (item) => item.workspaceId === 'ws_failure',
);
assert.equal(failedActivation.aiTrialGrantVersion, FREE_TRIAL_AI_GRANT_VERSION);
assert.equal(
  Date.parse(failedActivation.trialEndsAt) - Date.parse(failedActivation.aiTrialStartedAt),
  FREE_TRIAL_AI_WINDOW_MS,
);
```

After the recovered Jeryk call, prove that provider recovery did not extend it:

```js
const recoveredActivationDb = JSON.parse(await readFile(server.dbPath, 'utf8'));
const recoveredActivation = recoveredActivationDb.subscriptions.find(
  (item) => item.workspaceId === 'ws_failure',
);
assert.equal(recoveredActivation.aiTrialStartedAt, failedActivation.aiTrialStartedAt);
assert.equal(recoveredActivation.trialEndsAt, failedActivation.trialEndsAt);
```

Add a first action for a workspace that had no subscription:

```js
const newTrial = await requestJson(
  server.baseUrl,
  '/api/workspaces/ws_new_trial/agent/chat',
  { method: 'POST', token: 'new_trial_session', body: CHAT_BODY },
);
assert.equal(newTrial.status, 201);
const newTrialDb = JSON.parse(await readFile(server.dbPath, 'utf8'));
const createdTrial = newTrialDb.subscriptions.find(
  (item) => item.workspaceId === 'ws_new_trial',
);
assert.equal(createdTrial.aiTrialGrantVersion, FREE_TRIAL_AI_GRANT_VERSION);
assert.ok(createdTrial.aiTrialStartedAt);
assert.equal(
  Date.parse(createdTrial.trialEndsAt) - Date.parse(createdTrial.aiTrialStartedAt),
  FREE_TRIAL_AI_WINDOW_MS,
);
```

Exercise two near-simultaneous first actions:

```js
const concurrentResponses = await Promise.all([
  requestJson(
    server.baseUrl,
    '/api/workspaces/ws_concurrent_activation/agent/chat',
    { method: 'POST', token: 'concurrent_activation_session', body: CHAT_BODY },
  ),
  requestJson(
    server.baseUrl,
    '/api/workspaces/ws_concurrent_activation/agent/chat',
    { method: 'POST', token: 'concurrent_activation_session', body: CHAT_BODY },
  ),
]);
assert.deepEqual(concurrentResponses.map((response) => response.status), [201, 201]);
const concurrentDb = JSON.parse(await readFile(server.dbPath, 'utf8'));
const concurrentTrial = concurrentDb.subscriptions.find(
  (item) => item.workspaceId === 'ws_concurrent_activation',
);
assert.equal(concurrentTrial.aiTrialGrantVersion, FREE_TRIAL_AI_GRANT_VERSION);
assert.equal(
  Date.parse(concurrentTrial.trialEndsAt) - Date.parse(concurrentTrial.aiTrialStartedAt),
  FREE_TRIAL_AI_WINDOW_MS,
);
```

- [ ] **Step 4: Prove rejected input and Brand Brain do not activate the window**

Send invalid Jeryk input before any valid action:

```js
const invalidActivation = await requestJson(
  server.baseUrl,
  '/api/workspaces/ws_invalid_activation/agent/chat',
  {
    method: 'POST',
    token: 'invalid_activation_session',
    body: { message: ' ' },
  },
);
assert.equal(invalidActivation.status, 400);
const invalidActivationDb = JSON.parse(await readFile(server.dbPath, 'utf8'));
const invalidTrial = invalidActivationDb.subscriptions.find(
  (item) => item.workspaceId === 'ws_invalid_activation',
);
assert.equal(invalidTrial.aiTrialStartedAt, undefined);
```

On the providerless server, finalize Brand Brain for an untouched workspace and
prove the AI trial remains pending:

```js
const brandBrainOnly = await requestJson(
  providerless.baseUrl,
  '/api/workspaces/ws_brand_brain_only/agent/context/finalize',
  {
    method: 'POST',
    token: 'brand_brain_only_session',
    body: { answers: COMPLETE_BRAND_ANSWERS },
  },
);
assert.equal(brandBrainOnly.status, 200);
const brandBrainOnlyDb = JSON.parse(await readFile(providerless.dbPath, 'utf8'));
const brandBrainTrial = brandBrainOnlyDb.subscriptions.find(
  (item) => item.workspaceId === 'ws_brand_brain_only',
);
assert.equal(brandBrainTrial.aiTrialStartedAt, undefined);
```

- [ ] **Step 5: Replace the old expired-fixture assertion with both rollout cases**

In the `reviewServer` section, change `ws_expired_pending` expectations so its
historical end is ignored until first use:

```js
assert.equal(expiredPendingBilling.status, 200);
assert.equal(expiredPendingBilling.body.trial.pendingActivation, true);
assert.equal(expiredPendingBilling.body.trial.active, false);
assert.equal(expiredPendingBilling.body.trial.expired, false);
assert.equal(expiredPendingBilling.body.trial.endsAt, null);
assert.equal(expiredPendingBilling.body.trial.daysRemaining, 3);

const historicalTrial = await requestJson(
  reviewServer.baseUrl,
  '/api/workspaces/ws_expired_pending/agent/chat',
  {
    method: 'POST',
    token: 'expired_pending_session',
    body: CHAT_BODY,
  },
);
assert.equal(historicalTrial.status, 201);
assert.equal(historicalTrial.body.provider, 'gemini');
```

Then prove an already-used grant is truly blocked before Gemini:

```js
const providerCallsBeforeExpired = controlledGemini.state.calls;
const expiredActivated = await requestJson(
  reviewServer.baseUrl,
  '/api/workspaces/ws_expired_activated/agent/chat',
  {
    method: 'POST',
    token: 'expired_activated_session',
    body: CHAT_BODY,
  },
);
assert.equal(expiredActivated.status, 402);
assert.equal(expiredActivated.body.error, 'trial_expired');
assert.equal(controlledGemini.state.calls, providerCallsBeforeExpired);
```

- [ ] **Step 6: Run the API test and verify the regression is red**

Run:

```powershell
node scripts/test-free-trial-ai-api.mjs
```

Expected: FAIL on the first pending-activation assertion because
`trial.pendingActivation` is not implemented and the historical expired
subscription still returns `trial_expired`.

- [ ] **Step 7: Create the focused lifecycle helper**

Create `backend/services/freeTrialAccess.cjs`:

```js
const FREE_TRIAL_AI_GRANT_VERSION = '2026-07-24-public-beta-ai-v1';
const FREE_TRIAL_AI_WINDOW_MS = 72 * 60 * 60 * 1000;
const FREE_TRIAL_AI_DAYS = 3;

function isPendingFreeTrialAiActivation(subscription) {
  if (subscription?.planId !== 'trial') return false;
  return subscription.aiTrialGrantVersion !== FREE_TRIAL_AI_GRANT_VERSION
    || !subscription.aiTrialStartedAt;
}

function activateFreeTrialAiWindow(subscription, {
  now = new Date(),
  eligible = true,
} = {}) {
  if (!eligible || !isPendingFreeTrialAiActivation(subscription)) return false;
  const startedAt = new Date(now);
  if (!Number.isFinite(startedAt.getTime())) {
    throw new TypeError('A valid activation time is required.');
  }
  const endsAt = new Date(startedAt.getTime() + FREE_TRIAL_AI_WINDOW_MS);
  subscription.aiTrialGrantVersion = FREE_TRIAL_AI_GRANT_VERSION;
  subscription.aiTrialStartedAt = startedAt.toISOString();
  subscription.trialEndsAt = endsAt.toISOString();
  subscription.status = 'trialing';
  subscription.currentPeriodStart = startedAt.toISOString();
  subscription.currentPeriodEnd = endsAt.toISOString();
  subscription.updatedAt = startedAt.toISOString();
  return true;
}

function buildFreeTrialState(subscription, {
  hasTrialPlanAccess,
  now = new Date(),
} = {}) {
  const nowMs = new Date(now).getTime();
  const pendingActivation = Boolean(
    hasTrialPlanAccess && isPendingFreeTrialAiActivation(subscription),
  );
  const parsedEnd = subscription?.trialEndsAt
    ? Date.parse(subscription.trialEndsAt)
    : Number.NaN;
  const hasEnd = Number.isFinite(parsedEnd);
  return {
    pendingActivation,
    active: Boolean(
      hasTrialPlanAccess
      && !pendingActivation
      && subscription.status === 'trialing'
      && (!hasEnd || parsedEnd > nowMs),
    ),
    expired: Boolean(
      hasTrialPlanAccess
      && !pendingActivation
      && hasEnd
      && parsedEnd <= nowMs,
    ),
    endsAt: pendingActivation ? null : subscription?.trialEndsAt || null,
    daysRemaining: pendingActivation
      ? FREE_TRIAL_AI_DAYS
      : hasEnd
        ? Math.max(0, Math.ceil((parsedEnd - nowMs) / (24 * 60 * 60 * 1000)))
        : null,
  };
}

module.exports = {
  FREE_TRIAL_AI_GRANT_VERSION,
  FREE_TRIAL_AI_WINDOW_MS,
  activateFreeTrialAiWindow,
  buildFreeTrialState,
  isPendingFreeTrialAiActivation,
};
```

- [ ] **Step 8: Wire pending subscription creation and entitlement state**

Import the helper in `backend/server.js` beside the daily quota service:

```js
const {
  FREE_TRIAL_AI_GRANT_VERSION,
  activateFreeTrialAiWindow,
  buildFreeTrialState,
} = require('./services/freeTrialAccess.cjs');
```

In `ensureWorkspaceSubscription`, replace the trial's eager dates with a
pending grant while leaving demo and paid periods intact:

```js
currentPeriodStart: isTrial ? null : now.toISOString(),
currentPeriodEnd: isTrial
  ? null
  : new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000).toISOString(),
aiTrialGrantVersion: isTrial ? FREE_TRIAL_AI_GRANT_VERSION : null,
aiTrialStartedAt: null,
trialEndsAt: null,
```

In `buildEntitlements`, keep the existing `hasTrialPlanAccess` calculation and
replace the inline `trial` object with:

```js
const trial = buildFreeTrialState(subscription, {
  hasTrialPlanAccess,
  now,
});
```

Remove the no-longer-used local `nowMs` and `trialEndsAt` variables.

- [ ] **Step 9: Activate atomically before expiration and quota checks**

In `reserveSerializedDailyAiAction`, make `billing` mutable, activate only
finite trial access, rebuild entitlements, and persist activation together with
the daily reservation:

```js
const now = new Date();
let billing = buildEntitlements(db, workspaceId, current.actorUser, now);
const activated = activateFreeTrialAiWindow(billing.subscription, {
  now,
  eligible: !billing.unlimited && !billing.testerAccessActive,
});
if (activated) {
  billing = buildEntitlements(db, workspaceId, current.actorUser, now);
  console.info(
    `[FreeTrial] activated workspace=${workspaceId}`
    + ` grant=${billing.subscription.aiTrialGrantVersion}`
    + ` start=${billing.subscription.aiTrialStartedAt}`
    + ` end=${billing.subscription.trialEndsAt}`,
  );
}
assertAiTrialActive(billing);
const reservation = reserveDailyTrialAction(db, dailyActionOptions({
  workspaceId,
  billing,
  action,
  now,
}));
if (activated || reservation) await writeDb(db);
```

Keep the existing return object unchanged. Do not activate in
`readSerializedBilling`, Brand Brain finalization, generic
`assertUsageAvailable`, or provider-attempt guards.

- [ ] **Step 10: Run backend checks and verify green**

Run:

```powershell
node --check backend/server.js
node scripts/test-free-trial-ai-api.mjs
```

Expected:

```text
Free Trial API regression checks passed.
```

The JSON summary may contain higher controlled-provider call totals because the
new and concurrent activation cases make real controlled calls.

- [ ] **Step 11: Commit the backend slice**

Run:

```powershell
git add -- backend/services/freeTrialAccess.cjs backend/server.js scripts/test-free-trial-ai-api.mjs
git commit -m "fix: activate free trial AI access on first use"
```

Expected: one commit containing only the helper, backend wiring, and API
regression test.

---

### Task 2: Truthful Trial-Expired UI

**Files:**
- Modify: `src/interfaceErrors.mjs`
- Modify: `src/locales/en.mjs`
- Modify: `src/locales/uk.mjs`
- Modify: `src/main.jsx:132-138`
- Modify: `src/main.jsx:4986-5000`
- Modify: `src/main.jsx:5786-5800`
- Modify: `src/main.jsx:6890-6908`
- Test: `scripts/test-interface-errors.mjs`
- Test: `scripts/test-free-trial-ai-ui.js`

**Interfaces:**
- Produces: typed code mapping `trial_expired -> errors.trialExpired`
- Produces: `jerykErrorMeta(code): { provider: string, model: string }`
- Consumes: `createInterfaceApiError`, `extractInterfaceErrorCode`, `localizeInterfaceError`.

- [ ] **Step 1: Add failing localization assertions**

In `scripts/test-interface-errors.mjs`, add:

```js
assert.equal(extractInterfaceErrorCode({ error: 'trial_expired' }), 'trial_expired');
assert.equal(
  localizeInterfaceError('trial_expired', enT),
  'Your Free Trial has ended. Choose a plan to continue.',
);
assert.equal(
  localizeInterfaceError('trial_expired', ukT),
  'Безкоштовний тестовий період завершився. Обери тариф, щоб продовжити.',
);
assert.doesNotMatch(localizeInterfaceError('trial_expired', ukT), /Gemini/i);
```

- [ ] **Step 2: Add failing Playwright route cases**

In `scripts/test-free-trial-ai-ui.js`, keep the first Studio request as the
existing provider-configuration failure, make request 2 a trial expiration,
request 3 a successful generation, request 4 the held concurrent generation,
and request 5 the older-period response:

```js
if (remixRequests === 2) {
  return route.fulfill({
    status: 402,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'trial_expired' }),
  });
}
if (remixRequests === 4) {
  return new Promise((resolve) => {
    pendingConcurrentRemix = { route, resolve };
  });
}
if (remixRequests === 5) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ...realRemixPayload(),
      daily: OLDER_DAILY,
      generationId: 'remix_generation_older_period_ui',
    }),
  });
}
```

For Jeryk, use this response order:

```js
if (chatRequests === 3) {
  return route.fulfill({
    status: 402,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'trial_expired' }),
  });
}
if (chatRequests === 5) {
  return route.fulfill({
    status: 201,
    contentType: 'application/json',
    body: JSON.stringify({
      reply: 'Concurrent controlled Gemini reply.',
      provider: 'gemini',
      model: 'controlled-ui-model',
      daily: dailySnapshot(5, 2, 100, 2),
    }),
  });
}
```

Request 4 continues through the default 503 `ai_provider_failed` response.

- [ ] **Step 3: Add failing Studio and Jeryk assertions**

After the existing first Studio provider-error assertion, click regenerate and
assert the trial-specific copy:

```js
await page.getByRole('button', { name: /Перегенерувати AI/i }).click();
await page.waitForFunction(() => (
  document.querySelector('.remix-bottom')?.innerText.includes(
    'Безкоштовний тестовий період завершився.',
  )
));
await check('Studio reports trial expiration without blaming Gemini', async () => {
  const trialEndedStudioText = await page.locator('.remix-bottom').innerText();
  assert.match(
    trialEndedStudioText,
    /Безкоштовний тестовий період завершився\. Обери тариф, щоб продовжити\./,
  );
  assert.doesNotMatch(trialEndedStudioText, /Gemini/);
});
```

Click regenerate once more before the existing successful-Studio assertion so
request 3 returns the controlled success.

```js
await page.getByRole('button', { name: /Перегенерувати AI/i }).click();
await page.waitForFunction(() => (
  document.querySelector('.remix-bottom')?.innerText.includes('Готова структура')
));
```

After the daily Jeryk quota assertion, send another prompt and check the
trial-ended state:

```js
await page.locator('.jeryk-prompts button').nth(2).click();
await waitForJeryk(page);
await check('Jeryk reports trial expiration without OFFLINE', async () => {
  const trialThreadText = await page.locator('.jeryk-thread').innerText();
  assert.match(
    trialThreadText,
    /Безкоштовний тестовий період завершився\. Обери тариф, щоб продовжити\./,
  );
  assert.doesNotMatch(trialThreadText, /Gemini/);
  assert.match(await page.locator('.jeryk-context em').innerText(), /trial/i);
  assert.doesNotMatch(await page.locator('.jeryk-context em').innerText(), /offline/i);
});
```

Then send the fourth prompt and retain the existing provider-failure assertion:

```js
await page.locator('.jeryk-prompts button').nth(3).click();
await waitForJeryk(page);
```

- [ ] **Step 4: Run UI tests and verify both are red**

Run:

```powershell
node scripts/test-interface-errors.mjs
node scripts/test-free-trial-ai-ui.js
```

Expected:

- interface-error test fails because `trial_expired` is unknown;
- Playwright fails because Studio uses its generic fallback and Jeryk does not
  render a `trial` state.

- [ ] **Step 5: Add the typed error and localized copy**

Add to `CODE_TO_KEY` in `src/interfaceErrors.mjs`:

```js
trial_expired: 'errors.trialExpired',
```

Add to `src/locales/en.mjs`:

```js
'errors.trialExpired': 'Your Free Trial has ended. Choose a plan to continue.',
```

Add to `src/locales/uk.mjs`:

```js
'errors.trialExpired': 'Безкоштовний тестовий період завершився. Обери тариф, щоб продовжити.',
```

- [ ] **Step 6: Centralize Jeryk error-state classification**

Below `createInterfaceApiError` in `src/main.jsx`, add:

```js
function jerykErrorMeta(code) {
  if (code === 'ai_provider_not_configured' || code === 'ai_provider_failed') {
    return { provider: 'offline', model: 'unavailable' };
  }
  if (code === 'daily_agent_chat_limit_reached') {
    return { provider: 'limit', model: 'daily' };
  }
  if (code === 'trial_expired') {
    return { provider: 'trial', model: 'ended' };
  }
  return { provider: 'ready', model: 'dzhero' };
}
```

In the primary Jeryk catch block, replace the inline provider/quota branching
with:

```js
const code = extractInterfaceErrorCode(error);
setAgentMeta(jerykErrorMeta(code));
```

In the second Jeryk surface, preserve the typed response:

```js
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw createInterfaceApiError(payload, 'agent_error');
```

Replace its unconditional offline catch with:

```js
} catch (agentError) {
  const code = extractInterfaceErrorCode(agentError);
  setAgentMeta(jerykErrorMeta(code));
  setMessages((current) => current.map((item, index) => (
    index === current.length - 1
      ? ['assistant', localizeInterfaceError(agentError, t, 'errors.assistant')]
      : item
  )));
}
```

No Studio-specific branch is needed: its existing
`createInterfaceApiError`/`localizeInterfaceError` path will now resolve
`trial_expired` correctly.

- [ ] **Step 7: Run focused UI checks and verify green**

Run:

```powershell
node scripts/test-interface-errors.mjs
node scripts/test-free-trial-ai-ui.js
```

Expected:

```text
interface error tests passed
Free Trial UI regression checks passed.
```

- [ ] **Step 8: Commit the truthful UI slice**

Run:

```powershell
git add -- src/interfaceErrors.mjs src/locales/en.mjs src/locales/uk.mjs src/main.jsx scripts/test-interface-errors.mjs scripts/test-free-trial-ai-ui.js
git commit -m "fix: distinguish expired trials from Gemini outages"
```

Expected: one commit containing only typed-error, copy, UI-state, and UI-test
changes.

---

### Task 3: Full Regression Verification and Handoff Documentation

**Files:**
- Modify: `docs/agent-context/WORKING-MEMORY.md`
- Modify: `docs/agent-context/OPEN-ISSUES.md`
- Verify: all files from Tasks 1 and 2

**Interfaces:**
- Consumes: the completed backend and frontend behavior.
- Produces: canonical verification evidence and an explicit production smoke-test checklist.

- [ ] **Step 1: Run the canonical Free Trial suite**

Run:

```powershell
npm.cmd run test:free-trial-ai
```

Expected: daily quota unit checks, API regressions, interface-error tests, and
Playwright UI regressions all pass.

- [ ] **Step 2: Run adjacent public-beta and syntax checks**

Run:

```powershell
node --check backend/server.js
npm.cmd run test:public-beta
```

Expected: backend syntax is valid and both public-beta guard suites pass. The
shared Signals/discovery access policy remains unchanged.

- [ ] **Step 3: Build the production frontend**

Run:

```powershell
npm.cmd run build
```

Expected: Vite exits with code 0. The existing non-blocking bundle-size warning
is acceptable.

- [ ] **Step 4: Record the verified behavior**

Append to the July 24 Free Trial section in
`docs/agent-context/WORKING-MEMORY.md`:

```markdown
- The public-beta AI grant is versioned and lazy: every trial workspace gets one
  72-hour window beginning with its first accepted Studio or Jeryk action.
  Historical subscriptions migrate on first use; the persisted start/end never
  extend on retries or later actions.
- `trial_expired` has dedicated English/Ukrainian copy and never marks Gemini or
  Jeryk `OFFLINE`.
```

Add under Public beta deployment in `docs/agent-context/OPEN-ISSUES.md`:

```markdown
- After deploying the lazy AI-trial activation commit, smoke-test one historical
  Free Trial workspace: confirm the first AI action persists a 72-hour window,
  reaches Gemini, and a second action does not move `trialEndsAt`.
```

- [ ] **Step 5: Review the final diff for scope and secret safety**

Run:

```powershell
git status --short
git diff --check
git diff --stat HEAD~2
git diff HEAD~2 -- . ':!backend/data/db.json'
```

Expected:

- no `.env`, provider key, prompt payload, or runtime database is staged;
- `backend/data/db.json` remains the user's pre-existing unstaged modification;
- changes are limited to the lifecycle helper, server wiring, regression tests,
  typed UI errors, localized copy, and handoff documentation.

- [ ] **Step 6: Commit the verified documentation**

Run:

```powershell
git add -- docs/agent-context/WORKING-MEMORY.md docs/agent-context/OPEN-ISSUES.md
git commit -m "docs: record lazy free trial AI activation"
```

Expected: a documentation-only commit.

- [ ] **Step 7: Capture final evidence**

Run:

```powershell
git log -4 --oneline
git status --short
```

Expected:

- three new implementation commits after the design/plan commits;
- only the pre-existing `backend/data/db.json` modification remains.

Do not claim production is fixed until Railway deploys the implementation
commit and the historical-workspace smoke test passes.
