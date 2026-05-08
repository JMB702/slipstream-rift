import { useAnimations, useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import { Group } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLAYER, type Vec3 } from '@slipstream/shared';

const MODEL_URL = '/models/Soldier.glb';

// Trigger the fetch as soon as the bundle loads so the first character mount
// doesn't have to wait on the network.
useGLTF.preload(MODEL_URL);

// Drei's useGLTF returns a shared scene reference. For multi-instance use we
// must clone it, and SkeletonUtils.clone preserves the skeleton bindings so
// each character animates independently.
interface Props {
  velocity: Vec3;
  alive: boolean;
}

const WALK_RUN_THRESHOLD = (PLAYER.walkSpeed + PLAYER.sprintSpeed) / 2;
const IDLE_SPEED = 0.15;

export const Character = ({ velocity, alive }: Props) => {
  const groupRef = useRef<Group>(null);
  const gltf = useGLTF(MODEL_URL);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, groupRef);
  const currentAnim = useRef<'Idle' | 'Walk' | 'Run'>('Idle');

  // Soldier.glb ships with clip names "Idle", "Walk", "Run", "TPose". If you
  // swap the model out, edit the names below to match the new GLB's clips
  // (e.g., Mixamo characters embed clip names like "mixamo.com" or the
  // animation file's name — inspect with three's GLTFLoader.animations).
  const clipNames = useMemo(
    () => ({
      Idle: 'Idle',
      Walk: 'Walk',
      Run: 'Run',
    }),
    [],
  );

  useEffect(() => {
    const idle = actions[clipNames.Idle];
    if (idle) idle.reset().play();
    return () => {
      for (const a of Object.values(actions)) a?.stop();
    };
  }, [actions, clipNames]);

  useEffect(() => {
    if (!alive) return;
    const speed = Math.hypot(velocity[0], velocity[2]);
    const wanted: keyof typeof clipNames =
      speed < IDLE_SPEED ? 'Idle' : speed < WALK_RUN_THRESHOLD ? 'Walk' : 'Run';
    if (currentAnim.current === wanted) return;

    const prev = actions[clipNames[currentAnim.current]];
    const next = actions[clipNames[wanted]];
    if (prev) prev.fadeOut(0.15);
    if (next) next.reset().fadeIn(0.15).play();
    currentAnim.current = wanted;
  }, [velocity, alive, actions, clipNames]);

  if (!alive) return null;

  // Soldier.glb origin is at the feet; our player position is the capsule
  // center, so push the model down by half-height. The 180° yaw rotation
  // aligns the model's forward (-z in its own space) with our world's forward
  // direction at yaw=0.
  return (
    <group ref={groupRef} position={[0, -PLAYER.height / 2, 0]} rotation={[0, Math.PI, 0]}>
      <primitive object={cloned} />
    </group>
  );
};
