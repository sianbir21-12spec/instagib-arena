import type { InputState } from './types';

type Action = keyof Pick<InputState, 'forward' | 'back' | 'left' | 'right' | 'jump' | 'dash' | 'boost' | 'fire'>;
type TouchPoint = { x: number; y: number };
type MobileControlCallbacks = { setAction:(action:Action,down:boolean)=>void; addLook:(yaw:number,pitch:number)=>void; setScoreboard:(down:boolean)=>void };
export type MobileControlHandle={destroy:()=>void;reset:()=>void};
const JOYSTICK_RADIUS=62;
const LOOK_SENSITIVITY=0.0045;
export function isTouchDevice(){return typeof window!=='undefined'&&(navigator.maxTouchPoints>0||'ontouchstart' in window);}
export function attachMobileControls(canvas:HTMLCanvasElement,callbacks:MobileControlCallbacks):MobileControlHandle{
 const pointers=new Map<number,TouchPoint>(); let lookPointer:number|null=null; let joystickPointer:number|null=null; let joystickOrigin:TouchPoint|null=null; let destroyed=false;
 const reset=()=>{pointers.clear();lookPointer=null;joystickPointer=null;joystickOrigin=null;(['forward','back','left','right','jump','dash','boost','fire'] as Action[]).forEach(a=>callbacks.setAction(a,false));callbacks.setScoreboard(false);};
 const down=(e:PointerEvent)=>{if(destroyed||e.pointerType!=='touch')return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(e.clientX<window.innerWidth*.42&&joystickPointer===null){joystickPointer=e.pointerId;joystickOrigin={x:e.clientX,y:e.clientY};try{canvas.setPointerCapture(e.pointerId);}catch{}return;}if(lookPointer===null){lookPointer=e.pointerId;try{canvas.setPointerCapture(e.pointerId);}catch{}}};
 const move=(e:PointerEvent)=>{if(destroyed||e.pointerType!=='touch')return;const p=pointers.get(e.pointerId);if(!p)return;e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});if(e.pointerId===lookPointer){callbacks.addLook((e.clientX-p.x)*LOOK_SENSITIVITY,(e.clientY-p.y)*LOOK_SENSITIVITY);return;}if(e.pointerId===joystickPointer&&joystickOrigin){const dx=e.clientX-joystickOrigin.x,dy=e.clientY-joystickOrigin.y,nx=Math.max(-1,Math.min(1,dx/JOYSTICK_RADIUS)),ny=Math.max(-1,Math.min(1,dy/JOYSTICK_RADIUS));callbacks.setAction('left',nx<-.2);callbacks.setAction('right',nx>.2);callbacks.setAction('forward',ny<-.2);callbacks.setAction('back',ny>.2);}};
 const release=(e:PointerEvent)=>{if(e.pointerType!=='touch')return;pointers.delete(e.pointerId);try{canvas.releasePointerCapture(e.pointerId);}catch{}if(e.pointerId===joystickPointer){joystickPointer=null;joystickOrigin=null;(['forward','back','left','right'] as Action[]).forEach(a=>callbacks.setAction(a,false));}if(e.pointerId===lookPointer)lookPointer=null;};
 const visibility=()=>{if(document.hidden)reset();};
 canvas.addEventListener('pointerdown',down,{passive:false});canvas.addEventListener('pointermove',move,{passive:false});canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',release);window.addEventListener('blur',reset);document.addEventListener('visibilitychange',visibility);
 return {reset,destroy:()=>{if(destroyed)return;destroyed=true;canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',release);canvas.removeEventListener('pointercancel',release);canvas.removeEventListener('lostpointercapture',release);window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',visibility);reset();}};
}
