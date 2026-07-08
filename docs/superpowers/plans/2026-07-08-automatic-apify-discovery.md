# Automatic Apify Signal Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically populate each workspace signal bank from saved accounts, workspace topics, and general Instagram/TikTok trend searches within a USD 0.80 daily budget.

**Architecture:** Add a focused discovery service that owns scheduling, source construction, budget decisions, and run state. The existing Apify provider remains responsible for Actor calls and normalization; Express exposes settings/run endpoints and starts a single guarded worker loop. The React Signals page shows automation status and keeps manual import behind an advanced action.

**Tech Stack:** Node.js, Express 5, existing JSON/Postgres state adapter, Apify REST API, React 19, Vite 8.

## Global Constraints

- Account sources run every 6 hours.
- Keyword, hashtag, and general trend discovery run every 12 hours.
- Automatic spend is capped at USD 0.80 per workspace per UTC day.
- Metadata is collected before downloading shortlisted video files.
- Initial viral score threshold is 70.
- Duplicate platform IDs update metrics instead of creating new signals.
- Apify tokens and authorization headers are never persisted.
- No new queue, cron, or scheduler dependency is introduced.

---

### Task 1: Discovery Policy, Scheduling, and Budget Ledger

**Files:**
- Create: `backend/services/automaticSignalDiscovery.js`
- Create: `scripts/test-automatic-signal-discovery.mjs`

**Interfaces:**
- Consumes: workspace `sources`, `competitors`, and existing reel identifiers.
- Produces: `defaultDiscoverySettings(now)`, `buildDiscoveryInputs(state, workspaceId)`, `isDiscoveryDue(settings, lane, now)`, `getDailyAutomaticSpend(runs, workspaceId, now)`, `canStartDiscoveryRun(args)`, and `claimDiscoveryRun(state, args)`.

- [ ] **Step 1: Write failing policy tests**

Create fixtures that assert:

```js
assert.equal(defaultDiscoverySettings(now).dailyBudgetUsd, 0.8);
assert.equal(defaultDiscoverySettings(now).viralScoreThreshold, 70);
assert.equal(isDiscoveryDue(settings, 'accounts', sixHoursLater), true);
assert.equal(isDiscoveryDue(settings, 'trends', twelveHoursLater), true);
assert.equal(getDailyAutomaticSpend(runs, 'ws-1', now), 0.72);
assert.equal(canStartDiscoveryRun({ spentUsd: 0.72, estimatedUsd: 0.1, budgetUsd: 0.8 }), false);
```

Also assert that `buildDiscoveryInputs` returns bounded, unique account, keyword, hashtag, and general-trend inputs for both platforms.

- [ ] **Step 2: Run the test and verify failure**

Run: `node scripts/test-automatic-signal-discovery.mjs`

Expected: FAIL because `backend/services/automaticSignalDiscovery.js` does not exist.

- [ ] **Step 3: Implement pure policy functions**

Use UTC day keys (`YYYY-MM-DD`), 6-hour and 12-hour millisecond intervals, maximum 10 inputs per lane, and conservative estimates derived from actor result pricing. `claimDiscoveryRun` must create a unique `running` record before any network request and refuse a second active claim for the same workspace and lane.

- [ ] **Step 4: Run policy tests**

Run: `node scripts/test-automatic-signal-discovery.mjs`

Expected: PASS with scheduling, source construction, unique claim, and budget assertions.

- [ ] **Step 5: Commit**

```bash
git add backend/services/automaticSignalDiscovery.js scripts/test-automatic-signal-discovery.mjs
git commit -m "Add automatic signal discovery policy"
```

### Task 2: Two-Phase Apify Collection Pipeline

**Files:**
- Modify: `backend/services/apifySignalProvider.js`
- Modify: `backend/services/automaticSignalDiscovery.js`
- Modify: `scripts/test-apify-signal-provider.mjs`
- Modify: `scripts/test-automatic-signal-discovery.mjs`

**Interfaces:**
- Consumes: `fetchApifySignals({ token, platform, mode, input, limit, downloadVideos })`, discovery inputs, current reels, and remaining budget.
- Produces: `executeAutomaticDiscovery({ state, workspaceId, token, now, fetchSignals })` returning `{ run, acceptedSignals, updatedSignals }`.

- [ ] **Step 1: Add failing pipeline tests**

Test with an injected `fetchSignals` stub:

```js
const result = await executeAutomaticDiscovery({
  state,
  workspaceId: 'ws-1',
  token: 'test-token',
  now,
  fetchSignals,
});
assert.equal(result.acceptedSignals.length, 1);
assert.equal(result.run.status, 'completed');
assert.equal(fetchSignals.calls.some((call) => call.downloadVideos === true), true);
```

