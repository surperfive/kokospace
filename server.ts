import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ServerAvatar {
  skinColor: string;
  hairStyle: string;
  hairColor: string;
  eyeStyle: string;
  outfitStyle: string;
  outfitColor: string;
  accessory: string;
}

interface ServerPlayer {
  id: string;
  uid: string | null;
  name: string;
  avatar: ServerAvatar;
  x: number;
  y: number;
  dir: 'down' | 'up' | 'left' | 'right';
  isMoving: boolean;
  isSitting: boolean;
  seatId: string | null;
  isMicOn: boolean;
  isBroadcasting: boolean;
  isHost: boolean;
}

interface ServerFurnitureItem {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation?: number;
  sittable?: boolean;
  label?: string;
}

interface ServerVideoItem {
  id: string;
  title: string;
  url: string;
  sourceType: 'builtin' | 'mp4' | 'youtube' | 'bilibili';
  addedBy: string;
  thumbnail?: string;
  durationSec?: number;
  builtinMode?: 'cosmos' | 'lofi' | 'mp4';
}

interface ServerVideoState {
  currentItem: ServerVideoItem;
  isPlaying: boolean;
  currentTime: number;
  updatedAtMs: number;
  queue: ServerVideoItem[];
}

interface ServerChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  isSystem?: boolean;
  createdAt: number;
}

interface RoomState {
  roomId: string;
  mapId: string;
  hostId: string | null;
  players: Map<string, ServerPlayer>;
  sockets: Map<string, WebSocket>;
  furniture: ServerFurnitureItem[];
  videoState: ServerVideoState;
  chatHistory: ServerChatMessage[];
}

const DEFAULT_PLAYLIST: ServerVideoItem[] = [
  {
    id: 'builtin-cosmos',
    title: '星际漫游 · 矢量视觉短片',
    url: 'builtin://cosmos',
    sourceType: 'builtin',
    builtinMode: 'cosmos',
    addedBy: 'KokoSpace 精选',
    durationSec: 180,
  },
  {
    id: 'builtin-lofi',
    title: '暮色阳台 · Lo-Fi 城市漫步',
    url: 'builtin://lofi',
    sourceType: 'builtin',
    builtinMode: 'lofi',
    addedBy: 'KokoSpace 精选',
    durationSec: 240,
  },
  {
    id: 'builtin-bunny',
    title: 'Big Buck Bunny (开源 3D 动画短片)',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    sourceType: 'mp4',
    addedBy: 'Blender Foundation',
    durationSec: 596,
  },
];

