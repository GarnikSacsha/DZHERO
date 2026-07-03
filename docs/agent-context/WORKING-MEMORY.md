# Working Memory

This captures recent conversation context so the user does not need to re-explain the product in every new chat.

## Recent user priorities

- Make TikTok Developer app review pass with correct app name, redirect URL, website, terms, and privacy.
- Make YouTube API / Shorts import useful enough for production.
- Avoid fake-feeling adaptation. If AI is adapting, it should visibly do real work and produce a strong localized script.
- Keep Ukrainian and English UI clean. No Ukrainian strings in English mode and no English helper/debug copy in Ukrainian mode.
- Make previews/playback honest. YouTube Shorts embeds can be blocked, so do not show a broken iframe as if it is the product's fault.
- Keep pushing production-ready commits when requested.

## Key product decisions

- Dzhero is not a generic dashboard. It should feel like an AI producer that finds mechanics and rewrites them for a brand.
- Signals are the raw feed; Studio is where a signal becomes an adapted script.
- Popular YouTube pulls are allowed, but they must respect plan limits unless the plan is unlimited.
- When YouTube does not provide captions, Dzhero should use Gemini video analysis or ask for 1-2 notes from the user instead of pretending it has a transcript.
- For the preview modal, prefer thumbnail + original link over a broken embedded player.

## Recent fixes worth preserving

- Logout now clears local app state and does not immediately re-add demo accounts/workspaces after logout.
- YouTube popular category 404 fallback retries without category when YouTube says `Requested entity was not found`.
- Unlimited plan should not be blocked by regular usage caps.
- YouTube imported duration should come from metadata, not a hardcoded `52s`.
- Studio regeneration calls the real backend AI remix route, not only a frontend fallback.
- Source context filters mojibake and hashtag-heavy captions before using them for adaptation.
- Studio/video helper copy was changed from technical/debug wording to user-facing Ukrainian copy.

## UI copy sensitivity

The user has repeatedly flagged:

- Dark select dropdown option text needs readable black text on white dropdowns.
- English mode must translate dynamic sections too, not just static nav.
- Ukrainian mode should not show English labels such as `Video notes`, `YouTube intelligence`, `Add what happens in the video`, or long English explanations.
- User-facing copy should explain the benefit, not internal implementation details.

## YouTube/Gemini lessons

Problem seen:

- Captions were missing on nearly every Shorts video.
- The first Gemini approach looked like it did not actually watch video: same durations, generic scripts, repeated structure.
- Some data looked mojibake/corrupted.

Better direction:

- Use real video URL + Gemini video input when possible.
- Include title, description, thumbnails, stats, and user notes as fallback context.
- Ask Gemini for scene beats, twist, hook, and adaptation guardrails, not just a generic 15-second script.
- Show a real loading state while backend AI works.
- If there is no reliable context, ask the user for 1-2 sentences and rebuild from that.

## Current git hygiene

`backend/data/db.json` often remains modified locally. It should stay out of commits unless specifically requested.

