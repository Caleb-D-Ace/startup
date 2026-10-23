// Pure brush-shape + stroke-rasterization helpers. Shared by PaintCanvas
// (live optimistic drawing while dragging) and canvasApi.submitStroke
// (canonical persistence) so the two can never disagree about which pixels
// a given stroke actually touches.

export const CHUNK_DISTANCE_PX = 28; // "n" -- flush a chunk after the path travels this far
export const CHUNK_TIME_MS = 250; // ...or after this much time, whichever comes first

// Brush radius bounds, in pixels. MIN keeps a dab from shrinking to
// single-pixel precision (so painting over one specific pixel of someone
// else's work takes a deliberate zoomed-in effort, not an easy accident);
// MAX caps a single dab at 100px across so one stroke can't blot out a
// large area of the shared wall in an instant.
export const MIN_BRUSH_SIZE = 2;
export const MAX_BRUSH_SIZE = 50;

/**
 * The set of {x, y} canvas-pixel cells one brush dab covers, centered at
 * (cx, cy). Only 'round' is implemented for now; other shapes land later
 * without changing this function's signature.
 * @param {'round'} shape
 * @param {number} size - brush radius in pixels
 * @param {number} cx
 * @param {number} cy
 * @returns {{x: number, y: number}[]}
 */
export function getBrushCells(shape, size, cx, cy) {
  // Only 'round' exists today, so this doesn't branch on `shape` yet -- a
  // future shape adds a branch here, not a signature change.
  const cells = [];
  const radiusSquared = size * size;
  for (let dy = -size; dy <= size; dy++) {
    for (let dx = -size; dx <= size; dx++) {
      if (dx * dx + dy * dy <= radiusSquared) {
        cells.push({ x: cx + dx, y: cy + dy });
      }
    }
  }
  return cells;
}

/**
 * Fills the gap between two points with intermediate points, spaced closely
 * enough that brush dabs from consecutive points overlap -- otherwise a
 * fast drag (sparse mousemove samples) leaves holes in the stroke.
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {number} size - brush radius, used to pick a safe step spacing
 * @returns {{x:number,y:number}[]} intermediate points, NOT including `from`, including `to`
 */
export function interpolatePoints(from, to, size) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Half the radius -- consecutive dabs' circles overlap comfortably rather
  // than just barely touching, with a floor of 1px so size:0 (single-pixel
  // dabs) still steps forward instead of stalling.
  const step = Math.max(1, Math.floor(size / 2));

  if (distance <= step) {
    return [{ x: Math.round(to.x), y: Math.round(to.y) }];
  }

  const steps = Math.ceil(distance / step);
  const points = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: Math.round(from.x + dx * t),
      y: Math.round(from.y + dy * t),
    });
  }
  return points;
}

/**
 * Expands a stroke (or stroke chunk -- same shape either way) into the
 * full set of canvas-pixel cells it paints: interpolates gaps between
 * consecutive points, unions each point's brush dab, dedupes, and clips to
 * the canvas bounds.
 * @param {{points: {x:number,y:number}[], shape: string, size: number}} stroke
 * @param {number} canvasWidth
 * @param {number} canvasHeight
 * @returns {{x:number,y:number}[]}
 */
export function rasterizeStroke(stroke, canvasWidth, canvasHeight) {
  const { points, shape, size } = stroke;
  const seen = new Set();
  const cells = [];

  function addCell(x, y) {
    if (x < 0 || y < 0 || x >= canvasWidth || y >= canvasHeight) {
      return;
    }
    const key = `${x},${y}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    cells.push({ x, y });
  }

  if (points.length === 0) {
    return cells;
  }

  getBrushCells(shape, size, points[0].x, points[0].y).forEach(({ x, y }) => addCell(x, y));

  for (let i = 1; i < points.length; i++) {
    interpolatePoints(points[i - 1], points[i], size).forEach((point) => {
      getBrushCells(shape, size, point.x, point.y).forEach(({ x, y }) => addCell(x, y));
    });
  }

  return cells;
}
