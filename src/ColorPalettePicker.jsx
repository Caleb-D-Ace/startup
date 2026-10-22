// The 256-color panel -- all colors actually paintable, shown 64 at a time
// (one "blue level" slice of the palette's 3-bit-red x 3-bit-green x
// 2-bit-blue structure) as an 8x8 red x green grid, with a 4-position
// "Add Blue" slider switching which of the 4 blue levels is shown.
// Swatches are borderless -- adjacent colors read as a continuous
// gradient -- with just a white outline on whichever one matches
// selectedIndex. Picking a color does NOT close the panel; the user closes
// it explicitly (onClose, the X button) so they can keep clicking around
// without getting ejected.
//
// Renders as a speech-bubble popover (see .speech-bubble in app.css) --
// positioned relative to its own trigger wrapper, doesn't move any other
// page content, not an actual separate browser window.

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
  const [blueLevel, setBlueLevel] = useState(() => selectedIndex & 0b11);

  function handleSwatchClick(paletteIndex) {
    onSelect(paletteIndex);
  }

  function handleBlueLevelChange(event) {
    setBlueLevel(Number(event.target.value));
  }

  function handleCloseClick() {
    onClose();
  }

  const indices = [];
  for (let red = 0; red < GRID_SIZE; red++) {
    for (let green = 0; green < GRID_SIZE; green++) {
      indices.push((red << 5) | (green << 2) | blueLevel);
    }
  }

  return (
    <div className="color-palette-picker speech-bubble">
      <button type="button" className="bubble-close-btn" aria-label="Close" onClick={handleCloseClick}>
        &times;
      </button>

      <div className="palette-grid" role="radiogroup" aria-label="Brush color">
        {indices.map((index) => (
          <button
            key={index}
            type="button"
            className="palette-swatch"
            style={{ backgroundColor: PALETTE[index] }}
            aria-pressed={index === selectedIndex}
            aria-label={PALETTE[index]}
            onClick={() => handleSwatchClick(index)}
          />
        ))}
      </div>

      <div className="palette-blue-slider">
        <label htmlFor="palette-blue-level">Add Blue</label>
        <input
          type="range"
          id="palette-blue-level"
          min="0"
          max={BLUE_LEVELS - 1}
          step="1"
          value={blueLevel}
          onChange={handleBlueLevelChange}
        />
      </div>
    </div>
  );
}
