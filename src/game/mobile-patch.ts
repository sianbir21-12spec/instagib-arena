import { InputManager } from './input';
import { attachMobileControls, isTouchDevice } from './mobile-controls';

// Mobile is layered onto the existing InputManager at runtime. Desktop keeps the
// original constructor/event path; touch devices receive an additional control
// surface that writes into the same InputState consumed by Game.
const proto = InputManager.prototype as InputManager['constructor']['prototype'] & Record<string, any>;
const originalAttach = proto.attach;
if (!proto.__mobilePatched) {
  proto.__mobilePatched = true;
  proto.setTouchAction = function (action: string, down: boolean) { (this as any).state[action] = down; };
  proto.addTouchLook = function (yaw: number, pitch: number) {
    if ((this as any).chatting) return;
    (this as any).accumYaw += yaw;
    (this as any).accumPitch += pitch;
  };
  proto.setTouchScoreboard = function (down: boolean) { (this as any).state.scoreboard = down; };
  proto.attach = function () {
    originalAttach.call(this);
    if (isTouchDevice() && !(this as any).__mobileControls) {
      const canvas = (this as any).canvas as HTMLCanvasElement;
      (this as any).__mobileControls = attachMobileControls(canvas, {
        setAction: (action, down) => this.setTouchAction(action, down),
        addLook: (yaw, pitch) => this.addTouchLook(yaw, pitch),
        setScoreboard: (down) => this.setTouchScoreboard(down),
      });
    }
  };
  const originalDetach = proto.detach;
  proto.detach = function () {
    (this as any).__mobileControls?.destroy();
    (this as any).__mobileControls = null;
    originalDetach.call(this);
  };
}
