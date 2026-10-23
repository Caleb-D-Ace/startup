// Mock "canvas API" for the Reactivity deliverable -- there's no backend yet
// (that's the Service/DB/WebSocket deliverables), so this module stands in
// for all three at once: localStorage for persistence, and setInterval to
// fake other painters' activity (the course's own pattern for mocking what
// would otherwise be a WebSocket push). Every exported function here is
// named and shaped the way the real future HTTP/WebSocket API will be --
// see the README's Canvas API plan -- so swapping the internals out later
// shouldn't require touching any component that calls it.
//
// Simplification vs. that plan: the real backend stores a dense grid as
// packed binary and keys pixels by a numeric user ID. This mock stores only
// the *painted* pixels, sparsely, keyed by "x,y", with the plain username
// string attached directly -- there's no real DB yet to assign numeric IDs
// from, and a sparse map is what actually fits in localStorage's ~5MB
// quota (480p rather than 720p specifically because painting pixel
// ownership in, which is coming next, means attribution data -- not just
// color -- now has to survive in that same quota).

import { rasterizeStroke } from "./brush";

export const CANVAS_WIDTH = 854;
export const CANVAS_HEIGHT = 480;

// ---- The 256-color palette (true "8-bit color") -------------------------
// 3 bits red, 3 bits green, 2 bits blue -- 8x8x4 = exactly 256 values, the
// classic RGB332 scheme (same idea as old VGA 8-bit color modes). This helps
// keep pixel information small so that network requests and responses don't
// take up much time or space.
function clampChannel(value) {
  return Math.min(255, Math.max(0, value));
}

/** RGB (0-255 each) -> the nearest of the 256 palette indices.
 * This method converts a standard rgb color to our 8-bit color scheme.
 */
export function rgbToPaletteIndex(r, g, b) {
  const r3 = Math.round((clampChannel(r) / 255) * 7); // 3 bits: 0-7
  const g3 = Math.round((clampChannel(g) / 255) * 7); // 3 bits: 0-7
  const b2 = Math.round((clampChannel(b) / 255) * 3); // 2 bits: 0-3
  return (r3 << 5) | (g3 << 2) | b2;
}

/** "#rrggbb" (any arbitrary color, e.g. a TheColorAPI suggestion) -> the nearest palette index. */
export function hexToPaletteIndex(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return rgbToPaletteIndex(r, g, b);
}

/** A palette index (0-255) -> its "#rrggbb" color, for rendering a pixel/swatch. */
export function paletteIndexToHex(index) {
  const r3 = (index >> 5) & 0b111;
  const g3 = (index >> 2) & 0b111;
  const b2 = index & 0b11;
  const r = Math.round((r3 / 7) * 255);
  const g = Math.round((g3 / 7) * 255);
  const b = Math.round((b2 / 3) * 255);
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

// The full addressable 256-color space, generated rather than hand-listed.
export const PALETTE = Array.from({ length: 256 }, (_, index) => paletteIndexToHex(index));

// A curated subset for the clickable swatch-picker UI -- not the only
// paintable colors, just a cohesive shortcut grid (originally PICO-8's
// palette) so people aren't hand-picking from 256 buttons. Each hex here
// gets snapped onto its real slot in the 256-space via hexToPaletteIndex,
// so a "quick pick" click and a matched suggestion are the exact same kind
// of value -- deduped in case two source colors land on the same index.
const QUICK_SWATCH_SOURCE_COLORS = [
  "#000000", "#1D2B53", "#7E2553", "#008751",
  "#AB5236", "#5F574F", "#C2C3C7", "#FFF1E8",
  "#FF004D", "#FFA300", "#FFEC27", "#00E436",
  "#29ADFF", "#83769C", "#FF77A8", "#FFCCAA",
  "#291814", "#111D35", "#422136", "#125359",
  "#742F29", "#49333B", "#A28879", "#F3EF7D",
  "#BE1250", "#FF6C24", "#A8E72E", "#00B543",
  "#065AB5", "#754665", "#FF6E59", "#FF9D81",
];

export const QUICK_SWATCHES = [...new Set(QUICK_SWATCH_SOURCE_COLORS.map(hexToPaletteIndex))];

const CANVAS_STORAGE_KEY = "paintwall-canvas";
const AVATAR_STORAGE_KEY_PREFIX = "paintwall-avatar-";

const FAKE_USERNAMES = ["Sarah", "anon_guest", "Markiploer", "thy_mother", "Gryffindor"];
const SIMULATION_INTERVAL_MS = 4000;

// Confined to a corner rather than scattered across the whole canvas, so
// simulated activity doesn't visually clutter actual painted artwork (e.g.
// in an exported/graded screenshot) -- fractions of CANVAS_WIDTH/HEIGHT
// rather than fixed pixel sizes so this stays "a corner" if those change.
const FAKE_ACTIVITY_REGION_WIDTH = Math.round(CANVAS_WIDTH * 0.2);
const FAKE_ACTIVITY_REGION_HEIGHT = Math.round(CANVAS_HEIGHT * 0.2);

const subscribers = new Set();
let simulationTimer = null;

// Caps how often one username's painting generates an "activity"
// notification -- a fast drag flushes a chunk every ~28px/250ms, which
// would otherwise flood the feed with one user's own repeated messages.
// In-memory only, uncapped in size -- a Map entry here is a string key
// and a number, cheap enough not to need the FIFO eviction the
// localStorage-backed stores below use.
const ACTIVITY_THROTTLE_MS = 5000;
const lastActivityAt = new Map(); // username -> timestamp of its last emitted activity notification

// submitStroke runs on every chunk flush (every ~28px/250ms while
// dragging), so re-parsing/re-serializing the *entire* grid on every call
// scales with total session history, not with what's new. gridCache keeps
// one in-memory copy (loaded from localStorage once) and the actual write
// is debounced, so a rapid burst of flushes from one drag collapses into a
// single localStorage.setItem shortly after painting pauses.
let gridCache = null;
let saveTimer = null;
const SAVE_DEBOUNCE_MS = 400;

function loadGrid() {
  if (gridCache === null) {
    try {
      const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
      gridCache = raw ? JSON.parse(raw) : {};
    } catch {
      gridCache = {};
    }
  }
  return gridCache;
}

function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(gridCache));
  } catch {
    // localStorage full or unavailable -- fine for a mock, painted pixels
    // just won't persist across a reload.
  }
}

function scheduleSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
}

// Safety net: if the tab closes mid-debounce, flush immediately rather than
// silently losing however many strokes were painted in the last 400ms.
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (saveTimer) {
      flushSave();
    }
  });
}

function notify(event) {
  subscribers.forEach((callback) => callback(event));
}

/** Every currently-painted pixel, as { "x,y": { paletteIndex, username, paintedAt } }. */
export function getCanvasState() {
  return loadGrid();
}

/**
 * Submits a finished stroke, or one chunk of a longer one (PaintCanvas
 * flushes every CHUNK_DISTANCE_PX/CHUNK_TIME_MS rather than waiting for the
 * whole drag -- this function doesn't know or care which):
 * { points: [{x, y}, ...], shape, size, paletteIndex, username }.
 * Expands the raw path into actual pixels via rasterizeStroke -- the real
 * server will do this same rasterization step (see the README's
 * stroke-batching plan) -- then persists and broadcasts the result to
 * subscribers. Returns the resolved pixel list.
 *
 * Every resolved pixel also adds 1 xp to the painting user's lifetime
 * total, repaints included -- repainting an already-painted cell earns the
 * same xp as a blank one, deliberately. Ranking by *current* wall
 * ownership instead would make painting over someone else's work the
 * optimal strategy (it steals their standing); lifetime xp is purely
 * additive, so there's no such incentive.
 */
export function submitStroke(stroke) {
  const grid = loadGrid();
  const paintedAt = Date.now();
  const cells = rasterizeStroke(stroke, CANVAS_WIDTH, CANVAS_HEIGHT);

  const pixels = cells.map(({ x, y }) => {
    grid[`${x},${y}`] = { paletteIndex: stroke.paletteIndex, username: stroke.username, paintedAt };
    return { x, y, paletteIndex: stroke.paletteIndex, username: stroke.username };
  });

  if (pixels.length > 0) {
    addXp(stroke.username, pixels.length);
  }

  scheduleSave();
  notify({ type: "stroke", pixels, username: stroke.username });

  // One activity message per submission, throttled per username -- real
  // strokes and the fake-peer stroke below share this same path rather
  // than each building their own message. Only the notification is
  // skipped when throttled; painting, persistence, and xp above still run.
  if (pixels.length > 0) {
    const now = Date.now();
    const lastNotifiedAt = lastActivityAt.get(stroke.username) ?? 0;
    if (now - lastNotifiedAt >= ACTIVITY_THROTTLE_MS) {
      lastActivityAt.set(stroke.username, now);
      const { x, y } = pixels[0];
      notify({ type: "activity", username: stroke.username, message: `${stroke.username} painted near (${x}, ${y})` });
    }
  }

  return pixels;
}

/** { paletteIndex, username, paintedAt } for one pixel, or null if unpainted. */
export function getPixelOwner(x, y) {
  return loadGrid()[`${x},${y}`] ?? null;
}

/**
 * Subscribes to live updates (stroke events, simulated activity messages).
 * Returns an unsubscribe function -- call it from a useEffect cleanup.
 * The simulated-peer timer only runs while at least one subscriber exists.
 */
export function subscribe(callback) {
  subscribers.add(callback);
  startSimulation();

  return function unsubscribe() {
    subscribers.delete(callback);
    if (subscribers.size === 0) {
      stopSimulation();
    }
  };
}

export function saveAvatar(username, pixels) {
  try {
    localStorage.setItem(AVATAR_STORAGE_KEY_PREFIX + username, JSON.stringify(pixels));
  } catch {
    // fine for a mock
  }
}

