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
  /** 手上扛着谁：`@screen`（巨幕）、`@npc`（见习修女）或另一个玩家的 id；空手为 null */
  carryTarget?: string | null;
  /** 被谁扛着（只由服务端写，客户端只读） */
  carriedBy?: string | null;
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
  sourceType: 'builtin' | 'mp4' | 'hls' | 'youtube' | 'bilibili';
  addedBy: string;
  /** 点播人 playerId：切到这一部时由他接管控片权 */
  addedById?: string;
  thumbnail?: string;
  durationSec?: number;
  builtinMode?: 'cosmos' | 'lofi' | 'mp4';
}

/**
 * 服务端看门狗在片尾后多等几秒再推进。
 * 留这点余量是给客户端自己的「播完」判定抢先用的：正常情况客户端先报，
 * 这里只在客户端彻底没反应（切后台、断网、页面崩了）时兜底。
 */
export const AUTO_ADVANCE_GRACE_SEC = 3;
/**
 * 搬运（扛人 / 扛巨幕）的参数。
 *
 * 巨幕宽 680 高 340（三张地图都一样），客户端会按视口自适应放大到 1.17 倍，
 * 也就是最宽约 795、最高约 398。左右走动范围是按这个最大值反推的：
 * 扛着屏幕的人走到左右边界时，屏幕左右两条边正好还留在地板（40~1560）里。
 */
export const CARRY = {
  /**
   * 扛屏时，屏幕底边在玩家脚底上方多少世界单位。
   * 玩家脚底 y、头顶大约 y-40，取 44 让屏幕正好压在头顶上（略高 4px），
   * 再大就会露出一段空白像悬空，再小则屏幕会把脑袋盖住。
   */
  screenLift: 44,
  /** 扛着屏幕时玩家可走动的范围（保证巨幕不会拖出地板） */
  screenMinX: 440,
  screenMaxX: 1160,
  screenMinY: 464,
  screenMaxY: 980,
  /** 离巨幕多近才能扛起来（到屏幕矩形的距离） */
  screenReach: 140,
  /** 离另一个人多近才能把对方背起来 */
  playerReach: 110,
  /** 离见习修女多近才能把她举起来 */
  npcReach: 115,
  /**
   * 巨幕底边的活动范围（世界坐标）。
   * 地板是 40~1560 / 60~1050。底边下限 420 是为了让屏幕能整个举过玩家头顶
   * （玩家站屏幕下方时脚底约 470，头顶点 430），代价是最高位时屏幕顶边
   * 会越过地板上沿约 40px 挂到墙上——比糊在人脸上好看得多。
   */
  anchorMinY: 420,
  anchorMaxY: 1010,
} as const;

/** `carryTarget` 里代表巨幕的哨兵值 */
export const SCREEN_CARRY_TARGET = '@screen';
/** `carryTarget` 里代表巡逻 NPC（见习修女）的哨兵值 */
export const NPC_CARRY_TARGET = '@npc';

/** 三张地图的 screenRect 都是 x460 y120 680×340，底边中心就是 (800, 460) */
export const DEFAULT_SCREEN_ANCHOR = { x: 800, y: 460 };

function clampScreenAnchor(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(CARRY.screenMinX, Math.min(CARRY.screenMaxX, Math.round(x))),
    y: Math.max(CARRY.anchorMinY, Math.min(CARRY.anchorMaxY, Math.round(y))),
  };
}

/** 玩家到巨幕矩形（底边中心 anchor、宽 680 高 340）的最短距离 */
export function distanceToScreen(
  x: number,
  y: number,
  anchor: { x: number; y: number }
): number {
  const nearestX = Math.max(anchor.x - 340, Math.min(anchor.x + 340, x));
  const nearestY = Math.max(anchor.y - 340, Math.min(anchor.y, y));
  return Math.hypot(nearestX - x, nearestY - y);
}

export interface RoomVideoState {
  currentItem: RoomVideoItem;
  isPlaying: boolean;
  currentTime: number;
  updatedAtMs: number;
  queue: RoomVideoItem[];
  /** 点播人：只有他能改播放进度（play/pause/seek），其他人只读 */
  controllerId?: string | null;
  controllerName?: string;
  /** 当前放的是默认待机短片（还没人点播过）：此时点播直接开播 */
  isPlaceholder?: boolean;
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
  // 只有内置待机短片需要取模（它要无限循环）。
  // 点播的 B 站 / mp4 一旦到片尾就必须停在 dur，否则 `t >= dur` 永远不成立，
  // 所有「播完了吗」的判断（客户端推进、服务端 ended 校验）全部失效。
  if (vs.isPlaceholder && dur && dur > 0 && next >= dur) return next % dur;
  return next;
}

