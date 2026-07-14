# Gemini Remix JSON Recovery Design

**Date:** 2026-07-14

## Goal

Dzhero must complete a real Gemini remix when the provider returns malformed JSON, and it must never present a local fallback as a successful AI adaptation.

## Root Cause

The production request reaches `gemini-3.5-flash`, but `generateWithGemini` parses only the first response text part with a direct `JSON.parse`. When Gemini returns an incomplete object, JSON wrapped in a code fence, or JSON split across response parts, parsing throws immediately. `generateRemix` catches every provider error and silently returns the deterministic fallback with HTTP 200, so the frontend labels a non-AI result as three AI adaptations.

## Approaches Considered

### Recommended: tolerant extraction, one provider retry, honest failure

- Join all Gemini text parts.
- Extract a complete JSON object from plain text or a Markdown code fence.
- If parsing or quality validation fails, retry Gemini once with explicit correction feedback.
- If both attempts fail while Gemini is configured, return a provider error to the route instead of a fallback result.
- Keep the deterministic fallback only when no AI provider is configured.

This recovers transient formatting failures while keeping the UI truthful.

### Repair arbitrary malformed JSON locally

Attempt to insert missing commas, quotes, or braces. This is unsafe because a repair can silently change the scenario content and cannot reliably infer the model's intended structure.

### Keep fallback and add a delay

This preserves availability but continues presenting template output as AI work. A delay only hides the failure and is rejected.

## Data Flow

1. Studio posts the source signal to `/api/workspaces/:workspaceId/remix/generate`.
2. `generateRemix` selects Gemini when `GEMINI_API_KEY` is configured.
3. The provider call returns response parts; the parser joins and extracts the JSON object.
4. The existing quality validator accepts or rejects the structured result.
5. A parse, HTTP, or quality failure triggers one correction attempt.
6. A successful attempt returns `_generation` metadata with `fallback: false`.
7. If both attempts fail, the API returns an error and Studio keeps the current draft with a visible failure message.
8. Only an installation with no configured provider may return the explicitly marked fallback.

## Error Handling

- Preserve provider HTTP status and a stable error code where available.
- Treat malformed or incomplete JSON as a retryable provider-output error.
- Do not expose the API key in logs or responses.
- Continue logging provider, model, attempt, and the sanitized failure reason.
- Do not retry more than once, avoiding uncontrolled cost and latency.

## Testing

Add focused regression tests proving that:

- JSON inside a Markdown code fence is parsed.
- text split across Gemini response parts is joined before parsing.
- a malformed first response is retried and a valid second response succeeds.
- two failed provider attempts reject instead of returning fallback when Gemini is configured.
- no-provider mode still returns the explicitly marked fallback.

Run the focused remix tests, relevant Studio-generation test where feasible, `node --check backend/services/remixEngine.js`, and `npm.cmd run build`.

## Non-Goals

- Changing Gemini billing or Railway variables.
- Adding artificial loading delays.
- Repairing arbitrary syntactically invalid JSON.
- Refactoring unrelated Studio or Brand Brain code.
