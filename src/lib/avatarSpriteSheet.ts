import { AvatarConfig } from '../types/metaverse';

export const DEFAULT_SPRITE_SHEET_URL =
  '/assets/aistudio/Gemini_Generated_Image_15e9pb15e9pb15e9_6cfd094f.png';

export interface SpriteFrame {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** 躯干/双脚中心相对于源矩形左边缘的 X 锚点，保证转身与迈步零左右抖动 */
  anchorX: number;
  /** 脚底相对于源矩形顶部的 Y 锚点 */
  anchorY: number;
}

/**
 * 精准测量自 Gemini_Generated_Image_15e9pb15e9pb15e9_6cfd094f.png (808×1312 RGBA) 的各帧裁剪坐标。
 * 第 1 行：正面待机 ×3 + 背面待机 ×1（独立透明底，无邻行接触）
 * 第 2 行：左侧待机 ×2 + 右侧待机 ×2
 * 第 4 行：正面行走 ×4（清理顶部 4px 邻行鞋底边角后完整保留帽扣）
 * 第 5 行：左侧行走 ×2 + 右侧行走 ×2
 * 第 6 行：背面行走 ×4
 */
export const SPRITE_FRAMES = {
  frontIdle: [
    { sx: 26, sy: 14, sw: 143, sh: 222, anchorX: 75.3, anchorY: 222 },
    { sx: 230, sy: 14, sw: 143, sh: 222, anchorX: 75.3, anchorY: 222 },
    { sx: 435, sy: 14, sw: 142, sh: 222, anchorX: 75.0, anchorY: 222 },
  ] as readonly SpriteFrame[],
  backIdle: [
    { sx: 650, sy: 15, sw: 142, sh: 220, anchorX: 66.5, anchorY: 220 },
  ] as readonly SpriteFrame[],
  leftIdle: [
    { sx: 25, sy: 239, sw: 148, sh: 238, anchorX: 79.2, anchorY: 238 },
    { sx: 228, sy: 239, sw: 147, sh: 238, anchorX: 78.9, anchorY: 238 },
  ] as readonly SpriteFrame[],
  rightIdle: [
    { sx: 441, sy: 239, sw: 147, sh: 238, anchorX: 67.3, anchorY: 238 },
    { sx: 644, sy: 239, sw: 147, sh: 238, anchorX: 67.1, anchorY: 238 },
  ] as readonly SpriteFrame[],
  frontWalk: [
    { sx: 30, sy: 675, sw: 134, sh: 202, anchorX: 70.7, anchorY: 202 },
    { sx: 234, sy: 675, sw: 134, sh: 201, anchorX: 71.0, anchorY: 201 },
    { sx: 438, sy: 675, sw: 135, sh: 202, anchorX: 71.0, anchorY: 202 },
    { sx: 643, sy: 675, sw: 134, sh: 201, anchorX: 70.7, anchorY: 201 },
  ] as readonly SpriteFrame[],
  leftWalk: [
    { sx: 23, sy: 877, sw: 143, sh: 225, anchorX: 79.9, anchorY: 225 },
    { sx: 225, sy: 877, sw: 144, sh: 225, anchorX: 79.9, anchorY: 225 },
  ] as readonly SpriteFrame[],
  rightWalk: [
    { sx: 445, sy: 878, sw: 143, sh: 224, anchorX: 61.9, anchorY: 224 },
    { sx: 649, sy: 877, sw: 143, sh: 225, anchorX: 63.3, anchorY: 225 },
  ] as readonly SpriteFrame[],
  backWalk: [
    { sx: 46, sy: 1103, sw: 124, sh: 204, anchorX: 55.6, anchorY: 204 },
    { sx: 250, sy: 1103, sw: 124, sh: 204, anchorX: 56.2, anchorY: 204 },
    { sx: 444, sy: 1103, sw: 133, sh: 204, anchorX: 66.3, anchorY: 204 },
    { sx: 655, sy: 1103, sw: 127, sh: 200, anchorX: 59.6, anchorY: 200 },
  ] as readonly SpriteFrame[],
};

/**
 * 判断当前角色配置是否为默认原图形象（未修改发型/五官/服饰/配饰/颜色）。
 * 默认形象直接使用上传的 PNG 精灵图序列帧渲染，100% 还原原图观感；
 * 一旦用户在换装面板自定义任意外观项，则自动切换到同风格的模块换装渲染器。
 */
export function isDefaultSpriteAvatar(avatar: AvatarConfig): boolean {
  return (
    (avatar.skinColor || '').toUpperCase() === '#FCE2D4' &&
    avatar.hairStyle === 'bob' &&
    (avatar.hairColor || '').toUpperCase() === '#FFE338' &&
    avatar.eyeStyle === 'rainbow' &&
    avatar.outfitStyle === 'pleated' &&
    (avatar.outfitColor || '').toUpperCase() === '#4589E8' &&
    avatar.accessory === 'cap'
  );
}

/**
 * 根据朝向、是否行走与时间，从原图精灵表中挑选最流畅自然的序列帧。
 */
