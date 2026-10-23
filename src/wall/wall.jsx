import React, { useState, useEffect, useRef } from 'react';
import { BrushColorControl, DEFAULT_BRUSH_COLOR } from '../canvas/BrushColorControl';
import { PaintCanvas } from '../canvas/PaintCanvas';
import {
  getCanvasState,
  getPixelOwner,
  subscribe,
  submitStroke,
  paletteIndexToHex,
  hexToPaletteIndex,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
} from '../canvas/canvasApi';
import { MIN_BRUSH_SIZE, MAX_BRUSH_SIZE } from '../canvas/brush';
import { getColorSuggestions, jitterHex } from '../canvas/colorApi';
import { useAuth } from '../AuthContext';

const DEFAULT_BRUSH_SIZE = 5;
const BRUSH_SHAPE = 'round'; // only shape implemented so far -- brush-style select below isn't wired to this yet
const SUGGESTION_DEBOUNCE_MS = 400; // avoids firing a request per intermediate color while clicking around

export function Wall() {
  const { username } = useAuth();
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [tool, setTool] = useState('brush'); // 'brush' | 'hand'

  // { hex, name }[] -- fetched from TheColorAPI, built around the current
  // brush color. null while loading (first load / mid-debounce), 'error'
  // sentinel string on failure so the UI can tell "still loading" from
  // "the request actually failed" apart from a plain empty array.
  const [colorSuggestions, setColorSuggestions] = useState(null);
  const suggestionsRequestRef = useRef(0); // guards against a slow/older request overwriting a newer one

  // Shared by the auto-fetch effect below and the refresh button -- fires
  // one request for `hex` and applies the result only if nothing newer has
  // started since (the request-id guard), so a slow/stale response can't
  // clobber whatever's actually current.
  function fetchSuggestions(hex) {
    const requestId = ++suggestionsRequestRef.current;
    setColorSuggestions(null);

    getColorSuggestions(hex)
      .then((colors) => {
        if (requestId === suggestionsRequestRef.current) {
          setColorSuggestions(colors);
        }
      })
      .catch(() => {
        if (requestId === suggestionsRequestRef.current) {
          setColorSuggestions('error');
        }
      });
  }

  // Debounced and re-triggered on every brushColor change -- matches the
  // toolbar copy's "based on the currently selected color." The debounce
  // keeps clicking through several swatches quickly from firing a network
  // request per intermediate color.
  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(paletteIndexToHex(brushColor)), SUGGESTION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [brushColor]);

  // A scheme request is deterministic for a fixed hex -- re-asking for the
  // same color's complement returns the identical result. jitterHex gives
  // the refresh button something new to look at each click without
  // actually changing the selected brush color.
  function handleRefreshSuggestions() {
    fetchSuggestions(jitterHex(paletteIndexToHex(brushColor)));
  }

  // { x, y, clientX, clientY, owner } | null -- owner is whatever
  // getPixelOwner returned (null if that cell has never been painted).
  // clientX/clientY position the popover; see PaintCanvas's onInspectPixel.
  const [inspectedPixel, setInspectedPixel] = useState(null);

  // Held in a ref, mutated in place via push(), rather than React state --
  // a chunk commits every ~28px/250ms while dragging, and rebuilding this
  // from scratch on every one of those scales with the entire session's
  // painted history instead of just what's new. Seeded synchronously here
  // (not in a useEffect) so existing history is visible on the first paint.
  const pixelsRef = useRef(null);
  if (pixelsRef.current === null) {
    const grid = getCanvasState();
    pixelsRef.current = Object.entries(grid).map(([key, value]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, paletteIndex: value.paletteIndex };
    });
  }

  // pixelsRef.current is always the same array object (mutated, not
  // replaced), so PaintCanvas can't tell "something changed" from its
  // reference the way it normally would with React data -- this version
  // counter is the actual change signal instead.
  const [pixelsVersion, setPixelsVersion] = useState(0);

  // Our own strokes flow through this same subscription rather than being
  // applied locally on submit -- treating "what I just painted" and "what a
  // peer just painted" identically keeps there from being two separate
  // code paths that could drift apart.
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type !== 'stroke') {
        return;
      }
      event.pixels.forEach(({ x, y, paletteIndex }) => {
        pixelsRef.current.push({ x, y, paletteIndex });
      });
      setPixelsVersion((v) => v + 1);
    });
    return unsubscribe;
  }, []);

  const brush = { shape: BRUSH_SHAPE, size: brushSize, paletteIndex: brushColor };

  // Snaps the suggestion's arbitrary RGB onto the nearest real palette
  // slot -- same hexToPaletteIndex a custom-picker pick or a quick swatch
  // resolves through, so adopting a suggestion is the exact same kind of
  // selection as any other color pick.
  function handleSelectSuggestion(hex) {
    setBrushColor(hexToPaletteIndex(hex));
  }

  function handleStrokeChunk(chunk) {
    submitStroke({ ...chunk, username: username ?? 'anon_guest' });
  }

  function handleInspectPixel({ x, y, clientX, clientY }) {
    setInspectedPixel({ x, y, clientX, clientY, owner: getPixelOwner(x, y) });
  }

  function handleCloseInspector() {
    setInspectedPixel(null);
  }

  return (
    <>
      {/* Application data placeholder: the live shared canvas */}
      <section id="canvas-section" className="panel">
        <h2>The Wall</h2>
        <p>Click any painted pixel to see who painted it and when.</p>
        <p>
          The canvas automatically updates in real-time as you paint on the wall. Select your brush and start painting!
        </p>
        <div id="canvas-scroll" className="canvas-scroll">
          <PaintCanvas
            id="paintwall-canvas"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            pixels={pixelsRef.current}
            pixelsVersion={pixelsVersion}
            brush={brush}
            tool={tool}
            onStrokeChunk={handleStrokeChunk}
            onInspectPixel={handleInspectPixel}
          >
            Your browser does not support the canvas element. This is where the shared pixel
            wall will be rendered.
          </PaintCanvas>
        </div>

        {inspectedPixel && (
          <>
            <div className="bubble-backdrop" onClick={handleCloseInspector}></div>
            <div className="pixel-inspector" style={{ left: inspectedPixel.clientX + 12, top: inspectedPixel.clientY + 12 }}>
              <button type="button" className="bubble-close-btn" aria-label="Close" onClick={handleCloseInspector}>
                &times;
              </button>
              {inspectedPixel.owner ? (
                <p>
                  Painted by <strong>{inspectedPixel.owner.username}</strong>
                  <br />
                  {new Date(inspectedPixel.owner.paintedAt).toLocaleString()}
                </p>
              ) : (
                <p>This pixel hasn&apos;t been painted yet.</p>
              )}
            </div>
          </>
        )}

        <div id="toolbar" className="toolbar">
          <h3>Drawing Tools</h3>

          <div className="toolbar-controls">
            <div id="tool-select" role="group" aria-label="Tool">
              <button type="button" id="brush-tool-btn" aria-pressed={tool === 'brush'} onClick={() => setTool('brush')}>
                Brush
              </button>
              <button type="button" id="hand-tool-btn" aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}>
                Hand
              </button>
            </div>

            <div className="field toolbar-push">
              <label htmlFor="brush-style">Brush style</label>
              <select id="brush-style" name="brush-style">
                <option value="round">Round</option>
                <option value="square">Square</option>
                <option value="spray">Spray</option>
                <option value="calligraphy">Calligraphy</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="brush-size">Brush size</label>
              <input
                type="range"
                id="brush-size"
                name="brush-size"
                min={MIN_BRUSH_SIZE}
                max={MAX_BRUSH_SIZE}
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
              />
            </div>

            <div className="field">
              <label id="color-picker-label">Brush color</label>
              <BrushColorControl selectedIndex={brushColor} onSelect={setBrushColor} />
            </div>
          </div>

          <fieldset id="palette-fieldset">
            <legend>Color palette suggestions</legend>
            <p>
              Complementary colors pulled from the
              <a href="https://www.thecolorapi.com/" target="_blank" rel="noopener">TheColorAPI</a>
              third party service, based on the currently selected color. Click one to paint with it.
            </p>
            <button
              type="button"
              id="refresh-suggestions-btn"
              onClick={handleRefreshSuggestions}
              disabled={colorSuggestions === null}
            >
              Refresh suggestions
            </button>
            {colorSuggestions === 'error' ? (
              <p className="palette-suggestions-status">Couldn&apos;t reach TheColorAPI -- try again in a moment.</p>
            ) : colorSuggestions === null ? (
              <p className="palette-suggestions-status">Loading suggestions&hellip;</p>
            ) : (
              <ul id="palette-suggestions">
                {colorSuggestions.map((color) => (
                  <li key={color.hex}>
                    <button
                      type="button"
                      className="swatch suggested-color-btn"
                      style={{ backgroundColor: color.hex }}
                      onClick={() => handleSelectSuggestion(color.hex)}
                      aria-label={`Use ${color.name}, ${color.hex}`}
                    />
                    <span>{color.name} ({color.hex})</span>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          <button type="button" id="save-wall-btn">Save Wall</button>
        </div>

        {/* Mobile-only: reveal the palette/activity panels without scrolling the page */}
        <div className="mobile-panel-toggles">
          <input type="checkbox" id="palette-toggle" className="panel-toggle-input" />
          <label htmlFor="palette-toggle" className="panel-toggle-btn">Palette</label>
          <label htmlFor="palette-toggle" className="panel-backdrop"></label>

          <input type="checkbox" id="activity-toggle" className="panel-toggle-input" />
          <label htmlFor="activity-toggle" className="panel-toggle-btn">Activity</label>
          <label htmlFor="activity-toggle" className="panel-backdrop"></label>
        </div>
      </section>

      {/* WebSocket data placeholder */}
      <section id="activity-section" className="panel">
        <h2>Live Activity</h2>
        <p><span id="live-user-count">3</span> people are viewing the wall right now.</p>
        <ul id="activity-feed">
          <li>CalebD started painting a stroke near (120, 84)</li>
          <li>Sarah finished a stroke at (300, 12)</li>
          <li>anon_guest joined the wall</li>
        </ul>
      </section>
    </>
  );
}