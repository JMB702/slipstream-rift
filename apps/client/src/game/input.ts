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

  const onMouseMove = (e: MouseEvent) => {
    if (!state.pointerLocked) return;
    state.yaw -= e.movementX * 0.0025;
    state.pitch -= e.movementY * 0.0025;
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

  const onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) state.fire = false;
  };

  const onPointerLockChange = () => {
    state.pointerLocked = document.pointerLockElement === canvas;
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
