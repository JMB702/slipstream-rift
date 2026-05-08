import { MAP, PLAYER } from './constants.js';
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

  const vx = (-sin * fwd + cos * strafe) * speed;
  const vz = (-cos * fwd - sin * strafe) * speed;

  let vy = state.velocity[1];
  let grounded = state.grounded;
  if (grounded && input.jump) {
    vy = PLAYER.jumpSpeed;
    grounded = false;
  }
  vy -= PLAYER.gravity * dt;

  let px = state.position[0] + vx * dt;
  let py = state.position[1] + vy * dt;
  let pz = state.position[2] + vz * dt;

  // position represents the capsule center; ground-rest is height/2.
  const floor = PLAYER.height / 2;
  if (py <= floor) {
    py = floor;
    vy = 0;
    grounded = true;
  } else {
    grounded = false;
  }

  px = clamp(px, -HALF_MAP + PLAYER.radius, HALF_MAP - PLAYER.radius);
  pz = clamp(pz, -HALF_MAP + PLAYER.radius, HALF_MAP - PLAYER.radius);

  return {
    position: [px, py, pz],
    velocity: [vx, vy, vz],
    yaw,
    pitch,
    grounded,
  };
};

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