export function selectSpriteFrame(
  dir: 'down' | 'up' | 'left' | 'right',
  isMoving: boolean,
  isSitting: boolean,
  timeMs: number
): SpriteFrame {
  if (isSitting || !isMoving) {
    if (dir === 'up') {
      return SPRITE_FRAMES.backIdle[0];
    }
    if (dir === 'left') {
      const idx = Math.floor(timeMs / 480) % SPRITE_FRAMES.leftIdle.length;
      return SPRITE_FRAMES.leftIdle[idx];
    }
    if (dir === 'right') {
      const idx = Math.floor(timeMs / 480) % SPRITE_FRAMES.rightIdle.length;
      return SPRITE_FRAMES.rightIdle[idx];
    }
    // 正面待机：柔和循环 3 帧
    const idx = Math.floor(timeMs / 420) % SPRITE_FRAMES.frontIdle.length;
    return SPRITE_FRAMES.frontIdle[idx];
  }

  // 行走周期：约 7.2 帧/秒（138ms/帧），步态轻快顺滑
  const stepIdx = Math.floor(timeMs / 138) % 4;

  if (dir === 'up') {
    return SPRITE_FRAMES.backWalk[stepIdx];
  }
  if (dir === 'left') {
    // 穿插站立过渡帧形成 4 拍完整迈步周期：迈左 -> 过渡 -> 迈右 -> 过渡
    const seq = [
      SPRITE_FRAMES.leftWalk[0],
      SPRITE_FRAMES.leftIdle[0],
      SPRITE_FRAMES.leftWalk[1],
      SPRITE_FRAMES.leftIdle[1],
    ];
    return seq[stepIdx];
  }
  if (dir === 'right') {
    const seq = [
      SPRITE_FRAMES.rightWalk[0],
      SPRITE_FRAMES.rightIdle[0],
      SPRITE_FRAMES.rightWalk[1],
      SPRITE_FRAMES.rightIdle[1],
    ];
    return seq[stepIdx];
  }

  // 正面行走：穿插站立过渡帧让前后步伐切换更自然连贯
  const seq = [
    SPRITE_FRAMES.frontWalk[0],
    SPRITE_FRAMES.frontIdle[0],
    SPRITE_FRAMES.frontWalk[2],
    SPRITE_FRAMES.frontIdle[2],
  ];
  return seq[stepIdx];
}

/* ─────────────────────────── 浏览器图片加载与接缝清理缓存 ─────────────────────────── */

let cachedSheet: HTMLCanvasElement | HTMLImageElement | null = null;
let loadState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';

function buildCleanSheetCanvas(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  if (typeof document === 'undefined') return img;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 808;
    canvas.height = img.naturalHeight || 1312;
    const cctx = canvas.getContext('2d');
    if (!cctx) return img;
    cctx.drawImage(img, 0, 0);

    // 精准清理第 4 行 (frontWalk) 顶部与第 3 行鞋底相接的极少量边角像素，同时完整保留帽扣与帽顶弧线
    const row3CapCenters = [101, 305, 510, 715];
    for (const cx of row3CapCenters) {
      // y=674..675：仅保留中间 10px 帽扣顶边，彻底清掉两侧第 3 行鞋底残边
      cctx.clearRect(cx - 44, 674, 39, 2);
      cctx.clearRect(cx + 5, 674, 39, 2);
      // y=676：清掉帽顶轮廓外侧残留的蓝色鞋角
      cctx.clearRect(cx - 44, 676, 28, 1);
      cctx.clearRect(cx + 16, 676, 28, 1);
      // y=677：清掉最外侧鞋缘残点
      cctx.clearRect(cx - 44, 677, 24, 1);
      cctx.clearRect(cx + 20, 677, 24, 1);
    }
    return canvas;
  } catch {
    return img;
  }
}

export function getLoadedSpriteSheet(): HTMLCanvasElement | HTMLImageElement | null {
  if (cachedSheet) return cachedSheet;
  if (typeof Image === 'undefined') return null;
  if (loadState === 'idle') {
    loadState = 'loading';
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      cachedSheet = buildCleanSheetCanvas(img);
      loadState = 'ready';
    };
    img.onerror = () => {
      loadState = 'error';
    };
    img.src = DEFAULT_SPRITE_SHEET_URL;
  }
  return null;
}

if (typeof window !== 'undefined') {
  getLoadedSpriteSheet();
}

/**
 * 直接将上传的精灵图对应帧渲染到画布上，统一归一化高度与脚底锚点，并叠加呼吸/步伐微弹性。
 * 返回 true 表示已使用原图渲染；若图片仍在首帧加载中返回 false 由调用方临时兜底。
 */
export function drawSpriteSheetAvatar(
  ctx: CanvasRenderingContext2D,
  dir: 'down' | 'up' | 'left' | 'right',
  isMoving: boolean,
  isSitting: boolean,
  timeMs: number,
  rootBouncePx: number,
  rootSx: number,
  rootSy: number
): boolean {
  const sheet = getLoadedSpriteSheet();
  if (!sheet) return false;

  const frame = selectSpriteFrame(dir, isMoving, isSitting, timeMs);
  // 统一所有方向与待机/行走帧的渲染高度（约 72px，和地图沙发/舞台比例严丝合缝）
  const targetHeight = 72;
  const scale = targetHeight / frame.sh;
  const drawW = frame.sw * scale;
  const drawH = targetHeight;
  const drawX = -frame.anchorX * scale;
  const footY = 16.5;
  const drawY = footY - frame.anchorY * scale;

  ctx.save();
  ctx.translate(0, rootBouncePx + (isSitting ? 4.5 : 0));
  // 以脚底中心为缩放支点做极其克制的呼吸与步伐弹性
  ctx.translate(0, footY);
  ctx.scale(rootSx, rootSy);
  if (isMoving && !isSitting) {
    const tilt = Math.sin((timeMs / 138) * (Math.PI / 2)) * 0.028;
    ctx.rotate(tilt);
  }
  ctx.translate(0, -footY);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sheet, frame.sx, frame.sy, frame.sw, frame.sh, drawX, drawY, drawW, drawH);
  ctx.restore();
  return true;
}
