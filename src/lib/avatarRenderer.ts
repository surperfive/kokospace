import { AvatarConfig } from '../types/metaverse';

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}

/* ─────────────────────────── 色彩派生引擎 (HSL Shading) ─────────────────────────── */

interface HSL {
  h: number;
  s: number;
  l: number;
}

function parseHex(hex: string, fallback = '#FDB892'): [number, number, number] {
  const clean = (hex || '').trim().replace(/^#/, '');
  let full = clean;
  if (clean.length === 3) {
    full = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return parseHex(fallback, '#888888');
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToCss(h: number, s: number, l: number, alpha = 1): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s));
  const ll = Math.max(0, Math.min(100, l));
  return alpha < 1
    ? `hsla(${hh.toFixed(1)}, ${ss.toFixed(1)}%, ${ll.toFixed(1)}%, ${alpha})`
    : `hsl(${hh.toFixed(1)}, ${ss.toFixed(1)}%, ${ll.toFixed(1)}%)`;
}

function shiftColor(
  hex: string,
  dl: number,
  ds = 0,
  dh = 0,
  alpha = 1,
  fallback = '#FDB892'
): string {
  const [r, g, b] = parseHex(hex, fallback);
  const { h, s, l } = rgbToHsl(r, g, b);
  return hslToCss(h + dh, s + ds, l + dl, alpha);
}

interface DerivedPalette {
  skinHi: string;
  skinMid: string;
  skinShade: string;
  skinDeep: string;
  legTop: string;
  foreheadShadow: string;
  foreheadShadowSoft: string;
  foreheadShadowZero: string;
  earInner: string;
  earInnerSoft: string;
  blush: string;
  armMid: string;
  armDeep: string;
  hairHi: string;
  hairMid: string;
  hairShade: string;
  hairDeep: string;
  browTop: string;
  browBot: string;
  browRim: string;
  outHi: string;
  outMid: string;
  outShade: string;
  outDeep: string;
  outCrease: string;
  bottomHi: string;
  bottomMid: string;
  bottomDeep: string;
  shoeSole: string;
  shoeUpper: string;
  shoeStrap: string;
  outlineDark: string;
}

function derivePalette(avatar: AvatarConfig): DerivedPalette {
  const skin = avatar.skinColor || '#FDB892';
  const hair = avatar.hairColor || '#FF6268';
  const out = avatar.outfitColor || '#FCE041';

  const isDefaultSkin = skin.toUpperCase() === '#FDB892';
  const isDefaultHair = hair.toUpperCase() === '#FF6268';
  const isDefaultOut = out.toUpperCase() === '#FCE041';

  const [, , bRgb] = parseHex(out, '#FCE041');
  const outHsl = rgbToHsl(...parseHex(out, '#FCE041'));
  const isBlueOutfit = outHsl.h > 190 && outHsl.h < 250 && outHsl.s > 35 && bRgb > 110;

  return {
    skinHi: isDefaultSkin ? '#FFC29D' : shiftColor(skin, 4, -2, 2, 1, '#FDB892'),
    skinMid: isDefaultSkin ? '#FDB892' : skin,
    skinShade: isDefaultSkin ? '#F3A687' : shiftColor(skin, -7, 4, -4, 1, '#FDB892'),
    skinDeep: isDefaultSkin ? '#D58670' : shiftColor(skin, -17, 6, -6, 1, '#FDB892'),
    legTop: isDefaultSkin ? '#EE7A74' : shiftColor(skin, -11, 14, -10, 1, '#FDB892'),
    foreheadShadow: isDefaultSkin
      ? 'rgba(238, 123, 112, 0.95)'
      : shiftColor(skin, -11, 14, -10, 0.95, '#FDB892'),
    foreheadShadowSoft: isDefaultSkin
      ? 'rgba(246, 146, 125, 0.82)'
      : shiftColor(skin, -6, 12, -7, 0.82, '#FDB892'),
    foreheadShadowZero: isDefaultSkin
      ? 'rgba(253, 184, 146, 0)'
      : shiftColor(skin, 0, 0, 0, 0, '#FDB892'),
    earInner: isDefaultSkin ? '#E25E5B' : shiftColor(skin, -18, 18, -12, 1, '#FDB892'),
    earInnerSoft: isDefaultSkin ? '#F49A81' : shiftColor(skin, -6, 10, -7, 1, '#FDB892'),
    blush: '#F4847A',
    armMid: isDefaultSkin ? '#EC7570' : shiftColor(skin, -13, 12, -10, 1, '#FDB892'),
    armDeep: isDefaultSkin ? '#C65855' : shiftColor(skin, -22, 14, -12, 1, '#FDB892'),

    hairHi: isDefaultHair ? '#FF7075' : shiftColor(hair, 6, -2, 2, 1, '#FF6268'),
    hairMid: isDefaultHair ? '#FF6268' : hair,
    hairShade: isDefaultHair ? '#EB525B' : shiftColor(hair, -9, 4, -3, 1, '#FF6268'),
    hairDeep: isDefaultHair ? '#C8424D' : shiftColor(hair, -18, 5, -5, 1, '#FF6268'),
    browTop: isDefaultHair ? '#E24E58' : shiftColor(hair, -8, 4, -2, 1, '#FF6268'),
    browBot: isDefaultHair ? '#B93944' : shiftColor(hair, -20, 6, -4, 1, '#FF6268'),
    browRim: isDefaultHair ? '#AC343E' : shiftColor(hair, -26, 6, -5, 1, '#FF6268'),

    outHi: isDefaultOut ? '#FFEE58' : shiftColor(out, 9, -2, 2, 1, '#FCE041'),
    outMid: isDefaultOut ? '#FCE041' : out,
    outShade: isDefaultOut ? '#F3C133' : shiftColor(out, -10, 5, -4, 1, '#FCE041'),
    outDeep: isDefaultOut ? '#DFA12A' : shiftColor(out, -20, 8, -6, 1, '#FCE041'),
    outCrease: isDefaultOut ? '#C88A23' : shiftColor(out, -26, 8, -8, 1, '#FCE041'),

    bottomHi: isBlueOutfit ? '#475569' : '#2C7DB5',
    bottomMid: isBlueOutfit ? '#334155' : '#226CA0',
    bottomDeep: isBlueOutfit ? '#1E293B' : '#164F7B',

    shoeSole: '#BC4D18',
    shoeUpper: '#F07824',
    shoeStrap: isDefaultOut ? '#FDE052' : shiftColor(out, 6, -4, 0, 1, '#FDE052'),
    outlineDark: '#4B332F',
  };
}

/* ─────────────────────────── 渐变 & 动画工具 ─────────────────────────── */

function makeGrad(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: Array<[number, string]>
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [offset, color] of stops) g.addColorStop(offset, color);
  return g;
}

/** 自然眨眼：每 ~3.8s 轻眨一次，约 7.2s 偶有俏皮连眨两下 */
function blinkFactor(timeMs: number): number {
  const p = ((timeMs % 7400) + 7400) % 7400;
  if (p < 120) return 0.12;
  if (p >= 3600 && p < 3710) return 0.12;
  if (p >= 3870 && p < 3980) return 0.12;
  return 1;
}

const smoothstep = (t: number) => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/* ─────────────────────────── 连续步态骨骼状态机 ─────────────────────────── */

interface RigMotionState {
  phase: number;
  walkWeight: number;
  carryWeight: number;
  lastTimeMs: number;
}

const gaitCache = new Map<string, RigMotionState>();
const WALK_OMEGA = 0.0088; // rad/ms (~714ms 完整左右步态周期)

function resolveRigMotion(
  rigKey: string | undefined,
  timeMs: number,
  isMoving: boolean,
  isCarrying: boolean
): { phase: number; walkW: number; carryW: number } {
  if (!rigKey) {
    return {
      phase: timeMs * WALK_OMEGA,
      walkW: isMoving ? 1 : 0,
      carryW: isCarrying ? 1 : 0,
    };
  }

  let st = gaitCache.get(rigKey);
  if (!st) {
    if (gaitCache.size > 128) {
      const oldest = gaitCache.keys().next().value;
      if (oldest !== undefined) gaitCache.delete(oldest);
    }
    st = {
      phase: timeMs * WALK_OMEGA,
      walkWeight: isMoving ? 1 : 0,
      carryWeight: isCarrying ? 1 : 0,
      lastTimeMs: timeMs,
    };
    gaitCache.set(rigKey, st);
  } else {
    const dt = Math.min(60, Math.max(0, timeMs - st.lastTimeMs));
    st.lastTimeMs = timeMs;
    const walkTarget = isMoving ? 1 : 0;
    const walkRate = isMoving ? dt / 110 : dt / 145;
    if (st.walkWeight < walkTarget) {
      st.walkWeight = Math.min(1, st.walkWeight + walkRate);
    } else if (st.walkWeight > walkTarget) {
      st.walkWeight = Math.max(0, st.walkWeight - walkRate);
    }

    const carryTarget = isCarrying ? 1 : 0;
    const carryRate = dt / 140;
    if (st.carryWeight < carryTarget) {
      st.carryWeight = Math.min(1, st.carryWeight + carryRate);
    } else if (st.carryWeight > carryTarget) {
      st.carryWeight = Math.max(0, st.carryWeight - carryRate);
    }

    if (st.walkWeight > 0.005) {
      st.phase += dt * WALK_OMEGA * (0.65 + 0.35 * st.walkWeight);
    } else {
      // 静止归位到 0 相位附近
      st.phase = 0;
    }
  }

  return {
    phase: st.phase,
    walkW: smoothstep(st.walkWeight),
    carryW: smoothstep(st.carryWeight),
  };
}

interface LegBonePose {
  liftY: number;
  swingRot: number;
  ankleTilt: number;
  depthScale: number;
}

interface ArmBonePose {
  swingRot: number;
  shoulderDrop: number;
  carryLiftY: number;
  carryOutX: number;
  depthScale: number;
  inFrontOfTorso: boolean;
}

interface AvatarRigPose {
  rootBouncePx: number;
  rootSx: number;
  rootSy: number;
  torsoLeanRot: number;
  hipSwayX: number;
  skirtSwayRot: number;
  headBobY: number;
  headTiltRot: number;
  hairLagY: number;
  hairLagRot: number;
  shadowScale: number;
  leftLeg: LegBonePose;
  rightLeg: LegBonePose;
  leftArm: ArmBonePose;
  rightArm: ArmBonePose;
}

