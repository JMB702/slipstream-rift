import { MAP, OBSTACLES, PLAYER, type Obstacle } from './constants.js';
import type { InputFrame } from './messages.js';
import type { Vec3 } from './state.js';

export interface MovableState {
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  grounded: boolean;
}

const HALF_MAP = MAP.size / 2;

export const applyMovement = (state: MovableState, input: InputFrame): MovableState => {
  const yaw = input.yaw;
  const pitch = clamp(input.pitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
  const dt = Math.min(input.dtMs, 100) / 1000;

  const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const fwd = clamp(input.forward, -1, 1);
  const strafe = clamp(input.right, -1, 1);

  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);

  let vx = (-sin * fwd + cos * strafe) * speed;
  let vz = (-cos * fwd - sin * strafe) * speed;

  let vy = state.velocity[1];
  let grounded = state.grounded;
  if (grounded && input.jump) {
    vy = PLAYER.jumpSpeed;
    grounded = false;
  }
  vy -= PLAYER.gravity * dt;

  const r = PLAYER.radius;
  const halfH = PLAYER.height / 2;
  const floor = halfH;

  // Per-axis swept collision against AABB obstacles. Treat the player as an
  // upright cylinder (radius r, half-height halfH) — slight overlap at AABB
  // corners but cheap and good enough for an MVP. Resolving X/Y/Z separately
  // gives natural sliding along walls.

  let px = state.position[0];
  let py = state.position[1];
  let pz = state.position[2];

  // X axis
  const targetX = px + vx * dt;
  let resolvedX = targetX;
  for (const o of OBSTACLES) {
    if (!overlapsYZ(py, pz, o, r, halfH)) continue;
    const minX = o.pos[0] - o.halfSize[0] - r;
    const maxX = o.pos[0] + o.halfSize[0] + r;
    if (resolvedX > minX && resolvedX < maxX) {
      if (px <= minX) {
        resolvedX = minX;
      } else if (px >= maxX) {
        resolvedX = maxX;
      } else {
        resolvedX = px;
      }
      vx = 0;
    }
  }
  px = resolvedX;

  // Z axis
  const targetZ = pz + vz * dt;
  let resolvedZ = targetZ;
  for (const o of OBSTACLES) {
    if (!overlapsXY(px, py, o, r, halfH)) continue;
    const minZ = o.pos[2] - o.halfSize[2] - r;
    const maxZ = o.pos[2] + o.halfSize[2] + r;
    if (resolvedZ > minZ && resolvedZ < maxZ) {
      if (pz <= minZ) {
        resolvedZ = minZ;
      } else if (pz >= maxZ) {
        resolvedZ = maxZ;
      } else {
        resolvedZ = pz;
      }
      vz = 0;
    }
  }
  pz = resolvedZ;

  // Y axis: gravity / jump, then floor and obstacle-top/bottom resolution
  const targetY = py + vy * dt;
  let resolvedY = targetY;
  if (resolvedY <= floor) {
    resolvedY = floor;
    vy = 0;
    grounded = true;
  } else {
    grounded = false;
  }
  for (const o of OBSTACLES) {
    if (!overlapsXZ(px, pz, o, r)) continue;
    const top = o.pos[1] + o.halfSize[1] + halfH;
    const bottom = o.pos[1] - o.halfSize[1] - halfH;
    if (resolvedY < top && resolvedY > bottom) {
      if (py >= top) {
        resolvedY = top;
        if (vy < 0) vy = 0;
        grounded = true;
      } else if (py <= bottom) {
        resolvedY = bottom;
        if (vy > 0) vy = 0;
      }
    }
  }
  py = resolvedY;

  // Map perimeter as a final safety clamp (cheap, prevents escaping if a
  // collision pass somehow misses).
  px = clamp(px, -HALF_MAP + r, HALF_MAP - r);
  pz = clamp(pz, -HALF_MAP + r, HALF_MAP - r);

  return {
    position: [px, py, pz],
    velocity: [vx, vy, vz],
    yaw,
    pitch,
    grounded,
  };
};

const overlapsYZ = (py: number, pz: number, o: Obstacle, r: number, halfH: number): boolean =>
  py > o.pos[1] - o.halfSize[1] - halfH &&
  py < o.pos[1] + o.halfSize[1] + halfH &&
  pz > o.pos[2] - o.halfSize[2] - r &&
  pz < o.pos[2] + o.halfSize[2] + r;

const overlapsXY = (px: number, py: number, o: Obstacle, r: number, halfH: number): boolean =>
  px > o.pos[0] - o.halfSize[0] - r &&
  px < o.pos[0] + o.halfSize[0] + r &&
  py > o.pos[1] - o.halfSize[1] - halfH &&
  py < o.pos[1] + o.halfSize[1] + halfH;

const overlapsXZ = (px: number, pz: number, o: Obstacle, r: number): boolean =>
  px > o.pos[0] - o.halfSize[0] - r &&
  px < o.pos[0] + o.halfSize[0] + r &&
  pz > o.pos[2] - o.halfSize[2] - r &&
  pz < o.pos[2] + o.halfSize[2] + r;

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

// Slabs method. Returns the t of the entry hit along `dir` from `origin`, or
// null if the ray misses or hits beyond `maxDist`. Pass `inflate` to grow the
// box on every axis — useful for treating the caster as a sphere of radius
// `inflate` (the inflated-AABB test is conservative at corners, which is
// exactly what we want for camera collision).
export const rayAABB = (
  origin: Vec3,
  dir: Vec3,
  o: Obstacle,
  maxDist: number,
  inflate = 0,
): number | null => {
  let tmin = 0;
  let tmax = maxDist;
  for (let axis = 0; axis < 3; axis++) {
    const min = o.pos[axis]! - o.halfSize[axis]! - inflate;
    const max = o.pos[axis]! + o.halfSize[axis]! + inflate;
    const d = dir[axis]!;
    const oo = origin[axis]!;
    if (Math.abs(d) < 1e-8) {
      if (oo < min || oo > max) return null;
      continue;
    }
    const invD = 1 / d;
    let t1 = (min - oo) * invD;
    let t2 = (max - oo) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
};

export const raycastObstacles = (
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  inflate = 0,
): number | null => {
  let best: number | null = null;
  for (const o of OBSTACLES) {
    const t = rayAABB(origin, dir, o, maxDist, inflate);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
};
