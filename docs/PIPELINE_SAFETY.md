# Beta Pipeline Safety Foundation

## Owner testing entitlement

The staging beta quota override is a server-side, reversible entitlement for one exact immutable identity pair. It requires all four environment values:

```text
BETA_OWNER_TEST_ENABLED=true
BETA_OWNER_TEST_SCOPE=staging
BETA_OWNER_TEST_USER_ID=<immutable staging user id>
BETA_OWNER_TEST_WORKSPACE_ID=<immutable staging workspace id>
```

The override is active only when both IDs match the authenticated request. The same user in another workspace and another user in the allowed workspace remain on their ordinary plan. Workspace display name, email, `role=admin`, browser claims, and plan-selection input do not grant this entitlement. No Make Sense identifiers are guessed or hardcoded. Retrieving and applying the real staging IDs is a separate authorized external activation step.

`UNLIMITED_ACCESS_EMAILS` remains a backwards-compatible owner/operator allowlist for moderation and tester administration. It does not bypass product or trial quotas. Tester grants are likewise linked to one exact user ID and workspace ID before becoming an access source.

`/api/health` reports only whether the beta pair contract is configured and valid. It never reports either configured identifier.

## Personal Analyze & Adapt

Saved-URL Analyze & Adapt is covered by the expensive-request limiter and by a workspace-level single-flight guard. An identical in-flight request joins the existing work; a different source in that workspace receives a retryable busy response before provider work starts.

Each action permits at most one grounding provider attempt and one remix provider attempt. The personal route explicitly disables remix repair retries. Authentication, IP/global abuse limits, and provider-attempt budget reservation remain in force. The pair override removes product/trial quotas only; provider attempts retain a hard daily cap.

Privacy-safe telemetry stores an opaque run ID, platform and acquisition mode, overall and per-stage timings, provider/model/attempt counts, normalized token usage when returned, actual cost only when returned, reuse/single-flight state, and terminal reason. It does not store or log source URLs, transcripts, private media, provider payloads, credentials, raw user/workspace IDs, or estimated costs.

This foundation does not add URL acquisition support. Existing public-video capability rules remain fail-closed, and personal adaptations never make Signal Bank admission decisions.