export function loadAvatar(username) {
  try {
    const raw = localStorage.getItem(AVATAR_STORAGE_KEY_PREFIX + username);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Generic FIFO-capped-per-username localStorage store. Anyone can "log in"
// as a new username at any time (see AuthContext), unbounded and not under
// our control -- without a cap, someone could balloon localStorage by
// cycling through thousands of throwaway usernames. The usersListKey
// tracks which usernames currently have data, in plain FIFO insertion
// order (not MRU -- re-saving an existing username's value just updates it
// in place, it doesn't move them in the queue): once maxUsers is hit, the
// username that was tracked *first* is evicted when a new one arrives,
// regardless of how recently that first one was actually used. Simple, and
// the stated cost (an idle username can eventually lose its data) is an
// accepted tradeoff, not a bug. Shared by quick swatches and XP below.
function createPerUserStore(storageKeyPrefix, usersListKey, maxUsers) {
  function loadTrackedUsers() {
    try {
      const raw = localStorage.getItem(usersListKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function save(username, value) {
    try {
      localStorage.setItem(storageKeyPrefix + username, JSON.stringify(value));
    } catch {
      return; // storage full/unavailable -- fine for a mock
    }

    const trackedUsers = loadTrackedUsers();
    if (trackedUsers.includes(username)) {
      return; // already tracked -- FIFO position doesn't change on re-save
    }

    trackedUsers.push(username);
    if (trackedUsers.length > maxUsers) {
      const evicted = trackedUsers.shift(); // oldest-tracked username, evicted first
      try {
        localStorage.removeItem(storageKeyPrefix + evicted);
      } catch {
        // fine
      }
    }

    try {
      localStorage.setItem(usersListKey, JSON.stringify(trackedUsers));
    } catch {
      // fine -- the value itself already saved above either way
    }
  }

  function load(username) {
    try {
      const raw = localStorage.getItem(storageKeyPrefix + username);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  return { save, load, listUsers: loadTrackedUsers };
}

const quickSwatchStore = createPerUserStore("paintwall-quickswatches-", "paintwall-quickswatches-users", 10);

/** @param {string} username  @param {number[]} paletteIndices */
export function saveQuickSwatches(username, paletteIndices) {
  quickSwatchStore.save(username, paletteIndices);
}

/** @param {string} username  @returns {number[] | null} */
export function loadQuickSwatches(username) {
  return quickSwatchStore.load(username);
}

// XP standing is more consequential to a user than their swatch picks --
// losing a quick-swatch list to the FIFO cap is a shrug, losing your
// leaderboard spot isn't -- so this gets a much larger cap to make evicting
// an actual active/high-scoring user far less likely in practice, without
// bothering to make eviction XP-aware (unnecessary complexity for a mock).
const MAX_XP_TRACKED_USERS = 50;
const xpStore = createPerUserStore("paintwall-xp-", "paintwall-xp-users", MAX_XP_TRACKED_USERS);

/** @returns {{xp: number, lastActive: number}} */
export function getUserXp(username) {
  return xpStore.load(username) ?? { xp: 0, lastActive: null };
}

function addXp(username, amount) {
  const current = xpStore.load(username) ?? { xp: 0, lastActive: null };
  xpStore.save(username, { xp: current.xp + amount, lastActive: Date.now() });
}

/**
 * Every tracked username's XP standing, sorted highest first -- "Top
 * Artists" reads straight from this. Only usernames that have painted at
 * least once show up here (same username list the FIFO cap manages), so a
 * user's own name appears the moment they first paint, not before.
 */
export function getLeaderboard() {
  return xpStore
    .listUsers()
    .map((username) => ({ username, ...getUserXp(username) }))
    .sort((a, b) => b.xp - a.xp);
}

// ---- Simulated peer activity --------------------------------------------
// Stands in for other users' WebSocket-pushed strokes, per the course's own
// setInterval-mocking example -- makes the live activity feed and viewer
// count feel alive without a real second user or a real server.

function paintFakeStroke() {
  const username = FAKE_USERNAMES[Math.floor(Math.random() * FAKE_USERNAMES.length)];
  const paletteIndex = Math.floor(Math.random() * PALETTE.length);
  const x = CANVAS_WIDTH - FAKE_ACTIVITY_REGION_WIDTH + Math.floor(Math.random() * FAKE_ACTIVITY_REGION_WIDTH);
  const y = Math.floor(Math.random() * FAKE_ACTIVITY_REGION_HEIGHT);

  submitStroke({ points: [{ x, y }], paletteIndex, username, shape: "round", size: 0 });
  // submitStroke itself emits the matching "activity" notification now.
}

function startSimulation() {
  if (simulationTimer) {
    return;
  }
  simulationTimer = setInterval(paintFakeStroke, SIMULATION_INTERVAL_MS);
}

function stopSimulation() {
  clearInterval(simulationTimer);
  simulationTimer = null;
}
