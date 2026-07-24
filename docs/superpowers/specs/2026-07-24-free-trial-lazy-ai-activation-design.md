# Free Trial Lazy AI Activation Design

**Date:** 2026-07-24  
**Status:** Approved in conversation; awaiting written-spec review

## Problem

The July 24 Free Trial quota release added five successful Studio adaptations and
100 successful Jeryk replies per Kyiv calendar day, but it kept each existing
subscription's historical `trialEndsAt`.

The AI routes now enforce that historical value. An older Free Trial workspace
therefore receives `trial_expired` before Gemini is called, even though the
product launch is intended to give every Free Trial user a fresh three-day
opportunity to try AI generation.

The frontend also does not recognize `trial_expired`. It falls back to
`ai_provider_failed`, tells the user that Gemini failed, and marks Jeryk
`OFFLINE`. That message is false because no provider request was made.

## Product Contract

- Every workspace on the `trial` plan receives one grant for the current public
  Free Trial AI window.
- The three-day window starts when the workspace submits its first accepted
  quota-controlled AI action after this release:
  - a Studio adaptation; or
  - a Jeryk message.
- Activation gives exactly 72 hours of access.
- Activation is persisted before the provider call. A later provider failure
  does not restart or extend the 72-hour clock.
- Failed provider calls still do not consume the five successful Studio
  outcomes or 100 successful Jeryk replies.
- During the window, the existing quotas remain:
  - 5 successful Studio adaptations per Kyiv calendar day;
  - 100 successful Jeryk replies per Kyiv calendar day;
  - reset at 00:00 in `Europe/Kyiv`;
  - 250 provider attempts per workspace per Kyiv calendar day as a separate
    safety ceiling.
- After the persisted window expires, later AI actions return
  `trial_expired`. They must not create another grant.
- Paid, owner, tester, and demo access semantics do not change.
- Brand Brain does not activate this window and continues not to consume the
  Studio or Jeryk product quotas.

## Persistence Model

Use versioned fields on the existing subscription object:

- `aiTrialGrantVersion`: identifies the one-time public Free Trial grant;
- `aiTrialStartedAt`: timestamp of the first accepted Studio or Jeryk action;
- `trialEndsAt`: authoritative end timestamp after activation.

The application owns a single constant for the current grant version. A trial
subscription without that version is eligible for this one-time grant,
including historical subscriptions with an old `trialEndsAt`.

New trial subscriptions are created in a pending-activation state for the
current grant version: the version is present, `aiTrialStartedAt` is null, and
the three-day end is not calculated until the first eligible AI action.

Historical subscriptions are migrated lazily. On their first eligible AI
action, the backend assigns the current grant version, records the start, and
replaces the historical end with `start + 72 hours`. No bulk database migration
or edit to `backend/data/db.json` is required.

Once `aiTrialStartedAt` exists for the current grant version, neither a retry,
another action, a process restart, nor a later expiration may change the start
or end timestamps.

## Backend Flow

Add one focused helper that resolves the AI trial window for a subscription:

1. Ignore non-trial subscriptions and access that is already unlimited through
   owner or tester rules.
2. If the current version is already activated, return it unchanged.
3. If the current version is pending activation, or the historical
   subscription has no current-version marker, persist:
   - the current grant version;
   - `aiTrialStartedAt = now`;
   - `trialEndsAt = now + 72 hours`;
   - a `trialing` subscription status;
   - matching period timestamps and `updatedAt`.
4. Rebuild entitlements from the updated subscription.

Run activation inside the existing serialized state-mutation boundary used by
`reserveSerializedDailyAiAction`, before checking trial expiration or reserving
the daily outcome. This keeps activation and quota reservation in one ordered
write for the current single-process PostgreSQL JSONB/local JSON storage model.

Provider-attempt guards run after the daily action reservation and therefore
observe the persisted active window. They retain their separate 250-attempt
limit.

`buildEntitlements` must distinguish:

- `pendingActivation`: the current grant is available but has not started;
- `active`: the grant has started and its end is in the future;
- `expired`: the current grant has started and its end is in the past.

An old `trialEndsAt` must not make a current-version, not-yet-activated grant
appear expired. Billing output for pending activation exposes the full three
days available without inventing an end timestamp.

## Frontend Behavior

Add `trial_expired` to the typed interface-error mapping with complete English
and Ukrainian copy.

For Studio and Jeryk:

- `trial_expired` explains that the three-day Free Trial ended;
- it does not mention Gemini;
- it does not set provider state to `OFFLINE`;
- Jeryk shows a trial/limit state rather than a provider outage;
- real provider failures remain the only errors that produce `OFFLINE`.

Before activation, billing may describe the entitlement as three days available
from the first AI generation. After activation, it uses the persisted end time
and remaining-day calculation.

## Error and Concurrency Rules

- Activation is idempotent for a subscription and grant version.
- Two near-simultaneous first actions must observe the same persisted start and
  end timestamps.
- A request rejected before the quota-controlled AI reservation, such as
  invalid input or unauthorized workspace access, does not activate the window.
- A request accepted into the quota-controlled AI flow activates the window
  even if Gemini later fails.
- Provider failure releases the successful-outcome reservation according to the
  existing quota logic, but it does not roll back trial activation.
- An already activated and expired grant returns HTTP 402
  `trial_expired` before any provider call.

## Test Contract

API regressions must prove:

1. A historical expired trial without the current grant marker succeeds on its
   first valid Jeryk or Studio action and receives a persisted 72-hour window.
2. A new pending-activation trial receives the same window on its first valid
   action.
3. A second action does not change either activation timestamp.
4. An activated expired trial returns HTTP 402 `trial_expired` and never calls
   the provider.
5. A provider failure after activation keeps the activation timestamps but
   releases the successful-outcome quota reservation.
6. Existing 5/100 daily quotas, Kyiv resets, provider-attempt limits, and
   paid/owner/tester behavior remain unchanged.

Frontend regressions must prove:

1. `trial_expired` maps to dedicated localized copy.
2. Studio displays that copy instead of a Gemini failure.
3. Jeryk does not display `OFFLINE` for `trial_expired`.
4. Actual provider failures still display `OFFLINE`.

## Rollout and Observability

The change needs no bulk migration. Production subscriptions update lazily
through the normal persisted application state when their first eligible action
arrives.

Logs should distinguish trial activation from provider failures without logging
tokens, prompts, or provider payloads. A compact event containing workspace ID,
grant version, start, and end is sufficient.

After deployment, verify with one historical Free Trial workspace:

1. its first Jeryk message or Studio generation reaches Gemini;
2. billing reports the new three-day window;
3. a repeated request does not move the end timestamp;
4. provider errors and trial errors remain visibly distinct.

## Non-Goals

- No recurring or user-triggered trial reset.
- No bulk rewrite of production subscriptions.
- No change to paid checkout, discovery access, Agent Studio availability, or
  Brand Brain quota policy.
- No change to the shared Signals bank policy.
