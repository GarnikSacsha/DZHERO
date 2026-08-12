# DZHERO product and technical context

Last updated: **2026-08-12**

## Product position

DZHERO is an AI producer for small businesses, creators, SMM specialists, and
multi-brand teams. It turns observed short-form signals into grounded,
brand-specific production decisions and shoot-ready scenarios. It is not a
saved-Reels gallery, a blank chatbot, or a metadata-only analytics dashboard.

Ukraine is the primary adaptation market. Final creative is localized to the
workspace's language, audience, offer, and constraints rather than copied from
the source.

## Active surface and runtime

Only the redesign is active product scope:

```text
Local frontend:  http://127.0.0.1:5180/?preview=product&tab=discover
Local backend:   http://127.0.0.1:3000/
Staging frontend: https://frontend-staging-c899.up.railway.app/
Staging backend:  https://backend-staging-470a.up.railway.app
Staging health:   https://backend-staging-470a.up.railway.app/api/health
Proxy health:     https://frontend-staging-c899.up.railway.app/api/health
```

The legacy dashboard, main domain, and Build Week deployment remain in the
repository but are out of scope for current product work.

## Architecture

- React 19 and Vite 8 provide the redesign UI.
- Express 5 owns authentication, workspace APIs, billing gates, provider
  orchestration, error classification, persistence, and safe serialization.
- The staging frontend server proxies same-origin `/api/*` requests to the
  backend service.
- PostgreSQL stores staging state. Local development falls back to
  `backend/data/db.json` when `DATABASE_URL` is absent.
- Gemini provides grounded video understanding.
- Apify-backed services support existing discovery/source workflows, but the
  personal public-video grounding layer does not add a downloader.

## Authentication contract

Deployed browser authentication is same-origin:

```text
browser -> staging frontend /api/* proxy -> staging backend
Google -> staging frontend /api/auth/callback/google -> backend proxy
```

`CLIENT_URL` is the frontend origin only (no callback path). The Google redirect
URI is the full frontend-origin callback. This separation is required for CORS,
logout, safe OAuth destinations, and mobile Safari session behavior. The owner
manually verified logout, repeat login, and iPhone login on staging on
2026-08-12.

Configuration values and secrets belong in Railway/backend environment state,
not in this repository.

## Signal architecture

```text
Brand Brain
-> source/channel selection
-> metadata normalization and B-soft ranking
-> at most one Gemini analysis
-> Signal Filter v3.1
-> Verified Signal Bank
-> Brand Match
-> Collection / Studio
```

Channel Filter, metadata ranking, Signal Filter, and Brand Match have separate
responsibilities. Signal Filter v3.1 and `maxVideoAnalysesPerRun=1` are frozen.
The permanent Discovery contract lives in
`docs/agent-context/DISCOVERY-VERIFICATION.md`.

## Personal public-video architecture

`backend/services/publicVideoGrounding.cjs` is the platform capability and
grounded-evidence boundary for personal saved URLs.

```text
public URL
-> platform capability check
-> supported official acquisition path
-> Gemini Interactions structured evidence
-> normalized sourceContext
-> Overview / Transcript / Deep Analysis
-> retained three adaptations
-> structured Script Editor scenario
```

- **YouTube:** supported through Gemini's official public YouTube URL input.
  The parser accepts current raw `steps[type=model_output].content[].text`,
  `output_text`, SDK-style output, and candidate output.
- **TikTok and Instagram/Reels:** represented by the same adapter contract, but
  arbitrary public-page audiovisual analysis is currently unsupported. The
  flow returns `public_url_analysis_unsupported` before legacy page acquisition
  or any downloader/provider call.
- **Fallback:** user-owned upload or owner-authorized captions. The redesign UI
  explains this fallback; a new upload transport is not yet wired.

Metadata is placed in an explicitly untrusted prompt section and cannot satisfy
the evidence gate. Successful grounding requires the provider to mark the video
accessible and return at least one valid typed observation. Audio-only evidence
can ground transcript/analysis but is not relabeled as visual evidence.

## Operational state

- Active Git branch: `codex/product-live-core`.
- Commit `0093e4f` implemented the shared public-video grounding layer and was
  deployed successfully to both Railway staging services on 2026-08-12.
- Direct backend health and frontend-proxied health returned HTTP 200 with
  PostgreSQL storage after deployment.
- A reversible `tester_pro` grant exists only for the staging acceptance
  workspace. It is operational test access, not a subscription or production
  plan change.
- Production was not changed by the authentication or manual-video work.

## Evidence boundary

The owner manually accepted one real public YouTube flow on staging: Overview,
verified source evidence, spoken Transcript, and Deep Analysis populated and
were judged useful. Deterministic tests separately prove the three retained
adaptations and structured shootable Script Editor contract. The live run did
not produce repository-captured token/cost metrics, and the Script Editor was
not separately re-audited in that acceptance statement.

## Historical context

The root README and `docs/hackathon/` retain the Build Week Agent Studio record.
Those artifacts are historical and additive; they do not define the current
redesign architecture or platform capability policy.
