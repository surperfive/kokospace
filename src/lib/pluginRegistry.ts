import {
  AvatarPartPluginItem,
  EmojiPackPluginItem,
  KokoPlugin,
  MapThemeDefinition,
  StageWidgetPlugin,
} from '../types/metaverse';
import { BUILTIN_MAPS, BUILTIN_REACTIONS } from '../data/maps';

class KokoPluginRegistry {
  private plugins = new Map<string, KokoPlugin>();
  private enabledIds = new Set<string>();
  private listeners = new Set<() => void>();

  constructor() {
    // Register two community sample plugins (disabled by default or toggleable in Docs/Plugin Hub)
    this.register(COMMUNITY_POMODORO_PLUGIN, false);
    this.register(COMMUNITY_RETRO_PACK_PLUGIN, false);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  register(plugin: KokoPlugin, enableImmediately = true) {
    this.plugins.set(plugin.id, plugin);
    if (enableImmediately) {
      this.enabledIds.add(plugin.id);
    }
    this.emit();
  }

  toggle(pluginId: string) {
    if (!this.plugins.has(pluginId)) return;
    if (this.enabledIds.has(pluginId)) {
      this.enabledIds.delete(pluginId);
    } else {
      this.enabledIds.add(pluginId);
    }
    this.emit();
  }

  isEnabled(pluginId: string): boolean {
    return this.enabledIds.has(pluginId);
  }

  getAllPlugins(): Array<{ plugin: KokoPlugin; enabled: boolean }> {
    return Array.from(this.plugins.values()).map((plugin) => ({
      plugin,
      enabled: this.enabledIds.has(plugin.id),
    }));
  }

  getActiveMaps(): MapThemeDefinition[] {
    const extraMaps: MapThemeDefinition[] = [];
    for (const id of this.enabledIds) {
      const p = this.plugins.get(id);
      if (p?.maps) extraMaps.push(...p.maps);
    }
    return [...BUILTIN_MAPS, ...extraMaps];
  }

  getActiveReactions(): EmojiPackPluginItem[] {
    const extra: EmojiPackPluginItem[] = [];
    for (const id of this.enabledIds) {
      const p = this.plugins.get(id);
      if (p?.emojiPacks) extra.push(...p.emojiPacks);
    }
    return [...BUILTIN_REACTIONS, ...extra];
  }

  getActiveAvatarParts(): AvatarPartPluginItem[] {
    const extra: AvatarPartPluginItem[] = [];
    for (const id of this.enabledIds) {
      const p = this.plugins.get(id);
      if (p?.avatarParts) extra.push(...p.avatarParts);
    }
    return extra;
  }

  getActiveWidgets(): StageWidgetPlugin[] {
    const widgets: StageWidgetPlugin[] = [];
    for (const id of this.enabledIds) {
      const p = this.plugins.get(id);
      if (p?.widgets) widgets.push(...p.widgets);
    }
    return widgets;
  }
}

export const COMMUNITY_POMODORO_PLUGIN: KokoPlugin = {
  id: 'community-cowatch-timer',
  name: '共看番茄钟与场记挂件',
  version: '1.2.0',
  author: 'KokoCommunity',
  description: '在中央巨幕右上角挂载一个轻量级观影专注计时器，适合读书会与自习共看房间。',
  widgets: [
    {
      id: 'pomodoro-badge',
      title: '自习倒计时',
      renderBadgeText: () => {
        const now = new Date();
        const rem = 25 - (now.getMinutes() % 25);
        return `专注周期 · 剩余 ${String(rem).padStart(2, '0')} 分钟`;
      },
    },
  ],
};

export const COMMUNITY_RETRO_PACK_PLUGIN: KokoPlugin = {
  id: 'community-festival-pack',
  name: '社区派对拓展包（地图 + 表情 + 配饰）',
  version: '1.0.4',
  author: 'Studio Koko',
  description: '新增「午夜露台派对」扩展地图、4 个派对反应表情及「小皇冠」Q版头饰。',
  emojiPacks: [
    { emoji: '🎉', label: '撒花' },
    { emoji: '🥂', label: '干杯' },
    { emoji: '🎸', label: 'Solo' },
    { emoji: '🌙', label: '晚安' },
  ],
  avatarParts: [
    { category: 'accessory', id: 'crown', label: '派对小皇冠' },
  ],
  maps: [
    {
      id: 'midnight-patio-plugin',
      name: '午夜星海露台（插件扩展）',
      subtitle: '深蓝夜幕 · 暖金灯串 · 社区扩展示例',
      coverImage: '/src/assets/images/map_rooftop_cinema_1794673853273.jpg',
      worldWidth: 1600,
      worldHeight: 1050,
      palette: {
        ground: '#1E2433',
        groundAccent: '#273043',
        gridLine: 'rgba(148, 163, 184, 0.12)',
        wall: '#0F172A',
        wallTrim: '#475569',
        stageFloor: '#2B354B',
        stageBorder: '#F59E0B',
        seatingZone: 'rgba(245, 158, 11, 0.08)',
        loungeZone: 'rgba(56, 189, 248, 0.08)',
        screenFrame: '#090D16',
        accent: '#F59E0B',
      },
      screenRect: { x: 460, y: 120, width: 680, height: 340 },
      spawnPoint: { x: 800, y: 800 },
      zones: [
        { id: 'stage', label: '星夜舞台 (全员广播)', type: 'stage', x: 520, y: 470, width: 560, height: 74 },
        { id: 'seating', label: '星夜观影区', type: 'seating', x: 540, y: 555, width: 520, height: 210 },
      ],
      defaultFurniture: [
        { id: 'p1', type: 'rug_geo', x: 800, y: 630 },
        { id: 'p2', type: 'sofa_coral', x: 700, y: 600, sittable: true, label: '星夜沙发' },
        { id: 'p3', type: 'sofa_coral', x: 900, y: 600, sittable: true, label: '星夜沙发' },
        { id: 'p4', type: 'lamp_warm', x: 480, y: 620 },
        { id: 'p5', type: 'lamp_warm', x: 1120, y: 620 },
      ],
      obstacles: [{ x: 460, y: 120, width: 680, height: 340 }],
    },
  ],
};

export const pluginRegistry = new KokoPluginRegistry();
