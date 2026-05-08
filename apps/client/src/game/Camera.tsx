import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import { Vector3 } from 'three';
import { PLAYER } from '@slipstream/shared';
import { useGame } from '../store.js';
import { getActiveInput, getPredictedState } from './LocalPlayer.js';

const FOLLOW_DIST = 5;
const FOLLOW_HEIGHT = 1.5;

export const FollowCamera = () => {
  const { camera } = useThree();
  const target = useRef(new Vector3());
  const desired = useRef(new Vector3());

  useFrame(() => {
    const myId = useGame.getState().myId;
    if (!myId) return;

    const pred = getPredictedState();
    const inp = getActiveInput();
    const yaw = inp?.yaw ?? pred.yaw;
    const pitch = inp?.pitch ?? pred.pitch;

    target.current.set(
      pred.position[0],
      pred.position[1] + PLAYER.height * 0.6,
      pred.position[2],
    );

    const cp = Math.cos(pitch);
    const offsetX = Math.sin(yaw) * cp * FOLLOW_DIST;
    const offsetY = -Math.sin(pitch) * FOLLOW_DIST + FOLLOW_HEIGHT;
    const offsetZ = Math.cos(yaw) * cp * FOLLOW_DIST;

    desired.current.set(
      target.current.x + offsetX,
      target.current.y + offsetY,
      target.current.z + offsetZ,
    );

    camera.position.lerp(desired.current, 0.25);
    camera.lookAt(target.current);
  });

  return null;
};
