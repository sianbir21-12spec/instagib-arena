// Instagib Arena — standalone server.
//
// One Node process hosts everything on a single port:
//   • the built web client (dist/, in production)
//   • the stats API           ->  /api/stats
//   • the authoritative game   ->  /ws/instagib  (WebSocket)
//
// In development this process only serves /api and /ws/instagib; the Vite dev
// server hosts the client and proxies those paths here (see vite.config.ts), so
// the browser always talks to a single origin — same as production.

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
import { botChatRouter } from './bot-chat';

const INSTAGIB_WS_PATH = '/ws/instagib';

process.on('uncaughtException', (err) => console.error('[fatal] uncaughtException', err));
process.on('unhandledRejection', (reason) => console.error('[fatal] unhandledRejection', reason));

const dev = process.env.NODE_ENV !== 'production';
const host = process.env.HOST || (dev ? 'localhost' : '0.0.0.0');
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

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, _res, next) => {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.length > 0) req.headers['x-forwarded-for'] = cf;
  next();
});

const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' blob: data: https://*.firebaseio.com https://*.googleapis.com wss://*.firebaseio.com",
  "worker-src 'self' blob:",
  "form-action 'self'",
].join('; ');
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=(), usb=()');
  if (!dev) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(cookieParser());
app.use(express.json({ limit: '16kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, build: hasBuild }));

let liveCounts: () => {
  online: number;
  inMatch: number;
  rooms: number;
  loopLagMs: number;
  loopLagMaxMs: number;
} = () => ({ online: 0, inMatch: 0, rooms: 0, loopLagMs: 0, loopLagMaxMs: 0 });
app.get('/api/live', (_req, res) => res.json(liveCounts()));
app.use('/api', authRouter);
app.use('/api', botChatRouter);
app.use('/api', statsRouter);
app.use('/api', leaderboardRouter);
app.use('/api', rankedRouter);
app.use('/api', challengeRouter);
app.use('/api', feedbackRouter);
app.use('/api/admin', adminRouter);

{
  const admins = adminUsernamesFromEnv();
  const n = syncAdminsFromEnv(admins);
  if (admins.length) console.log(`[admin] ADMIN_USERNAMES=[${admins.join(', ')}] — ${n} synced`);
}

if (hasBuild) {
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
        }
      },
    }),
  );
  const CANONICAL_ROUTES = ['/play'];
  const shellHtml = fs.readFileSync(indexHtml, 'utf8');
  const shellByRoute = new Map<string, string>();
  for (const route of CANONICAL_ROUTES) {
    shellByRoute.set(
      route,
      shellHtml
        .replaceAll('href="https://instagib.win/"', `href="https://instagib.win${route}"`)
        .replaceAll('content="https://instagib.win/"', `content="https://instagib.win${route}"`),
    );
  }
  app.get(/.*/, (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(shellByRoute.get(req.path) ?? shellHtml);
  });
} else if (!dev) {
  console.warn('[server] No dist/ build found. Run `npm run build` before `npm start`.');
}

app.use((err: Error & { type?: string; status?: number }, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'payload_too_large' });
    return;
  }
  if (err?.type === 'entity.parse.failed' || err?.status === 400) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }
  console.error('[http] unhandled route error', err);
  res.status(500).json({ error: 'server_error' });
});

const server = http.createServer(app);
server.on('error', (err) => console.error('[server] error', err));

const instagibWss = new WebSocketServer({
  noServer: true,
  maxPayload: 16 * 1024,
  perMessageDeflate: false,
});
({ liveCounts } = attachInstagibWs(instagibWss));
setLiveCountsSource(liveCounts);
instagibWss.on('error', (err) => console.error('[ws] server error', err));

const MAX_WS_TOTAL = parseInt(process.env.MAX_WS_TOTAL || '600', 10);
const MAX_WS_PER_IP = parseInt(process.env.MAX_WS_PER_IP || '12', 10);
let wsTotal = 0;
const wsPerIp = new Map<string, number>();
function clientIp(req: http.IncomingMessage): string {
  const cf = req.headers['cf-connecting-ip'];
  const cfIp = Array.isArray(cf) ? cf[0] : cf;
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const xff = req.headers['x-forwarded-for'];
  const fwd = Array.isArray(xff) ? xff[0] : xff;
  return (fwd ? fwd.split(',')[0] : req.socket.remoteAddress || '').trim() || 'unknown';
}

server.on('upgrade', (req, socket, head) => {
  const { url } = req;
  const pathname = url ? url.split('?')[0] : '';
  if (pathname !== INSTAGIB_WS_PATH) {
    socket.destroy();
    return;
  }
  if (!isAllowedWsOrigin(req.headers.origin, req.headers.host || '')) {
    socket.destroy();
    return;
  }
  const ip = clientIp(req);
  if (wsTotal >= MAX_WS_TOTAL || (wsPerIp.get(ip) ?? 0) >= MAX_WS_PER_IP) {
    socket.destroy();
    return;
  }
  (socket as { setNoDelay?: (on: boolean) => void }).setNoDelay?.(true);
  instagibWss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
    wsTotal++;
    wsPerIp.set(ip, (wsPerIp.get(ip) ?? 0) + 1);
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on('pong', () => {
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    });
    ws.on('error', (err) => console.error('[ws] socket error', err));
    ws.on('close', () => {
      wsTotal = Math.max(0, wsTotal - 1);
      const n = (wsPerIp.get(ip) ?? 1) - 1;
      if (n <= 0) wsPerIp.delete(ip);
      else wsPerIp.set(ip, n);
    });
    instagibWss.emit('connection', ws, req);
  });
});

const wsHeartbeat = setInterval(() => {
  for (const ws of instagibWss.clients) {
    const w = ws as WebSocket & { isAlive?: boolean };
    if (w.isAlive === false) {
      ws.terminate();
      continue;
    }
    w.isAlive = false;
    try { ws.ping(); } catch { /* socket already closing */ }
  }
}, 15_000);
wsHeartbeat.unref();

server.listen(port, host, () => {
  console.log(`> Instagib Arena server ready on http://${host}:${port}`);
  console.log(`>   game socket:  ws://${host}:${port}${INSTAGIB_WS_PATH}`);
  console.log(`>   stats api:    http://${host}:${port}/api/stats`);
  console.log(
    `>   metrics api:  http://${host}:${port}/api/admin/metrics/report ` +
      `(token auth ${adminApiTokenEnabled ? 'ENABLED' : 'disabled — set ADMIN_API_TOKEN'})`,
  );
  if (!hasBuild && dev) console.log('>   dev mode: run `npm run dev:web` (Vite) for the client.');
});
