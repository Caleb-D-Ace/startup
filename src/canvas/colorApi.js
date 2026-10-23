// Thin wrapper around TheColorAPI (https://www.thecolorapi.com/) -- the
// only module in this app that talks to a real external network service
// (everything else under canvas/ is either pure math or mocked via
// localStorage). CORS is wide open on their end (access-control-allow-
// origin: *), so this is a plain browser fetch, no proxy needed.

const THE_COLOR_API_BASE = 'https://www.thecolorapi.com';

/**
 * Fetches a color scheme built around `hex` from TheColorAPI.
 * @param {string} hex - "#rrggbb" or "rrggbb"
 * @param {string} [mode] - one of TheColorAPI's scheme modes: monochrome,
 *   monochrome-dark, monochrome-light, analogic, complement,
 *   analogic-complement, triad, quad. Defaults to 'complement'.
 * @param {number} [count] - how many colors to return. Defaults to 3.
 * @returns {Promise<{hex: string, name: string}[]>}
 */
export async function getColorSuggestions(hex, mode = 'complement', count = 4) {
  const clean = hex.replace('#', '');
  const url = `${THE_COLOR_API_BASE}/scheme?hex=${clean}&mode=${mode}&count=${count}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TheColorAPI request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.colors.map((color) => ({ hex: color.hex.value, name: color.name.value }));
}

/**
 * A scheme request is deterministic for a given hex/mode/count -- re-asking
 * for the same color's complement just returns the same complement. This
 * nudges each RGB channel by a small random amount first, so a "refresh"
 * button calling getColorSuggestions(jitterHex(hex)) actually gets
 * different (but still nearby, still thematically close) suggestions each
 * click, instead of the identical result every time.
 * @param {string} hex - "#rrggbb" or "rrggbb"
 * @param {number} [amount] - max +/- jitter per channel. Defaults to 24.
 * @returns {string} "#rrggbb"
 */
export function jitterHex(hex, amount = 24) {
  const clean = hex.replace('#', '');
  const channel = (start) => {
    const value = parseInt(clean.substring(start, start + 2), 16);
    const jittered = value + Math.round((Math.random() - 0.5) * 2 * amount);
    return Math.min(255, Math.max(0, jittered));
  };
  return '#' + [channel(0), channel(2), channel(4)].map((c) => c.toString(16).padStart(2, '0')).join('');
}