/**
 * 从 B 站链接里取分 P 序号（`?p=3`），没有就返回 1。
 *
 * 这个参数必须一路带到 embedUrl：B 站多 P 视频的 `data.duration` 是
 * **所有分 P 时长之和**，但播放器一次只播一集。丢了 p 就会永远播 P1，
 * 而房间时钟拿总和去比，`t >= activeDur` 永远不成立 ——
 * 表现就是「播完停在 B 站的推荐视频页，不跳下一部」。
 */
export function extractBiliPage(rawUrl: string): number {
  const m = String(rawUrl || '').match(/[?&]p=(\d{1,4})/i);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 1 ? Math.min(999, Math.floor(n)) : 1;
}

export function parseVideoUrlServer(rawUrl: string): {
  sourceType: 'builtin' | 'mp4' | 'hls' | 'youtube' | 'bilibili';
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
      embedUrl: `https://www.youtube.com/embed/${vid}?enablejsapi=1&autoplay=1&playsinline=1&rel=0`,
      titleHint: `YouTube 视频 (${vid})`,
    };
  }
  const biliPage = extractBiliPage(trimmed);
  const bvidMatch = trimmed.match(/(BV[a-zA-Z0-9]{10})/);
  if (bvidMatch) {
    const bvid = bvidMatch[1];
    return {
      sourceType: 'bilibili',
      embedUrl: `https://player.bilibili.com/player.html?bvid=${bvid}&page=${biliPage}&high_quality=1&danmaku=0&autoplay=1`,
      titleHint: `Bilibili 视频 (${bvid})`,
    };
  }
  // 老 av 链接，以及用户直接粘过来的裸 av 号（av170001）。
  // 裸 av 只在「不是 URL」时认，避免 example.com/av123.mp4 被误判成 B 站视频。
  // 不用 lookbehind：Safari 16.4 以下会在解析阶段报错，整个包都加载不了。
  const aidMatch =
    trimmed.match(/bilibili\.com\/video\/av(\d+)/i) ||
    (/:\/\//.test(trimmed)
      ? null
      : trimmed.match(/(?:^|[^0-9A-Za-z])av(\d{1,12})(?![0-9A-Za-z])/i));
  if (aidMatch) {
    const aid = aidMatch[1];
    return {
      sourceType: 'bilibili',
      embedUrl: `https://player.bilibili.com/player.html?aid=${aid}&page=${biliPage}&high_quality=1&danmaku=0&autoplay=1`,
      titleHint: `Bilibili 视频 (av${aid})`,
    };
  }
  const cleanPath = trimmed.split('?')[0].split('#')[0].toLowerCase();
  if (cleanPath.endsWith('.m3u8') || /\.m3u8(\?|$)/i.test(trimmed)) {
    return {
      sourceType: 'hls',
      embedUrl: trimmed,
      titleHint: trimmed.split('/').pop()?.split('?')[0] || 'HLS 流媒体',
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
  /** 巨幕底边中心的世界坐标；null = 还没人搬过，用地图默认位置 */
  screenAnchor: { x: number; y: number } | null = null;
  /**
   * 房间连接方式。由房主宣告：'direct' 时所有人该连房主的 DataChannel，
   * 'cloud' 时所有人走服务器。放在服务端而不是各自本地，是为了让「后进来的人」
   * 也能一眼知道这屋子在直连，不用等房主再广播一次。
   */
  linkMode: 'cloud' | 'direct' = 'cloud';

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
      // 队列是「真正的播放顺序」，初始为空；内置片库在客户端单独展示
      queue: [],
      controllerId: null,
      controllerName: '',
      isPlaceholder: true,
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

    // 出生点横向错开，避免多人叠在一起。
    // 原来用 (size % 6) * 44 - 110，第一个进房的人会被推到 -110，
    // 一个人站在巨幕下面时画面明显偏左（手机窄屏上巨幕会被切掉右边）。
    // 改成从中心向两侧铺开：0, +44, -44, +88, -88, +132
    const SPAWN_OFFSETS = [0, 44, -44, 88, -88, 132];
    const spawnOffset = SPAWN_OFFSETS[this.players.size % SPAWN_OFFSETS.length];
    // 重连（换连接方式、断线重进）时沿用原来的位置和状态。
    // 否则「直连切云端」会让全屋人瞬间被传送回出生点，看起来像集体掉线重进。
    const existing = this.players.get(playerId);
    const player: RoomPlayer = {
      id: playerId,
      uid: typeof msg.uid === 'string' ? msg.uid.slice(0, 128) : null,
      name: clampText(msg.name, `旅人 ${playerId.slice(-4)}`, 24),
      avatar,
      x: existing?.x ?? 800 + spawnOffset,
      y: existing?.y ?? 790,
      dir: existing?.dir ?? 'up',
      isMoving: false,
      isSitting: existing?.isSitting ?? false,
      seatId: existing?.seatId ?? null,
      isMicOn: existing?.isMicOn ?? false,
      isBroadcasting: existing?.isBroadcasting ?? false,
      isHost: this.hostId === playerId,
      carryTarget: existing?.carryTarget ?? null,
      carriedBy: existing?.carriedBy ?? null,
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
          linkMode: this.linkMode,
          players: Array.from(this.players.values()),
          furniture: this.furniture,
          videoState: this.videoState,
          chatHistory: this.chatHistory,
          screenAnchor: this.screenAnchor,
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

    if (type === 'p2p:host') {
      return this.declareP2PHost(playerId);
    }

    if (type === 'p2p:off') {
      return this.switchToCloud(playerId);
    }

    if (type === 'player:move') {
      // 被扛着的人自己动不了：位置由扛他的人带着走
      if (me.carriedBy) return [];
      const x = Number(msg.x);
      const y = Number(msg.y);
      const carryingScreen = me.carryTarget === SCREEN_CARRY_TARGET;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (carryingScreen) {
          // 扛着巨幕时只能走到「屏幕刚好还完整落在地板里」的范围。
          // 抓取时已经把玩家推到合法范围内，这里直接硬夹，避免再往屏幕底下钻。
          me.x = Math.max(CARRY.screenMinX, Math.min(CARRY.screenMaxX, x));
          me.y = Math.max(CARRY.screenMinY, Math.min(CARRY.screenMaxY, y));
        } else {
          me.x = Math.max(80, Math.min(1520, x));
          me.y = Math.max(120, Math.min(980, y));
        }
      }
      if (['up', 'down', 'left', 'right'].includes(msg.dir)) me.dir = msg.dir;
      me.isMoving = Boolean(msg.isMoving);
      me.isSitting = Boolean(msg.isSitting);
      me.seatId = typeof msg.seatId === 'string' ? msg.seatId : null;

      // 扛着人：被扛的人跟着走（同步坐标，后进来的人看快照也是对的）
      // 扛着屏幕：屏幕底边中心跟着走，顺手把新位置塞进这条消息里一起广播
      let screenAnchor: { x: number; y: number } | undefined;
      if (carryingScreen) {
        this.screenAnchor = clampScreenAnchor(me.x, me.y - CARRY.screenLift);
        screenAnchor = this.screenAnchor;
      } else if (me.carryTarget && me.carryTarget !== NPC_CARRY_TARGET) {
        const carried = this.players.get(me.carryTarget);
        if (carried) {
          carried.x = me.x;
          carried.y = me.y;
          carried.dir = me.dir;
          carried.isMoving = me.isMoving;
        }
      }

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
            screenAnchor,
          },
        },
      ];
    }

    if (type === 'player:carry') {
      // 正被扛着的人按「扛起/放下」= 挣扎下来
      if (me.carriedBy) return this.dropCarried(me);
      return this.handleCarry(me, msg.target);
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
      // 点播人（controllerId）之外的玩家只能看，不能改进度
      const isController = !vs.controllerId || vs.controllerId === playerId;
      const denyProgress = (): Outbound[] => [
        {
          kind: 'to',
          targetId: playerId,
          payload: {
            type: 'video:rejected',
            reason: `${vs.controllerName || '点播人'} 正在控片，只有点播人可以改播放进度`,
          },
        },
      ];
      const claimController = () => {
        vs.controllerId = playerId;
        vs.controllerName = me.name;
      };
      /** 能否推进到下一部：控片人、房主，或当前无人控片 */
      const canAdvance = () =>
        !vs.controllerId || vs.controllerId === playerId || this.hostId === playerId;

      if (action === 'progress') {
        // 点播人定期上报真实播放位置：服务端校准后广播一次（silent，不弹提示），
        // 让所有人的时间轴重新对齐，避免长时间播放后各端漂移。
        if (!isController) return [];
        const t = Number(msg.currentTime);
        if (!Number.isFinite(t)) return [];
        vs.currentTime = Math.max(0, t);
        vs.updatedAtMs = now;
        return [
          {
            kind: 'all',
            payload: {
              type: 'video:synced',
              videoState: vs,
              serverTimeMs: now,
              triggeredBy: me.name,
              silent: true,
            },
          },
        ];
      }

      /** 加进队列末尾，只给发起人一条私有回执：不广播、不切片 */
      const pushToQueue = (item: RoomVideoItem): Outbound[] => {
        const existing = vs.queue.find((q) => q.id === item.id);
        if (existing) {
          return [
            {
              kind: 'to',
              targetId: playerId,
              payload: {
                type: 'video:queued',
                item: existing,
                position: vs.queue.findIndex((q) => q.id === existing.id) + 1,
                total: vs.queue.length,
                already: true,
              },
            },
          ];
        }
        vs.queue.push(item);
        return [
          {
            kind: 'to',
            targetId: playerId,
            payload: {
              type: 'video:queued',
              item,
              position: vs.queue.length,
              total: vs.queue.length,
            },
          },
        ];
      };

      /** 立即切到某部，并把自己设为控片人（队列保持播放顺序，重复点播不重复占位） */
      const startItem = (item: RoomVideoItem) => {
        vs.queue = vs.queue.filter((q) => q.id !== item.id);
        vs.queue.push(item);
        vs.currentItem = item;
        vs.currentTime = 0;
        vs.isPlaying = true;
        vs.updatedAtMs = now;
        vs.isPlaceholder = false;
        claimController();
      };

      if (action === 'play') {
        if (!isController) return denyProgress();
        // 待机短片人人可暂停/继续，不锁控片权
        if (!vs.controllerId && !vs.isPlaceholder) claimController();
        vs.currentTime = Number.isFinite(Number(msg.currentTime))
          ? Number(msg.currentTime)
          : currentElapsed;
        vs.isPlaying = true;
        vs.updatedAtMs = now;
      } else if (action === 'pause') {
        if (!isController) return denyProgress();
        if (!vs.controllerId && !vs.isPlaceholder) claimController();
        vs.currentTime = Number.isFinite(Number(msg.currentTime))
          ? Number(msg.currentTime)
          : currentElapsed;
        vs.isPlaying = false;
        vs.updatedAtMs = now;
      } else if (action === 'seek') {
        if (!isController) return denyProgress();
        if (!vs.controllerId && !vs.isPlaceholder) claimController();
        vs.currentTime = Math.max(0, Number(msg.currentTime) || 0);
        vs.updatedAtMs = now;
      } else if (action === 'ended') {
        // 「我这边播完了」——谁都能报，但必须真的到片尾才认。
        //
        // 为什么不能只让控片人报：控片人切到后台时 requestAnimationFrame 会被
        // 浏览器整个暂停，他本人也可能已经退出房间。这两种情况下原来的
        // `next` 永远不会被发出，整屋人卡在片尾，B 站会顺势掉进它自己的推荐页。
        if (typeof msg.expectedItemId === 'string' && msg.expectedItemId !== vs.currentItem.id) {
          return [];
        }
        const endDur = vs.currentItem.durationSec;
        if (!endDur || endDur <= 5) return [];
        // 只认「已经播到接近片尾」的上报，避免有人刚开播就把整屋人跳过。
        // 用 90% 而不是「差 2 秒」：各端时钟有偏差，卡太死会让人感觉「偶尔不灵」，
        // 而 221 秒的片子留 22 秒余量已经足够防滥用。
        if (currentElapsed < endDur * 0.9) return [];
        this.advanceToNextItem(playerId, now);
      } else if (action === 'next') {
        // 播完 / 手动跳过：房间里谁都能推进，不用投票
        // 防多端同时上报导致连续跳两部
        if (typeof msg.expectedItemId === 'string' && msg.expectedItemId !== vs.currentItem.id) {
          return [];
        }
        this.advanceToNextItem(playerId, now);
      } else if (action === 'select_item' && msg.item) {
        const item: RoomVideoItem = {
          id: String(msg.item.id || `vid_${now}`).slice(0, 64),
          title: String(msg.item.title || '点播视频').slice(0, 80),
          url: String(msg.item.url || '').slice(0, 512),
          sourceType: ['builtin', 'mp4', 'hls', 'youtube', 'bilibili'].includes(msg.item.sourceType)
            ? msg.item.sourceType
            : 'mp4',
          addedBy: me.name,
          addedById: playerId,
          thumbnail: typeof msg.item.thumbnail === 'string' ? msg.item.thumbnail.slice(0, 512) : undefined,
          durationSec: Number(msg.item.durationSec) || undefined,
          builtinMode: msg.item.builtinMode,
        };
        if (vs.isPlaceholder) {
          // 房间还停在待机短片：点播直接开播
          startItem(item);
        } else {
          // 有人在看片：只排队，不打断
          return pushToQueue(item);
        }
      } else if (action === 'enqueue' && msg.item) {
        const parsed = parseVideoUrlServer(String(msg.item.url || ''));
        const resolvedSourceType =
          parsed.sourceType === 'mp4' &&
          (msg.item.sourceType === 'hls' || msg.item.sourceType === 'mp4')
            ? msg.item.sourceType
            : parsed.sourceType;
        const item: RoomVideoItem = {
          id: `vid_${now}_${Math.random().toString(36).slice(2, 6)}`,
          title: String(msg.item.title || parsed.titleHint).slice(0, 80),
          url: parsed.embedUrl,
          sourceType: resolvedSourceType,
          addedBy: me.name,
          addedById: playerId,
          thumbnail:
            typeof msg.item.thumbnail === 'string' && /^https?:\/\//i.test(msg.item.thumbnail)
              ? msg.item.thumbnail.slice(0, 512)
              : undefined,
          durationSec:
            Number.isFinite(Number(msg.item.durationSec)) && Number(msg.item.durationSec) > 0
              ? Math.floor(Number(msg.item.durationSec))
              : undefined,
        };
        if (vs.isPlaceholder) startItem(item);
        else return pushToQueue(item);
      } else if (action === 'jump_to' && typeof msg.itemId === 'string') {
        if (!canAdvance()) return denyProgress();
        const target = vs.queue.find((q) => q.id === msg.itemId);
        if (!target) return [];
        vs.currentItem = { ...target };
        vs.currentTime = 0;
        vs.isPlaying = true;
        vs.updatedAtMs = now;
        vs.isPlaceholder = false;
        const ownerId =
          target.addedById && this.players.has(target.addedById)
            ? target.addedById
            : this.hostId && this.players.has(this.hostId)
              ? this.hostId
              : playerId;
        vs.controllerId = ownerId;
        vs.controllerName = this.players.get(ownerId)?.name || target.addedBy || '';
      } else if (action === 'remove_queue' && typeof msg.itemId === 'string') {
        const target = vs.queue.find((q) => q.id === msg.itemId);
        if (!target) return [];
        // 正在播的不能删；别人的只有房主能删
        if (target.id === vs.currentItem.id) return [];
        if (target.addedById !== playerId && this.hostId !== playerId) return [];
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
        // 换地图：巨幕回到新地图的默认位置，正在扛屏的人松手
        if (nextMapId !== this.mapId) {
          this.screenAnchor = null;
          for (const p of this.players.values()) {
            if (p.carryTarget === SCREEN_CARRY_TARGET) p.carryTarget = null;
          }
        }
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
            screenAnchor: this.screenAnchor,
            updatedBy: me.name,
          },
        },
      ];
    }

    return [];
  }

  /**
   * 服务端看门狗：片尾到了就自动切下一部（每秒由 Node / Durable Object 调一次）。
   *
   * 客户端是靠 requestAnimationFrame 轮询「时钟 >= 时长」来判断播完的，而 rAF
   * 在标签页切到后台、窗口最小化时会被浏览器完全暂停。控片人一旦切走窗口，
   * 整屋子人就会永远停在片尾 —— B 站更糟，会直接掉进它自己的「推荐视频」页。
   *
   * 这里用权威时钟在服务端兜底，谁在不在窗口前都不影响换片。
   * 拿不到时长的（直播流、元信息解析失败的源）返回空，交回客户端自己的 ended 事件。
   */
  tick(now: number): Outbound[] {
    const vs = this.videoState;
    // 房间空了就停：否则待机轮播会在没人看的时候空转，白白写状态
    if (this.players.size === 0) return [];
    const dur = vs.currentItem.durationSec;
    if (!dur || dur <= 5) return [];
    // 注意不能用 computeAuthoritativeVideoTime：内置短片在那里按 dur 取模，
    // 永远不会 >= dur，看门狗就永远触发不了。
    const elapsed = vs.currentTime + Math.max(0, (now - vs.updatedAtMs) / 1000);
    // 三个条件任一满足就推进：
    //   1) 按房间时钟已经播过片尾 + 3 秒宽限（正常情况下走这条）
    //   2) 上报的进度本身已经贴在片尾
    //   3) 状态是「暂停」但进度贴在片尾，且已经停了 3 秒以上
    // 第 2 条是给「控片人一直在前台、每 2 秒上报一次 progress」兜底的：
    // 每次上报都会刷新 updatedAtMs，elapsed 被永远钉在 dur 上，只看第 1 条会饿死。
    //
    // 第 3 条是最后一道保险：以前这里第一行就 `!vs.isPlaying → return []`，
    // 只要状态被写成暂停（比如某端在片尾点了一下暂停、或者播完那一刻被标成暂停），
    // 看门狗就整段跳过，整屋人永远停在最后一帧。现在暂停在片尾同样会推进，
    // 只是多等 3 秒，给「想重看一遍」的人留反应时间。
    const stuckAtEnd = dur > 0 && vs.currentTime >= dur - 0.5;
    if (!vs.isPlaying) {
      if (!stuckAtEnd || now - vs.updatedAtMs < 3000) return [];
      this.advanceToNextItem('', now);
      return [
        {
          kind: 'all',
          payload: {
            type: 'video:synced',
            videoState: vs,
            serverTimeMs: now,
            silent: true,
          },
        },
      ];
    }
    if (elapsed < dur + AUTO_ADVANCE_GRACE_SEC && !stuckAtEnd) return [];

    this.advanceToNextItem('', now);
    return [
      {
        kind: 'all',
        payload: {
          type: 'video:synced',
          videoState: vs,
          serverTimeMs: now,
          silent: true,
        },
      },
    ];
  }

  /**
   * 扛起 / 放下。
   * target = `@screen` 扛巨幕，= 玩家 id 背人，= null 放下手里的东西。
   * 位置校验放在服务端：客户端只负责发意图，避免有人隔着半个房间把屏幕搬走。
   */
  private handleCarry(me: RoomPlayer, rawTarget: unknown): Outbound[] {
    const target = typeof rawTarget === 'string' && rawTarget ? rawTarget : null;
    if (!target) return this.releaseCarry(me);

    // 手上已经有东西：先放下，别让人一次扛两个
    if (me.carryTarget) return this.releaseCarry(me);

    if (target === SCREEN_CARRY_TARGET) {
      // 巨幕同一时间只能被一个人扛
      for (const p of this.players.values()) {
        if (p.carryTarget === SCREEN_CARRY_TARGET) return [];
      }
      const anchor = this.screenAnchor ?? DEFAULT_SCREEN_ANCHOR;
      if (distanceToScreen(me.x, me.y, anchor) > CARRY.screenReach) return [];
      // 只能从屏幕正面（下方）往上顶。站在屏幕背后去抓会把屏幕举到人身前，
      // 人反而被整块盖住，看起来像穿模。
      if (me.y <= anchor.y) return [];

      me.carryTarget = SCREEN_CARRY_TARGET;
      me.isSitting = false;
      me.seatId = null;
      me.isMoving = false;
      // 抓取时人可能贴得比较近，退半步让屏幕能整个举过头顶（一般不超过 40px）
      me.y = Math.max(CARRY.screenMinY, Math.min(CARRY.screenMaxY, me.y));
      me.x = Math.max(CARRY.screenMinX, Math.min(CARRY.screenMaxX, me.x));
      this.screenAnchor = clampScreenAnchor(me.x, me.y - CARRY.screenLift);
      return [
        {
          kind: 'all',
          payload: {
            type: 'player:carried',
            playerId: me.id,
            carryTarget: SCREEN_CARRY_TARGET,
            carriedBy: null,
          },
        },
        {
          kind: 'all',
          payload: {
            type: 'player:moved',
            playerId: me.id,
            x: me.x,
            y: me.y,
            dir: me.dir,
            isMoving: false,
            isSitting: false,
            seatId: null,
            screenAnchor: this.screenAnchor,
          },
        },
        {
          kind: 'all',
          payload: { type: 'screen:moved', anchor: this.screenAnchor, carrierId: me.id },
        },
      ];
    }

    if (target === NPC_CARRY_TARGET) {
      // 见习修女同一时间只能被一个人举起
      for (const p of this.players.values()) {
        if (p.carryTarget === NPC_CARRY_TARGET) return [];
      }
      me.carryTarget = NPC_CARRY_TARGET;
      me.isSitting = false;
      me.seatId = null;
      return [
        {
          kind: 'all',
          payload: {
            type: 'player:carried',
            playerId: me.id,
            carryTarget: NPC_CARRY_TARGET,
            carriedBy: null,
          },
        },
      ];
    }

    const other = this.players.get(target);
    if (!other || other.id === me.id) return [];
    // 对方已经被人扛着，或者他自己手上也有东西
    if (other.carriedBy || other.carryTarget) return [];
    if (Math.hypot(other.x - me.x, other.y - me.y) > CARRY.playerReach) return [];

    other.carriedBy = me.id;
    other.isSitting = false;
    other.seatId = null;
    other.isMoving = false;
    me.carryTarget = other.id;
    me.isSitting = false;
    me.seatId = null;

    return [
      {
        kind: 'all',
        payload: { type: 'player:carried', playerId: me.id, carryTarget: other.id, carriedBy: null },
      },
      {
        kind: 'all',
        payload: { type: 'player:carried', playerId: other.id, carryTarget: null, carriedBy: me.id },
      },
    ];
  }

  /** 放下手里的东西：巨幕留在原地，人放到旁边一点 */
  private releaseCarry(me: RoomPlayer): Outbound[] {
    const target = me.carryTarget;
    if (!target) return [];
    me.carryTarget = null;
    const out: Outbound[] = [];

    if (target === SCREEN_CARRY_TARGET) {
      this.screenAnchor = clampScreenAnchor(me.x, me.y - CARRY.screenLift);
      out.push({
        kind: 'all',
        payload: { type: 'screen:moved', anchor: this.screenAnchor, carrierId: null },
      });
    } else if (target !== NPC_CARRY_TARGET) {
      const other = this.players.get(target);
      if (other) {
        other.carriedBy = null;
        other.isMoving = false;
        other.x = Math.max(80, Math.min(1520, me.x + 42));
        other.y = Math.max(120, Math.min(980, me.y + 6));
        out.push({
          kind: 'all',
          payload: {
            type: 'player:moved',
            playerId: other.id,
            x: other.x,
            y: other.y,
            dir: other.dir,
            isMoving: false,
            isSitting: false,
            seatId: null,
          },
        });
        out.push({
          kind: 'all',
          payload: { type: 'player:carried', playerId: other.id, carryTarget: null, carriedBy: null },
        });
      }
    }

    out.push({
      kind: 'all',
      payload: { type: 'player:carried', playerId: me.id, carryTarget: null, carriedBy: null },
    });
    return out;
  }

  /** 被扛的人挣扎下来：自己落到旁边，扛他的人同时松手 */
  private dropCarried(me: RoomPlayer): Outbound[] {
    const carrierId = me.carriedBy;
    if (!carrierId) return [];
    const carrier = this.players.get(carrierId);
    me.carriedBy = null;
    me.isMoving = false;
    me.x = Math.max(80, Math.min(1520, (carrier?.x ?? me.x) + 42));
    me.y = Math.max(120, Math.min(980, (carrier?.y ?? me.y) + 6));
    if (carrier && carrier.carryTarget === me.id) carrier.carryTarget = null;

    const out: Outbound[] = [
      {
        kind: 'all',
        payload: { type: 'player:carried', playerId: me.id, carryTarget: null, carriedBy: null },
      },
      {
        kind: 'all',
        payload: {
          type: 'player:moved',
          playerId: me.id,
          x: me.x,
          y: me.y,
          dir: me.dir,
          isMoving: false,
          isSitting: false,
          seatId: null,
        },
      },
    ];
    if (carrier) {
      out.push({
        kind: 'all',
        payload: { type: 'player:carried', playerId: carrier.id, carryTarget: null, carriedBy: null },
      });
    }
    return out;
  }

  /**
   * 切到队列下一部（含「待机轮播」「队列放完回落」两种兜底）。
   * 调用方负责权限判断与 expectedItemId 去重；这里只管推进 + 清掉跳过投票。
   */
  private advanceToNextItem(playerId: string, now: number): void {
    const vs = this.videoState;
    const idx = vs.queue.findIndex((q) => q.id === vs.currentItem.id);
    const nextItem = idx >= 0 ? vs.queue[idx + 1] : undefined;
    if (nextItem) {
      vs.currentItem = { ...nextItem };
      vs.currentTime = 0;
      vs.isPlaying = true;
      vs.updatedAtMs = now;
      vs.isPlaceholder = false;
      // 控片权交给这一部的点播人；他不在房间就交房主
      const ownerId =
        nextItem.addedById && this.players.has(nextItem.addedById)
          ? nextItem.addedById
          : this.hostId && this.players.has(this.hostId)
            ? this.hostId
            : playerId;
      vs.controllerId = ownerId;
      vs.controllerName = this.players.get(ownerId)?.name || nextItem.addedBy || '';
    } else if (vs.isPlaceholder && vs.queue.length === 0) {
      // 待机状态下无人点播：自动轮播内置精选片库的下一部
      const defIdx = DEFAULT_PLAYLIST.findIndex((d) => d.id === vs.currentItem.id);
      const nextDefault =
        DEFAULT_PLAYLIST[(defIdx >= 0 ? defIdx + 1 : 1) % DEFAULT_PLAYLIST.length];
      vs.currentItem = { ...nextDefault };
      vs.currentTime = 0;
      vs.isPlaying = true;
      vs.updatedAtMs = now;
      vs.isPlaceholder = true;
      vs.controllerId = null;
      vs.controllerName = '';
    } else {
      // 自定义队列全部放完：回到待机短片，清空已播队列，谁都能重新点播
      vs.queue = [];
      vs.currentItem = { ...DEFAULT_PLAYLIST[0] };
      vs.currentTime = 0;
      vs.isPlaying = true;
      vs.updatedAtMs = now;
      vs.isPlaceholder = true;
      vs.controllerId = null;
      vs.controllerName = '';
    }
  }

  /** 房主离开：清理 + 房主移交 + 广播 */
  leave(playerId: string): Outbound[] {
    const leaving = this.players.get(playerId);
    if (!leaving) return [];
    this.players.delete(playerId);

    let hostLeftDirect = false;
    if (this.hostId === playerId) {
      const nextHost = this.players.keys().next().value || null;
      this.hostId = nextHost;
      if (nextHost) {
        const nextPlayer = this.players.get(nextHost);
        if (nextPlayer) nextPlayer.isHost = true;
      }
      // 房主走了，直连的「服务器」就没了。新上来的人手里没有房主的 RoomCore 状态，
      // 也接不住已经建立的 DataChannel —— 直接让全屋回云端，比让客人等 ICE 超时快得多。
      if (this.linkMode === 'direct') {
        this.linkMode = 'cloud';
        hostLeftDirect = true;
      }
    }

    const out: Outbound[] = [
      { kind: 'all', payload: { type: 'player:left', playerId, newHostId: this.hostId } },
    ];
    if (hostLeftDirect) {
      out.push({ kind: 'all', payload: { type: 'p2p:off', hostId: this.hostId } });
    }

    // 搬运关系：走的人扛着谁就放下谁；走的人被谁扛着就让对方松手
    if (leaving.carryTarget === SCREEN_CARRY_TARGET) {
      // 巨幕位置一直跟着他更新，人走了屏幕就留在原地
      out.push({
        kind: 'all',
        payload: { type: 'screen:moved', anchor: this.screenAnchor, carrierId: null },
      });
    } else if (leaving.carryTarget && leaving.carryTarget !== NPC_CARRY_TARGET) {
      const carried = this.players.get(leaving.carryTarget);
      if (carried) {
        carried.carriedBy = null;
        carried.isMoving = false;
        out.push({
          kind: 'all',
          payload: { type: 'player:carried', playerId: carried.id, carryTarget: null, carriedBy: null },
        });
        out.push({
          kind: 'all',
          payload: {
            type: 'player:moved',
            playerId: carried.id,
            x: carried.x,
            y: carried.y,
            dir: carried.dir,
            isMoving: false,
            isSitting: false,
            seatId: null,
          },
        });
      }
    }
    if (leaving.carriedBy) {
      const carrier = this.players.get(leaving.carriedBy);
      if (carrier && carrier.carryTarget === playerId) {
        carrier.carryTarget = null;
        out.push({
          kind: 'all',
          payload: { type: 'player:carried', playerId: carrier.id, carryTarget: null, carriedBy: null },
        });
      }
    }

    // 点播人离开了：把控片权交给房主（没有房主就给剩下第一个），并广播一次
    let videoDirty = false;
    if (this.videoState.controllerId === playerId) {
      const next =
        this.hostId && this.players.has(this.hostId)
          ? this.hostId
          : (this.players.keys().next().value as string | undefined) || null;
      this.videoState.controllerId = next;
      this.videoState.controllerName = next ? this.players.get(next)?.name || '' : '';
      videoDirty = true;
    }

    if (videoDirty) {
      out.push({
        kind: 'all',
        payload: {
          type: 'video:synced',
          videoState: this.videoState,
          serverTimeMs: Date.now(),
          triggeredBy: '系统',
        },
      });
    }

    return out;
  }

  get isEmpty(): boolean {
    return this.players.size === 0;
  }

  /**
   * P2P 模式下，房主刷新/重连后重新「认领」房主身份。
   * 云端按「第一个进来的人」判定 hostId，房主一刷新就会漂移到别人头上，
   * 所以允许客户端显式宣告一次。
   */
  declareP2PHost(playerId: string): Outbound[] {
    if (!this.players.has(playerId)) return [];
    this.hostId = playerId;
    this.linkMode = 'direct';
    for (const p of this.players.values()) p.isHost = p.id === playerId;
    return [{ kind: 'all', payload: { type: 'p2p:host', hostId: playerId } }];
  }

  /**
   * 房主主动切回云端。只认房主：别人喊一声「关直连」不应该能把整屋人踢下线。
   * 广播 p2p:off 后，所有在直连的客人各自回落云端并重新 join 拉全量状态。
   */
  switchToCloud(playerId: string): Outbound[] {
    if (this.hostId !== playerId) return [];
    if (this.linkMode === 'cloud') return [];
    this.linkMode = 'cloud';
    return [{ kind: 'all', payload: { type: 'p2p:off', hostId: this.hostId } }];
  }

  /** 房主刷新后要恢复的状态（视频进度、场景、聊天） */
  exportState() {
    return {
      mapId: this.mapId,
      furniture: this.furniture,
      videoState: this.videoState,
      chatHistory: this.chatHistory,
      screenAnchor: this.screenAnchor,
    };
  }

  restoreState(state: {
    mapId?: string;
    furniture?: RoomFurnitureItem[];
    videoState?: RoomVideoState;
    chatHistory?: RoomChatMessage[];
    screenAnchor?: { x: number; y: number } | null;
  }) {
    if (state.mapId) this.mapId = state.mapId;
    if (Array.isArray(state.furniture)) this.furniture = state.furniture.slice(0, 40);
    if (state.screenAnchor && Number.isFinite(state.screenAnchor.x) && Number.isFinite(state.screenAnchor.y)) {
      this.screenAnchor = clampScreenAnchor(state.screenAnchor.x, state.screenAnchor.y);
    } else if (state.screenAnchor === null) {
      this.screenAnchor = null;
    }
    if (state.videoState && state.videoState.currentItem) {
      const restored = state.videoState;
      this.videoState = {
        ...restored,
        updatedAtMs: Date.now(),
        // 旧存档没有这个字段：有控片人就说明确实点播过
        isPlaceholder: restored.isPlaceholder ?? !restored.controllerId,
      };
    }
    if (Array.isArray(state.chatHistory) && state.chatHistory.length) {
      this.chatHistory = state.chatHistory.slice(-40);
    }
  }

  /** HTTP 探测 / 调试用的房间快照 */
  snapshot() {
    return {
      roomId: this.roomId,
      mapId: this.mapId,
      playerCount: this.players.size,
      currentVideoTitle: this.videoState.currentItem.title,
      screenAnchor: this.screenAnchor,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        x: Math.round(p.x),
        y: Math.round(p.y),
        carryTarget: p.carryTarget ?? null,
        carriedBy: p.carriedBy ?? null,
      })),
    };
  }
}
