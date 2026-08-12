# DZHERO requirements

Last updated: **2026-08-12**

## Current MVP objective

DZHERO must help a small-business owner move from a real short-form signal to
an evidence-backed, brand-specific scenario that can be shot and tested. The
active product is the redesign; the legacy dashboard and Build Week Agent
Studio remain historical surfaces.

The limited-MVP success criterion is behavioral: users must understand a
signal, adapt it, return, and ultimately pay. Design praise alone is not proof.

## Active product flow

```text
Brand Brain
-> verified signal or personal public-video URL
-> grounded Studio overview, transcript, and deep analysis
-> three useful adaptation directions
-> structured, shootable Script Editor scenario
-> save / continue production work
```

## Workspace and authentication

- A signed-in user enters a workspace-scoped redesign product.
- Google OAuth, authenticated API requests, and logout use the frontend origin
  in deployed environments so mobile Safari can retain and clear the session
  reliably.
- OAuth may return only to a validated product destination; untrusted redirect
  destinations are rejected.
- Logout failures preserve the authenticated UI and surface a retryable error.
- Provider credentials, OAuth secrets, and admin tokens remain backend-only.

## Signals and Discovery

- Brand Brain, Collection, Studio, and bounded manual Refresh Bank are the
  active redesign path.
- Signal Filter v3.1 remains the frozen MVP admission baseline.
- `decision` and `admittedToBank` remain separate. Only
  `decision=accept && admittedToBank=true` enters the Verified Signal Bank.
- Automatic Discovery may analyze at most one video per run;
  `maxVideoAnalysesPerRun=1` stays unchanged until a separate owner decision.
- Provider/platform failures must be classified and visible without exposing
  credentials or raw payloads.

## Personal public-video grounding

- A valid public YouTube URL is analyzed through Gemini's official public URL
  input and current Interactions structured-output contract.
- Successful evidence is normalized into one `sourceContext` for Studio
  Overview, Transcript, Deep Analysis, Adaptation, and Script Editor.
- Metadata is untrusted context, never a substitute for transcript, frames,
  audio observations, or scenes.
- TikTok and Instagram/Reels share the same platform capability contract but
  arbitrary public-page URLs fail closed while no compliant audiovisual input
  path is available.
- Unsupported, private, login-gated, age-restricted, region-restricted,
  untranscribable, rejected, malformed, or unavailable sources return an
  actionable diagnostic and do not fabricate analysis.
- The supported fallback is a user-owned video upload or owner-authorized
  captions. Wiring that fallback into the redesign is backlog work.
- A failed refresh preserves any existing adaptation. Non-retryable capability
  failures do not offer a futile retry.
- One personal-video run performs at most one video-analysis invocation and no
  automatic retry. Remix may run at most once and only after grounding succeeds.

## Studio output

- Overview identifies what is actually supported by source evidence.
- Transcript contains only grounded spoken evidence and may be explicitly not
  applicable when no speech is present.
- Deep Analysis explains transferable mechanics using grounded observations.
- The existing three adaptation variants remain available.
- Script Editor receives a structured, shootable scenario with scene timing,
  direction, on-screen text, and voice-over—not merely a list of ideas.
- Studio shows the exact safe diagnostic when grounding is unavailable.

## Persistence, billing, and operations

- Railway staging uses separate frontend and backend services with PostgreSQL.
- Local development may use `backend/data/db.json` when `DATABASE_URL` is absent;
  that runtime file must not be committed as product source.
- Entitlement checks happen before paid provider work and preserve existing 402
  plan/trial semantics.
- Tester access is a reversible staging-only operational grant, not a change to
  public billing or plan semantics.
- Paid Gemini or Apify work requires explicit permission, a preflight, and a
  hard budget. Limits fail closed.

## Quality and security

- Public source content and metadata are untrusted data, never instructions.
- No secret may be committed or exposed through a `VITE_` variable.
- APIs remain authenticated, rate-limited where appropriate, and workspace-scoped.
- English and Ukrainian UI copy must remain complete and internally consistent.
- Relevant deterministic tests and `npm.cmd run build` must pass before rollout.
- Do not modify the legacy UI, Signal Filter v3.1, production, or
  `backend/data/db.json` as part of redesign Studio work.

## Historical Build Week scope

The bounded multi-agent Agent Studio, human approval, and seven-day Content Plan
requirements remain documented in `docs/hackathon/`. They do not override the
current redesign-only MVP requirements above.
