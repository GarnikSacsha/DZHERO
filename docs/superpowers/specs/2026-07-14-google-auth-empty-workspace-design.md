# Google Auth Empty Workspace Design

**Date:** 2026-07-14

## Goal

After a successful Google login, Dzhero must open the existing `Головна` page even when the user's workspace has no reels, ideas, or content-plan posts. An empty workspace is a valid first-login state and must not crash the React application.

## Root Cause

Google OAuth completes successfully: the backend creates the session cookie and redirects the browser to `/?auth=google`. The frontend then loads `/api/auth/me` and the new workspace snapshot.

The recent workspace-isolation change correctly returns an empty `reels` array for a new user instead of demo reels. `HomeDashboard` still assumes that at least one reel exists and reads `data.reels[0].score`. When `data.reels` is empty, the production bundle throws:

```text
TypeError: Cannot read properties of undefined (reading 'score')
```

React consequently clears the application root, producing the white screen.

## Desired Behavior

- Keep the current Google OAuth start, callback, session-cookie, and `/api/auth/me` flow unchanged.
- After authentication, keep the user on the existing `Головна` page.
- Treat empty workspace collections as normal product state.
- Show `0` signals and a short Ukrainian empty-state message instead of a top-signal score.
- Do not inject demo reels or represent demo data as the user's data.
- If the user reaches Studio without a selected or available signal, show a useful empty state with a path to Signals instead of rendering `RemixStudio` with an undefined reel.

## Design

### Home Dashboard

`HomeDashboard` will derive the top reel with an optional lookup. The signals card will render the current score only when a reel exists. Otherwise it will render a neutral message such as `Сигналів ще немає` while preserving the existing signal count of `0` and the rest of the dashboard.

This keeps `Головна` useful on first login: onboarding steps, empty counters, navigation, and primary actions remain available.

### Studio Guard

The app shell will only render `RemixStudio` when a selected reel exists. If the Studio page is active with no reel, the app shell will render an inline empty-state section with a button that navigates to Signals.

This is a defensive companion to the Home fix and prevents the same invalid assumption from causing a second white-screen path.

### Data Flow

1. Google redirects to `/api/auth/callback/google`.
2. The backend creates or updates the user, creates a session, sets the session cookie, and redirects to `/?auth=google`.
3. The frontend loads `/api/auth/me` and selects the user's primary workspace.
4. `fetchProducerSnapshot` loads reels, ideas, and content-plan posts for that workspace.
5. Empty arrays are passed to the normal app shell.
6. `Головна` renders zero states without dereferencing a missing reel.

The `auth=google` query parameter does not control the rendering logic and does not require a new route.

## Error Handling

- Empty arrays are handled as valid data, not as request failures.
- Existing loading behavior remains responsible only for unresolved snapshot data.
- Failed API requests continue to produce the snapshot's existing empty-array fallback behavior, which the dashboard will now render safely.
- This focused change does not introduce a global React error boundary; that can be considered separately if broader crash recovery is needed.

## Testing

Add a regression check for an authenticated Google user whose workspace snapshot contains:

```js
{
  reels: [],
  ideas: [],
  contentPlanPosts: []
}
```

The check must verify that:

- `Головна` remains mounted;
- the signal count is `0`;
- the empty-signal message is visible;
- no `reading 'score'` runtime error occurs;
- navigating to Studio without a reel produces the Studio empty state rather than an exception.

Run the focused regression check, the existing relevant auth/workspace tests, and `npm.cmd run build`. Finally reproduce `/?auth=google` against the built frontend with mocked authenticated API responses for an empty workspace.

## Non-Goals

- Changing Google OAuth provider settings or backend callback behavior.
- Seeding new accounts with demo reels.
- Redesigning `Головна` or the broader onboarding journey.
- Refactoring the full `src/main.jsx` file.
- Deploying or pushing production changes as part of the design step.
