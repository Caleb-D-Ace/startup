// Small read-only rendering of a user's saved avatar -- not a PaintCanvas,
// no pointer events, nothing interactive. Draws once from loadAvatar's
// saved pixel data onto a canvas at the avatar's native resolution, then
// lets CSS scale it down to icon size (image-rendering: pixelated, scoped
// to just the canvas variant below, keeps that downscale crisp/blocky
// instead of blurring it, matching the rest of the app's pixel-art look).
//
// Before anyone's ever saved an avatar, there's nothing to draw -- falls
// back to the generic placeholder image instead of an empty square.

import React, { useEffect, useRef } from 'react';
import { loadAvatar, paletteIndexToHex } from './canvasApi';

const AVATAR_SIZE = 400; // must match Profile.jsx's AVATAR_SIZE -- that's what loadAvatar's saved coordinates are in
const GENERIC_AVATAR_SRC = '/images/generic_profile.png';

/**
 * @param {string|null} username
 * @param {number} avatarVersion - bump this (via AuthContext's
 *   notifyAvatarChanged) whenever the saved avatar changes, since this
 *   component has no other way to know a save happened elsewhere.
 * @param {number} [size] - displayed CSS size in px. Defaults to 32.
 */
export function AvatarIcon({ username, avatarVersion, size = 32 }) {
  const canvasRef = useRef(null);
  const pixels = username ? loadAvatar(username) : null;
  const hasAvatar = Boolean(pixels && pixels.length > 0);

  useEffect(() => {
    if (!hasAvatar) {
      return;
    }
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    pixels.forEach(({ x, y, paletteIndex }) => {
      ctx.fillStyle = paletteIndexToHex(paletteIndex);
      ctx.fillRect(x, y, 1, 1);
    });
    // pixels is re-read fresh from loadAvatar every render, not a stable
    // dependency -- username/avatarVersion/hasAvatar are the real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, avatarVersion, hasAvatar]);

  if (!hasAvatar) {
    return (
      <img
        src={GENERIC_AVATAR_SRC}
        alt=""
        className="avatar-icon"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={AVATAR_SIZE}
      height={AVATAR_SIZE}
      className="avatar-icon"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
