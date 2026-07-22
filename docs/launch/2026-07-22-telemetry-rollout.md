# DZHERO CRM telemetry rollout — 2026-07-22

## Deployed revisions

- DZHERO `main`: `c4000801d9118719c9b3a9f15047498108e434d4`
- CRM `main`: `27394a07418b65885aaffcce7d8c3fee2a9cd635`
- Tracker: `https://crmdzhero-production.up.railway.app/static/dzhero-tracker.v1.3.0.js`
- Tracker SRI: `sha384-QN3eJBX5Fi2HH/RS9Mqgfnlyd6zQeTXfdI3jmDent/EJEy1ZXL8cIgS9a6w62nfg`

## Production evidence

- `dzhero.com.ua` serves the exact CRM origin in `script-src` and `connect-src` CSP directives.
- The tracker is loaded asynchronously with the pinned SRI, `crossorigin="anonymous"`, and `data-site="dzhero.com.ua"`.
- Anonymous page view returned HTTP 200 and contained a clean page URL without query parameters.
- Threads launch UTM values were delivered as dedicated fields; they were not retained in `page_url`.
- `btn_brand_scan` CTA tracking returned HTTP 200 and sent only a stable element identifier, not visible button copy.
- After blocking the CRM origin in the browser, the DZHERO interface remained responsive.
- Demo authentication returned HTTP 200 and opened the product shell.
- A demo-user SPA transition to Signals returned HTTP 200 with `event_type=page_view` and `element_id=page:viral`.
- CRM rejects unrelated origins and allows only the configured DZHERO and CRM frontend origins.
- Replaying the same telemetry `event_id` returns the original database record instead of creating a duplicate.

## Verification completed locally

- Telemetry adapter, identity synchronization, and integration contract tests pass.
- Core i18n, providers, components, errors, Brand Brain, public beta, usage limits, YouTube fallback, public metadata, and all Agent Studio suites pass.
- Server syntax check and production frontend build pass.
- CRM backend test suite passes: 33 tests.
- CRM production dependency audit reports zero vulnerabilities.

## Deliberately not faked in production

- Google lead ingestion was not smoke-tested with invented credentials. It requires a real Google-authenticated user.
- Successful generation telemetry was not triggered solely for a smoke test because it can invoke an external provider and consume quota. Its success-only paths are covered by integration tests.

## Required Railway configuration

The CRM backend currently returns HTTP 503 for admin endpoints because `ADMIN_TOKEN` is not configured. This fails closed: public tracking works, but the admin dashboard cannot read CRM data.

Configure the following independent secrets in the CRM backend Railway service and redeploy:

- `ADMIN_TOKEN`: a random secret of at least 32 bytes.
- `IP_HASH_SALT`: a different random secret of at least 32 bytes.

Do not publish either value or paste it into issue trackers or chat. After deployment, an unauthenticated admin request must return HTTP 401, and the CRM dashboard must accept `ADMIN_TOKEN` for the current browser session only.

## Rollback

Set `VITE_DZHERO_CRM_ENABLED=false` for the DZHERO production build and redeploy. The integration is already disabled automatically on hosts other than exactly `dzhero.com.ua` and `www.dzhero.com.ua`, so local and preview hosts do not send telemetry to production.

## Residual dependency advisory

DZHERO's production audit reports six moderate findings through `@openai/agents -> @modelcontextprotocol/sdk -> @hono/node-server@1.19.14`. The advisory concerns Windows static-file path handling. The Railway runtime is Linux and DZHERO serves public files through Express, so the affected Hono static-file path is not used in production. The available automated fix is breaking (downgrading the Agents SDK or forcing an incompatible Hono major), so no unsafe `npm audit fix --force` was applied.