Fixtures must include one low-score candidate, one qualifying candidate, one duplicate, an Instagram failure, and a successful TikTok response. Assert that only the qualifying candidate enters the download phase and one platform failure does not cancel the completed run.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node scripts/test-apify-signal-provider.mjs
node scripts/test-automatic-signal-discovery.mjs
```

Expected: provider mapping passes; automatic pipeline test fails because `executeAutomaticDiscovery` is missing.

- [ ] **Step 3: Implement bounded two-phase execution**

Collect metadata with small per-input limits, normalize and deduplicate candidates, calculate scores with the existing `buildScore`, and request downloadable media only for qualifying TikTok winners. Preserve Instagram `videoUrl`, keep original source URLs as fallback, refresh metrics on duplicates, and record estimated cost plus accepted/duplicate/rejected counts.

- [ ] **Step 4: Run service tests**

Run:

```bash
node scripts/test-apify-signal-provider.mjs
node scripts/test-automatic-signal-discovery.mjs
```

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/services/apifySignalProvider.js backend/services/automaticSignalDiscovery.js scripts/test-apify-signal-provider.mjs scripts/test-automatic-signal-discovery.mjs
git commit -m "Add budgeted automatic Apify pipeline"
```

### Task 3: Discovery API and Guarded Worker

**Files:**
- Modify: `backend/server.js`
- Modify: `.env.example`
- Create: `scripts/test-automatic-discovery-api.mjs`

**Interfaces:**
- Consumes: service functions from Tasks 1-2 and the existing `readDb`/`writeDb` persistence pattern.
- Produces:
  - `GET /api/workspaces/:workspaceId/signals/discovery`
  - `PATCH /api/workspaces/:workspaceId/signals/discovery`
  - `POST /api/workspaces/:workspaceId/signals/discovery/run`

- [ ] **Step 1: Write failing API smoke test**

Start the backend with a temporary state file and authenticated test session. Assert that GET returns defaults, PATCH toggles `enabled`, POST creates a bounded run, and a workspace at USD 0.80 spend returns HTTP 429 with `automatic_budget_reached`.

- [ ] **Step 2: Run the API test and verify failure**

Run: `node scripts/test-automatic-discovery-api.mjs`

Expected: FAIL with HTTP 404 for the discovery endpoint.

- [ ] **Step 3: Add endpoints and worker loop**

Validate booleans and numeric limits server-side. Start a 60-second unref'ed worker interval after server initialization, guard against overlapping ticks inside the process, claim jobs before awaiting Apify, persist after each state transition, and expose readable statuses without exposing the token. Add `AUTOMATIC_DISCOVERY_ENABLED=true` and `AUTOMATIC_DISCOVERY_TICK_MS=60000` to `.env.example`.

- [ ] **Step 4: Run backend verification**

Run:

```bash
node scripts/test-automatic-discovery-api.mjs
node --check backend/server.js
```

Expected: API test PASS and syntax check exits 0.

- [ ] **Step 5: Commit**

```bash
git add backend/server.js .env.example scripts/test-automatic-discovery-api.mjs
git commit -m "Expose automatic discovery API and worker"
```

### Task 4: Signals Automation Status UI

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: the three discovery endpoints from Task 3.
- Produces: a compact Signals-page automation control with toggle, status, last run, next run, daily spend, `Run now`, and `Advanced import`.

- [ ] **Step 1: Add the discovery client state**

Load discovery status when the Signals page opens. Add handlers that PATCH the enabled state and POST `run`, then refresh both discovery status and reel data.

- [ ] **Step 2: Replace the primary manual-import action**

Make the primary control an automation toggle/status surface. Show manual Apify import only through `Advanced import`. Disable `Run now` while active and show `Budget reached` when the API returns `automatic_budget_reached`.

- [ ] **Step 3: Add compact responsive styles**

Use an unframed toolbar row on desktop and a stacked control group on narrow screens. Keep existing card radius and palette conventions; ensure status and currency text do not overflow.

- [ ] **Step 4: Build and verify**

Run: `npm.cmd run build`

Expected: Vite build exits 0.

Open `/signals`, verify the toggle, timestamps, budget display, `Run now`, advanced import, and internal player at desktop and mobile widths.

- [ ] **Step 5: Commit**

```bash
git add src/main.jsx src/styles.css
git commit -m "Add automatic discovery controls to Signals"
```

### Task 5: Production Verification and Deployment

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: deployed automatic discovery with evidence from tests and production health checks.

- [ ] **Step 1: Run the complete focused suite**

Run:

```bash
node scripts/test-apify-signal-provider.mjs
node scripts/test-automatic-signal-discovery.mjs
node scripts/test-automatic-discovery-api.mjs
node --check backend/server.js
npm.cmd run build
```

Expected: all tests PASS, syntax exits 0, and Vite build exits 0.

- [ ] **Step 2: Push the reviewed commits**

Run: `git push origin main`

Expected: remote `main` advances to the final implementation commit.

- [ ] **Step 3: Verify Railway**

Confirm `/api/health` returns HTTP 200 and the deployed JavaScript bundle contains `/signals/discovery`.

- [ ] **Step 4: Verify one production run**

Enable automatic discovery for the test workspace, invoke `Run now`, confirm at least one qualifying signal appears or the run reports zero qualifying candidates without error, invoke it again, and confirm no duplicate signal is created.

- [ ] **Step 5: Verify cost protection**

Confirm the status response reports `dailyBudgetUsd: 0.8`, current daily estimated spend, and refuses a run whose estimate would exceed the remaining budget.
