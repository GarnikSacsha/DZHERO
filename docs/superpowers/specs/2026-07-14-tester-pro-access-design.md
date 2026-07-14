# Tester Pro Access Design

**Date:** 2026-07-14
**Status:** Approved design

## Goal

Let anyone sign in to Dzhero with Google while giving selected testers a useful, PRO-like allowance that cannot become owner unlimited access or create uncontrolled Gemini and Apify costs.

The owner must be able to add a tester's Google email before that person first signs in, review usage, and revoke the elevated allowance manually without a deployment.

## Product rules

- The landing page offers Google sign-in only. The passwordless email trial form and `POST /api/auth/email` are removed.
- Google sign-in stays open to everyone.
- A normal new Google user receives the existing three-day trial.
- An active tester grant overlays the user's base subscription with the `tester_pro` plan.
- Owner unlimited access always has higher priority than a tester grant and remains unchanged.
- Tester grants do not expire automatically. The owner revokes them manually.
- Revoking a grant immediately removes the overlay and exposes the user's unchanged base subscription. An expired base trial therefore remains expired.

Entitlement priority is:

```text
owner unlimited -> active tester grant -> base subscription
```

## Owner experience

An owner-only `Testers` section is added to Settings.

The section contains:

- an email field and `Grant Tester Pro` action;
- pending testers who have not signed in yet;
- active testers linked to a workspace;
- current monthly AI and import usage;
- today's automatic Apify spend and latest discovery result;
- last Google sign-in time;
- a `Revoke` action with confirmation.

The owner can add an email before the tester's first login. Email matching is normalized with trimming and lowercase comparison.

The frontend hides the section from other users, but the backend independently authorizes every owner-management request. Owner access is granted only to an authenticated admin or a user already recognized by the existing owner-unlimited rule. The browser never receives or stores `ADMIN_TOKEN`.

## Tester grant storage

Add a dedicated `testerAccessGrants` collection/table instead of mutating the tester's subscription.

Each grant stores:

- stable grant ID;
- normalized email;
- state: `pending`, `active`, or `revoked`;
- plan ID: `tester_pro`;
- linked user and workspace IDs when available;
- grant, activation, revocation, and update timestamps;
- granting owner user ID;
- optional note.

Only one grant record may exist per normalized email. Re-granting a revoked email reactivates that record, clears its revocation timestamp, and records new grant and update timestamps.

After Google OAuth resolves a verified email, the backend links any pending grant to the user and workspace. Entitlement resolution can also match an active grant by normalized email so a transient linking failure does not remove approved access.

`backend/data/db.json` remains local runtime data and is not committed.

## Owner API

Add session-authenticated owner routes:

```text
GET    /api/owner/testers
POST   /api/owner/testers
DELETE /api/owner/testers/:grantId
```

`POST` accepts a Google email and optional note. It creates a pending grant or activates it immediately when the user already exists.

`GET` returns only public tester data, effective plan, usage, discovery spend, and status. It does not return password hashes, OAuth subjects, tokens, or other workspace content.

`DELETE` revokes the grant immediately. Existing admin-token tester endpoints may remain for operational compatibility, but they must not grant `agency` by default to product testers or bypass the same plan rules.

## Tester Pro plan

Add a non-purchasable internal `tester_pro` plan:

| Allowance | Limit |
| --- | ---: |
| Paid AI operations | 50 per calendar month |
| Manual/imported signals | 30 per calendar month |
| Maximum manual import batch | 5 per request |
| Competitors | 5 |
| Workspaces | 1 |
| Team members | 1 |
| Instagram accounts | 1 |
| Brand Brain saves | 10 per calendar month |
| Content plan posts | 50 |

The plan is internal and does not appear as a purchasable billing option.

## Unified paid-AI metering

Add an `aiOperations` usage metric. It covers real paid provider attempts, including:

- assistant chat;
- Studio remix and regenerate;
- Gemini text generation;
- Gemini video understanding;
- other authenticated provider-backed AI work added to these flows.

Purely local transformations do not consume the metric.

The backend reserves and persists usage before dispatching a paid provider request. A provider failure remains charged because the upstream request may already have incurred cost. The 51st monthly Tester Pro operation is rejected before any provider call.

Composite operations reserve the number of provider attempts they can trigger. Batch video analysis cannot use a single allowance unit to fan out into many Gemini calls.

The same guard is added to normal trial paths so open Google registration cannot reach an unmetered Studio or video-analysis endpoint. Existing paid plans receive explicit `aiOperations` allowances consistent with their current product limits, while owner unlimited remains unlimited.

## Apify access and daily discovery

Apify remains available to Tester Pro users.

