import { AvatarConfig } from '../types/metaverse';

export const USER_LAYERS_BASE_PATH = '/assets/avatar-parts/user-layers';
export const PACKS_BASE_PATH = '/assets/avatar-parts/packs';

export const PAPER_DOLL_HAIR_IDS = [
  'bob',
  'sailor',
  'explorer',
  'punk',
  'punkBandana',
  'wuxia',
] as const;
export type PaperDollHairId = (typeof PAPER_DOLL_HAIR_IDS)[number];

export const PAPER_DOLL_EYE_IDS = [
  'rainbow',
  'happy',
  'surprised',
  'sailor',
  'sailorHappy',
  'explorer',
  'punk',
  'punkGrin',
  'punkSerious',
] as const;
export type PaperDollEyeId = (typeof PAPER_DOLL_EYE_IDS)[number];

export const PAPER_DOLL_OUTFIT_IDS = [
  'pleated',
  'sailor',
  'explorer',
  'punk',
  'wuxia',
] as const;
export type PaperDollOutfitId = (typeof PAPER_DOLL_OUTFIT_IDS)[number];

export const PAPER_DOLL_ACCESSORY_IDS = ['cap', 'none'] as const;
export type PaperDollAccessoryId = (typeof PAPER_DOLL_ACCESSORY_IDS)[number];

export type PaperDollView = 'front' | 'left' | 'right' | 'back';

export function normalizeHairId(id: string | undefined): PaperDollHairId {
  if (id === 'sailor' || id === 'bun') return 'sailor';
  if (id === 'explorer' || id === 'wavy' || id === 'sidepart') return 'explorer';
  if (id === 'punk' || id === 'spiky' || id === 'short') return 'punk';
  if (id === 'punkBandana') return 'punkBandana';
  if (id === 'wuxia') return 'wuxia';
  return 'bob';
}

export function normalizeEyeId(id: string | undefined): PaperDollEyeId {
  if (id === 'happy') return 'happy';
  if (id === 'surprised') return 'surprised';
  if (id === 'sailor' || id === 'smile' || id === 'gentle') return 'sailor';
  if (id === 'sailorHappy' || id === 'wink') return 'sailorHappy';
  if (id === 'explorer' || id === 'star') return 'explorer';
  if (id === 'punk' || id === 'cool') return 'punk';
  if (id === 'punkGrin') return 'punkGrin';
  if (id === 'punkSerious') return 'punkSerious';
  return 'rainbow';
}

export function normalizeOutfitId(id: string | undefined): PaperDollOutfitId {
  if (id === 'sailor' || id === 'blazer' || id === 'dress') return 'sailor';
  if (id === 'explorer' || id === 'overalls' || id === 'knit') return 'explorer';
  if (id === 'punk' || id === 'hoodie' || id === 'techwear') return 'punk';
  if (id === 'wuxia') return 'wuxia';
  return 'pleated';
}

export function normalizeAccessoryId(id: string | undefined): PaperDollAccessoryId {
  if (id === 'none' || id === 'glasses') return 'none';
  return 'cap';
}

export interface ResolvedPaperDollParts {
  dir: 'down' | 'up' | 'left' | 'right';
  view: PaperDollView;
  mirrorSideAssets: boolean;
  /** 第 1 层：服装与身体（全部 5 套均为完整 24 帧拆分层或用户自定义 PNG） */
  useUserBody: boolean;
  bodyPose: string;
  bodyUrl: string;
  outfitId: PaperDollOutfitId;
  outfitUrl: string | null;
  /** 第 2 层：头部与五官（全部 9 种均为 4 向原生头脸拆分层或用户自定义 PNG） */
  headUrl: string;
  eyeId: PaperDollEyeId;
  eyeOverlayUrl: string | null;
  /** 第 3 层：发型与帽子（全部 6 款均为 4 向开放脸部镂空发帽拆分层或用户自定义 PNG） */
  useUserHairCap: boolean;
  hairId: PaperDollHairId;
  hairUrl: string;
  accessoryId: PaperDollAccessoryId;
  accessoryUrl: string | null;
  /** 用户自定义上传的图层标记 */
  hasCustomBody: boolean;
  hasCustomHead: boolean;
  hasCustomHairCap: boolean;
}

function getBodyBaseDir(outfitId: PaperDollOutfitId): string {
  return outfitId === 'pleated'
    ? `${USER_LAYERS_BASE_PATH}/body`
    : `${PACKS_BASE_PATH}/${outfitId}/body`;
}

