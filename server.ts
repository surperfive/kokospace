import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { RoomCore, parseVideoUrlServer, sanitizeRoomId, type Outbound } from './src/lib/roomCore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomEntry {
  core: RoomCore;
  sockets: Map<string, WebSocket>;
}

const rooms = new Map<string, RoomEntry>();

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

  app.post('/api/parse-video', (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!url.trim()) {
      res.status(400).json({ error: '请输入有效的视频链接' });
      return;
    }
    res.json(parseVideoUrlServer(url));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let entry: RoomEntry | null = null;
    let playerId: string | null = null;

    const send = (target: WebSocket, payload: unknown) => {
      if (target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify(payload));
      }
    };

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
