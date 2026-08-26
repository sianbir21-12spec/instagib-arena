(() => {
  const MOBILE_QUERY = '(pointer: coarse), (hover: none)';
  let root = null;
  let joystick = null;
  let stick = null;
  let movePointer = null;
  let aimPointer = null;
  let lastAimX = 0;
  let lastAimY = 0;
  let lastCanvas = null;

  const coarse = () => window.matchMedia?.(MOBILE_QUERY).matches || (navigator.maxTouchPoints || 0) > 0;
  const emit = (detail) => window.dispatchEvent(new CustomEvent('instagib-mobile-input', { detail }));
  const clear = () => emit({ type: 'clear' });

  const button = (label, action, cls) => {
    const el = document.createElement('button');
    el.type = 'button'; el.className = `mobile-action ${cls || ''}`; el.setAttribute('aria-label', label); el.textContent = label;
    const down = (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture?.(e.pointerId); emit({ type: 'action', action, down: true }); el.classList.add('is-active'); };
    const up = (e) => { e.preventDefault(); e.stopPropagation(); emit({ type: 'action', action, down: false }); el.classList.remove('is-active'); };
    el.addEventListener('pointerdown', down, { passive: false }); el.addEventListener('pointerup', up, { passive: false });
    el.addEventListener('pointercancel', up, { passive: false }); el.addEventListener('lostpointercapture', up, { passive: false });
    return el;
  };

  function updateStick(e) {
    if (!joystick || movePointer !== e.pointerId) return;
    const r = joystick.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width * 0.34;
    let dx = e.clientX - cx, dy = e.clientY - cy; const len = Math.hypot(dx, dy);
    if (len > max) { dx *= max / len; dy *= max / len; }
    stick.style.transform = `translate3d(${dx}px, ${dy}px, 0)`; emit({ type: 'move', x: dx / max, y: dy / max });
  }
  function endMove(e) {
    if (movePointer !== e.pointerId) return;
    movePointer = null; if (stick) stick.style.transform = 'translate3d(0,0,0)'; emit({ type: 'move', x: 0, y: 0 });
  }
  function onAimDown(e) {
    if (!root || e.target.closest('.mobile-action, .mobile-joystick')) return;
    if (aimPointer !== null) return;
    aimPointer = e.pointerId; lastAimX = e.clientX; lastAimY = e.clientY; e.preventDefault();
  }
  function onAimMove(e) {
    if (aimPointer !== e.pointerId) return;
    const dx = e.clientX - lastAimX, dy = e.clientY - lastAimY; lastAimX = e.clientX; lastAimY = e.clientY;
    emit({ type: 'aim', dx, dy }); e.preventDefault();
  }
  function endAim(e) { if (aimPointer === e.pointerId) aimPointer = null; }

  function build() {
    if (root || !coarse()) return;
    root = document.createElement('div'); root.className = 'mobile-controls'; root.setAttribute('aria-label', 'Mobile game controls');
    const left = document.createElement('div'); left.className = 'mobile-stick-zone';
    joystick = document.createElement('div'); joystick.className = 'mobile-joystick'; stick = document.createElement('div'); stick.className = 'mobile-joystick-knob';
    joystick.appendChild(stick); left.appendChild(joystick); root.appendChild(left);
    const aim = document.createElement('div'); aim.className = 'mobile-aim-zone'; aim.innerHTML = '<span class="mobile-aim-hint">DRAG TO AIM</span>'; root.appendChild(aim);
    const actions = document.createElement('div'); actions.className = 'mobile-actions';
    actions.appendChild(button('FIRE', 'fire', 'mobile-fire')); actions.appendChild(button('JUMP', 'jump', 'mobile-jump')); actions.appendChild(button('DASH', 'dash', 'mobile-dash')); actions.appendChild(button('BOOST', 'boost', 'mobile-boost')); actions.appendChild(button('SCORE', 'scoreboard', 'mobile-score')); root.appendChild(actions);
    const rotate = document.createElement('div'); rotate.className = 'mobile-rotate-prompt'; rotate.innerHTML = '<div class="mobile-rotate-icon">↻</div><strong>LANDSCAPE RECOMMENDED</strong><span>Rotate your device for the best FPS controls.</span>'; root.appendChild(rotate);
    document.body.appendChild(root);

    joystick.addEventListener('pointerdown', (e) => { if (movePointer !== null) return; movePointer = e.pointerId; joystick.setPointerCapture?.(e.pointerId); updateStick(e); e.preventDefault(); }, { passive: false });
    joystick.addEventListener('pointermove', (e) => { updateStick(e); e.preventDefault(); }, { passive: false }); joystick.addEventListener('pointerup', endMove, { passive: false }); joystick.addEventListener('pointercancel', endMove, { passive: false }); joystick.addEventListener('lostpointercapture', endMove, { passive: false });
    aim.addEventListener('pointerdown', onAimDown, { passive: false }); aim.addEventListener('pointermove', onAimMove, { passive: false }); aim.addEventListener('pointerup', endAim, { passive: false }); aim.addEventListener('pointercancel', endAim, { passive: false });

    const reset = () => { movePointer = null; aimPointer = null; if (stick) stick.style.transform = 'translate3d(0,0,0)'; clear(); root?.querySelectorAll('.is-active').forEach((b) => b.classList.remove('is-active')); };
    window.addEventListener('blur', reset); document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  }

  function sync() {
    const canvas = document.querySelector('canvas');
    if (!canvas) { if (root) root.classList.remove('is-game'); lastCanvas = null; return; }
    if (!root) build(); if (!root) return;
    root.classList.toggle('is-game', !!canvas.closest('.fixed.inset-0.z-50'));
    if (canvas !== lastCanvas) { lastCanvas = canvas; clear(); }
  }
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', sync, { passive: true }); window.addEventListener('orientationchange', sync, { passive: true }); sync();
})();
