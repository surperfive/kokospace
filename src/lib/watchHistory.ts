/**
 * 本机点播记录
 *
 * 没有账号体系，所以按「这台设备」记。同一台电脑/手机上，谁点播过什么都在这里，
 * 换设备不会同步，也不需要登录。存的是规范地址，点一下能直接重新入队。
 */

import type { VideoSourceType } from '../types/metaverse';

const KEY = 'koko_watch_history';
const MAX_ITEMS = 40;

export interface WatchHistoryItem {
  /** 规范地址（B 站短链会被解析成 /video/BVxxx），能直接重新入队 */
  url: string;
  title: string;
  sourceType: VideoSourceType;
  thumbnail?: string;
  durationSec?: number;
  playedAt: number;
}

export function loadWatchHistory(): WatchHistoryItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((it) => it && typeof it.url === 'string' && it.url.length > 0)
      .slice(0, MAX_ITEMS)
      .map((it) => ({
        url: String(it.url).slice(0, 1024),
        title: String(it.title || '未命名影片').slice(0, 80),
        sourceType: (it.sourceType || 'mp4') as VideoSourceType,
        thumbnail: typeof it.thumbnail === 'string' ? it.thumbnail.slice(0, 512) : undefined,
        durationSec: typeof it.durationSec === 'number' ? it.durationSec : undefined,
        playedAt: Number(it.playedAt) || Date.now(),
      }));
  } catch {
    return [];
  }
}

function persist(list: WatchHistoryItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ITEMS)));
  } catch {
    /* 隐私模式或超配额，忽略 */
  }
}

/** 同一个地址只留最新一条，放到最前面 */
export function pushWatchHistory(item: Omit<WatchHistoryItem, 'playedAt'>): WatchHistoryItem[] {
  const next: WatchHistoryItem[] = [
    { ...item, playedAt: Date.now() },
    ...loadWatchHistory().filter((it) => it.url !== item.url),
  ].slice(0, MAX_ITEMS);
  persist(next);
  return next;
}

export function removeWatchHistory(url: string): WatchHistoryItem[] {
  const next = loadWatchHistory().filter((it) => it.url !== url);
  persist(next);
  return next;
}

export function clearWatchHistory(): WatchHistoryItem[] {
  persist([]);
  return [];
}

export function formatHistoryTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}
