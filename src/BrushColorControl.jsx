// The brush color control that sits in the toolbar, to the right of the
// brush-size slider. Normally: all 9 quick swatches + a "Custom color..."
// button, arrayed horizontally on one line. The first swatch is always
// whichever color is currently selected (promoteToFront keeps it there)
// and renders larger, with an outline, so it's clearly the active one.
// Clicking any swatch re-runs that same priority reshuffle.
//
// Below the toolbar's narrow-viewport breakpoint, where a full row of 10
// buttons no longer reasonably fits, this instead collapses to a single
// swatch-styled button that opens the same swatches in a speech-bubble
// popup -- the same mechanism as the custom-color picker below -- instead
// of wrapping or overflowing the toolbar row. Driven by matchMedia + a
// resize listener rather than a CSS breakpoint, since this needs to pick
// between two different React render paths, not just hide/show CSS.

import React, { useState, useEffect } from 'react';
import { saveQuickSwatches, loadQuickSwatches, paletteIndexToHex } from './canvasApi';
import { ColorPalettePicker } from './ColorPalettePicker';
import { useAuth } from './AuthContext';

const QUICK_SWATCH_COUNT = 9; // + 1 fixed "Custom color..." slot = 10 shown
const NARROW_BREAKPOINT_PX = 640; // matches app.css's existing 40rem toolbar tier

// Black, White, then the rest of the originally-requested vibrant colors
// (RGB332 indices) -- the single source of truth for both the default
// brush color and the quick-swatch preset list, so DEFAULT_BRUSH_COLOR can
// never also appear elsewhere in DEFAULT_QUICK_SWATCHES (see withPromoted).
const NAMED_SWATCHES = {
  black: 0,
  white: 255,
  red: 224,
  green: 28,
  blue: 3,
  yellow: 252,
  orange: 240,
  purple: 131,
  brown: 204,
};

/** Moves `value` to the front of `list` (de-duping its old position) and caps the result at `count` entries. */
function withPromoted(list, value, count) {
  return [value, ...list.filter((item) => item !== value)].slice(0, count);
}

// Wall.jsx and Profile.jsx both import this rather than declaring their own
// copy, so the two toolbars can't drift out of sync with each other either.
export const DEFAULT_BRUSH_COLOR = NAMED_SWATCHES.blue;

const DEFAULT_QUICK_SWATCHES = withPromoted(Object.values(NAMED_SWATCHES), DEFAULT_BRUSH_COLOR, QUICK_SWATCH_COUNT);

function useIsNarrow(breakpointPx) {
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia(`(max-width: ${breakpointPx}px)`).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    function handleChange(event) {
      setIsNarrow(event.matches);
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [breakpointPx]);

  return isNarrow;
}

/**
 * @param {number} selectedIndex - the current brush color's palette index.
 * @param {(paletteIndex: number) => void} onSelect - called whenever the
 *   brush color changes, from a quick swatch or the custom picker.
 */
