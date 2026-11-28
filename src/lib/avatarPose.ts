import { AvatarConfig } from '../types/metaverse';

export const INK_COLOR = '#231E29';

interface HSL {
  h: number;
  s: number;
  l: number;
}

export function parseHex(hex: string, fallback = '#FCE2D4'): [number, number, number] {
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

export function rgbToHsl(r: number, g: number, b: number): HSL {
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

export function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hh < 60) {
    rn = c;
    gn = x;
  } else if (hh < 120) {
    rn = x;
    gn = c;
  } else if (hh < 180) {
    gn = c;
    bn = x;
  } else if (hh < 240) {
    gn = x;
    bn = c;
  } else if (hh < 300) {
    rn = x;
    bn = c;
  } else {
    rn = c;
    bn = x;
  }
  const toHex = (v: number) =>
    Math.round(Math.max(0, Math.min(255, (v + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rn)}${toHex(gn)}${toHex(bn)}`.toUpperCase();
}

export function shiftHex(
  hex: string,
  dl: number,
  ds = 0,
  dh = 0,
  fallback = '#4589E8'
): string {
  const [r, g, b] = parseHex(hex, fallback);
  const { h, s, l } = rgbToHsl(r, g, b);
  return hslToHex(h + dh, s + ds, l + dl);
}

export interface ChibiPalette {
  ink: string;
  // Skin
  skinBase: string;
  skinShade: string;
  skinHi: string;
  blush: string;
  // Hair
  hairBase: string;
  hairShade: string;
  hairHi: string;
  hairDeep: string;
  // Outfit top
  topBase: string;
  topShade: string;
  topHi: string;
  emblem: string;
  // Belt & metallic accents
  beltBase: string;
  beltShade: string;
  chainLight: string;
  chainShade: string;
  // Skirt / bottoms
  skirtBase: string;
  skirtShade: string;
  skirtHi: string;
  // Socks & Boots
  sockBase: string;
  sockShade: string;
  bootBase: string;
  bootShade: string;
  bootSole: string;
  laceColor: string;
  // Baseball cap (white front + outfit-harmonized colored panels)
  capFront: string;
  capFrontShade: string;
  capSide: string;
  capSideShade: string;
  capStrap: string;
}

export function deriveChibiPalette(avatar: AvatarConfig): ChibiPalette {
  const skinRaw = (avatar.skinColor || '#FCE2D4').toUpperCase();
  const hairRaw = (avatar.hairColor || '#FFE338').toUpperCase();
  const outRaw = (avatar.outfitColor || '#4589E8').toUpperCase();

  const isDefaultSkin = skinRaw === '#FCE2D4';
  const isDefaultHair = hairRaw === '#FFE338';
  const isDefaultOutfit = outRaw === '#4589E8';

  const skinBase = isDefaultSkin ? '#FCE2D4' : skinRaw;
  const skinShade = isDefaultSkin ? '#F2C4B6' : shiftHex(skinRaw, -10, 6, -4, '#FCE2D4');
  const skinHi = isDefaultSkin ? '#FFF2EA' : shiftHex(skinRaw, 7, -6, 2, '#FCE2D4');
  const blush = isDefaultSkin ? '#F9A9B8' : shiftHex(skinRaw, -10, 26, -14, '#FCE2D4');

  const hairBase = isDefaultHair ? '#FFE338' : hairRaw;
  const hairShade = isDefaultHair ? '#EEB61C' : shiftHex(hairRaw, -13, 8, -8, '#FFE338');
  const hairHi = isDefaultHair ? '#FFF69E' : shiftHex(hairRaw, 15, -6, 4, '#FFE338');
  const hairDeep = isDefaultHair ? '#D69712' : shiftHex(hairRaw, -22, 6, -10, '#FFE338');

  const topBase = isDefaultOutfit ? '#4589E8' : outRaw;
  const topShade = isDefaultOutfit ? '#2E66C4' : shiftHex(outRaw, -13, 6, 4, '#4589E8');
  const topHi = isDefaultOutfit ? '#6BA8F6' : shiftHex(outRaw, 12, -4, -3, '#4589E8');
  const emblem = isDefaultOutfit ? '#224C9E' : shiftHex(outRaw, -24, 10, 6, '#4589E8');

  const beltBase = isDefaultOutfit ? '#2653AA' : shiftHex(outRaw, -20, 8, 6, '#4589E8');
  const beltShade = isDefaultOutfit ? '#1B3C82' : shiftHex(outRaw, -30, 8, 8, '#4589E8');

  const skirtBase = isDefaultOutfit ? '#9AD8FA' : shiftHex(outRaw, 22, 2, -8, '#4589E8');
  const skirtShade = isDefaultOutfit ? '#68B6E8' : shiftHex(outRaw, 9, 4, -4, '#4589E8');
  const skirtHi = isDefaultOutfit ? '#C6ECFF' : shiftHex(outRaw, 31, -6, -10, '#4589E8');

  const bootBase = isDefaultOutfit ? '#3368CB' : shiftHex(outRaw, -10, 8, 4, '#4589E8');
  const bootShade = isDefaultOutfit ? '#21489A' : shiftHex(outRaw, -22, 8, 6, '#4589E8');
  const bootSole = isDefaultOutfit ? '#1A3674' : shiftHex(outRaw, -32, 6, 8, '#4589E8');

  const capSide = isDefaultOutfit ? '#366AD1' : shiftHex(outRaw, -8, 8, 3, '#4589E8');
  const capSideShade = isDefaultOutfit ? '#244EA6' : shiftHex(outRaw, -20, 8, 6, '#4589E8');
  const capStrap = isDefaultOutfit ? '#2B5BC0' : shiftHex(outRaw, -15, 8, 5, '#4589E8');

  return {
    ink: INK_COLOR,
    skinBase,
    skinShade,
    skinHi,
    blush,
    hairBase,
    hairShade,
    hairHi,
    hairDeep,
    topBase,
    topShade,
    topHi,
    emblem,
    beltBase,
    beltShade,
    chainLight: '#E4EDF8',
    chainShade: '#8FA4C6',
    skirtBase,
    skirtShade,
    skirtHi,
    sockBase: '#FFFFFF',
    sockShade: '#D3DFEF',
    bootBase,
    bootShade,
    bootSole,
    laceColor: '#FFFFFF',
    capFront: '#FFFFFF',
    capFrontShade: '#D8E2F0',
    capSide,
    capSideShade,
    capStrap,
  };
}

/* ─────────────────────────── 骨骼动力学求解器 ─────────────────────────── */

export interface AvatarPose {
  rootBouncePx: number;
  rootSx: number;
  rootSy: number;
  shadowScale: number;
  headTilt: number;
  headBob: number;
  torsoTilt: number;
  skirtSway: number;
  chainSway: number;
  hairBounce: number;
  // Front / back leg & arm kinematics
  leftLegLift: number;
  rightLegLift: number;
  leftLegScaleY: number;
  rightLegScaleY: number;
  leftLegShowSole: number;
  rightLegShowSole: number;
  leftArmRot: number;
  rightArmRot: number;
  leftArmScaleY: number;
  rightArmScaleY: number;
  // Side view scissor stride kinematics
  sideNearLegRot: number;
  sideFarLegRot: number;
  sideNearLegLift: number;
  sideFarLegLift: number;
  sideNearArmRot: number;
  sideFarArmRot: number;
  carryWeight: number;
  walkWeight: number;
  walkPhase: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

interface RigMotionState {
  lastMs: number;
  walkW: number;
  carryW: number;
  phase: number;
}

const rigMotionStore = new Map<string, RigMotionState>();

export function resolveRigMotion(
  rigKey: string | undefined,
  timeMs: number,
  isMoving: boolean,
  isCarrying: boolean
): { phase: number; walkW: number; carryW: number } {
  const targetWalk = isMoving ? 1 : 0;
  const targetCarry = isCarrying ? 1 : 0;
  const WALK_RAD_PER_SEC = 10.6;

  if (!rigKey) {
    return {
      phase: isMoving ? (timeMs / 1000) * WALK_RAD_PER_SEC : 0,
      walkW: targetWalk,
      carryW: targetCarry,
    };
  }

  let st = rigMotionStore.get(rigKey);
  if (!st) {
    st = {
      lastMs: timeMs,
      walkW: targetWalk,
      carryW: targetCarry,
      phase: 0,
    };
    rigMotionStore.set(rigKey, st);
  }

  const dtSec = Math.max(0, Math.min(0.08, (timeMs - st.lastMs) / 1000));
  st.lastMs = timeMs;

  const walkAlpha = 1 - Math.exp(-dtSec * (isMoving ? 15 : 13));
  const carryAlpha = 1 - Math.exp(-dtSec * 12);
  st.walkW += (targetWalk - st.walkW) * walkAlpha;
  st.carryW += (targetCarry - st.carryW) * carryAlpha;
  if (st.walkW < 0.004 && !isMoving) st.walkW = 0;
  if (st.carryW < 0.004 && !isCarrying) st.carryW = 0;

  if (st.walkW > 0.004) {
    st.phase = (st.phase + dtSec * WALK_RAD_PER_SEC * (0.45 + 0.55 * st.walkW)) % (Math.PI * 2);
  } else {
    st.phase = 0;
  }

  if (rigMotionStore.size > 96) {
    for (const [k, v] of rigMotionStore) {
      if (timeMs - v.lastMs > 18000) rigMotionStore.delete(k);
    }
  }

  return { phase: st.phase, walkW: st.walkW, carryW: st.carryW };
}

export function blinkFactor(timeMs: number): number {
  const cycle = timeMs % 4200;
  if (cycle < 130) {
    return Math.sin((cycle / 130) * Math.PI);
  }
  return 0;
}

/**
 * 求解角色在任意朝向、待机/行走/坐姿/举物状态下的骨骼姿态。
 * 手臂在待机与行走时自然向下/微向外摆动（参考图风格），仅在 isCarrying 时抬起。
 */
export function solveAvatarPose(
  dir: 'down' | 'up' | 'left' | 'right',
  timeMs: number,
  phase: number,
  walkWeight: number,
  carryWeight: number,
  isSitting: boolean
): AvatarPose {
  const w = isSitting ? 0 : clamp01(walkWeight);
  const c = clamp01(carryWeight);
  const breathe = Math.sin(timeMs / 680);

  const s = Math.sin(phase);
  const doubleStep = Math.abs(s); // 0 at pass, 1 at stride peak
  const strideBounce = Math.sin(phase * 2 - Math.PI / 2) * 0.5 + 0.5; // 0..1

  // Idle: subtle breathing; Walk: crisp anime chibi bounce
  const idleBounce = breathe * 0.75;
  const walkBounce = -strideBounce * 3.1;
  const rootBouncePx = isSitting ? 0 : lerp(idleBounce, walkBounce, w);

  const rootSx = isSitting ? 1 : lerp(1 + breathe * 0.006, 1 + (1 - strideBounce) * 0.025, w);
  const rootSy = isSitting ? 1 : lerp(1 - breathe * 0.006, 1 - (1 - strideBounce) * 0.022, w);
  const shadowScale = isSitting ? 1.05 : lerp(1 - breathe * 0.02, 1 - strideBounce * 0.14, w);

  // Front & back alternating foot lifts (matches Row 4 & Row 6 of reference sheet)
  const leftStepUp = Math.max(0, s);
  const rightStepUp = Math.max(0, -s);

  const leftLegLift = leftStepUp * 16 * w;
  const rightLegLift = rightStepUp * 16 * w;
  const leftLegScaleY = 1 - leftStepUp * 0.14 * w;
  const rightLegScaleY = 1 - rightStepUp * 0.14 * w;
  const leftLegShowSole = leftStepUp * w;
  const rightLegShowSole = rightStepUp * w;

  // Front & back natural downward outward arms (0 = straight down, positive = outward right / negative = outward left)
  // Reference idle has arms gently angled down & outward (~0.66 rad from straight down).
  // During walk, arms swing slightly in counter-phase to legs; only raise upward when carrying!
  const idleArmOut = 0.66;
  const frontLeftArmWalk = idleArmOut + rightStepUp * 0.2 - leftStepUp * 0.14;
  const frontRightArmWalk = idleArmOut + leftStepUp * 0.2 - rightStepUp * 0.14;

  const leftArmDown = lerp(idleArmOut + breathe * 0.02, frontLeftArmWalk, w);
  const rightArmDown = lerp(idleArmOut + breathe * 0.02, frontRightArmWalk, w);

  // Carry pose raises both arms up to support object above head
  const carryArmAngle = 2.45;
  const leftArmRot = lerp(leftArmDown, carryArmAngle, c);
  const rightArmRot = lerp(rightArmDown, carryArmAngle, c);
  const leftArmScaleY = 1 - leftStepUp * 0.08 * w;
  const rightArmScaleY = 1 - rightStepUp * 0.08 * w;

  // Side view scissor stride (matches Row 2 & Row 5 of reference sheet)
  // Positive angle swings limb backward (+X when facing left), negative swings forward (-X)
  const sideLegSwing = 0.62;
  const sideNearLegRot = s * sideLegSwing * w;
  const sideFarLegRot = -s * sideLegSwing * w;
  const sideNearLegLift = Math.max(0, -s) * 8 * w;
  const sideFarLegLift = Math.max(0, s) * 8 * w;

  // Side view arms: hang naturally downward in idle (slightly tucked at 0.04 rad),
  // swing in smooth counter-phase during walk, raise forward-up ONLY when carrying!
  const sideArmSwing = 0.5;
  const sideNearArmBase = lerp(0.04 + breathe * 0.015, -s * sideArmSwing, w);
  const sideFarArmBase = lerp(-0.04 - breathe * 0.015, s * sideArmSwing, w);
  const sideNearArmRot = lerp(sideNearArmBase, -2.55, c);
  const sideFarArmRot = lerp(sideFarArmBase, -2.4, c);

  const dirSign = dir === 'right' ? -1 : 1;
  const headTilt = isSitting ? 0 : lerp(breathe * 0.008, s * 0.042 * dirSign, w);
  const headBob = isSitting ? 0 : lerp(breathe * 1.4, -strideBounce * 4.5, w);
  const torsoTilt = isSitting ? 0 : lerp(0, -s * 0.032, w);
  const skirtSway = isSitting ? 0 : lerp(0, s * 5.2, w);
  const chainSway = isSitting ? 0 : lerp(breathe * 0.8, s * 4.4, w);
  const hairBounce = isSitting ? 0 : lerp(breathe * 1.2, doubleStep * 4.2, w);

  return {
    rootBouncePx,
    rootSx,
    rootSy,
    shadowScale,
    headTilt,
    headBob,
    torsoTilt,
    skirtSway,
    chainSway,
    hairBounce,
    leftLegLift,
    rightLegLift,
    leftLegScaleY,
    rightLegScaleY,
    leftLegShowSole,
    rightLegShowSole,
    leftArmRot,
    rightArmRot,
    leftArmScaleY,
    rightArmScaleY,
    sideNearLegRot,
    sideFarLegRot,
    sideNearLegLift,
    sideFarLegLift,
    sideNearArmRot,
    sideFarArmRot,
    carryWeight: c,
    walkWeight: w,
    walkPhase: phase,
  };
}
