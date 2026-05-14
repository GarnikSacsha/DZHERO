# Status

## Current state

Frontend prototype is implemented as a Vite React app.

Current URL in local development:

```text
http://127.0.0.1:5173/
```

## Done

- Sidebar navigation.
- Dark and light themes.
- MVP / ТЗ screen.
- Business analysis setup in Settings.
- Market filters.
- Home dashboard.
- Business playbooks.
- Strategy screen.
- Viral reels bank.
- Competitors table.
- Remix studio.
- Ideas board.
- Creator assistant mock.
- Launch roadmap.
- Content plan.
- Sales / AI Direct.
- Analytics.
- Legal safe.
- Budget calculator.
- Team screen.
- Data sources/settings screen.
- `docs/MVP_TZ.md`.
- First backend skeleton.
- JSON MVP database.
- API health/workspaces/brief/competitors/reels/ideas.

## Verified

Last checks performed:

- `npm run build` passes.
- `npm run dev:backend` starts API.
- `GET /api/health` works.
- Local server returns `200`.
- Main pages click correctly.
- Theme toggle works.
- Competitor modal opens/submits.
- Analysis Brief buttons work.
- Browser console has no errors during smoke test.

## Not done yet

- Production backend.
- Real database.
- Real authentication.
- Meta Login.
- Real Instagram sync.
- AI API integration.
- Payment/subscription.
- Deployment.
- Tests.

## Known constraints

- All current product data is mock/demo.
- Backend currently uses `backend/data/db.json`, not a production database.
- `src/main.jsx` is large and should be split into components later.
- `src/styles.css` is large and should be modularized later.
