import { useEffect, useRef, useState } from 'react';

type Target = { x: number; y: number; vx: number; vy: number; r: number };

export default function AimTrainingLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [assist, setAssist] = useState(true);
  const [running, setRunning] = useState(true);
  const [score, setScore] = useState(0);
  const [hits, setHits] = useState(0);
  const [shots, setShots] = useState(0);
  const state = useRef({ targets: [] as Target[], aimX: 400, aimY: 250, last: performance.now() });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const spawn = (): Target => ({
      x: 80 + Math.random() * Math.max(1, canvas.clientWidth - 160),
      y: 70 + Math.random() * Math.max(1, canvas.clientHeight - 140),
      vx: (Math.random() * 2 - 1) * 180,
      vy: (Math.random() * 2 - 1) * 150,
      r: 14 + Math.random() * 8,
    });
    state.current.targets = Array.from({ length: 6 }, spawn);

    let frame = 0;
    const loop = (now: number) => {
      const s = state.current;
      const dt = Math.min(0.04, (now - s.last) / 1000);
      s.last = now;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, w, h);

      if (running) {
        for (const t of s.targets) {
          t.x += t.vx * dt;
          t.y += t.vy * dt;
          if (t.x < t.r || t.x > w - t.r) t.vx *= -1;
          if (t.y < t.r || t.y > h - t.r) t.vy *= -1;
        }
      }

      let aimX = s.aimX;
      let aimY = s.aimY;
      if (assist && running) {
        let nearest: Target | undefined;
        let best = 115 * 115;
        for (const t of s.targets) {
          const dx = t.x - aimX;
          const dy = t.y - aimY;
          const d = dx * dx + dy * dy;
          if (d < best) { best = d; nearest = t; }
        }
        if (nearest) {
          aimX += (nearest.x - aimX) * Math.min(1, dt * 7);
          aimY += (nearest.y - aimY) * Math.min(1, dt * 7);
        }
      }
      s.aimX = Math.max(0, Math.min(w, aimX));
      s.aimY = Math.max(0, Math.min(h, aimY));

      for (const t of s.targets) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(34,211,238,.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(t.x, t.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.fill();
      }

      ctx.strokeStyle = assist ? 'rgba(34,211,238,.95)' : 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.aimX - 12, s.aimY); ctx.lineTo(s.aimX + 12, s.aimY); ctx.moveTo(s.aimX, s.aimY - 12); ctx.lineTo(s.aimX, s.aimY + 12); ctx.stroke();

      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [assist, running]);

  const shoot = () => {
    if (!running) return;
    const { aimX, aimY, targets } = state.current;
    setShots((v) => v + 1);
    const hit = targets.findIndex((t) => Math.hypot(t.x - aimX, t.y - aimY) <= t.r + 5);
    if (hit >= 0) {
      targets[hit] = { x: 80 + Math.random() * 640, y: 70 + Math.random() * 380, vx: (Math.random() * 2 - 1) * 180, vy: (Math.random() * 2 - 1) * 150, r: 14 + Math.random() * 8 };
      setHits((v) => v + 1);
      setScore((v) => v + 100);
    }
  };

  return (
    <main className='min-h-screen bg-zinc-950 px-5 py-8 text-white'>
      <div className='mx-auto max-w-5xl'>
        <div className='mb-5 flex flex-wrap items-end justify-between gap-4'>
          <div><p className='text-[10px] font-bold uppercase tracking-[.25em] text-cyan-300'>Training only</p><h1 className='mt-1 text-3xl font-black'>Aim Lab</h1><p className='mt-1 text-sm text-white/45'>Moving targets with an optional local aim-assist trainer. No competitive score or match state is affected.</p></div>
          <div className='flex gap-2 text-xs font-mono text-white/60'><span>{score} XP</span><span>{hits}/{shots} hits</span></div>
        </div>
        <div className='overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl'>
          <canvas ref={canvasRef} onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); state.current.aimX = e.clientX - r.left; state.current.aimY = e.clientY - r.top; }} onPointerDown={shoot} className='block h-[62vh] min-h-[420px] w-full cursor-crosshair' />
        </div>
        <div className='mt-4 flex flex-wrap gap-3'>
          <button onClick={() => setAssist((v) => !v)} className={`rounded-lg px-4 py-3 text-xs font-black uppercase tracking-[.15em] ${assist ? 'bg-cyan-400 text-zinc-950' : 'border border-white/15 text-white/60'}`}>Aim assist: {assist ? 'ON' : 'OFF'}</button>
          <button onClick={() => setRunning((v) => !v)} className='rounded-lg border border-white/15 px-4 py-3 text-xs font-black uppercase tracking-[.15em] text-white/70'>{running ? 'Pause' : 'Resume'}</button>
          <button onClick={() => { setScore(0); setHits(0); setShots(0); setRunning(true); }} className='rounded-lg border border-white/15 px-4 py-3 text-xs font-black uppercase tracking-[.15em] text-white/70'>Reset</button>
        </div>
      </div>
    </main>
  );
}
