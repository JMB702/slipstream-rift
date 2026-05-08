import { PLAYER, MAP, type PlayerState, type Vec3 } from '@slipstream/shared';

export interface ServerPlayer extends PlayerState {
  connectionId: string;
  pendingInputSeq: number;
  grounded: boolean;
  // Wall-clock time (ms, server frame) of the last physics integration.
  // runTick uses this to fill gaps when a player isn't sending inputs so they
  // don't freeze in mid-air after spawn or during an AFK pause.
  lastIntegratedAt: number;
}

export const initialPlayer = (
  connectionId: string,
  id: string,
  name: string,
  spawn: Vec3,
  now: number,
): ServerPlayer => ({
  id,
  connectionId,
  name,
  position: spawn,
  velocity: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  health: PLAYER.maxHealth,
  alive: true,
  respawnAt: null,
  ammo: 30,
  reloading: false,
  reloadDoneAt: null,
  kills: 0,
  deaths: 0,
  lastSeenSeq: 0,
  pendingInputSeq: 0,
  grounded: true,
  lastIntegratedAt: now,
});

export const randomSpawn = (): Vec3 => {
  const half = MAP.size / 2 - 4;
  return [
    (Math.random() * 2 - 1) * half,
    MAP.spawnHeight,
    (Math.random() * 2 - 1) * half,
  ];
};
