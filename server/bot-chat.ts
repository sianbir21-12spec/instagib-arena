import { randomBytes } from 'node:crypto';
import { Router, type Request } from 'express';
import { accountId } from './auth';
import { findUserById } from './db';
import { firebaseEnabled, recordMatchChatMessage } from './firebase';

const router = Router();
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10_000;
const MAX_MESSAGES = 6;
const MAX_TEXT = 300;

const BOTS = [
  { id: 'vex', name: 'Vex', persona: 'TACTICAL', lines: ['Hold angle.', 'I have a target.', 'Rotating.', 'Watch the flank.', 'Nice shot.'] },
  { id: 'razor', name: 'Razor', persona: 'RIVAL', lines: ['You got lucky.', 'I saw that.', 'Try again.', 'You are mine.', 'Close one.'] },
  { id: 'strafe', name: 'Strafe', persona: 'DEADPAN', lines: ['Interesting.', 'Predictable.', 'Target acquired.', 'That was unfortunate.'] },
  { id: 'pyro', name: 'Pyro', persona: 'HYPE', lines: ['LETS GO!', 'That was clean!', 'You are not escaping!', 'Huge rail!', 'Again! Again!'] },
  { id: 'vandal', name: 'Vandal', persona: 'RIVAL', lines: ['Nice try.', 'You should move faster.', 'I remember that angle.', 'Not bad.'] },
  { id: 'frost', name: 'Frost', persona: 'TACTICAL', lines: ['Watching mid.', 'Stay sharp.', 'Flank detected.', 'Clean rotation.'] },
  { id: 'pulse', name: 'Pulse', persona: 'HYPE', lines: ['THAT RAIL!', 'Another one!', 'Keep pushing!', 'Too easy!'] },
  { id: 'echo', name: 'Echo', persona: 'DEADPAN', lines: ['Noted.', 'I expected that.', 'Data updated.', 'Efficient.'] },
];

const pick = <T>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

function limited(key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || now >= current.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_MESSAGES;
}

function cleanMatch(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 80) || 'lobby' : 'lobby';
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_TEXT) : '';
}

function botReply(text: string) {
  const lower = text.toLowerCase();
  let bot = pick(BOTS);
  if (/hello|hi|hey|yo/.test(lower)) bot = BOTS.find((item) => item.id === 'echo') ?? bot;
  else if (/help|where|left|right|behind|flank/.test(lower)) bot = BOTS.find((item) => item.id === 'frost') ?? bot;
  else if (/good|nice|gg|clean/.test(lower)) bot = BOTS.find((item) => item.id === 'pyro') ?? bot;
  else if (/kill|dead|frag|shoot|rail/.test(lower)) bot = BOTS.find((item) => item.id === 'razor') ?? bot;
  return { ...bot, text: pick(bot.lines) };
}

export const botChatRouter = Router();

botChatRouter.post('/chat/message', async (req: Request, res) => {
  if (!firebaseEnabled) {
    res.status(503).json({ error: 'firebase_not_configured' });
    return;
  }
  const uid = accountId(req);
  const user = uid ? findUserById(uid) : undefined;
  if (!user) {
    res.status(401).json({ error: 'login_required' });
    return;
  }
  if (limited(`message:${uid}`)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }

  const matchId = cleanMatch(req.body?.matchId);
  const text = cleanText(req.body?.text);
  if (!text) {
    res.status(400).json({ error: 'empty_message' });
    return;
  }

  try {
    const messageId = randomBytes(12).toString('hex');
    await recordMatchChatMessage({
      matchId,
      messageId,
      uid: user.id,
      username: user.username,
      text,
      bot: false,
      persona: null,
    });

    const bot = botReply(text);
    const botMessageId = randomBytes(12).toString('hex');
    await recordMatchChatMessage({
      matchId,
      messageId: botMessageId,
      uid: `bot:${bot.id}`,
      username: bot.name,
      text: bot.text,
      bot: true,
      persona: bot.persona,
    });

    res.json({ ok: true, bot: { id: bot.id, name: bot.name, persona: bot.persona, text: bot.text } });
  } catch (err) {
    console.error('[bot-chat] message failed', err);
    res.status(503).json({ error: 'chat_unavailable' });
  }
});

botChatRouter.post('/chat/bot', async (req: Request, res) => {
  if (!firebaseEnabled) {
    res.status(503).json({ error: 'firebase_not_configured' });
    return;
  }
  const uid = accountId(req);
  if (!uid || !findUserById(uid)) {
    res.status(401).json({ error: 'login_required' });
    return;
  }
  if (limited(`bot:${uid}`)) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  const matchId = cleanMatch(req.body?.matchId);
  const requestedBot = typeof req.body?.botId === 'string' ? req.body.botId : '';
  const bot = BOTS.find((item) => item.id === requestedBot) ?? pick(BOTS);
  const text = pick(bot.lines);
  try {
    await recordMatchChatMessage({
      matchId,
      messageId: randomBytes(12).toString('hex'),
      uid: `bot:${bot.id}`,
      username: bot.name,
      text,
      bot: true,
      persona: bot.persona,
    });
    res.json({ ok: true, bot: { id: bot.id, name: bot.name, persona: bot.persona, text } });
  } catch (err) {
    console.error('[bot-chat] bot message failed', err);
    res.status(503).json({ error: 'chat_unavailable' });
  }
});