export function BrushColorControl({ selectedIndex, onSelect }) {
  const { username } = useAuth();
  const isNarrow = useIsNarrow(NARROW_BREAKPOINT_PX);

  const [customPickerOpen, setCustomPickerOpen] = useState(false);
  const [swatchesPopupOpen, setSwatchesPopupOpen] = useState(false);
  const [quickSwatches, setQuickSwatches] = useState(DEFAULT_QUICK_SWATCHES);

  // username resolves asynchronously (AuthContext reads localStorage in
  // its own effect), so a plain useState initializer would always miss an
  // already-logged-in user's persisted list -- this re-loads whenever
  // username actually changes (including null -> real username on first
  // resolve, and switching users without a page reload).
  useEffect(() => {
    if (username) {
      setQuickSwatches(loadQuickSwatches(username) ?? DEFAULT_QUICK_SWATCHES);
    } else {
      setQuickSwatches(DEFAULT_QUICK_SWATCHES);
    }
  }, [username]);

  // Shared by both a quick-swatch click and a custom-picker selection --
  // moves paletteIndex to the front of quickSwatches (de-duping if it's
  // already present), evicting the oldest entry only when it's genuinely
  // new and the list is already at QUICK_SWATCH_COUNT. Persists the result
  // (no-op while logged out). Since the first swatch always renders larger
  // and outlined, this is also what keeps "the enlarged swatch" in sync
  // with whatever's actually selected.
  function promoteToFront(paletteIndex) {
    const next = withPromoted(quickSwatches, paletteIndex, QUICK_SWATCH_COUNT);
    setQuickSwatches(next);
    if (username) {
      saveQuickSwatches(username, next);
    }
  }

  function handleSwatchClick(paletteIndex) {
    onSelect(paletteIndex);
    promoteToFront(paletteIndex);
  }

  // Custom picker: clicking around updates the live preview (the enlarged
  // selected swatch) immediately, but does NOT touch the quick-swatch
  // stack -- only whatever color is selected at the moment the panel
  // actually closes gets promoted (see handleCustomPickerClose). That way
  // browsing several colors in the 256-panel doesn't evict real stack
  // entries for colors you only looked at, not kept.
  function handleCustomPickerSelect(paletteIndex) {
    onSelect(paletteIndex);
  }

  // Shared by the panel's own X button and clicking outside it (the
  // backdrop) -- stacks whatever color was last live-previewed, then closes.
  function handleCustomPickerClose() {
    promoteToFront(selectedIndex);
    setCustomPickerOpen(false);
  }

  // The actual swatch buttons + the Custom-color trigger -- shared between
  // the normal inline row and the narrow-viewport popup so they can never
  // drift out of sync with each other.
  function renderSwatchRow() {
    return (
      <div className="quick-swatch-row color-swatches">
        {quickSwatches.map((paletteIndex, index) => {
          // Slot 0 always shows the live selectedIndex, not
          // quickSwatches[0] -- they're normally the same value (a preset
          // click promotes immediately), but while browsing the custom
          // picker they intentionally diverge: selectedIndex updates live,
          // quickSwatches doesn't until the panel closes. This is what
          // makes the "selected" display update without stacking early.
          const displayIndex = index === 0 ? selectedIndex : paletteIndex;
          return (
            <button
              key={index === 0 ? 'selected-slot' : paletteIndex}
              type="button"
              className={index === 0 ? 'swatch swatch-selected' : 'swatch'}
              style={{ backgroundColor: paletteIndexToHex(displayIndex) }}
              aria-pressed={displayIndex === selectedIndex}
              aria-label={paletteIndexToHex(displayIndex)}
              onClick={() => handleSwatchClick(displayIndex)}
            />
          );
        })}

        <div className="bubble-trigger-wrap">
          <button type="button" className="custom-color-btn" onClick={() => setCustomPickerOpen(true)}>
            Custom color&hellip;
          </button>

          {customPickerOpen && (
            <>
              <div className="bubble-backdrop" onClick={handleCustomPickerClose}></div>
              <ColorPalettePicker
                selectedIndex={selectedIndex}
                onSelect={handleCustomPickerSelect}
                onClose={handleCustomPickerClose}
              />
            </>
          )}
        </div>
      </div>
    );
  }

  if (!isNarrow) {
    return <div className="brush-color-control">{renderSwatchRow()}</div>;
  }

  return (
    <div className="brush-color-control bubble-trigger-wrap">
      <button
        type="button"
        className="swatch swatches-popup-btn"
        style={{ backgroundColor: paletteIndexToHex(selectedIndex) }}
        aria-label={`Brush color: ${paletteIndexToHex(selectedIndex)}. Click to choose a different color.`}
        aria-expanded={swatchesPopupOpen}
        onClick={() => setSwatchesPopupOpen((prev) => !prev)}
      />

      {swatchesPopupOpen && (
        <div className="swatches-popup speech-bubble">
          <button
            type="button"
            className="bubble-close-btn"
            aria-label="Close"
            onClick={() => setSwatchesPopupOpen(false)}
          >
            &times;
          </button>
          {renderSwatchRow()}
        </div>
      )}
    </div>
  );
}
