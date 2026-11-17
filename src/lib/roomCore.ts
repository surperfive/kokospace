/**
 * RoomCore —— 房间的唯一权威实现（纯 TS，无 Node / 无 DOM 依赖）
 *
 * 三处共用：
 *   - server.ts        （本地 Express + ws，单进程多房间）
 *   - worker/index.ts  （Cloudflare Durable Object，一房间一实例）
 *   - 浏览器房主模式    （P2P 直连，房主页面里跑这个核心）
 *
 * 设计要点：核心不碰网络，只产出「要发给谁」的事件（Outbound），
 * 由各传输层自己决定怎么发（ws.send / DataChannel.send / setState）。
 */

export interface RoomAvatar {
  skinColor: string;
  hairStyle: string;
  hairColor: string;
  eyeStyle: string;
  outfitStyle: string;
  outfitColor: string;
  accessory: string;
}

export interface RoomPlayer {
  id: string;
  uid: string | null;
  name: string;
  avatar: RoomAvatar;
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

export interface RoomFurnitureItem {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation?: number;
  sittable?: boolean;
  label?: string;
}

export interface RoomVideoItem {
  id: string;
  title: string;
  url: string;
  sourceType: 'builtin' | 'mp4' | 'youtube' | 'bilibili';
  addedBy: string;
  thumbnail?: string;
  durationSec?: number;
  builtinMode?: 'cosmos' | 'lofi' | 'mp4';
}

export interface RoomVideoState {
  currentItem: RoomVideoItem;
  isPlaying: boolean;
  currentTime: number;
  updatedAtMs: number;
  queue: RoomVideoItem[];
}

export interface RoomChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  isSystem?: boolean;
  createdAt: number;
}

/** 核心产出的待发送事件 */
export type Outbound =
  | { kind: 'to'; targetId: string; payload: unknown }
  | { kind: 'all'; payload: unknown; excludeId?: string };

export const DEFAULT_AVATAR: RoomAvatar = {
  skinColor: '#FCD5B5',
  hairStyle: 'short',
  hairColor: '#2C2623',
  eyeStyle: 'smile',
  outfitStyle: 'hoodie',
  outfitColor: '#FF5A36',
  accessory: 'none',
};

