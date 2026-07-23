# My Brands Onboarding and Signal Preview Design

## Goal

Make brand memory a one-time, factual onboarding step and make every saved signal preview fail gracefully instead of showing a black player.

All work is limited to `main`. The `hackathon/openai-build-week` branch and `backend/data/db.json` are out of scope.

## Product Contract

### First login

An authenticated workspace without a complete saved brand profile opens the existing brand-memory start page immediately. The existing “Start here once” hint remains visible.

The rest of the product navigation is disabled until the required brand fields are complete and saved. The required fields are:

- business type / niche;
- product;
- audience;
- offer;
- CTA;
- tone of voice.

Location, proof, stop topics, content pillars, and discovery keywords remain optional. Missing optional facts must not block onboarding.

The user can paste one or more Instagram, TikTok, YouTube, or website links plus a short niche description. Parsed source links are saved with the brand profile. Analysis may prepare a draft, but the user reviews any missing required fields before saving.

### After the first save

Saving a complete profile immediately:

- persists the brand profile and its source links;
- switches the onboarding form to a locked brand card;
- unlocks product navigation;
- keeps the existing next-step action to continue to Signals.

On later logins, a complete workspace opens the normal product rather than the onboarding page. Brand memory has no permanent standalone sidebar item.

### Permanent location

The permanent entry point is `Settings -> My Brands`.

A saved brand renders as a read-only card. It must not use disabled inputs or textareas. A single pencil action switches the card into edit mode. Edit mode provides:

- the current values in editable fields;
- `Save changes`;
- `Cancel`.

Saving returns to the locked card. Cancel discards unsaved changes and returns to the locked card.

“My Brands” is the user-facing product name. Existing internal service and prompt names may continue using “Brand Brain” where renaming would add risk without changing the experience.

## Factual Extraction

Brand extraction is evidence-first.

Instagram boilerplate such as follower/following/post counts, login copy, “See Instagram photos and videos”, handles, and raw profile URLs must never become the product, audience, offer, or CTA.

The deterministic fallback may keep only directly supported facts:

- handle or explicit brand name;
- follower and post counts as proof;
- products, locations, calls to action, and business categories supported by public metadata or collected captions;
- source-derived keywords and content pillars.

It must not generate a generic audience, offer, CTA, tone of voice, or “local business” category when the source does not support them. Unsupported fields remain empty and are returned in `missingFields`.

Gemini extraction must return evidence for populated fields. Evidence snippets are checked against the supplied metadata and collected captions. A field without source-backed evidence is discarded and reported as missing. This rule applies even when the model returns syntactically valid JSON.

If source analysis fails, the UI keeps the user’s input and existing saved values, reports the failure, and does not replace fields with generic copy.

## State and Data Flow

The application loads `/workspaces/:workspaceId/agent/context` once for the active workspace and derives an onboarding state from the stored brief:

1. `loading` — workspace context is not known yet;
2. `onboarding` — one or more required fields are missing;
3. `saved` — all required fields are persisted;
4. `editing` — the user explicitly opened a saved card for editing.

The root page guard owns navigation locking. Component-local state must not be the source of truth for completion. `localStorage` may remember the selected Settings tab, but it must not decide whether onboarding is complete.

After a successful save, the server response updates the root context immediately. A workspace switch reloads context and independently evaluates that workspace.

Saved `sourceLinks` are normalized as a deduplicated list of HTTP(S) URLs and included in the agent’s normalized Brand Brain context. Existing profiles without `sourceLinks` remain valid.

## Signal Preview

Preview selection follows this order:

1. A real YouTube signal uses the existing YouTube embed URL.
2. Instagram, TikTok, and other direct playable media use the HTML video player.
3. If direct media emits a load or playback error, the modal removes the failed player and shows the saved poster.
4. If no poster exists, the modal shows the existing neutral preview frame.
5. The original source link remains available in every fallback state.

Media failure state is scoped to the selected signal and resets when a different preview opens. An expired provider URL must never leave a permanent black player.

## Error Handling

- An incomplete profile cannot be saved; the UI identifies the missing required fields.
- A scan failure preserves user-entered links, niche text, and previously saved values.
- A save failure leaves edit mode open and does not mark onboarding complete.
- A failed preview silently switches to the poster/original-link fallback without retry loops.
- An unavailable YouTube embed keeps the original-link escape hatch.

## Implementation Boundaries

Expected production changes:

- `backend/services/brandBrainExtractor.cjs`;
- `backend/services/brandBrainContext.cjs`;
- `src/brandBrain.mjs`;
- new `src/myBrandsState.mjs`;
- `src/main.jsx`;
- `src/styles.css`.

No database migration is required because workspace briefs are stored as extensible JSON objects.

## Verification

The approved regression tests must go red-to-green without weakening their assertions:

- `node scripts/test-brand-brain-extractor.js`;
- `node scripts/test-my-brands-ui.mjs`;
- `node scripts/test-signal-preview-ui.mjs`.

Broader verification includes the existing Brand Brain tests, Brand Brain persistence tests, public-beta guards, i18n checks, backend syntax check, and production build.

Manual visual verification covers:

- empty first-login onboarding with locked navigation;
- successful save changing the form into a locked card;
- `Settings -> My Brands` card, pencil, cancel, and save flows;
- Instagram metadata that previously polluted product/audience/offer fields;
- expired TikTok/Instagram media fallback;
- YouTube embed preview.
