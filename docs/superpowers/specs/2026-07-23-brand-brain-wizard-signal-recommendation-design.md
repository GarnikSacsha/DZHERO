# Brand Brain Wizard and Best-Signal Recommendation Design

**Date:** 2026-07-23
**Status:** User-approved design, pending written-spec review
**Branch:** `main`

## Goal

Replace the current multi-field Brand Brain form with a four-step, user-authored onboarding wizard. The user supplies only the facts they know directly. DZHERO derives internal strategy fields and recommends one existing signal from the accessible signal bank.

The onboarding gate remains strict: until the four required user-authored answers are complete, product navigation stays locked. After completion, Brand Brain is available only under `Settings -> My Brands`.

## Product decisions

- Authentication is not counted as a wizard step.
- The wizard has exactly four steps:
  1. profile and product description;
  2. target audience;
  3. niche and market;
  4. optional Instagram account.
- Required answers are:
  - `profileDescription`;
  - `audience`;
  - `niche`;
  - `market`.
- `instagramUrl` is optional and the fourth step always offers **Skip**.
- Users do not enter or edit `offer`, `cta`, or `toneOfVoice`.
- AI-derived fields never replace the user's authored answers.
- After first completion, one real signal is selected and opened automatically.
- Signals remains a primary product destination after onboarding.
- Brand Brain/My Brands has no permanent primary-sidebar item and lives only in Settings after onboarding.

## User experience

### First login

After authentication, the app loads the active workspace's Brand Brain status before rendering product navigation.

If the workspace is incomplete, it renders a focused wizard and disables Signals, Studio, Content Plan, Settings, and other product destinations. Logout, language selection, and necessary account controls remain available.

Each step contains:

- a clear title and one-sentence explanation;
- progress text such as `2 of 4`;
- Back and Continue controls where applicable;
- inline validation;
- persisted draft state so refresh or sign-in continuation returns to the same step.

### Step 1: Profile and product

One substantial textarea asks the user to describe:

- what the profile or brand does;
- what product, service, or content it provides;
- the concrete outcome it creates.

The UI does not attempt to split this answer into multiple required fields.

### Step 2: Target audience

One substantial textarea asks the user to describe:

- who the content is for;
- their situation, needs, or pain points;
- why they would pay attention.

### Step 3: Niche and market

This step contains two required inputs:

- niche;
- market/geography.

Market may be a country, language market, city, or broader commercial market.

### Step 4: Instagram

The user may paste one Instagram profile URL for additional verified context. The field is optional and provides a **Skip** action.

Instagram analysis:

- never blocks completion;
- never overwrites user-authored answers;
- retains only verified metadata and source links;
- may improve the derived brief and signal selection.

### Completion

The Finish action:

1. validates the four required answers;
2. saves the completed Brand Brain;
3. produces internal derived context;
4. selects one existing signal;
5. unlocks the product;
6. opens the selected signal using the existing preview modal and media-recovery behavior.

The user does not see a generic Signals list before the recommendation result.

### Later visits and edits

After completion:

- the internal onboarding route is not exposed as a destination;
- `Settings -> My Brands` shows a locked card;
- the card displays only user-authored facts, optional Instagram, and source evidence;
- a pencil opens a compact edit form for the same four required answers and optional Instagram;
- Save recalculates derived context and the recommendation;
- editing does not forcibly navigate away from Settings;
- a newly calculated recommendation is available through a clear `Open recommended signal` action.

The card does not show editable offer, CTA, or tone-of-voice fields.

## Data model

### Version 2 authored answers

```js
{
  schemaVersion: 2,
  answers: {
    profileDescription: string,
    audience: string,
    niche: string,
    market: string,
    instagramUrl: string
  },
  sourceLinks: string[],
  derivedBrief: {
    summary: string,
    offer: string,
    cta: string,
    toneOfVoice: string,
    evidenceByField: object
  },
  recommendation: {
    signalId: string,
    reason: string,
    selectionMode: "gemini" | "deterministic",
    briefFingerprint: string,
    createdAt: string
  }
}
```

`instagramUrl` may be empty. `recommendation` may be absent only when the accessible signal bank is empty.

### Draft state

Incomplete wizard state is stored separately from the completed `brief`, for example:

```js
workspace.brandBrainDraft = {
  currentStep: 1,
  answers: {
    profileDescription: "",
    audience: "",
    niche: "",
    market: "",
    instagramUrl: ""
  },
  updatedAt: ""
}
```

Saving a draft never marks the Brand Brain complete and never unlocks navigation.

The local JSON and PostgreSQL implementations already persist the application as a workspace state document, so this addition does not require a relational database migration.

### Compatibility shape

Existing consumers that still read flat Brand Brain fields receive a compatibility projection:

- `product <- answers.profileDescription`;
- `audience <- answers.audience`;
- `businessType <- answers.niche`;
- `location/market <- answers.market`;
- `offer`, `cta`, and `toneOfVoice <- derivedBrief`.

User answers remain the source of truth and are never reconstructed from the derived fields after Version 2 has been saved.

### Legacy workspaces

Existing complete legacy briefs remain complete and are not forced back into onboarding.

When possible, the compatibility layer maps:

- `product` to `profileDescription`;
- `audience` to `audience`;
- `businessType` to `niche`;
- `market` or `location` to `market`.

If a legacy brief lacks a Version 2 answer, the locked card remains readable. On the next explicit edit, the user supplies any missing Version 2 required answer before saving the upgraded brief.

## API boundaries

### Read context

The workspace context response exposes:

- completion status;
- completed authored answers;
- derived brief;
- saved recommendation;
- resumable draft and current step when incomplete.

### Save draft

A dedicated authenticated, workspace-scoped draft endpoint accepts partial answers and `currentStep`.

