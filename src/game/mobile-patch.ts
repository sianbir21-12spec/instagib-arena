import { InputManager } from './input';
import { attachMobileControls, isTouchDevice } from './mobile-controls';

const proto = InputManager.prototype as any;
const originalAttach = proto.attach;
if (!proto.__mobilePatched) {
  proto.__mobilePatched = true;
  proto.setTouchAction = function (action: string, down: boolean) { this.state[action] = down; };
  proto.addTouchLook = function (yaw: number, pitch: number) {
    if (this.chatting) return;
    this.accumYaw += yaw;
    this.accumPitch += pitch;
  };
  proto.setTouchScoreboard = function (down: boolean) { this.state.scoreboard = down; };
  proto.attach = function () {
    originalAttach.call(this);
    if (isTouchDevice() && !this.__mobileControls) {
      this.__mobileControls = attachMobileControls(this.canvas, {
        setAction: (action, down) => this.setTouchAction(action, down),
        addLook: (yaw, pitch) => this.addTouchLook(yaw, pitch),
        setScoreboard: (down) => this.setTouchScoreboard(down),
      });
    }
  };
  const originalDetach = proto.detach;
  proto.detach = function () {
    this.__mobileControls?.destroy();
    this.__mobileControls = null;
    originalDetach.call(this);
  };
}
