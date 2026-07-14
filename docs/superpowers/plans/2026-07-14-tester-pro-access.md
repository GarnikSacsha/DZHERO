# Tester Pro Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace passwordless email login with open Google authentication and add an owner-managed, cost-capped Tester Pro entitlement with metered AI and Apify usage.

**Architecture:** Store tester grants as an overlay keyed by normalized verified Google email, leaving the user's base subscription untouched. Resolve entitlements in the order owner unlimited, active tester grant, then base subscription; central provider-attempt hooks reserve usage before external calls. Add a session-protected owner panel, a persistent public-preview budget, and a Tester Pro discovery policy that targets up to ten unique reels per day within USD 0.40.

**Tech Stack:** Node.js/CommonJS, Express 5, JSONB app-state/Postgres or local JSON storage, React 19, Vite 8, custom CSS, Node assert integration scripts.

## Global Constraints

- Google sign-in remains open to everyone; normal new users keep the existing three-day trial.
- Owner unlimited access always wins and must never be downgraded or converted to Tester Pro.
- Tester Pro grants have no automatic expiry and are revoked manually.
- Tester Pro limits are 50 paid AI operations/month, 30 manual imports/month, 5 results/request, 5 competitors, 1 workspace, 1 team member, 1 Instagram account, 10 Brand Brain saves/month, and 50 content-plan posts.
- Automatic Tester Pro discovery targets up to 10 new unique reels per UTC day and cannot exceed USD 0.40 per workspace per UTC day.
- Public paid Brand Scan preview attempts are capped at 20 per UTC day platform-wide, in addition to the existing per-IP limiter.
- Reserve paid usage before provider dispatch; failed provider attempts remain charged.
- Never commit `backend/data/db.json`.
- Preserve unrelated dirty work in `backend/server.js`, `src/main.jsx`, `src/styles.css`, `src/i18n.js`, and existing content-plan files. Inspect `git diff` before every edit and stage only feature hunks.
- Keep new user-facing copy complete in both Ukrainian and English.

## File Structure

- Create `backend/services/testerAccess.cjs`: tester grant CRUD, normalized email matching, entitlement overlay selection, and Tester Pro discovery policy.
- Create `backend/services/paidUsage.cjs`: monthly/daily counter reservation with plan-limit errors.
- Modify `backend/services/agentEngine.js`: call a metering hook immediately before the Gemini request.
- Modify `backend/services/remixEngine.js`: call a metering hook before each provider attempt, including quality retry.
- Modify `backend/services/automaticSignalDiscovery.js`: apply bounded Tester Pro planning, one budget-consuming run/day, and identical forced/scheduled preflight.
- Modify `backend/server.js`: plan catalog, DB shape, entitlement resolution, owner API, OAuth grant linking, provider metering, preview budget, and discovery policy wiring.
- Create `src/TesterAccessPanel.jsx`: owner-only grant/list/revoke UI.
- Create `src/testerAccessUi.mjs`: presentation helpers for tester statuses and usage.
- Modify `src/main.jsx`: Google-only landing, owner tab integration, billing rows, and limit messages.
- Modify `src/styles.css`: remove email-entry styles and add owner tester-panel styles.
- Modify `src/i18n.js`: Ukrainian/English strings introduced by this feature.
- Create focused scripts under `scripts/` for each domain and one backend API integration test.
- Modify `.env.example` and `docs/BACKEND.md`: document preview cap and owner tester workflow.

---

### Task 1: Tester Grant Domain

**Files:**
- Create: `backend/services/testerAccess.cjs`
- Create: `scripts/test-tester-access.js`

**Interfaces:**
- Produces: `normalizeTesterEmail(value): string`
- Produces: `upsertTesterGrant(db, { email, ownerUserId, note, createId, now }): grant`
- Produces: `linkTesterGrant(db, { user, now }): grant | null`
- Produces: `revokeTesterGrant(db, { grantId, now }): grant | null`
- Produces: `getActiveTesterGrant(db, user): grant | null`
- Produces: `resolveAccessPlan({ basePlan, testerPlan, grant, unlimited }): { plan, accessSource }`
- Produces: `getTesterDiscoveryPolicy(planId): policy | null`

- [ ] **Step 1: Write the failing domain test**

