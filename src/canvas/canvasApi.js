// Canvas API, now a hybrid: wall data (getPixelOwner, submitStroke,
// getCanvasStateCache/fetchCanvasState, clearCanvas, getLeaderboard) hits
// the real Express service in service/index.js. Avatars and quick-swatch
// picks are still mocked via localStorage, and the fake-peer "live
// activity" simulation below stays purely client-side -- both are
// stand-ins for work that belongs to a later deliverable (avatars/swatches
// aren't urgent to migrate; the simulation is an explicit placeholder for
// real WebSocket pushes), not for the wall itself.
//
// The real server stores wall state in memory, not yet a database -- that's
// the next deliverable -- so it's lost on restart, same caveat the mock had.

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

const AVATAR_STORAGE_KEY_PREFIX = "paintwall-avatar-";

const FAKE_USERNAMES = ["Sarah", "anon_guest", "Markiploer", "thy_mother", "Gryffindor seeker", "Dracaena Malfoy", "Sauceror1999"];
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

function notify(event) {
  subscribers.forEach((callback) => callback(event));
}

// Stale-while-revalidate cache of the last-fetched server wall state. Lets
// the wall paint instantly on mount instead of waiting on a fetch, then
// silently swap to the real state (see wall.jsx).
const CANVAS_CACHE_KEY = "paintwall-canvas-cache";

/** Last-known wall state from the previous fetchCanvasState() call, or {} if none yet. */
export function getCanvasStateCache() {
  try {
    const raw = localStorage.getItem(CANVAS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** The real wall state, fetched from the server -- also refreshes the cache. */
export async function fetchCanvasState() {
  const response = await fetch("/api/wall");
  const grid = await response.json();
  try {
    localStorage.setItem(CANVAS_CACHE_KEY, JSON.stringify(grid));
  } catch {
    // fine -- just means the next load won't have a warm cache
  }
  return grid;
}

/**
 * Wipes every painted pixel. For testing/demoing, not a regular end-user
 * feature. Leaves xp alone -- it's lifetime, not tied to the canvas's
 * current contents. Only notifies on success -- an irreversible,
 * all-users-affecting action shouldn't show as cleared locally if the
 * request actually failed.
 */
export async function clearCanvas() {
  const response = await fetch("/api/wall", { method: "DELETE" });
  if (!response.ok) {
    return;
  }
  // Keep the stale-while-revalidate cache in sync too, or a reload before
  // the next fetchCanvasState() would briefly repaint the pixels just cleared.
  try {
    localStorage.setItem(CANVAS_CACHE_KEY, JSON.stringify({}));
  } catch {
    // fine -- just means the next load won't have a warm cache
  }
  notify({ type: "clear" });
}

/**
 * Submits a finished stroke, or one chunk of a longer one (PaintCanvas
 * flushes every CHUNK_DISTANCE_PX/CHUNK_TIME_MS rather than waiting for the
 * whole drag -- this function doesn't know or care which):
 * { points: [{x, y}, ...], shape, size, paletteIndex }. No username -- the
 * server derives the painter from the auth cookie, not anything the client
 * claims. Returns the server's { pixels, username, xp, level }.
 */
export async function submitStroke(stroke) {
  const response = await fetch("/api/wall/strokes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stroke),
  });
  const result = await response.json();
  const { pixels, username } = result;

  notify({ type: "stroke", pixels, username });

  // One activity message per submission, throttled per username -- real
  // strokes and the fake-peer stroke above share this same path rather
  // than each building their own message.
  if (pixels.length > 0) {
    const now = Date.now();
    const lastNotifiedAt = lastActivityAt.get(username) ?? 0;
    if (now - lastNotifiedAt >= ACTIVITY_THROTTLE_MS) {
      lastActivityAt.set(username, now);
      const { x, y } = pixels[0];
      notify({ type: "activity", username, message: `${username} painted near (${x}, ${y})` });
    }
  }

  return result;
}

/** { paletteIndex, username, paintedAt } for one pixel, or null if unpainted. */
export async function getPixelOwner(x, y) {
  const response = await fetch(`/api/wall/pixel/${x}/${y}`);
  return response.json();
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
// accepted tradeoff, not a bug.
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

/**
 * Every painter's XP standing, sorted highest first -- "Top Artists" reads
 * straight from this. Only users who've actually painted show up; the
 * server excludes anyone with 0 xp.
 */
export async function getLeaderboard() {
  const response = await fetch("/api/leaderboard");
  return response.json();
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

  // Purely local/visual, unlike a real stroke -- a fake peer has no real
  // account or auth token to submit with, so this notifies subscribers
  // directly instead of going through submitStroke. Never touches the
  // shared server-held wall and never earns xp; PaintCanvas/Wall can't
  // tell the difference when rendering it, since it's the same "stroke"
  // event shape submitStroke emits.
  const cells = rasterizeStroke({ points: [{ x, y }], shape: "round", size: 0 }, CANVAS_WIDTH, CANVAS_HEIGHT);
  const pixels = cells.map((cell) => ({ ...cell, paletteIndex, username }));
  notify({ type: "stroke", pixels, username });

  const now = Date.now();
  const lastNotifiedAt = lastActivityAt.get(username) ?? 0;
  if (now - lastNotifiedAt >= ACTIVITY_THROTTLE_MS) {
    lastActivityAt.set(username, now);
    notify({ type: "activity", username, message: `${username} painted near (${x}, ${y})` });
  }
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
