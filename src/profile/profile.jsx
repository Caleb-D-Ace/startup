import React from 'react';

export function Profile() {
  return (
    <main>
      {/* Application data placeholder: the user's personal avatar canvas */}
      <section id="avatar-section" className="panel">
        <h2>My Avatar</h2>
        <p>
          Paint your own 400&times;400 avatar using the same tools as the wall. It is not
          associated with pixel ownership, so it stays small and simple to store.
        </p>
        <p>
          Unlike the wall, your avatar is <strong>not</strong> sent to the server as you
          paint. It stays local to your browser until you click "Set Avatar" below.
        </p>

        <canvas id="avatar-canvas" width="400" height="400">
          Your browser does not support the canvas element. This is where your avatar will be
          painted.
        </canvas>

        <div id="avatar-toolbar" className="toolbar">
          <h3>Drawing Tools</h3>

          <div className="toolbar-controls">
            <div className="field">
              <label htmlFor="avatar-brush-style">Brush style</label>
              <select id="avatar-brush-style" name="avatar-brush-style">
                <option value="round">Round</option>
                <option value="square">Square</option>
                <option value="spray">Spray</option>
                <option value="calligraphy">Calligraphy</option>
              </select>
            </div>

            <div className="field">
              <label id="avatar-color-picker-label">Brush color</label>
              <div id="avatar-color-picker" className="color-swatches" role="radiogroup" aria-labelledby="avatar-color-picker-label"></div>
            </div>

            <div className="field">
              <label htmlFor="avatar-brush-size">Brush size</label>
              <input type="range" id="avatar-brush-size" name="avatar-brush-size" min="1" max="50" value="5" />
            </div>
          </div>

          <button type="button" id="set-avatar-btn">Set Avatar</button>
        </div>
      </section>

      {/* Database data placeholder: XP earned from pixels painted on the wall */}
      <section id="stats-section" className="panel">
        <h2>Player Statistics</h2>
        <p>
          Every batch of pixels the server receives from you on the wall adds experience.
          Level up the more you paint!
        </p>
        <progress id="xp-bar" value="420" max="1000">42%</progress>
        <p><span id="xp-label">420 / 1000 XP</span> to Level 4</p>
      </section>
    </main>
  );
}