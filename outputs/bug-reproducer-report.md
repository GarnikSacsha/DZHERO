# Bug Reproducer

## ✅ FIX_PROVEN — Bug reproduced and fix proven

> The same reproducer changed from failing to passing and broader checks passed.

**Project:** DZHERO
**Bug:** Historical Free Trial is blocked before Gemini and mislabeled as provider offline
**Environment:** Node.js 22-compatible project on Windows, temporary JSON databases, controlled local Gemini server, headless Chromium
**Generated:** 2026-07-24

## Original report

A Free Trial user could not generate Studio scenarios or talk to Jeryk. Railway logged trial_expired, while the frontend showed a Gemini failure and OFFLINE.

| Contract | Expected | Actual |
|---|---|---|
| Observed behavior | Every eligible trial workspace receives one 72-hour AI window starting with its first accepted Studio or Jeryk action; an actually expired grant is reported as trial expiration, not a Gemini outage. | Historical trialEndsAt blocked older workspaces before Gemini, and trial_expired fell back to ai_provider_failed/OFFLINE in the UI. |

## Minimal reproduction

Authenticated historical trial fixtures call the real billing and Jeryk/Studio API paths with a controlled Gemini provider. Playwright routes HTTP 402 trial_expired into the real Studio and Jeryk UI.

**Confirming signal:** The API regression returned pendingActivation undefined instead of true for an unversioned historical trial; interface/UI regressions showed unknown_error and Gemini/OFFLINE for trial_expired.

### Reproduction files approved at Gate 1

- [test-free-trial-ai-api.mjs](<C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\scripts\test-free-trial-ai-api.mjs:500>) — Authenticated historical/new/concurrent/malformed/paid trial lifecycle regressions approved at Gate 1.
- [test-interface-errors.mjs](<C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\scripts\test-interface-errors.mjs:9>) — Typed trial_expired and exact English/Ukrainian copy regression.
- [test-free-trial-ai-ui.js](<C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\scripts\test-free-trial-ai-ui.js:490>) — Studio and Jeryk browser regression distinguishing trial expiration from provider failure.

## Red to green evidence

| Evidence | Before fix | After fix |
|---|---:|---:|
| Exit code | 1 | 0 |
| Timed out | False | False |
| Duration | 16,500 ms | 16,927.675 ms |
| Same command | — | True |
| Broader suite | — | passed |

