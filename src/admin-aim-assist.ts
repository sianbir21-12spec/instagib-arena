import * as THREE from 'three';
import { rayAabb } from './game/map';
import { BOT_HEIGHT, EYE_HEIGHT, PLAYER_HEIGHT, RAIL_RANGE } from './game/constants';
import type { Game } from './game/game';

/**
 * Admin-only in-game aim assistance.
 *
 * This is deliberately client-side and opt-in: the server still owns online
 * hit validation. It is exposed only when /api/auth/me reports isAdmin=true.
 * F6 toggles the assist while playing.
 */
const KEY = 'instagib-admin-aim-assist';
const MAX_TARGET_DISTANCE = Math.min(RAIL_RANGE, 70);
const MAX_CONE_DEG = 10;
const MAX_STEP_DEG = 4.5;
const TARGET_HEIGHT = PLAYER_HEIGHT * 0.72;

let installed = false;

function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function stepAngle(current: number, target: number, maxStep: number): number {
  const d = angleDelta(target, current);
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}

function visible(game: any, origin: THREE.Vector3, target: THREE.Vector3, distance: number): boolean {
  const map = game.map;
  if (!map?.boxes) return true;
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const len = Math.hypot(dx, dy, dz);
  if (!len) return false;
  const dir = { x: dx / len, y: dy / len, z: dz / len };
  for (const box of map.boxes) {
    const t = rayAabb(
      { x: origin.x, y: origin.y, z: origin.z },
      dir,
      box,
    );
    if (t != null && t > 0.05 && t < distance - 0.15) return false;
  }
  return true;
}

function findBestTarget(game: any): THREE.Vector3 | null {
  const player = game.player;
  if (!player) return null;
  const eye = new THREE.Vector3(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(
    new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'),
  );

  const candidates: { pos: THREE.Vector3; score: number }[] = [];
  const remotes: Map<string, any> = game.remotePlayers;
  if (remotes) {
    for (const [id, rp] of remotes) {
      if (!rp?.group?.visible) continue;
      if (game.spectator && id === game.spectatedId) continue;
      const p = rp.group.position;
      candidates.push({
        pos: new THREE.Vector3(p.x, p.y + TARGET_HEIGHT, p.z),
        score: 0,
      });
    }
  }

  const bots: any[] = game.bots?.bots ?? [];
  for (const b of bots) {
    if (!b?.state?.alive) continue;
    if (game.localTeam != null && b.getTeam?.() === game.localTeam) continue;
    const p = b.state.pos;
    const height = b.centerY ? b.centerY() - p.y : BOT_HEIGHT * 0.72;
    candidates.push({
      pos: new THREE.Vector3(p.x, p.y + height, p.z),
      score: 0,
    });
  }

  let best: { pos: THREE.Vector3; score: number } | null = null;
  for (const c of candidates) {
    const to = c.pos.clone().sub(eye);
    const distance = to.length();
    if (!distance || distance > MAX_TARGET_DISTANCE) continue;
    const dir = to.normalize();
    const dot = THREE.MathUtils.clamp(forward.dot(dir), -1, 1);
    const angle = Math.acos(dot);
    if (angle > THREE.MathUtils.degToRad(MAX_CONE_DEG)) continue;
    if (!visible(game, eye, c.pos, distance)) continue;
    // Prefer targets closest to the crosshair, then distance.
    c.score = angle * 8 + distance * 0.004;
    if (!best || c.score < best.score) best = { pos: c.pos, score: c.score };
  }
  return best?.pos ?? null;
}

function assistFrame(game: any, enabled: boolean) {
  if (!enabled || game.disposed || game.spectator || game.matchOver || game.killcam || !game.locked) return;
  const player = game.player;
  if (!player) return;
  const target = findBestTarget(game);
  if (!target) return;

  const eyeY = player.pos.y + EYE_HEIGHT;
  const dx = target.x - player.pos.x;
  const dy = target.y - eyeY;
  const dz = target.z - player.pos.z;
  const horizontal = Math.hypot(dx, dz);
  if (!horizontal) return;
  const targetYaw = Math.atan2(-dx, -dz);
  const targetPitch = Math.atan2(dy, horizontal);
  const maxStep = THREE.MathUtils.degToRad(MAX_STEP_DEG);
  player.yaw = stepAngle(player.yaw, targetYaw, maxStep);
  player.pitch = Math.max(-1.45, Math.min(1.45, stepAngle(player.pitch, targetPitch, maxStep)));
}

function addIndicator(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'admin-aim-assist-indicator';
  el.style.cssText = [
    'position:fixed', 'right:16px', 'top:16px', 'z-index:9999',
    'padding:8px 11px', 'border:1px solid rgba(34,211,238,.35)',
    'border-radius:8px', 'background:rgba(9,9,11,.78)', 'backdrop-filter:blur(8px)',
    'font:700 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace',
    'letter-spacing:.12em', 'text-transform:uppercase', 'color:#67e8f9',
    'pointer-events:none', 'box-shadow:0 0 24px rgba(34,211,238,.12)',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

function installForGame(game: Game) {
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d?.user?.isAdmin) return;
      const anyGame = game as any;
      let enabled = localStorage.getItem(KEY) !== 'off';
      const indicator = addIndicator();
      const render = () => {
        if (anyGame.disposed) return;
        indicator.textContent = `ADMIN AIM ASSIST · ${enabled ? 'ON' : 'OFF'} · F6`;
        indicator.style.opacity = enabled ? '1' : '.55';
        assistFrame(anyGame, enabled);
        requestAnimationFrame(render);
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.code !== 'F6') return;
        e.preventDefault();
        enabled = !enabled;
        localStorage.setItem(KEY, enabled ? 'on' : 'off');
      };
      window.addEventListener('keydown', onKey);
      const originalDispose = anyGame.dispose.bind(anyGame);
      anyGame.dispose = () => {
        window.removeEventListener('keydown', onKey);
        indicator.remove();
        originalDispose();
      };
      requestAnimationFrame(render);
    })
    .catch(() => {});
}

export function installAdminAimAssist() {
  if (installed) return;
  installed = true;
  const proto = (Game as any).prototype;
  const originalStart = proto.start;
  proto.start = async function (...args: unknown[]) {
    const result = await originalStart.apply(this, args);
    if (!this.disposed) installForGame(this as Game);
    return result;
  };
}

// Install immediately when this module is imported by main.tsx.
installAdminAimAssist();
