// Canvas API: wall data, avatars, and the leaderboard all hit the real,
// MongoDB-backed Express service now. Quick-swatches below are the one
// piece still a client-only localStorage mock -- deliberately so, it's
// per-device preference, not shared data.

export const CANVAS_WIDTH = 854;
export const CANVAS_HEIGHT = 480;

// ---- The 256-color palette (true "8-bit color") -------------------------
// 3 bits red, 3 bits green, 2 bits blue -- 8x8x4 = 256 values (RGB332,
// same idea as old VGA 8-bit color). Keeps pixel data small over the wire.
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

// A curated shortcut grid (PICO-8's palette), snapped onto the real
// 256-space via hexToPaletteIndex so a quick-pick and a suggestion are
// the same kind of value -- deduped in case two land on the same index.
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

const subscribers = new Set();

// Caps how often one username's painting generates an activity
// notification -- a fast drag flushes a chunk every ~28px/250ms, which
// would otherwise flood the feed with repeats.
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
 * Wipes every painted pixel (testing/demo only). Leaves xp alone -- it's
 * lifetime, not tied to current contents. Only notifies on success, so a
 * failed request doesn't show as cleared locally.
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
 * Submits a stroke or one chunk of a longer one: { points, shape, size,
 * paletteIndex }. No username -- the server derives the painter from the
 * auth cookie. Returns { pixels, username, xp, level }.
 */
// Serializes submissions so overlapping requests from a fast drag can't
// resolve out of order and let an earlier stroke overwrite a later one.
let pendingSubmission = Promise.resolve();

export function submitStroke(stroke) {
  const result = pendingSubmission.then(() => submitStrokeNow(stroke));
  // Swallowed here so one failed submission doesn't break the chain for
  // whatever's queued after it -- the caller still sees the real rejection.
  pendingSubmission = result.catch(() => {});
  return result;
}

async function submitStrokeNow(stroke) {
  const response = await fetch("/api/wall/strokes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stroke),
  });
  const result = await response.json();
  const { pixels, username } = result;

  notify({ type: "stroke", pixels, username });

  // One activity message per submission, throttled per username.
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

/** Subscribes to live updates. Returns an unsubscribe function for a useEffect cleanup. */
export function subscribe(callback) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

export async function saveAvatar(pixels) {
  await fetch("/api/avatar", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pixels }),
  });
}

/** @returns {{x:number,y:number,paletteIndex:number}[]|null} this user's saved avatar, or null if none saved yet. */
export async function loadAvatar(username) {
  const response = await fetch(`/api/avatar/${username}`);
  return response.json();
}

// Generic FIFO-capped-per-username localStorage store, so an unbounded
// stream of new usernames (anyone can "log in" as a new one) can't balloon
// storage -- oldest-tracked username gets evicted first once maxUsers is
// hit, regardless of recent use.
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
