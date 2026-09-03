import type { SoundClipName } from './audio';
import { Game } from './game';

type BotPersona = {
  name: string;
  color: string;
  rate: number;
  pitch: number;
  lines: string[];
};

const PERSONAS: BotPersona[] = [
  { name: 'TACTICAL', color: '#67e8f9', rate: 0.96, pitch: 0.7, lines: ['Hold angle.', 'I have a target.', 'Rotating.', 'Watch the flank.', 'Nice shot.'] },
  { name: 'HYPE', color: '#f0abfc', rate: 1.08, pitch: 1.15, lines: ['LETS GO!', 'That was clean!', 'You are not escaping!', 'Huge rail!', 'Again! Again!'] },
  { name: 'RIVAL', color: '#fca5a5', rate: 0.9, pitch: 0.5, lines: ['You got lucky.', 'I saw that.', 'Try again.', 'You are mine.', 'Close one.'] },
  { name: 'DEADPAN', color: '#d4d4d8', rate: 0.82, pitch: 0.35, lines: ['Interesting.', 'Predictable.', 'I will remember that.', 'Target acquired.', 'That was unfortunate.'] },
];

const BOT_NAMES = ['Vex', 'Razor', 'Strafe', 'Pyro', 'Vandal', 'Frost', 'Pulse', 'Echo'];
const PANEL_ID = 'instagib-bot-comms';
const MAX_LINES = 7;
let installed = false;

function pick<T>(items: T[]): T { return items[Math.floor(Math.random() * items.length)]; }

function ensurePanel(): HTMLDivElement {
  let panel = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (panel) return panel;
  panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.style.cssText = [
    'position:fixed', 'right:18px', 'bottom:76px', 'width:min(340px,42vw)',
    'z-index:9997', 'pointer-events:none', 'font:600 11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
    'text-shadow:0 1px 3px #000',
  ].join(';');
  document.body.appendChild(panel);
  return panel;
}

function pushLine(bot: BotPersona, text: string) {
  const panel = ensurePanel();
  const row = document.createElement('div');
  row.style.cssText = `margin-top:5px;padding:5px 8px;border-left:2px solid ${bot.color};background:rgba(9,9,11,.62);backdrop-filter:blur(5px);color:#e4e4e7`;
  row.innerHTML = `<span style="color:${bot.color};font-weight:900">${bot.name}</span><span style="opacity:.5"> · BOT</span> ${text}`;
  panel.appendChild(row);
  while (panel.children.length > MAX_LINES) panel.firstElementChild?.remove();
}

function speak(bot: BotPersona, text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = bot.rate;
  utterance.pitch = bot.pitch;
  utterance.volume = 0.45;
  const voices = window.speechSynthesis.getVoices();
  // Prefer an English voice, while still allowing the browser/device to choose
  // the best available voice. These are personality packs, not bundled copyrighted VO.
  utterance.voice = voices.find((v) => /^en/i.test(v.lang)) ?? voices[0] ?? null;
  window.speechSynthesis.speak(utterance);
}

function clearPanel() {
  document.getElementById(PANEL_ID)?.remove();
}

function installForGame(game: Game) {
  let disposed = false;
  let timer: number | null = null;
  const run = () => {
    if (disposed || (game as any).disposed) return;
    const bots = (game as any).bots;
    if (!bots) return;
    const persona = pick(PERSONAS);
    const botName = pick(BOT_NAMES);
    const line = pick(persona.lines);
    pushLine({ ...persona, name: botName }, line);
    if (Math.random() < 0.55) speak(persona, line);
    timer = window.setTimeout(run, 8500 + Math.random() * 10000);
  };

  timer = window.setTimeout(run, 3500 + Math.random() * 4000);
  const originalDispose = (game as any).dispose;
  (game as any).dispose = function (...args: unknown[]) {
    disposed = true;
    if (timer != null) window.clearTimeout(timer);
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

// Keep the exported type reference used by bundlers that tree-shake aggressively.
export type BotCommsSound = SoundClipName;
