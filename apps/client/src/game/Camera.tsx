import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';
import { PLAYER } from '@slipstream/shared';
import { useGame } from '../store.js';
import { getActiveInput, getPredictedState } from './LocalPlayer.js';

const BACK_DIST = 3.4;
const SHOULDER_OFFSET = 0.65;
const HEIGHT_OFFSET = 0.55;
const AIM_DIST = 25;

export const FollowCamera = () => {
  const { camera } = useThree();
  const desired = useRef(new Vector3());
  const aim = useRef(new Vector3());

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

    // forward = direction the player is looking, in world space
    const fx = -sy * cp;
    const fy = sp;
    const fz = -cy * cp;

    // right = forward × world up, then normalized in xz
    const rx = cy;
    const rz = -sy;

    // Eye height matches the server's eye for raycasts (position is body center).
    const eyeX = pred.position[0];
    const eyeY = pred.position[1] + PLAYER.height * 0.3;
    const eyeZ = pred.position[2];

    // camera sits behind the player along -forward, lifted, and offset to the right shoulder
    desired.current.set(
      eyeX - fx * BACK_DIST + rx * SHOULDER_OFFSET,
      eyeY - fy * BACK_DIST + HEIGHT_OFFSET,
      eyeZ - fz * BACK_DIST + rz * SHOULDER_OFFSET,
    );

    // aim point: a point far along the look ray from the eye. crosshair (screen center) lands here.
    aim.current.set(eyeX + fx * AIM_DIST, eyeY + fy * AIM_DIST, eyeZ + fz * AIM_DIST);

    camera.position.lerp(desired.current, 0.4);
    camera.lookAt(aim.current);
  });

  return null;
};
