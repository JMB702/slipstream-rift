export interface InputState {
  forward: number;
  right: number;
  jump: boolean;
  sprint: boolean;
  fire: boolean;
  reload: boolean;
  yaw: number;
  pitch: number;
  pointerLocked: boolean;
}

export const createInput = (canvas: HTMLCanvasElement): {
  state: InputState;
  consumeFire(): boolean;
  destroy(): void;
} => {
  const state: InputState = {
    forward: 0,
    right: 0,
    jump: false,
    sprint: false,
    fire: false,
    reload: false,
    yaw: 0,
    pitch: 0,
    pointerLocked: false,
  };

  const keys = new Set<string>();

  const updateAxes = () => {
    state.forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    state.right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    state.jump = keys.has('Space');
    state.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    state.reload = keys.has('KeyR');
  };

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    updateAxes();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
    updateAxes();
  };

  let dropNextMouseMove = false;

  const onMouseMove = (e: MouseEvent) => {
    if (!state.pointerLocked) return;
    if (document.pointerLockElement !== canvas) return;
    if (dropNextMouseMove) {
      dropNextMouseMove = false;
      return;
    }
    // Browsers occasionally deliver large movement deltas — typically the first
    // event after pointer-lock engages, after a tab regains focus, or when the
    // OS coalesces buffered mouse motion. Clamp so a single spurious event
    // can't whip the camera around.
    const dx = clampMovement(e.movementX);
    const dy = clampMovement(e.movementY);
    state.yaw -= dx * 0.0025;
    state.pitch -= dy * 0.0025;
    const lim = Math.PI / 2 - 0.01;
    if (state.pitch > lim) state.pitch = lim;
    if (state.pitch < -lim) state.pitch = -lim;
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (!state.pointerLocked) {
      canvas.requestPointerLock();
      return;
    }
    state.fire = true;
  };

  const onMouseUp = (_e: MouseEvent) => {
    // intentionally do not clear state.fire — consumeFire is the only consumer
  };

  const onPointerLockChange = () => {
    state.pointerLocked = document.pointerLockElement === canvas;
    if (state.pointerLocked) dropNextMouseMove = true;
  };

  const onContextMenu = (e: MouseEvent) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    consumeFire(): boolean {
      const v = state.fire;
      // edge-trigger: keep semi-auto by clearing here
      state.fire = false;
      return v;
    },
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
};

const MAX_MOUSE_DELTA = 200;
const clampMovement = (v: number): number => {
  if (!Number.isFinite(v)) return 0;
  if (v > MAX_MOUSE_DELTA) return MAX_MOUSE_DELTA;
  if (v < -MAX_MOUSE_DELTA) return -MAX_MOUSE_DELTA;
  return v;
};