function getHeadUrlForEye(eyeId: PaperDollEyeId, dir: 'down' | 'up' | 'left' | 'right'): string {
  if (dir === 'up') {
    if (eyeId === 'sailor' || eyeId === 'sailorHappy') {
      return `${PACKS_BASE_PATH}/sailor/head/back_blank.png`;
    }
    if (eyeId === 'explorer') {
      return `${PACKS_BASE_PATH}/explorer/head/back_blank.png`;
    }
    if (eyeId === 'punk' || eyeId === 'punkGrin' || eyeId === 'punkSerious') {
      return `${PACKS_BASE_PATH}/punk/head/back_blank.png`;
    }
    return `${USER_LAYERS_BASE_PATH}/head/back_blank.png`;
  }

  const side = dir === 'down' ? 'front' : dir;
  switch (eyeId) {
    case 'rainbow':
      return `${USER_LAYERS_BASE_PATH}/head/${side}_rainbow.png`;
    case 'happy':
      return dir === 'down'
        ? `${USER_LAYERS_BASE_PATH}/head/front_happy.png`
        : `${USER_LAYERS_BASE_PATH}/head/${side}_rainbow.png`;
    case 'surprised':
      return dir === 'down'
        ? `${USER_LAYERS_BASE_PATH}/head/front_surprised.png`
        : `${USER_LAYERS_BASE_PATH}/head/${side}_rainbow.png`;
    case 'sailor':
      return `${PACKS_BASE_PATH}/sailor/head/${side}_gentle.png`;
    case 'sailorHappy':
      return `${PACKS_BASE_PATH}/sailor/head/${side}_happy.png`;
    case 'explorer':
      return `${PACKS_BASE_PATH}/explorer/head/${side}_happy.png`;
    case 'punk':
      return `${PACKS_BASE_PATH}/punk/head/${side}_smile.png`;
    case 'punkGrin':
      return `${PACKS_BASE_PATH}/punk/head/${side}_grin.png`;
    case 'punkSerious':
      return `${PACKS_BASE_PATH}/punk/head/${side}_serious.png`;
  }
}

function getHairCapUrl(hairId: PaperDollHairId, dir: 'down' | 'up' | 'left' | 'right'): string {
  const dirName = dir === 'down' ? 'front' : dir === 'up' ? 'back' : dir;
  switch (hairId) {
    case 'bob':
      return `${USER_LAYERS_BASE_PATH}/haircap/${dirName}.png`;
    case 'sailor':
      return `${PACKS_BASE_PATH}/sailor/haircap/${dirName}.png`;
    case 'explorer':
      return `${PACKS_BASE_PATH}/explorer/haircap/${dirName}.png`;
    case 'punk':
      return `${PACKS_BASE_PATH}/punk/haircap/${dirName}.png`;
    case 'punkBandana':
      return `${PACKS_BASE_PATH}/punk/haircap/bandana_${dirName}.png`;
    case 'wuxia':
      return `${PACKS_BASE_PATH}/wuxia/haircap/${dirName}.png`;
  }
}

/**
 * 纯函数：将角色配置、朝向与动画帧解析为 3 层独立可替换的 PNG 部件路径。
 * 全部 5 套服装、6 款发型帽子与 9 种表情均采用统一画风的 4 向 24 帧拆分素材。
 */
