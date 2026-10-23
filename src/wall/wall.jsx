import React, { useState, useEffect, useRef } from 'react';
import { BrushColorControl, DEFAULT_BRUSH_COLOR } from '../BrushColorControl';
import { PaintCanvas } from '../PaintCanvas';
import { getCanvasState, getPixelOwner, subscribe, submitStroke, CANVAS_WIDTH, CANVAS_HEIGHT } from '../canvasApi';
import { MIN_BRUSH_SIZE, MAX_BRUSH_SIZE } from '../brush';
import { useAuth } from '../AuthContext';

const DEFAULT_BRUSH_SIZE = 5;
const BRUSH_SHAPE = 'round'; // only shape implemented so far -- brush-style select below isn't wired to this yet

export function Wall() {
  const { username } = useAuth();
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [tool, setTool] = useState('brush'); // 'brush' | 'hand'

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
              third party service will be listed here based on the currently selected color.
            </p>
            <ul id="palette-suggestions">
              <li>#3B7DDD (placeholder)</li>
              <li>#DD9F3B (placeholder)</li>
              <li>#3BDDA0 (placeholder)</li>
            </ul>
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