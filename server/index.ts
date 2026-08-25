// Instagib Arena — standalone server.
//
// One Node process hosts everything on a single port:
//   • the built web client (dist/, in production)
//   • the stats API           ->  /api/stats
//   • the authoritative game   ->  /ws/instagib  (WebSocket)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { WebSocketServer, type WebSocket } from 'ws';
import { statsRouter } from './stats';
import { leaderboardRouter } from './leaderboard';
import { rankedRouter } from './ranked';
import { challengeRouter } from './challenge';
import { feedbackRouter } from './feedback';
import { authRouter, adminUsernamesFromEnv } from './auth';
import { adminApiTokenEnabled, adminRouter, setLiveCountsSource } from './admin';
import { syncAdminsFromEnv } from './db';
import { attachInstagibWs } from './instagib-game';

const INSTAGIB_WS_PATH = '/ws/instagib';

process.on('uncaughtException', (err) => console.error('[fatal] uncaughtException', err));
process.on('unhandledRejection', (reason) => console.error('[fatal] unhandledRejection', reason));

const dev = process.env.NODE_ENV !== 'production';
const host = process.env.HOST || (dev ? 'localhost' : '0.0.0.0');

// Zeabur normally supplies PORT. Guard against an empty/non-numeric value so
// Node never receives NaN and crashes with ERR_SOCKET_BAD_PORT.
const parsedPort = Number.parseInt(process.env.PORT ?? '', 10);
const port = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort < 65536 ? parsedPort : 8080;
if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort >= 65536) {
  console.warn(`[config] invalid PORT=${JSON.stringify(process.env.PORT)}; using ${port}`);
}

const distDir = path.join(process.cwd(), 'dist');
const indexHtml = path.join(distDir, 'index.html');
const hasBuild = fs.existsSync(indexHtml);

const isPrivateHost = (hostname: string): boolean => {
  if (hostname === 'localhost' || hostname.endsWith('.local')) return true;
  if (hostname === '::1' || hostname.startsWith('127.')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(hostname);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
};

const isAllowedWsOrigin = (origin: string | undefined, hostHeader: string): boolean => {
  if (!origin) return dev;
  try {
    const originUrl = new URL(origin);
    const base = process.env.APP_BASE_URL;
    if (base && originUrl.origin === new URL(base).origin) return true;
    if (dev && isPrivateHost(originUrl.hostname)) return true;
    return originUrl.host === hostHeader;
  } catch {
    return false;
  }
};

// Keep the remainder of the existing server implementation unchanged.
