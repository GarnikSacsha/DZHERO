# Recent Changes

Latest known commit themes, newest first:

- `Add owner-managed Tester Pro access` - Google-email grants, manual revoke, owner-only UI, and internal capped entitlements.
- `Meter paid AI attempts before dispatch` - persistent monthly reservations count provider failures and retries before external calls.
- `Bound Tester Pro Apify discovery` - up to 10 signals daily, USD 0.40 cap, and one paid run per UTC day.
- `Cap public paid previews globally` - persistent 20/day Brand Scan circuit breaker on top of the per-IP limiter.
- `Keep landing authentication Google-only` - remove the passwordless email entry point and form.
- `Polish Studio video copy and preview` - cleaner Studio copy and preview behavior.
- `Fallback YouTube popular category pulls` - retry YouTube popular without category on category 404/not found.
- `Cap YouTube imports to plan allowance` - cap popular imports by remaining allowance, except unlimited plans.
- `Fix logout session reset` - clear app state after logout and avoid re-entering demo state.
- `Run real AI remix from Studio` - Studio adaptation triggers backend AI generation.
- `Fix YouTube video intelligence and signal metadata` - better video metadata, duration, and intelligence flow.
- `Avoid blocked YouTube embed as default preview` - avoid broken iframe as primary preview.
- `Add Gemini video understanding for YouTube signals` - use Gemini video analysis for Shorts context.
- `Improve Shorts adaptation without captions` - make no-caption flows less generic.
- `Add in-app YouTube signal playback` - first attempt at playback/preview UX.
- `Translate dynamic English UI sections` - reduce Ukrainian text leaking into English mode.
- `Improve English interface translations` - broader English UI cleanup.
- `Fix select option contrast` - readable dropdown options.
- `Improve YouTube signal intelligence` - earlier YouTube analysis improvements.
- `Add TikTok auth review hardening` - legal/security/app-review improvements.

Use `git log --oneline -20` for the latest authoritative list.