It:

- normalizes text and the optional Instagram URL;
- never writes the completed brief;
- never changes completion status;
- returns the canonical draft.

### Finalize

A dedicated authenticated, workspace-scoped finalize endpoint:

1. validates all four required authored answers;
2. canonicalizes the optional Instagram URL;
3. fetches verified Instagram metadata when available;
4. generates the derived brief with grounded evidence;
5. ranks accessible signals;
6. persists the Version 2 brief and recommendation;
7. clears the onboarding draft;
8. returns the canonical brief and selected signal.

The endpoint is idempotent for the same normalized answer fingerprint so repeated clicks do not create duplicate provider work.

### Edit completed answers

Settings edits use the same validation, derivation, and recommendation pipeline as first completion. They do not expose a separate weaker write route.

## Derived Brand Brain

Gemini receives:

- the four user-authored answers;
- sanitized verified Instagram metadata when available;
- no raw private payloads;
- no unsupported statistics as business facts.

The model returns a structured derived brief with evidence references.

Rules:

- authored answers are copied verbatim after normalization;
- unsupported derived fields remain empty;
- evidence snippets must exist in admissible source material;
- URLs, handles, social counters, and platform boilerplate cannot serve as business facts;
- derived fields are internal context, not completion requirements.

If Gemini derivation fails, finalization still succeeds. The fallback derived brief contains a safe normalized summary of the authored answers and leaves unsupported offer, CTA, and tone fields empty. Signal selection can proceed from the authored answers alone.

## Hybrid signal selection

### Candidate set

The selector uses the signals available to the active workspace, including the shared read-only bank used by public-beta workspaces.

Every returned recommendation must reference an existing accessible signal ID.

### Stage 1: Deterministic ranking

All available signals are scored against:

- profile/product description;
- audience;
- niche;
- market;
- verified Instagram context when present;
- signal title, caption, tags, market, platform, and existing quality/performance score.

The deterministic scorer returns a bounded shortlist. Tie-breaking is stable so the fallback result is repeatable.

### Stage 2: Gemini reranking

Gemini receives the normalized Brand Brain and compact metadata for the shortlist. It returns:

```js
{
  signalId: string,
  reason: string
}
```

The backend accepts the result only if `signalId` belongs to the shortlist and the active workspace can access it.

### Fallback behavior

If Gemini times out, fails, or returns an invalid signal ID, the server selects the first deterministic result.

The user therefore receives one real signal without seeing an AI-provider error. A visible empty state occurs only when the accessible bank contains no signals.

The saved recommendation records whether selection used Gemini or the deterministic fallback for internal diagnostics; this provider detail does not need to interrupt the user flow.

## Navigation and state

- Root completion status is derived from persisted Version 2 authored answers or grandfathered legacy completeness.
- Draft state never unlocks navigation.
- Incomplete workspaces remain on the internal onboarding surface.
- Successful finalization updates root context before navigating or opening the signal.
- Stale requests are rejected by workspace ID, request generation, and answer fingerprint.
- Switching workspace or logging out immediately locks and invalidates the previous context.
- Completed workspaces cannot navigate back to onboarding through a sidebar or topbar action.

## Error handling

- Missing required answer: inline field error; no finalize request.
- Draft save failure: keep local input, show a retryable draft-status notice, do not unlock.
- Invalid Instagram URL: inline correction or Skip.
- Instagram provider failure: continue without Instagram enrichment.
- Gemini derived-brief failure: use the grounded authored-answer fallback.
- Gemini signal-selection failure or invalid ID: use deterministic top result.
- Signal media failure: use the existing poster/neutral preview and original-link escape hatch.
- Empty signal bank: save and unlock Brand Brain, then show an honest empty-bank state.

## Security and cost controls

- All endpoints are authenticated and workspace-scoped.
- Only the accessible signal bank can be ranked or returned.
- Instagram URL normalization is HTTP(S)-only and server-side.
- Provider prompts exclude secrets, raw provider payloads, and unsupported identifiers.
- Deterministic ranking bounds the Gemini candidate list and provider cost.
- Answer fingerprints make finalization retry-safe.
- Existing public-beta discovery restrictions remain unchanged.

## Testing strategy

### Pure contract tests

- exactly four required authored answers;
- Instagram optional;
- legacy completion remains readable;
- compatibility projection is stable;
- draft never counts as complete.

### API tests

- draft save/resume and canonicalization;
- finalization rejects missing authored answers without mutation;
- optional Instagram success/failure;
- derived Gemini success and grounded fallback;
- deterministic ranking across all accessible signals;
- valid Gemini selection;
- invalid/timeout Gemini selection falls back deterministically;
- selected signal must exist and be workspace-accessible;
- empty-bank behavior;
- finalization idempotency;
- completed edit recalculates recommendation.

### Browser tests

- first login starts at step 1;
- progress, Back, Continue, validation, refresh resume, and Instagram Skip;
- all product navigation remains disabled before completion;
- completion opens exactly one real signal;
- media failure still uses preview fallback;
- Brand Brain has no primary-sidebar item after completion;
- Settings contains the locked My Brands card;
- Settings edit exposes only the four authored fields plus optional Instagram;
- Save recalculates without forcibly leaving Settings;
- logout and workspace switching cannot leak completion or drafts.

### Regression suites

Continue running Brand Brain extraction/persistence, public-beta, Signals provider/discovery, rendered i18n, interface errors, server syntax, and the production build.

## Non-goals

- Publishing content automatically.
- Replacing the full Signals bank with a permanent single-video-only product.
- Asking the user to author offer, CTA, or tone of voice.
- Making Instagram mandatory.
- Adding a relational database migration.
- Showing provider errors when a deterministic recommendation is available.