export function resolvePaperDollParts(
  avatar: AvatarConfig,
  dir: 'down' | 'up' | 'left' | 'right',
  isMoving: boolean,
  isSitting: boolean,
  _isCarrying: boolean,
  timeMs: number
): ResolvedPaperDollParts {
  const view: PaperDollView = dir === 'up' ? 'back' : dir === 'down' ? 'front' : dir;
  const mirrorSideAssets = dir === 'right';
  const stepIdx = Math.floor(timeMs / 138) % 4;
  const idleIdx = Math.floor(timeMs / 440);

  const hairId = normalizeHairId(avatar.hairStyle);
  const eyeId = normalizeEyeId(avatar.eyeStyle);
  const outfitId = normalizeOutfitId(avatar.outfitStyle);
  const accessoryId = normalizeAccessoryId(avatar.accessory);

  const customBody = avatar.customLayers?.body?.trim() || '';
  const customHead = avatar.customLayers?.head?.trim() || '';
  const customHairCap = avatar.customLayers?.hairCap?.trim() || '';

  // ── Layer 1: 服装与身体（5 套统一 24 帧序列） ──
  let bodyPose = '';
  let bodyUrl = '';
  if (customBody) {
    bodyPose = 'custom_body';
    bodyUrl = customBody;
  } else {
    if (isSitting || !isMoving) {
      if (dir === 'up') bodyPose = 'back_idle_0';
      else if (dir === 'left') bodyPose = `left_idle_${idleIdx % 2}`;
      else if (dir === 'right') bodyPose = `right_idle_${idleIdx % 2}`;
      else bodyPose = `front_idle_${idleIdx % 3}`;
    } else {
      if (dir === 'up') {
        const seq =
          outfitId === 'pleated' || outfitId === 'sailor'
            ? ['back_walk_0', 'back_walk_1', 'back_walk_2', 'back_walk_3']
            : ['back_walk_0', 'back_idle_0', 'back_walk_2', 'back_idle_0'];
        bodyPose = seq[stepIdx];
      } else if (dir === 'left') {
        const seq = ['left_walk_0', 'left_idle_0', 'left_walk_1', 'left_idle_1'];
        bodyPose = seq[stepIdx];
      } else if (dir === 'right') {
        const seq = ['right_walk_0', 'right_idle_0', 'right_walk_1', 'right_idle_1'];
        bodyPose = seq[stepIdx];
      } else {
        const seq =
          outfitId === 'pleated'
            ? ['front_walk_0', 'front_idle_0', 'front_walk_2', 'front_idle_2']
            : ['front_walk_0', 'front_idle_0', 'front_walk_1', 'front_idle_2'];
        bodyPose = seq[stepIdx];
      }
    }
    bodyUrl = `${getBodyBaseDir(outfitId)}/${bodyPose}.png`;
  }

  // ── Layer 2: 头部与五官（9 种原生 4 向头脸） ──
  const headUrl = customHead || getHeadUrlForEye(eyeId, dir);

  // ── Layer 3: 发型与帽子（6 款原生 4 向发帽） ──
  const hairUrl = customHairCap || getHairCapUrl(hairId, dir);

  return {
    dir,
    view,
    mirrorSideAssets,
    useUserBody: !customBody,
    bodyPose,
    bodyUrl,
    outfitId,
    outfitUrl: null,
    headUrl,
    eyeId,
    eyeOverlayUrl: null,
    useUserHairCap: !customHairCap,
    hairId,
    hairUrl,
    accessoryId,
    accessoryUrl: null,
    hasCustomBody: Boolean(customBody),
    hasCustomHead: Boolean(customHead),
    hasCustomHairCap: Boolean(customHairCap),
  };
}

/* ─────────────────────────── 选择性 HSL 分区换色（覆盖全部 5 套素材，保留粗墨线、彩虹眼与白底） ─────────────────────────── */

export type RecolorMode = 'none' | 'body' | 'head' | 'hair' | 'haircap' | 'outfit' | 'accessory';

function parseHexRgb(hex: string): [number, number, number] {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length !== 6) return [69, 137, 232];
  const n = parseInt(clean, 16);
  if (Number.isNaN(n)) return [69, 137, 232];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s <= 0.0001) {
    const v = Math.round(Math.max(0, Math.min(255, l * 255)));
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return [
    Math.round(Math.max(0, Math.min(255, hue2rgb(h + 1 / 3) * 255))),
    Math.round(Math.max(0, Math.min(255, hue2rgb(h) * 255))),
    Math.round(Math.max(0, Math.min(255, hue2rgb(h - 1 / 3) * 255))),
  ];
}

const DEFAULT_SKIN_HEX = '#FCE2D4';
const DEFAULT_HAIR_HEX = '#FFE338';
const DEFAULT_OUTFIT_HEX = '#4589E8';

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function isWarmSkinPixel(r: number, g: number, b: number, h: number, s: number, l: number): boolean {
  return (
    r > 175 &&
    r > g &&
    g >= b &&
    r - b >= 14 &&
    h <= 0.12 &&
    s < 0.85 &&
    l > 0.62
  );
}

/**
 * 纯函数：按区域色相规则对单像素执行换色，完整保护深色描边、纯白高光/袜子与瞳孔五官。
 */
