import React, { useState, useEffect, useRef } from 'react';
import { BrushColorControl, DEFAULT_BRUSH_COLOR } from '../canvas/BrushColorControl';
import { PaintCanvas, drawPixels } from '../canvas/PaintCanvas';
import {
  getCanvasState,
  getPixelOwner,
  subscribe,
  submitStroke,
  clearCanvas,
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
const ACTIVITY_FEED_LIMIT = 15; // most-recent-first, capped so a long session doesn't grow this list unboundedly

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
        if (requestId !== suggestionsRequestRef.current) {
          return;
        }
        // TheColorAPI's colors are arbitrary RGB; our palette only has 256
        // slots, so two visually-distinct suggestions can quantize to the
        // exact same paintable color. Showing both would be a confusing
        // duplicate once you can only ever pick one or the other.
        const seenPaletteIndices = new Set();
        const deduped = colors.filter((color) => {
          const paletteIndex = hexToPaletteIndex(color.hex);
          if (seenPaletteIndices.has(paletteIndex)) {
            return false;
          }
          seenPaletteIndices.add(paletteIndex);
          return true;
        });
        setColorSuggestions(deduped);
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

  // Distinct usernames seen this session (real strokes and simulated
  // fake-peer ones alike), including yourself -- there's no real presence
  // tracking in this mock (no join/leave, no real other clients), so this
  // is deliberately simple: a monotonically-growing count of "who's shown
  // up," not an attempt to fake accurate live join/leave dynamics.
  const viewerUsernamesRef = useRef(new Set());
  const [viewerCount, setViewerCount] = useState(0);
  const [activityFeed, setActivityFeed] = useState([]);

  // AuthContext resolves username asynchronously, so this can't just be a
  // useRef lazy initializer -- re-seed whenever it actually changes.
  useEffect(() => {
    if (username && !viewerUsernamesRef.current.has(username)) {
      viewerUsernamesRef.current.add(username);
      setViewerCount(viewerUsernamesRef.current.size);
    }
  }, [username]);

  // Our own strokes flow through this same subscription rather than being
  // applied locally on submit -- treating "what I just painted" and "what a
  // peer just painted" identically keeps there from being two separate
  // code paths that could drift apart.
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'stroke') {
        event.pixels.forEach(({ x, y, paletteIndex }) => {
          pixelsRef.current.push({ x, y, paletteIndex });
        });
        setPixelsVersion((v) => v + 1);
        return;
      }

      if (event.type === 'activity') {
        const newMessages = [];
        if (!viewerUsernamesRef.current.has(event.username)) {
          viewerUsernamesRef.current.add(event.username);
          setViewerCount(viewerUsernamesRef.current.size);
          newMessages.push(`${event.username} joined the wall`);
        }
        newMessages.push(event.message);
        // "joined" reads naturally above "painted" for the same instant --
        // not reversed, since newMessages is already built in that order.
        setActivityFeed((prev) => [...newMessages, ...prev].slice(0, ACTIVITY_FEED_LIMIT));
        return;
      }

      if (event.type === 'clear') {
        pixelsRef.current = [];
        setPixelsVersion((v) => v + 1);
        setInspectedPixel(null);
      }
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

  // A confirm() guard since this wipes the shared wall for everyone, not
  // just this browser -- cheap insurance against a stray click. The actual
  // reset (pixelsRef, pixelsVersion) happens in the subscription above,
  // not here, same as a real stroke: this just tells canvasApi it happened.
  //
  // Dismissing window.confirm() restores focus to the button that opened
  // it, and since this one sits below a tall canvas, the browser's own
  // scroll-focused-element-into-view behavior can shove the page down
  // hundreds of pixels to do that -- scrolling the now-cleared canvas
  // half off-screen. scrollIntoView pulls it back immediately after.
  function handleClearCanvas() {
    if (window.confirm('Clear the entire wall? This cannot be undone.')) {
      clearCanvas();
      document.getElementById('paintwall-canvas')?.scrollIntoView({ block: 'nearest' });
    }
  }

  function handleInspectPixel({ x, y, clientX, clientY }) {
    setInspectedPixel({ x, y, clientX, clientY, owner: getPixelOwner(x, y) });
  }

  function handleCloseInspector() {
    setInspectedPixel(null);
  }

  // Exports from pixelsRef.current directly, not PaintCanvas's live DOM
  // canvas -- keeps PaintCanvas's "I just render what I'm given" contract
  // intact (no reaching into it via a forwarded ref), and it's the same
  // authoritative data either way. Built on a detached canvas (never
  // attached to the DOM -- not required for drawing or export) rather than
  // the real one so this can't interfere with whatever's on screen.
  async function handleSaveWall() {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = CANVAS_WIDTH;
    exportCanvas.height = CANVAS_HEIGHT;
    const ctx = exportCanvas.getContext('2d');

    // JPEG has no alpha channel -- without an opaque fill first, every
    // never-painted pixel would otherwise come out black instead of blank.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    drawPixels(ctx, pixelsRef.current);

    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const filename = `Paintwall-${timestamp}.jpg`;

    exportCanvas.toBlob(async (blob) => {
      if (!blob) {
        return;
      }

      // Chromium-only: the actual "choose where to save" file picker.
      // Firefox/Safari don't implement it at all, so this falls back to a
      // plain download link there -- that always goes wherever the
      // browser's own download setting points, which a webpage can't
      // override.
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'JPEG image', accept: { 'image/jpeg': ['.jpg'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          return;
        } catch (err) {
          if (err.name === 'AbortError') {
            return; // user cancelled the save dialog -- not a failure
          }
          // fall through to the standard download below
        }
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.92);
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
                    <span className="suggestion-name">{color.name}</span>
                    <span className="suggestion-hex">({color.hex})</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="palette-footer-row">
              <button
                type="button"
                id="refresh-suggestions-btn"
                onClick={handleRefreshSuggestions}
                disabled={colorSuggestions === null}
              >
                Color Palette Suggestions
              </button>

              <p className="palette-credit">
                Colors suggested by <a href="https://www.thecolorapi.com/" target="_blank" rel="noopener">TheColorAPI</a>
              </p>
            </div>
          </fieldset>

          <button type="button" id="save-wall-btn" onClick={handleSaveWall}>Save Wall</button>
          <button type="button" id="clear-canvas-btn" onClick={handleClearCanvas}>Clear Canvas (Testing)</button>
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
        <p><span id="live-user-count">{viewerCount}</span> people are viewing the wall right now.</p>
        <ul id="activity-feed">
          {activityFeed.length === 0 ? (
            <li>No activity yet &mdash; start painting!</li>
          ) : (
            activityFeed.map((message, index) => <li key={index}>{message}</li>)
          )}
        </ul>
      </section>
    </>
  );
}