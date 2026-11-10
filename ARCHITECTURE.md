# Paintwall — Architecture & Component Guide

This document explains how the React frontend is put together: what each file and function does, why it's built the way it is, and how the pieces fit together. It's a companion to `README.md` (deliverable notes) and `notes.md` (running journal) — this one is the "how the code actually works" reference.

---

## 1. High-Level Overview

Paintwall is a shared pixel-art canvas: anyone logged in can paint on one communal 854×480 "wall," see other people's strokes appear live, inspect who painted any given pixel, earn XP for painting, and climb a leaderboard. There's also a personal 400×400 avatar canvas, independent of the wall.

**There is no real backend yet.** This is the React Part 2 ("Reactivity") deliverable — Service/DB/WebSocket come later. Everything that will eventually be a server call is mocked today inside one module, `src/canvas/canvasApi.js`, which stands in for all three future pieces at once:

- `localStorage` stands in for the database.
- A `setInterval`-driven "fake peer" stands in for other users' strokes arriving over a WebSocket.
- A plain in-memory pub/sub (`subscribe`/`notify`) stands in for a WebSocket's push model.

Every function `canvasApi.js` exports is deliberately named and shaped the way the real future HTTP/WebSocket API is expected to look, so that swapping the internals out later should mean rewriting *this one file*, not touching any component that calls it.

### Component tree / routing

```
App (app.jsx)
 └─ AuthProvider (AuthContext.jsx)       -- who's logged in, shared app-wide
     └─ <BrowserRouter>
         ├─ AuthPanel (in app.jsx)        -- header login/logout, avatar icon, XP bar
         └─ <Routes>
             ├─ "/"         → Wall (wall/wall.jsx)
             ├─ "/artists"  → Artists (artists/artists.jsx)
             ├─ "/profile"  → Profile (profile/profile.jsx)
             └─ "/about"    → About (about/about.jsx)
```

`Wall` and `Profile` both build on the same two canvas-subsystem building blocks: `PaintCanvas` (the actual drawing surface) and `BrushColorControl` (the color picker). `Artists` and the header's `AuthPanel` both use `AvatarIcon` (a read-only avatar renderer). All of them talk to `canvasApi.js` for data.

### Patterns that show up repeatedly (read this once, recognize it everywhere below)

A few deliberate patterns get reused across multiple files instead of being explained fresh each time:

- **Append-only ref + version counter.** Several components (`Wall`, `Profile`, `PaintCanvas`) hold a *big* list of pixels in a `useRef` (not `useState`), mutated via `.push()`, paired with a tiny `useState` counter (`pixelsVersion`) that's bumped on every change. Why: re-rendering/re-copying a growing pixel array on every single paint update would get slower the longer a session runs. A ref never triggers a re-render on its own, so the version counter is the actual signal telling consumers "something changed, go re-read the ref" — letting `PaintCanvas` draw only the *new* pixels instead of redrawing everything.
- **FIFO-capped per-username `localStorage` stores.** Quick-swatch preferences and XP are both stored per-username, capped to a maximum tracked-user count, oldest evicted first. Why: anyone can "log in" as any username at any time (there's no real auth), so without a cap, cycling through throwaway usernames could grow `localStorage` without bound.
- **Re-seeding state from an async `username`.** `AuthContext` resolves the logged-in username asynchronously (it reads `localStorage` inside its own `useEffect`, after first render). Any component that needs to load *that user's* saved data (`BrushColorControl`'s swatches, `Profile`'s avatar) can't just use a `useState` lazy initializer — it would capture `username` while it's still `null`. Instead, a `useEffect` with `[username]` as its dependency re-runs the load once `username` actually resolves (and again if it changes).
- **The 256-color ("8-bit") palette.** Every paintable color is one of exactly 256 values, using the RGB332 scheme (3 bits red, 3 bits green, 2 bits blue — `8 × 8 × 4 = 256`). This keeps pixel data small (good for the eventual network payloads) and turns "find the nearest paintable color to this arbitrary RGB" into cheap bit arithmetic instead of a search.

---

## 2. Directory Map

```
src/
  index.jsx              entry point
  app.jsx                App shell, routing, header/AuthPanel
  app.css                all styling
  AuthContext.jsx         login state, shared app-wide

  wall/wall.jsx            the shared canvas page
  profile/profile.jsx       the personal avatar page
  artists/artists.jsx       the XP leaderboard page
  about/about.jsx           static pitch/features page

  canvas/
    canvasApi.js           the mock backend (palette, storage, pub/sub, xp, simulation)
    brush.js                pure brush-shape / stroke-rasterization math
    xp.js                   pure XP → level math
    colorApi.js             TheColorAPI wrapper (the one real network call)
    PaintCanvas.jsx          the actual <canvas> drawing surface
    BrushColorControl.jsx    quick-swatch + custom-color picker
    ColorPalettePicker.jsx   the full 256-color panel
    AvatarIcon.jsx           small read-only avatar renderer
```

---

## 3. File-by-File Reference

### `index.jsx`
Mounts `<App />` into `#root` via `ReactDOM.createRoot`. Nothing else — the standard Vite/React entry point.

### `app.jsx`
**`App`** (default export) — the shell: renders the header (logo, nav, `AuthPanel`), the router's `<Routes>`, and the footer (name + GitHub link, satisfying the course's "name and repo link visible" requirement). Wraps everything in `AuthProvider` so login state is available app-wide, and `BrowserRouter` for routing.