export function recolorPixelByRegion(
  r: number,
  g: number,
  b: number,
  mode: RecolorMode,
  primaryHex: string,
  secondaryHex?: string,
  styleHint?: string
): [number, number, number] {
  // 严格保护所有粗墨线（黑褐描边）
  if (r < 62 && g < 56 && b < 68) {
    return [r, g, b];
  }
  // 严格保护高光与纯白区域（白帽片、白袜、水手服白衣）
  if (r > 224 && g > 224 && b > 224 && Math.max(r, g, b) - Math.min(r, g, b) < 20) {
    return [r, g, b];
  }

  const [h, s, l] = rgbToHsl(r, g, b);

  if (mode === 'body' || mode === 'head') {
    const skinUpper = (primaryHex || DEFAULT_SKIN_HEX).toUpperCase();
    const outfitUpper = (secondaryHex || DEFAULT_OUTFIT_HEX).toUpperCase();

    // 1. 蜜桃肤色区域（精准限定在暖桃色相范围，不误伤腮红/瞳孔）
    if (skinUpper !== DEFAULT_SKIN_HEX && isWarmSkinPixel(r, g, b, h, s, l)) {
      const [tr, tg, tb] = parseHexRgb(skinUpper);
      const [th, ts, tl] = rgbToHsl(tr, tg, tb);
      const shadeDelta = l - 0.88;
      const outL = clamp(tl + shadeDelta * 0.90, 0.28, 0.97);
      const outS = clamp(ts * (0.86 + 0.14 * s), 0.18, 0.92);
      return hslToRgb(th, outS, outL);
    }

    // 2. 身体服饰主色区域（仅在 body 模式换色，支持 5 套服装各自的主色色域）
    if (mode === 'body' && outfitUpper !== DEFAULT_OUTFIT_HEX && !isWarmSkinPixel(r, g, b, h, s, l)) {
      let matchGarment = false;
      if (!styleHint || styleHint === 'pleated' || styleHint === 'sailor') {
        // 蓝 / 藏青色系
        matchGarment = b > r + 14 && b > 76 && l > 0.14 && h > 0.48 && h < 0.76;
      } else if (styleHint === 'wuxia') {
        // 青绿侠客袍（避开棕色腰带与暖肤色）
        matchGarment = (g > r + 8 || b > r + 10) && h > 0.42 && h < 0.64 && l > 0.18;
      } else if (styleHint === 'explorer') {
        // 绿领巾 + 卡其工装（避开皮肤与深褐靴底）
        const isGreenScarf = g > r + 10 && g > b + 6 && h > 0.20 && h < 0.46;
        const isKhakiSuit = r > 125 && g > 100 && r - b > 20 && h > 0.07 && h < 0.18 && l > 0.34 && l < 0.78;
        matchGarment = isGreenScarf || isKhakiSuit;
      } else if (styleHint === 'punk') {
        // 深炭灰皮夹克/牛仔裤（保留高光金属链条与暖肤色）
        matchGarment = s < 0.32 && l >= 0.16 && l <= 0.48;
      }

      if (matchGarment) {
        const [tr, tg, tb] = parseHexRgb(outfitUpper);
        const [th, ts, tl] = rgbToHsl(tr, tg, tb);
        const refL = styleHint === 'punk' ? 0.30 : 0.50;
        const deltaL = l - refL;
        const isLightAccent = l > 0.68;
        const outL = clamp(tl + deltaL * 0.78, 0.10, 0.92);
        const outS = clamp(ts * (isLightAccent ? 0.72 : 0.95), 0.05, 0.96);
        return hslToRgb(th, outS, outL);
      }
    }
    return [r, g, b];
  }

  if (mode === 'hair' || mode === 'haircap') {
    const hairUpper = (primaryHex || DEFAULT_HAIR_HEX).toUpperCase();
    const capUpper = (secondaryHex || DEFAULT_OUTFIT_HEX).toUpperCase();

    // 1. 头发区域（按不同套装底发色精准匹配，避免误染帽檐/护目镜/发带）
    if (hairUpper !== DEFAULT_HAIR_HEX) {
      let matchHair = false;
      if (!styleHint || styleHint === 'bob') {
        matchHair = r > 125 && g > 78 && r - b > 20 && l > 0.22;
      } else if (styleHint === 'explorer') {
        // 亮橘发色（保护米色卡其探险帽：橘发饱和度更高 s > 0.42）
        matchHair = r > 150 && r - b > 50 && h < 0.11 && s > 0.42 && l > 0.25 && l < 0.78;
      } else if (styleHint === 'sailor') {
        // 栗棕发色（保护藏青蝴蝶结与白水手帽）
        matchHair = r > 86 && g > 56 && r > b + 16 && h < 0.14 && s > 0.16 && l > 0.22 && l < 0.66;
      } else if (styleHint === 'punk' || styleHint === 'punkBandana') {
        // 暗红挑染 + 深棕发丝（保护蓝灰头巾与银灰护目镜）
        const isCrimsonTips = r > 90 && r - g > 22 && (h < 0.07 || h > 0.90) && s > 0.26;
        const isDarkBrownHair = r > 66 && r > b + 8 && h < 0.12 && l > 0.16 && l < 0.42;
        matchHair = isCrimsonTips || isDarkBrownHair;
      } else if (styleHint === 'wuxia') {
        // 深褐高马尾（严格保护大红丝带 r - g > 48 与暖肤耳）
        const isRedRibbon = r > 115 && r - g > 42 && (h < 0.06 || h > 0.92);
        matchHair = !isRedRibbon && !isWarmSkinPixel(r, g, b, h, s, l) && l >= 0.15 && l <= 0.46;
      }

      if (matchHair) {
        const [tr, tg, tb] = parseHexRgb(hairUpper);
        const [th, ts, tl] = rgbToHsl(tr, tg, tb);
        const refL =
          styleHint === 'wuxia' || styleHint === 'punk' || styleHint === 'punkBandana'
            ? 0.30
            : styleHint === 'sailor'
              ? 0.44
              : 0.56;
        const lumFactor = clamp((l - refL) / 0.28, -0.75, 0.95);
        const contrastAmp = clamp(0.18 * (1 - Math.abs(tl - 0.5) * 0.65), 0.10, 0.20);
        const outL = clamp(tl + lumFactor * contrastAmp, 0.08, 0.96);
        const outS = clamp(ts * (l > 0.78 ? 0.72 : 1.0), 0.04, 0.95);
        return hslToRgb(th, outS, outL);
      }
    }

    // 2. 发帽层上的帽子/头饰主色区域（跟随服饰主题色）
    if (mode === 'haircap' && capUpper !== DEFAULT_OUTFIT_HEX) {
      let matchCap = false;
      if (!styleHint || styleHint === 'bob' || styleHint === 'sailor') {
        // 鸭舌帽蓝帽片 / 水手帽藏青蝴蝶结
        matchCap = b > r + 18 && b > 82 && l > 0.16 && h > 0.48 && h < 0.76;
      } else if (styleHint === 'explorer') {
        // 探险帽米色帽身（低中饱和度暖黄，不误染高饱和橘发）
        matchCap = r > 145 && g > 125 && r - b > 16 && h >= 0.09 && h <= 0.18 && s <= 0.44 && l > 0.45;
      } else if (styleHint === 'wuxia') {
        // 古风红发带随服饰色联动
        matchCap = r > 115 && r - g > 42 && (h < 0.06 || h > 0.92);
      } else if (styleHint === 'punk' || styleHint === 'punkBandana') {
        // 朋克头巾深蓝灰织带
        matchCap = b >= r && s > 0.06 && s < 0.32 && l >= 0.18 && l <= 0.44;
      }

      if (matchCap) {
        const [tr, tg, tb] = parseHexRgb(capUpper);
        const [th, ts, tl] = rgbToHsl(tr, tg, tb);
        const deltaL = l - 0.50;
        const outL = clamp(tl + deltaL * 0.80, 0.10, 0.92);
        const outS = clamp(ts * (l > 0.68 ? 0.72 : 1.0), 0.05, 0.96);
        return hslToRgb(th, outS, outL);
      }
    }
    return [r, g, b];
  }

  return [r, g, b];
}

