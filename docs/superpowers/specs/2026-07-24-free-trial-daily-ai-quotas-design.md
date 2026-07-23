# Free Trial Daily AI Quotas

## Goal

Make the three-day Free Trial usable as a real product trial without allowing internal Gemini retries to consume the user's visible allowance.

A trial user must be able to:

- complete Brand Brain and receive the initial signal;
- generate five successful Studio adaptations per Kyiv calendar day;
- receive one hundred successful Jeryk replies per Kyiv calendar day;
- return on the next trial day and receive a fresh daily allowance;
- distinguish a real Gemini result from a local draft or an unavailable provider.

## Product limits

The Free Trial lasts three days and has these daily limits:

| Action | Daily allowance | Three-day maximum |
| --- | ---: | ---: |
| Successful Studio adaptations | 5 | 15 |
| Successful Jeryk replies | 100 | 300 |

The daily period resets at `00:00` in `Europe/Kyiv`.

Brand Brain onboarding and saving do not consume either daily allowance. Existing limits for unrelated product actions remain unchanged unless the implementation requires a narrowly scoped compatibility update.

Owner-unlimited and active tester access continue to use their existing entitlements and are not restricted by the Free Trial daily limits.

## Usage model

Product outcomes and provider attempts are separate concepts.

### Product outcomes

A Studio adaptation is counted only after the backend has received and validated a real provider result.

A Jeryk message is counted only after the backend has received a usable real provider reply.

Provider errors, invalid responses, timeouts, and internal retries do not consume a successful user action.

To prevent concurrent requests from exceeding a daily allowance, the backend atomically reserves one product slot before generation. It confirms the reservation on success and releases it on failure.

### Provider attempts

Gemini calls and bounded retries remain tracked internally for cost and abuse protection. They must not be presented as the user's adaptation or chat allowance.

The internal Free Trial provider-attempt ceiling is 250 attempts per Kyiv calendar day. This supports the promised product actions, bounded retries, and Brand Brain enrichment without becoming the normal user-facing blocker. It remains a safety mechanism rather than the primary product quota.

## Real-provider requirement

Production Studio adaptation and Jeryk chat are fail-closed:

- a successful AI result must identify a real configured provider;
- a missing provider configuration returns a typed configuration error;
- a provider failure returns a typed provider error;
- a daily product limit returns a typed daily-limit error with the next reset time;
- a deterministic local template is never labelled or displayed as a successful AI generation.

Local deterministic drafts may remain available as clearly labelled non-AI drafts. They must not unlock success telemetry, consume a successful daily action, or display a provider-success badge.

Brand Brain is different because it is mandatory onboarding. User-entered answers must always be saved without invention. Gemini enrichment and recommendation ranking are attempted when available. If enrichment is unavailable, onboarding completes from the exact user answers and any non-AI recommendation is explicitly identified as a basic selection rather than an AI result.

## API behavior

Authenticated workspace responses expose the current daily usage needed by the UI:

- successful Studio adaptations used and remaining today;
- successful Jeryk replies used and remaining today;
- the next Kyiv reset timestamp;
- whether the returned generation used a real provider.

Daily-limit and provider errors use these stable machine-readable codes:

- `daily_remix_limit_reached`;
- `daily_agent_chat_limit_reached`;
- `ai_provider_not_configured`;
- `ai_provider_failed`.

Provider-attempt exhaustion, if ever reached, returns a distinct internal-capacity error and must not masquerade as `OFFLINE` or as a successful local generation.

## Interface behavior

Studio shows a compact daily remainder such as `Адаптації сьогодні: 4/5`.

Jeryk shows a compact daily remainder such as `Повідомлення сьогодні: 87/100`.

The interface updates the displayed counters only after a successful response.

`OFFLINE` is reserved for a confirmed unavailable or unconfigured provider. A daily quota displays a quota-specific state and next reset time. Other typed errors receive specific localized Ukrainian and English copy.

After a failed Studio request, any existing local scenario remains visibly labelled as a draft. The screen must not show `Готова структура` or another success label that implies Gemini completed the request.

## Data and compatibility

Daily counters use a Kyiv-local date key so monthly counters and existing billing periods are not overloaded.

Existing historical counters remain valid. No migration of local `backend/data/db.json` runtime data is required, and that file must not be committed.

The implementation stays on `main` and does not modify the hackathon worktree or branch.

## Verification

Tests must first reproduce the current defects:

1. internal provider attempts can exhaust the old shared limit before the promised trial workflow completes;
2. Remix wraps a usage denial as a provider failure;
3. Jeryk labels every request failure as `OFFLINE`;
4. Studio leaves a deterministic draft under a success-looking heading after AI failure.

The completed implementation must prove:

- five Studio successes are allowed in one Kyiv day and the sixth is rejected;
- the allowance resets on the next Kyiv day;
- one hundred Jeryk successes are allowed in one Kyiv day and the 101st is rejected;
- failed provider calls release product reservations;
- provider retries do not consume extra product actions;
- Brand Brain completion consumes neither daily allowance;
- owner/tester access remains unchanged;
- missing or failed providers never produce a falsely labelled AI result;
- Ukrainian and English errors identify daily quota, provider configuration, and provider failure separately;
- the production build and focused API/browser regression suites pass.