**`AuthPanel`** (local, not exported) — the header's login form / logged-in summary. Two states:
- **Logged out:** a username field + inert password field (never read — a decorative placeholder, not a real auth field) + Login button.
- **Logged in:** `AvatarIcon`, "Welcome, `<name>` (Level `N`)", an XP `<meter>`, and Logout.

Uses `useState` for the controlled username input and for an `xpTick` counter; uses `useEffect` to `subscribe()` to `canvasApi` and bump `xpTick` whenever *this* user's own stroke lands — the only way the header's live XP bar can update while you're actively painting the wall on another part of the same page. (Contrast with `Profile`'s stats panel, which doesn't need a subscription — see below.)

*Considerations:* the comment at the top of this file explains it replaces an earlier *vanilla-JS* version (`public/js/auth.js`) that manipulated the same DOM nodes React now owns — having two systems fight over the same elements was the bug being fixed, not just a stylistic preference for React.

### `AuthContext.jsx`
**`AuthProvider`** — holds `username` (`null` until resolved) and `avatarVersion` (a counter), both in `useState`. A `useEffect` reads `localStorage.getItem('paintwall-username')` once on mount to restore a persisted login. Exposes `login(name)`, `logout()`, and `notifyAvatarChanged()` (bumps `avatarVersion`) via context.

**`useAuth()`** — the consumer hook (`useContext(AuthContext)`).

*Considerations:* this exists specifically because the header (`AuthPanel`) and `Profile` are not in an ancestor/descendant relationship — without a shared context, `Profile` would have to read `localStorage` independently and would go stale the moment you logged in/out without navigating away and back. `avatarVersion` solves the identical problem for the *avatar* specifically: `AvatarIcon` (in the header) and `Profile`'s "Set Avatar" button aren't related either, so there needs to be an explicit signal for "the saved avatar changed, go re-read it."

### `wall/wall.jsx` — see [Deep Dive §4.3](#43-walljsx--the-page-that-ties-everything-together)

### `profile/profile.jsx`
**`Profile`** — the personal-avatar page. Two independent sections:
- **Stats panel:** reads `getUserXp(username)` + `getLevelProgress(xp)` directly in the render body (no subscription — see *Considerations*) and shows a progress bar toward the next level.
- **Avatar editor:** a `PaintCanvas` sized 400×400, wired to a local-only `pixelsRef`/`pixelsVersion` pair (same pattern as `Wall`, but this one never calls `canvasApi.submitStroke` — nothing reaches storage until "Set Avatar" is clicked).