const DEFAULT_MAP_FURNITURE: Record<string, ServerFurnitureItem[]> = {
  'sunset-rooftop': [
    { id: 'f1', type: 'rug_geo', x: 800, y: 630 },
    { id: 'f2', type: 'beanbag_coral', x: 640, y: 580, sittable: true, label: '前排懒人沙发' },
    { id: 'f3', type: 'beanbag_cream', x: 740, y: 580, sittable: true, label: '观影抱枕座' },
    { id: 'f4', type: 'beanbag_coral', x: 860, y: 580, sittable: true, label: '观影抱枕座' },
    { id: 'f5', type: 'beanbag_cream', x: 960, y: 580, sittable: true, label: '前排懒人沙发' },
    { id: 'f6', type: 'sofa_coral', x: 690, y: 695, sittable: true, label: '双人观影沙发' },
    { id: 'f7', type: 'sofa_slate', x: 910, y: 695, sittable: true, label: '双人观影沙发' },
    { id: 'f8', type: 'plant_olive', x: 410, y: 310 },
    { id: 'f9', type: 'plant_olive', x: 1190, y: 310 },
    { id: 'f10', type: 'lamp_warm', x: 470, y: 670 },
    { id: 'f11', type: 'lamp_warm', x: 1130, y: 670 },
    { id: 'f12', type: 'table_round', x: 350, y: 760 },
    { id: 'f13', type: 'beanbag_cream', x: 280, y: 760, sittable: true, label: '茶歇角' },
    { id: 'f14', type: 'beanbag_coral', x: 420, y: 760, sittable: true, label: '茶歇角' },
  ],
  'gallery-theater': [
    { id: 'g1', type: 'rug_geo', x: 800, y: 630 },
    { id: 'g2', type: 'sofa_slate', x: 660, y: 590, sittable: true, label: '画廊长凳 A' },
    { id: 'g3', type: 'sofa_slate', x: 800, y: 590, sittable: true, label: '画廊长凳 B' },
    { id: 'g4', type: 'sofa_slate', x: 940, y: 590, sittable: true, label: '画廊长凳 C' },
    { id: 'g5', type: 'sofa_coral', x: 720, y: 700, sittable: true, label: '贵宾软椅' },
    { id: 'g6', type: 'sofa_coral', x: 880, y: 700, sittable: true, label: '贵宾软椅' },
    { id: 'g7', type: 'plant_fern', x: 420, y: 320 },
    { id: 'g8', type: 'plant_fern', x: 1180, y: 320 },
    { id: 'g9', type: 'table_round', x: 1240, y: 740 },
    { id: 'g10', type: 'beanbag_cream', x: 1170, y: 740, sittable: true, label: '艺术交流角' },
    { id: 'g11', type: 'beanbag_cream', x: 1310, y: 740, sittable: true, label: '艺术交流角' },
  ],
  'forest-cabin': [
    { id: 'c1', type: 'rug_geo', x: 800, y: 640 },
    { id: 'c2', type: 'beanbag_cream', x: 640, y: 600, sittable: true, label: '野餐坐垫' },
    { id: 'c3', type: 'beanbag_coral', x: 740, y: 600, sittable: true, label: '野餐坐垫' },
    { id: 'c4', type: 'beanbag_cream', x: 860, y: 600, sittable: true, label: '野餐坐垫' },
    { id: 'c5', type: 'beanbag_coral', x: 960, y: 600, sittable: true, label: '野餐坐垫' },
    { id: 'c6', type: 'sofa_coral', x: 800, y: 710, sittable: true, label: '木屋露台沙发' },
    { id: 'c7', type: 'plant_fern', x: 380, y: 360 },
    { id: 'c8', type: 'plant_olive', x: 1220, y: 360 },
    { id: 'c9', type: 'lamp_warm', x: 520, y: 540 },
    { id: 'c10', type: 'lamp_warm', x: 1080, y: 540 },
    { id: 'c11', type: 'table_round', x: 360, y: 760 },
  ],
};

const rooms = new Map<string, RoomState>();

function createDefaultRoom(roomId: string, mapId = 'sunset-rooftop'): RoomState {
  const safeMapId = DEFAULT_MAP_FURNITURE[mapId] ? mapId : 'sunset-rooftop';
  return {
    roomId,
    mapId: safeMapId,
    hostId: null,
    players: new Map(),
    sockets: new Map(),
    furniture: DEFAULT_MAP_FURNITURE[safeMapId].map((f) => ({ ...f })),
    videoState: {
      currentItem: { ...DEFAULT_PLAYLIST[0] },
      isPlaying: true,
      currentTime: 0,
      updatedAtMs: Date.now(),
      queue: DEFAULT_PLAYLIST.map((item) => ({ ...item })),
    },
    chatHistory: [
      {
        id: `sys-${Date.now()}`,
        playerId: 'system',
        playerName: 'KokoSpace',
        text: '欢迎来到 2D 共看空间！走近中央舞台可开启全员广播，靠近同伴即可进行空间语音互动。',
        isSystem: true,
        createdAt: Date.now(),
      },
    ],
  };
}

function getOrCreateRoom(roomId: string): RoomState {
  const normalized = roomId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'lobby';
  let room = rooms.get(normalized);
  if (!room) {
    room = createDefaultRoom(normalized);
    rooms.set(normalized, room);
  }
  return room;
}

function computeAuthoritativeVideoTime(vs: ServerVideoState): number {
  if (!vs.isPlaying) return vs.currentTime;
  const elapsed = (Date.now() - vs.updatedAtMs) / 1000;
  const next = vs.currentTime + Math.max(0, elapsed);
  const dur = vs.currentItem.durationSec;
  if (dur && dur > 0 && next >= dur) {
    return next % dur;
  }
  return next;
}