```js
const assert = require('node:assert/strict');
const {
  getActiveTesterGrant,
  getTesterDiscoveryPolicy,
  linkTesterGrant,
  normalizeTesterEmail,
  resolveAccessPlan,
  revokeTesterGrant,
  upsertTesterGrant,
} = require('../backend/services/testerAccess.cjs');

const db = { testerAccessGrants: [] };
const now = new Date('2026-07-14T10:00:00.000Z');
const grant = upsertTesterGrant(db, {
  email: ' Tester@Example.COM ',
  ownerUserId: 'usr_owner',
  note: 'July feedback group',
  createId: () => 'tester_grant_1',
  now,
});
assert.equal(normalizeTesterEmail(' Tester@Example.COM '), 'tester@example.com');
assert.equal(grant.status, 'pending');
assert.equal(db.testerAccessGrants.length, 1);
assert.equal(upsertTesterGrant(db, {
  email: 'tester@example.com',
  ownerUserId: 'usr_owner',
  createId: () => 'duplicate',
  now,
}).id, grant.id);
assert.equal(db.testerAccessGrants.length, 1);

const user = { id: 'usr_tester', email: 'TESTER@example.com', workspaceId: 'ws_tester' };
assert.equal(linkTesterGrant(db, { user, now }).status, 'active');
assert.equal(getActiveTesterGrant(db, user).workspaceId, 'ws_tester');

const basePlan = { id: 'trial' };
const testerPlan = { id: 'tester_pro' };
assert.equal(resolveAccessPlan({ basePlan, testerPlan, grant, unlimited: false }).plan.id, 'tester_pro');
assert.equal(resolveAccessPlan({ basePlan, testerPlan, grant, unlimited: true }).accessSource, 'owner_unlimited');

assert.equal(revokeTesterGrant(db, { grantId: grant.id, now }).status, 'revoked');
assert.equal(getActiveTesterGrant(db, user), null);
assert.equal(resolveAccessPlan({ basePlan, testerPlan, grant, unlimited: false }).plan.id, 'trial');

assert.deepEqual(getTesterDiscoveryPolicy('tester_pro'), {
  dailyBudgetUsd: 0.4,
  dailyTarget: 10,
  maxBudgetedRunsPerDay: 1,
  resultLimitPerPlatform: 5,
  maxPlannedCalls: 2,
});

console.log('tester access tests passed');
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `node scripts/test-tester-access.js`

Expected: FAIL with `Cannot find module '../backend/services/testerAccess.cjs'`.

- [ ] **Step 3: Implement the tester grant module**

```js
const TESTER_PLAN_ID = 'tester_pro';

function normalizeTesterEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function ensureGrants(db) {
  db.testerAccessGrants ||= [];
  return db.testerAccessGrants;
}

function upsertTesterGrant(db, { email, ownerUserId, note = '', createId, now = new Date() }) {
  const normalizedEmail = normalizeTesterEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) return null;
  const grants = ensureGrants(db);
  const timestamp = new Date(now).toISOString();
  let grant = grants.find((item) => normalizeTesterEmail(item.email) === normalizedEmail);
  if (!grant) {
    grant = { id: createId('tester_grant'), email: normalizedEmail, createdAt: timestamp };
    grants.unshift(grant);
  }
  Object.assign(grant, {
    email: normalizedEmail,
    status: grant.userId && grant.workspaceId ? 'active' : 'pending',
    planId: TESTER_PLAN_ID,
    ownerUserId,
    note: String(note || '').trim(),
    grantedAt: timestamp,
    revokedAt: null,
    updatedAt: timestamp,
  });
  return grant;
}

function linkTesterGrant(db, { user, now = new Date() }) {
  const email = normalizeTesterEmail(user?.email);
  const grant = ensureGrants(db).find((item) => normalizeTesterEmail(item.email) === email && item.status !== 'revoked');
  if (!grant || !user?.workspaceId) return null;
  const timestamp = new Date(now).toISOString();
  Object.assign(grant, {
    status: 'active',
    userId: user.id,
    workspaceId: user.workspaceId,
    activatedAt: grant.activatedAt || timestamp,
    updatedAt: timestamp,
  });
  return grant;
}

function revokeTesterGrant(db, { grantId, now = new Date() }) {
  const grant = ensureGrants(db).find((item) => item.id === grantId);
  if (!grant) return null;
  const timestamp = new Date(now).toISOString();
  grant.status = 'revoked';
  grant.revokedAt = timestamp;
  grant.updatedAt = timestamp;
  return grant;
}

function getActiveTesterGrant(db, user) {
  const email = normalizeTesterEmail(user?.email);
  return ensureGrants(db).find((item) => (
    item.status === 'active'
    && item.planId === TESTER_PLAN_ID
    && (item.userId === user?.id || normalizeTesterEmail(item.email) === email)
  )) || null;
}

function resolveAccessPlan({ basePlan, testerPlan, grant, unlimited }) {
  if (unlimited) return { plan: basePlan, accessSource: 'owner_unlimited' };
  if (grant?.status === 'active' && testerPlan) return { plan: testerPlan, accessSource: 'tester_grant' };
  return { plan: basePlan, accessSource: 'subscription' };
}

function getTesterDiscoveryPolicy(planId) {
  if (planId !== TESTER_PLAN_ID) return null;
  return {
    dailyBudgetUsd: 0.4,
    dailyTarget: 10,
    maxBudgetedRunsPerDay: 1,
    resultLimitPerPlatform: 5,
    maxPlannedCalls: 2,
  };
}

