// The brush color control that sits in the toolbar where #color-picker /
// #avatar-color-picker currently are. Three layers:
//   1. Collapsed: a single button showing the current color. Click expands it.
//   2. Expanded ("swatch view"): a row of 9 recently-used quick-pick
//      swatches -- a fixed-length MRU list, persisted (see canvasApi.js's
//      saveQuickSwatches/loadQuickSwatches); picking ANY of them (preset or
//      custom) promotes it to the front, evicting the oldest if it's new --
//      plus a 10th, fixed "Custom color..." button.
//   3. The "Custom color..." button opens ColorPalettePicker (all 256
//      colors). Picking a color there promotes it into the quick-swatch
//      row same as a preset click, but does NOT close the picker -- that
//      panel only closes when the user explicitly closes it (its own
//      onClose), so BrushColorControl just renders it until that fires.
//
// STUB -- signatures and responsibilities only, not implemented yet.
// Reviewing the shape before filling it in.
//
// Open question (not deciding unilaterally -- flag for review):
//   - What key does the persisted quick-swatch list use -- the logged-in
//     username (one list per user, like avatars), or a single shared key
//     used by everyone/while logged out? Needs useAuth() wired in here
//     either way, not yet imported below.
//   - Which 9 colors seed the row the very first time (before anything's
//     ever been persisted) -- QUICK_SWATCHES.slice(0, 9) below is just a
//     placeholder choice, easy to swap for a specific 9.

import React, { useState } from 'react';
import { QUICK_SWATCHES, saveQuickSwatches, loadQuickSwatches } from './canvasApi';
import { ColorPalettePicker } from './ColorPalettePicker';

const QUICK_SWATCH_COUNT = 9; // + 1 fixed "Custom color..." slot = 10 shown

/**
 * @param {number} selectedIndex - the current brush color's palette index.
 * @param {(paletteIndex: number) => void} onSelect - called whenever the
 *   brush color changes, from a quick swatch or the custom picker.
 */
export function BrushColorControl({ selectedIndex, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  // The persisted MRU quick-swatch list, length-capped at
  // QUICK_SWATCH_COUNT. Falls back to the curated QUICK_SWATCHES the first
  // time (nothing saved yet).
  const [quickSwatches, setQuickSwatches] = useState(() => {
    // TODO: loadQuickSwatches(key) ?? QUICK_SWATCHES.slice(0, QUICK_SWATCH_COUNT)
    return QUICK_SWATCHES.slice(0, QUICK_SWATCH_COUNT);
  });

  function handleColorButtonClick() {
    // TODO: setExpanded(!expanded)
  }

  // Shared by both a quick-swatch click and a custom-picker selection --
  // moves paletteIndex to the front of quickSwatches (de-duping if it's
  // already present), evicting the oldest entry only when it's genuinely
  // new and the list is already at QUICK_SWATCH_COUNT. Persists the result.
  function promoteToFront(paletteIndex) {
    // TODO:
    //   const next = [paletteIndex, ...quickSwatches.filter((i) => i !== paletteIndex)].slice(0, QUICK_SWATCH_COUNT);
    //   setQuickSwatches(next);
    //   saveQuickSwatches(key, next);
  }

  function handleQuickSwatchClick(paletteIndex) {
    // TODO: onSelect(paletteIndex); promoteToFront(paletteIndex)
  }

  function handleCustomPickerSelect(paletteIndex) {
    // TODO: onSelect(paletteIndex); promoteToFront(paletteIndex) -- no close here
  }

  function handleCustomPickerClose() {
    // TODO: setCustomPickerOpen(false)
  }

  return (
    <div className="brush-color-control">
      {/* TODO: collapsed button -- background = paletteIndexToHex(selectedIndex),
          onClick -> handleColorButtonClick */}

      {expanded && (
        <div className="quick-swatch-row">
          {/* TODO: quickSwatches.map((paletteIndex) => <button>) --
              aria-pressed when === selectedIndex, onClick ->
              handleQuickSwatchClick(paletteIndex) */}

          {/* TODO: 10th, fixed "Custom color..." button, not part of the
              MRU array -- onClick -> setCustomPickerOpen(true) */}
        </div>
      )}

      {customPickerOpen && (
        <ColorPalettePicker
          selectedIndex={selectedIndex}
          onSelect={handleCustomPickerSelect}
          onClose={handleCustomPickerClose}
        />
      )}
    </div>
  );
}
