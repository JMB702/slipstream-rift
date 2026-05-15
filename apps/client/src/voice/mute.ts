import { setMicEnabled } from './mic.js';

type Listener = (muted: boolean) => void;

let muted = false;
const listeners = new Set<Listener>();

export const isMuted = (): boolean => muted;

export const setMuted = (next: boolean): void => {
  if (next === muted) return;
  muted = next;
  setMicEnabled(!muted);
  for (const l of listeners) l(muted);
};

export const toggleMute = (): void => setMuted(!muted);

export const onMuteChange = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

let gamepadPollHandle: number | null = null;
const prevButtons = new Map<number, boolean>();

// Xbox button indices we listen for:
//   3  = Y
//   9  = Menu (Start) / fallback
const GAMEPAD_TOGGLE_BUTTONS = [3, 9];

const pollGamepads = (): void => {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    for (const idx of GAMEPAD_TOGGLE_BUTTONS) {
      const button = pad.buttons[idx];
      if (!button) continue;
      const prev = prevButtons.get(idx) ?? false;
      if (button.pressed && !prev) toggleMute();
      prevButtons.set(idx, button.pressed);
    }
  }
  gamepadPollHandle = requestAnimationFrame(pollGamepads);
};

const onKeyDown = (e: KeyboardEvent): void => {
  if (e.key === 'm' || e.key === 'M') {
    // Mute key shouldn't fire when the user is typing into a text input.
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    toggleMute();
  }
};

let installed = false;

export const installMuteControls = (): void => {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', onKeyDown);
  if (gamepadPollHandle === null) gamepadPollHandle = requestAnimationFrame(pollGamepads);
};
