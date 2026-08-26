import {
  DEFAULT_KEYBINDS,
  DEFAULT_RAW_INPUT,
  DEFAULT_SENSITIVITY,
  DEFAULT_VERT_SCALE,
  M_YAW_DEG,
  MAX_LOOK_DELTA_DEG,
  type KeybindAction,
} from './constants';
import type { InputState } from './types';

const MAX_LOOK_DELTA_RAD = (MAX_LOOK_DELTA_DEG * Math.PI) / 180;
const MOBILE_LOOK_RAD_PER_PX = 0.0018;

const IS_CHROMIUM =
  typeof navigator !== 'undefined' &&
  (((navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } })
    .userAgentData?.brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)) ??
    false) ||
    (/Chrome\//.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent)));

type MobileInputDetail =
  | { type: 'move'; x: number; y: number }
  | { type: 'aim'; dx: number; dy: number }
  | { type: 'action'; action: 'jump' | 'dash' | 'boost' | 'fire' | 'zoom' | 'scoreboard'; down: boolean }
  | { type: 'clear' };

export class InputManager {
  private state: InputState = {
    forward: false, back: false, left: false, right: false,
    jump: false, jumpPressed: false, dash: false, dashPressed: false,
    boost: false, boostPressed: false, fire: false, firePressed: false,
    zoom: false, scoreboard: false, chatPressed: false, yawDelta: 0, pitchDelta: 0,
  };
  lookScale = 1;
  private prevJump = false;
  private prevDash = false;
  private prevBoost = false;
  private prevFire = false;
  private accumYaw = 0;
  private accumPitch = 0;
  private locked = false;
  private chatting = false;
  private chatQueued = false;
  sensitivity = DEFAULT_SENSITIVITY;
  vertScale = DEFAULT_VERT_SCALE;
  wantRawInput = DEFAULT_RAW_INPUT;
  rawInputActive = false;
  private rawInputSupported: boolean | undefined = undefined;
  private justLocked = false;
  private codeToAction = new Map<string, KeybindAction>(
    (Object.entries(DEFAULT_KEYBINDS) as [KeybindAction, string][]).map(([a, code]) => [code, a]),
  );

  constructor(
    private canvas: HTMLCanvasElement,
    private onLockChange: (locked: boolean) => void,
    private onLockError: () => void = () => {},
  ) { this.attach(); }

  private get radPerCount(): number { return this.sensitivity * M_YAW_DEG * (Math.PI / 180); }

  requestLock() {
    if (!this.wantRawInput || this.rawInputSupported === false) {
      this.canvas.requestPointerLock(); this.rawInputActive = false; return;
    }
    const req = this.canvas.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | undefined;
    if (!req) {
      this.rawInputSupported = false; this.rawInputActive = false; this.canvas.requestPointerLock(); return;
    }
    req.then(() => { this.rawInputSupported = true; this.rawInputActive = true; }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'NotSupportedError') {
        this.rawInputSupported = false; this.rawInputActive = false; this.canvas.requestPointerLock();
      } else this.onLockError();
    });
  }

  setSensitivity(s: number) { this.sensitivity = Math.max(0.01, s); }
  setVertScale(v: number) { this.vertScale = Math.max(0.05, v); }
  setRawInput(on: boolean) { this.wantRawInput = on; if (on) this.rawInputSupported = undefined; }
  get scoreboardHeld(): boolean { return this.state.scoreboard; }

  consumeLook(): { yawDelta: number; pitchDelta: number } {
    const look = { yawDelta: this.accumYaw, pitchDelta: this.accumPitch };
    this.accumYaw = 0; this.accumPitch = 0; return look;
  }

  consume(): InputState {
    const s = { ...this.state };
    s.yawDelta = 0; s.pitchDelta = 0;
    s.jumpPressed = !this.prevJump && this.state.jump;
    s.dashPressed = !this.prevDash && this.state.dash;
    s.boostPressed = !this.prevBoost && this.state.boost;
    s.firePressed = !this.prevFire && this.state.fire;
    s.chatPressed = this.chatQueued; this.chatQueued = false;
    this.prevJump = this.state.jump; this.prevDash = this.state.dash;
    this.prevBoost = this.state.boost; this.prevFire = this.state.fire;
    return s;
  }

  setChatting(on: boolean) { this.chatting = on; if (on) this.clearKeys(); }

  detach() {
    window.removeEventListener('keydown', this.onKeydown);
    window.removeEventListener('keyup', this.onKeyup);
    window.removeEventListener('mousemove', this.onMousemove);
    window.removeEventListener('mousedown', this.onMousedown);
    window.removeEventListener('mouseup', this.onMouseup);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('instagib-mobile-input', this.onMobileInput as EventListener);
    document.removeEventListener('pointerlockchange', this.onLock);
    document.removeEventListener('pointerlockerror', this.onLockErrorEvent);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  private attach() {
    window.addEventListener('keydown', this.onKeydown);
    window.addEventListener('keyup', this.onKeyup);
    window.addEventListener('mousemove', this.onMousemove);
    window.addEventListener('mousedown', this.onMousedown);
    window.addEventListener('mouseup', this.onMouseup);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('instagib-mobile-input', this.onMobileInput as EventListener);
    document.addEventListener('pointerlockchange', this.onLock);
    document.addEventListener('pointerlockerror', this.onLockErrorEvent);
  }

  private onMobileInput = (event: Event) => {
    if (this.chatting) return;
    const detail = (event as CustomEvent<MobileInputDetail>).detail;
    if (!detail) return;
    if (detail.type === 'clear') { this.clearKeys(); return; }
    if (detail.type === 'move') {
      const x = Math.max(-1, Math.min(1, detail.x));
      const y = Math.max(-1, Math.min(1, detail.y));
      this.state.left = x < -0.18; this.state.right = x > 0.18;
      this.state.forward = y < -0.18; this.state.back = y > 0.18;
      return;
    }
    if (detail.type === 'aim') {
      if (!Number.isFinite(detail.dx) || !Number.isFinite(detail.dy)) return;
      const yaw = detail.dx * MOBILE_LOOK_RAD_PER_PX * this.lookScale;
      const pitch = detail.dy * MOBILE_LOOK_RAD_PER_PX * this.lookScale * this.vertScale;
      if (Math.abs(yaw) <= MAX_LOOK_DELTA_RAD && Math.abs(pitch) <= MAX_LOOK_DELTA_RAD) {
        this.accumYaw += yaw; this.accumPitch += pitch;
      }
      return;
    }
    this.applyMobileAction(detail.action, detail.down);
  };

  private applyMobileAction(action: 'jump' | 'dash' | 'boost' | 'fire' | 'zoom' | 'scoreboard', down: boolean) {
    switch (action) {
      case 'jump': this.state.jump = down; break;
      case 'dash': this.state.dash = down; break;
      case 'boost': this.state.boost = down; break;
      case 'fire': this.state.fire = down; break;
      case 'zoom': this.state.zoom = down; break;
      case 'scoreboard': this.state.scoreboard = down; break;
    }
  }

  private onLockErrorEvent = () => { this.onLockError(); };

  setBindings(binds: Record<KeybindAction, string>) {
    const map = new Map<string, KeybindAction>();
    (Object.entries(binds) as [KeybindAction, string][]).forEach(([action, code]) => { if (code) map.set(code, action); });
    this.codeToAction = map;
  }

  private onKeydown = (e: KeyboardEvent) => {
    if (this.chatting) return;
    const action = this.codeToAction.get(e.code); if (!action) return;
    if (action === 'scoreboard') { e.preventDefault(); this.state.scoreboard = true; return; }
    if (!this.locked) return;
    if (action === 'chat') { this.chatQueued = true; e.preventDefault(); return; }
    this.applyAction(action, true); e.preventDefault();
  };

  private onKeyup = (e: KeyboardEvent) => {
    if (this.chatting) return;
    const action = this.codeToAction.get(e.code); if (!action) return;
    if (action === 'scoreboard') { e.preventDefault(); this.state.scoreboard = false; return; }
    if (action === 'chat') return; this.applyAction(action, false);
  };

  private applyAction(action: KeybindAction, down: boolean) {
    switch (action) {
      case 'forward': this.state.forward = down; break;
      case 'back': this.state.back = down; break;
      case 'left': this.state.left = down; break;
      case 'right': this.state.right = down; break;
      case 'jump': this.state.jump = down; break;
      case 'dash': this.state.dash = down; break;
      case 'zoom': this.state.zoom = down; break;
      case 'scoreboard': this.state.scoreboard = down; break;
    }
  }

  private normMovement(raw: number): number {
    if (!IS_CHROMIUM || this.rawInputActive) return raw;
    return raw / (window.devicePixelRatio || 1);
  }

  private onMousemove = (e: MouseEvent) => {
    if (!this.locked || this.chatting) return;
    if (this.justLocked) { this.justLocked = false; return; }
    const mx = this.normMovement(e.movementX), my = this.normMovement(e.movementY);
    const r = this.radPerCount * this.lookScale;
    const dyaw = mx * r, dpitch = my * r * this.vertScale;
    if (!Number.isFinite(dyaw) || !Number.isFinite(dpitch)) return;
    if (Math.abs(dyaw) > MAX_LOOK_DELTA_RAD || Math.abs(dpitch) > MAX_LOOK_DELTA_RAD) return;
    this.accumYaw += dyaw; this.accumPitch += dpitch;
  };

  private onMousedown = (e: MouseEvent) => {
    if (!this.locked || this.chatting) return;
    if (e.button === 0) this.state.fire = true; else if (e.button === 2) this.state.boost = true;
  };
  private onMouseup = (e: MouseEvent) => {
    if (this.chatting) return;
    if (e.button === 0) this.state.fire = false; else if (e.button === 2) this.state.boost = false;
  };
  private onContextMenu = (e: MouseEvent) => { e.preventDefault(); };
  private onBlur = () => { this.clearKeys(); };

  private onLock = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (this.locked) this.justLocked = true;
    this.onLockChange(this.locked); if (!this.locked) this.clearKeys();
  };

  private clearKeys() {
    this.state.forward = false; this.state.back = false; this.state.left = false; this.state.right = false;
    this.state.jump = false; this.state.dash = false; this.state.boost = false; this.state.fire = false;
    this.state.zoom = false; this.state.scoreboard = false; this.accumYaw = 0; this.accumPitch = 0;
  }
}