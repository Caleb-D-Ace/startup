// Server-local copies of the pure stroke-rasterization and XP/leveling math
// from src/canvas/brush.js and src/canvas/xp.js. Not imported from there --
// deployService.sh only ships service/'s own files (plus the built
// frontend) to the production host, so a cross-directory `../src/canvas/...`
// import that works in local dev throws ERR_MODULE_NOT_FOUND the moment
// this runs from its real deployed location. These are small, pure, stable
// functions; keeping service/ self-contained is worth the duplication risk
// here. If brush.js's shape/physics or xp.js's leveling curve ever change,
// mirror the change here too.

function getBrushCells(shape, size, cx, cy) {
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

function interpolatePoints(from, to, size) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
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

function rasterizeStroke(stroke, canvasWidth, canvasHeight) {
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

const XP_LEVEL_BASE = 10000;
const XP_LEVEL_EXPONENT = 2.5;

function xpForLevel(level) {
  return Math.round(XP_LEVEL_BASE * Math.pow(level, XP_LEVEL_EXPONENT));
}

function getLevel(xp) {
  let level = 1;
  while (xpForLevel(level) <= xp) {
    level += 1;
  }
  return level;
}

module.exports = { rasterizeStroke, getLevel };
