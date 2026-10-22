// The 256-color panel -- all colors actually paintable, shown 64 at a time
// (one "blue level" slice of the palette's 3-bit-red x 3-bit-green x
// 2-bit-blue structure) as an 8x8 red x green grid, with a 4-position
// "Add Blue" slider switching which of the 4 blue levels is shown.
// Swatches are borderless -- adjacent colors read as a continuous
// gradient -- with just a white outline on whichever one matches
// selectedIndex. Picking a color does NOT close the panel; the user closes
// it explicitly (onClose) so they can keep clicking around without
// getting ejected.
//
// STUB -- signatures and layout plan only, not implemented yet. Reviewing
// the shape before filling it in.

import React, { useState } from 'react';
import { PALETTE } from './canvasApi';

const GRID_SIZE = 8; // 8x8 red x green grid per blue level
const BLUE_LEVELS = 4; // 2 bits of blue -> 4 slices

/**
 * @param {number} selectedIndex - the currently-selected palette index --
 *   also used to pick which blue-level slice to open on.
 * @param {(paletteIndex: number) => void} onSelect - called whenever a
 *   swatch is clicked. Does not close the panel.
 * @param {() => void} onClose - called when the user explicitly closes
 *   the panel (e.g. a close button).
 */
export function ColorPalettePicker({ selectedIndex, onSelect, onClose }) {
  // Which of the 4 blue-level grids is shown. Starts on selectedIndex's
  // own blue level, so opening the panel shows the grid the current color
  // actually lives in.
  const [blueLevel, setBlueLevel] = useState(() => {
    // TODO: selectedIndex & 0b11 (the 2 low bits are the blue level)
    return 0;
  });

  function handleSwatchClick(paletteIndex) {
    // TODO: onSelect(paletteIndex) -- no close
  }

  function handleBlueLevelChange(event) {
    // TODO: setBlueLevel(Number(event.target.value))
  }

  function handleCloseClick() {
    // TODO: onClose()
  }

  return (
    <div className="color-palette-picker">
      {/* TODO: close button -- onClick -> handleCloseClick */}

      <div className="palette-grid" role="radiogroup" aria-label="Brush color">
        {/* TODO: nested loop, red 0-7 x green 0-7 at the current blueLevel ->
            index = (red << 5) | (green << 2) | blueLevel -> swatch button.
            No border by default (adjacent colors should read as one
            continuous gradient field); a white outline only when
            index === selectedIndex. onClick -> handleSwatchClick(index) */}
      </div>

      {/* TODO: "Add Blue" slider -- range input, min=0 max={BLUE_LEVELS - 1}
          step=1, value=blueLevel, onChange -> handleBlueLevelChange */}
    </div>
  );
}
