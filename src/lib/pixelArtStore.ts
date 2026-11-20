/**
 * 房间里挂的像素画存在本机 localStorage（跟点播记录、场景方案一个思路，不做账号）。
 * 画作本身是 32×32 的 PNG dataURL，通常 1KB 上下，塞进 scene:update 的 furniture 里
 * 也不会把 WS 消息撑大。
 */

export interface PixelArt {
  id: string;
  title: string;
  dataUrl: string;
  at: number;
}

const KEY = 'koko_pixel_arts';
const MAX_ARTS = 24;

export function loadPixelArts(): PixelArt[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((a) => a && typeof a.dataUrl === 'string' && a.dataUrl.startsWith('data:image/'))
      .slice(0, MAX_ARTS);
  } catch {
    return [];
  }
}

export function savePixelArt(input: { title: string; dataUrl: string }): PixelArt[] {
  const list = loadPixelArts();
  const art: PixelArt = {
    id: `art_${Date.now().toString(36)}`,
    title: input.title.slice(0, 24) || '无名像素画',
    dataUrl: input.dataUrl,
    at: Date.now(),
  };
  const next = [art, ...list].slice(0, MAX_ARTS);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 配额满了就只留内存里的结果，别让挂画流程中断
  }
  return next;
}

export function removePixelArt(id: string): PixelArt[] {
  const next = loadPixelArts().filter((a) => a.id !== id);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
