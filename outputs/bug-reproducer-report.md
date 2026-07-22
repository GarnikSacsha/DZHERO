# Bug Reproducer

## ✅ FIX_PROVEN — Bug reproduced and fix proven

> The same reproducer changed from failing to passing and broader checks passed.

**Project:** DZHERO

**Bug:** Public launch security and concurrency defects

**Environment:** Windows, Node.js 24.11.1, isolated production-mode backend, temporary JSON databases, Playwright Chromium
**Generated:** 2026-07-22

## Discovery scope

- Production dzhero.com.ua HTTP/API behavior
- DZHERO main branch backend, frontend, history, bundle, dependency tree, and existing tests
- Isolated local backend and headless desktop/mobile browser flows

## Ranked and tested candidates

| # | Candidate | Contract evidence | Trigger | Location | Confidence | Outcome |
|---:|---|---|---|---|---|---|
| 1 | Public Brand Scan can reach private network addresses | A public URL preview must fetch public web content only. | POST Brand Scan input http://[::1]:PORT/internal-metadata | C:/Users/Денис/Desktop/Всякое вайбкодинг/insta-producer-redesign-work/backend/server.js:3047 | high | REPRODUCED then FIX_PROVEN |
| 2 | One slow AI request blocks unrelated workspace writes | Independent workspaces must not wait for each other's provider latency. | 1800ms Agent Chat in workspace A plus a Brief update in workspace B | C:/Users/Денис/Desktop/Всякое вайбкодинг/insta-producer-redesign-work/backend/server.js:3358 | high | REPRODUCED then FIX_PROVEN |
| 3 | Rejected CORS preflight returns an internal server error | A denied browser origin is a controlled client error, not a server failure. | OPTIONS register request with Origin https://evil.example | C:/Users/Денис/Desktop/Всякое вайбкодинг/insta-producer-redesign-work/backend/server.js:403 | high | REPRODUCED then FIX_PROVEN |

## Original report

Audit the public DZHERO product before sending Threads traffic, including exposed secrets, unsafe public URL handling, concurrent AI generation, server stability, and launch readiness.

| Contract | Expected | Actual |
|---|---|---|
| Observed behavior | Private destinations are blocked, unrelated workspace writes proceed during AI latency, and denied CORS origins return 403. | Brand Scan reached ::1, an unrelated write waited 1812ms, and denied CORS returned 500. |

## Minimal reproduction

Three focused local harnesses started isolated backends with controlled inputs and no production data. The concurrency harness delayed Gemini by 1800ms while issuing a write from another authenticated workspace.

**Confirming signal:** Internal loopback hit count 1; unrelated write latency 1812ms; CORS response 500 internal_server_error.

### Reproduction files approved at Gate 1

- [test-brand-scan-ssrf.mjs](<C:/Users/Денис/Desktop/Всякое вайбкодинг/insta-producer-redesign-work/scripts/test-brand-scan-ssrf.mjs:1>) — Proves private IPv6 reachability and public/private address classification.
- [test-mutating-api-concurrency.mjs](<C:/Users/Денис/Desktop/Всякое вайбкодинг/insta-producer-redesign-work/scripts/test-mutating-api-concurrency.mjs:1>) — Proves cross-workspace head-of-line blocking and state preservation.
- [test-cors-rejection-status.mjs](<C:/Users/Денис/Desktop/Всякое вайбкодинг/insta-producer-redesign-work/scripts/test-cors-rejection-status.mjs:1>) — Proves rejected preflight status.

## Red to green evidence

| Evidence | Before fix | After fix |
|---|---:|---:|
| Exit code | 1 | 0 |
| Timed out | False | False |
| Duration | 4,000 ms | 3,764.498 ms |
| Same command | — | True |
| Broader suite | — | passed |

### Before — failing evidence

```text
AssertionError [ERR_ASSERTION]: REPRODUCED: an unrelated workspace write waited 1812ms behind a 1800ms AI request.
```

### After — fixed evidence

```text
Mutating API concurrency check passed in 7ms.
```

## Root cause

User-controlled generic URLs were fetched without DNS/IP validation or redirect revalidation. All mutating API requests held one global response-lifetime queue, including provider waits. CORS passed an unclassified Error into the generic production 500 handler.

## Approved fix

Added DNS-pinned bounded public fetching; moved quota/final persistence for four long routes into short serialized fresh-snapshot commits; classified CORS denial as 403. Added session pruning, registration throttling, public metadata/CSP files, and non-breaking dependency updates.

**Why this is causal:** The same test inputs now block before socket connection, complete the unrelated write in single-digit milliseconds while preserving both workspace states, and return the expected 403 response.

### Production files approved at Gate 2

- [safePublicFetch.cjs](<C:/Users/Денис/Desktop/Всякое вайбкодинг/insta-producer-redesign-work/backend/services/safePublicFetch.cjs:1>) — Validates, resolves, pins, times out, and bounds public text retrieval.
- [server.js](<C:/Users/Денис/Desktop/Всякое вайбкодинг/insta-producer-redesign-work/backend/server.js:403>) — CORS classification, short atomic provider commits, session pruning, and registration throttling.

## Verification

| Check | Status | Evidence |
|---|---|---|
| Focused launch-hardening tests | ✅ passed | SSRF, concurrency, CORS, auth/session, metadata, and local UI checks passed. |
| Public beta suite | ✅ passed | Public beta guards and automatic discovery API smoke passed. |
| Agent Studio suite | ✅ passed | All nine Agent Studio suites passed. |
| Localization and build | ✅ passed | All i18n checks and Vite production build passed. |
| Dependency audit | ✅ passed | High and low advisories removed without --force; six transitive moderate advisories remain documented. |

## Reproduce

```bash
node scripts/test-brand-scan-ssrf.mjs
```
```bash
node scripts/test-mutating-api-concurrency.mjs
```
```bash
node scripts/test-cors-rejection-status.mjs
```
```bash
node scripts/test-launch-auth-guards.mjs
```
```bash
node scripts/test-public-metadata.mjs
```
```bash
node scripts/test-local-launch-ui.mjs
```

## Limitations

- No destructive or credit-spending load test was run against production.
- The concurrency fix covers the four public launch paths; other legacy provider routes retain request-wide serialization.
- Rate limits remain process-local until shared storage or edge rules are configured.

## Residual risks

- Six moderate advisories remain in the Agents SDK transitive MCP/Hono chain; DZHERO does not expose Hono serve-static.
- The single JSONB application-state document remains a scaling bottleneck beyond an initial beta.
- Email registration has throttling but not distributed CAPTCHA or email verification.

## Notes

- Only main was used; hackathon/openai-build-week was not checked out or modified.
- backend/data/db.json was already user-modified and was not staged or included in the patch.
- No deployment or production push was performed during local verification.

---

Generated by `$bug-reproducer`. A fix is proven only by the same red-to-green reproducer plus relevant broader checks.