module.exports = {
  TESTER_PLAN_ID,
  getActiveTesterGrant,
  getTesterDiscoveryPolicy,
  linkTesterGrant,
  normalizeTesterEmail,
  resolveAccessPlan,
  revokeTesterGrant,
  upsertTesterGrant,
};
```

- [ ] **Step 4: Run the focused test**

Run: `node scripts/test-tester-access.js`

Expected: `tester access tests passed`.

- [ ] **Step 5: Commit the isolated domain unit**

```powershell
git add backend/services/testerAccess.cjs scripts/test-tester-access.js
git commit -m "feat: add tester access grant domain"
```

### Task 2: Tester Pro Entitlements and Owner API

**Files:**
- Modify: `backend/server.js` near imports, `PLAN_CATALOG`, `normalizeDbShape`, `publicUser`, `buildEntitlements`, Google callback, billing plan route, and admin tester routes
- Create: `scripts/test-owner-tester-api.mjs`

**Interfaces:**
- Consumes: all exports from `backend/services/testerAccess.cjs`
- Produces: `currentUser.canManageTesters: boolean`
- Produces: `billing.accessSource: 'owner_unlimited' | 'tester_grant' | 'subscription'`
- Produces: `GET|POST|DELETE /api/owner/testers`

- [ ] **Step 1: Write an API integration test using a temporary DB and server process**

Base the process harness on `scripts/test-automatic-discovery-api.mjs`. Seed an owner user whose email is present in `UNLIMITED_ACCESS_EMAILS`, a valid session token, one normal trial workspace, and empty `testerAccessGrants`. Assert:

```js
const ownerHeaders = {
  origin: baseUrl,
  cookie: 'dzhero_session=owner_session',
  'content-type': 'application/json',
};

let result = await requestJson(baseUrl, '/api/owner/testers', { headers: ownerHeaders });
assert.equal(result.response.status, 200);
assert.deepEqual(result.body.testers, []);

result = await requestJson(baseUrl, '/api/owner/testers', {
  method: 'POST',
  headers: ownerHeaders,
  body: JSON.stringify({ email: 'Future.Tester@Example.com' }),
});
assert.equal(result.response.status, 201);
assert.equal(result.body.tester.email, 'future.tester@example.com');
assert.equal(result.body.tester.status, 'pending');

const denied = await requestJson(baseUrl, '/api/owner/testers', {
  headers: { cookie: 'dzhero_session=regular_session' },
});
assert.equal(denied.response.status, 403);

const revoked = await requestJson(baseUrl, `/api/owner/testers/${result.body.tester.id}`, {
  method: 'DELETE',
  headers: ownerHeaders,
});
assert.equal(revoked.response.status, 200);
assert.equal(revoked.body.tester.status, 'revoked');
```

Run the server with `DB_PATH=<temp db>`, `NODE_ENV=test`, `UNLIMITED_ACCESS_EMAILS=owner@example.com`, `CLIENT_URL=<baseUrl>`, and a free `PORT`.

- [ ] **Step 2: Run the API test and confirm the first owner route returns 404**

Run: `node scripts/test-owner-tester-api.mjs`

Expected: FAIL because `/api/owner/testers` is not registered.

- [ ] **Step 3: Add the internal plan and DB shape**

Add `aiOperations` to every existing plan using the existing agent limits (`demo: 5`, `trial: 5`, `starter: 150`, `pro: 600`, `agency: 2500`) and insert:

```js
{
  id: 'tester_pro',
  name: 'Tester Pro',
  billingPeriod: 'internal',
  priceUah: 0,
  internal: true,
  limits: {
    aiOperations: 50,
    agentChat: 50,
    reelImports: 30,
    competitors: 5,
    workspaces: 1,
    teamMembers: 1,
    instagramAccounts: 1,
    brandBrainSaves: 10,
    contentPlanPosts: 50,
  },
  features: ['tester_pro', 'assistant', 'remix_studio', 'content_plan', 'apify_discovery'],
},
```

Add `db.testerAccessGrants ||= []` in `normalizeDbShape`. Filter internal plans from the public catalog:

```js
app.get('/api/billing/plans', (req, res) => {
  res.json({ plans: PLAN_CATALOG.filter((plan) => !plan.internal).map(publicPlan) });
});
```

- [ ] **Step 4: Overlay the grant in auth and entitlements**

Import the Task 1 helpers. In `publicUser`, add:

```js
canManageTesters: userHasUnlimitedAccess(user),
lastLoginAt: user.lastLoginAt || null,
```

After `ensureOAuthUser` in the verified Google callback, call `linkTesterGrant(db, { user })` before writing state.

In `buildEntitlements`, resolve the effective plan as:

```js
const basePlan = getPlan(subscription.planId);
const unlimited = workspaceHasUnlimitedAccess(db, workspaceId, actorUser);
const workspaceUser = actorUser || getWorkspaceUsers(db, workspaceId)[0] || null;
const testerGrant = getActiveTesterGrant(db, workspaceUser);
const testerPlan = PLAN_CATALOG.find((item) => item.id === 'tester_pro');
const resolved = resolveAccessPlan({ basePlan, testerPlan, grant: testerGrant, unlimited });
const plan = unlimited ? buildUnlimitedPlan(basePlan) : resolved.plan;
```

Return `accessSource: resolved.accessSource`, a public tester-grant summary, and `usage.aiOperations` from `USAGE_METRICS.aiOperations`.

- [ ] **Step 5: Add server-side owner authorization and routes**

Add:

```js
function requireOwnerUser(db, req, res) {
  const user = requireAuthUser(db, req, res);
  if (!user) return null;
  if (!userHasUnlimitedAccess(user)) {
    res.status(403).json({ error: 'owner_access_required' });
    return null;
  }
  return user;
}
```

Implement the three owner routes. `POST` validates a normalized email, upserts the grant, links an existing user immediately, writes DB, and returns status 201. `GET` maps grants to `{ id, email, status, note, grantedAt, activatedAt, revokedAt, lastLoginAt, workspaceId, workspaceName, billing, discovery }`; `billing` comes from `buildEntitlements`, and `discovery` comes from `buildDiscoveryStatusResponse` when a workspace exists. `DELETE` calls `revokeTesterGrant`, returns 404 for a missing ID, persists, and returns the public record.

- [ ] **Step 6: Make legacy admin tester grants safe**

Change `/api/admin/testers/grant` to upsert the same `testerAccessGrants` record and default to fixed `tester_pro`; remove the default `agency` activation path for product testers. Keep `/api/admin/testers` as an operational view over grant records.

- [ ] **Step 7: Run focused auth and owner tests**

Run:

```powershell
node scripts/test-tester-access.js
node scripts/test-owner-tester-api.mjs
node scripts/test-auth-workspace-payload.js
node scripts/test-google-auth-empty-workspace.mjs
node --check backend/server.js
```

Expected: all scripts print their pass messages; syntax check exits 0.

- [ ] **Step 8: Commit only Tester Pro entitlement and owner API hunks**

Inspect `git diff -- backend/server.js` and stage only Task 2 hunks plus the new test. Verify with `git diff --cached` that pre-existing server edits are absent, then commit:

```powershell
git commit -m "feat: add owner-managed Tester Pro grants"
```

### Task 3: Google-Only Authentication Surface

**Files:**
- Modify: `backend/server.js`
- Delete: `backend/services/emailTrialAccess.cjs`
- Delete: `scripts/test-email-trial-access.js`
- Modify: `src/main.jsx` in `BrandScanGate`
- Modify: `src/styles.css` around `.email-access-field` and `.email-auth-button`
- Create: `scripts/test-google-only-auth.js`

**Interfaces:**
- Produces: landing authentication through `/api/auth/google/start` only
- Removes: `POST /api/auth/email`

- [ ] **Step 1: Write a source-level regression test**

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('backend/server.js', 'utf8');
const frontend = fs.readFileSync('src/main.jsx', 'utf8');
const styles = fs.readFileSync('src/styles.css', 'utf8');

assert.doesNotMatch(server, /app\.post\('\/api\/auth\/email'/);
assert.doesNotMatch(server, /emailTrialAccess/);
assert.doesNotMatch(frontend, /startEmailLogin|emailInput|email-access-field|email-auth-button/);
assert.doesNotMatch(frontend, /Demo access by email|Демо-вхід з email/);
assert.doesNotMatch(styles, /\.email-access-field|\.email-auth-button/);
assert.match(frontend, /auth\/google\/start/);

console.log('google-only auth tests passed');
```

