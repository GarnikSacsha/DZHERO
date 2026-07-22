# DZHERO Public Launch Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the DZHERO `main` deployment safe and responsive enough for an initial public Threads launch.

**Architecture:** Keep the full-document state mutation queue for short handlers, but bypass it for four long provider routes. Those routes reserve quota and commit results through short serialized mutations against a fresh state snapshot. Route all user-controlled public HTML retrieval through a DNS-pinned bounded fetch service.

**Tech Stack:** Node.js 24, CommonJS, Express 5, PostgreSQL JSONB/local JSON fallback, React 19, Vite 8, Playwright.

## Global Constraints

- Work only on `main`; never check out or modify `hackathon/openai-build-week`.
- Never edit, stage, or commit `backend/data/db.json`.
- Preserve current successful API response schemas and public feature flags.
- Use no new infrastructure dependency for the initial patch.
- Apply production changes only after a focused failing test exists.

---

### Task 1: Bounded public URL fetch

**Files:**
- Create: `backend/services/safePublicFetch.cjs`
- Modify: `backend/server.js`
- Test: `scripts/test-brand-scan-ssrf.mjs`

**Interfaces:**
- Produces: `safeFetchPublicText(url, { headers, timeoutMs, maxBytes, maxRedirects })` returning `{ ok, status, url, text }`.
- Consumes: Node `dns`, `net`, `http`, and `https` built-ins only.

- [ ] Run `node scripts/test-brand-scan-ssrf.mjs` and confirm the internal IPv6 service is reached.
- [ ] Add address classification, DNS resolution, pinned socket lookup, standard-port enforcement, redirect revalidation, timeout, and response-size limits.
- [ ] Replace the generic user URL `fetch(...).text()` in `fetchPublicSourceMetadata` with `safeFetchPublicText`.
- [ ] Re-run the exact reproducer and confirm exit code 0 with zero internal hits.
- [ ] Add direct assertions for loopback, link-local, private IPv4, ULA IPv6, and public addresses; keep them green.

### Task 2: Short atomic commits for long provider routes

**Files:**
- Modify: `backend/server.js`
- Test: `scripts/test-mutating-api-concurrency.mjs`

**Interfaces:**
- Produces: `createSerializedPaidAiAttemptGuard({ workspaceId, actorUser })`.
- Produces: long-route predicate used by `serializeMutatingApiRequests`.
- Consumes: existing `serializeBackgroundMutation`, `readDb`, `writeDb`, authorization, usage, and de-duplication helpers.

- [ ] Run `node scripts/test-mutating-api-concurrency.mjs` and confirm workspace B waits behind workspace A.
- [ ] Exempt only Brand Scan, import URL, Agent Chat, and Remix Generate from request-wide serialization.
- [ ] Make public preview and paid-AI quota reservations serialized and based on fresh state.
- [ ] Refactor Agent Chat final persistence into a serialized fresh-snapshot commit.
- [ ] Refactor import-URL de-duplication, usage, remix, and sync persistence into a serialized fresh-snapshot commit.
- [ ] Keep Remix Generate response-only while its provider attempt reservation remains atomic.
- [ ] Re-run the concurrency reproducer and assert the unrelated write completes below the threshold while the AI request succeeds.
- [ ] Extend the reproducer to verify both workspace mutations remain persisted.

### Task 3: Controlled CORS denial

**Files:**
- Modify: `backend/server.js`
- Test: `scripts/test-cors-rejection-status.mjs`

- [ ] Run the CORS reproducer and confirm it receives 500.
- [ ] Attach status `403` and payload `{ error: 'cors_origin_denied' }` to the CORS callback error.
- [ ] Re-run the exact reproducer and confirm exit code 0.

### Task 4: Registration and session launch guards

**Files:**
- Modify: `backend/server.js`
- Modify: `.env.example`
- Create: `scripts/test-launch-auth-guards.mjs`

- [ ] Add a failing isolated-backend test proving expired sessions are pruned, per-user active sessions are capped, and the registration limiter returns 429 after its configured limit.
- [ ] Add `REGISTER_RATE_LIMIT_PER_HOUR` and `MAX_ACTIVE_SESSIONS_PER_USER` with conservative defaults.
- [ ] Prune expired sessions and retain only the newest allowed active sessions before creating a session.
- [ ] Run the focused auth guard test to green and run existing auth/public-beta checks.

### Task 5: Social preview, crawler files, and font CSP

**Files:**
- Modify: `index.html`
- Modify: `src/styles.css`
- Modify: `backend/server.js`
- Create: `public/robots.txt`
- Create: `public/sitemap.xml`
- Create: `public/.well-known/security.txt`
- Create: `public/site.webmanifest`
- Create: `scripts/test-public-metadata.mjs`

- [ ] Add a failing static test for required meta tags, one Google Fonts declaration, crawler files, manifest, and CSP origins.
- [ ] Add canonical/description/Open Graph/Twitter/theme/manifest tags and consolidate the font declaration.
- [ ] Add real static crawler and manifest files.
- [ ] Allow `fonts.googleapis.com` in `style-src` and `fonts.gstatic.com` in `font-src`.
- [ ] Run the metadata test and production build to green.

### Task 6: Non-breaking dependency security update

**Files:**
- Modify: `package-lock.json`

- [ ] Capture `npm.cmd audit --omit=dev --json` baseline.
- [ ] Run `npm.cmd audit fix --omit=dev` without `--force`.
- [ ] Confirm the high `fast-uri` and low `body-parser` advisories are removed.
- [ ] Do not downgrade `@openai/agents`; document any remaining transitive Hono/MCP advisory.
- [ ] Run Agent Studio tests and production build after the lockfile update.

### Task 7: Full verification and evidence

**Files:**
- Create: `outputs/bug-reproducer-evidence.json`
- Create: `outputs/bug-reproducer-report.md`

- [ ] Run all focused launch-hardening scripts.
- [ ] Run `node --check backend/server.js`.
- [ ] Run `npm.cmd run test:public-beta` and `npm.cmd run test:agent-studio`.
- [ ] Run i18n, source-context, usage-limit, YouTube fallback, auth-session, and production build checks.
- [ ] Start isolated local backend/frontend processes and run desktop/mobile headless smoke checks.
- [ ] Inspect `git diff --check`, `git status`, and confirm no diff for `backend/data/db.json` was introduced by this work.
- [ ] Write the bug-reproducer evidence/report with red-to-green commands, residual risks, and deploy checklist.
