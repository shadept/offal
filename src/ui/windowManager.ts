/**
 * Window manager — z-index ordering for MMO-style draggable panels.
 */

let topZ = 1200;

/** Bring a window to front. Returns the new z-index to apply. */
export function bringToFront(): number {
  return ++topZ;
}
