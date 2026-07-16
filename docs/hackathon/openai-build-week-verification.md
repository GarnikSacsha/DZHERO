# DZHERO Agent Studio — verification record

Last updated: **2026-07-17**

Update the final-evidence table after the last production rehearsal. Do not replace measured results with expected results.

## Automated verification

Primary commands:

```powershell
npm run test:agent-studio
npm run build
```

Last recorded result after implementation baseline `3529d80` on **2026-07-17**:

- `npm run test:agent-studio` — passed;
- Agent Studio schemas, quality, state machine, orchestration, video tool, source resolver, usage, UI state, and authenticated API journey — passed;
- authenticated Apify TikTok media-transfer regression — passed;
- `npm run build` — passed;
- Vite emitted a non-blocking main-bundle size warning.

The API journey uses deterministic stub providers and spends no external API credits. Additional focused scripts are available under `scripts/test-agent-studio-*`.

Final UI/documentation integration verification on **2026-07-17**:

- `npm run test:agent-studio` — passed all nine suites;
- `npm run build` — passed with the same non-blocking bundle-size warning;
- the complete localization audit suite — passed;
- light and dark UI audits across Home, Signals, Studio, Agent Studio, Content Plan, Settings, and the open assistant at desktop, laptop, and mobile viewports — zero overflow, clipping, undersized controls, page errors, or request failures.

The signed-out shell still logs the expected unauthenticated `/api/auth/me` HTTP 401 while deciding which entry screen to show; this does not fail navigation or API requests. Record the final commit below after creating it.

## Provider-backed reference run

Recorded on 2026-07-16:

| Field | Value |
| --- | --- |
| Run ID | `agent_run_mrn6q619_dtjfy1` |
| Result | completed |
| Final choice | approved Hybrid |
| Content Plan write | 7 days |
| OpenAI calls | 11 |
| Gemini calls | 1 |
| Apify calls | 1 |
| OpenAI input tokens | 51,627 |
| OpenAI output tokens | 8,626 |
| Estimated total provider cost | approximately USD 0.492015 |

Recorded quality scores:

| Dimension | Score |
| --- | ---: |
| Grounding | 93 |
| Brand fit | 91 |
| Originality | 88 |
| Feasibility | 88 |
| Language | 90 |
| Commercial fit | 86 |
| Hook strength | 87 |
| Mechanic fidelity | 89 |
| Creative boldness | 85 |

This is a measured reference result, not a guarantee that every public source will have identical latency, cost, or scores.

## Source-path verification

On 2026-07-17, the owner manually confirmed that both YouTube and TikTok inputs completed through Agent Studio. The TikTok verification followed commit `3529d80`, which authenticates the server-side download of protected Apify media before temporary Gemini Files analysis.

| Source | Result | Notes |
| --- | --- | --- |
| YouTube public URL | passed | Native public URL path into Gemini evidence |
| TikTok public URL | passed | Apify resolution, authenticated media transfer, Gemini Files evidence |

Instagram remains supported by the same source-resolution architecture but is not claimed as part of this 2026-07-17 manual verification.

## Deployment verification

Checked on **2026-07-17**:

| Check | Result |
| --- | --- |
| Public homepage | HTTP 200 |
| `GET /api/health` | HTTP 200 |
| Service | `dzhero-api` |
| Storage | `postgres` |
| Fresh-signal discovery | deployed |
| Scheduled discovery worker | enabled |

Production URL: `https://openaibuildweek.up.railway.app`

## Manual acceptance

- [x] Full provider-backed workflow completed.
- [x] Hybrid Producer completed.
- [x] Critic accepted the final Hybrid.
- [x] Human approval completed.
- [x] Exactly seven Content Plan items were written.
- [x] OpenAI, Gemini, and Apify usage was recorded.
- [x] YouTube and TikTok source paths were manually verified.
- [ ] Repeat the final English judge story after the final UI/documentation commit.
- [ ] Verify the final demo workspace in a signed-out browser.
- [ ] Confirm the exact final commit deployed by Railway.

## Final submission evidence

Fill these fields immediately before submission:

| Evidence | Value |
| --- | --- |
| Branch | `hackathon/openai-build-week` |
| Implementation baseline | `3529d80` |
| Final UI/English/docs integration | `be3ab33` |
| Submission branch tip | Use `git rev-parse HEAD` after this verification-record commit |
| Final Railway deployment status | **FILL AFTER FINAL DEPLOY** |
| Repository URL / judge access | **FILL BEFORE SUBMISSION** |
| Deployed demo | `https://openaibuildweek.up.railway.app` |
| Demo account instructions | **PROVIDE PRIVATELY IF REQUIRED** |
| Public YouTube video | **FILL BEFORE SUBMISSION** |
| Codex `/feedback` Session ID | **FILL BEFORE SUBMISSION** |
| Devpost submission URL | **FILL AFTER SUBMISSION** |

If the repository remains private, confirm access for both `testing@devpost.com` and `build-week-event@openai.com`.

## Security checks

- [x] No `.env` file is tracked.
- [x] No common API-key or access-token pattern appears in the documentation/config diff.
- [x] `backend/data/db.json` is excluded from the documentation commit.
- [x] Agent Studio public serialization tests reject raw provider payloads and secrets.
- [ ] Final demo workspace contains no private customer information.
- [ ] Final recording contains no keys, personal billing details, or reusable passwords.
