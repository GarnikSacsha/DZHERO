# Project Snapshot

## Product

Dzhero is an AI producer/workspace for short-form content research and adaptation. The core job is to find market signals from short videos, websites, and competitor mechanics, then turn them into scripts and content plans for Ukrainian businesses.

Primary users:

- Local businesses, ecommerce, cafes, salons, creators, experts, SMMs, producers.
- People who need repeatable content mechanics, not just a blank AI chat.

Current product surfaces:

- Signals: one feed of imported/manual signals, source tabs, search/paste input, market/category filters, YouTube popular pulls.
- Studio: opens a signal, extracts the mechanic, adapts it into a Ukrainian-brand script, and can add it to the content plan.
- Content plan: calendar and production queue.
- Brand Brain: saved brand context and insights.
- Settings / billing / sources: account, plan, connected sources.
- Assistant / Jeryk: helper entry point.

## Stack

- Frontend: React 19, Vite 8, lucide-react, custom CSS.
- Backend: Express 5, helmet, cors, express-rate-limit.
- Storage: local JSON DB for MVP, optional Postgres via `pg`.
- AI/video: Gemini API for video understanding and remix generation.

## Commands

```powershell
npm install
npm.cmd run dev -- --port 5173
npm.cmd run dev:backend
npm.cmd run build
```

Local URLs:

```text
Frontend: http://127.0.0.1:5173/
Backend:  http://127.0.0.1:3000
Health:   http://127.0.0.1:3000/api/health
```

## Backend notes

Important route families:

- `/api/auth/*` for local auth, demo auth, OAuth callbacks, logout, current user.
- `/api/workspaces/*` for workspace state, signals, remix generation, sources, usage.
- `/api/legal/*` / static legal pages for terms, privacy, and data deletion support.
- YouTube popular/import logic lives in backend services and server routes.

Important backend behaviors:

- Session is cookie-based (`HttpOnly`, `SameSite`) where configured.
- Rate limits protect auth and expensive/AI routes.
- CORS is restricted by configured allowed origins.
- Security headers use `helmet`.
- Write requests are checked against trusted origins/referers where applicable.

## AI and YouTube state

YouTube captions are unreliable. The current direction is:

- Do not depend on captions as the only source.
- Use Gemini video understanding when possible.
- Fall back to title, description, thumbnail/metadata, and user notes.
- Keep the UI honest when the app needs manual context.

Gemini video understanding currently uses the Interactions API shape:

```text
POST /v1beta/interactions
header: x-goog-api-key
input:
  - { type: "video", uri: videoUrl }
  - { type: "text", text: prompt }
```

Expected analysis fields include:

- `videoSummary`
- `spokenText`
- `onScreenText`
- `hook`
- `twist`
- `sceneBeats`
- `contentMechanic`
- `ukrainianAdaptation`
- `shotList`
- `ctaIdeas`
- `guardrails`

## TikTok developer context

TikTok Developer review previously rejected changes and asked to update:

- App name
- Redirect domain
- Terms of Service
- Privacy Policy
- Website URL

Current intended setup:

- App name: `Dzhero`
- Website: `https://dzhero.com.ua`
- Terms: `https://dzhero.com.ua/terms/`
- Privacy: `https://dzhero.com.ua/privacy/`
- Login Kit redirect: `https://dzhero.com.ua/api/auth/tiktok/callback`
- Login Kit scopes: `user.info.basic`, `user.info.profile`, `user.info.stats`

Demo video for review is a screen recording of the product flow, not a marketing video.

## Security state

Already addressed in earlier passes:

- Terms/privacy/data deletion support.
- Security headers via helmet.
- CORS limited to known domains/config.
- Rate limits for auth and expensive routes.
- Cookie session hardening.
- Backend-side validation for important API flows.
- More neutral user-facing errors in several places.
- Plan/usage limits for paid/expensive operations.
- Avoid exposing server secrets to frontend.

Still verify before major production pushes:

- No secret values in frontend bundles.
- No sensitive data returned from broad API responses.
- No raw internal exceptions in UI toasts.
- RLS/Postgres policy status if Supabase or managed Postgres auth is introduced.

