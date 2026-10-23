// Pure XP/leveling math -- no storage, no React. xpForLevel(n) follows an
// n^1.2 power curve (an "exponential" leveling feel, just gentler than a
// true exponential), scaled so completing level 1 takes ~500 xp.

export const XP_LEVEL_BASE = 500;
export const XP_LEVEL_EXPONENT = 1.2;

/** Cumulative xp needed to complete `level` (i.e. to advance to level+1). */
export function xpForLevel(level) {
  return Math.round(XP_LEVEL_BASE * Math.pow(level, XP_LEVEL_EXPONENT));
}

/** Everyone starts at level 1 with 0 xp; each xpForLevel(n) threshold crossed advances one level. */
export function getLevel(xp) {
  let level = 1;
  while (xpForLevel(level) <= xp) {
    level += 1;
  }
  return level;
}

/** @returns {{level:number, xp:number, currentLevelXp:number, xpForThisLevel:number, nextThreshold:number}} */
export function getLevelProgress(xp) {
  const level = getLevel(xp);
  const prevThreshold = level === 1 ? 0 : xpForLevel(level - 1);
  const nextThreshold = xpForLevel(level);
  return {
    level,
    xp,
    currentLevelXp: xp - prevThreshold,
    xpForThisLevel: nextThreshold - prevThreshold,
    nextThreshold,
  };
}
