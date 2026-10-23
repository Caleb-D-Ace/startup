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
//
// Two tools: 'brush' paints (the above). 'hand' doesn't paint at all -- a
// short tap reports onInspectPixel, a drag pans. Pointer Events (not mouse
// events) unify mouse/touch/pen through one set of handlers, which is what
// makes touch panning possible at all. touch-action is set oppositely per
// tool -- 'none' for brush (so the browser doesn't fight a paint-drag for
// the gesture), 'auto' for hand (touch gets native scrolling for free;
// mouse drags are scrolled manually below, since plain drag doesn't
// scroll a div on its own).

import React, { useRef, useEffect } from 'react';
import { interpolatePoints, CHUNK_DISTANCE_PX, CHUNK_TIME_MS } from './brush';
import { paletteIndexToHex } from './canvasApi';

const HAND_DRAG_THRESHOLD_PX = 6; // client (screen) px -- below this, a hand-tool pointer-up counts as a tap, not a pan

/**
 * Fills `pixels[startIndex:]` onto `ctx`, one fillRect per pixel. Shared by
 * this component's own committed-pixel redraw and Wall.jsx's "Save Wall"
 * JPG export, so there's one definition of "what a pixel list actually
 * looks like drawn out" instead of two.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,paletteIndex:number}[]} pixels
 * @param {number} [startIndex] - defaults to 0 (draw everything)
 */
export function drawPixels(ctx, pixels, startIndex = 0) {
  for (let i = startIndex; i < pixels.length; i++) {
    const { x, y, paletteIndex } = pixels[i];
    ctx.fillStyle = paletteIndexToHex(paletteIndex);
    ctx.fillRect(x, y, 1, 1);
  }
}

/**
 * @param {string} [id] - forwarded to the underlying <canvas>, so existing
 *   CSS targeting a specific canvas by id keeps working.
 * @param {number} width - canvas backing width, in pixels
 * @param {number} height - canvas backing height, in pixels
 * @param {{x:number,y:number,paletteIndex:number}[]} pixels - committed pixels
 *   to render (parent-owned). Must be append-only -- a parent should only
 *   ever push new entries onto the same array (never replace it, reorder
 *   it, or mutate an existing entry), pairing each push with a bump to
 *   `pixelsVersion`. That's what lets this component pick up exactly where
 *   it left off on every update instead of re-scanning the whole thing.
 * @param {number} pixelsVersion - increments whenever `pixels` gets new
 *   entries appended. `pixels` itself is a stable array reference (mutated
 *   in place by the parent, not replaced), so this is the actual change
 *   signal -- React wouldn't otherwise notice anything happened.
 * @param {{shape:string, size:number, paletteIndex:number}} brush - current tool config
 * @param {'brush'|'hand'} [tool] - defaults to 'brush'.
 * @param {(chunk: {points:{x:number,y:number}[], shape:string, size:number, paletteIndex:number}) => void} onStrokeChunk
 * @param {(point: {x:number,y:number,clientX:number,clientY:number}) => void} [onInspectPixel] -
 *   fires on a tap (not a drag) while tool === 'hand'. clientX/clientY (the
 *   tap's viewport position) are included so the caller can anchor a
 *   popover there without having to re-derive it.
 * @param {React.ReactNode} [children] - fallback content for browsers without canvas support
 */
export function PaintCanvas({ id, width, height, pixels, pixelsVersion, brush, tool = 'brush', onStrokeChunk, onInspectPixel, children }) {
  const canvasRef = useRef(null);

  // In-progress drag state, kept out of useState since it's never rendered
  // from directly. newPointCount is separate from pendingPoints.length
  // because pendingPoints carries over a seam point after each flush, which
  // shouldn't itself count as new content worth flushing.
  const strokeRef = useRef(null); // { lastPoint, pendingPoints, newPointCount, distanceSinceFlush, lastFlushTime }

  // Hand-tool drag state -- separate from strokeRef since brush and hand
  // never run at the same time, but have no state shape in common.
  const panRef = useRef(null); // { startClientX, startClientY, lastClientX, lastClientY, scrollEl, moved }

  const drawnCountRef = useRef(0);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    drawPixels(ctx, pixels, drawnCountRef.current);
    drawnCountRef.current = pixels.length;
    // pixels is a stable, mutated-in-place reference -- pixelsVersion is
    // the real dependency; see the prop docs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixelsVersion]);

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

  // Optimistic live-preview dabs, drawn on every mousemove regardless of
  // the chunk-flush cadence so the trail never looks segmented. One
  // ctx.arc() fill per point, rather than looping getBrushCells and
  // filling each cell individually -- a single native draw call regardless
  // of brush size, much cheaper than thousands of 1x1 fillRects for a large
  // brush. This makes the live preview a geometric circle rather than
  // getBrushCells' exact lattice-point circle, so it can differ by a pixel
  // or two at a dab's edge from the canonical rasterization -- invisible at
  // normal sizes, and self-corrects once the chunk's real pixels land.
  function drawDabs(points) {
    const ctx = canvasRef.current.getContext('2d');
    ctx.fillStyle = paletteIndexToHex(brush.paletteIndex);
    points.forEach(({ x, y }) => {
      if (brush.size === 0) {
        ctx.fillRect(x, y, 1, 1);
        return;
      }
      ctx.beginPath();
      ctx.arc(x, y, brush.size, 0, Math.PI * 2);
      ctx.fill();
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

  function handlePointerDown(event) {
    if (tool === 'hand') {
      panRef.current = {
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        scrollEl: canvasRef.current.closest('.canvas-scroll'),
        moved: false,
      };
      return;
    }

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

  function handlePointerMove(event) {
    if (tool === 'hand') {
      const pan = panRef.current;
      if (!pan) {
        return;
      }

      if (!pan.moved) {
        const totalDx = event.clientX - pan.startClientX;
        const totalDy = event.clientY - pan.startClientY;
        if (Math.hypot(totalDx, totalDy) > HAND_DRAG_THRESHOLD_PX) {
          pan.moved = true;
        }
      }

      if (pan.moved && pan.scrollEl) {
        pan.scrollEl.scrollLeft -= event.clientX - pan.lastClientX;
        pan.scrollEl.scrollTop -= event.clientY - pan.lastClientY;
      }
      pan.lastClientX = event.clientX;
      pan.lastClientY = event.clientY;
      return;
    }

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

  function handlePointerUp(event) {
    if (tool === 'hand') {
      const pan = panRef.current;
      panRef.current = null;
      if (pan && !pan.moved && onInspectPixel) {
        const point = canvasPointFromEvent(event);
        onInspectPixel({ x: point.x, y: point.y, clientX: event.clientX, clientY: event.clientY });
      }
      return;
    }

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
      style={{ touchAction: tool === 'hand' ? 'auto' : 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {children}
    </canvas>
  );
}