### Before — failing evidence

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n+ actual - expected\n+ undefined\n- true\n at scripts/test-free-trial-ai-api.mjs:531\nHistorical trial billing did not expose pendingActivation and the unchanged backend derived expiration directly from the 2020 trialEndsAt before any provider call.
```

### After — fixed evidence

```text
Dzhero listening on http://127.0.0.1:60548
[FreeTrialActivation] {"workspaceId":"ws_trial","grantVersion":"2026-07-24-public-beta-ai-v1","startedAt":"2026-07-24T12:08:04.477Z","endsAt":"2026-07-27T12:08:04.477Z"}
[RemixEngine] Generating remixes for: Niche="Coffee shop", Product="", Location="", Tone=""
[RemixEngine] gemini/controlled-model accepted on attempt 1
[RemixEngine] Generating remixes for: Niche="Coffee shop", Product="", Location="", Tone=""
[RemixEngine] gemini/controlled-model accepted on attempt 1
[RemixEngine] Generating remixes for: Niche="Coffee shop", Product="", Location="", Tone=""
[RemixEngine] gemini/controlled-model accepted on attempt 1
[RemixEngine] Generating remixes for: Niche="Coffee shop", Product="", Location="", Tone=""
[RemixEngine] gemini/controlled-model accepted on attempt 1
[RemixEngine] Generating remixes for: Niche="Coffee shop", Product="", Location="", Tone=""
[RemixEngine] gemini/controlled-model accepted on attempt 1
[b7658615ff77] Error: daily_remix_limit_reached
    at reserveDailyTrialAction (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\services\dailyTrialQuota.cjs:146:24)
    at C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:2137:21
    at async C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:7791:22 {
  status: 402,
  payload: {
    error: 'daily_remix_limit_reached',
    usageKey: 'trial_remix_daily',
    limit: 5,
    used: 5,
    remaining: 0,
    period: '2026-07-24',
    resetsAt: '2026-07-24T21:00:00.000Z'
  }
}
[FreeTrialActivation] {"workspaceId":"ws_reset","grantVersion":"2026-07-24-public-beta-ai-v1","startedAt":"2026-07-24T12:08:04.618Z","endsAt":"2026-07-27T12:08:04.618Z"}
[RemixEngine] Generating remixes for: Niche="Coffee shop", Product="", Location="", Tone=""
[RemixEngine] gemini/controlled-model accepted on attempt 1
[FreeTrialActivation] {"workspaceId":"ws_failure","grantVersion":"2026-07-24-public-beta-ai-v1","startedAt":"2026-07-24T12:08:04.633Z","endsAt":"2026-07-27T12:08:04.633Z"}
[AgentChat] Error: ai_provider_failed
    at createAgentProviderError (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\services\agentEngine.js:13:17)
    at generateAgentReply (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\services\agentEngine.js:249:11)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:7556:20 {
  code: 'ai_provider_failed',
  status: 502,
  payload: {
    error: 'ai_provider_failed',
    message: 'AI provider request failed. Please try ag
... [output truncated] ...
Engine.js:212:13)
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:7069:25 {
  code: 'ai_provider_failed',
  status: 502,
  payload: {
    error: 'ai_provider_failed',
    message: 'AI adaptation failed. Please try again in a minute.'
  },
  cause: Error: Gemini API HTTP 500: {"error":{"message":"Controlled provider failure"}}
      at generateWithGemini (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\services\remixEngine.js:365:11)
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async generateValidatedProviderResult (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\services\remixEngine.js:287:16)
      at async generateRemix (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\services\remixEngine.js:202:14)
      at async C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:7069:25
}
[RemixEngine] Generating remixes for: Niche="Coffee shop", Product="", Location="", Tone=""
[RemixEngine] gemini/controlled-model accepted on attempt 1
[4f5181585806] Error: ai_provider_capacity_reached
    at reserveAiProviderAttempt (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:1991:29)
    at C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:2017:9
    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
    at async analyzeYouTubeVideoWithGemini (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:2993:7)
    at async Promise.all (index 0)
    at async enrichVideoIntelligence (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:3085:27)
    at async enrichVideoIntelligenceSafe (C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:3568:12)
    at async C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:7189:31 {
  status: 402,
  payload: {
    error: 'ai_provider_capacity_reached',
    limit: 250,
    period: '2026-07-24',
    resetsAt: '2026-07-24T21:00:00.000Z'
  },
  providerAttemptBlocked: true
}
[FreeTrialActivation] {"workspaceId":"ws_expired_pending","grantVersion":"2026-07-24-public-beta-ai-v1","startedAt":"2026-07-24T12:08:09.051Z","endsAt":
```

## Root cause

Entitlements derived expiration only from the historical trialEndsAt and had no versioned pending/activation state. The frontend error-code map omitted trial_expired, causing API helpers to use the ai_provider_failed fallback.

## Approved fix

Added a versioned, idempotent, fail-closed Free Trial lifecycle with lazy 72-hour activation inside the serialized AI reservation; preserved billing state and daily quota semantics; added typed localized trial_expired handling shared by both Jeryk surfaces.

**Why this is causal:** The lifecycle helper directly controls pending/active/expired state and persists the one-time boundary before provider work; the typed UI mapping prevents trial errors from entering the provider-failure fallback.

### Production files approved at Gate 2

- [freeTrialAccess.cjs](<C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\services\freeTrialAccess.cjs:1>) — Versioned 72-hour pending/active/expired lifecycle and fail-closed malformed state.
- [server.js](<C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\backend\server.js:1811>) — Pending subscription initialization and serialized first-use activation/persistence.
- [interfaceErrors.mjs](<C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\src\interfaceErrors.mjs:1>) — Typed trial_expired mapping.
- [uk.mjs](<C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\src\locales\uk.mjs:110>) — Dedicated Ukrainian trial-ended copy.
- [en.mjs](<C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\src\locales\en.mjs:110>) — Dedicated English trial-ended copy.
- [main.jsx](<C:\Users\Денис\Desktop\Всякое вайбкодинг\insta-producer-redesign-work\.worktrees\free-trial-lazy-ai-activation\src\main.jsx:132>) — Shared Jeryk error-state classification and typed API error preservation.

## Verification

| Check | Status | Evidence |
|---|---|---|
| Same API reproducer | ✅ passed | Exit code changed from 1 to 0 with all lifecycle assertions intact. |
| Canonical Free Trial suite | ✅ passed | Daily quota, API, interface-error, and Playwright regressions passed. |
| Public beta guards | ✅ passed | Shared-bank/discovery public-beta guards passed. |
| Production build | ✅ passed | Vite build passed with only the accepted existing bundle-size warning. |
| Whole-branch review | ✅ passed | Ready to merge; zero Critical, Important, or Minor findings. |

## Reproduce

```bash
node scripts/test-free-trial-ai-api.mjs
```
```bash
npm.cmd run test:free-trial-ai
```

## Limitations

- No Railway deployment or live historical-workspace Gemini smoke test was performed.
- Production state still uses the documented single-process serialized JSONB model.

## Residual risks

- After deployment, verify one historical pending_payment trial activates once, reaches Gemini, and retains the same trialEndsAt on a second action.
- Revisit atomic storage before running multiple application replicas.

## Notes

- No provider keys, prompts, payloads, .env files, dependencies, or backend/data/db.json were committed.
- Owner, tester, paid, Brand Brain, daily quotas, provider capacity, shared Signals, discovery, Agent Studio, and checkout behavior are covered or preserved.

---

Generated by `$bug-reproducer`. A fix is proven only by the same red-to-green reproducer plus relevant broader checks.
