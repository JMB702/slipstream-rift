import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Group } from 'three';
import {
  PLAYER,
  TICK_MS,
  applyMovement,
  type ClientMessage,
  type InputFrame,
  type MovableState,
} from '@slipstream/shared';
import { useGame } from '../store.js';
import { createInput, type InputState } from './input.js';
import { PlayerModel, colorForId } from './PlayerModel.js';

interface Props {
  send(msg: ClientMessage): void;
  myName: string;
}

let activeInput: ReturnType<typeof createInput> | null = null;
export const getActiveInput = (): InputState | null => activeInput?.state ?? null;

const predicted: MovableState = {
  position: [0, PLAYER.radius, 0],
  velocity: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  grounded: true,
};
export const getPredictedState = (): MovableState => predicted;

export const LocalPlayer = ({ send, myName }: Props) => {
  const ref = useRef<Group>(null);
  const { gl } = useThree();
  const seqRef = useRef(1);
  const accumulator = useRef(0);
  const lastSent = useRef(performance.now());
  const inputBuffer = useRef<InputFrame[]>([]);

  useEffect(() => {
    activeInput = createInput(gl.domElement);
    return () => {
      activeInput?.destroy();
      activeInput = null;
    };
  }, [gl]);

  const myColor = useMemo(() => {
    const id = useGame.getState().myId;
    return id ? colorForId(id) : '#88aaff';
  }, []);

  useFrame((_, delta) => {
    const dtMs = delta * 1000;
    accumulator.current += dtMs;

    if (accumulator.current >= TICK_MS && activeInput) {
      const sendDt = performance.now() - lastSent.current;
      lastSent.current = performance.now();
      accumulator.current = 0;

      const inp = activeInput.state;
      const fired = activeInput.consumeFire();
      const frame: InputFrame = {
        seq: seqRef.current++,
        dtMs: sendDt,
        forward: inp.forward,
        right: inp.right,
        jump: inp.jump,
        sprint: inp.sprint,
        fire: fired,
        reload: inp.reload,
        yaw: inp.yaw,
        pitch: inp.pitch,
      };
      inputBuffer.current.push(frame);
      if (inputBuffer.current.length > 120) inputBuffer.current.shift();
      send({ type: 'input', frames: [frame] });
    }

    const myId = useGame.getState().myId;
    const lastSnap = useGame.getState().snapshots[useGame.getState().snapshots.length - 1];
    if (!ref.current || !myId || !lastSnap) return;
    const me = lastSnap.players.get(myId);
    if (!me) return;

    if (!me.alive) {
      predicted.position = me.position;
      predicted.velocity = [0, 0, 0];
      predicted.yaw = me.yaw;
      predicted.pitch = me.pitch;
      predicted.grounded = true;
      ref.current.position.set(me.position[0], me.position[1], me.position[2]);
      ref.current.rotation.y = me.yaw;
      return;
    }

    const ackedSeq = me.lastSeenSeq;
    while (inputBuffer.current.length > 0 && inputBuffer.current[0]!.seq <= ackedSeq) {
      inputBuffer.current.shift();
    }

    let state: MovableState = {
      position: me.position,
      velocity: me.velocity,
      yaw: me.yaw,
      pitch: me.pitch,
      grounded: me.position[1] <= PLAYER.radius + 0.001,
    };
    for (const frame of inputBuffer.current) {
      state = applyMovement(state, frame);
    }
    predicted.position = state.position;
    predicted.velocity = state.velocity;
    predicted.yaw = state.yaw;
    predicted.pitch = state.pitch;
    predicted.grounded = state.grounded;

    ref.current.position.set(state.position[0], state.position[1], state.position[2]);
    ref.current.rotation.y = state.yaw;
  });

  const myId = useGame((s) => s.myId);
  const lastSnap = useGame((s) => s.snapshots[s.snapshots.length - 1]);
  const me = myId ? lastSnap?.players.get(myId) : undefined;

  return (
    <group ref={ref}>
      <PlayerModel
        name={me?.name ?? myName}
        alive={me?.alive ?? true}
        health={me?.health ?? 100}
        color={myColor}
      />
    </group>
  );
};
