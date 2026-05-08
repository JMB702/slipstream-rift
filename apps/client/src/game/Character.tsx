import { useAnimations, useGLTF } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type AnimationAction } from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PLAYER, type PlayerId, type Vec3 } from '@slipstream/shared';
import { useGame } from '../store.js';

// =============================================================================
// Mixamo rifle-aim character swap workflow
// =============================================================================
// Soldier.glb only ships Idle / Walk / Run / TPose with arms swinging freely
// — that's why a held weapon never looks right against it. The proper fix is
// to use a character animated with a held rifle:
//
//   1. https://www.mixamo.com (free Adobe login)
//   2. Pick a rigged character. Download as FBX Binary, with Skin, T-pose.
//      Most Mixamo characters DO NOT include a gun mesh — they expect you to
//      attach one to the right-hand bone. If you want a built-in gun, search
//      Sketchfab/CGTrader for a "Mixamo-rigged soldier with rifle" (or pose
//      one in Blender by attaching a gun mesh to mixamorigRightHand).
//   3. Pick rifle animations one at a time, download as FBX Binary, without
//      Skin, 30fps:
//        - "Rifle Idle"           -> "Idle"
//        - "Rifle Walk Forward"   -> "Walk"
//        - "Rifle Run"            -> "Run"
//        - "Firing Rifle"         -> "Fire"
//   4. In Blender: import character FBX, then each animation FBX. In the
//      Action Editor, rename actions to Idle / Walk / Run / Fire. Export as
//      glTF 2.0 with Animations enabled.
//   5. Replace apps/client/public/models/Soldier.glb with the new GLB.
//   6. If your clips use different names (Mixamo often suffixes them with
//      "mixamo.com" or the source-FBX name), update CLIP_NAMES below.
//
// What this file already supports:
//   - Idle / Walk / Run blending (locomotion state machine, looping clips)
//   - Jump fakery (freezes Run mid-stride; replace with a real Jump clip
//     if your pack has one and update CLIP_NAMES.Jump)
//   - Fire as a one-shot full-body override on shot events (gated on the
//     CLIP_NAMES.Fire entry — leave it null to disable while you don't have
//     a Fire clip yet)
// =============================================================================

const MODEL_URL = '/models/Soldier.glb';
useGLTF.preload(MODEL_URL);

interface Props {
  velocity: Vec3;
  alive: boolean;
  playerId: PlayerId | null;
}

const WALK_RUN_THRESHOLD = (PLAYER.walkSpeed + PLAYER.sprintSpeed) / 2;
const IDLE_SPEED = 0.15;
const AIRBORNE_VY = 0.5;

// Run clip is ~0.7s; mid-stride lands around 0.35s with one leg planted —
// reads as a leap silhouette when frozen. Used by Jump fallback.
const JUMP_POSE_TIME = 0.35;

// Fire animation duration (ms). After this elapses with no further shots,
// the character returns to locomotion. If you have a 0.4s Fire clip, set
// this slightly less so the next shot can re-trigger smoothly.
const FIRE_HOLD_MS = 350;

type ClipKey = 'Idle' | 'Walk' | 'Run' | 'Jump' | 'Fire';

// Map ClipKey -> the actual clip name in the GLB. `null` means "no clip
// available, skip transitions to this state". Most Mixamo character packs
// will need only the Fire entry filled in.
const CLIP_NAMES: Record<ClipKey, string | null> = {
  Idle: 'Idle',
  Walk: 'Walk',
  Run: 'Run',
  Jump: 'Run', // re-uses Run frozen mid-stride; replace with 'Jump' when a real clip lands
  Fire: null, // e.g. 'Fire' or 'Firing Rifle' once a Fire clip is in the GLB
};