/* ─────────────────────────── 图片加载、白底清理与换色离屏缓存 ─────────────────────────── */

const rawImageCache = new Map<string, HTMLImageElement | 'loading' | 'error'>();
const tintedCanvasCache = new Map<string, HTMLCanvasElement>();
const MAX_TINT_CACHE = 260;

function getRawPartImage(url: string): HTMLImageElement | null {
  const existing = rawImageCache.get(url);
  if (existing && existing !== 'loading' && existing !== 'error') {
    return existing;
  }
  if (existing === 'loading' || existing === 'error') return null;
  if (typeof Image === 'undefined') return null;

  rawImageCache.set(url, 'loading');
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    rawImageCache.set(url, img);
  };
  img.onerror = () => {
    rawImageCache.set(url, 'error');
  };
  img.src = url;
  return null;
}

/**
 * 若用户通过「自定义替换」上传了白底图片，自动对其四角连通纯白背景执行边缘透明化处理。
 */
function stripWhiteBgIfOpaque(imgData: ImageData) {
  const { width: w, height: h, data } = imgData;
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, (h * w - 1) * 4];
  const opaqueWhiteCorners = corners.filter(
    (idx) => data[idx + 3] > 240 && data[idx] > 238 && data[idx + 1] > 238 && data[idx + 2] > 238
  ).length;
  if (opaqueWhiteCorners < 3) return;

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  const tryPush = (x: number, y: number) => {
    const p = y * w + x;
    if (visited[p]) return;
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= 234 && g >= 234 && b >= 234 && Math.max(r, g, b) - Math.min(r, g, b) <= 22) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }
  while (head < tail) {
    const p = queue[head++];
    data[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) tryPush(x - 1, y);
    if (x + 1 < w) tryPush(x + 1, y);
    if (y > 0) tryPush(x, y - 1);
    if (y + 1 < h) tryPush(x, y + 1);
  }
}

