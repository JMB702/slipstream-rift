import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { PLAYER, raycastObstacles, type Vec3 } from '@slipstream/shared';
import { useGame } from '../store.js';
import { getActiveInput, getPredictedState } from './local-state.js';

const BACK_DIST = 3.4;
const SHOULDER_OFFSET = 0.65;
const HEIGHT_OFFSET = 0.55;
const AIM_DIST = 25;

// Spring-arm camera collision tunables.
const CAMERA_RADIUS = 0.3; // sphere-cast radius — pulls in at corners before clipping
const WALL_PADDING = 0.05; // visible offset from wall surface
const MIN_CAM_DIST = PLAYER.radius + CAMERA_RADIUS + 0.1; // hard floor; never inside the player capsule

// Asymmetric damping + hysteresis. Retract fast (to never visibly clip), return
// slow (to never twitch when rotating near a wall edge). Hysteresis prevents
// single-frame ping-pong at narrow doorways where ideal/collided distances flicker.
const RETRACT_LERP = 0.6; // ~150ms time constant at 60fps
const RETURN_LERP = 0.1; // ~1000ms time constant
const HYSTERESIS = 0.15; // m

export const FollowCamera = () => {
  const { camera } = useThree();
  const appliedDist = useRef(BACK_DIST);

  useFrame(() => {
    const myId = useGame.getState().myId;
    if (!myId) return;

    const pred = getPredictedState();
    const inp = getActiveInput();
    const yaw = inp?.yaw ?? pred.yaw;
    const pitch = inp?.pitch ?? pred.pitch;

    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const sy = Math.sin(yaw);
    const cy = Math.cos(yaw);

    const fx = -sy * cp;
    const fy = sp;
    const fz = -cy * cp;
    const rx = cy;
    const rz = -sy;

    const eyeX = pred.position[0];
    const eyeY = pred.position[1] + PLAYER.height * 0.3;
    const eyeZ = pred.position[2];

    // Idealized desired camera position: BACK_DIST behind, SHOULDER_OFFSET right, HEIGHT_OFFSET up.
    const desiredX = eyeX - fx * BACK_DIST + rx * SHOULDER_OFFSET;
    const desiredY = eyeY - fy * BACK_DIST + HEIGHT_OFFSET;
    const desiredZ = eyeZ - fz * BACK_DIST + rz * SHOULDER_OFFSET;

    // Cast from the eye toward the desired position. Use the full ray length so
    // hits past the desired endpoint don't matter; inflate AABBs by CAMERA_RADIUS
    // so corners pull us in before the sphere can clip.
    const dx = desiredX - eyeX;
    const dy = desiredY - eyeY;
    const dz = desiredZ - eyeZ;
    const rayLen = Math.hypot(dx, dy, dz);
    let safeDist = rayLen;
    if (rayLen > 1e-6) {
      const ndx = dx / rayLen;
      const ndy = dy / rayLen;
      const ndz = dz / rayLen;
      const eye: Vec3 = [eyeX, eyeY, eyeZ];
      const dir: Vec3 = [ndx, ndy, ndz];
      const hit = raycastObstacles(eye, dir, rayLen, CAMERA_RADIUS);
      if (hit !== null) {
        safeDist = Math.max(0, hit - WALL_PADDING);
      }
    }
    if (safeDist < MIN_CAM_DIST) safeDist = MIN_CAM_DIST;

    // Asymmetric damping with hysteresis.
    const cur = appliedDist.current;
    if (safeDist < cur) {
      appliedDist.current = cur + (safeDist - cur) * RETRACT_LERP;
    } else if (safeDist > cur + HYSTERESIS) {
      appliedDist.current = cur + (safeDist - cur) * RETURN_LERP;
    }

    // Place camera along the normalized ray at the damped distance.
    const t = rayLen > 1e-6 ? appliedDist.current / rayLen : 0;
    let camX = eyeX + dx * t;
    let camY = eyeY + dy * t;
    let camZ = eyeZ + dz * t;

    // Floor safety: never let the camera go through the ground plane.
    if (camY < CAMERA_RADIUS) camY = CAMERA_RADIUS;

    camera.position.set(camX, camY, camZ);

    // Aim point unchanged: a point far along the look ray from the eye.
    // Pulling the camera in does NOT change where bullets go (server uses yaw/pitch).
    camera.lookAt(eyeX + fx * AIM_DIST, eyeY + fy * AIM_DIST, eyeZ + fz * AIM_DIST);
  });

  return null;
};
