// Controlled <canvas> painting surface, shared by the shared wall and the
// personal avatar editor. It doesn't know about canvasApi at all -- it just
// renders whatever `pixels` it's given, draws brush dabs live while the
// user drags, and reports stroke chunks upward via onStrokeChunk. The
// parent decides what a chunk means to it (submitStroke for the wall,
// local-only accumulation for the avatar).
//
// Stroke chunking: rather than reporting one giant stroke at mouseup, this
// fires onStrokeChunk every CHUNK_DISTANCE_PX of path travelled OR every
// CHUNK_TIME_MS, whichever comes first (so slow or barely-moving strokes
// still get reported promptly, not just long fast ones), plus one final
// flush on mouseup for whatever's left over. Each chunk's point list starts
// with the previous chunk's last point, so two independently-rasterized
// chunks still connect with no seam.

import React, { useRef, useEffect } from 'react';
import { rasterizeStroke, interpolatePoints, CHUNK_DISTANCE_PX, CHUNK_TIME_MS } from './brush';

/**
 * @param {number} width - canvas backing width, in pixels
 * @param {number} height - canvas backing height, in pixels
 * @param {{x:number,y:number,paletteIndex:number}[]} pixels - committed pixels to render (parent-owned)
 * @param {{shape:string, size:number, paletteIndex:number}} brush - current tool config
 * @param {(chunk: {points:{x:number,y:number}[], shape:string, size:number, paletteIndex:number}) => void} onStrokeChunk
 */
export function PaintCanvas({ width, height, pixels, brush, onStrokeChunk }) {
  const canvasRef = useRef(null);

  // Holds the in-progress drag's not-yet-flushed state across mousemove
  // calls without triggering re-renders -- none of this is ever rendered
  // from directly (the canvas draws imperatively), so it doesn't belong in
  // useState.
  const strokeRef = useRef(null); // { lastPoint, pendingPoints, distanceSinceFlush, lastFlushTime }

  // TODO: redraw the full committed `pixels` list onto the canvas whenever
  // it changes (and on mount).
  useEffect(() => {
  }, [pixels]);

  function canvasPointFromEvent(event) {
    // TODO: convert event.clientX/clientY to canvas-pixel coordinates,
    // accounting for getBoundingClientRect's CSS-vs-backing-size scale.
    return { x: 0, y: 0 };
  }

  function drawDabs(points) {
    // TODO: draw brush-shaped dabs for these points directly onto the
    // canvas context, using brush.shape/brush.size/brush.paletteIndex --
    // this is the optimistic live-preview path, independent of chunking.
  }

  function flushChunk() {
    // TODO: if strokeRef.current.pendingPoints has more than just the seam
    // point, call onStrokeChunk(...) with them, then reset pendingPoints to
    // just the last point (seam continuity) and reset the distance/time
    // trackers.
  }

  function handleMouseDown(event) {
    // TODO: start strokeRef with the first point.
  }

  function handleMouseMove(event) {
    // TODO: if not dragging, return. Otherwise: interpolate from the last
    // point, append to pendingPoints, drawDabs on the new points, add to
    // distanceSinceFlush, and call flushChunk() if distanceSinceFlush >=
    // CHUNK_DISTANCE_PX or (Date.now() - lastFlushTime) >= CHUNK_TIME_MS.
  }

  function handleMouseUp() {
    // TODO: flushChunk() for any remainder, then clear strokeRef.
  }

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  );
}
