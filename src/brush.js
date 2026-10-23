// Pure brush-shape + stroke-rasterization helpers. Shared by PaintCanvas
// (live optimistic drawing while dragging) and canvasApi.submitStroke
// (canonical persistence) so the two can never disagree about which pixels
// a given stroke actually touches.

export const CHUNK_DISTANCE_PX = 28; // "n" -- flush a chunk after the path travels this far
export const CHUNK_TIME_MS = 250; // ...or after this much time, whichever comes first

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
  // TODO: circle-fill within radius `size` around (cx, cy) for 'round'.
  return [];
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
  // TODO
  return [];
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
  // TODO
  return [];
}
