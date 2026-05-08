export const TICK_HZ = 30;
export const TICK_MS = 1000 / TICK_HZ;
export const SNAPSHOT_HZ = 20;
export const SNAPSHOT_MS = 1000 / SNAPSHOT_HZ;

export const MAX_PLAYERS = 8;

export const MAP = {
  size: 60,
  spawnHeight: 2,
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
