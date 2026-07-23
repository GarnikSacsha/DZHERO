# Signal Preview Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace black signal previews with a real YouTube embed or a deterministic poster/original-link fallback.

**Architecture:** The Signals modal derives a provider-specific preview mode from the selected reel. Direct video playback owns an error flag scoped to the selected signal; an error removes the player and falls back to the saved poster. The existing YouTube ID and embed helpers are reused.

**Tech Stack:** React 19, HTML video/iframe, Playwright, Vite 8.

## Global Constraints

- Work only on `main`; do not modify `hackathon/openai-build-week`.
- Do not edit or stage `backend/data/db.json`.
- Preserve the original source link in every preview state.
- Do not add retries or provider calls when media playback fails.
- A failed media URL must not leave a black player visible.

---

### Task 1: Reproduce provider-specific preview behavior

**Files:**
- Test: `scripts/test-signal-preview-ui.mjs`

**Interfaces:**
- Consumes: existing Signals API and modal
- Produces: browser assertions for expired direct media and YouTube embeds

- [ ] **Step 1: Run the approved browser reproduction**

```powershell
node scripts/test-signal-preview-ui.mjs
```

Expected: FAIL with `An expired media URL must not leave a black video player visible`.

### Task 2: Add modal media recovery

**Files:**
- Modify: `src/main.jsx:3700-4085`
- Modify: `src/main.jsx:4765-4810`
- Modify: `src/styles.css:2848-2995`
- Modify: `src/styles.css:10926`
- Test: `scripts/test-signal-preview-ui.mjs`

**Interfaces:**
- Consumes: `getReelVideoSource(reel)`, `getYouTubeEmbedUrl(reel)`, `getReelPreviewImage(reel)`
- Produces: `previewMediaFailed: boolean`
- Produces: provider-specific iframe/video/fallback render

- [ ] **Step 1: Add preview failure state**

Near `previewReel` state in `ViralBank`, add:

```js
const [previewMediaFailed, setPreviewMediaFailed] = useState(false);
```

When opening or closing a preview:

```js
const openPreview = (reel) => {
  setPreviewMediaFailed(false);
  setPreviewReel(reel);
};

const closePreview = () => {
  setPreviewMediaFailed(false);
  setPreviewReel(null);
};
```

Reset the flag whenever the selected reel ID changes.

- [ ] **Step 2: Derive provider-specific sources**

In the modal render:

```js
const previewImage = getReelPreviewImage(previewReel);
const previewVideoSource = getReelVideoSource(previewReel);
const previewYoutubeEmbed = getYouTubeEmbedUrl(previewReel);
const showDirectVideo = Boolean(previewVideoSource && !previewYoutubeEmbed && !previewMediaFailed);
```

The YouTube embed wins over a generic `videoUrl` when the reel contains a valid YouTube ID.

- [ ] **Step 3: Replace the modal media branch**

Use:

```jsx
{previewYoutubeEmbed ? (
  <div className="video-preview-player">
    <iframe
      title={previewReel.title || 'YouTube preview'}
      src={previewYoutubeEmbed}
      allow="autoplay; encrypted-media; picture-in-picture"
      allowFullScreen
    />
  </div>
) : showDirectVideo ? (
  <video
    className="signal-preview-video"
    src={previewVideoSource}
    poster={previewImage}
    controls
    playsInline
    preload="metadata"
    onError={() => setPreviewMediaFailed(true)}
  />
) : (
  <div
    className={`video-preview-frame market-${previewReel.market} ${previewImage ? 'has-media' : ''}`}
    style={previewImage ? {
      backgroundImage: `linear-gradient(180deg, rgba(3, 7, 18, 0.08), rgba(3, 7, 18, 0.74)), url("${previewImage}")`,
    } : undefined}
  >
    <span className="video-preview-play" aria-hidden="true" />
    <strong data-i18n-content>{previewReel.handle}</strong>
    {getSignalSourceUrl(previewReel) && (
      <a
        className="video-preview-play-here"
        href={getSignalSourceUrl(previewReel)}
        target="_blank"
        rel="noreferrer"
      >
        Open video
      </a>
    )}
  </div>
)}
```

- [ ] **Step 4: Make iframe and fallback occupy the same stable frame**

Ensure `.video-preview-player`, `.signal-preview-video`, and `.video-preview-frame` share the current modal width, portrait aspect ratio, dark background, border radius, and overflow rules:

```css
.video-preview-player,
.signal-preview-video,
.video-preview-frame {
  width: 100%;
  aspect-ratio: 9 / 16;
  border-radius: 16px;
  background: #050912;
  overflow: hidden;
}

.video-preview-player iframe,
.signal-preview-video {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  object-fit: cover;
}
```

- [ ] **Step 5: Run the preview browser test**

```powershell
node scripts/test-signal-preview-ui.mjs
```

Expected: PASS for both expired TikTok media fallback and YouTube embed.

- [ ] **Step 6: Commit preview recovery**

```powershell
git add -- src/main.jsx src/styles.css scripts/test-signal-preview-ui.mjs
git commit -m "fix: recover unavailable signal previews"
```

### Task 3: Verify preview integration

**Files:**
- Verify: `src/main.jsx`
- Verify: `src/styles.css`
- Verify: `scripts/test-signal-preview-ui.mjs`

**Interfaces:**
- Consumes: Task 2 preview state and render
- Produces: verified Signals preview behavior

- [ ] **Step 1: Run targeted and related tests**

```powershell
node scripts/test-signal-preview-ui.mjs
node scripts/test-apify-signal-provider.mjs
node scripts/test-automatic-discovery-regressions.mjs
npm.cmd run test:public-beta
```

Expected: all PASS.

- [ ] **Step 2: Run production build**

```powershell
npm.cmd run build
```

Expected: PASS; the existing non-blocking bundle-size warning may remain.

- [ ] **Step 3: Inspect final scope**

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only approved source, test, and plan files differ, plus the pre-existing unstaged `backend/data/db.json`.
