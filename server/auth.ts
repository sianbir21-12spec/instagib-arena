// Account auth: guest-by-default, optional username/password account. Firebase Admin
// is the cloud identity/authorization and profile authority; the existing opaque
// session remains as a compatibility layer for the current game protocol.

import { Router, type Request } from 'express';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import {
  createSession,
  createUser,
  deleteSession,
  findUserById,
  findUserByName,
  getProfile,
  logEvent,
  setAdmin,
  userIdFromSession,
} from './db';
import { containsProfanity, isReservedName } from './profanity';
import {
  createFirebaseToken,
  findFirebasePlayerByUsername,
  firebaseEnabled,
  grantFirebaseCoins,
  requireFirebaseAdmin,
  syncPlayerProfile,
} from './firebase';
import { getCoinsByUsername, grantCoinsByUsername } from './economy';

export function adminUsernamesFromEnv(): string[] {
  return (process.env.ADMIN_USERNAMES ?? '').split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

const SESSION_COOKIE = 'igsession';
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 365;
const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: SESSION_MAX_AGE, path: '/' };

function hashPw(password: string, salt: string): Buffer { return scryptSync(password, salt, 64); }
function genId(): string { return randomBytes(12).toString('hex'); }
function genToken(): string { return randomBytes(32).toString('base64url'); }

export function accountId(req: Request): string {
  const token = req.cookies?.[SESSION_COOKIE];
  return typeof token === 'string' ? userIdFromSession(token) : '';
}

export function accountIdFromCookieHeader(header: string | undefined): string {
  if (!header) return '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === SESSION_COOKIE) return userIdFromSession(decodeURIComponent(part.slice(i + 1).trim()));
  }
  return '';
}

const attempts = new Map<string, { n: number; resetAt: number }>();
const ATTEMPT_WINDOW = 60_000;
const ATTEMPT_MAX = 12;
function rateLimited(ip: string, now: number): boolean {
  const a = attempts.get(ip);
  if (!a || now > a.resetAt) { attempts.set(ip, { n: 1, resetAt: now + ATTEMPT_WINDOW }); return false; }
  a.n += 1;
  return a.n > ATTEMPT_MAX;
}
setInterval(() => { const now = Date.now(); for (const [ip, a] of attempts) if (now > a.resetAt) attempts.delete(ip); }, ATTEMPT_WINDOW).unref?.();

async function syncAccount(uid: string): Promise<void> {
  if (!firebaseEnabled) return;
  const user = findUserById(uid);
  if (!user) return;
  const profile = getProfile(uid);
  await syncPlayerProfile({
    uid,
    username: user.username,
    isAdmin: user.isAdmin,
    level: profile.level,
    totalXp: profile.totalXp,
    credits: profile.credits,
    stats: profile.stats as unknown as Record<string, unknown>,
    inventory: { unlocked: profile.unlocked, equipped: profile.equipped },
  });
}

export const authRouter = Router();

authRouter.get('/auth/me', (req, res) => {
  const id = accountId(req);
  const user = id ? findUserById(id) : undefined;
  res.json({ user: user ? { username: user.username, isAdmin: user.isAdmin, isVerified: user.isVerified } : null });
});