export const Character = ({ velocity, alive, playerId }: Props) => {
  const gltf = useGLTF(MODEL_URL);
  const cloned = useMemo(() => SkeletonUtils.clone(gltf.scene), [gltf.scene]);
  const { actions } = useAnimations(gltf.animations, cloned);
  const currentAnim = useRef<ClipKey>('Idle');

  // Fire state: true while we want to be playing the Fire clip. Cleared by
  // a timer FIRE_HOLD_MS after the most recent shot event for this player.
  const [firing, setFiring] = useState(false);
  const fireTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenEventsRef = useRef(0);

  useEffect(() => {
    return useGame.subscribe((state) => {
      if (!playerId) return;
      if (state.events.length === seenEventsRef.current) return;
      const fresh = state.events.slice(seenEventsRef.current);
      seenEventsRef.current = state.events.length;
      let firedThisBatch = false;
      for (const ev of fresh) {
        if (ev.type === 'shot' && ev.shooterId === playerId) firedThisBatch = true;
      }
      if (!firedThisBatch) return;
      setFiring(true);
      if (fireTimeoutRef.current) clearTimeout(fireTimeoutRef.current);
      fireTimeoutRef.current = setTimeout(() => setFiring(false), FIRE_HOLD_MS);
    });
  }, [playerId]);

  // Start the default (Idle) animation once actions are available.
  useEffect(() => {
    const idle = actions[CLIP_NAMES.Idle ?? ''];
    if (idle) idle.reset().fadeIn(0.15).play();
  }, [actions]);

  // State machine. Acts only on actual transitions.
  useEffect(() => {
    if (!alive) {
      for (const a of Object.values(actions)) a?.fadeOut(0.2);
      return;
    }

    const speed = Math.hypot(velocity[0], velocity[2]);
    const airborne = Math.abs(velocity[1]) > AIRBORNE_VY;
    const fireClip = CLIP_NAMES.Fire ? actions[CLIP_NAMES.Fire] : undefined;

    // Fire takes priority over locomotion (and Jump) when a clip is available
    // AND we're not airborne (jumping with a fire animation looks worse than
    // letting Jump play).
    const wanted: ClipKey =
      firing && fireClip && !airborne
        ? 'Fire'
        : airborne
          ? 'Jump'
          : speed < IDLE_SPEED
            ? 'Idle'
            : speed < WALK_RUN_THRESHOLD
              ? 'Walk'
              : 'Run';

    if (currentAnim.current === wanted) return;

    const prev = pickAction(actions, currentAnim.current);
    const next = pickAction(actions, wanted);
    const sameClip = prev === next;

    if (sameClip && next) {
      applyClipMode(next, wanted, false);
      next.play();
      currentAnim.current = wanted;
      return;
    }

    if (prev) prev.fadeOut(0.15);
    if (next) {
      applyClipMode(next, wanted, true);
      next.fadeIn(0.15).play();
    }
    currentAnim.current = wanted;
  }, [velocity, alive, firing, actions]);

  if (!alive) return null;

  // Soldier.glb origin is at the feet; our player position is the capsule
  // center, so push the model down by half-height. The model's local forward
  // is already -z (matching our world's forward at yaw=0).
  return (
    <group position={[0, -PLAYER.height / 2, 0]}>
      <primitive object={cloned} />
    </group>
  );
};

const pickAction = (
  actions: Record<string, AnimationAction | null>,
  key: ClipKey,
): AnimationAction | undefined => {
  const name = CLIP_NAMES[key];
  if (!name) return undefined;
  return actions[name] ?? undefined;
};

// Configures an action for the given state. `freshClip` is true when the
// action's clip is changing (e.g., Idle → Jump) and we want to start the
// leap pose at a known frame; false when the same clip is being re-used
// (Run ↔ Jump) and we want to leave the cycle's playhead alone.
const applyClipMode = (
  action: AnimationAction,
  mode: ClipKey,
  freshClip: boolean,
): void => {
  // CRITICAL: three.js automatically sets enabled=false when a fadeOut
  // completes. fadeIn doesn't re-enable, so the mixer would force the
  // action's effective weight to 0 (the bind / T-pose blends through).
  action.enabled = true;

  if (mode === 'Jump') {
    if (freshClip) action.time = JUMP_POSE_TIME;
    action.paused = true;
    action.timeScale = 0;
    return;
  }

  action.paused = false;
  action.timeScale = 1;
  if (mode === 'Fire' && freshClip) {
    // Restart the fire clip from the beginning so each shot replays cleanly.
    action.time = 0;
  }
};