function solveAvatarPose(
  dir: 'down' | 'up' | 'left' | 'right',
  timeMs: number,
  phase: number,
  walkW: number,
  carryW: number,
  isSitting: boolean
): AvatarRigPose {
  const breath = Math.sin(timeMs / 560);
  const breathLag = Math.sin(timeMs / 560 - 0.65);

  const w = isSitting ? 0 : walkW;
  const isSide = dir === 'left' || dir === 'right';
  const isBack = dir === 'up';

  // 经典走路弧线：passing（单脚支撑过中点）最高，contact（双脚最大跨度）微沉并挤压回弹
  const passCycle = Math.cos(phase * 2);
  const walkBouncePx = (-passCycle * 2.0 - 1.2) * w;
  const idleBouncePx = breath * 1.15 * (1 - w);
  const rootBouncePx = walkBouncePx + idleBouncePx;

  const squash = -passCycle * 0.022 * w + breath * 0.007 * (1 - w);
  const rootSx = 1 + squash;
  const rootSy = 1 - squash;

  // 躯干与重心微晃
  const hipSwayX = isSide ? 0 : Math.cos(phase) * 3.8 * w;
  const torsoLeanRot = isSide
    ? -0.058 * w + breath * 0.012 * (1 - w)
    : Math.sin(phase) * 0.024 * w;
  const skirtSwayRot = isSide ? Math.sin(phase) * 0.045 * w : -Math.cos(phase) * 0.032 * w;

  // 头部与发丝滞后跟随（Overlapping Action）
  const headPhase = phase - 0.55;
  const hairPhase = phase - 0.95;
  const headBobY =
    (-Math.cos(headPhase * 2) * 5.2 - 2.4) * w + breathLag * 2.3 * (1 - w);
  const headTiltRot = isSide
    ? Math.cos(headPhase * 2) * 0.032 * w + breathLag * 0.014 * (1 - w)
    : Math.cos(headPhase) * 0.042 * w + breathLag * 0.014 * (1 - w);
  const hairLagY =
    (-Math.cos(hairPhase * 2) * 6.5) * w + breathLag * 2.6 * (1 - w);
  const hairLagRot = isSide
    ? (0.04 * w + Math.sin(hairPhase * 2) * 0.05 * w) + breathLag * 0.018 * (1 - w)
    : Math.cos(hairPhase) * 0.055 * w + breathLag * 0.016 * (1 - w);

  // 地面投影随腾空缩放
  const liftFrac = Math.max(0, -walkBouncePx) / 3.2;
  const shadowScale = 1 - liftFrac * 0.08 * w + breath * 0.015 * (1 - w);

  // ── 腿部骨骼 ──
  const solveSideLeg = (phi: number): LegBonePose => {
    const swing = Math.sin(phi);
    const velForward = Math.max(0, Math.cos(phi)); // >0 表示正在向前迈步（离地）
    const liftY = -13.5 * velForward * w;
    const swingRot = swing * 0.48 * w;
    // 迈步收脚尖、落地前脚尖微抬准备脚跟着地
    const ankleTilt = (velForward * -0.18 + Math.max(0, swing) * 0.16) * w;
    return { liftY, swingRot, ankleTilt, depthScale: 1 };
  };

  const solveFrontBackLeg = (phi: number): LegBonePose => {
    const forward = Math.cos(phi); // >0 朝前抬脚（正视图变近，背视图变远）
    const lift = Math.max(0, forward);
    const liftY = -12.5 * lift * w;
    const swingRot = Math.sin(phi) * 0.06 * w;
    const ankleTilt = (isBack ? 0.14 : -0.1) * lift * w;
    const depthScale = 1 + (isBack ? -0.075 : 0.065) * forward * w;
    return { liftY, swingRot, ankleTilt, depthScale };
  };

  const leftLeg = isSide ? solveSideLeg(phase) : solveFrontBackLeg(phase);
  const rightLeg = isSide ? solveSideLeg(phase + Math.PI) : solveFrontBackLeg(phase + Math.PI);

  // ── 手臂骨骼（自然向下垂落，走路时对角自然摆动；仅在举起 isCarrying 时才抬起） ──
  const solveSideArm = (legPhi: number): ArmBonePose => {
    // 对角摆臂：与同侧腿相位相差 π
    const armPhi = legPhi + Math.PI;
    const naturalDownRest = 0.05 + breath * 0.024 * (1 - w);
    const walkSwing = Math.sin(armPhi) * 0.42 * w;
    const baseAngle = naturalDownRest + walkSwing;
    // 若扛东西（isCarrying）：平滑举过头顶前侧托举
    const carryAngle = 2.94 + (w > 0.05 ? Math.sin(phase * 2) * 0.06 * w : 0);
    const swingRot = baseAngle * (1 - carryW) + carryAngle * carryW;
    return {
      swingRot,
      shoulderDrop: Math.abs(Math.sin(armPhi)) * 2.0 * w,
      carryLiftY: -66 * carryW,
      carryOutX: -8 * carryW,
      depthScale: 1,
      inFrontOfTorso: true,
    };
  };

  const solveFrontBackArm = (legPhi: number): ArmBonePose => {
    // 对角摆臂：左腿往前迈时（cos(phase)>0），左手往后摆、右手往前摆
    const armForward = -Math.cos(legPhi); // +1=朝身前摆，-1=朝身后摆
    const restOutward = isSitting ? 0.14 : 0.17;
    const idleSway = breath * 0.025 * (1 - w);
    // 前摆时略向内收并自然下垂，后摆时略向后微张
    const walkAngle = restOutward - armForward * 0.08 * w + idleSway;
    // 扛举状态（仅 carryW > 0 时向上举过头顶两侧托举）
    const carryAngle = 2.86 + (w > 0.05 ? Math.sin(phase * 2) * 0.05 * w : 0);
    const swingRot = walkAngle * (1 - carryW) + carryAngle * carryW;

    const zVal = isBack ? -armForward : armForward;
    const foreshortenDrop = armForward * (isBack ? -4.5 : 4.5) * w;
    return {
      swingRot,
      shoulderDrop: (Math.max(0, armForward) * 2.4 * w + foreshortenDrop) * (1 - carryW),
      carryLiftY: -68 * carryW,
      carryOutX: 16 * carryW,
      depthScale: 1 + zVal * 0.055 * w,
      // 摆向相机这侧时画在躯干前，摆向背后时画在躯干后
      inFrontOfTorso: carryW > 0.25 || zVal >= -0.08,
    };
  };

  // Side view canonical facing LEFT: leftArm = Near arm, rightArm = Far arm
  const leftArm = isSide ? solveSideArm(phase) : solveFrontBackArm(phase);
  const rightArm = isSide ? solveSideArm(phase + Math.PI) : solveFrontBackArm(phase + Math.PI);

  return {
    rootBouncePx,
    rootSx,
    rootSy,
    torsoLeanRot,
    hipSwayX,
    skirtSwayRot,
    headBobY,
    headTiltRot,
    hairLagY,
    hairLagRot,
    shadowScale,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
  };
}

/* ─────────────────────────── 公共接口 ─────────────────────────── */

export interface DrawChibiOptions {
  avatar: AvatarConfig;
  x: number;
  y: number;
  dir: 'down' | 'up' | 'left' | 'right';
  isMoving: boolean;
  isSitting: boolean;
  isMicOn: boolean;
  isBroadcasting: boolean;
  isHost: boolean;
  isMe: boolean;
  name: string;
  timeMs: number;
  speakingLevel?: number;
  chatBubble?: string;
  chatBubbleAlpha?: number;
  chatBubbleRise?: number;
  hideShadow?: boolean;
  hideName?: boolean;
  isCarrying?: boolean;
  /** 可选实例标识（如 player.id / 'avatar-preview'），用于启停平滑过渡 */
  rigKey?: string;
}

const RIG_SCALE = 0.172;

