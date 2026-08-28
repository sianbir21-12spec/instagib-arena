import type { InputState } from './types';

type TouchPoint = { x: number; y: number };

type MobileControlCallbacks = {
  setAction: (action: keyof Pick<InputState, 'forward' | 'back' | 'left' | 'right' | 'jump' | 'dash' | 'boost' | 'fire'>, down: boolean) => void;
  addLook: (yaw: number, pitch: number) => void;
  setScoreboard: (down: boolean) => void;
};

export type MobileControlHandle = {
  destroy: () => void;
  reset: () => void;
};

const JOYSTICK_RADIUS = 62;
const LOOK_SENSITIVITY = 0.0045;

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' &&
    (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
}

/**
 * Attaches a mobile control layer to the game canvas. UI buttons can call the
 * returned callbacks while the canvas itself owns the right-side look gesture.
 * Every active pointer has its own id, so movement + aim + action buttons work
 * concurrently. All state is force-reset when the document loses focus.
 */
export function attachMobileControls(
  canvas: HTMLCanvasElement,
  callbacks: MobileControlCallbacks,
): MobileControlHandle {
  const pointers = new Map<number, TouchPoint>();
  let lookPointer: number | null = null;
  let joystickPointer: number | null = null;
  let joystickOrigin: TouchPoint | null = null;
  let destroyed = false;

  const reset = () => {
    pointers.clear();
    lookPointer = null;
    joystickPointer = null;
    joystickOrigin = null;
    callbacks.setAction('forward', false);
    callbacks.setAction('back', false);
    callbacks.setAction('left', false);
    callbacks.setAction('right', false);
    callbacks.setAction('jump', false);
    callbacks.setAction('dash', false);
    callbacks.setAction('boost', false);
    callbacks.setAction('fire', false);
    callbacks.setScoreboard(false);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (destroyed || event.pointerType !== 'touch') return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const width = window.innerWidth;
    if (event.clientX < width * 0.42 && joystickPointer === null) {
      joystickPointer = event.pointerId;
      joystickOrigin = { x: event.clientX, y: event.clientY };
      return;
    }
    if (lookPointer === null) {
      lookPointer = event.pointerId;
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (destroyed || event.pointerType !== 'touch') return;
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (event.pointerId === lookPointer) {
      callbacks.addLook(
        (event.clientX - previous.x) * LOOK_SENSITIVITY,
        (event.clientY - previous.y) * LOOK_SENSITIVITY,
      );
      return;
    }

    if (event.pointerId === joystickPointer && joystickOrigin) {
      const dx = event.clientX - joystickOrigin.x;
      const dy = event.clientY - joystickOrigin.y;
      const nx = Math.max(-1, Math.min(1, dx / JOYSTICK_RADIUS));
      const ny = Math.max(-1, Math.min(1, dy / JOYSTICK_RADIUS));
      callbacks.setAction('left', nx < -0.2);
      callbacks.setAction('right', nx > 0.2);
      callbacks.setAction('forward', ny < -0.2);
      callbacks.setAction('back', ny > 0.2);
    }
  };

  const releasePointer = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    pointers.delete(event.pointerId);
    if (event.pointerId === joystickPointer) {
      joystickPointer = null;
      joystickOrigin = null;
      callbacks.setAction('forward', false);
      callbacks.setAction('back', false);
      callbacks.setAction('left', false);
      callbacks.setAction('right', false);
    }
    if (event.pointerId === lookPointer) lookPointer = null;
  };

  const onVisibility = () => {
    if (document.hidden) reset();
  };

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', releasePointer);
  canvas.addEventListener('pointercancel', releasePointer);
  canvas.addEventListener('pointerleave', releasePointer);
  window.addEventListener('blur', reset);
  document.addEventListener('visibilitychange', onVisibility);

  return {
    reset,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', releasePointer);
      canvas.removeEventListener('pointercancel', releasePointer);
      canvas.removeEventListener('pointerleave', releasePointer);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', onVisibility);
      reset();
    },
  };
}