- [ ] **Step 2: Run the test and confirm it fails on the existing email flow**

Run: `node scripts/test-google-only-auth.js`

Expected: FAIL on the first email-route or email-UI assertion.

- [ ] **Step 3: Remove the backend email entry point**

Remove the `emailTrialAccess.cjs` import, `/api/auth/email` limiter registration, and `/api/auth/email` route. Delete the service and its obsolete test. Do not remove password registration/login routes unless separately requested; the product landing simply stops exposing them.

- [ ] **Step 4: Remove the landing email UI and copy**

From `BrandScanGate`, remove `emailInput`, the `startEmailLogin` function, email-specific copy keys, and the divider/email form markup. Keep the Google button and the existing demo-link behavior. Replace the helper sentence with localized Google-only text:

```js
privacy: language === 'en'
  ? 'Secure sign-in through your Google account.'
  : 'Безпечний вхід через твій Google-акаунт.',
```

Remove `.email-access-field` and `.email-auth-button` CSS blocks that have no remaining consumers.

- [ ] **Step 5: Run regression and build checks**

Run:

```powershell
node scripts/test-google-only-auth.js
node scripts/test-auth-session-upgrade.js
npm.cmd run build
```

Expected: both scripts pass and Vite exits with `built in`.

- [ ] **Step 6: Commit only Google-only auth hunks**

Stage the deleted service/test, the new regression test, and only the relevant server/frontend/style hunks. Verify `git diff --cached`, then commit:

```powershell
git commit -m "feat: keep public authentication Google-only"
```

### Task 4: Paid AI Attempt Metering

**Files:**
- Create: `backend/services/paidUsage.cjs`
- Create: `scripts/test-paid-usage.js`
- Modify: `backend/services/agentEngine.js`
- Modify: `backend/services/remixEngine.js`
- Modify: `backend/server.js` in AI helpers and provider-backed routes

**Interfaces:**
- Produces: `reserveUsageCounter(db, options): counter`
- Produces: `createPaidAiAttemptGuard({ db, workspaceId, actorUser, persist }): () => Promise<void>` inside server
- Extends: `generateAgentReply(args)` with `args.beforeProviderAttempt`
- Extends: `generateRemix(globalInsight, businessBrief, options)` with `options.beforeProviderAttempt`
- Extends: Gemini video/image helpers with `options.beforeProviderAttempt`

- [ ] **Step 1: Write the failing reservation test**