### Manual discovery

- Manual Instagram and TikTok import shares the 30-signal monthly import allowance.
- Each request may ask for at most five results.
- Duplicate cached signals do not consume another import unit.

### Automatic discovery

- Automatic discovery is enabled.
- The system targets up to ten new unique reels per UTC day per tester workspace.
- The target starts with up to five Instagram and five TikTok results.
- If one platform returns too few usable unique results, the other may fill the remaining target while the same daily budget is respected.
- Empty provider results, filtering, and duplicates can produce fewer than ten accepted reels; the UI must not claim a guaranteed ten.
- The hard automatic Apify budget is USD 0.40 per tester workspace per UTC day.
- At most one automatic execution may consume the tester budget each day. A scheduled run and `Run now` share the same daily allowance.
- The user cannot raise the Tester Pro budget above USD 0.40 through Settings or a direct API request.
- Forced/manual automatic runs must perform the same preflight reservation as scheduled runs. They cannot bypass the daily budget.
- Run records continue to store estimated/actual spend, returned count, accepted count, duplicates, and errors.

The owner page shows today's spend and accepted-signal count for each tester.

## Public Brand Scan protection

The unauthenticated landing-page Brand Scan remains available.

Keep the existing per-IP daily limiter and add a persistent platform-wide cap of 20 paid preview attempts per UTC day. The platform-wide attempt is reserved before Apify or Gemini is called. Once exhausted, the preview returns a friendly limit message and invites the visitor to sign in with Google.

The cap is configurable through an environment variable, but production defaults to 20. It is separate from a signed-in user's plan usage.

## UI behavior

- Remove the email label, field, button, divider copy, state, handler, and related translations from the landing page.
- Keep the Google button visually primary.
- Do not show a dead email option when the backend route is unavailable.
- Settings shows `Tester Pro` and remaining allowances to an active tester.
- Limit messages name the exhausted allowance and remaining/reset context without exposing provider or server internals.
- Automatic discovery copy says `up to 10 new signals daily`, not a guaranteed result count.
- The owner Testers section clearly distinguishes pending, active, and revoked states.

## Error handling

- Invalid owner email: `400 valid_email_required`.
- Non-owner management request: `403 owner_access_required`.
- Duplicate active grant: return the existing grant idempotently.
- Revoking a missing grant: `404 tester_grant_not_found`.
- Monthly plan allowance exhausted: `402 plan_limit_reached` with metric, used, limit, and remaining values.
- Daily Apify budget exhausted: `429 automatic_budget_reached` without calling Apify.
- Public preview global cap exhausted: `429 preview_global_daily_limit_reached` without calling Apify or Gemini.
- Provider failure: preserve the reserved attempt, record a safe error, and avoid leaking provider credentials or raw internal responses.

## Security

- Google OAuth email must be verified before it can activate a tester grant.
- Email matching is case-insensitive and whitespace-normalized.
- Owner APIs require both an authenticated session and server-side owner authorization.
- Tester plan data never changes `role` to `admin` and never adds the email to `UNLIMITED_ACCESS_EMAILS`.
- Workspace access remains isolated per user.
- Direct API calls receive the same plan, batch, AI, and Apify checks as the UI.

## Verification

Automated coverage must verify:

- the landing page contains no email sign-in control and `POST /api/auth/email` is unavailable;
- Google registration remains open and creates the normal trial;
- only owner/admin sessions can list, grant, and revoke tester access;
- a grant can be created before first login and activates on matching verified Google email;
- email matching is case-insensitive;
- owner unlimited is not downgraded by a tester grant;
- revocation immediately falls back to the unchanged base subscription;
- the 51st Tester Pro AI operation is rejected before provider dispatch;
- provider-backed batch work reserves every possible paid attempt;
- the 31st monthly imported signal and import batches above five are blocked or capped;
- duplicate imports do not consume another import unit;
- automatic discovery targets up to ten unique daily signals and cannot exceed USD 0.40;
- scheduled and forced runs share one daily Apify budget and forced runs cannot bypass it;
- Tester Pro cannot increase its automatic-discovery budget above USD 0.40;
- the public preview platform cap blocks provider calls after 20 attempts;
- owner list responses omit sensitive authentication data.

Run focused tests, existing auth/usage/discovery regression scripts, backend syntax checks, and `npm.cmd run build` before completion.

## Out of scope

- Sending invitation emails from Dzhero. The owner shares access instructions externally; the grant is keyed to the tester's Google email.
- Paid checkout or subscription changes.
- Multiple tester workspaces or team collaboration.
- A permanent production cost-ledger or provider invoice reconciliation system.
