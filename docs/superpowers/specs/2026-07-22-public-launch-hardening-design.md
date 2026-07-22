# DZHERO Public Launch Hardening Design

## Goal

Prepare the public `main` deployment for an initial Threads traffic launch without touching `hackathon/openai-build-week` or committing local runtime data.

## Scope

The launch gate covers the three reproduced defects and the low-risk launch-readiness gaps found during the audit:

- prevent public Brand Scan from reaching loopback, private, link-local, metadata, reserved, or rebinding-controlled destinations;
- stop long Brand Scan, URL adaptation, Agent Chat, and Remix provider waits from holding the global mutation queue;
- preserve the single-document state invariant by serializing quota reservations and final commits against a fresh database snapshot;
- return a controlled `403` for rejected CORS origins;
- prune expired sessions and cap active sessions per user;
- add stricter registration throttling without changing the existing sign-up contract;
- add social metadata, crawler files, a web manifest, and a CSP-compatible Google Fonts configuration;
- apply non-breaking dependency security updates and retain any advisory that cannot be safely removed.

The following are explicitly out of scope for this patch: changing the hackathon branch, editing `backend/data/db.json`, introducing Redis or another managed service, normalizing the PostgreSQL schema, enabling billing, or enabling Agent Studio on the public product.

## Considered Approaches

### Recommended: release the queue only around proven long routes

Selected routes bypass the request-wide mutation queue. Their quota reservations and final state changes use short `serializeBackgroundMutation` transactions that re-read current state before writing. This preserves state integrity while allowing unrelated requests to proceed during provider latency.

### Rejected: one queue per workspace

The production database stores all application state in one JSONB document. Two workspace queues could write stale full-document snapshots and silently overwrite each other.

### Rejected: remove serialization globally

Most handlers still use read-modify-write against the full state document. Removing the queue globally would create lost updates and duplicate quota consumption.

## Security Architecture

`backend/services/safePublicFetch.cjs` owns outbound public-text retrieval. It accepts only HTTP(S) URLs on their standard ports, resolves every hostname, rejects the request if any returned address is non-public, pins the actual socket lookup to the validated address, revalidates every redirect, limits redirects, enforces a timeout, requests identity encoding, and stops after a bounded response size.

`fetchPublicSourceMetadata` continues returning its current fallback payloads when public metadata is unavailable. Provider-controlled URLs such as Google and Instagram API endpoints keep their existing clients; only the user-controlled generic URL fetch is replaced.

## Concurrency and State Flow

The long-route allowlist covers:

- `POST /brand-scan/preview`;
- `POST /workspaces/:workspaceId/reels/import-url`;
- `POST /workspaces/:workspaceId/agent/chat`;
- `POST /workspaces/:workspaceId/remix/generate`.

Each route performs validation and provider work outside the global mutation queue. Public quota reservation, AI-attempt reservation, and final writes acquire the existing queue briefly. Final writes re-read the database and re-check the authenticated user/workspace before appending jobs, memory, remixes, reels, usage, or sync events. Other routes retain the current request-wide queue.

## Abuse and Session Controls

Registration receives its own one-hour limiter with a conservative per-IP default and environment override. The existing auth limiter remains in place. Session creation removes expired sessions and keeps only a bounded number of newest active sessions per user before issuing a new one. Cookie behavior and successful authentication responses remain unchanged.

Distributed abuse control still requires shared infrastructure such as Redis or an edge/WAF rule. That is a documented residual risk rather than a hidden claim of complete bot protection.

## Public Metadata

`index.html` will include description, canonical, Open Graph, Twitter Card, theme color, and manifest metadata. `public/robots.txt`, `public/sitemap.xml`, `public/.well-known/security.txt`, and `public/site.webmanifest` will return real static files. Google Fonts will be declared once and allowed by CSP.

## Error Handling

- Unsafe public destinations fail closed and become the existing `metadata_fetch_failed` fallback without exposing network internals to users.
- Oversized, slow, redirect-looping, and unsupported-port responses fail within bounded time and memory.
- Rejected CORS origins return `403 { "error": "cors_origin_denied" }`.
- Provider errors preserve existing public status and payload behavior.

## Verification

The existing three reproduction scripts must go red-to-green without weakening their assertions. Concurrency verification also confirms the slow AI request itself succeeds and both workspaces retain their independent state. Broader checks include syntax, public-beta tests, Agent Studio tests, i18n tests, production build, dependency audit, and local headless desktop/mobile smoke checks.

No production stress test that creates real users or spends provider credits will run without a separately bounded decision after deployment.