```js
const assert = require('node:assert/strict');
const { reserveUsageCounter } = require('../backend/services/paidUsage.cjs');

const db = { usageCounters: [] };
for (let index = 0; index < 50; index += 1) {
  reserveUsageCounter(db, {
    workspaceId: 'ws_tester', metric: 'ai_operations', period: '2026-07', limit: 50,
  });
}
assert.equal(db.usageCounters[0].value, 50);
assert.throws(() => reserveUsageCounter(db, {
  workspaceId: 'ws_tester', metric: 'ai_operations', period: '2026-07', limit: 50,
}), (error) => error.status === 402 && error.payload.remaining === 0);
assert.equal(db.usageCounters[0].value, 50);
reserveUsageCounter(db, {
  workspaceId: 'ws_owner', metric: 'ai_operations', period: '2026-07', limit: 0, unlimited: true,
});
assert.equal(db.usageCounters.find((item) => item.workspaceId === 'ws_owner').value, 1);

console.log('paid usage tests passed');
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `node scripts/test-paid-usage.js`

Expected: FAIL with `Cannot find module '../backend/services/paidUsage.cjs'`.

- [ ] **Step 3: Implement atomic in-memory reservation semantics**

```js
function reserveUsageCounter(db, {
  workspaceId, metric, period, amount = 1, limit, unlimited = false, now = new Date(),
}) {
  db.usageCounters ||= [];
  let counter = db.usageCounters.find((item) => (
    item.workspaceId === workspaceId && item.metric === metric && item.period === period
  ));
  if (!counter) {
    counter = { workspaceId, metric, period, value: 0, createdAt: new Date(now).toISOString() };
    db.usageCounters.unshift(counter);
  }
  const units = Math.max(1, Math.trunc(Number(amount || 1)));
  if (!unlimited && Number.isFinite(limit) && counter.value + units > limit) {
    const error = new Error('plan_limit_reached');
    error.status = 402;
    error.payload = {
      error: 'plan_limit_reached', usageKey: metric, limit, used: counter.value,
      remaining: Math.max(0, limit - counter.value),
    };
    throw error;
  }
  counter.value += units;
  counter.updatedAt = new Date(now).toISOString();
  return counter;
}