export function drawChibiAvatar(ctx: CanvasRenderingContext2D, opts: DrawChibiOptions) {
  const {
    avatar,
    x,
    y,
    dir,
    isMoving,
    isSitting,
    isMicOn,
    isBroadcasting,
    isHost,
    isMe,
    name,
    timeMs,
    speakingLevel = 0,
    chatBubble,
    chatBubbleAlpha = 1,
    chatBubbleRise = 0,
    hideShadow = false,
    hideName = false,
    isCarrying = false,
    rigKey,
  } = opts;

  const pal = derivePalette(avatar);
  const { phase, walkW, carryW } = resolveRigMotion(rigKey, timeMs, isMoving, isCarrying);
  const pose = solveAvatarPose(dir, timeMs, phase, walkW, carryW, isSitting);
  const sitDrop = isSitting ? 4.5 : 0;
  const isBack = dir === 'up';
  const isSide = dir === 'left' || dir === 'right';
  const blink = blinkFactor(timeMs);

  ctx.save();
  ctx.translate(x, y);

  // 1. 语音 / 舞台广播脉冲光环
  if (isBroadcasting) {
    const pulse = (Math.sin(timeMs / 240) + 1) * 0.5;
    ctx.beginPath();
    ctx.ellipse(0, 15, 29 + pulse * 10, 14 + pulse * 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 90, 54, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else if (isMicOn && speakingLevel > 0.05) {
    ctx.beginPath();
    ctx.ellipse(0, 15, 24 + speakingLevel * 10, 12 + speakingLevel * 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // 2. 地面柔和草雾投影
  if (!hideShadow) {
    ctx.save();
    ctx.fillStyle = 'rgba(158, 192, 177, 0.42)';
    const sh = pose.shadowScale;
    const rxMain = (isSitting ? 19 : isSide ? 16 : 17.5) * sh;
    ctx.beginPath();
    ctx.ellipse(isSide ? 1 : -3, 15.5, rxMain, 6.2 * sh, -0.05, 0, Math.PI * 2);
    ctx.fill();
    if (!isSide) {
      ctx.beginPath();
      ctx.ellipse(11, 14.5, 4.2 * sh, 2.2 * sh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // 进入骨骼树根坐标系
  ctx.save();
  ctx.translate(0, pose.rootBouncePx + sitDrop);
  ctx.scale(RIG_SCALE * pose.rootSx, RIG_SCALE * pose.rootSy);

  if (isSide) {
    // 侧面方向：以左朝向为基准绘制，朝右时整体水平镜像
    if (dir === 'right') ctx.scale(-1, 1);
    drawSideRig(ctx, avatar, pal, pose, blink, isSitting);
  } else {
    drawFrontBackRig(ctx, avatar, pal, pose, blink, isSitting, isBack);
  }

  ctx.restore(); // 退出骨骼坐标系（确保名牌与气泡不被镜像）

  // ────────────────────── 名牌 ──────────────────────
  if (!hideName) {
    const label = `${isHost ? '★ ' : ''}${name}${isMe ? ' (我)' : ''}`;
    ctx.font = '600 11px "Plus Jakarta Sans", "PingFang SC", sans-serif';
    const tw = ctx.measureText(label).width;
    const boxW = tw + (isMicOn ? 22 : 14);
    const boxH = 20;

    ctx.fillStyle = isMe ? 'rgba(24, 24, 27, 0.88)' : 'rgba(255, 255, 255, 0.94)';
    roundRectPath(ctx, -boxW / 2, 23, boxW, boxH, 7);
    ctx.fill();
    ctx.strokeStyle = isMe ? '#18181B' : 'rgba(24, 24, 27, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isMe ? '#FFFFFF' : '#18181B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, isMicOn ? -4 : 0, 33.5);

    if (isMicOn) {
      ctx.fillStyle = isBroadcasting ? '#FF5A36' : '#10B981';
      ctx.beginPath();
      ctx.arc(boxW / 2 - 8, 33, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ────────────────────── 头顶聊天气泡 ──────────────────────
  if (chatBubble && chatBubbleAlpha > 0.01) {
    const truncated = chatBubble.length > 22 ? chatBubble.slice(0, 21) + '…' : chatBubble;
    ctx.save();
    ctx.globalAlpha = chatBubbleAlpha;
    if (chatBubbleRise) ctx.translate(0, -chatBubbleRise);
    ctx.font = '500 12px "Plus Jakarta Sans", "PingFang SC", sans-serif';
    const bw = Math.max(42, ctx.measureText(truncated).width + 18);
    const topY = avatar.hairStyle === 'bun' || avatar.accessory === 'crown' ? -94 : -82;
    ctx.fillStyle = '#FFFFFF';
    roundRectPath(ctx, -bw / 2, topY, bw, 26, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(24, 24, 27, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#18181B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncated, 0, topY + 13);
    ctx.restore();
  }

  ctx.restore();
}

/* ─────────────────────────── 正面 & 背面 骨骼装配 ─────────────────────────── */

function drawFrontBackRig(
  ctx: CanvasRenderingContext2D,
  avatar: AvatarConfig,
  pal: DerivedPalette,
  pose: AvatarRigPose,
  blink: number,
  isSitting: boolean,
  isBack: boolean
) {
  // 1. 远侧后发（随头部次级滞后晃动）
  ctx.save();
  ctx.translate(pose.hipSwayX * 0.55, pose.hairLagY);
  ctx.rotate(pose.hairLagRot);
  drawFrontBackRearHair(ctx, avatar.hairStyle, pal);
  ctx.restore();

  // 2. 双腿与鞋履（按前后景深排序，抬起的腿画在后/前）
  const legOrder: Array<-1 | 1> =
    pose.leftLeg.depthScale <= pose.rightLeg.depthScale ? [-1, 1] : [1, -1];
  for (const side of legOrder) {
    const legPose = side === -1 ? pose.leftLeg : pose.rightLeg;
    drawFrontBackLeg(ctx, pal, avatar.outfitStyle, side, legPose, isSitting, isBack);
  }

  // 3. 后摆手（在躯干后方穿插，自然垂落）
  ctx.save();
  ctx.translate(pose.hipSwayX, 0);
  ctx.rotate(pose.torsoLeanRot);
  if (!pose.leftArm.inFrontOfTorso) {
    drawFrontBackArm(ctx, pal, avatar.outfitStyle, -1, pose.leftArm, true);
  }
  if (!pose.rightArm.inFrontOfTorso) {
    drawFrontBackArm(ctx, pal, avatar.outfitStyle, 1, pose.rightArm, true);
  }
  ctx.restore();

  // 4. 下装（裙摆/背带短裤随步态轻摆）
  ctx.save();
  ctx.translate(pose.hipSwayX, isSitting ? 6 : 0);
  ctx.rotate(pose.skirtSwayRot);
  drawFrontBackBottoms(ctx, pal, avatar.outfitStyle);
  ctx.restore();

  // 5. 躯干（颈部 + 内搭 + 外套主体，不含横伸旧袖）
  ctx.save();
  ctx.translate(pose.hipSwayX, 0);
  ctx.rotate(pose.torsoLeanRot);
  drawFrontBackNeckAndShirt(ctx, pal, avatar.outfitStyle, isBack);
  drawFrontBackTorso(ctx, pal, avatar.outfitStyle, isBack);

  // 6. 前摆手（画在躯干肩部外前侧，自然垂落）
  if (pose.leftArm.inFrontOfTorso) {
    drawFrontBackArm(ctx, pal, avatar.outfitStyle, -1, pose.leftArm, false);
  }
  if (pose.rightArm.inFrontOfTorso) {
    drawFrontBackArm(ctx, pal, avatar.outfitStyle, 1, pose.rightArm, false);
  }
  ctx.restore();

  // 7. 头部骨骼（双耳 + 脸部阴影腮红 + 表情 + 前发/后全发 + 头饰）
  ctx.save();
  ctx.translate(pose.hipSwayX * 0.7, pose.headBobY);
  ctx.rotate(pose.headTiltRot);
  drawFrontBackEars(ctx, pal, isBack);
  drawFrontBackHead(ctx, pal, isBack);
  if (!isBack) {
    drawFrontFacialFeatures(ctx, avatar.eyeStyle, blink, pal);
  }
  drawFrontBackHairTop(ctx, avatar.hairStyle, pal, isBack);
  drawFrontBackAccessory(ctx, avatar.accessory, isBack, avatar.eyeStyle, avatar.hairStyle);
  ctx.restore();
}

/* ─────────────────────────── 侧面 (3/4 Profile) 骨骼装配 ─────────────────────────── */
// 基准朝向：朝左（-X 为前进方向，+X 为脑后）

function drawSideRig(
  ctx: CanvasRenderingContext2D,
  avatar: AvatarConfig,
  pal: DerivedPalette,
  pose: AvatarRigPose,
  blink: number,
  isSitting: boolean
) {
  // 1. 远侧手臂（摆在躯干后面，略深一层营造体积景深）
  ctx.save();
  ctx.rotate(pose.torsoLeanRot);
  drawSideArm(ctx, pal, avatar.outfitStyle, pose.rightArm, true);
  ctx.restore();

  // 2. 侧面后发（丸子/长卷发/波波头拖尾跟随头部滞后）
  ctx.save();
  ctx.translate(0, pose.hairLagY);
  ctx.rotate(pose.hairLagRot);
  drawSideRearHair(ctx, avatar.hairStyle, pal);
  ctx.restore();

  // 3. 远侧腿（背景脚）
  drawSideLeg(ctx, pal, avatar.outfitStyle, pose.rightLeg, isSitting, true);

  // 4. 侧面下装（短裙 / 工装裤）
  ctx.save();
  ctx.translate(0, isSitting ? 6 : 0);
  ctx.rotate(pose.skirtSwayRot);
  drawSideBottoms(ctx, pal, avatar.outfitStyle);
  ctx.restore();

  // 5. 近侧腿（前景脚，清脆压在远侧腿前）
  drawSideLeg(ctx, pal, avatar.outfitStyle, pose.leftLeg, isSitting, false);

  // 6. 侧面躯干（脖子 + 内搭 + 夹克/西装/针织/背带/裙装）
  ctx.save();
  ctx.rotate(pose.torsoLeanRot);
  drawSideTorso(ctx, pal, avatar.outfitStyle);
  ctx.restore();

  // 7. 侧面头部骨骼（略向行进方向倾，带发丝次级滞后）
  ctx.save();
  ctx.translate(0, pose.headBobY);
  ctx.rotate(pose.headTiltRot);
  drawSideHeadAndFace(ctx, avatar, pal, blink);
  drawSideHairTop(ctx, avatar.hairStyle, pal);
  drawSideAccessory(ctx, avatar.accessory, avatar.eyeStyle, avatar.hairStyle);
  ctx.restore();

  // 8. 近侧手臂（挂在躯干肩部外侧，自然向下与远侧腿同相、近侧腿反相摆动）
  ctx.save();
  ctx.rotate(pose.torsoLeanRot);
  drawSideArm(ctx, pal, avatar.outfitStyle, pose.leftArm, false);
  ctx.restore();
}

/* ─────────────────────────── 共享：自然垂落关节手臂 + 袖子 ─────────────────────────── */

function drawArmLimbGeometry(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string,
  shaded: boolean
) {
  const cOutHi = shaded ? pal.outMid : pal.outHi;
  const cOutMid = shaded ? pal.outShade : pal.outMid;
  const cOutDeep = shaded ? pal.outCrease : pal.outDeep;
  const cSkinHi = shaded ? pal.skinMid : pal.skinHi;
  const cSkinMid = shaded ? pal.skinShade : pal.skinMid;
  const cSkinDeep = shaded ? pal.armDeep : pal.skinDeep;

  // A. 前臂（沿 +Y 自然向下延伸，先画在袖子下层）
  roundRectPath(ctx, -9, 10, 18, 34, 8);
  ctx.fillStyle = makeGrad(ctx, 0, 10, 0, 44, [
    [0, shaded ? pal.armMid : pal.skinShade],
    [0.65, pal.armMid],
    [1, pal.armDeep],
  ]);
  ctx.fill();

  // B. 依服饰绘制自然垂落的袖子（肩点在 (0, 0)）
  if (outfitStyle === 'overalls') {
    // 短袖 T 恤袖
    ctx.beginPath();
    ctx.moveTo(-13, -10);
    ctx.bezierCurveTo(-18, 0, -18, 13, -15, 21);
    ctx.bezierCurveTo(-6, 24, 8, 24, 15, 20);
    ctx.bezierCurveTo(17, 11, 16, -2, 11, -10);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, -10, -10, 12, 22, [
      [0, cOutHi],
      [0.65, cOutMid],
      [1, cOutDeep],
    ]);
    ctx.fill();
  } else if (outfitStyle === 'dress') {
    // 蓬蓬泡泡袖
    ctx.beginPath();
    ctx.moveTo(-12, -10);
    ctx.bezierCurveTo(-21, 0, -21, 16, -15, 25);
    ctx.bezierCurveTo(-6, 28, 8, 28, 15, 24);
    ctx.bezierCurveTo(19, 15, 19, -2, 11, -10);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, -12, -10, 14, 26, [
      [0, cOutHi],
      [0.55, cOutMid],
      [1, cOutDeep],
    ]);
    ctx.fill();
    ctx.fillStyle = cOutDeep;
    ctx.globalAlpha = 0.7;
    roundRectPath(ctx, -14, 21, 28, 5, 2.5);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    // hoodie / blazer / knit 长袖自然向下包裹到腕部上端
    ctx.beginPath();
    ctx.moveTo(-14, -10);
    ctx.bezierCurveTo(-19, 2, -18, 18, -15, 28);
    ctx.bezierCurveTo(-6, 32, 7, 32, 14, 28);
    ctx.bezierCurveTo(17, 18, 17, 2, 12, -10);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, -12, -10, 14, 30, [
      [0, cOutHi],
      [0.55, cOutMid],
      [1, cOutDeep],
    ]);
    ctx.fill();

    // 袖口滚边（knit 用奶油罗纹，夹克用暗金折边）
    ctx.fillStyle = outfitStyle === 'knit' ? '#FFFCE2' : cOutDeep;
    roundRectPath(ctx, -15, 24, 29, 7, 3.5);
    ctx.fill();
  }

  // C. 圆润小手（位于 (0, 50) 垂在裤裙侧旁）
  const hy = 50;
  ctx.beginPath();
  ctx.ellipse(0, hy, 18.5, 20, 0, 0, Math.PI * 2);
  ctx.fillStyle = makeGrad(ctx, -7, hy - 16, 5, hy + 18, [
    [0, cSkinHi],
    [0.62, cSkinMid],
    [0.88, pal.skinShade],
    [1, cSkinDeep],
  ]);
  ctx.fill();

  // 手底月牙暗面
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = cSkinDeep;
  ctx.beginPath();
  ctx.moveTo(-16, hy + 8);
  ctx.bezierCurveTo(-11, hy + 16, 0, hy + 19, 11, hy + 14);
  ctx.bezierCurveTo(6, hy + 20, -7, hy + 21, -14, hy + 15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawFrontBackArm(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string,
  side: -1 | 1,
  armPose: ArmBonePose,
  behindTorso: boolean
) {
  ctx.save();
  ctx.translate(
    side * (67 + armPose.carryOutX),
    -75 + armPose.shoulderDrop + armPose.carryLiftY
  );
  ctx.scale(side * armPose.depthScale, armPose.depthScale);
  // 基准几何沿 +Y 向下，旋转 -swingRot 让侧臂自然垂落微向外展（或举起时向上旋转）
  ctx.rotate(-armPose.swingRot);
  drawArmLimbGeometry(ctx, pal, outfitStyle, behindTorso);
  ctx.restore();
}

function drawSideArm(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string,
  armPose: ArmBonePose,
  isFar: boolean
) {
  ctx.save();
  ctx.translate(
    (isFar ? -6 : 10) + armPose.carryOutX,
    -74 + armPose.shoulderDrop + armPose.carryLiftY
  );
  if (isFar) ctx.scale(0.92, 0.96);
  // 朝左视角下，正角将 +Y 向下手臂朝 -X 前方摆动，负角朝 +X 后方摆动
  ctx.rotate(armPose.swingRot);
  drawArmLimbGeometry(ctx, pal, outfitStyle, isFar);
  ctx.restore();
}

/* ─────────────────────────── 正面 & 背面 分部件绘制 ─────────────────────────── */

function drawFrontBackRearHair(
  ctx: CanvasRenderingContext2D,
  hairStyle: string,
  pal: DerivedPalette
) {
  if (hairStyle === 'bun') {
    ctx.beginPath();
    ctx.moveTo(-76, -245);
    ctx.bezierCurveTo(-83, -252, -86, -264, -84, -276);
    ctx.lineTo(-76, -307);
    ctx.bezierCurveTo(-72, -320, -61, -332, -49, -338);
    ctx.lineTo(-20, -348);
    ctx.bezierCurveTo(-6, -350, 11, -350, 24, -347);
    ctx.lineTo(50, -337);
    ctx.bezierCurveTo(62, -329, 71, -317, 75, -304);
    ctx.lineTo(81, -276);
    ctx.bezierCurveTo(83, -263, 80, -251, 72, -243);
    ctx.bezierCurveTo(51, -236, -54, -236, -76, -245);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, -30, -345, 30, -238, [
      [0, pal.hairHi],
      [0.55, pal.hairMid],
      [0.85, pal.hairShade],
      [1, pal.hairDeep],
    ]);
    ctx.fill();

    ctx.fillStyle = pal.hairShade;
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(-44, -322);
    ctx.bezierCurveTo(-48, -304, -47, -284, -40, -267);
    ctx.bezierCurveTo(-37, -262, -31, -263, -33, -270);
    ctx.bezierCurveTo(-38, -286, -39, -304, -37, -320);
    ctx.bezierCurveTo(-36, -326, -43, -327, -44, -322);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(30, -320);
    ctx.bezierCurveTo(33, -302, 32, -282, 26, -265);
    ctx.bezierCurveTo(24, -260, 18, -261, 20, -268);
    ctx.bezierCurveTo(24, -283, 25, -302, 23, -318);
    ctx.bezierCurveTo(22, -324, 29, -325, 30, -320);
    ctx.fill();

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = pal.hairDeep;
    ctx.beginPath();
    ctx.moveTo(-82, -280);
    ctx.bezierCurveTo(-68, -271, -46, -265, -18, -264);
    ctx.bezierCurveTo(22, -263, 54, -261, 80, -253);
    ctx.bezierCurveTo(78, -248, 75, -245, 72, -242);
    ctx.bezierCurveTo(49, -234, -53, -234, -76, -245);
    ctx.bezierCurveTo(-83, -253, -85, -267, -82, -280);
    ctx.fill();
  } else if (hairStyle === 'wavy') {
    ctx.beginPath();
    ctx.moveTo(-102, -210);
    ctx.bezierCurveTo(-116, -162, -118, -108, -106, -68);
    ctx.bezierCurveTo(-96, -54, -74, -54, -58, -64);
    ctx.lineTo(58, -64);
    ctx.bezierCurveTo(74, -54, 96, -54, 106, -68);
    ctx.bezierCurveTo(118, -108, 116, -162, 102, -210);
    ctx.bezierCurveTo(88, -258, -88, -258, -102, -210);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -248, 0, -60, [
      [0, pal.hairMid],
      [0.65, pal.hairShade],
      [1, pal.hairDeep],
    ]);
    ctx.fill();
  } else if (hairStyle === 'bob') {
    ctx.beginPath();
    ctx.moveTo(-100, -212);
    ctx.bezierCurveTo(-110, -165, -108, -118, -94, -92);
    ctx.bezierCurveTo(-82, -82, -62, -84, -50, -90);
    ctx.lineTo(50, -90);
    ctx.bezierCurveTo(62, -84, 82, -82, 94, -92);
    ctx.bezierCurveTo(108, -118, 110, -165, 100, -212);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -220, 0, -88, [
      [0, pal.hairShade],
      [1, pal.hairDeep],
    ]);
    ctx.fill();
  }
}

function drawShoeFrontBack(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string,
  ankleTilt: number,
  isBack: boolean
) {
  ctx.save();
  ctx.translate(0, 50);
  ctx.rotate(ankleTilt);

  if (outfitStyle === 'overalls' || outfitStyle === 'blazer') {
    ctx.beginPath();
    ctx.ellipse(0, 2, 16, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.shoeSole;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -0.5, 14.5, 8.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = outfitStyle === 'blazer' ? '#3B2C2A' : pal.shoeUpper;
    ctx.fill();
    if (!isBack) {
      ctx.beginPath();
      ctx.ellipse(0, -4, 9, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fill();
    }
  } else {
    // 双色凉鞋：背面抬脚时露出更多深橙鞋底层次
    ctx.beginPath();
    ctx.ellipse(0, isBack ? 3.5 : 2, 15.5, isBack ? 10.5 : 9.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.shoeSole;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -0.5, 14, 8.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.shoeUpper;
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, -3, 9.5, 5.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.skinMid;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-12.5, -3);
    ctx.bezierCurveTo(-7.5, -10, 7.5, -10, 12.5, -3);
    ctx.bezierCurveTo(12.5, 0, 9.5, 1, 7.5, -1);
    ctx.bezierCurveTo(3.5, -5, -3.5, -5, -8.5, -1);
    ctx.bezierCurveTo(-10.5, 1, -12.5, 0, -12.5, -3);
    ctx.fillStyle = pal.shoeStrap;
    ctx.fill();
  }
  ctx.restore();
}

function drawFrontBackLeg(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string,
  side: -1 | 1,
  legPose: LegBonePose,
  isSitting: boolean,
  isBack: boolean
) {
  ctx.save();
  const hipX = side * 27;
  const hipY = isSitting ? 38 : 28;
  ctx.translate(hipX, hipY + legPose.liftY);
  ctx.scale(legPose.depthScale, isSitting ? 0.58 : legPose.depthScale);
  ctx.rotate(legPose.swingRot);

  // 腿部
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(12, 0);
  ctx.lineTo(11, 47);
  ctx.bezierCurveTo(11, 51, -11, 51, -11, 47);
  ctx.closePath();
  ctx.fillStyle = makeGrad(ctx, 0, 0, 0, 50, [
    [0, pal.legTop],
    [0.3, pal.skinMid],
    [1, pal.skinShade],
  ]);
  ctx.fill();

  // 膝上柔暗投影
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = pal.legTop;
  ctx.beginPath();
  ctx.moveTo(-7, 2);
  ctx.lineTo(9, 2);
  ctx.lineTo(7, 26);
  ctx.bezierCurveTo(5, 31, -4, 31, -6, 25);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  drawShoeFrontBack(ctx, pal, outfitStyle, legPose.ankleTilt, isBack);
  ctx.restore();
}

function drawFrontBackBottoms(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string
) {
  if (outfitStyle === 'dress') return;

  if (outfitStyle === 'overalls') {
    ctx.beginPath();
    ctx.moveTo(-50, -18);
    ctx.lineTo(50, -18);
    ctx.lineTo(54, 24);
    ctx.bezierCurveTo(50, 32, 24, 34, 6, 30);
    ctx.lineTo(0, 18);
    ctx.lineTo(-6, 30);
    ctx.bezierCurveTo(-24, 34, -50, 32, -54, 24);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -18, 0, 34, [
      [0, pal.bottomHi],
      [0.6, pal.bottomMid],
      [1, pal.bottomDeep],
    ]);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-51, -20);
    ctx.lineTo(50, -20);
    ctx.bezierCurveTo(52, -2, 53, 14, 50, 24);
    ctx.bezierCurveTo(46, 31, 26, 34, 0, 34);
    ctx.bezierCurveTo(-26, 34, -46, 31, -51, 24);
    ctx.bezierCurveTo(-54, 14, -53, -2, -51, -20);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -20, 0, 34, [
      [0, pal.bottomMid],
      [0.25, pal.bottomHi],
      [0.8, pal.bottomMid],
      [1, pal.bottomDeep],
    ]);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = pal.bottomDeep;
    ctx.beginPath();
    ctx.moveTo(-51, -4);
    ctx.bezierCurveTo(-44, 11, -31, 16, -18, 11);
    ctx.bezierCurveTo(-24, 17, -39, 18, -52, 12);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(51, -4);
    ctx.bezierCurveTo(44, 11, 31, 16, 18, 11);
    ctx.bezierCurveTo(24, 17, 39, 18, 51, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawFrontBackNeckAndShirt(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string,
  isBack: boolean
) {
  ctx.beginPath();
  ctx.moveTo(-34, -86);
  ctx.lineTo(34, -86);
  ctx.lineTo(29, -53);
  ctx.lineTo(-29, -53);
  ctx.closePath();
  ctx.fillStyle = makeGrad(ctx, 0, -86, 0, -53, [
    [0, pal.armDeep],
    [0.35, pal.armMid],
    [1, pal.skinShade],
  ]);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = pal.armDeep;
  ctx.beginPath();
  ctx.moveTo(-30, -86);
  ctx.bezierCurveTo(-16, -78, 16, -78, 30, -86);
  ctx.lineTo(27, -76);
  ctx.bezierCurveTo(12, -71, -12, -71, -27, -76);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (!isBack && outfitStyle !== 'dress') {
    ctx.save();
    ctx.beginPath();
    ctx.rect(-23, -58, 46, 44);
    ctx.clip();
    ctx.fillStyle = '#FFFCE2';
    ctx.fillRect(-23, -58, 46, 44);
    if (outfitStyle === 'hoodie' || outfitStyle === 'overalls') {
      ctx.fillStyle = '#F4EC8E';
      ctx.fillRect(-20, -58, 8, 44);
      ctx.fillRect(-4, -58, 9, 44);
      ctx.fillRect(13, -58, 9, 44);
    }
    ctx.fillStyle = 'rgba(227, 200, 123, 0.38)';
    ctx.fillRect(-23, -58, 46, 6);
    ctx.restore();
  }
}

function drawFrontBackTorso(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string,
  isBack: boolean
) {
  if (outfitStyle === 'overalls') {
    for (const s of [-1, 1] as const) {
      ctx.save();
      ctx.scale(s, 1);
      ctx.beginPath();
      ctx.moveTo(-61, -88);
      ctx.bezierCurveTo(-71, -86, -77, -78, -77, -64);
      ctx.lineTo(-56, -42);
      ctx.lineTo(-50, -16);
      ctx.lineTo(0, -16);
      ctx.lineTo(0, -86);
      ctx.closePath();
      ctx.fillStyle = makeGrad(ctx, -40, -88, -20, -16, [
        [0, pal.outHi],
        [0.55, pal.outMid],
        [1, pal.outShade],
      ]);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = makeGrad(ctx, 0, -68, 0, -14, [
      [0, pal.bottomHi],
      [1, pal.bottomMid],
    ]);
    roundRectPath(ctx, -44, isBack ? -44 : -54, 88, isBack ? 30 : 40, 10);
    ctx.fill();
    ctx.fillRect(-38, -84, 14, 42);
    ctx.fillRect(24, -84, 14, 42);
    if (!isBack) {
      ctx.fillStyle = pal.outHi;
      ctx.beginPath();
      ctx.arc(-31, -48, 4.5, 0, Math.PI * 2);
      ctx.arc(31, -48, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.bottomDeep;
      ctx.globalAlpha = 0.45;
      roundRectPath(ctx, -20, -40, 40, 18, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    return;
  }

  if (outfitStyle === 'dress') {
    ctx.beginPath();
    ctx.moveTo(-58, -86);
    ctx.bezierCurveTo(-72, -84, -76, -72, -68, -50);
    ctx.bezierCurveTo(-60, -28, -68, 12, -74, 28);
    ctx.bezierCurveTo(-50, 38, 50, 38, 74, 28);
    ctx.bezierCurveTo(68, 12, 60, -28, 68, -50);
    ctx.bezierCurveTo(76, -72, 72, -84, 58, -86);
    ctx.bezierCurveTo(28, -74, -28, -74, -58, -86);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -86, 0, 36, [
      [0, pal.outHi],
      [0.45, pal.outMid],
      [0.85, pal.outShade],
      [1, pal.outDeep],
    ]);
    ctx.fill();

    if (!isBack) {
      ctx.fillStyle = '#FFFCE2';
      ctx.beginPath();
      ctx.ellipse(-18, -76, 19, 10, 0.25, 0, Math.PI * 2);
      ctx.ellipse(18, -76, 19, 10, -0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = pal.outCrease;
    ctx.globalAlpha = 0.72;
    roundRectPath(ctx, -46, -34, 92, 10, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  if (outfitStyle === 'knit') {
    ctx.beginPath();
    ctx.moveTo(-60, -88);
    ctx.bezierCurveTo(-74, -84, -78, -72, -70, -48);
    ctx.bezierCurveTo(-67, -28, -65, -14, -52, -10);
    ctx.lineTo(52, -10);
    ctx.bezierCurveTo(65, -14, 67, -28, 70, -48);
    ctx.bezierCurveTo(78, -72, 74, -84, 60, -88);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -88, 0, -10, [
      [0, pal.outHi],
      [0.55, pal.outMid],
      [1, pal.outShade],
    ]);
    ctx.fill();

    ctx.fillStyle = '#FFFCE2';
    ctx.beginPath();
    ctx.ellipse(0, isBack ? -81 : -78, 28, isBack ? 8 : 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.outDeep;
    ctx.globalAlpha = 0.7;
    roundRectPath(ctx, -56, -20, 112, 11, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  // hoodie & blazer（紧凑圆肩衣身，不含旧横伸袖）
  const isBlazer = outfitStyle === 'blazer';

  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.scale(side, 1);

    ctx.beginPath();
    ctx.moveTo(-61, -88);
    ctx.bezierCurveTo(-72, -84, -76, -74, -71, -56);
    ctx.bezierCurveTo(-66, -38, -66, -12, -61, 5);
    ctx.bezierCurveTo(-55, 12, -41, 14, -28, 10);
    if (isBack) {
      ctx.lineTo(1, 10);
      ctx.lineTo(1, -88);
    } else {
      ctx.bezierCurveTo(-19, 6, -15, -6, -16, -25);
      ctx.lineTo(-17, -54);
    }
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, -60, -86, -30, 12, [
      [0, pal.outHi],
      [0.45, pal.outMid],
      [0.85, pal.outShade],
      [1, pal.outDeep],
    ]);
    ctx.fill();

    // 口袋（正面）与衣摆暗部
    if (!isBlazer && !isBack) {
      ctx.beginPath();
      ctx.moveTo(-61, -30);
      ctx.bezierCurveTo(-50, -30, -42, -21, -41, -8);
      ctx.bezierCurveTo(-40, 3, -44, 9, -49, 11);
      ctx.bezierCurveTo(-57, 9, -62, 3, -63, -8);
      ctx.bezierCurveTo(-64, -17, -63, -25, -61, -30);
      ctx.fillStyle = pal.outShade;
      ctx.fill();
    }

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = pal.outCrease;
    ctx.beginPath();
    ctx.moveTo(-62, -10);
    ctx.bezierCurveTo(-60, 2, -55, 8, -45, 10);
    ctx.bezierCurveTo(-35, 12, -25, 9, -20, 3);
    ctx.bezierCurveTo(-25, 11, -39, 14, -52, 11);
    ctx.bezierCurveTo(-60, 8, -63, 0, -62, -10);
    ctx.fill();
    ctx.restore();

    if (isBack) {
      ctx.fillStyle = pal.outShade;
      ctx.beginPath();
      ctx.moveTo(-54, -88);
      ctx.quadraticCurveTo(-24, -75, 1, -76);
      ctx.lineTo(1, -88);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.outCrease;
      ctx.globalAlpha = 0.65;
      ctx.fillRect(-30, 5, 31, 6);
      ctx.globalAlpha = 1;
    } else {
      ctx.beginPath();
      ctx.moveTo(-61, -88);
      ctx.bezierCurveTo(-64, -75, -58, -60, -44, -52);
      ctx.bezierCurveTo(-33, -46, -21, -45, -16, -50);
      ctx.bezierCurveTo(-13, -55, -16, -66, -21, -75);
      ctx.bezierCurveTo(-27, -82, -43, -86, -61, -88);
      ctx.closePath();
      ctx.fillStyle = makeGrad(ctx, -60, -86, -18, -48, [
        [0, pal.outDeep],
        [0.48, pal.outShade],
        [0.85, pal.outHi],
        [1, pal.outDeep],
      ]);
      ctx.fill();

      ctx.strokeStyle = pal.outCrease;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-61, -79);
      ctx.bezierCurveTo(-59, -64, -47, -52, -29, -48);
      ctx.bezierCurveTo(-22, -47, -17, -48, -16, -51);
      ctx.stroke();

      if (!isBlazer) {
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-49, -83);
        ctx.bezierCurveTo(-51, -72, -47, -61, -38, -53);
        ctx.moveTo(-36, -81);
        ctx.bezierCurveTo(-37, -71, -33, -60, -26, -51);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  if (isBlazer && !isBack) {
    ctx.fillStyle = '#E14D58';
    ctx.beginPath();
    ctx.moveTo(0, -64);
    ctx.lineTo(-14, -72);
    ctx.lineTo(-14, -56);
    ctx.closePath();
    ctx.moveTo(0, -64);
    ctx.lineTo(14, -72);
    ctx.lineTo(14, -56);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFrontBackEars(ctx: CanvasRenderingContext2D, pal: DerivedPalette, isBack: boolean) {
  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.scale(side, 1);

    ctx.beginPath();
    ctx.moveTo(-88, -168);
    ctx.bezierCurveTo(-98, -174, -111, -171, -117, -161);
    ctx.bezierCurveTo(-123, -150, -122, -131, -115, -119);
    ctx.bezierCurveTo(-109, -110, -96, -107, -85, -112);
    ctx.closePath();
    ctx.fillStyle = pal.skinMid;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-118, -129);
    ctx.bezierCurveTo(-114, -117, -103, -112, -86, -115);
    ctx.lineTo(-85, -112);
    ctx.bezierCurveTo(-98, -107, -110, -110, -116, -120);
    ctx.closePath();
    ctx.fillStyle = pal.skinDeep;
    ctx.fill();

    if (!isBack) {
      ctx.beginPath();
      ctx.moveTo(-91, -152);
      ctx.bezierCurveTo(-97, -162, -109, -161, -113, -151);
      ctx.bezierCurveTo(-116, -142, -113, -128, -106, -122);
      ctx.bezierCurveTo(-102, -119, -96, -120, -93, -125);
      ctx.bezierCurveTo(-98, -127, -103, -132, -103, -139);
      ctx.bezierCurveTo(-103, -146, -97, -150, -91, -146);
      ctx.closePath();
      ctx.fillStyle = pal.earInner;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-90, -144);
      ctx.bezierCurveTo(-96, -147, -101, -143, -101, -137);
      ctx.bezierCurveTo(-101, -131, -96, -127, -90, -129);
      ctx.closePath();
      ctx.fillStyle = pal.earInnerSoft;
      ctx.fill();
    }

    ctx.restore();
  }
}

function drawFrontBackHead(ctx: CanvasRenderingContext2D, pal: DerivedPalette, isBack: boolean) {
  const traceHead = () => {
    ctx.beginPath();
    ctx.moveTo(-88, -210);
    ctx.bezierCurveTo(-93, -180, -93, -141, -88, -118);
    ctx.bezierCurveTo(-81, -94, -53, -82, 0, -82);
    ctx.bezierCurveTo(53, -82, 81, -94, 88, -118);
    ctx.bezierCurveTo(93, -141, 93, -180, 88, -210);
    ctx.bezierCurveTo(81, -240, 46, -254, 0, -254);
    ctx.bezierCurveTo(-46, -254, -81, -240, -88, -210);
    ctx.closePath();
  };

  traceHead();
  ctx.fillStyle = makeGrad(ctx, 0, -245, 0, -82, [
    [0, pal.skinHi],
    [0.7, pal.skinMid],
    [0.92, pal.skinShade],
    [1, pal.skinDeep],
  ]);
  ctx.fill();

  if (!isBack) {
    ctx.save();
    traceHead();
    ctx.clip();

    ctx.beginPath();
    ctx.moveTo(-98, -248);
    ctx.lineTo(98, -248);
    ctx.lineTo(98, -184);
    ctx.bezierCurveTo(66, -197, 32, -201, 0, -201);
    ctx.bezierCurveTo(-32, -201, -66, -197, -98, -184);
    ctx.closePath();
    const fhGrad = ctx.createLinearGradient(0, -248, 0, -184);
    fhGrad.addColorStop(0, pal.foreheadShadow);
    fhGrad.addColorStop(0.68, pal.foreheadShadowSoft);
    fhGrad.addColorStop(1, pal.foreheadShadowZero);
    ctx.fillStyle = fhGrad;
    ctx.fill();

    ctx.globalAlpha = 0.86;
    ctx.fillStyle = pal.blush;
    ctx.save();
    ctx.translate(-78, -117);
    ctx.rotate(-0.21);
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(78, -117);
    ctx.rotate(0.21);
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.globalAlpha = 0.72;
    ctx.fillStyle = pal.skinDeep;
    ctx.beginPath();
    ctx.moveTo(-76, -102);
    ctx.bezierCurveTo(-50, -92, 50, -92, 76, -102);
    ctx.lineTo(82, -78);
    ctx.lineTo(-82, -78);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

function drawScleraEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  side: -1 | 1,
  scaleX: number,
  scaleY: number,
  eyeStyle: string,
  pal: DerivedPalette
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, scaleY);
  if (scaleY < 0.25) {
    ctx.strokeStyle = pal.outlineDark;
    ctx.lineWidth = 4.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-28, 2);
    ctx.quadraticCurveTo(0, 14, 28, 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  if (side === -1) {
    ctx.moveTo(0, -38);
    ctx.bezierCurveTo(22, -38, 33, -22, 33, 0);
    ctx.bezierCurveTo(33, 23, 19, 37, -2, 37);
    ctx.bezierCurveTo(-23, 37, -33, 22, -33, 0);
    ctx.bezierCurveTo(-33, -22, -21, -38, 0, -38);
  } else {
    ctx.moveTo(0, -38);
    ctx.bezierCurveTo(21, -38, 32, -22, 32, 0);
    ctx.bezierCurveTo(32, 22, 22, 37, 1, 37);
    ctx.bezierCurveTo(-20, 37, -32, 23, -32, 0);
    ctx.bezierCurveTo(-32, -22, -21, -38, 0, -38);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFFBE9';
  ctx.fill();
  ctx.strokeStyle = '#523733';
  ctx.lineWidth = 4.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, -1, 20.5, 23.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#49322F';
  ctx.fill();

  if (eyeStyle === 'star') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-6, -8, 6.2, 0, Math.PI * 2);
    ctx.arc(7, 8, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFrontFacialFeatures(
  ctx: CanvasRenderingContext2D,
  eyeStyle: string,
  blink: number,
  pal: DerivedPalette
) {
  if (eyeStyle === 'cool') {
    ctx.fillStyle = '#2B2427';
    ctx.strokeStyle = '#523733';
    ctx.lineWidth = 4;
    roundRectPath(ctx, -84, -190, 72, 46, 16);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, 12, -190, 72, 46, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-12, -174, 24, 9);

    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-68, -178);
    ctx.lineTo(-48, -156);
    ctx.moveTo(28, -178);
    ctx.lineTo(48, -156);
    ctx.stroke();
  } else if (eyeStyle === 'gentle') {
    ctx.strokeStyle = '#47312D';
    ctx.lineWidth = 6.2;
    ctx.lineCap = 'round';
    for (const cx of [-47, 52]) {
      ctx.beginPath();
      ctx.arc(cx, -148, 22, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
  } else if (eyeStyle === 'wink') {
    drawScleraEye(ctx, -47, -158, -1, 1, blink, eyeStyle, pal);
    ctx.strokeStyle = '#47312D';
    ctx.lineWidth = 6.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(52, -148, 22, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  } else {
    drawScleraEye(ctx, -47, -158, -1, 1, blink, eyeStyle, pal);
    drawScleraEye(ctx, 52, -158, 1, 1, blink, eyeStyle, pal);
  }

  ctx.strokeStyle = '#47312D';
  ctx.lineWidth = 4.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (eyeStyle === 'cool') {
    ctx.moveTo(-16, -118);
    ctx.quadraticCurveTo(4, -112, 22, -122);
  } else {
    ctx.moveTo(-19, -118.5);
    ctx.bezierCurveTo(-13, -115, -5, -115.8, 2.5, -118.5);
    ctx.bezierCurveTo(10, -115.8, 18, -115, 24, -118.5);
  }
  ctx.stroke();
}

function drawFrontBackHairTop(
  ctx: CanvasRenderingContext2D,
  hairStyle: string,
  pal: DerivedPalette,
  isBack: boolean
) {
  if (isBack) {
    const bottomY = hairStyle === 'bob' ? -90 : hairStyle === 'wavy' ? -66 : -82;
    ctx.beginPath();
    ctx.moveTo(-96, -158);
    if (hairStyle === 'spiky') {
      ctx.bezierCurveTo(-100, -205, -88, -242, -64, -264);
      ctx.lineTo(-44, -296);
      ctx.lineTo(-20, -268);
      ctx.lineTo(2, -304);
      ctx.lineTo(26, -268);
      ctx.lineTo(54, -292);
      ctx.lineTo(68, -260);
      ctx.bezierCurveTo(90, -240, 100, -205, 96, -158);
    } else {
      ctx.bezierCurveTo(-100, -220, -60, -266, 0, -266);
      ctx.bezierCurveTo(60, -266, 100, -220, 96, -158);
    }
    ctx.bezierCurveTo(94, -110, 66, bottomY, 0, bottomY);
    ctx.bezierCurveTo(-66, bottomY, -94, -110, -96, -158);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -268, 0, bottomY, [
      [0, pal.hairHi],
      [0.6, pal.hairMid],
      [1, pal.hairDeep],
    ]);
    ctx.fill();

    ctx.strokeStyle = pal.hairShade;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.65;
    ctx.beginPath();
    ctx.moveTo(-42, -238);
    ctx.bezierCurveTo(-50, -196, -50, -144, -40, -102);
    ctx.moveTo(42, -238);
    ctx.bezierCurveTo(50, -196, 50, -144, 40, -102);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (hairStyle === 'bun') {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = pal.hairDeep;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-46, -244);
      ctx.quadraticCurveTo(0, -236, 46, -244);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    return;
  }

  if (hairStyle === 'spiky') {
    ctx.beginPath();
    ctx.moveTo(-101, -180);
    ctx.bezierCurveTo(-102, -214, -90, -244, -64, -264);
    ctx.lineTo(-44, -296);
    ctx.lineTo(-20, -268);
    ctx.lineTo(2, -304);
    ctx.lineTo(26, -268);
    ctx.lineTo(54, -292);
    ctx.lineTo(68, -260);
    ctx.bezierCurveTo(92, -242, 102, -212, 102, -180);
    ctx.bezierCurveTo(94, -181, 88, -186, 82, -198);
    ctx.bezierCurveTo(58, -210, 32, -216, 0, -214);
    ctx.bezierCurveTo(-32, -216, -58, -210, -82, -198);
    ctx.bezierCurveTo(-88, -186, -94, -181, -101, -180);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -300, 0, -180, [
      [0, pal.hairHi],
      [0.65, pal.hairMid],
      [1, pal.hairShade],
    ]);
    ctx.fill();
  } else if (hairStyle === 'sidepart') {
    ctx.beginPath();
    ctx.moveTo(-101, -180);
    ctx.bezierCurveTo(-99, -208, -93, -227, -81, -240);
    ctx.bezierCurveTo(-63, -258, -32, -270, 0, -270);
    ctx.bezierCurveTo(33, -270, 65, -258, 83, -240);
    ctx.bezierCurveTo(95, -227, 101, -208, 102, -180);
    ctx.bezierCurveTo(92, -182, 86, -194, 72, -204);
    ctx.bezierCurveTo(32, -214, -18, -218, -84, -188);
    ctx.bezierCurveTo(-90, -182, -96, -180, -101, -180);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -270, 0, -180, [
      [0, pal.hairHi],
      [0.65, pal.hairMid],
      [1, pal.hairShade],
    ]);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-101, -180);
    ctx.bezierCurveTo(-101, -174, -98, -169, -90, -167);
    ctx.bezierCurveTo(-88, -179, -86, -189, -83, -199);
    ctx.bezierCurveTo(-68, -207, -48, -211, -17, -212);
    ctx.bezierCurveTo(-10, -220, -5, -231, -1, -239);
    ctx.bezierCurveTo(4, -231, 9, -220, 15, -212);
    ctx.bezierCurveTo(46, -211, 66, -207, 83, -199);
    ctx.bezierCurveTo(86, -189, 88, -179, 90, -167);
    ctx.bezierCurveTo(98, -169, 101, -174, 102, -181);
    ctx.lineTo(98, -210);
    ctx.lineTo(-97, -210);
    ctx.closePath();
    ctx.fillStyle = pal.hairDeep;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-101, -180);
    ctx.bezierCurveTo(-100, -206, -95, -225, -83, -238);
    ctx.bezierCurveTo(-65, -256, -33, -269, -1, -270);
    ctx.bezierCurveTo(32, -269, 64, -256, 82, -238);
    ctx.bezierCurveTo(94, -225, 100, -206, 102, -181);
    ctx.bezierCurveTo(94, -180, 90, -184, 87, -200);
    ctx.bezierCurveTo(71, -211, 50, -218, 14, -219);
    ctx.bezierCurveTo(10, -228, 6, -238, -1, -245);
    ctx.bezierCurveTo(-8, -238, -12, -228, -16, -219);
    ctx.bezierCurveTo(-52, -218, -71, -211, -86, -200);
    ctx.bezierCurveTo(-90, -184, -94, -180, -101, -180);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -270, 0, -180, [
      [0, pal.hairHi],
      [0.62, pal.hairMid],
      [1, pal.hairShade],
    ]);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = pal.hairDeep;
    ctx.beginPath();
    ctx.moveTo(-100, -199);
    ctx.bezierCurveTo(-96, -195, -92, -194, -87, -196);
    ctx.lineTo(-90, -167);
    ctx.bezierCurveTo(-98, -169, -101, -174, -101, -181);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(101, -199);
    ctx.bezierCurveTo(97, -195, 93, -194, 88, -196);
    ctx.lineTo(90, -167);
    ctx.bezierCurveTo(98, -169, 101, -174, 102, -181);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = pal.hairShade;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.moveTo(-58, -243);
    ctx.bezierCurveTo(-64, -234, -67, -223, -67, -212);
    ctx.moveTo(59, -242);
    ctx.bezierCurveTo(64, -233, 67, -223, 67, -212);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  for (const side of [-1, 1] as const) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(-47, -224);
    ctx.lineTo(-27, -223);
    ctx.bezierCurveTo(-22, -222, -17, -218, -15, -213);
    ctx.lineTo(-14, -199);
    ctx.bezierCurveTo(-15, -193, -20, -188, -26, -186);
    ctx.lineTo(-45, -187);
    ctx.bezierCurveTo(-51, -189, -56, -194, -57, -200);
    ctx.lineTo(-57, -214);
    ctx.bezierCurveTo(-56, -219, -52, -223, -47, -224);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -224, 0, -186, [
      [0, pal.browTop],
      [0.78, pal.browBot],
      [1, pal.browRim],
    ]);
    ctx.fill();

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = pal.browRim;
    ctx.beginPath();
    ctx.moveTo(-56, -200);
    ctx.bezierCurveTo(-53, -193, -46, -189, -27, -189);
    ctx.bezierCurveTo(-21, -190, -17, -193, -15, -198);
    ctx.bezierCurveTo(-16, -192, -20, -187, -26, -186);
    ctx.lineTo(-45, -187);
    ctx.bezierCurveTo(-51, -189, -55, -194, -56, -200);
    ctx.fill();
    ctx.restore();
  }
}

function drawFrontBackAccessory(
  ctx: CanvasRenderingContext2D,
  accessory: string,
  isBack: boolean,
  eyeStyle: string,
  hairStyle: string
) {
  if (!accessory || accessory === 'none') return;

  if (accessory === 'headphones') {
    ctx.strokeStyle = '#332A2E';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, -178, 108, Math.PI * 1.06, -0.06 * Math.PI);
    ctx.stroke();

    ctx.strokeStyle = '#5B4E52';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, -178, 110, Math.PI * 1.15, -0.15 * Math.PI);
    ctx.stroke();

    for (const s of [-1, 1] as const) {
      const ex = s * 106;
      roundRectPath(ctx, ex - 15, -186, 30, 56, 14);
      ctx.fillStyle = makeGrad(ctx, ex, -186, ex, -130, [
        [0, '#FF7B59'],
        [1, '#E04628'],
      ]);
      ctx.fill();
      roundRectPath(ctx, ex - 6, -174, 12, 32, 6);
      ctx.fillStyle = '#FFFCE2';
      ctx.fill();
    }
  } else if (accessory === 'beret') {
    ctx.save();
    ctx.translate(hairStyle === 'bun' ? -24 : 10, hairStyle === 'bun' ? -258 : -252);
    ctx.rotate(hairStyle === 'bun' ? -0.34 : -0.18);
    ctx.beginPath();
    ctx.ellipse(0, 0, 74, 34, 0, 0, Math.PI * 2);
    ctx.fillStyle = makeGrad(ctx, 0, -34, 0, 34, [
      [0, '#F04E6E'],
      [0.65, '#CE2C4E'],
      [1, '#9A1B36'],
    ]);
    ctx.fill();
    ctx.fillStyle = '#9A1B36';
    roundRectPath(ctx, -4, -44, 8, 14, 4);
    ctx.fill();
    ctx.restore();
  } else if (accessory === 'catEars') {
    for (const s of [-1, 1] as const) {
      ctx.save();
      ctx.scale(s, 1);
      ctx.beginPath();
      ctx.moveTo(-82, -228);
      ctx.bezierCurveTo(-86, -264, -74, -296, -58, -304);
      ctx.bezierCurveTo(-40, -288, -28, -262, -24, -246);
      ctx.closePath();
      ctx.fillStyle = makeGrad(ctx, -60, -304, -40, -230, [
        [0, '#4B3635'],
        [1, '#2B1F1E'],
      ]);
      ctx.fill();

      if (!isBack) {
        ctx.beginPath();
        ctx.moveTo(-72, -238);
        ctx.bezierCurveTo(-72, -260, -64, -278, -56, -284);
        ctx.bezierCurveTo(-45, -274, -38, -258, -36, -246);
        ctx.closePath();
        ctx.fillStyle = '#FF7E85';
        ctx.fill();
      }
      ctx.restore();
    }
  } else if (accessory === 'crown') {
    ctx.save();
    if (hairStyle === 'bun') ctx.translate(0, -82);
    ctx.beginPath();
    ctx.moveTo(-42, -254);
    ctx.lineTo(-48, -302);
    ctx.lineTo(-18, -276);
    ctx.lineTo(0, -314);
    ctx.lineTo(18, -276);
    ctx.lineTo(48, -302);
    ctx.lineTo(42, -254);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -314, 0, -254, [
      [0, '#FFEE58'],
      [0.6, '#F59E0B'],
      [1, '#D97706'],
    ]);
    ctx.fill();
    ctx.restore();
  } else if (accessory === 'glasses' && !isBack && eyeStyle !== 'cool') {
    ctx.strokeStyle = '#523733';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.arc(-47, -158, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(52, -158, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-13, -158);
    ctx.quadraticCurveTo(2, -165, 18, -158);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-66, -174);
    ctx.lineTo(-56, -164);
    ctx.moveTo(33, -174);
    ctx.lineTo(43, -164);
    ctx.stroke();
  }
}

/* ─────────────────────────── 侧面 (3/4 Profile, 朝左 -X) 部件 ─────────────────────────── */

function drawSideRearHair(
  ctx: CanvasRenderingContext2D,
  hairStyle: string,
  pal: DerivedPalette
) {
  if (hairStyle === 'bun') {
    ctx.save();
    ctx.translate(22, -4);
    ctx.rotate(0.14);
    ctx.beginPath();
    ctx.moveTo(-66, -245);
    ctx.bezierCurveTo(-72, -252, -74, -264, -72, -276);
    ctx.lineTo(-64, -306);
    ctx.bezierCurveTo(-60, -319, -50, -330, -38, -336);
    ctx.lineTo(-14, -345);
    ctx.bezierCurveTo(0, -347, 16, -346, 28, -342);
    ctx.lineTo(50, -330);
    ctx.bezierCurveTo(60, -321, 68, -309, 71, -296);
    ctx.lineTo(75, -270);
    ctx.bezierCurveTo(77, -258, 73, -246, 65, -240);
    ctx.bezierCurveTo(44, -234, -44, -235, -66, -245);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, -20, -342, 30, -236, [
      [0, pal.hairHi],
      [0.55, pal.hairMid],
      [0.85, pal.hairShade],
      [1, pal.hairDeep],
    ]);
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = pal.hairDeep;
    ctx.beginPath();
    ctx.moveTo(-70, -278);
    ctx.bezierCurveTo(-40, -266, 20, -262, 74, -252);
    ctx.bezierCurveTo(72, -246, 68, -242, 65, -240);
    ctx.bezierCurveTo(44, -234, -44, -235, -66, -245);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (hairStyle === 'wavy') {
    ctx.beginPath();
    ctx.moveTo(0, -254);
    ctx.bezierCurveTo(68, -254, 102, -204, 102, -138);
    ctx.bezierCurveTo(104, -92, 92, -62, 68, -58);
    ctx.bezierCurveTo(36, -54, 6, -64, -10, -82);
    ctx.lineTo(-10, -200);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 20, -250, 60, -58, [
      [0, pal.hairMid],
      [0.65, pal.hairShade],
      [1, pal.hairDeep],
    ]);
    ctx.fill();
  } else if (hairStyle === 'bob') {
    ctx.beginPath();
    ctx.moveTo(-8, -252);
    ctx.bezierCurveTo(66, -252, 98, -204, 96, -142);
    ctx.bezierCurveTo(94, -106, 78, -88, 52, -88);
    ctx.bezierCurveTo(22, -88, 0, -98, -10, -110);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 20, -245, 50, -88, [
      [0, pal.hairShade],
      [1, pal.hairDeep],
    ]);
    ctx.fill();
  }
}

function drawSideLeg(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string,
  legPose: LegBonePose,
  isSitting: boolean,
  isFar: boolean
) {
  ctx.save();
  const hipX = isFar ? -8 : 8;
  const hipY = isSitting ? 38 : 28;
  ctx.translate(hipX, hipY + legPose.liftY);
  if (isFar) ctx.scale(0.95, isSitting ? 0.56 : 0.98);
  else if (isSitting) ctx.scale(1, 0.58);
  ctx.rotate(legPose.swingRot);

  // 腿柱
  ctx.beginPath();
  ctx.moveTo(-10.5, 0);
  ctx.lineTo(11.5, 0);
  ctx.lineTo(10.5, 47);
  ctx.bezierCurveTo(10.5, 51, -10.5, 51, -10.5, 47);
  ctx.closePath();
  ctx.fillStyle = makeGrad(ctx, 0, 0, 0, 50, [
    [0, isFar ? pal.armMid : pal.legTop],
    [0.32, isFar ? pal.skinShade : pal.skinMid],
    [1, isFar ? pal.skinDeep : pal.skinShade],
  ]);
  ctx.fill();

  // 膝上阴影
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = isFar ? pal.armMid : pal.legTop;
  ctx.beginPath();
  ctx.moveTo(-6, 2);
  ctx.lineTo(8, 2);
  ctx.lineTo(6, 25);
  ctx.bezierCurveTo(4, 30, -3, 30, -5, 24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 侧面鞋履（脚尖朝左 -X，鞋跟在 +X）
  ctx.save();
  ctx.translate(-3, 50);
  ctx.rotate(legPose.ankleTilt);

  if (outfitStyle === 'overalls' || outfitStyle === 'blazer') {
    ctx.beginPath();
    ctx.ellipse(-2, 2, 18.5, 9.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.shoeSole;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-2, -0.5, 17, 8.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = outfitStyle === 'blazer' ? '#3B2C2A' : pal.shoeUpper;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-7, -3.5, 8, 3.4, -0.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fill();
  } else {
    // 侧面凉鞋（前掌微延、圆润凉鞋带）
    ctx.beginPath();
    ctx.ellipse(-2, 2.5, 18, 9, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.shoeSole;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-2, -0.2, 16.5, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.shoeUpper;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-2, -2.5, 11, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = isFar ? pal.skinShade : pal.skinMid;
    ctx.fill();

    // 横向凉鞋鞋带
    ctx.beginPath();
    ctx.moveTo(-14, -1.5);
    ctx.bezierCurveTo(-10, -9, 3, -9, 8, -2);
    ctx.bezierCurveTo(8, 1, 5, 2, 3, 0);
    ctx.bezierCurveTo(-1, -4, -7, -4, -11, 0);
    ctx.bezierCurveTo(-13, 1.5, -14, 0.5, -14, -1.5);
    ctx.fillStyle = pal.shoeStrap;
    ctx.fill();
  }
  ctx.restore();

  ctx.restore();
}

function drawSideBottoms(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string
) {
  if (outfitStyle === 'dress') return;

  if (outfitStyle === 'overalls') {
    ctx.beginPath();
    ctx.moveTo(-40, -18);
    ctx.lineTo(42, -18);
    ctx.lineTo(46, 24);
    ctx.bezierCurveTo(42, 32, -42, 32, -45, 24);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -18, 0, 32, [
      [0, pal.bottomHi],
      [0.6, pal.bottomMid],
      [1, pal.bottomDeep],
    ]);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(-41, -20);
    ctx.lineTo(41, -20);
    ctx.bezierCurveTo(45, -2, 47, 14, 44, 24);
    ctx.bezierCurveTo(40, 31, 22, 34, 0, 34);
    ctx.bezierCurveTo(-22, 34, -40, 31, -44, 24);
    ctx.bezierCurveTo(-47, 14, -45, -2, -41, -20);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -20, 0, 34, [
      [0, pal.bottomMid],
      [0.25, pal.bottomHi],
      [0.8, pal.bottomMid],
      [1, pal.bottomDeep],
    ]);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = pal.bottomDeep;
    ctx.beginPath();
    ctx.moveTo(44, -4);
    ctx.bezierCurveTo(37, 11, 26, 16, 14, 11);
    ctx.bezierCurveTo(20, 17, 34, 18, 45, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawSideTorso(
  ctx: CanvasRenderingContext2D,
  pal: DerivedPalette,
  outfitStyle: string
) {
  // 侧面脖子
  ctx.beginPath();
  ctx.moveTo(-26, -86);
  ctx.lineTo(28, -86);
  ctx.lineTo(25, -53);
  ctx.lineTo(-24, -53);
  ctx.closePath();
  ctx.fillStyle = makeGrad(ctx, 0, -86, 0, -53, [
    [0, pal.armDeep],
    [0.35, pal.armMid],
    [1, pal.skinShade],
  ]);
  ctx.fill();

  if (outfitStyle === 'overalls') {
    ctx.beginPath();
    ctx.moveTo(-44, -86);
    ctx.bezierCurveTo(-52, -72, -52, -32, -45, -16);
    ctx.lineTo(44, -16);
    ctx.bezierCurveTo(50, -34, 50, -72, 42, -86);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, -20, -86, 20, -16, [
      [0, pal.outHi],
      [0.55, pal.outMid],
      [1, pal.outShade],
    ]);
    ctx.fill();

    ctx.fillStyle = makeGrad(ctx, 0, -68, 0, -14, [
      [0, pal.bottomHi],
      [1, pal.bottomMid],
    ]);
    roundRectPath(ctx, -40, -52, 80, 38, 10);
    ctx.fill();
    ctx.fillRect(-10, -86, 16, 42);
    ctx.fillStyle = pal.outHi;
    ctx.beginPath();
    ctx.arc(-2, -46, 4.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (outfitStyle === 'dress') {
    ctx.beginPath();
    ctx.moveTo(-42, -86);
    ctx.bezierCurveTo(-54, -72, -52, -26, -60, 28);
    ctx.bezierCurveTo(-36, 38, 38, 38, 60, 28);
    ctx.bezierCurveTo(52, -26, 54, -72, 42, -86);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -86, 0, 36, [
      [0, pal.outHi],
      [0.45, pal.outMid],
      [0.85, pal.outShade],
      [1, pal.outDeep],
    ]);
    ctx.fill();

    ctx.fillStyle = '#FFFCE2';
    ctx.beginPath();
    ctx.ellipse(-20, -76, 16, 9, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.outCrease;
    ctx.globalAlpha = 0.72;
    roundRectPath(ctx, -40, -34, 80, 10, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  if (outfitStyle === 'knit') {
    ctx.beginPath();
    ctx.moveTo(-44, -88);
    ctx.bezierCurveTo(-55, -72, -54, -28, -44, -10);
    ctx.lineTo(44, -10);
    ctx.bezierCurveTo(54, -28, 55, -72, 44, -88);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -88, 0, -10, [
      [0, pal.outHi],
      [0.55, pal.outMid],
      [1, pal.outShade],
    ]);
    ctx.fill();

    ctx.fillStyle = '#FFFCE2';
    ctx.beginPath();
    ctx.ellipse(-6, -79, 24, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.outDeep;
    ctx.globalAlpha = 0.7;
    roundRectPath(ctx, -46, -20, 92, 11, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }

  // hoodie & blazer 侧面
  const isBlazer = outfitStyle === 'blazer';

  // 前胸微微露出的奶白条纹内搭（朝左 -X 侧）
  ctx.save();
  ctx.beginPath();
  ctx.rect(-40, -64, 24, 48);
  ctx.clip();
  ctx.fillStyle = '#FFFCE2';
  ctx.fillRect(-40, -64, 24, 48);
  if (!isBlazer) {
    ctx.fillStyle = '#F4EC8E';
    ctx.fillRect(-35, -64, 7, 48);
    ctx.fillRect(-23, -64, 7, 48);
  }
  ctx.restore();

  // 夹克侧面主体（留出前襟开口线条）
  ctx.beginPath();
  ctx.moveTo(-34, -88);
  ctx.lineTo(44, -88);
  ctx.bezierCurveTo(56, -76, 56, -34, 48, 4);
  ctx.bezierCurveTo(42, 12, 12, 13, -18, 10);
  ctx.bezierCurveTo(-28, 8, -32, -8, -30, -34);
  ctx.lineTo(-22, -56);
  ctx.closePath();
  ctx.fillStyle = makeGrad(ctx, -20, -86, 36, 12, [
    [0, pal.outHi],
    [0.45, pal.outMid],
    [0.85, pal.outShade],
    [1, pal.outDeep],
  ]);
  ctx.fill();

  // 前片微露左襟边
  ctx.beginPath();
  ctx.moveTo(-42, -84);
  ctx.bezierCurveTo(-48, -68, -48, -28, -43, 2);
  ctx.bezierCurveTo(-39, 9, -32, 9, -32, -8);
  ctx.lineTo(-32, -62);
  ctx.closePath();
  ctx.fillStyle = pal.outShade;
  ctx.fill();

  // 侧面下摆暗弧
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = pal.outCrease;
  ctx.beginPath();
  ctx.moveTo(-24, 4);
  ctx.bezierCurveTo(2, 11, 34, 10, 48, 1);
  ctx.bezierCurveTo(45, 11, 14, 14, -22, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 侧面翻领（从后颈绕至前胸自然垂落）
  ctx.beginPath();
  ctx.moveTo(30, -88);
  ctx.bezierCurveTo(28, -74, 12, -56, -8, -50);
  ctx.bezierCurveTo(-18, -46, -26, -47, -28, -53);
  ctx.bezierCurveTo(-28, -62, -18, -76, -6, -85);
  ctx.lineTo(22, -88);
  ctx.closePath();
  ctx.fillStyle = makeGrad(ctx, 26, -86, -24, -48, [
    [0, pal.outDeep],
    [0.48, pal.outShade],
    [0.85, pal.outHi],
    [1, pal.outDeep],
  ]);
  ctx.fill();

  ctx.strokeStyle = pal.outCrease;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(26, -80);
  ctx.bezierCurveTo(18, -65, 2, -52, -24, -49);
  ctx.stroke();
}

function drawSideHeadAndFace(
  ctx: CanvasRenderingContext2D,
  avatar: AvatarConfig,
  pal: DerivedPalette,
  blink: number
) {
  // 侧面头型（左颊微微圆润突出 -95，后脑勺在 +88）
  const traceSideHead = () => {
    ctx.beginPath();
    ctx.moveTo(-84, -210);
    ctx.bezierCurveTo(-93, -182, -96, -154, -93, -134);
    ctx.bezierCurveTo(-90, -104, -64, -82, -4, -82);
    ctx.bezierCurveTo(52, -82, 82, -98, 86, -124);
    ctx.bezierCurveTo(92, -152, 92, -184, 86, -210);
    ctx.bezierCurveTo(78, -240, 44, -254, -2, -254);
    ctx.bezierCurveTo(-48, -254, -76, -240, -84, -210);
    ctx.closePath();
  };

  traceSideHead();
  ctx.fillStyle = makeGrad(ctx, 0, -245, 0, -82, [
    [0, pal.skinHi],
    [0.7, pal.skinMid],
    [0.92, pal.skinShade],
    [1, pal.skinDeep],
  ]);
  ctx.fill();

  // 额头影与侧脸腮红
  ctx.save();
  traceSideHead();
  ctx.clip();

  ctx.beginPath();
  ctx.moveTo(-98, -248);
  ctx.lineTo(98, -248);
  ctx.lineTo(98, -184);
  ctx.bezierCurveTo(64, -197, 24, -201, -12, -201);
  ctx.bezierCurveTo(-46, -201, -76, -195, -98, -184);
  ctx.closePath();
  const fhGrad = ctx.createLinearGradient(0, -248, 0, -184);
  fhGrad.addColorStop(0, pal.foreheadShadow);
  fhGrad.addColorStop(0.68, pal.foreheadShadowSoft);
  fhGrad.addColorStop(1, pal.foreheadShadowZero);
  ctx.fillStyle = fhGrad;
  ctx.fill();

  // 近侧颊桃粉腮红
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = pal.blush;
  ctx.save();
  ctx.translate(4, -118);
  ctx.rotate(0.16);
  ctx.beginPath();
  ctx.ellipse(0, 0, 19, 23, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 远侧微露腮红
  ctx.save();
  ctx.translate(-82, -122);
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 下巴底缘微光阴影
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = pal.skinDeep;
  ctx.beginPath();
  ctx.moveTo(-72, -102);
  ctx.bezierCurveTo(-46, -92, 48, -92, 74, -102);
  ctx.lineTo(82, -78);
  ctx.lineTo(-82, -78);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // 侧面五官（远眼偏窄位于 -66，近眼完整位于 -10，猫咪嘴位于 -44）
  const eyeStyle = avatar.eyeStyle;
  if (eyeStyle === 'cool') {
    ctx.fillStyle = '#2B2427';
    ctx.strokeStyle = '#523733';
    ctx.lineWidth = 4;
    roundRectPath(ctx, -90, -190, 44, 44, 14);
    ctx.fill();
    ctx.stroke();
    roundRectPath(ctx, -38, -190, 68, 46, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-48, -174, 12, 8);
    ctx.fillRect(28, -174, 24, 7);

    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 4.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, -178);
    ctx.lineTo(-4, -156);
    ctx.stroke();
  } else if (eyeStyle === 'gentle') {
    ctx.strokeStyle = '#47312D';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-68, -148, 16, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-12, -148, 22, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  } else if (eyeStyle === 'wink') {
    drawScleraEye(ctx, -68, -158, -1, 0.72, blink, eyeStyle, pal);
    ctx.strokeStyle = '#47312D';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(-10, -148, 22, Math.PI * 1.12, Math.PI * 1.88);
    ctx.stroke();
  } else {
    drawScleraEye(ctx, -68, -158, -1, 0.72, blink, eyeStyle, pal);
    drawScleraEye(ctx, -10, -158, 1, 0.96, blink, eyeStyle, pal);
  }

  // 侧面猫咪嘴
  ctx.strokeStyle = '#47312D';
  ctx.lineWidth = 4.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (eyeStyle === 'cool') {
    ctx.moveTo(-58, -118);
    ctx.quadraticCurveTo(-42, -112, -26, -121);
  } else {
    ctx.moveTo(-58, -118.5);
    ctx.bezierCurveTo(-53, -115, -47, -115.8, -42, -118.5);
    ctx.bezierCurveTo(-36, -115.8, -30, -115, -24, -118.5);
  }
  ctx.stroke();

  // 近侧立体耳朵（位于侧脑中后方 +42）
  ctx.save();
  ctx.translate(42, 0);
  ctx.beginPath();
  ctx.moveTo(-6, -168);
  ctx.bezierCurveTo(4, -174, 17, -171, 23, -161);
  ctx.bezierCurveTo(29, -150, 28, -131, 21, -119);
  ctx.bezierCurveTo(15, -110, 2, -107, -9, -112);
  ctx.closePath();
  ctx.fillStyle = pal.skinMid;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(24, -129);
  ctx.bezierCurveTo(20, -117, 9, -112, -8, -115);
  ctx.lineTo(-9, -112);
  ctx.bezierCurveTo(4, -107, 16, -110, 22, -120);
  ctx.closePath();
  ctx.fillStyle = pal.skinDeep;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-3, -152);
  ctx.bezierCurveTo(3, -162, 15, -161, 19, -151);
  ctx.bezierCurveTo(22, -142, 19, -128, 12, -122);
  ctx.bezierCurveTo(8, -119, 2, -120, -1, -125);
  ctx.bezierCurveTo(4, -127, 9, -132, 9, -139);
  ctx.bezierCurveTo(9, -146, 3, -150, -3, -146);
  ctx.closePath();
  ctx.fillStyle = pal.earInner;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-4, -144);
  ctx.bezierCurveTo(2, -147, 7, -143, 7, -137);
  ctx.bezierCurveTo(7, -131, 2, -127, -4, -129);
  ctx.closePath();
  ctx.fillStyle = pal.earInnerSoft;
  ctx.fill();
  ctx.restore();
}

function drawSideHairTop(
  ctx: CanvasRenderingContext2D,
  hairStyle: string,
  pal: DerivedPalette
) {
  // 侧面顶发包裹后脑（+X）并在前额（-X）留下刘海与鬓角
  if (hairStyle === 'spiky') {
    ctx.beginPath();
    ctx.moveTo(-92, -182);
    ctx.bezierCurveTo(-92, -214, -80, -242, -52, -260);
    ctx.lineTo(-32, -296);
    ctx.lineTo(-6, -268);
    ctx.lineTo(18, -304);
    ctx.lineTo(40, -268);
    ctx.lineTo(68, -288);
    ctx.lineTo(76, -252);
    ctx.bezierCurveTo(96, -228, 100, -184, 92, -124);
    ctx.bezierCurveTo(84, -104, 68, -98, 58, -104);
    // 绕过近侧耳朵后沿收起，露出立体耳朵
    ctx.bezierCurveTo(72, -120, 74, -156, 62, -172);
    ctx.bezierCurveTo(50, -184, 34, -182, 26, -172);
    ctx.bezierCurveTo(28, -154, 24, -140, 18, -138);
    ctx.bezierCurveTo(16, -158, 16, -176, 12, -190);
    ctx.bezierCurveTo(-12, -208, -44, -214, -72, -198);
    ctx.bezierCurveTo(-80, -188, -86, -182, -92, -182);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -300, 0, -100, [
      [0, pal.hairHi],
      [0.65, pal.hairMid],
      [1, pal.hairShade],
    ]);
    ctx.fill();
  } else {
    // 脑后包裹发帽 + 前额刘海（绕开耳廓位置，耳前保留柔和鬓角）
    ctx.beginPath();
    ctx.moveTo(-92, -184);
    ctx.bezierCurveTo(-92, -218, -72, -256, -18, -268);
    ctx.bezierCurveTo(42, -274, 88, -242, 96, -186);
    ctx.bezierCurveTo(100, -140, 92, -102, 72, -86);
    ctx.bezierCurveTo(60, -84, 52, -92, 54, -106);
    ctx.bezierCurveTo(70, -120, 74, -152, 62, -172);
    ctx.bezierCurveTo(50, -184, 34, -182, 26, -172);
    ctx.bezierCurveTo(28, -154, 24, -138, 18, -136);
    ctx.bezierCurveTo(14, -156, 14, -176, 12, -196);
    if (hairStyle === 'sidepart') {
      ctx.bezierCurveTo(-18, -212, -52, -212, -78, -184);
    } else {
      ctx.bezierCurveTo(-2, -212, -20, -216, -36, -222);
      ctx.bezierCurveTo(-40, -234, -44, -240, -48, -242);
      ctx.bezierCurveTo(-54, -236, -58, -226, -62, -216);
      ctx.bezierCurveTo(-76, -208, -84, -196, -92, -184);
    }
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -270, 20, -86, [
      [0, pal.hairHi],
      [0.62, pal.hairMid],
      [1, pal.hairDeep],
    ]);
    ctx.fill();

    // 耳前鬓角短发阴影块
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = pal.hairDeep;
    ctx.beginPath();
    ctx.moveTo(14, -194);
    ctx.bezierCurveTo(22, -178, 24, -156, 18, -136);
    ctx.bezierCurveTo(14, -140, 10, -152, 10, -170);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 侧面双粗圆短眉
  const drawSideBrow = (bx: number, scaleX: number) => {
    ctx.save();
    ctx.translate(bx, 0);
    ctx.scale(scaleX, 1);
    ctx.beginPath();
    ctx.moveTo(-16, -224);
    ctx.lineTo(8, -223);
    ctx.bezierCurveTo(13, -222, 17, -218, 19, -213);
    ctx.lineTo(19, -199);
    ctx.bezierCurveTo(18, -193, 13, -188, 7, -186);
    ctx.lineTo(-14, -187);
    ctx.bezierCurveTo(-20, -189, -24, -194, -25, -200);
    ctx.lineTo(-25, -214);
    ctx.bezierCurveTo(-24, -219, -20, -223, -16, -224);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -224, 0, -186, [
      [0, pal.browTop],
      [0.78, pal.browBot],
      [1, pal.browRim],
    ]);
    ctx.fill();
    ctx.restore();
  };
  drawSideBrow(-68, 0.72);
  drawSideBrow(-12, 0.96);
}

function drawSideAccessory(
  ctx: CanvasRenderingContext2D,
  accessory: string,
  eyeStyle: string,
  hairStyle: string
) {
  if (!accessory || accessory === 'none') return;

  if (accessory === 'headphones') {
    // 侧面头梁 + 正对镜头的包耳耳机
    ctx.strokeStyle = '#332A2E';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(14, -176, 98, Math.PI * 1.24, Math.PI * 1.88);
    ctx.stroke();

    roundRectPath(ctx, 18, -186, 46, 58, 20);
    ctx.fillStyle = makeGrad(ctx, 41, -186, 41, -128, [
      [0, '#FF7B59'],
      [1, '#E04628'],
    ]);
    ctx.fill();
    roundRectPath(ctx, 29, -173, 24, 32, 10);
    ctx.fillStyle = '#FFFCE2';
    ctx.fill();
  } else if (accessory === 'beret') {
    ctx.save();
    ctx.translate(hairStyle === 'bun' ? 28 : 14, hairStyle === 'bun' ? -258 : -252);
    ctx.rotate(0.24);
    ctx.beginPath();
    ctx.ellipse(0, 0, 70, 32, 0, 0, Math.PI * 2);
    ctx.fillStyle = makeGrad(ctx, 0, -32, 0, 32, [
      [0, '#F04E6E'],
      [0.65, '#CE2C4E'],
      [1, '#9A1B36'],
    ]);
    ctx.fill();
    ctx.fillStyle = '#9A1B36';
    roundRectPath(ctx, -4, -42, 8, 13, 4);
    ctx.fill();
    ctx.restore();
  } else if (accessory === 'catEars') {
    // 远耳 + 近耳错落透视
    for (const [ox, sc] of [
      [-18, 0.84],
      [16, 1],
    ] as Array<[number, number]>) {
      ctx.save();
      ctx.translate(ox, 0);
      ctx.scale(sc, sc);
      ctx.beginPath();
      ctx.moveTo(-24, -242);
      ctx.bezierCurveTo(-18, -280, -2, -304, 16, -304);
      ctx.bezierCurveTo(28, -284, 32, -258, 30, -242);
      ctx.closePath();
      ctx.fillStyle = makeGrad(ctx, 0, -304, 10, -238, [
        [0, '#4B3635'],
        [1, '#2B1F1E'],
      ]);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(-14, -246);
      ctx.bezierCurveTo(-10, -268, 2, -284, 12, -286);
      ctx.bezierCurveTo(20, -274, 22, -258, 20, -246);
      ctx.closePath();
      ctx.fillStyle = '#FF7E85';
      ctx.fill();
      ctx.restore();
    }
  } else if (accessory === 'crown') {
    ctx.save();
    if (hairStyle === 'bun') ctx.translate(18, -84);
    ctx.beginPath();
    ctx.moveTo(-36, -254);
    ctx.lineTo(-42, -300);
    ctx.lineTo(-14, -276);
    ctx.lineTo(0, -312);
    ctx.lineTo(14, -276);
    ctx.lineTo(42, -300);
    ctx.lineTo(36, -254);
    ctx.closePath();
    ctx.fillStyle = makeGrad(ctx, 0, -312, 0, -254, [
      [0, '#FFEE58'],
      [0.6, '#F59E0B'],
      [1, '#D97706'],
    ]);
    ctx.fill();
    ctx.restore();
  } else if (accessory === 'glasses' && eyeStyle !== 'cool') {
    ctx.strokeStyle = '#523733';
    ctx.lineWidth = 4.4;
    ctx.beginPath();
    ctx.ellipse(-68, -158, 24, 32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-10, -158, 32, 33, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-44, -158);
    ctx.quadraticCurveTo(-40, -164, -36, -158);
    ctx.moveTo(22, -158);
    ctx.lineTo(42, -152); // 眼镜腿搭上耳廓
    ctx.stroke();
  }
}
