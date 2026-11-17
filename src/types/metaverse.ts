export type MapId = 'sunset-rooftop' | 'gallery-theater' | 'forest-cabin' | string;

export type HairStyle = 'short' | 'bob' | 'bun' | 'wavy' | 'sidepart' | 'spiky' | string;
export type EyeStyle = 'smile' | 'star' | 'cool' | 'gentle' | 'wink' | string;
export type OutfitStyle = 'hoodie' | 'overalls' | 'knit' | 'techwear' | 'dress' | 'blazer' | string;
export type AccessoryStyle = 'none' | 'headphones' | 'beret' | 'glasses' | 'crown' | 'catEars' | string;

export interface AvatarConfig {
  skinColor: string;
  hairStyle: HairStyle;
  hairColor: string;
  eyeStyle: EyeStyle;
  outfitStyle: OutfitStyle;
  outfitColor: string;
  accessory: AccessoryStyle;
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
  | 'rug_geo';

export interface FurnitureItem {
  id: string;
  type: FurnitureType;
  x: number;
  y: number;
  rotation?: number;
  sittable?: boolean;
  label?: string;
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
}

export type VideoSourceType = 'builtin' | 'mp4' | 'youtube' | 'bilibili';

export interface VideoQueueItem {
  id: string;
  title: string;
  url: string;
  sourceType: VideoSourceType;
  addedBy: string;
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