module.exports = { reserveUsageCounter };
```

- [ ] **Step 4: Add provider-attempt hooks**

In `agentEngine.js`, immediately before its Gemini `fetch`, execute:

```js
if (typeof args.beforeProviderAttempt === 'function') {
  await args.beforeProviderAttempt({ provider: 'gemini', model, operation: 'agent_chat' });
}
```

Change `generateRemix` to accept `options = {}` and pass `options.beforeProviderAttempt` into `generateValidatedProviderResult`. Immediately before every `generate(qualityFeedback)` attempt, execute:

```js
if (typeof beforeProviderAttempt === 'function') {
  await beforeProviderAttempt({ provider, model, operation: 'remix', attempt });
}
```

This meters both the first attempt and the existing quality retry independently.

- [ ] **Step 5: Create the persisted server guard**

Use one serialized promise per request so parallel video enrichment cannot race:

```js
function createPaidAiAttemptGuard({ db, workspaceId, actorUser }) {
  let queue = Promise.resolve();
  return () => {
    queue = queue.then(async () => {
      const billing = buildEntitlements(db, workspaceId, actorUser);
      reserveUsageCounter(db, {
        workspaceId,
        metric: USAGE_METRICS.aiOperations,
        period: billing.period,
        limit: billing.plan.limits.aiOperations,
        unlimited: billing.unlimited,
      });
      await writeDb(db);
    });
    return queue;
  };
}
```

Add `aiOperations: 'ai_operations'` to `USAGE_METRICS`.

- [ ] **Step 6: Thread the guard through every authenticated paid path**

Create one guard after each route reads its DB and pass it into:

- `/api/workspaces/:workspaceId/agent/chat` via `generateAgentReply`;
- `/api/workspaces/:workspaceId/remix/generate` via `generateRemix`;
- `/api/workspaces/:workspaceId/reels/import-url` for Gemini video/image analysis and remix generation;
- `/api/workspaces/:workspaceId/reels/youtube/popular` for each Gemini video/image attempt;
- `/api/workspaces/:workspaceId/reels/:reelId/analyze` when video intelligence is refreshed.

Update `generateGeminiJsonText`, `analyzeYouTubeVideoWithGemini`, `analyzeSourceImageWithGemini`, `enrichVideoIntelligence`, `enrichVideoIntelligenceSafe`, and `fetchPublicSourceMetadata` to accept/pass `beforeProviderAttempt`. Invoke it immediately before each paid `fetch`, never for local fallback work or transcript/YouTube metadata requests.

Replace agent-chat enforcement from the narrow `agentChat` limit to `aiOperations`. Continue incrementing `USAGE_METRICS.agentChat` after a successful reply so existing billing responses remain backward compatible, but do not use that legacy counter to authorize the provider call.

- [ ] **Step 7: Prove retries and the 51st attempt are blocked before dispatch**

Extend `scripts/test-paid-usage.js` with a fake hook count and add a focused remix test that injects a hook, forces one quality retry, and asserts two hook calls. Add an integration assertion with a seeded `ai_operations=50` counter and a fake provider URL/provider stub showing the response is 402 and the stub is never called.

Run:

```powershell
node scripts/test-paid-usage.js
node scripts/test-remix-provider-quality.mjs
node scripts/test-remix-auto-generation.mjs
node scripts/test-usage-limits.js
node --check backend/server.js
```

Expected: all pass.

- [ ] **Step 8: Commit metering code and tests**

Stage the new service/test, the two provider-service changes, and only paid-AI server hunks. Verify the cached diff, then commit:

```powershell
git commit -m "feat: meter paid AI attempts before dispatch"
```

### Task 5: Persistent Public Brand Scan Budget

**Files:**
- Modify: `backend/server.js` near env constants and `/api/brand-scan/preview`
- Modify: `.env.example`
- Create: `scripts/test-public-preview-budget.js`

**Interfaces:**
- Consumes: `reserveUsageCounter`
- Produces: `PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT`, default `20`
- Produces: `429 preview_global_daily_limit_reached`

- [ ] **Step 1: Write a focused daily-period reservation test**

Use `reserveUsageCounter` with `workspaceId: 'platform_global'`, `metric: 'public_brand_scan_preview'`, and period `2026-07-14`. Reserve 20 attempts, assert the 21st throws 429 after the route maps the limit error, and assert period `2026-07-15` starts at one.

- [ ] **Step 2: Run the test and confirm the missing route behavior**

Run: `node scripts/test-public-preview-budget.js`

Expected: FAIL until the server route persists the global counter and returns the preview-specific error.

- [ ] **Step 3: Add the route preflight**

Add:

```js
const PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT = Math.max(
  1,
  Number(process.env.PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT || 20),
);
```

At the start of `/api/brand-scan/preview`, after input validation and before metadata/Apify/Gemini calls, reserve one daily counter only when `APIFY_TOKEN` or `GEMINI_API_KEY` is configured. Persist immediately. Map exhaustion to:

```js
res.status(429).json({
  error: 'preview_global_daily_limit_reached',
  message: 'Daily preview capacity is used. Sign in with Google to continue.',
});
```

Keep the existing per-IP limiter unchanged.

- [ ] **Step 4: Document the environment control**

Add to `.env.example`:

```text
PUBLIC_PREVIEW_DAILY_LIMIT=10
PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT=20
```

- [ ] **Step 5: Run budget and syntax tests**

Run:

```powershell
node scripts/test-public-preview-budget.js
node --check backend/server.js
```

Expected: both exit 0.

- [ ] **Step 6: Commit the preview circuit breaker**

```powershell
git commit -m "feat: cap paid public previews globally"
```

### Task 6: Tester Pro Apify Discovery Policy

**Files:**
- Modify: `backend/services/automaticSignalDiscovery.js`
- Modify: `backend/server.js` around discovery settings/run/worker
- Modify: `scripts/test-automatic-signal-discovery.mjs`
- Modify: `scripts/test-automatic-discovery-api.mjs`

**Interfaces:**
- Consumes: `getTesterDiscoveryPolicy(planId)`
- Extends: `prepareAutomaticDiscovery({ policy })`
- Produces: a maximum of two planned metadata calls, five results/platform, ten winners, USD 0.40/day, one budget-consuming run/day for Tester Pro

- [ ] **Step 1: Add failing pure discovery-policy tests**

Create a Tester Pro workspace state with Instagram and TikTok inputs in multiple lanes. Call:

```js
const prepared = prepareAutomaticDiscovery({
  state,
  workspaceId: 'ws_tester',
  now: new Date('2026-07-14T08:00:00.000Z'),
  force: true,
  policy: {
    dailyBudgetUsd: 0.4,
    dailyTarget: 10,
    maxBudgetedRunsPerDay: 1,
    resultLimitPerPlatform: 5,
    maxPlannedCalls: 2,
  },
});
assert.equal(prepared.run.budgetUsd, 0.4);
assert.equal(prepared.execution.plannedCalls.length, 2);
assert.deepEqual(prepared.execution.plannedCalls.map((call) => call.limit), [5, 5]);
assert.equal(prepared.execution.maxWinners, 10);
assert.ok(prepared.run.reservedCostUsd <= 0.4);
```

Then seed a completed same-day run with `attemptedCallCount: 2` and assert a forced second run returns `reason: 'daily_run_limit'` without execution. Also assert a forced plan whose estimate exceeds USD 0.40 returns `blocked_budget` rather than reserving zero.

- [ ] **Step 2: Run the discovery test and confirm policy assertions fail**

Run: `node scripts/test-automatic-signal-discovery.mjs`

Expected: FAIL because `prepareAutomaticDiscovery` ignores `policy` and forced runs bypass estimate preflight.

- [ ] **Step 3: Apply policy before planning**

Inside `prepareAutomaticDiscovery`, normalize `args.policy`. Clamp `settings.dailyBudgetUsd` to the policy budget, detect a same-day run with `attemptedCallCount > 0` or positive reserved/actual cost, and return `daily_run_limit` before building calls when the maximum is reached.

For the policy path, create calls with one input per platform, `resultLimitPerPlatform`, and at most `maxPlannedCalls`. Prefer one Instagram and one TikTok call when both are enabled. Set `maxWinners` to `dailyTarget`.

- [ ] **Step 4: Make forced and scheduled reservation identical**

Replace:

```js
if (spentUsd >= settings.dailyBudgetUsd || (!isForcedRun && spentUsd + estimatedMetadataCostUsd > settings.dailyBudgetUsd))
```

with:

```js
if (spentUsd >= settings.dailyBudgetUsd || spentUsd + estimatedMetadataCostUsd > settings.dailyBudgetUsd)
```

Always set `reservedCostUsd: estimatedMetadataCostUsd`. Preserve the old large forced-run behavior only when no policy is supplied.

- [ ] **Step 5: Wire plan policy through server paths**

When the worker or `Run now` calls `runAutomaticDiscoveryForWorkspace`, resolve the workspace owner, build entitlements, and pass `getTesterDiscoveryPolicy(entitlements.plan.id)` to `prepareAutomaticDiscovery`. In discovery PATCH, clamp a Tester Pro request above USD 0.40 to 0.40 or return `400 daily_budget_out_of_range` with `max: 0.4`. Ensure status responses expose the effective 0.40 cap.

Map `daily_run_limit` from `Run now` to 429 with a product-safe message indicating that today's ten-signal run has already been used.

- [ ] **Step 6: Extend the API test**

Seed an active Tester Pro grant and assert:

- PATCH with `dailyBudgetUsd: 0.8` cannot persist above 0.4;
- the first forced run requests no more than five items from each platform;
- accepted signals are capped at ten;
- a second same-day forced run makes zero provider calls;
- a provider shortfall may return fewer than ten without claiming success for ten.

- [ ] **Step 7: Run all discovery regressions**

Run:

```powershell
node scripts/test-automatic-signal-discovery.mjs
node scripts/test-automatic-discovery-storage.mjs
node scripts/test-automatic-discovery-regressions.mjs
node scripts/test-automatic-discovery-api.mjs
node scripts/test-apify-signal-provider.mjs
```

Expected: all pass.

- [ ] **Step 8: Commit the bounded discovery policy**

```powershell
git commit -m "feat: bound Tester Pro Apify discovery"
```

### Task 7: Owner Tester Management UI

**Files:**
- Create: `src/testerAccessUi.mjs`
- Create: `src/TesterAccessPanel.jsx`
- Create: `scripts/test-tester-access-ui.mjs`
- Modify: `src/main.jsx` in imports, App settings props, `DataSources`, and `BillingSettings`
- Modify: `src/styles.css`
- Modify: `src/i18n.js`

**Interfaces:**
- Consumes: `GET|POST|DELETE /api/owner/testers`
- Consumes: `currentUser.canManageTesters`
- Produces: `TesterAccessPanel({ apiBase, authFetch, language, notify })`

- [ ] **Step 1: Write failing UI helper tests**

```js
import assert from 'node:assert/strict';
import { formatTesterStatus, getTesterUsageRows } from '../src/testerAccessUi.mjs';