function broadcastRoom(room: RoomState, payload: unknown, excludeId?: string) {
  const data = JSON.stringify(payload);
  for (const [pid, ws] of room.sockets.entries()) {
    if (excludeId && pid === excludeId) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function parseVideoUrlServer(rawUrl: string): {
  sourceType: 'builtin' | 'mp4' | 'youtube' | 'bilibili';
  embedUrl: string;
  titleHint: string;
} {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('builtin://')) {
    return { sourceType: 'builtin', embedUrl: trimmed, titleHint: '内置矢量短片' };
  }
  // YouTube parsing
  const ytMatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (ytMatch) {
    const vid = ytMatch[1];
    return {
      sourceType: 'youtube',
      embedUrl: `https://www.youtube.com/embed/${vid}?enablejsapi=1&autoplay=1&rel=0`,
      titleHint: `YouTube 视频 (${vid})`,
    };
  }
  // Bilibili parsing (BV or av)
  const bvidMatch = trimmed.match(/(BV[a-zA-Z0-9]{10})/);
  if (bvidMatch) {
    const bvid = bvidMatch[1];
    return {
      sourceType: 'bilibili',
      embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&danmaku=0&autoplay=1`,
      titleHint: `Bilibili 视频 (${bvid})`,
    };
  }
  const aidMatch = trimmed.match(/bilibili\.com\/video\/av(\d+)/i);
  if (aidMatch) {
    const aid = aidMatch[1];
    return {
      sourceType: 'bilibili',
      embedUrl: `https://player.bilibili.com/player.html?aid=${aid}&page=1&high_quality=1&danmaku=0&autoplay=1`,
      titleHint: `Bilibili 视频 (av${aid})`,
    };
  }
  // Direct MP4 / WebM / OGG
  return {
    sourceType: 'mp4',
    embedUrl: trimmed,
    titleHint: trimmed.split('/').pop()?.split('?')[0] || '外部直链视频',
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size, timestamp: Date.now() });
  });

  app.get('/api/rooms', (_req, res) => {
    const summary = Array.from(rooms.values()).map((r) => ({
      roomId: r.roomId,
      mapId: r.mapId,
      playerCount: r.players.size,
      currentVideoTitle: r.videoState.currentItem.title,
    }));
    res.json({ rooms: summary });
  });

  app.post('/api/parse-video', (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!url.trim()) {
      res.status(400).json({ error: '请输入有效的视频链接' });
      return;
    }
    const parsed = parseVideoUrlServer(url);
    res.json(parsed);
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let currentRoom: RoomState | null = null;
    let playerId: string | null = null;

    ws.on('message', (raw) => {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      const type = msg.type;

      if (type === 'room:join') {
        const roomId = typeof msg.roomId === 'string' ? msg.roomId : 'lobby';
        const room = getOrCreateRoom(roomId);
        currentRoom = room;

        const pid =
          typeof msg.playerId === 'string' && msg.playerId.length > 0
            ? msg.playerId.slice(0, 48)
            : `p_${Math.random().toString(36).slice(2, 10)}`;
        playerId = pid;

        if (!room.hostId || !room.players.has(room.hostId)) {
          room.hostId = pid;
        }

        const safeName =
          typeof msg.name === 'string' && msg.name.trim()
            ? msg.name.trim().slice(0, 24)
            : `旅人 ${pid.slice(-4)}`;

        const avatar: ServerAvatar = msg.avatar && typeof msg.avatar === 'object'
          ? {
              skinColor: String(msg.avatar.skinColor || '#FCD5B5').slice(0, 16),
              hairStyle: String(msg.avatar.hairStyle || 'short').slice(0, 32),
              hairColor: String(msg.avatar.hairColor || '#2C2623').slice(0, 16),
              eyeStyle: String(msg.avatar.eyeStyle || 'smile').slice(0, 32),
              outfitStyle: String(msg.avatar.outfitStyle || 'hoodie').slice(0, 32),
              outfitColor: String(msg.avatar.outfitColor || '#FF5A36').slice(0, 16),
              accessory: String(msg.avatar.accessory || 'none').slice(0, 32),
            }
          : {
              skinColor: '#FCD5B5',
              hairStyle: 'short',
              hairColor: '#2C2623',
              eyeStyle: 'smile',
              outfitStyle: 'hoodie',
              outfitColor: '#FF5A36',
              accessory: 'none',
            };

        const spawnOffset = (room.players.size % 6) * 44 - 110;
        const player: ServerPlayer = {
          id: pid,
          uid: typeof msg.uid === 'string' ? msg.uid.slice(0, 128) : null,
          name: safeName,
          avatar,
          x: 800 + spawnOffset,
          y: 790,
          dir: 'up',
          isMoving: false,
          isSitting: false,
          seatId: null,
          isMicOn: false,
          isBroadcasting: false,
          isHost: room.hostId === pid,
        };

        room.players.set(pid, player);
        room.sockets.set(pid, ws);

        const syncedTime = computeAuthoritativeVideoTime(room.videoState);
        room.videoState.currentTime = syncedTime;
        room.videoState.updatedAtMs = Date.now();

        ws.send(
          JSON.stringify({
            type: 'room:init',
            playerId: pid,
            roomId: room.roomId,
            mapId: room.mapId,
            hostId: room.hostId,
            players: Array.from(room.players.values()),
            furniture: room.furniture,
            videoState: room.videoState,
            chatHistory: room.chatHistory,
            serverTimeMs: Date.now(),
          })
        );

        broadcastRoom(
          room,
          {
            type: 'player:joined',
            player,
          },
          pid
        );
        return;
      }

      if (!currentRoom || !playerId) return;
      const me = currentRoom.players.get(playerId);
      if (!me) return;

      if (type === 'player:move') {
        const x = Number(msg.x);
        const y = Number(msg.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          me.x = Math.max(80, Math.min(1520, x));
          me.y = Math.max(120, Math.min(980, y));
        }
        if (['up', 'down', 'left', 'right'].includes(msg.dir)) {
          me.dir = msg.dir;
        }
        me.isMoving = Boolean(msg.isMoving);
        me.isSitting = Boolean(msg.isSitting);
        me.seatId = typeof msg.seatId === 'string' ? msg.seatId : null;

        broadcastRoom(
          currentRoom,
          {
            type: 'player:moved',
            playerId,
            x: me.x,
            y: me.y,
            dir: me.dir,
            isMoving: me.isMoving,
            isSitting: me.isSitting,
            seatId: me.seatId,
          },
          playerId
        );
      } else if (type === 'player:update_avatar') {
        if (typeof msg.name === 'string' && msg.name.trim()) {
          me.name = msg.name.trim().slice(0, 24);
        }
        if (msg.avatar && typeof msg.avatar === 'object') {
          me.avatar = {
            skinColor: String(msg.avatar.skinColor || me.avatar.skinColor).slice(0, 16),
            hairStyle: String(msg.avatar.hairStyle || me.avatar.hairStyle).slice(0, 32),
            hairColor: String(msg.avatar.hairColor || me.avatar.hairColor).slice(0, 16),
            eyeStyle: String(msg.avatar.eyeStyle || me.avatar.eyeStyle).slice(0, 32),
            outfitStyle: String(msg.avatar.outfitStyle || me.avatar.outfitStyle).slice(0, 32),
            outfitColor: String(msg.avatar.outfitColor || me.avatar.outfitColor).slice(0, 16),
            accessory: String(msg.avatar.accessory || me.avatar.accessory).slice(0, 32),
          };
        }
        broadcastRoom(currentRoom, {
          type: 'player:avatar_updated',
          playerId,
          name: me.name,
          avatar: me.avatar,
        });
      } else if (type === 'player:audio_state') {
        if (typeof msg.isMicOn === 'boolean') me.isMicOn = msg.isMicOn;
        if (typeof msg.isBroadcasting === 'boolean') me.isBroadcasting = msg.isBroadcasting;
        broadcastRoom(currentRoom, {
          type: 'player:audio_updated',
          playerId,
          isMicOn: me.isMicOn,
          isBroadcasting: me.isBroadcasting,
        });
      } else if (type === 'player:reaction') {
        const emoji = String(msg.emoji || '❤️').slice(0, 8);
        const label = typeof msg.label === 'string' ? msg.label.slice(0, 24) : undefined;
        broadcastRoom(currentRoom, {
          type: 'player:reaction',
          id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          playerId,
          playerName: me.name,
          emoji,
          label,
          x: me.x,
          y: me.y,
          createdAt: Date.now(),
        });
      } else if (type === 'player:chat') {
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 160) : '';
        if (!text) return;
        const chatMsg: ServerChatMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          playerId,
          playerName: me.name,
          text,
          createdAt: Date.now(),
        };
        currentRoom.chatHistory.push(chatMsg);
        if (currentRoom.chatHistory.length > 40) {
          currentRoom.chatHistory.shift();
        }
        broadcastRoom(currentRoom, {
          type: 'player:chat',
          message: chatMsg,
        });
      } else if (type === 'video:control') {
        const action = msg.action;
        const vs = currentRoom.videoState;
        const now = Date.now();
        const currentElapsed = computeAuthoritativeVideoTime(vs);

        if (action === 'play') {
          vs.currentTime = Number.isFinite(Number(msg.currentTime)) ? Number(msg.currentTime) : currentElapsed;
          vs.isPlaying = true;
          vs.updatedAtMs = now;
        } else if (action === 'pause') {
          vs.currentTime = Number.isFinite(Number(msg.currentTime)) ? Number(msg.currentTime) : currentElapsed;
          vs.isPlaying = false;
          vs.updatedAtMs = now;
        } else if (action === 'seek') {
          vs.currentTime = Math.max(0, Number(msg.currentTime) || 0);
          vs.updatedAtMs = now;
        } else if (action === 'select_item' && msg.item) {
          const item: ServerVideoItem = {
            id: String(msg.item.id || `vid_${now}`).slice(0, 64),
            title: String(msg.item.title || '点播视频').slice(0, 80),
            url: String(msg.item.url || '').slice(0, 512),
            sourceType: ['builtin', 'mp4', 'youtube', 'bilibili'].includes(msg.item.sourceType)
              ? msg.item.sourceType
              : 'mp4',
            addedBy: me.name,
            durationSec: Number(msg.item.durationSec) || undefined,
            builtinMode: msg.item.builtinMode,
          };
          vs.currentItem = item;
          vs.currentTime = 0;
          vs.isPlaying = true;
          vs.updatedAtMs = now;
          if (!vs.queue.some((q) => q.id === item.id)) {
            vs.queue.push(item);
          }
        } else if (action === 'enqueue' && msg.item) {
          const parsed = parseVideoUrlServer(String(msg.item.url || ''));
          const item: ServerVideoItem = {
            id: `vid_${now}_${Math.random().toString(36).slice(2, 6)}`,
            title: String(msg.item.title || parsed.titleHint).slice(0, 80),
            url: parsed.embedUrl,
            sourceType: parsed.sourceType,
            addedBy: me.name,
          };
          vs.queue.push(item);
          if (msg.playNow) {
            vs.currentItem = item;
            vs.currentTime = 0;
            vs.isPlaying = true;
            vs.updatedAtMs = now;
          }
        } else if (action === 'remove_queue' && typeof msg.itemId === 'string') {
          vs.queue = vs.queue.filter((q) => q.id !== msg.itemId);
        }

        broadcastRoom(currentRoom, {
          type: 'video:synced',
          videoState: vs,
          serverTimeMs: now,
          triggeredBy: me.name,
        });
      } else if (type === 'scene:update') {
        if (typeof msg.mapId === 'string' && msg.mapId.trim()) {
          const nextMapId = msg.mapId.trim().slice(0, 48);
          currentRoom.mapId = nextMapId;
          if (Array.isArray(msg.furniture)) {
            currentRoom.furniture = msg.furniture.slice(0, 40);
          } else if (DEFAULT_MAP_FURNITURE[nextMapId]) {
            currentRoom.furniture = DEFAULT_MAP_FURNITURE[nextMapId].map((f) => ({ ...f }));
          }
        } else if (Array.isArray(msg.furniture)) {
          currentRoom.furniture = msg.furniture.slice(0, 40);
        }

        broadcastRoom(currentRoom, {
          type: 'scene:updated',
          mapId: currentRoom.mapId,
          furniture: currentRoom.furniture,
          updatedBy: me.name,
        });
      } else if (type === 'webrtc:signal' && typeof msg.targetId === 'string') {
        const targetWs = currentRoom.sockets.get(msg.targetId);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
          targetWs.send(
            JSON.stringify({
              type: 'webrtc:signal',
              fromId: playerId,
              signal: msg.signal,
            })
          );
        }
      }
    });

    ws.on('close', () => {
      if (!currentRoom || !playerId) return;
      currentRoom.players.delete(playerId);
      currentRoom.sockets.delete(playerId);

      if (currentRoom.hostId === playerId) {
        const nextHost = currentRoom.players.keys().next().value || null;
        currentRoom.hostId = nextHost;
        if (nextHost) {
          const nextPlayer = currentRoom.players.get(nextHost);
          if (nextPlayer) nextPlayer.isHost = true;
        }
      }

      broadcastRoom(currentRoom, {
        type: 'player:left',
        playerId,
        newHostId: currentRoom.hostId,
      });

      if (currentRoom.players.size === 0 && currentRoom.roomId !== 'lobby') {
        rooms.delete(currentRoom.roomId);
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
