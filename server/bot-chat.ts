import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import { accountId } from './auth';
import { findUserById } from './db';
import { firebaseEnabled } from './firebase';
import { publishChatMessage } from './realtime-chat';

const BOTS = [
  { id: 'vex', name: 'Vex', persona: 'TACTICAL', lines: ['Hold angle.', 'I have a target.', 'Rotating.', 'Watch the flank.', 'Nice shot.'] },
  { id: 'razor', name: 'Razor', persona: 'RIVAL', lines: ['You got lucky.', 'I saw that.', 'Try again.', 'You are mine.', 'Close one.'] },
  { id: 'strafe', name: 'Strafe', persona: 'DEADPAN', lines: ['Interesting.', 'Predictable.', 'Target acquired.', 'That was unfortunate.'] },
  { id: 'pyro', name: 'Pyro', persona: 'HYPE', lines: ['LETS GO!', 'That was clean!', 'You are not escaping!', 'Huge rail!', 'Again! Again!'] },
  { id: 'frost', name: 'Frost', persona: 'TACTICAL', lines: ['Watching mid.', 'Stay sharp.', 'Flank detected.', 'Clean rotation.'] },
  { id: 'pulse', name: 'Pulse', persona: 'HYPE', lines: ['THAT RAIL!', 'Another one!', 'Keep pushing!', 'Too easy!'] },
  { id: 'echo', name: 'Echo', persona: 'DEADPAN', lines: ['Noted.', 'I expected that.', 'Data updated.', 'Efficient.'] },
];

const attempts = new Map<string, number>();
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const clean = (v: unknown, max: number) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
function limited(uid: string) {
  const now = Date.now();
  const previous = attempts.get(uid) ?? 0;
  if (now - previous < 1500) return true;
  attempts.set(uid, now);
  return false;
}
function chooseReply(text: string) {
  const lower = text.toLowerCase();
  let bot = pick(BOTS);
  if (/hello|hi|hey|yo/.test(lower)) bot = BOTS.find((b) => b.id === 'echo') ?? bot;
  else if (/help|where|left|right|behind|flank/.test(lower)) bot = BOTS.find((b) => b.id === 'frost') ?? bot;
  else if (/good|nice|gg|clean/.test(lower)) bot = BOTS.find((b) => b.id === 'pyro') ?? bot;
  else if (/kill|dead|frag|shoot|rail/.test(lower)) bot = BOTS.find((b) => b.id === 'razor') ?? bot;
  return { ...bot, text: pick(bot.lines) };
}

export const botChatRouter = Router();

botChatRouter.post('/chat/message', async (req: Request, res) => {
  if (!firebaseEnabled) return res.status(503).json({ error: 'firebase_not_configured' });
  const uid = accountId(req);
  const user = uid ? findUserById(uid) : undefined;
  if (!user) return res.status(401).json({ error: 'login_required' });
  if (limited(uid)) return res.status(429).json({ error: 'rate_limited' });
  const matchId = clean(req.body?.matchId, 80) || 'lobby';
  const text = clean(req.body?.text, 300);
  if (!text) return res.status(400).json({ error: 'empty_message' });
  try {
    await publishChatMessage({ matchId, messageId: randomBytes(12).toString('hex'), uid: user.id, username: user.username, text, bot: false });
    const bot = chooseReply(text);
    await publishChatMessage({ matchId, messageId: randomBytes(12).toString('hex'), uid: `bot:${bot.id}`, username: bot.name, text: bot.text, bot: true, persona: bot.persona });
    return res.json({ ok: true, bot: { id: bot.id, name: bot.name, persona: bot.persona, text: bot.text } });
  } catch (err) {
    console.error('[bot-chat] message failed', err);
    return res.status(503).json({ error: 'chat_unavailable' });
  }
});

botChatRouter.post('/chat/bot', async (req: Request, res) => {
  if (!firebaseEnabled) return res.status(503).json({ error: 'firebase_not_configured' });
  const uid = accountId(req);
  if (!uid || !findUserById(uid)) return res.status(401).json({ error: 'login_required' });
  if (limited(`bot:${uid}`)) return res.status(429).json({ error: 'rate_limited' });
  const matchId = clean(req.body?.matchId, 80) || 'lobby';
  const requested = clean(req.body?.botId, 20);
  const bot = BOTS.find((b) => b.id === requested) ?? pick(BOTS);
  try {
    await publishChatMessage({ matchId, messageId: randomBytes(12).toString('hex'), uid: `bot:${bot.id}`, username: bot.name, text: pick(bot.lines), bot: true, persona: bot.persona });
    return res.json({ ok: true, bot });
  } catch (err) {
    console.error('[bot-chat] bot failed', err);
    return res.status(503).json({ error: 'chat_unavailable' });
  }
});