authRouter.post('/auth/register', (req, res) => {
  if (rateLimited(req.ip ?? 'unknown', Date.now())) { res.status(429).json({ error: 'rate_limited' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim().slice(0, 200) : null;
  if (!USERNAME_RE.test(username)) { res.status(400).json({ error: 'bad_username' }); return; }
  if (isReservedName(username)) { res.status(400).json({ error: 'reserved' }); return; }
  if (containsProfanity(username)) { res.status(400).json({ error: 'profane' }); return; }
  if (password.length < 6 || password.length > 200) { res.status(400).json({ error: 'bad_password' }); return; }
  const lower = username.toLowerCase();
  if (findUserByName(lower)) { res.status(409).json({ error: 'taken' }); return; }
  const salt = randomBytes(16).toString('hex');
  const id = genId();
  createUser({ id, username, usernameLower: lower, pwHash: hashPw(password, salt).toString('hex'), pwSalt: salt, email, createdAt: Date.now() });
  const isAdmin = adminUsernamesFromEnv().includes(lower);
  if (isAdmin) setAdmin(id, true);
  const token = genToken();
  createSession(token, id, Date.now());
  res.cookie(SESSION_COOKIE, token, cookieOpts);
  logEvent({ event: 'register', actorId: id, actorName: username, ip: req.ip, detail: isAdmin ? { admin: true } : undefined });
  void syncAccount(id).catch((err) => console.error('[firebase] profile sync failed', err));
  res.json({ user: { username, isAdmin, isVerified: false } });
});

authRouter.post('/auth/login', (req, res) => {
  if (rateLimited(req.ip ?? 'unknown', Date.now())) { res.status(429).json({ error: 'rate_limited' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const user = findUserByName(username.toLowerCase());
  const salt = user?.pw_salt ?? 'x';
  const calc = hashPw(password, salt);
  const stored = user ? Buffer.from(user.pw_hash, 'hex') : Buffer.alloc(calc.length);
  const ok = !!user && calc.length === stored.length && timingSafeEqual(calc, stored);
  if (!ok) { res.status(401).json({ error: 'invalid' }); return; }
  const token = genToken();
  createSession(token, user!.id, Date.now());
  res.cookie(SESSION_COOKIE, token, cookieOpts);
  const acct = findUserById(user!.id);
  logEvent({ event: 'login', actorId: user!.id, actorName: user!.username, ip: req.ip });
  void syncAccount(user!.id).catch((err) => console.error('[firebase] profile sync failed', err));
  res.json({ user: { username: user!.username, isAdmin: !!acct?.isAdmin, isVerified: !!acct?.isVerified } });
});

authRouter.post('/auth/logout', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string') deleteSession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.post('/auth/firebase-token', async (req, res) => {
  const id = accountId(req);
  const user = id ? findUserById(id) : undefined;
  if (!user) { res.status(401).json({ error: 'login_required' }); return; }
  if (!firebaseEnabled) { res.status(503).json({ error: 'firebase_not_configured' }); return; }
  try {
    const token = await createFirebaseToken({ uid: user.id, username: user.username, isAdmin: user.isAdmin });
    await syncAccount(user.id);
    res.json({ token });
  } catch (err) {
    console.error('[firebase] custom-token failed', err);
    res.status(503).json({ error: 'firebase_unavailable' });
  }
});

async function requireAdmin(req: Request): Promise<{ id: string; username: string } | null> {
  if (firebaseEnabled) {
    const token = await requireFirebaseAdmin(req);
    if (!token?.uid) return null;
    const user = findUserById(token.uid);
    return user ? { id: user.id, username: user.username } : { id: token.uid, username: String(token.gameUsername ?? '') };
  }
  const id = accountId(req);
  const user = id ? findUserById(id) : undefined;
  return user?.isAdmin ? { id: user.id, username: user.username } : null;
}

authRouter.get('/auth/admin/coins', async (req, res) => {
  const admin = await requireAdmin(req);
  if (!admin) { res.status(403).json({ error: 'forbidden' }); return; }
  const username = typeof req.query.username === 'string' ? req.query.username : '';
  if (firebaseEnabled) {
    const result = await findFirebasePlayerByUsername(username);
    if (!result) { res.status(404).json({ error: 'not_found' }); return; }
    res.json({ username: result.username, credits: result.credits });
    return;
  }
  const result = getCoinsByUsername(username);
  if (!result) { res.status(404).json({ error: 'not_found' }); return; }
  res.json(result);
});

authRouter.post('/auth/admin/coins/grant', async (req, res) => {
  const admin = await requireAdmin(req);
  if (!admin) { res.status(403).json({ error: 'forbidden' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : 'admin grant';

  if (firebaseEnabled) {
    const target = await findFirebasePlayerByUsername(username);
    if (!target) { res.status(404).json({ error: 'not_found' }); return; }
    try {
      const result = await grantFirebaseCoins({ uid: target.uid, username: target.username, amount, actorId: admin.id, actorName: admin.username, reason });
      logEvent({ event: 'admin.coins_grant', actorId: admin.id, actorName: admin.username, targetId: target.uid, detail: { username: target.username, amount: Math.trunc(amount), balance: result.balance, reason }, ip: req.ip });
      res.json({ ok: true, playerId: target.uid, username: target.username, amount: Math.trunc(amount), balance: result.balance, reason });
    } catch (err) {
      const code = err instanceof Error ? err.message : 'coin_error';
      res.status(code === 'invalid_amount' || code === 'coin_overflow' ? 400 : 503).json({ error: code });
    }
    return;
  }

  const result = grantCoinsByUsername(username, amount);
  if (!result.ok) { res.status(result.reason === 'not_found' ? 404 : 400).json({ error: result.reason }); return; }
  logEvent({ event: 'admin.coins_grant', actorId: admin.id, actorName: admin.username, targetId: result.playerId, detail: { username: result.username, amount: result.amount, balance: result.balance, reason }, ip: req.ip });
  res.json({ ok: true, ...result, reason });
});

authRouter.get('/auth/firebase-status', async (req, res) => {
  if (!firebaseEnabled) { res.json({ enabled: false, authenticated: false, admin: false }); return; }
  const { verifyFirebaseRequest } = await import('./firebase');
  const token = await verifyFirebaseRequest(req);
  res.json({ enabled: true, authenticated: !!token, admin: token?.admin === true, uid: token?.uid ?? null });
});
