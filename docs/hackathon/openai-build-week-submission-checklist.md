# OpenAI Build Week submission checklist

This checklist separates repository readiness from actions that can only be completed during publishing.

## Repository and product — complete

- [x] Project is positioned in **Work and Productivity**.
- [x] Pre-existing DZHERO functionality is separated from the Build Week extension.
- [x] Agent Studio runs as an isolated, feature-flagged beta.
- [x] GPT-5.6/OpenAI agents are core to the runtime, not only mentioned in documentation.
- [x] Gemini is limited to grounded video evidence.
- [x] Both entry modes converge on one bounded workflow.
- [x] Hybrid Producer performs a real additional OpenAI generation and Critic pass.
- [x] Only a full hero or Hybrid package can be approved.
- [x] Approval writes exactly seven normalized items idempotently.
- [x] Per-run OpenAI, Gemini, and Apify usage is visible without leaking private payloads.
- [x] README contains architecture, setup, verification, limitations, Codex contribution, and human decisions.
- [x] Demo script, submission copy, judge guide, ownership statement, and verification record exist.
- [x] Source-available evaluation license is included.
- [x] No legal-name-to-GitHub-handle match is asserted or required by repository documentation.
- [x] Signals includes a separately labelled, budget-bounded fresh-signal discovery flow.

## Final local verification

- [x] Run `npm run test:agent-studio`.
- [x] Run `npm run build`.
- [ ] Run the complete English coffee-shop flow against real providers.
- [ ] Verify Hybrid, approval success, and seven new Content Plan items.
- [x] Scan the documentation/config diff for common secret patterns.
- [x] Confirm `backend/data/db.json` is excluded from the documentation commit.
- [x] Confirm every README and hackathon-package relative Markdown link resolves.
- [ ] Record the final commit hash in the verification document.

## Repository access

- [ ] Make the submission repository public, or grant the judge accounts required by the current Devpost instructions.
- [ ] Verify the exact branch/commit judges should use.
- [ ] Verify fresh-clone setup from the judge guide.
- [ ] Keep the judge-accessible revision unchanged through judging unless a critical fix is documented.

## Demo and deployment

- [x] Deploy a judge-accessible frontend and backend.
- [x] Create and test a dedicated demo workspace/account.
- [ ] Deploy the final fresh-signal commit and enable the Railway background discovery worker.
- [ ] Ensure the demo does not expose personal billing, private customer data, or API keys.
- [ ] Record a public YouTube demo shorter than three minutes.
- [ ] Include spoken or captioned explanation of Codex collaboration and GPT-5.6 runtime use.
- [ ] Avoid unlicensed music and unnecessary third-party trademarks.
- [ ] Test the public video in a signed-out browser.

## Devpost submission

- [ ] Recheck the current official Build Week and Devpost requirements on submission day.
- [ ] Paste and proofread the final English description.
- [ ] Add the repository URL, deployed demo URL, and public YouTube URL.
- [ ] Run `/feedback` in the Codex task where the core work was performed and paste the Session ID.
- [ ] Confirm the entrant/team details are correct.
- [ ] Submit before **July 21, 2026 at 5:00 PM Pacific Time**.
- [ ] Save confirmation screenshots and the final submission URL.

## Ownership note

The submitting entrant is Denis Efimenko. GitHub usernames, commit aliases, and no-reply email addresses are technical identifiers and do not need to equal a legal name. The repository includes a direct ownership and authorization statement; no speculative identity matching is necessary.