assert.equal(formatTesterStatus('pending', 'en'), 'Pending first Google sign-in');
assert.equal(formatTesterStatus('active', 'uk'), 'Активний');
assert.equal(formatTesterStatus('revoked', 'en'), 'Revoked');
assert.deepEqual(getTesterUsageRows({
  billing: {
    usage: { aiOperations: 12, reelImports: 7 },
    plan: { limits: { aiOperations: 50, reelImports: 30 } },
  },
  discovery: { status: { dailySpendUsd: 0.18, dailyBudgetUsd: 0.4 } },
}), [
  { key: 'aiOperations', used: 12, limit: 50 },
  { key: 'reelImports', used: 7, limit: 30 },
  { key: 'apifyDailyUsd', used: 0.18, limit: 0.4 },
]);
```

- [ ] **Step 2: Run the helper test and confirm the missing module failure**

Run: `node scripts/test-tester-access-ui.mjs`

Expected: FAIL because `src/testerAccessUi.mjs` does not exist.

- [ ] **Step 3: Implement the pure UI helpers**

Implement exactly the two exported helpers used above. Round Apify USD values to two decimals and default missing usage to zero.

- [ ] **Step 4: Build the owner panel component**

`TesterAccessPanel` must:

- fetch the list on mount;
- validate an email containing `@` before POST;
- disable grant/revoke buttons while their request is pending;
- render pending, active, and revoked badges;
- render AI, import, and today's Apify progress;
- show workspace and last-login values only when present;
- confirm before DELETE;
- surface API errors through `notify` without raw stack/provider data;
- refetch after POST or DELETE.

Use the existing `authFetch` helper and pass `apiBase` from `main.jsx`; do not read or ask for `ADMIN_TOKEN`.

- [ ] **Step 5: Add the owner-only Settings tab**

Pass `currentUser` from `App` to `DataSources`. Build tabs as:

```js
const settingsTabs = [
  ['sources', language === 'en' ? 'Sources Hub' : 'Джерела'],
  ['profile', language === 'en' ? 'Brand memory' : 'Памʼять бренду'],
  ['billing', language === 'en' ? 'Plan and limits' : 'Тариф і ліміти'],
  ...(currentUser?.canManageTesters
    ? [['testers', language === 'en' ? 'Testers' : 'Тестери']]
    : []),
];
```

Render `TesterAccessPanel` only for the `testers` tab and only when `canManageTesters` is true. If a stale local-storage tab says `testers` for a non-owner, reset to `sources`.

- [ ] **Step 6: Update billing and limit copy**

Add `aiOperations` to billing usage rows in Ukrainian and English. Show `Tester Pro` as the current effective plan but never in the purchasable plan grid. Update discovery copy to `up to 10 new signals daily` / `до 10 нових сигналів щодня`. Add localized friendly messages for `plan_limit_reached`, `automatic_budget_reached`, `preview_global_daily_limit_reached`, and `daily_run_limit`.

- [ ] **Step 7: Add responsive styles**

Add scoped `.tester-access-*` styles for header, grant form, cards, badges, usage bars, revoke button, empty/loading/error states, and a one-column mobile layout below the project's existing mobile breakpoint. Reuse current billing colors/tokens and verify dark/light theme contrast.

- [ ] **Step 8: Run UI checks**

Run:

```powershell
node scripts/test-tester-access-ui.mjs
node scripts/check-i18n-language.mjs
npm.cmd run build
```

Expected: all pass.

- [ ] **Step 9: Commit the owner panel**

Stage new UI files/tests and only owner-panel/billing/copy/style hunks from dirty shared files. Verify the cached diff, then commit:

```powershell
git commit -m "feat: add owner tester management panel"
```

### Task 8: End-to-End Regression, Documentation, and Handoff

**Files:**
- Modify: `docs/BACKEND.md`
- Modify: `docs/agent-context/RECENT-CHANGES.md`
- Modify: `scripts/test-owner-tester-api.mjs` if final response shapes require alignment

**Interfaces:**
- Verifies all prior task interfaces together

- [ ] **Step 1: Extend end-to-end API assertions**

In the temporary-server integration test, cover this full sequence:

1. Owner grants a mixed-case email before the user exists.
2. The seeded equivalent verified Google user is linked with `linkTesterGrant` through the same callback helper path.
3. `/api/workspaces/:id/billing` returns `tester_pro`, `accessSource: tester_grant`, AI limit 50, import limit 30, and `unlimited: false`.
4. A direct non-owner owner-API request returns 403.
5. Revoke immediately returns billing to the unchanged trial.
6. Owner billing remains `owner_unlimited` throughout.
7. `POST /api/auth/email` returns 404.
8. Internal `tester_pro` is absent from `/api/billing/plans`.

- [ ] **Step 2: Update backend documentation**

Document:

```text
Google login is public. Tester Pro is granted from Settings -> Testers by an owner-unlimited account.
Tester Pro: 50 paid AI attempts/month, 30 manual imports/month, max 5/import,
automatic discovery up to 10 unique signals/day, hard cap USD 0.40/day.
PUBLIC_PREVIEW_GLOBAL_DAILY_LIMIT=20
```

Remove the obsolete email-trial endpoint from `docs/BACKEND.md` and replace the old Agency tester-grant example with the owner-panel flow plus the legacy operational API note.

- [ ] **Step 3: Run the focused suite**

Run:

```powershell
node scripts/test-tester-access.js
node scripts/test-owner-tester-api.mjs
node scripts/test-google-only-auth.js
node scripts/test-paid-usage.js
node scripts/test-public-preview-budget.js
node scripts/test-tester-access-ui.mjs
node scripts/test-usage-limits.js
node scripts/test-auth-workspace-payload.js
node scripts/test-auth-session-upgrade.js
node scripts/test-google-auth-empty-workspace.mjs
node scripts/test-remix-provider-quality.mjs
node scripts/test-automatic-signal-discovery.mjs
node scripts/test-automatic-discovery-storage.mjs
node scripts/test-automatic-discovery-regressions.mjs
node scripts/test-automatic-discovery-api.mjs
node --check backend/server.js
node --check backend/services/agentEngine.js
node --check backend/services/remixEngine.js
```

Expected: every command exits 0 and prints its pass message where applicable.

- [ ] **Step 4: Run final production verification**

Run:

```powershell
npm.cmd run build
git diff --check
git status --short
```

Expected: Vite build succeeds; `git diff --check` prints nothing; `backend/data/db.json` remains modified only as pre-existing local runtime data and is not staged.

- [ ] **Step 5: Perform a manual owner/tester smoke test**

With Google OAuth configured in a non-production or safe production workspace:

- sign in as owner and confirm the Testers tab exists;
- grant an email before tester login;
- sign in with that Google account and confirm Tester Pro billing;
- run discovery and confirm no more than five requests/platform, up to ten accepted signals, and USD 0.40 cap;
- exhaust or seed AI usage to 50 and confirm the next Studio action is blocked before provider dispatch;
- revoke in the owner panel and confirm the tester immediately falls back to trial;
- confirm a normal Google email still receives ordinary trial;
- confirm landing has no email form in desktop and mobile layouts.

- [ ] **Step 6: Commit docs and any final test-only alignment**

```powershell
git commit -m "docs: document Tester Pro access controls"
```

- [ ] **Step 7: Final scope audit**

Inspect `git log --oneline -8`, `git diff origin/main...HEAD --stat`, and the final staged/unstaged state. Confirm no secrets, runtime DB content, unrelated content-plan work, or owner email values were committed.
