import { Game } from './game';
import { syncFirebaseSession } from '../firebase';
import { subscribeSharedChat, type SharedChatMessage } from './shared-chat';

type VoicePersona = { color: string; rate: number; pitch: number };
const PERSONAS: Record<string, VoicePersona> = {
  TACTICAL: { color: '#67e8f9', rate: 0.96, pitch: 0.7 },
  HYPE: { color: '#f0abfc', rate: 1.08, pitch: 1.15 },
  RIVAL: { color: '#fca5a5', rate: 0.9, pitch: 0.5 },
  DEADPAN: { color: '#d4d4d8', rate: 0.82, pitch: 0.35 },
};
const PANEL_ID = 'instagib-bot-comms';
const MAX_LINES = 9;
let installed = false;
let lastSpokenId = '';

function ensurePanel(): HTMLDivElement {
  let panel = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = 'position:fixed;right:18px;bottom:76px;width:min(360px,44vw);z-index:9997;font:600 11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;text-shadow:0 1px 3px #000;pointer-events:auto';
  const feed = document.createElement('div');
  feed.dataset.feed = 'true';
  panel.appendChild(feed);
  const form = document.createElement('form');
  form.style.cssText = 'display:flex;gap:6px;margin-top:7px';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 300;
  input.placeholder = 'Talk to the bots…';
  input.autocomplete = 'off';
  input.style.cssText = 'flex:1;min-width:0;padding:7px 9px;border:1px solid rgba(255,255,255,.16);border-radius:7px;background:rgba(9,9,11,.82);color:#fff;outline:none;font:600 11px ui-monospace,SFMono-Regular,Menlo,monospace';
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'SEND';
  button.style.cssText = 'padding:7px 9px;border:0;border-radius:7px;background:#e4e4e7;color:#09090b;font:900 10px ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer';
  form.append(input, button);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    button.disabled = true;
    try {
      const response = await fetch('/api/chat/message', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: 'lobby', text }) });
      if (response.ok) input.value = '';
    } finally {
      button.disabled = false;
      input.focus();
    }
  });
  panel.appendChild(form);
  document.body.appendChild(panel);
  return panel;
}

function pushMessage(message: SharedChatMessage) {
  const panel = ensurePanel();
  const feed = panel.querySelector('[data-feed="true"]') as HTMLDivElement;
  const persona = PERSONAS[message.persona ?? ''] ?? PERSONAS.DEADPAN;
  const row = document.createElement('div');
  row.style.cssText = `margin-top:5px;padding:6px 8px;border-left:2px solid ${message.bot ? persona.color : '#a1a1aa'};background:rgba(9,9,11,.68);backdrop-filter:blur(5px);color:#e4e4e7`;
  const name = document.createElement('span');
  name.textContent = message.username;
  name.style.cssText = `color:${message.bot ? persona.color : '#fff'};font-weight:900`;
  const badge = document.createElement('span');
  badge.textContent = message.bot ? ` · ${message.persona ?? 'BOT'}` : ' · PLAYER';
  badge.style.opacity = '.5';
  const text = document.createElement('span');
  text.textContent = ` ${message.text}`;
  row.append(name, badge, text);
  feed.appendChild(row);
  while (feed.children.length > MAX_LINES) feed.firstElementChild?.remove();
  if (message.bot && message.id !== lastSpokenId) {
    lastSpokenId = message.id;
    speak(persona, message.text);
  }
}

function speak(persona: VoicePersona, text: string) {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = persona.rate;
  utterance.pitch = persona.pitch;
  utterance.volume = 0.45;
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => /^en/i.test(voice.lang)) ?? voices[0] ?? null;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function clearPanel() { document.getElementById(PANEL_ID)?.remove(); }

function installForGame(game: Game) {
  let disposed = false;
  let unsubscribe: (() => void) | null = null;
  let timer: number | null = null;
  ensurePanel();
  void syncFirebaseSession().finally(() => {
    if (!disposed) unsubscribe = subscribeSharedChat('lobby', (messages) => messages.forEach(pushMessage));
  });
  const pulse = async () => {
    if (disposed || (game as any).disposed) return;
    try { await fetch('/api/chat/bot', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId: 'lobby' }) }); } catch { /* optional chat */ }
    timer = window.setTimeout(pulse, 12000 + Math.random() * 9000);
  };
  timer = window.setTimeout(pulse, 5000 + Math.random() * 5000);
  const originalDispose = (game as any).dispose;
  (game as any).dispose = function (...args: unknown[]) {
    disposed = true;
    if (timer != null) window.clearTimeout(timer);
    unsubscribe?.();
    clearPanel();
    return originalDispose?.apply(this, args);
  };
}

export function installBotComms() {
  if (installed) return;
  installed = true;
  const proto = (Game as any).prototype;
  const originalStart = proto.start;
  proto.start = async function (...args: unknown[]) {
    const result = await originalStart.apply(this, args);
    if (!(this as Game).disposed) installForGame(this as Game);
    return result;
  };
}

installBotComms();
