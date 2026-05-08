export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = 20;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

export const MAX_PLAYERS = 8;

export const MAP = {
  size: 60,
  // Y-coordinate of the capsule center at spawn = ground-rest height (height/2).
  // Spawning above floor would cause idle players to float forever, since the
  // server only integrates gravity when an input arrives.
  spawnHeight: 0.9,
} as const;

export const PLAYER = {
  radius: 0.4,
  height: 1.8,
  walkSpeed: 6.0,
  sprintSpeed: 9.0,
  jumpSpeed: 7.0,
  gravity: 22.0,
  maxHealth: 100,
  respawnMs: 3000,
} as const;

export const WEAPON = {
  damage: 25,
  fireIntervalMs: 120,
  magazineSize: 30,
  reloadMs: 1500,
  range: 80,
  spreadDeg: 1.5,
} as const;

export const NET = {
  interpolationDelayMs: 100,
  inputBufferMax: 60,
} as const;

export interface Obstacle {
  // World-space center of the box.
  readonly pos: readonly [number, number, number];
  // Half-extents (full size = 2 * half on each axis).
  readonly halfSize: readonly [number, number, number];
}

// Single source of truth for arena geometry. Both the client (rendering) and
// the server (collision) read from this list.
export const OBSTACLES: readonly Obstacle[] = [
  { pos: [-12, 1, -8], halfSize: [2, 1, 2] },
  { pos: [10, 1, -10], halfSize: [1.5, 1, 3] },
  { pos: [0, 1.5, 0], halfSize: [3, 1.5, 1] },
  { pos: [-15, 0.5, 12], halfSize: [4, 0.5, 1.5] },
  { pos: [14, 2, 8], halfSize: [1.5, 2, 1.5] },
  { pos: [6, 1, 14], halfSize: [2, 1, 2] },
  { pos: [-6, 0.75, -16], halfSize: [3, 0.75, 1] },
];
