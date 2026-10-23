import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { BrushColorControl, DEFAULT_BRUSH_COLOR } from '../canvas/BrushColorControl';
import { PaintCanvas } from '../canvas/PaintCanvas';
import { loadAvatar, saveAvatar, getUserXp } from '../canvas/canvasApi';
import { rasterizeStroke, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE } from '../canvas/brush';
import { getLevelProgress } from '../canvas/xp';

const DEFAULT_BRUSH_SIZE = 5;
const BRUSH_SHAPE = 'round'; // only shape implemented so far -- avatar-brush-style select below isn't wired to this yet
const AVATAR_SIZE = 400;

export function Profile() {
  const { username, notifyAvatarChanged } = useAuth();
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);

  // Same append-only contract PaintCanvas expects from Wall.jsx (see its
  // own pixelsRef), seeded from this user's saved avatar instead of the
  // shared wall. Painting only ever updates this local state -- nothing
  // reaches canvasApi.saveAvatar until "Set Avatar" is clicked.
  const pixelsRef = useRef(null);
  if (pixelsRef.current === null) {
    pixelsRef.current = username ? loadAvatar(username) ?? [] : [];
  }
  const [pixelsVersion, setPixelsVersion] = useState(0);

  // AuthContext resolves username asynchronously after mount, so re-seed
  // once it's known (and again on switching accounts without a reload).
  useEffect(() => {
    pixelsRef.current = username ? loadAvatar(username) ?? [] : [];
    setPixelsVersion((v) => v + 1);
  }, [username]);

  const brush = { shape: BRUSH_SHAPE, size: brushSize, paletteIndex: brushColor };

  // XP only ever comes from canvasApi.submitStroke (wall painting), never
  // from the local-only avatar canvas above -- matches the stats copy
  // below ("pixels the server receives from you on the wall"). A plain
  // read here (not a subscription) is enough: it's recomputed on every
  // render, and the only realistic way this page is open while xp changes
  // is this same tab re-rendering for some other reason anyway.
  const xpStanding = username ? getUserXp(username) : { xp: 0 };
  const levelProgress = getLevelProgress(xpStanding.xp);

  // rasterizeStroke here mirrors exactly what canvasApi.submitStroke does
  // for the wall, just without any persistence/notify step -- the avatar
  // has no canonical server-side grid to stay in sync with.
  function handleStrokeChunk(chunk) {
    rasterizeStroke(chunk, AVATAR_SIZE, AVATAR_SIZE).forEach(({ x, y }) => {
      pixelsRef.current.push({ x, y, paletteIndex: chunk.paletteIndex });
    });
    setPixelsVersion((v) => v + 1);
  }

  // Repainting the same cell across multiple chunks appends a new entry
  // each time rather than overwriting one in place (pixelsRef is
  // append-only, same tradeoff as Wall.jsx's pixelsRef) -- fine for live
  // drawing since overdrawing a pixel is harmless, but worth deduping
  // before it's what actually gets persisted, since the avatar is meant to
  // "stay small and simple to store". A plain Map pass is cheap here
  // because it only runs on this explicit, infrequent click, not per chunk.
  function handleSetAvatar() {
    const deduped = new Map();
    pixelsRef.current.forEach(({ x, y, paletteIndex }) => {
      deduped.set(`${x},${y}`, { x, y, paletteIndex });
    });
    saveAvatar(username, [...deduped.values()]);
    notifyAvatarChanged(); // tells the header's AvatarIcon (a different part of the tree) to re-read it
  }

  return (
    <>
      {/* Database data placeholder: XP earned from pixels painted on the wall */}
      <section id="stats-section" className="panel">
        {username ? (
          <>
            <div className="stats-header">
              <h2 id="stats-username">{username}</h2>
              <div className="field-tooltip-wrap">
                <progress id="xp-bar" value={levelProgress.currentLevelXp} max={levelProgress.xpForThisLevel} tabIndex={0}>
                  {Math.round((levelProgress.currentLevelXp / levelProgress.xpForThisLevel) * 100)}%
                </progress>
                <p className="field-tooltip" role="tooltip">
                  Every batch of pixels the server receives from you on the wall adds experience.
                  Level up the more you paint!
                </p>
              </div>
            </div>
            <p>
              <span id="xp-label">
                {levelProgress.currentLevelXp.toLocaleString()} / {levelProgress.xpForThisLevel.toLocaleString()} XP
              </span>{' '}
              to Level {levelProgress.level + 1}
            </p>
          </>
        ) : (
          <p>Log in to see stats and create avatar</p>
        )}
      </section>

      {/* Application data placeholder: the user's personal avatar canvas */}
      <section id="avatar-section" className="panel">
        <h2>My Avatar</h2>
        {username ? (
          <>
            <p>
              Paint your own 400&times;400 avatar using the same tools as the wall. It is not
              associated with pixel ownership, so it stays small and simple to store.
            </p>
            <p>
              Unlike the wall, your avatar is <strong>not</strong> sent to the server as you
              paint. It stays local to your browser until you click "Set Avatar" below.
            </p>

            <PaintCanvas
              id="avatar-canvas"
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              pixels={pixelsRef.current}
              pixelsVersion={pixelsVersion}
              brush={brush}
              onStrokeChunk={handleStrokeChunk}
            >
              Your browser does not support the canvas element. This is where your avatar will be
              painted.
            </PaintCanvas>

            <div id="avatar-toolbar" className="toolbar">
              <h3>Drawing Tools</h3>

              <div className="toolbar-controls">
                <div className="field">
                  <label htmlFor="avatar-brush-style">Brush style</label>
                  <select id="avatar-brush-style" name="avatar-brush-style">
                    <option value="round">Round</option>
                    {/* Not implemented yet -- round is the only shape brush.js/PaintCanvas support right now.
                    <option value="square">Square</option>
                    <option value="spray">Spray</option>
                    <option value="calligraphy">Calligraphy</option>
                    */}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="avatar-brush-size">Brush size</label>
                  <input
                    type="range"
                    id="avatar-brush-size"
                    name="avatar-brush-size"
                    min={MIN_BRUSH_SIZE}
                    max={MAX_BRUSH_SIZE}
                    value={brushSize}
                    onChange={(event) => setBrushSize(Number(event.target.value))}
                  />
                </div>

                <div className="field">
                  <label id="avatar-color-picker-label">Brush color</label>
                  <BrushColorControl selectedIndex={brushColor} onSelect={setBrushColor} />
                </div>
              </div>

              <button type="button" id="set-avatar-btn" onClick={handleSetAvatar}>Set Avatar</button>
            </div>
          </>
        ) : (
          <p>Log in above to create and save an avatar.</p>
        )}
      </section>
    </>
  );
}
