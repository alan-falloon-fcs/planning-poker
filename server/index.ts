import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import { cleanName, isCard, ROOM_CODE_PATTERN, type ClientMessage, type ServerMessage } from '../shared/protocol.ts';
import { Lobby, type Connection, type Player, type Room } from './rooms.ts';

const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT ?? 3000);
const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist');

const lobby = new Lobby();
setInterval(() => lobby.sweep(Date.now()), 5_000).unref();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function redirect(res: ServerResponse, to: string) {
  res.writeHead(302, { Location: to, 'Cache-Control': 'no-store' });
  res.end();
}

async function sendIndex(req: IncomingMessage, res: ServerResponse) {
  let html: string;
  if (vite) {
    html = await readFile(join(ROOT, 'client', 'index.html'), 'utf8');
    html = await vite.transformIndexHtml(req.url ?? '/', html);
  } else {
    html = await readFile(join(DIST, 'index.html'), 'utf8');
  }
  res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
  res.end(html);
}

async function sendStatic(path: string, res: ServerResponse): Promise<boolean> {
  const file = normalize(join(DIST, path));
  if (!file.startsWith(DIST)) return false;
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x');
  const room = /^\/room\/([^/]+)\/?$/.exec(url.pathname);

  if (url.pathname === '/') return redirect(res, `/room/${lobby.newCode()}`);
  if (room) {
    const code = decodeURIComponent(room[1]).toUpperCase();
    if (!ROOM_CODE_PATTERN.test(code)) return redirect(res, `/room/${lobby.newCode()}`);
    if (code !== room[1]) return redirect(res, `/room/${code}`);
    return sendIndex(req, res);
  }
  if (vite) {
    vite.middlewares(req, res, () => {
      res.writeHead(404);
      res.end();
    });
    return;
  }
  if (await sendStatic(url.pathname, res)) return;
  res.writeHead(404);
  res.end();
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

const vite = DEV
  ? await (await import('vite')).createServer({
      root: join(ROOT, 'client'),
      server: { middlewareMode: true, hmr: { server } },
      appType: 'custom',
    })
  : null;

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws') return;
  const code = (url.searchParams.get('room') ?? '').toUpperCase();
  if (!ROOM_CODE_PATTERN.test(code)) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => attach(ws, code));
});

function attach(ws: WebSocket & { alive?: boolean }, code: string) {
  const conn: Connection = {
    send: (msg: ServerMessage) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg)),
    close: (c, reason) => ws.close(c, reason),
  };
  let room: Room | null = null;
  let player: Player | null = null;

  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));

  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg.t === 'join') {
      const name = cleanName(msg.name);
      if (typeof msg.secret !== 'string' || msg.secret.length < 16 || msg.secret.length > 64 || !name) {
        return conn.send({ t: 'error', reason: 'bad-join' });
      }
      room = lobby.get(code, Date.now());
      player = room.join(msg.secret, name, conn);
      return;
    }
    if (!room || !player) return;
    switch (msg.t) {
      case 'rename': {
        const name = cleanName(msg.name);
        if (name) room.rename(player, name);
        break;
      }
      case 'play':
        if (isCard(msg.card)) room.play(player, msg.card);
        break;
      case 'unplay':
        room.unplay(player);
        break;
      case 'flip':
        room.flip();
        break;
      case 'clear':
        room.clear();
        break;
    }
  });

  ws.on('close', () => {
    if (room && player) room.disconnect(player, conn, Date.now());
  });
}

setInterval(() => {
  for (const ws of wss.clients as Set<WebSocket & { alive?: boolean }>) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    ws.ping();
  }
}, 15_000).unref();

server.listen(PORT, () => {
  console.log(`Planning poker on http://localhost:${PORT}${DEV ? ' (dev)' : ''}`);
});