function getTintedPart(
  url: string,
  mode: RecolorMode,
  primaryHex: string,
  secondaryHex?: string,
  isCustomUpload = false,
  styleHint?: string
): HTMLCanvasElement | HTMLImageElement | null {
  const img = getRawPartImage(url);
  if (!img) return null;

  const pHex = (primaryHex || '').toUpperCase();
  const sHex = (secondaryHex || '').toUpperCase();
  const skipRecolor =
    !isCustomUpload &&
    (mode === 'none' ||
      (mode === 'body' && pHex === DEFAULT_SKIN_HEX && sHex === DEFAULT_OUTFIT_HEX) ||
      (mode === 'head' && pHex === DEFAULT_SKIN_HEX) ||
      (mode === 'hair' && pHex === DEFAULT_HAIR_HEX) ||
      (mode === 'haircap' && pHex === DEFAULT_HAIR_HEX && sHex === DEFAULT_OUTFIT_HEX));

  if (skipRecolor || typeof document === 'undefined') {
    return img;
  }

  const cacheKey = `${url}|${mode}|${pHex}|${sHex}|${styleHint || ''}|${isCustomUpload ? 1 : 0}`;
  const cached = tintedCanvasCache.get(cacheKey);
  if (cached) return cached;

  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const cctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!cctx) return img;
    cctx.drawImage(img, 0, 0);
    const imgData = cctx.getImageData(0, 0, w, h);

    if (isCustomUpload) {
      stripWhiteBgIfOpaque(imgData);
    }

    if (mode !== 'none' && !isCustomUpload) {
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 12) continue;
        const [nr, ng, nb] = recolorPixelByRegion(
          data[i],
          data[i + 1],
          data[i + 2],
          mode,
          pHex,
          sHex,
          styleHint
        );
        data[i] = nr;
        data[i + 1] = ng;
        data[i + 2] = nb;
      }
    }

    cctx.putImageData(imgData, 0, 0);
    if (tintedCanvasCache.size >= MAX_TINT_CACHE) {
      const oldestKey = tintedCanvasCache.keys().next().value;
      if (oldestKey) tintedCanvasCache.delete(oldestKey);
    }
    tintedCanvasCache.set(cacheKey, canvas);
    return canvas;
  } catch {
    return img;
  }
}

/* ─────────────────────────── 统一 268px 角色坐标系（精准对齐全部 5 套 3 面板素材） ─────────────────────────── */

interface PartPlacement {
  cx: number;
  topY: number;
  width: number;
}

const HAIRCAP_LAYOUT: Record<PaperDollHairId, Record<PaperDollView, PartPlacement>> = {
  bob: {
    front: { cx: 0, topY: 0, width: 182 },
    left: { cx: -7, topY: -2, width: 194 },
    right: { cx: 7, topY: -2, width: 194 },
    back: { cx: 0, topY: -1, width: 184 },
  },
  sailor: {
    front: { cx: 2, topY: -2, width: 174 },
    left: { cx: 11, topY: -2, width: 172 },
    right: { cx: -11, topY: -2, width: 172 },
    back: { cx: 0, topY: -2, width: 172 },
  },
  explorer: {
    front: { cx: 5, topY: -5, width: 190 },
    left: { cx: -2, topY: -5, width: 198 },
    right: { cx: 2, topY: -5, width: 198 },
    back: { cx: 0, topY: -3, width: 190 },
  },
  punk: {
    front: { cx: 10, topY: -15, width: 176 },
    left: { cx: 11, topY: -13, width: 182 },
    right: { cx: -6, topY: -13, width: 176 },
    back: { cx: 0, topY: -12, width: 176 },
  },
  punkBandana: {
    front: { cx: 10, topY: -15, width: 174 },
    left: { cx: 11, topY: -13, width: 180 },
    right: { cx: -11, topY: -13, width: 180 },
    back: { cx: 0, topY: -12, width: 176 },
  },
  wuxia: {
    front: { cx: -2, topY: -30, width: 172 },
    left: { cx: 15, topY: -26, width: 186 },
    right: { cx: -15, topY: -26, width: 186 },
    back: { cx: -1, topY: -28, width: 178 },
  },
};

