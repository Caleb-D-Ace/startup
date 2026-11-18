import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../AuthContext';
import { BrushColorControl, DEFAULT_BRUSH_COLOR } from '../canvas/BrushColorControl';
import { PaintCanvas } from '../canvas/PaintCanvas';
import { loadAvatar, saveAvatar } from '../canvas/canvasApi';
import { rasterizeStroke, MIN_BRUSH_SIZE, MAX_BRUSH_SIZE } from '../canvas/brush';
import { getLevelProgress } from '../canvas/xp';

const DEFAULT_BRUSH_SIZE = 5;
const BRUSH_SHAPE = 'round'; // only shape implemented so far -- avatar-brush-style select below isn't wired to this yet
const AVATAR_SIZE = 400;

export function Profile() {
  const { username, notifyAvatarChanged, xp } = useAuth();
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);

  // Seeded from this user's saved avatar, not the shared wall -- same
  // append-only contract as Wall.jsx's pixelsRef.
  const pixelsRef = useRef(null);
  if (pixelsRef.current === null) {
    pixelsRef.current = [];
  }
  const [pixelsVersion, setPixelsVersion] = useState(0);

  // Forces a full redraw when pixelsRef gets replaced, not appended to
  // (e.g. switching accounts) -- same reset signal wall.jsx uses.
  const [avatarResetToken, setAvatarResetToken] = useState(0);

  // True once the user has painted locally since the last load -- guards
  // against the fetch below clobbering fresh painting if it resolves after
  // they've already started drawing.
  const hasPaintedRef = useRef(false);

  // Re-fetches whenever username resolves or changes. cancelled guards
  // against a stale response landing after a newer fetch started.
  useEffect(() => {
    hasPaintedRef.current = false;
    if (!username) {
      pixelsRef.current = [];
      setPixelsVersion((v) => v + 1);
      setAvatarResetToken((t) => t + 1);
      return;
    }
    let cancelled = false;
    loadAvatar(username).then((avatar) => {
      if (cancelled || hasPaintedRef.current) {
        return;
      }
      pixelsRef.current = avatar ?? [];
      setPixelsVersion((v) => v + 1);
      setAvatarResetToken((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const brush = { shape: BRUSH_SHAPE, size: brushSize, paletteIndex: brushColor };

  // XP always comes from the server (wall painting), never the local
  // avatar canvas. AuthContext's xp is already kept current.
  const levelProgress = getLevelProgress(xp);

  // Mirrors canvasApi.submitStroke's rasterization, minus persistence, since
  // the avatar has no server-side grid to sync with.
  function handleStrokeChunk(chunk) {
    hasPaintedRef.current = true;
    rasterizeStroke(chunk, AVATAR_SIZE, AVATAR_SIZE).forEach(({ x, y }) => {
      pixelsRef.current.push({ x, y, paletteIndex: chunk.paletteIndex });
    });
    setPixelsVersion((v) => v + 1);
  }

  // Pass a deduped avatar drawing (to keep the image small and storable) to
  // the database.
  async function handleSetAvatar() {
    const deduped = new Map();
    pixelsRef.current.forEach(({ x, y, paletteIndex }) => {
      deduped.set(`${x},${y}`, { x, y, paletteIndex });
    });
    await saveAvatar([...deduped.values()]);
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
              resetToken={avatarResetToken}
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
