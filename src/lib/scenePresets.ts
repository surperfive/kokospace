/**
 * 本地场景方案（家具布局）
 *
 * 原来存在 Firestore、靠 Google 登录认人。Google 在大陆不可用，
 * 登录按钮形同废纸，所以改成纯本地：一台设备一份，不联网也能用。
 */

import { FurnitureItem, MapId, ScenePreset } from '../types/metaverse';

const KEY = 'koko_scene_presets';
const MAX_PRESETS = 12;

export interface LocalScenePreset extends ScenePreset {
  /** 本地方案没有账号，ownerUid 恒为空串 */
  ownerUid: '';
  createdAt?: number;
  updatedAt?: number;
}

function sanitizeFurniture(raw: unknown): FurnitureItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 40).map((f, i) => {
    const item = f as Partial<FurnitureItem>;
    return {
      id: String(item.id || `f_${i}`).slice(0, 40),
      type: item.type as FurnitureItem['type'],
      x: Math.round(Number(item.x) || 0),
      y: Math.round(Number(item.y) || 0),
      sittable: Boolean(item.sittable),
      label: item.label ? String(item.label).slice(0, 32) : undefined,
    };
  });
}

export function loadLocalScenes(): LocalScenePreset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_PRESETS).map((p) => ({
      sceneId: String(p.sceneId || '').slice(0, 48),
      ownerUid: '' as const,
      roomName: String(p.roomName || '未命名方案').slice(0, 48),
      mapId: p.mapId as MapId,
      furniture: sanitizeFurniture(p.furniture),
      defaultVideoUrl: String(p.defaultVideoUrl || '').slice(0, 512),
      isPublic: false,
      createdAt: Number(p.createdAt) || Date.now(),
      updatedAt: Number(p.updatedAt) || Date.now(),
    }));
  } catch {
    return [];
  }
}

function persist(list: LocalScenePreset[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_PRESETS)));
  } catch {
    /* 隐私模式或超配额，忽略 */
  }
}

export function saveLocalScene(preset: {
  roomName: string;
  mapId: MapId;
  furniture: FurnitureItem[];
  defaultVideoUrl: string;
}): LocalScenePreset[] {
  const list = loadLocalScenes();
  const now = Date.now();
  const entry: LocalScenePreset = {
    sceneId: `local_${now.toString(36)}`,
    ownerUid: '',
    roomName: (preset.roomName.trim() || '我的共看空间').slice(0, 48),
    mapId: preset.mapId,
    furniture: sanitizeFurniture(preset.furniture),
    defaultVideoUrl: String(preset.defaultVideoUrl || '').slice(0, 512),
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  };
  // 同名方案覆盖，避免点几次存一堆重名的
  const next = [entry, ...list.filter((s) => s.roomName !== entry.roomName)];
  persist(next);
  return next.slice(0, MAX_PRESETS);
}

export function deleteLocalScene(sceneId: string): LocalScenePreset[] {
  const next = loadLocalScenes().filter((s) => s.sceneId !== sceneId);
  persist(next);
  return next;
}
