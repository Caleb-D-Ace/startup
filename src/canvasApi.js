// Mock "canvas API" for the Reactivity deliverable -- there's no backend yet
// (that's the Service/DB/WebSocket deliverables), so this module stands in
// for all three at once: localStorage for persistence, and setInterval to
// fake other painters' activity (the course's own pattern for mocking what
// would otherwise be a WebSocket push). Every exported function here is
// named and shaped the way the real future HTTP/WebSocket API will be --
// see the README's Canvas API plan -- so swapping the internals out later
// shouldn't require touching any component that calls it.
//
// Simplification vs. that plan: the real backend stores a dense 1280x720
// grid as packed binary and keys pixels by a numeric user ID. This mock
// stores only the *painted* pixels, sparsely, keyed by "x,y", with the
// plain username string attached directly -- there's no real DB yet to
// assign numeric IDs from, and a sparse map is what actually fits in
// localStorage's ~5MB quota for a grid this size.

export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

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

const FAKE_USERNAMES = ["Sarah", "anon_guest", "PixelPete", "WallFlower", "GraffitiGus"];
const SIMULATION_INTERVAL_MS = 4000;

const subscribers = new Set();
let simulationTimer = null;

function loadGrid() {
  try {
    const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveGrid(grid) {
  try {
    localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(grid));
  } catch {
    // localStorage full or unavailable -- fine for a mock, painted pixels
    // just won't persist across a reload.
  }
}

function notify(event) {
  subscribers.forEach((callback) => callback(event));
}

/** Every currently-painted pixel, as { "x,y": { paletteIndex, username, paintedAt } }. */
export function getCanvasState() {
  return loadGrid();
}

/**
 * Submits a finished (or batched) stroke:
 * { points: [{x, y}, ...], paletteIndex, username }.
 * Resolves it into individual pixels -- the real server will do this same
 * rasterization step (see the README's stroke-batching plan) -- then
 * persists and broadcasts the result to subscribers. Returns the resolved
 * pixel list.
 */
export function submitStroke(stroke) {
  const grid = loadGrid();
  const paintedAt = Date.now();
  const pixels = [];

  stroke.points.forEach(({ x, y }) => {
    if (x < 0 || y < 0 || x >= CANVAS_WIDTH || y >= CANVAS_HEIGHT) {
      return;
    }
    grid[`${x},${y}`] = { paletteIndex: stroke.paletteIndex, username: stroke.username, paintedAt };
    pixels.push({ x, y, paletteIndex: stroke.paletteIndex, username: stroke.username });
  });

  saveGrid(grid);
  notify({ type: "stroke", pixels, username: stroke.username });
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

// STUB -- new, not implemented yet. Persists BrushColorControl's quick-
// swatch MRU list -- same localStorage pattern as saveAvatar/loadAvatar
// above, once filled in.
//
// Open question (see BrushColorControl.jsx): what's `key` here -- the
// username (one list per logged-in user, like avatars), or a single fixed
// key shared by everyone/used while logged out?

/** @param {string} key  @param {number[]} paletteIndices */
export function saveQuickSwatches(key, paletteIndices) {
  // TODO
}

/** @param {string} key  @returns {number[] | null} */
export function loadQuickSwatches(key) {
  // TODO
  return null;
}

// ---- Simulated peer activity --------------------------------------------
// Stands in for other users' WebSocket-pushed strokes, per the course's own
// setInterval-mocking example -- makes the live activity feed and viewer
// count feel alive without a real second user or a real server.

function paintFakeStroke() {
  const username = FAKE_USERNAMES[Math.floor(Math.random() * FAKE_USERNAMES.length)];
  const paletteIndex = Math.floor(Math.random() * PALETTE.length);
  const x = Math.floor(Math.random() * CANVAS_WIDTH);
  const y = Math.floor(Math.random() * CANVAS_HEIGHT);

  submitStroke({ points: [{ x, y }], paletteIndex, username });
  notify({ type: "activity", message: `${username} painted near (${x}, ${y})` });
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
