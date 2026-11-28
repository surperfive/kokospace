export type MapId = 'sunset-rooftop' | 'gallery-theater' | 'forest-cabin' | string;

export type HairStyle =
  | 'bob'
  | 'sailor'
  | 'explorer'
  | 'punk'
  | 'punkBandana'
  | 'wuxia'
  | string;
export type EyeStyle =
  | 'rainbow'
  | 'happy'
  | 'surprised'
  | 'sailor'
  | 'sailorHappy'
  | 'explorer'
  | 'punk'
  | 'punkGrin'
  | 'punkSerious'
  | string;
export type OutfitStyle = 'pleated' | 'sailor' | 'explorer' | 'punk' | 'wuxia' | string;
export type AccessoryStyle = 'cap' | 'none' | string;

export interface CustomAvatarLayers {
  /** 自定义替换的「服装与身体」PNG dataURL */
  body?: string;
  /** 自定义替换的「头部与五官」PNG dataURL */
  head?: string;
  /** 自定义替换的「发型与帽子」PNG dataURL */
  hairCap?: string;
}

export interface AvatarConfig {
  skinColor: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeStyle: EyeStyle;
  outfitStyle: OutfitStyle;
  outfitColor: string;
  accessory: AccessoryStyle;
  customLayers?: CustomAvatarLayers;
}

export type FurnitureType =
  | 'sofa_coral'
  | 'sofa_slate'
  | 'beanbag_cream'
  | 'beanbag_coral'
  | 'plant_olive'
  | 'plant_fern'
  | 'lamp_warm'
  | 'table_round'
  | 'rug_geo'
  /** 挂在墙上的像素画框：art 里是 32×32 PNG 的 dataURL */
  | 'art_frame';

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  rotation?: number;
  sittable?: boolean;
  label?: string;
  /** art_frame 专用：画作 PNG dataURL（本地画板导出，约 1KB） */
  art?: string;
  /** 该座位/家具已直接绘制在地图 SVG 插画中，正常游玩时不重复渲染矢量图标 */
  builtInOnMap?: boolean;
}

export interface MapZone {
  id: string;
  label: string;
  type: 'stage' | 'seating' | 'lounge';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapThemeDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  coverImage: string;
  /** 整张地图的高保真 SVG 矢量底图路径（如 /assets/maps/...svg） */
  mapSvg?: string;
  worldWidth: number;
  worldHeight: number;
  palette: {
    ground: string;
    groundAccent: string;
    gridLine: string;
    wall: string;
    wallTrim: string;
    stageFloor: string;
    stageBorder: string;
    seatingZone: string;
    loungeZone: string;
    screenFrame: string;
    accent: string;
  };
  screenRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 嵌入底图镂空窗口时的前景遮罩（拱门/吊灯/音箱覆盖在视频边缘之上，保留透明洞口） */
  screenFrameOverlay?: {
    src: string;
    /** 顶部控制条距离窗口顶部的安全百分比（避开麦克风挂牌） */
    topInsetPct?: number;
    /** 顶部控制条左右安全内边距百分比（避开两侧吊灯） */
    topSideInsetPct?: number;
    /** 底部控制条左右安全内边距百分比（避开左右音箱） */
    bottomSideInsetPct?: number;
  };
  spawnPoint: { x: number; y: number };
  zones: MapZone[];
  defaultFurniture: FurnitureItem[];
  obstacles: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface PlayerState {
  id: string;
  uid?: string | null;
  name: string;
  avatar: AvatarConfig;
  x: number;
  y: number;
  dir: 'down' | 'up' | 'left' | 'right';
  isMoving: boolean;
  isSitting: boolean;
  seatId?: string | null;
  isMicOn: boolean;
  isBroadcasting: boolean;
  isHost: boolean;
  speakingLevel?: number;
  /** 手上扛着谁：`@screen` 或玩家 id */
  carryTarget?: string | null;
  /** 被谁扛着 */
  carriedBy?: string | null;
}

export type VideoSourceType = 'builtin' | 'mp4' | 'hls' | 'youtube' | 'bilibili';

export interface VideoQueueItem {
  id: string;
  title: string;
  url: string;
  sourceType: VideoSourceType;
  addedBy: string;
  /** 点播人 playerId：切到这一部时由他接管控片权 */
  addedById?: string;
  thumbnail?: string;
  durationSec?: number;
  builtinMode?: 'cosmos' | 'lofi' | 'mp4';
}

export interface VideoState {
  currentItem: VideoQueueItem;
  isPlaying: boolean;
  currentTime: number;
  updatedAtMs: number;
  queue: VideoQueueItem[];
  /** 点播人：只有他能改播放进度（play/pause/seek），其余人只看 */
  controllerId?: string | null;
  controllerName?: string;
  /** 当前放的是默认待机短片（还没人点播过）：此时点播会直接开播，不用排队 */
  isPlaceholder?: boolean;
}

export interface FloatingReaction {
  id: string;
  playerId: string;
  playerName: string;
  emoji: string;
  label?: string;
  x: number;
  y: number;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  isSystem?: boolean;
  createdAt: number;
}

export interface ScenePreset {
  sceneId: string;
  ownerUid: string;
  roomName: string;
  mapId: MapId;
  furniture: FurnitureItem[];
  defaultVideoUrl: string;
  isPublic: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserProfileDoc {
  ownerUid: string;
  displayName: string;
  preferredMapId: MapId;
  avatar: AvatarConfig;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface EmojiPackPluginItem {
  emoji: string;
  label: string;
}

export interface AvatarPartPluginItem {
  category: 'accessory' | 'hairStyle';
  id: string;
  label: string;
}

export interface StageWidgetPlugin {
  id: string;
  title: string;
  renderBadgeText: () => string;
}

export interface KokoPlugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  maps?: MapThemeDefinition[];
  emojiPacks?: EmojiPackPluginItem[];
  avatarParts?: AvatarPartPluginItem[];
  widgets?: StageWidgetPlugin[];
}
