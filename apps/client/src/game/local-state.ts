import { PLAYER, type MovableState } from '@slipstream/shared';
import type { InputState } from './input.js';
import type { createInput } from './input.js';

let activeInput: ReturnType<typeof createInput> | null = null;

export const setActiveInput = (input: ReturnType<typeof createInput> | null): void => {
  activeInput = input;
};

export const getActiveInput = (): InputState | null => activeInput?.state ?? null;

export const consumeFire = (): boolean => activeInput?.consumeFire() ?? false;

const predicted: MovableState = {
  position: [0, PLAYER.height / 2, 0],
  velocity: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  grounded: true,
};

export const getPredictedState = (): MovableState => predicted;

export const setPredictedState = (s: MovableState): void => {
  predicted.position = s.position;
  predicted.velocity = s.velocity;
  predicted.yaw = s.yaw;
  predicted.pitch = s.pitch;
  predicted.grounded = s.grounded;
};
