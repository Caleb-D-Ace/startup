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
import { getBrushCells, interpolatePoints, CHUNK_DISTANCE_PX, CHUNK_TIME_MS } from './brush';
import { paletteIndexToHex } from './canvasApi';

/**
 * @param {string} [id] - forwarded to the underlying <canvas>, so existing
 *   CSS targeting a specific canvas by id keeps working.
 * @param {number} width - canvas backing width, in pixels
 * @param {number} height - canvas backing height, in pixels
 * @param {{x:number,y:number,paletteIndex:number}[]} pixels - committed pixels to render (parent-owned)
 * @param {{shape:string, size:number, paletteIndex:number}} brush - current tool config
 * @param {(chunk: {points:{x:number,y:number}[], shape:string, size:number, paletteIndex:number}) => void} onStrokeChunk
 * @param {React.ReactNode} [children] - fallback content for browsers without canvas support
 */
export function PaintCanvas({ id, width, height, pixels, brush, onStrokeChunk, children }) {
  const canvasRef = useRef(null);

  // Holds the in-progress drag's not-yet-flushed state across mousemove
  // calls without triggering re-renders -- none of this is ever rendered
  // from directly (the canvas draws imperatively), so it doesn't belong in
  // useState. newPointCount is tracked separately from pendingPoints.length
  // because pendingPoints is re-seeded with the previous chunk's last point
  // for seam continuity -- that seed alone shouldn't count as "new content
  // worth flushing" (a plain click with no movement needs to still flush
  // its single mousedown point, but a flush triggered with nothing but a
  // leftover seam point should not send an empty-looking chunk).
  const strokeRef = useRef(null); // { lastPoint, pendingPoints, newPointCount, distanceSinceFlush, lastFlushTime }

  // Redraws the full committed `pixels` list from scratch whenever it
  // changes (and on mount) -- simple full-clear-and-redraw rather than
  // incremental, which is fine at this scale (sparse pixel counts, local
  // mock storage).
  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, width, height);
    pixels.forEach(({ x, y, paletteIndex }) => {
      ctx.fillStyle = paletteIndexToHex(paletteIndex);
      ctx.fillRect(x, y, 1, 1);
    });
  }, [pixels, width, height]);

  function canvasPointFromEvent(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.round((event.clientX - rect.left) * scaleX),
      y: Math.round((event.clientY - rect.top) * scaleY),
    };
  }

  // Draws brush-shaped dabs directly onto the canvas for these points --
  // the optimistic live-preview path, called on every mousemove regardless
  // of the chunk-flush cadence so the trail never looks segmented. Reuses
  // getBrushCells (the exact same cells rasterizeStroke/submitStroke will
  // later commit) rather than ctx.arc(), so the live preview is
  // pixel-identical to what actually gets persisted.
  function drawDabs(points) {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = paletteIndexToHex(brush.paletteIndex);
    points.forEach(({ x, y }) => {
      getBrushCells(brush.shape, brush.size, x, y).forEach((cell) => {
        ctx.fillRect(cell.x, cell.y, 1, 1);
      });
    });
  }

  function flushChunk() {
    const stroke = strokeRef.current;
    if (!stroke || stroke.newPointCount === 0) {
      return;
    }

    onStrokeChunk({
      points: stroke.pendingPoints,
      shape: brush.shape,
      size: brush.size,
      paletteIndex: brush.paletteIndex,
    });

    stroke.pendingPoints = [stroke.lastPoint]; // seam continuity for the next chunk
    stroke.newPointCount = 0;
    stroke.distanceSinceFlush = 0;
    stroke.lastFlushTime = Date.now();
  }

  function handleMouseDown(event) {
    const point = canvasPointFromEvent(event);
    strokeRef.current = {
      lastPoint: point,
      pendingPoints: [point],
      newPointCount: 1,
      distanceSinceFlush: 0,
      lastFlushTime: Date.now(),
    };
    drawDabs([point]);
  }

  function handleMouseMove(event) {
    const stroke = strokeRef.current;
    if (!stroke) {
      return;
    }

    const point = canvasPointFromEvent(event);
    if (point.x === stroke.lastPoint.x && point.y === stroke.lastPoint.y) {
      return; // no actual movement -- skip redundant work
    }

    const newPoints = interpolatePoints(stroke.lastPoint, point, brush.size);
    drawDabs(newPoints);

    newPoints.forEach((p) => {
      const dx = p.x - stroke.lastPoint.x;
      const dy = p.y - stroke.lastPoint.y;
      stroke.distanceSinceFlush += Math.sqrt(dx * dx + dy * dy);
      stroke.pendingPoints.push(p);
      stroke.newPointCount += 1;
      stroke.lastPoint = p;
    });

    const elapsed = Date.now() - stroke.lastFlushTime;
    if (stroke.distanceSinceFlush >= CHUNK_DISTANCE_PX || elapsed >= CHUNK_TIME_MS) {
      flushChunk();
    }
  }

  function handleMouseUp() {
    if (!strokeRef.current) {
      return;
    }
    flushChunk();
    strokeRef.current = null;
  }

  return (
    <canvas
      id={id}
      ref={canvasRef}
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {children}
    </canvas>
  );
}