function getBodyNeckOffsetX(dir: 'down' | 'up' | 'left' | 'right', isMoving: boolean, isSitting: boolean): number {
  const walking = isMoving && !isSitting;
  if (dir === 'left') return walking ? -4.5 : -1.5;
  if (dir === 'right') return walking ? 5.0 : 2.5;
  if (dir === 'up') return walking ? 2.0 : 0.5;
  return 0;
}

function getDimensions(img: HTMLCanvasElement | HTMLImageElement): [number, number] {
  return img instanceof HTMLCanvasElement
    ? [img.width, img.height]
    : [img.naturalWidth, img.naturalHeight];
}

function drawCenteredByWidth(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement | HTMLImageElement,
  cx: number,
  topY: number,
  targetW: number
) {
  const [natW, natH] = getDimensions(img);
  if (!natW || !natH) return;
  const targetH = (natH / natW) * targetW;
  ctx.drawImage(img, cx - targetW / 2, topY, targetW, targetH);
}

function drawAnchoredBottomByHeight(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement | HTMLImageElement,
  cx: number,
  bottomY: number,
  targetH: number
) {
  const [natW, natH] = getDimensions(img);
  if (!natW || !natH) return;
  const targetW = (natW / natH) * targetH;
  ctx.drawImage(img, cx - targetW / 2, bottomY - targetH, targetW, targetH);
}

/**
 * 3 层独立可替换 PNG 纸娃娃实时合成器：
 *   Layer 1: 服装与身体（5 套完整 24 帧拆分层 / 自定义 PNG 上传）
 *   Layer 2: 头部与五官（9 种原生 4 向头脸拆分层 / 自定义 PNG 上传）
 *   Layer 3: 发型与帽子（6 款原生 4 向发帽拆分层 / 自定义 PNG 上传）
 */
export function drawPaperDollAvatar(
  ctx: CanvasRenderingContext2D,
  avatar: AvatarConfig,
  dir: 'down' | 'up' | 'left' | 'right',
  isMoving: boolean,
  isSitting: boolean,
  isCarrying: boolean,
  timeMs: number,
  rootBouncePx: number,
  rootSx: number,
  rootSy: number
): boolean {
  const parts = resolvePaperDollParts(avatar, dir, isMoving, isSitting, isCarrying, timeMs);

  let bodyImg = getTintedPart(
    parts.bodyUrl,
    parts.hasCustomBody ? 'none' : 'body',
    avatar.skinColor,
    avatar.outfitColor,
    parts.hasCustomBody,
    parts.outfitId
  );
  if (!bodyImg && !parts.hasCustomBody) {
    const fallbackPose = dir === 'up' ? 'back_idle_0' : dir === 'left' ? 'left_idle_0' : dir === 'right' ? 'right_idle_0' : 'front_idle_0';
    const fallbackUrl = `${getBodyBaseDir(parts.outfitId)}/${fallbackPose}.png`;
    bodyImg = getTintedPart(
      fallbackUrl,
      'body',
      avatar.skinColor,
      avatar.outfitColor,
      false,
      parts.outfitId
    );
  }
  const headImg = getTintedPart(
    parts.headUrl,
    parts.hasCustomHead ? 'none' : 'head',
    avatar.skinColor,
    undefined,
    parts.hasCustomHead
  );
  const hairImg = getTintedPart(
    parts.hairUrl,
    parts.hasCustomHairCap ? 'none' : 'haircap',
    avatar.hairColor,
    avatar.outfitColor,
    parts.hasCustomHairCap,
    parts.hairId
  );

  if (!bodyImg && !headImg) return false;

  const CHAR_SPACE_H = 268;
  const targetHeight = 72;
  const scale = targetHeight / CHAR_SPACE_H;
  const footY = 16.5;

  ctx.save();
  ctx.translate(0, rootBouncePx + (isSitting ? 4.5 : 0));
  ctx.translate(0, footY);
  ctx.scale(rootSx, rootSy);
  if (isMoving && !isSitting) {
    const tilt = Math.sin((timeMs / 138) * (Math.PI / 2)) * 0.028;
    ctx.rotate(tilt);
  }
  ctx.scale(scale, scale);
  // 进入 268px 统一角色坐标系：y=0 为帽顶，y=268 为脚底，x=0 为身体中轴
  ctx.translate(0, -CHAR_SPACE_H);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // ── Layer 1: 服装与身体 ──
  if (bodyImg) {
    if (parts.hasCustomBody) {
      ctx.save();
      if (parts.mirrorSideAssets) ctx.scale(-1, 1);
      drawAnchoredBottomByHeight(ctx, bodyImg, 0, CHAR_SPACE_H, 142);
      ctx.restore();
    } else {
      const targetBodyH =
        dir === 'left' || dir === 'right'
          ? isMoving && !isSitting
            ? 148
            : 150
          : dir === 'up' && isMoving && !isSitting
            ? 146
            : 140;
      const bodyCx = getBodyNeckOffsetX(dir, isMoving, isSitting);
      drawAnchoredBottomByHeight(ctx, bodyImg, bodyCx, CHAR_SPACE_H, targetBodyH);
    }
  }

  // ── 头部微律动（与身体解耦，走路/举起时自然微弹） ──
  const headBob =
    isMoving && !isSitting
      ? Math.sin((timeMs / 138) * Math.PI) * 2.4
      : isCarrying
        ? Math.sin(timeMs * 0.006) * 1.4
        : 0;
  ctx.save();
  ctx.translate(0, headBob);

  // ── Layer 2: 头部与五官 ──
  if (headImg) {
    if (parts.hasCustomHead) {
      ctx.save();
      if (parts.mirrorSideAssets) ctx.scale(-1, 1);
      drawAnchoredBottomByHeight(ctx, headImg, 0, 165, 148);
      ctx.restore();
    } else if (dir === 'left' || dir === 'right') {
      drawCenteredByWidth(ctx, headImg, 0, 15, 140);
    } else if (dir === 'up') {
      drawCenteredByWidth(ctx, headImg, 0, 17, 156);
    } else {
      drawCenteredByWidth(ctx, headImg, 0, 17, 158);
    }
  }

  // ── Layer 3: 发型与帽子 ──
  if (hairImg) {
    if (parts.hasCustomHairCap) {
      ctx.save();
      if (parts.mirrorSideAssets) ctx.scale(-1, 1);
      drawCenteredByWidth(ctx, hairImg, 0, 0, 182);
      ctx.restore();
    } else {
      const hl = HAIRCAP_LAYOUT[parts.hairId][parts.view];
      drawCenteredByWidth(ctx, hairImg, hl.cx, hl.topY, hl.width);
    }
  }

  ctx.restore();
  ctx.restore();
  return true;
}

