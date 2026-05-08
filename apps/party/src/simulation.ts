import {
  PLAYER,
  WEAPON,
  applyMovement,
  type GameEvent,
  type InputFrame,
  type Vec3,
} from '@slipstream/shared';
import type { ServerPlayer } from './state.js';
import { randomSpawn } from './state.js';

export const applyInput = (player: ServerPlayer, input: InputFrame, now: number): void => {
  if (!player.alive) return;
  const next = applyMovement(player, input);
  player.position = next.position;
  player.velocity = next.velocity;
  player.yaw = next.yaw;
  player.pitch = next.pitch;
  player.grounded = next.grounded;
  player.lastSeenSeq = input.seq;

  if (input.reload && !player.reloading && player.ammo < WEAPON.magazineSize) {
    player.reloading = true;
    player.reloadDoneAt = now + WEAPON.reloadMs;
  }
};

export const finishReload = (player: ServerPlayer, now: number): void => {
  if (player.reloading && player.reloadDoneAt !== null && now >= player.reloadDoneAt) {
    player.ammo = WEAPON.magazineSize;
    player.reloading = false;
    player.reloadDoneAt = null;
  }
};

export const maybeRespawn = (player: ServerPlayer, now: number): void => {
  if (!player.alive && player.respawnAt !== null && now >= player.respawnAt) {
    player.position = randomSpawn();
    player.velocity = [0, 0, 0];
    player.health = PLAYER.maxHealth;
    player.alive = true;
    player.respawnAt = null;
    player.ammo = WEAPON.magazineSize;
    player.reloading = false;
    player.reloadDoneAt = null;
  }
};

export const tryFire = (
  shooter: ServerPlayer,
  others: ServerPlayer[],
  now: number,
): GameEvent[] => {
  if (!shooter.alive || shooter.reloading || shooter.ammo <= 0) return [];

  shooter.ammo -= 1;

  // Eye sits a bit above body center (so muzzle flashes don't come out of the chest).
  const eyeOrigin: Vec3 = [
    shooter.position[0],
    shooter.position[1] + PLAYER.height * 0.3,
    shooter.position[2],
  ];

  const dir = directionFromYawPitch(shooter.yaw, shooter.pitch);
  const result = raycastPlayers(eyeOrigin, dir, WEAPON.range, others, shooter.id);

  const events: GameEvent[] = [
    {
      type: 'shot',
      shooterId: shooter.id,
      origin: eyeOrigin,
      direction: dir,
      hit: result?.hitId ?? null,
      at: now,
    },
  ];

  if (result) {
    const victim = others.find((p) => p.id === result.hitId);
    if (victim && victim.alive) {
      victim.health -= WEAPON.damage;
      if (victim.health <= 0) {
        victim.health = 0;
        victim.alive = false;
        victim.respawnAt = now + PLAYER.respawnMs;
        victim.deaths += 1;
        shooter.kills += 1;
        events.push({
          type: 'kill',
          killerId: shooter.id,
          victimId: victim.id,
          at: now,
        });
      }
    }
  }

  return events;
};

const directionFromYawPitch = (yaw: number, pitch: number): Vec3 => {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [-sy * cp, sp, -cy * cp];
};

interface RayHit {
  hitId: string;
  t: number;
}

const raycastPlayers = (
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  targets: ServerPlayer[],
  excludeId: string,
): RayHit | null => {
  let best: RayHit | null = null;
  // Approximate the capsule with a fat sphere covering most of the body.
  // Slightly over-generous laterally but reliable until we add proper capsule tests.
  const hitRadius = PLAYER.height * 0.4;
  for (const p of targets) {
    if (p.id === excludeId || !p.alive) continue;
    const t = raySphere(origin, dir, p.position, hitRadius, maxDist);
    if (t !== null && (best === null || t < best.t)) {
      best = { hitId: p.id, t };
    }
  }
  return best;
};

const raySphere = (
  origin: Vec3,
  dir: Vec3,
  center: Vec3,
  radius: number,
  maxDist: number,
): number | null => {
  // The target's body sphere is centered at its position (capsule center).
  const ox = origin[0] - center[0];
  const oy = origin[1] - center[1];
  const oz = origin[2] - center[2];
  const b = ox * dir[0] + oy * dir[1] + oz * dir[2];
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t = -b - sq;
  if (t < 0 || t > maxDist) return null;
  return t;
};