export const DEFAULT_PLAYLIST: RoomVideoItem[] = [
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

export const DEFAULT_MAP_FURNITURE: Record<string, RoomFurnitureItem[]> = {
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

export function sanitizeRoomId(raw: string | null | undefined): string {
  return (raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'lobby';
}

export function computeAuthoritativeVideoTime(vs: RoomVideoState): number {
  if (!vs.isPlaying) return vs.currentTime;
  const elapsed = (Date.now() - vs.updatedAtMs) / 1000;
  const next = vs.currentTime + Math.max(0, elapsed);
  const dur = vs.currentItem.durationSec;
  if (dur && dur > 0 && next >= dur) return next % dur;
  return next;
}

export function parseVideoUrlServer(rawUrl: string): {
  sourceType: 'builtin' | 'mp4' | 'youtube' | 'bilibili';
  embedUrl: string;
  titleHint: string;
} {
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith('builtin://')) {
    return { sourceType: 'builtin', embedUrl: trimmed, titleHint: '内置矢量短片' };
  }
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
  return {
    sourceType: 'mp4',
    embedUrl: trimmed,
    titleHint: trimmed.split('/').pop()?.split('?')[0] || '外部直链视频',
  };
}

function clampText(v: unknown, fallback: string, max: number): string {
  const s = typeof v === 'string' ? v : '';
  return (s.trim() || fallback).slice(0, max);
}

export class RoomCore {
  readonly roomId: string;
  mapId: string;
  hostId: string | null = null;
  players = new Map<string, RoomPlayer>();
  furniture: RoomFurnitureItem[];
  videoState: RoomVideoState;
  chatHistory: RoomChatMessage[] = [];

  constructor(roomId: string, opts: { mapId?: string } = {}) {
    const mapId = opts.mapId && DEFAULT_MAP_FURNITURE[opts.mapId] ? opts.mapId : 'sunset-rooftop';
    this.roomId = roomId;
    this.mapId = mapId;
    this.furniture = DEFAULT_MAP_FURNITURE[mapId].map((f) => ({ ...f }));
    this.videoState = {
      currentItem: { ...DEFAULT_PLAYLIST[0] },
      isPlaying: true,
      currentTime: 0,
      updatedAtMs: Date.now(),
      queue: DEFAULT_PLAYLIST.map((item) => ({ ...item })),
    };
    this.chatHistory = [
      {
        id: `sys-${Date.now()}`,
        playerId: 'system',
        playerName: 'KokoSpace',
        text: '欢迎来到 2D 共看空间！走近中央舞台可开启全员广播，靠近同伴即可进行空间语音互动。',
        isSystem: true,
        createdAt: Date.now(),
      },
    ];
  }

  /** 玩家加入：注册状态、下发 init、广播给其他人 */
  join(playerId: string, msg: Record<string, any>): Outbound[] {
    if (!this.hostId || !this.players.has(this.hostId)) this.hostId = playerId;

    const avatar: RoomAvatar =
      msg.avatar && typeof msg.avatar === 'object'
        ? {
            skinColor: String(msg.avatar.skinColor || DEFAULT_AVATAR.skinColor).slice(0, 16),
            hairStyle: String(msg.avatar.hairStyle || DEFAULT_AVATAR.hairStyle).slice(0, 32),
            hairColor: String(msg.avatar.hairColor || DEFAULT_AVATAR.hairColor).slice(0, 16),
            eyeStyle: String(msg.avatar.eyeStyle || DEFAULT_AVATAR.eyeStyle).slice(0, 32),
            outfitStyle: String(msg.avatar.outfitStyle || DEFAULT_AVATAR.outfitStyle).slice(0, 32),
            outfitColor: String(msg.avatar.outfitColor || DEFAULT_AVATAR.outfitColor).slice(0, 16),
            accessory: String(msg.avatar.accessory || DEFAULT_AVATAR.accessory).slice(0, 32),
          }
        : { ...DEFAULT_AVATAR };

    const spawnOffset = (this.players.size % 6) * 44 - 110;
    const player: RoomPlayer = {
      id: playerId,
      uid: typeof msg.uid === 'string' ? msg.uid.slice(0, 128) : null,
      name: clampText(msg.name, `旅人 ${playerId.slice(-4)}`, 24),
      avatar,
      x: 800 + spawnOffset,
      y: 790,
      dir: 'up',
      isMoving: false,
      isSitting: false,
      seatId: null,
      isMicOn: false,
      isBroadcasting: false,
      isHost: this.hostId === playerId,
    };

    this.players.set(playerId, player);

    // 新连接拿到权威播放时间，避免各自从 0 开始
    const syncedTime = computeAuthoritativeVideoTime(this.videoState);
    this.videoState.currentTime = syncedTime;
    this.videoState.updatedAtMs = Date.now();

    return [
      {
        kind: 'to',
        targetId: playerId,
        payload: {
          type: 'room:init',
          playerId,
          roomId: this.roomId,
          mapId: this.mapId,
          hostId: this.hostId,
          players: Array.from(this.players.values()),
          furniture: this.furniture,
          videoState: this.videoState,
          chatHistory: this.chatHistory,
          serverTimeMs: Date.now(),
        },
      },
      { kind: 'all', excludeId: playerId, payload: { type: 'player:joined', player } },
    ];
  }

  /** 处理一条业务消息（不含 webrtc:signal，那个是纯转发，由传输层自己做） */
  handle(playerId: string, msg: Record<string, any>): Outbound[] {
    const me = this.players.get(playerId);
    if (!me) return [];
    const type = msg.type;
    const now = Date.now();

    if (type === 'player:move') {
      const x = Number(msg.x);
      const y = Number(msg.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        me.x = Math.max(80, Math.min(1520, x));
        me.y = Math.max(120, Math.min(980, y));
      }
      if (['up', 'down', 'left', 'right'].includes(msg.dir)) me.dir = msg.dir;
      me.isMoving = Boolean(msg.isMoving);
      me.isSitting = Boolean(msg.isSitting);
      me.seatId = typeof msg.seatId === 'string' ? msg.seatId : null;

      return [
        {
          kind: 'all',
          excludeId: playerId,
          payload: {
            type: 'player:moved',
            playerId,
            x: me.x,
            y: me.y,
            dir: me.dir,
            isMoving: me.isMoving,
            isSitting: me.isSitting,
            seatId: me.seatId,
          },
        },
      ];
    }

    if (type === 'player:update_avatar') {
      if (typeof msg.name === 'string' && msg.name.trim()) me.name = msg.name.trim().slice(0, 24);
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
      return [
        {
          kind: 'all',
          payload: { type: 'player:avatar_updated', playerId, name: me.name, avatar: me.avatar },
        },
      ];
    }

    if (type === 'player:audio_state') {
      if (typeof msg.isMicOn === 'boolean') me.isMicOn = msg.isMicOn;
      if (typeof msg.isBroadcasting === 'boolean') me.isBroadcasting = msg.isBroadcasting;
      return [
        {
          kind: 'all',
          payload: {
            type: 'player:audio_updated',
            playerId,
            isMicOn: me.isMicOn,
            isBroadcasting: me.isBroadcasting,
          },
        },
      ];
    }

    if (type === 'player:reaction') {
      return [
        {
          kind: 'all',
          payload: {
            type: 'player:reaction',
            id: `rx_${now}_${Math.random().toString(36).slice(2, 6)}`,
            playerId,
            playerName: me.name,
            emoji: String(msg.emoji || '❤️').slice(0, 8),
            label: typeof msg.label === 'string' ? msg.label.slice(0, 24) : undefined,
            x: me.x,
            y: me.y,
            createdAt: now,
          },
        },
      ];
    }

    if (type === 'player:chat') {
      const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 160) : '';
      if (!text) return [];
      const chatMsg: RoomChatMessage = {
        id: `msg_${now}_${Math.random().toString(36).slice(2, 6)}`,
        playerId,
        playerName: me.name,
        text,
        createdAt: now,
      };
      this.chatHistory.push(chatMsg);
      if (this.chatHistory.length > 40) this.chatHistory.shift();
      return [{ kind: 'all', payload: { type: 'player:chat', message: chatMsg } }];
    }

    if (type === 'video:control') {
      const action = msg.action;
      const vs = this.videoState;
      const currentElapsed = computeAuthoritativeVideoTime(vs);

      if (action === 'play') {
        vs.currentTime = Number.isFinite(Number(msg.currentTime))
          ? Number(msg.currentTime)
          : currentElapsed;
        vs.isPlaying = true;
        vs.updatedAtMs = now;
      } else if (action === 'pause') {
        vs.currentTime = Number.isFinite(Number(msg.currentTime))
          ? Number(msg.currentTime)
          : currentElapsed;
        vs.isPlaying = false;
        vs.updatedAtMs = now;
      } else if (action === 'seek') {
        vs.currentTime = Math.max(0, Number(msg.currentTime) || 0);
        vs.updatedAtMs = now;
      } else if (action === 'select_item' && msg.item) {
        const item: RoomVideoItem = {
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
        if (!vs.queue.some((q) => q.id === item.id)) vs.queue.push(item);
      } else if (action === 'enqueue' && msg.item) {
        const parsed = parseVideoUrlServer(String(msg.item.url || ''));
        const item: RoomVideoItem = {
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
      } else {
        return [];
      }

      return [
        {
          kind: 'all',
          payload: {
            type: 'video:synced',
            videoState: vs,
            serverTimeMs: now,
            triggeredBy: me.name,
          },
        },
      ];
    }

    if (type === 'scene:update') {
      if (typeof msg.mapId === 'string' && msg.mapId.trim()) {
        const nextMapId = msg.mapId.trim().slice(0, 48);
        this.mapId = nextMapId;
        if (Array.isArray(msg.furniture)) {
          this.furniture = msg.furniture.slice(0, 40);
        } else if (DEFAULT_MAP_FURNITURE[nextMapId]) {
          this.furniture = DEFAULT_MAP_FURNITURE[nextMapId].map((f) => ({ ...f }));
        }
      } else if (Array.isArray(msg.furniture)) {
        this.furniture = msg.furniture.slice(0, 40);
      } else {
        return [];
      }

      return [
        {
          kind: 'all',
          payload: {
            type: 'scene:updated',
            mapId: this.mapId,
            furniture: this.furniture,
            updatedBy: me.name,
          },
        },
      ];
    }

    return [];
  }

  /** 玩家离开：清理 + 房主移交 + 广播 */
  leave(playerId: string): Outbound[] {
    if (!this.players.has(playerId)) return [];
    this.players.delete(playerId);

    if (this.hostId === playerId) {
      const nextHost = this.players.keys().next().value || null;
      this.hostId = nextHost;
      if (nextHost) {
        const nextPlayer = this.players.get(nextHost);
        if (nextPlayer) nextPlayer.isHost = true;
      }
    }

    return [
      { kind: 'all', payload: { type: 'player:left', playerId, newHostId: this.hostId } },
    ];
  }

  get isEmpty(): boolean {
    return this.players.size === 0;
  }

  /** HTTP 探测 / 调试用的房间快照 */
  snapshot() {
    return {
      roomId: this.roomId,
      mapId: this.mapId,
      playerCount: this.players.size,
      currentVideoTitle: this.videoState.currentItem.title,
      players: Array.from(this.players.values()).map((p) => ({ id: p.id, name: p.name })),
    };
  }
}
