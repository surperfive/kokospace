import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { RoomCore, sanitizeRoomId, type Outbound } from './src/lib/roomCore';
import { fetchVideoMeta } from './src/lib/videoMeta';
import { proxyAiChat } from './src/lib/aiProxy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomEntry {
  core: RoomCore;
  sockets: Map<string, WebSocket>;
}

const rooms = new Map<string, RoomEntry>();

const send = (target: WebSocket, payload: unknown) => {
  if (target.readyState === WebSocket.OPEN) {
    target.send(JSON.stringify(payload));
  }
};

/** 把 RoomCore 产出的事件派发到房间里的连接上 */
const apply = (room: RoomEntry, out: Outbound[]) => {
  for (const item of out) {
    if (item.kind === 'to') {
      const target = room.sockets.get(item.targetId);
      if (target) send(target, item.payload);
    } else {
      const data = JSON.stringify(item.payload);
      for (const [pid, target] of room.sockets.entries()) {
        if (item.excludeId && pid === item.excludeId) continue;
        if (target.readyState === WebSocket.OPEN) target.send(data);
      }
    }
  }
};

function getOrCreateRoom(roomId: string): RoomEntry {
  const normalized = sanitizeRoomId(roomId);
  let entry = rooms.get(normalized);
  if (!entry) {
    entry = { core: new RoomCore(normalized), sockets: new Map() };
    rooms.set(normalized, entry);
  }
  return entry;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, timestamp: Date.now() });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: Array.from(rooms.values()).map((r) => r.core.snapshot()) });
  });

  app.post('/api/parse-video', async (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url) {
      res.status(400).json({ error: '请输入有效的视频链接' });
      return;
    }
    res.json(await fetchVideoMeta(url));
  });

  // 外部大模型转发（与 Worker 同一份实现）：浏览器直连会被 CORS 拦
  app.post('/api/ai', async (req, res) => {
    const result = await proxyAiChat(req.body);
    if (result.ok) res.json({ ok: true, data: result.data });
    else res.status(result.status || 400).json({ ok: false, error: result.error });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let entry: RoomEntry | null = null;
    let playerId: string | null = null;

    ws.on('message', (raw) => {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.type === 'room:join') {
        const room = getOrCreateRoom(typeof msg.roomId === 'string' ? msg.roomId : 'lobby');
        entry = room;
        const pid =
          typeof msg.playerId === 'string' && msg.playerId.length > 0
            ? msg.playerId.slice(0, 48)
            : `p_${Math.random().toString(36).slice(2, 10)}`;
        playerId = pid;
        room.sockets.set(pid, ws);
        apply(room, room.core.join(pid, msg));
        return;
      }

      if (!entry || !playerId) return;

      // 语音信令与 P2P 状态通道信令都是纯转发，不进入房间状态
      if ((msg.type === 'webrtc:signal' || msg.type === 'p2p:signal') && typeof msg.targetId === 'string') {
        const target = entry.sockets.get(msg.targetId);
        if (target) send(target, { type: msg.type, fromId: playerId, signal: msg.signal });
        return;
      }

      // P2P 房主把权威状态镜像过来：房主关机后，云端房间不是空的，接管的人能接着播
      if (msg.type === 'room:snapshot') {
        if (entry.core.hostId === playerId && msg.state) entry.core.restoreState(msg.state);
        return;
      }

      apply(entry, entry.core.handle(playerId, msg));
    });

    ws.on('close', () => {
      if (!entry || !playerId) return;
      const room = entry;
      const pid = playerId;
      room.sockets.delete(pid);
      apply(room, room.core.leave(pid));
      entry = null;
      playerId = null;

      if (room.core.isEmpty && room.core.roomId !== 'lobby') {
        rooms.delete(room.core.roomId);
      }
    });
  });

  // 看门狗：客户端靠 rAF 判断播完，切后台就停摆，这里每秒用权威时钟兜底推进
  const watchdog = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      const out = room.core.tick(now);
      if (out.length) apply(room, out);
    }
  }, 1000);
  watchdog.unref?.();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`KokoSpace server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
