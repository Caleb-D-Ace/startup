import React from 'react';

export function Wall() {
  return (
    <main>
      {/* Application data placeholder: the live shared canvas */}
      <section id="canvas-section" className="panel">
        <h2>The Wall</h2>
        <p>Click any painted pixel to see who painted it and when.</p>
        <p>
          The canvas automatically updates in real-time as you paint on the wall. Select your brush and start painting!
        </p>
        <div id="canvas-scroll" className="canvas-scroll">
          <canvas id="paintwall-canvas" width="1280" height="720">
            Your browser does not support the canvas element. This is where the shared pixel
            wall will be rendered.
          </canvas>
        </div>

        

        <div id="toolbar" className="toolbar">
          <h3>Drawing Tools</h3>

          <div className="toolbar-controls">
            <div id="tool-select" role="group" aria-label="Tool">
              <button type="button" id="brush-tool-btn" aria-pressed="true">Brush</button>
              <button type="button" id="hand-tool-btn" aria-pressed="false">Hand</button>
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
              <label id="color-picker-label">Brush color</label>
              <div id="color-picker" className="color-swatches" role="radiogroup" aria-labelledby="color-picker-label"></div>
            </div>

            <div className="field">
              <label htmlFor="brush-size">Brush size</label>
              <input type="range" id="brush-size" name="brush-size" min="1" max="50" value="5" />
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
    </main>
  );
}