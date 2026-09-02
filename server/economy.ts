// Server-authoritative coin operations used by admin tooling.
// This opens the same SQLite file as db.ts, but keeps the mutation isolated in a
// small transaction so an admin grant can never be supplied by the browser.

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const databasePath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(dataDir, 'instagib.sqlite');

const sqlite = new Database(databasePath);
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('journal_mode = WAL');

const findUserStmt = sqlite.prepare(`
  SELECT id, username, is_admin AS isAdmin
  FROM instagib_users
  WHERE username_lower = ?
`);
const ensureStatsStmt = sqlite.prepare(`
  INSERT OR IGNORE INTO instagib_stats (player_id, user_name, created_at, updated_at)
  VALUES (?, ?, ?, ?)
`);
const getCreditsStmt = sqlite.prepare(`SELECT credits FROM instagib_stats WHERE player_id = ?`);
const grantStmt = sqlite.prepare(`
  UPDATE instagib_stats
  SET credits = credits + @amount, updated_at = @now
  WHERE player_id = @playerId
`);

export type CoinGrantResult =
  | { ok: true; playerId: string; username: string; amount: number; balance: number }
  | { ok: false; reason: 'not_found' | 'invalid_amount' | 'overflow' };

export function grantCoinsByUsername(username: string, amount: number): CoinGrantResult {
  const clean = username.trim().toLowerCase();
  const n = Math.floor(amount);
  if (!clean || !Number.isSafeInteger(n) || n < -1_000_000_000 || n > 1_000_000_000 || n === 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

  const user = findUserStmt.get(clean) as
    | { id: string; username: string; isAdmin: number }
    | undefined;
  if (!user) return { ok: false, reason: 'not_found' };

  const now = Date.now();
  const tx = sqlite.transaction(() => {
    ensureStatsStmt.run(user.id, user.username, now, now);
    const current = Number((getCreditsStmt.get(user.id) as { credits: number } | undefined)?.credits ?? 0);
    const next = current + n;
    if (!Number.isSafeInteger(next) || next < 0 || next > 9_000_000_000_000_000) {
      throw new Error('coin_overflow');
    }
    grantStmt.run({ playerId: user.id, amount: n, now });
    return next;
  });

  try {
    const balance = tx();
    return { ok: true, playerId: user.id, username: user.username, amount: n, balance };
  } catch (err) {
    if (err instanceof Error && err.message === 'coin_overflow') {
      return { ok: false, reason: 'overflow' };
    }
    throw err;
  }
}

export function getCoinsByUsername(username: string): { username: string; credits: number } | null {
  const clean = username.trim().toLowerCase();
  const user = findUserStmt.get(clean) as { id: string; username: string } | undefined;
  if (!user) return null;
  const row = getCreditsStmt.get(user.id) as { credits: number } | undefined;
  return { username: user.username, credits: Number(row?.credits ?? 0) };
}
