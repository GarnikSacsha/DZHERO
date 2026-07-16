# OpenAI Build Week submission checklist

Last updated: **2026-07-17**

This checklist separates completed implementation from actions that must be performed by the entrant during the final rehearsal and submission.

## Product and repository package — complete

- [x] Project is positioned in **Work and Productivity**.
- [x] Pre-existing DZHERO functionality is separated from the Build Week extension.
- [x] Agent Studio runs as an additive, feature-flagged beta.
- [x] GPT-5.6/OpenAI agents are core to the runtime.
- [x] Gemini is limited to grounded video evidence.
- [x] YouTube and TikTok Agent Studio source paths have been manually verified.
- [x] **Find fresh signals** and scheduled discovery are implemented and deployed.
- [x] The Railway discovery worker is enabled.
- [x] Hybrid Producer performs a real additional OpenAI generation and Critic pass.
- [x] Only a complete hero or Hybrid package can be approved.
- [x] Approval writes exactly seven normalized items idempotently.
- [x] OpenAI, Gemini, and Apify usage is visible without leaking private payloads.
- [x] README includes architecture, setup, sample/test commands, limitations, Codex contribution, and human decisions.
- [x] Demo script, submission copy, judge guide, ownership statement, and verification record exist.
- [x] Source-available evaluation license is included.
- [x] GitHub handles are treated as technical identifiers, not legal names.

## Automated verification

- [x] Run `npm run test:agent-studio` after baseline `3529d80`.
- [x] Run `npm run build` after baseline `3529d80`.
- [x] Scan documentation/config for common secret patterns.
- [x] Confirm `backend/data/db.json` is excluded from the documentation commit.
- [x] Confirm README and hackathon-package relative Markdown links resolve.
- [x] Re-run `npm run test:agent-studio` after the final UI/documentation integration.
- [x] Re-run `npm run build` after the final UI/documentation integration.
- [x] Run the complete localization audit suite after the final integration.
- [x] Run light and dark UI audits across desktop, laptop, and mobile viewports.

## Tomorrow's final production rehearsal

- [ ] Open `https://openaibuildweek.up.railway.app` in a signed-out/private browser.
- [ ] Confirm the complete interface and generated package remain English.
- [ ] Confirm Home/Signals/Agent Studio/Content Plan counters agree.
- [ ] Confirm **New run**, source retry, and normal navigation work.
- [ ] Run the English coffee-shop flow with a verified public source.
- [ ] Inspect grounded evidence and the full shot-by-shot hero.
- [ ] Complete Hybrid and confirm Critic acceptance.
- [ ] Approve and confirm exactly seven distinct Content Plan items.
- [ ] Refresh once and confirm the current browser restores its remembered run.
- [ ] Confirm no private customer data, personal billing, keys, or debug output are visible.
- [ ] Check desktop and one mobile viewport in both light and dark themes.

## Final deployment and repository access

- [x] Judge-accessible frontend/backend is deployed on Railway.
- [x] Production `/api/health` returns HTTP 200 with `storage: postgres`.
- [ ] Record the final UI/documentation commit in the verification record.
- [ ] Confirm Railway deployed that exact commit successfully.
- [ ] Confirm the public homepage and `/api/health` after deployment.
- [ ] Make the repository public, **or** share the private repository with both:
  - `testing@devpost.com`
  - `build-week-event@openai.com`
- [ ] Verify the exact branch/commit judges should use.
- [ ] Verify fresh-clone setup from the judge guide.
- [ ] Keep the judge-accessible revision unchanged through judging unless a critical fix is documented.

## Public demo video

- [ ] Record a public YouTube demo no longer than three minutes.
- [ ] Include voiceover explaining the product, Codex collaboration, and GPT-5.6 runtime use.
- [ ] Show explicit human approval and the seven-item Content Plan result.
- [ ] Avoid API keys, reusable passwords, personal billing, private data, unlicensed music, and unnecessary third-party trademarks.
- [ ] Enable or burn in captions.
- [ ] Test the public video in a signed-out browser.
- [ ] Add the final public YouTube URL to the verification record.

## Devpost submission

- [ ] Recheck the [official FAQ](https://openai.devpost.com/details/faqs) and [official dates](https://openai.devpost.com/details/dates) on submission day.
- [ ] Paste and proofread the final English description.
- [ ] Add repository, deployed application, and public YouTube URLs.
- [ ] Run `/feedback` in the primary Codex build task and paste the Session ID.
- [ ] Confirm entrant/team details are correct.
- [ ] Submit before **July 21, 2026 at 5:00 PM Pacific Time**.
- [ ] Save confirmation screenshots and the final Devpost URL.

## Ownership note

The submitting entrant is Denis Efimenko. GitHub usernames, commit aliases, and no-reply email addresses are technical identifiers and do not need to equal a legal name. See the [ownership statement](openai-build-week-ownership.md).
