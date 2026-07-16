# DZHERO Agent Studio — verification record

Update this file after the final pre-submission run. Do not replace measured results with expected results.

## Automated verification

Primary commands:

```powershell
npm run test:agent-studio
npm run build
```

Last local result on **2026-07-16**:

- `npm run test:agent-studio` — passed;
- automatic discovery policy, regression, storage, UI-state, and API smoke tests — passed;
- `npm run build` — passed;
- Vite emitted a non-blocking chunk-size warning for the main application bundle.

`test:agent-studio` covers:

- schemas and public serialization;
- creative quality contracts;
- bounded state transitions;
- mocked orchestration and revision behavior;
- Gemini video-tool behavior;
- public source resolution;
- provider usage aggregation;
- UI state mapping;
- authenticated API journey and idempotent approval.

Additional focused scripts remain available under `scripts/test-agent-studio-*`.

## Provider-backed reference run

Recorded before the documentation pass:

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

This is a reference result, not a guarantee that every public source will have identical latency, cost, or scores.

## Manual acceptance

- [x] Full provider-backed workflow completed.
- [x] Hybrid Producer completed.
- [x] Critic accepted the final Hybrid.
- [x] Human approval completed.
- [x] Exactly seven Content Plan items were written.
- [x] OpenAI, Gemini, and Apify usage was recorded.
- [ ] Repeat the final English judge story after the documentation commit.
- [ ] Verify a fresh demo account/workspace.
- [ ] Verify the deployed environment from a signed-out browser.

## Final submission evidence

Fill these fields immediately before submission:

| Evidence | Value |
| --- | --- |
| Branch | `hackathon/openai-build-week` |
| Final commit | pending |
| Public repository/judge access | pending |
| Deployed demo | `https://openaibuildweek.up.railway.app` |
| Demo account instructions | pending |
| Public YouTube video | pending |
| Codex `/feedback` Session ID | pending |
| Devpost submission URL | pending |

## Security checks

- [x] No `.env` file is tracked.
- [x] No common API key or access-token pattern appears in the documentation/config diff.
- [x] `backend/data/db.json` is excluded from the documentation commit.
- [ ] Public API responses contain only safe aggregate usage.
- [ ] Demo data contains no private customer information.