/**
 * 预加载默认与扩展拆分层核心帧，切换时零闪烁。
 */
export function preloadCorePaperDollAssets() {
  if (typeof Image === 'undefined') return;
  const bodyBases = [
    `${USER_LAYERS_BASE_PATH}/body`,
    `${PACKS_BASE_PATH}/sailor/body`,
    `${PACKS_BASE_PATH}/explorer/body`,
    `${PACKS_BASE_PATH}/punk/body`,
    `${PACKS_BASE_PATH}/wuxia/body`,
  ];
  const idlePoses = [
    'front_idle_0',
    'front_idle_1',
    'front_idle_2',
    'left_idle_0',
    'left_idle_1',
    'right_idle_0',
    'right_idle_1',
    'back_idle_0',
  ];
  const urls: string[] = [];
  for (const base of bodyBases) {
    for (const pose of idlePoses) {
      urls.push(`${base}/${pose}.png`);
    }
  }
  urls.push(
    `${USER_LAYERS_BASE_PATH}/head/front_rainbow.png`,
    `${USER_LAYERS_BASE_PATH}/head/left_rainbow.png`,
    `${USER_LAYERS_BASE_PATH}/head/right_rainbow.png`,
    `${USER_LAYERS_BASE_PATH}/head/back_blank.png`,
    `${USER_LAYERS_BASE_PATH}/haircap/front.png`,
    `${USER_LAYERS_BASE_PATH}/haircap/left.png`,
    `${USER_LAYERS_BASE_PATH}/haircap/right.png`,
    `${USER_LAYERS_BASE_PATH}/haircap/back.png`,
    `${PACKS_BASE_PATH}/sailor/haircap/front.png`,
    `${PACKS_BASE_PATH}/sailor/head/front_gentle.png`,
    `${PACKS_BASE_PATH}/explorer/haircap/front.png`,
    `${PACKS_BASE_PATH}/explorer/head/front_happy.png`,
    `${PACKS_BASE_PATH}/punk/haircap/front.png`,
    `${PACKS_BASE_PATH}/punk/head/front_smile.png`,
    `${PACKS_BASE_PATH}/wuxia/haircap/front.png`
  );
  for (const u of urls) {
    getRawPartImage(u);
  }
}

if (typeof window !== 'undefined') {
  preloadCorePaperDollAssets();
}