`handleStrokeChunk` rasterizes each chunk locally (via `brush.js`'s `rasterizeStroke`, the exact same function `canvasApi.submitStroke` uses) and pushes the resulting pixels into `pixelsRef`. `handleSetAvatar` dedupes that array (a `Map` keyed by `"x,y"`, last color wins — repainting the same cell across several chunks otherwise leaves duplicate entries) before calling `saveAvatar` and `notifyAvatarChanged()`.

*Considerations:* the stats panel deliberately does *not* subscribe to `canvasApi` — XP only ever changes via wall painting (a different page), so a plain read on every render is already "fresh enough" for a page you have to navigate to in order to see.

### `artists/artists.jsx`
**`Artists`** — the leaderboard. `useState(() => getLeaderboard())` for the initial list, `useEffect` to `subscribe()` and re-fetch the *whole* leaderboard on every stroke event.

*Considerations:* unlike the wall's pixel grid, the leaderboard is small (bounded by `MAX_XP_TRACKED_USERS`, currently 50) and cheap to fully re-fetch — so there's no need for the incremental/append-only tricks `Wall` uses for its much larger pixel list. This simplicity is a deliberate choice, not an oversight: duplicating `canvasApi`'s own sort/aggregation logic client-side to make it "incremental" would be more code for no real benefit at this scale.

### `about/about.jsx`
**`About`** — static content only (the pitch, feature list, tech-stack table). No hooks, no state.

### `canvas/PaintCanvas.jsx` — see [Deep Dive §4.2](#42-paintcanvasjsx--the-drawing-engine)

### `canvas/BrushColorControl.jsx` — see [Deep Dive §4.4](#44-brushcolorcontroljsx--the-color-picker-system)

### `canvas/ColorPalettePicker.jsx`
**`ColorPalettePicker`** — the full 256-color panel, opened from `BrushColorControl`'s "Custom color…" button. Shows 64 swatches at a time (an 8×8 red×green grid for one fixed "blue level"), with a 4-position "Add Blue" slider to switch between the 4 possible blue levels (`2^2 = 4`). One `useState` (`blueLevel`), no `useEffect` — it's a fully controlled component.

*Considerations:* swatches are deliberately borderless so adjacent colors read as a continuous gradient, with the selected one marked by a white outline instead. Picking a color does **not** close the panel — closing is a separate, explicit action — so you can click around and compare colors without getting ejected after every pick.

### `canvas/AvatarIcon.jsx`
**`AvatarIcon`** — a small, *read-only* avatar renderer (no pointer events — not a `PaintCanvas`). If `loadAvatar(username)` has data, draws it onto a canvas at native 400×400 resolution and lets CSS scale it down to icon size; otherwise falls back to a generic placeholder `<img>`. One `useEffect`, keyed on `[username, avatarVersion, hasAvatar]`, redraws whenever any of those change.

*Considerations:* `image-rendering: pixelated` is scoped specifically to the `<canvas>` variant in CSS, not the fallback `<img>` — the placeholder is a smooth illustration, not pixel art, so pixelating it would look like a mistake rather than a stylistic match.

### `canvas/canvasApi.js` — see [Deep Dive §4.1](#41-canvasapijs--the-mock-backend)

### `canvas/brush.js`
Pure functions, no React, no storage — shared by `PaintCanvas` (live preview while dragging) and `canvasApi.submitStroke` (canonical persistence), so the two can never disagree about which pixels a stroke actually touches.

- **`getBrushCells(shape, size, cx, cy)`** — the set of `{x,y}` cells one brush dab covers, centered at `(cx, cy)`. Only `'round'` exists today (a squared-distance circle test); the signature already allows for future shapes without changing callers.
- **`interpolatePoints(from, to, size)`** — fills the gap between two points with evenly-spaced intermediate points (spacing = half the brush radius, floor of 1px), so a fast drag's sparse mouse samples don't leave visible holes between dabs.
- **`rasterizeStroke(stroke, canvasWidth, canvasHeight)`** — expands a whole stroke (or one chunk of one) into the final deduped, bounds-clipped set of pixel cells it paints: interpolate gaps, union every point's brush dab, drop duplicates and out-of-bounds cells.

Also exports the tunable constants `CHUNK_DISTANCE_PX`/`CHUNK_TIME_MS` (how often `PaintCanvas` flushes a chunk) and `MIN_BRUSH_SIZE`/`MAX_BRUSH_SIZE` (brush radius bounds — see considerations below).

*Considerations:* `MIN_BRUSH_SIZE` keeps a dab from shrinking to single-pixel precision (so overwriting one specific pixel of someone else's work takes deliberate effort, not an accidental brush-stroke pass-through); `MAX_BRUSH_SIZE` caps a dab at 100px across so a single stroke can't blot out a large area of the shared wall instantly.

### `canvas/xp.js`
Pure leveling math, no storage, no React.

- **`xpForLevel(level)`** — cumulative XP needed to *complete* a given level (advance to the next), following an `XP_LEVEL_BASE * level^XP_LEVEL_EXPONENT` power curve.
- **`getLevel(xp)`** — walks `xpForLevel` upward from level 1 until the threshold exceeds `xp`. Everyone starts at level 1 with 0 XP.
- **`getLevelProgress(xp)`** — the convenience wrapper both `Profile` and `AuthPanel` actually use: current level, XP earned within that level, XP needed for that level, and the next threshold.

*Considerations:* "exponential" leveling here means a gentler power curve (`n^exponent`), not a true exponential (`base^n`) — tunable via the two exported constants without touching the walking logic.

### `canvas/colorApi.js`
The **only** module in the app that talks to a real external network service (`thecolorapi.com` — CORS is open, so it's a plain `fetch`, no proxy needed).

- **`getColorSuggestions(hex, mode, count)`** — fetches a named color scheme built around `hex` and returns a simplified `{hex, name}[]`.
- **`jitterHex(hex, amount)`** — nudges each RGB channel by a random amount before a re-query. A scheme request is otherwise *deterministic*: asking for the same color's complement twice returns the identical result, so a "refresh" button needs this to actually show something new.

*Considerations:* the jitter amount (default 50) is deliberately larger than it looks like it needs to be — the palette only has 7–8 steps per channel (~36 units apart for red/green), so a smaller jitter would often not even cross one quantized step.

---

## 4. Deep Dives

### 4.1 `canvasApi.js` — the mock backend

This is the single source of truth for everything the "server" would own in the real deliverable. Its exports fall into five groups:

**Color system** (`rgbToPaletteIndex`, `hexToPaletteIndex`, `paletteIndexToHex`, `PALETTE`, `QUICK_SWATCHES`) — the RGB332 quantization described in §1, plus a curated 32-color starter set (originally PICO-8's palette) snapped onto real palette slots.

**Canvas state** (`getCanvasState`, `submitStroke`, `getPixelOwner`, `clearCanvas`):
- `getCanvasState()` returns the whole sparse pixel map, `{"x,y": {paletteIndex, username, paintedAt}}`.
- `submitStroke(stroke)` is the central write path. It rasterizes the stroke (via `brush.js`), writes each resulting cell into the in-memory grid, awards XP (1 per resolved pixel, *including repaints* — see below), schedules a debounced save, and emits both a `"stroke"` event (for pixel-level subscribers) and — throttled — an `"activity"` event (for the live feed).
- `getPixelOwner(x, y)` is the data source behind "click a pixel to see who painted it."
- `clearCanvas()` wipes the grid for testing/demo purposes. Deliberately leaves XP untouched (see below).

**Persistence** (`gridCache`, `loadGrid`, `flushSave`, `scheduleSave`): the grid is cached in memory after the first `localStorage` read (not re-parsed on every call), and writes are debounced 400ms so a fast drag's many chunk-flushes collapse into one `localStorage.setItem` instead of one per chunk. A `beforeunload` listener flushes immediately if the tab closes mid-debounce, so a closing tab can't silently lose the last ~400ms of painting.

**Pub/sub** (`subscribe`): a plain `Set` of callbacks. `subscribe()` also starts the fake-peer simulation timer (lazily, only while at least one subscriber exists) and returns an unsubscribe function that stops it once the last subscriber leaves.

**XP/leaderboard** (`getUserXp`, `getLeaderboard`, plus the internal `addXp`): built on a small generic helper, `createPerUserStore`, that's also reused for quick-swatch storage (see §1's FIFO pattern). XP intentionally counts *every* painted pixel, including ones that repaint an already-painted cell — the alternative (ranking by current wall ownership) would make painting over someone else's work the optimal strategy, since it would "steal" their standing; lifetime XP is purely additive, so there's no such incentive.

**Simulated peer activity** (`paintFakeStroke`, `startSimulation`, `stopSimulation`): a `setInterval` (every 4s) that submits a random single-pixel stroke from a random fake username, confined to a corner region (`FAKE_ACTIVITY_REGION_WIDTH/HEIGHT`) so it doesn't visually clutter real artwork — e.g. in an exported screenshot.

### 4.2 `PaintCanvas.jsx` — the drawing engine

This is the one `<canvas>` component shared by both the wall and the avatar editor. Its guiding rule: **it doesn't know about `canvasApi` at all.** It just renders whatever `pixels` prop it's given and reports finished strokes upward — the parent decides what that means (`submitStroke` for the wall, local accumulation for the avatar).

**`drawPixels(ctx, pixels, startIndex)`** (exported) — fills `pixels[startIndex:]` onto a context, one `fillRect` per pixel. Shared by this component's own redraw effect *and* `Wall.jsx`'s "Save Wall" JPEG export, so there's one definition of "what a pixel list looks like drawn out," not two.

**The redraw effect** — keyed on `pixelsVersion`, draws only the pixels added since last time (tracked via `drawnCountRef`), *except* when `pixels.length < drawnCountRef.current`: that can only mean the array was reset (e.g. "Clear Canvas"), not appended to, so the effect wipes the canvas and starts over in that case.

**Two tools**, both sharing one set of Pointer Event handlers (not separate mouse/touch handlers — Pointer Events are what make the tools work on touchscreens at all):
- **`'brush'`** — `handlePointerDown`/`Move`/`Up` accumulate a stroke, draw optimistic "dabs" immediately (one `ctx.arc()` fill per point — much cheaper than looping every cell of a large brush individually), and flush chunks via `flushChunk()` based on `CHUNK_DISTANCE_PX`/`CHUNK_TIME_MS` from `brush.js`.
- **`'selection'`** — a short tap calls `onInspectPixel`; a drag pans (manually adjusting the nearest `.canvas-scroll` ancestor's `scrollLeft`/`scrollTop` for mouse/pen, since plain drag doesn't scroll a div on its own the way touch does — hence `touch-action` being set oppositely per tool).

*Considerations:* the live-preview dabs use `ctx.arc()` rather than the exact same per-cell loop `rasterizeStroke` uses, purely for speed (a single native draw call regardless of brush size). This means the live preview can differ from the final, canonical pixels by a pixel or two right at a dab's edge — invisible in practice, and self-corrected the instant the committed pixels land, since the redraw is additive, never destructive.

### 4.3 `Wall.jsx` — the page that ties everything together

The most complex single component in the app. Its state falls into four groups:

1. **Brush configuration** — `brushColor`, `brushSize`, `tool` (plain `useState`, driven by direct user interaction — swatch clicks, slider drags, tool-toggle clicks).
2. **Color suggestions** — `colorSuggestions` (`null` while loading, `'error'` on failure, or the deduped array), debounced and refetched on every `brushColor` change via `useEffect` + `fetchSuggestions`. A `suggestionsRequestRef` guards against a slow, stale response overwriting a newer one.
3. **The pixel grid** — `pixelsRef` (append-only, seeded synchronously from `getCanvasState()` so existing history shows on the very first paint) + `pixelsVersion`. Updated exclusively through the `canvasApi.subscribe()` callback, never directly from `handleStrokeChunk` — your own strokes flow through the identical path a peer's strokes do, so there's never a second, separately-maintained code path that could drift out of sync.
4. **Live activity** — `viewerUsernamesRef`/`viewerCount` (distinct usernames seen this session) and `activityFeed` (capped, newest-first), both driven by the same subscription's `"activity"` events.

**The one `useEffect` with `subscribe()`** is the component's hub: it branches on `event.type` — `"stroke"` appends to `pixelsRef` and bumps `pixelsVersion`; `"activity"` optionally synthesizes a "joined the wall" message (the first time a username is seen) ahead of the real message, then updates the feed; `"clear"` resets `pixelsRef` to empty and bumps the version, letting `PaintCanvas`'s shrink-detection handle the actual visual wipe.

**`handleSaveWall`** builds a JPEG export from `pixelsRef.current` on a brand-new, never-attached-to-the-DOM canvas (not `PaintCanvas`'s own live canvas — reaching into that would mean forwarding a ref and breaking its "just render what I'm given" contract). White background fill first (JPEG has no alpha channel, so unpainted pixels would otherwise come out black), then `drawPixels`, then `toBlob`. Uses `window.showSaveFilePicker` where available (Chromium only) for a real "choose where to save" dialog, falling back to a standard `<a download>` click everywhere else.

**`handleClearCanvas`** guards the destructive action with `window.confirm()`, then calls `scrollIntoView` on the canvas afterward — dismissing a native `confirm()` dialog restores focus to the button that opened it, and since that button sits below a tall canvas, the browser's own scroll-into-view-for-focus behavior can otherwise shove the page down far enough to push the freshly-cleared canvas off-screen.

> **Known inconsistency worth flagging:** `effectiveTool` is currently defined as `username ? 'brush' : 'selection'` — meaning whenever you're logged in, the canvas is *forced* to the brush tool regardless of which tool button is actually selected. The adjacent comment still describes the earlier, different behavior ("a logged-in user's own tool choice survives a logout and comes right back"), which no longer matches what the code does — clicking "Selection" while logged in now highlights that button but has no effect on the canvas (it'll keep painting instead of panning/inspecting). This looks like an unintentional edit rather than a deliberate redesign; worth a quick look before relying on the Selection tool while logged in.

### 4.4 `BrushColorControl.jsx` — the color picker system

The brush-color control is actually three cooperating pieces: `BrushColorControl` itself (the quick-swatch row + "Custom color…" trigger), `ColorPalettePicker` (the full 256-color panel it can open), and a shared `withPromoted` helper.

**`withPromoted(list, value, count)`** — moves `value` to the front of `list`, de-duplicating its old position, capped at `count` entries. This single function does double duty: it's how `DEFAULT_QUICK_SWATCHES` is derived (promoting `DEFAULT_BRUSH_COLOR` to the front of the full named-color list — guaranteeing the default color can never *also* appear elsewhere in the preset list, which used to be possible with a separately hand-written array), and it's the exact same logic `promoteToFront` uses at runtime when a swatch is clicked.

**`useIsNarrow(breakpointPx)`** — a small custom hook wrapping `window.matchMedia`, used to decide whether the quick-swatch row fits inline or needs to collapse into a popup. Deliberately `matchMedia`-driven rather than a pure CSS breakpoint, because the two states aren't just different styling — they're two different React render paths (an inline row vs. a popup-triggering button), which CSS alone can't switch between.

**The custom-picker interaction** is intentionally *not* immediate: `handleCustomPickerSelect` updates the live preview (the enlarged, outlined first swatch) instantly, but does **not** touch the quick-swatch stack — only `handleCustomPickerClose` (fired by the panel's own close button or clicking outside it) actually calls `promoteToFront`. This means browsing several colors in the 256-color panel before settling on one doesn't evict real, kept swatches for colors you only glanced at.

*Considerations:* the quick-swatch array's slot 0 always *displays* the live `selectedIndex`, not literally `quickSwatches[0]` — those are normally the same value, but while the custom picker is open and being browsed, they intentionally diverge (selected color updates live; the actual stack doesn't move until the panel closes). This is what makes the live preview update smoothly without prematurely reshuffling the saved stack.
