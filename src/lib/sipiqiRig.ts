/**
 * 真·骨骼驱动：每帧按骨骼变换重画角色，不按帧查表。
 *
 * 几何与配色在**构建期**就编译好了（scripts/bakeRig.mjs → sipiqiRigData.ts）：
 *   - 每个图元一条 Path2D，基本图元自身的 rotate/translate 已烘进坐标
 *   - 填充/描边已是具体色值，渐变已换算成用户坐标
 *   - 脸部裁剪路径跟着图元一起编译好
 * 所以运行时**不碰 DOM**：没有 getComputedStyle、没有 getBBox、也不需要在页面里插一份 SVG。
 *
 * 姿态数学原样移植自 q_h5.html 的 applyPoseToSvg / computeArmKinematics / computeLegKinematics
 * （手脚对角交错步态），所以动画与 H5 里看到的完全一致。
 */
import { RIG_FOOT, RIG_PARTS, RIG_VIEWBOX, type BakedPaint, type BakedPart } from './sipiqiRigData';

export type RigAnim =
  | 'crawl'
  | 'stroll'
  | 'dash'
  | 'hop'
  | 'tiptoe'
  | 'idle'
  | 'look'
  | 'stretch'
  | 'happy'
  | 'lifted';

export interface BoneTf {
  tx: number;
  ty: number;
  rot: number;
  px: number;
  py: number;
  sx: number;
  sy: number;
}

export interface RigPose {
  bones: Record<string, BoneTf>;
  /** 地面阴影缩放（相对基准） */
  shadowScale: number;
  shadowSquash: number;
  /** 离地抬升（SVG 单位，用于名牌跟随跳动） */
  liftY: number;
}

export interface RigPart {
  path: Path2D;
  /** 骨骼链，从最外层到最内层 */
  chain: string[];
  fill: BakedPaint | null;
  stroke: BakedPaint | null;
  strokeWidth: number;
  opacity: number;
  cap: CanvasLineCap;
  join: CanvasLineJoin;
  clip: Path2D | null;
}

export interface CompiledRig {
  parts: RigPart[];
  /** viewBox */
  viewBox: { x: number; y: number; w: number; h: number };
  /** 脚底在 SVG 用户坐标里的位置（地面阴影椭圆的圆心） */
  foot: { x: number; y: number };
}

const IDENTITY: BoneTf = { tx: 0, ty: 0, rot: 0, px: 0, py: 0, sx: 1, sy: 1 };

function toPath(d: string, m?: number[]): Path2D {
  const base = new Path2D(d);
  if (!m) return base;
  // path 图元自身的变换矩阵（其它图元在烘焙时已把坐标拍平）
  const out = new Path2D();
  out.addPath(base, new DOMMatrix(m));
  return out;
}

function toPart(b: BakedPart): RigPart {
  return {
    path: toPath(b.d, b.m),
    chain: b.c,
    fill: b.f,
    stroke: b.st,
    strokeWidth: b.w,
    opacity: b.o,
    cap: b.lc,
    join: b.lj,
    clip: b.cl ? new Path2D(b.cl) : null,
  };
}

let cached: CompiledRig | null = null;

/** 取编译好的角色（首次调用时把路径数据变成 Path2D，之后一直复用） */
export function getRig(): CompiledRig {
  if (!cached) {
    cached = {
      parts: RIG_PARTS.map(toPart),
      viewBox: { ...RIG_VIEWBOX },
      foot: { ...RIG_FOOT },
    };
  }
  return cached;
}

/* ============================ 姿态数学（移植自 H5 + 扩展动作） ============================ */

const TAU = Math.PI * 2;
const normalizeRad = (rad: number) => ((rad % TAU) + TAU) % TAU;

function armKinematics(phi: number, amp: number) {
  const m = normalizeRad(phi);
  const rot = Math.cos(m) * 19 * amp + 2;
  const ty = m <= Math.PI ? Math.sin(m) * 3 * amp : Math.sin(m) * 24 * amp;
  return { tx: 0, ty, rot };
}

function legKinematics(psi: number, amp: number) {
  const m = normalizeRad(psi);
  const c = Math.cos(m);
  const tx = (-1 - 15 * c) * amp;
  const rot = (-1 + 8 * c) * amp;
  const ty = m <= Math.PI ? 0 : Math.sin(m) * 15 * amp;
  return { tx, ty, rot };
}

const bone = (tx: number, ty: number, rot: number, px: number, py: number, sx = 1, sy = 1): BoneTf => ({
  tx,
  ty,
  rot,
  px,
  py,
  sx,
  sy,
});

/**
 * 求某一时刻的全部骨骼变换。
 * @param theta 步态相位（弧度）；爬行一轮 = 2π
 * @param blink 0~1，1 表示睁眼
 */
export function poseBones(anim: RigAnim, theta: number, facing: 1 | -1, blink = 1): RigPose {
  const b: Record<string, BoneTf> = {};
  const set = (id: string, tf: BoneTf) => {
    b[id] = tf;
  };

  // 整体镜像：viewBox 中心 x=300
  set('Facing_Wrapper', facing === 1 ? bone(0, 0, 0, 300, 0, -1, 1) : { ...IDENTITY });

  let shadowScale = 1;
  let shadowSquash = 1;
  let liftY = 0;

  if (anim === 'idle' || anim === 'look') {
    const t = normalizeRad(theta);
    const breath = Math.sin(t);
    const breathLag = Math.sin(t - 0.65);
    const rootTy = breath * 3.2;

    set('Character_Root', bone(0, rootTy, 0, 315, 455, 1 + breath * 0.012, 1 - breath * 0.014));
    shadowScale = 1 + breath * 0.024;

    set('Far_Arm_Rig', bone(0, -rootTy * 0.72, breath * 1.4, 226, 308));
    set('Near_Arm_Rig', bone(0, -rootTy * 0.72, -breath * 1.4, 312, 315));
    set('Far_Leg_Rig', bone(0, -rootTy * 0.75, 0, 365, 405));
    set('Near_Leg_Rig', bone(0, -rootTy * 0.75, 0, 405, 405));
    set('Torso_Rig', bone(0, breath * 0.8, breath * 0.8, 315, 360));
    set('Skull_Rig', bone(0, 0, breathLag * 2.4, 412, 332));

    if (anim === 'look') {
      // 好奇四处张望：歪头 + 微抬下巴 + 鬓角头纱跟着轻晃
      const curious = Math.sin(t);
      const tilt = curious * 7.5 + Math.sin(t * 2) * 1.8;
      set('Head_Rig', bone(curious * 2.4, -3.5 + breathLag * 2.2, tilt, 265, 285));
      set('Veil_Rig', bone(0, 0, -curious * 4.5 + Math.sin(t - 0.8) * 2.2, 265, 55));
      set('Back_Hair_Rig', bone(0, 0, -curious * 3.2, 260, 290));
      set('Left_Side_Lock', bone(0, 0, Math.sin(t - 0.6) * 4.6, 148, 128));
      set('Right_Side_Lock', bone(0, 0, Math.sin(t - 0.85) * 4.6, 345, 140));
    } else {
      set('Head_Rig', bone(0, breathLag * 2.2, Math.sin(t - 0.4) * 2.0, 265, 285));
      set('Veil_Rig', bone(0, 0, Math.sin(t - 1.0) * 2.2, 265, 55));
      set('Back_Hair_Rig', bone(0, 0, Math.sin(t - 0.85) * 1.8, 260, 290));
      set('Left_Side_Lock', bone(0, 0, Math.sin(t - 0.9) * 2.0, 148, 128));
      set('Right_Side_Lock', bone(0, 0, Math.sin(t - 0.75) * 2.0, 345, 140));
    }

    const tearPulse = 1 + Math.sin(t * 2) * 0.04;
    set('Left_Tear', bone(0, 0, 0, 160, 212, tearPulse, tearPulse));
    set('Right_Tear', bone(0, 0, 0, 302, 239, tearPulse, tearPulse));
  } else if (anim === 'stretch') {
    // 猫式伸懒腰：前胸压低、双臂前伸、臀部微翘、随后舒展回弹
    const t = normalizeRad(theta);
    // 0..π 伸展峰值，π..2π 舒服回落
    const ext = Math.pow(Math.max(0, Math.sin(t * 0.5)), 1.5);
    const sway = Math.sin(t);
    set('Character_Root', bone(0, ext * 6.5, -ext * 4.2, 315, 455, 1 + ext * 0.055, 1 - ext * 0.045));
    shadowScale = 1 + ext * 0.08;
    shadowSquash = 0.95;

    set('Far_Arm_Rig', bone(-ext * 10, -ext * 5, ext * 14, 226, 308));
    set('Near_Arm_Rig', bone(-ext * 10, -ext * 5, ext * 13, 312, 315));
    set('Far_Leg_Rig', bone(ext * 8, -ext * 4, -ext * 5, 365, 405));
    set('Near_Leg_Rig', bone(ext * 9, -ext * 4, -ext * 5, 405, 405));
    set('Torso_Rig', bone(0, ext * 3.5, ext * 4.8, 315, 360));
    set('Skull_Rig', bone(0, 0, -ext * 8 + sway * 2, 412, 332));
    set('Head_Rig', bone(-ext * 4, -ext * 5.5, ext * 8.5, 265, 285));
    set('Veil_Rig', bone(0, 0, -ext * 6 + Math.sin(t - 0.7) * 2.5, 265, 55));
    set('Back_Hair_Rig', bone(0, 0, -ext * 5, 260, 290));
    set('Left_Side_Lock', bone(0, 0, ext * 5.5, 148, 128));
    set('Right_Side_Lock', bone(0, 0, ext * 4.8, 345, 140));

    const tearScale = 1 + ext * 0.07;
    set('Left_Tear', bone(0, 0, 0, 160, 212, tearScale, tearScale));
    set('Right_Tear', bone(0, 0, 0, 302, 239, tearScale, tearScale));
  } else if (anim === 'happy') {
    // 原地撒娇/开心晃晃：轻快小弹性 + 脑袋左右摇摆 + 骷髅挂件轻甩
    const t = normalizeRad(theta);
    const bounce = Math.abs(Math.sin(t));
    const sway = Math.sin(t);
    const rootTy = -bounce * 11;
    liftY = -rootTy;

    set('Character_Root', bone(0, rootTy, sway * 3.6, 315, 450, 1 - bounce * 0.028, 1 + bounce * 0.032));
    shadowScale = 1 - bounce * 0.1;

    set('Far_Arm_Rig', bone(0, bounce * 4, 4 + sway * 8, 226, 308));
    set('Near_Arm_Rig', bone(0, bounce * 4, 4 - sway * 8, 312, 315));
    set('Far_Leg_Rig', bone(0, bounce * 3, sway * 4, 365, 405));
    set('Near_Leg_Rig', bone(0, bounce * 3, -sway * 4, 405, 405));
    set('Torso_Rig', bone(0, -bounce * 2, sway * 3.2, 315, 360));
    set('Skull_Rig', bone(0, 0, Math.sin(t * 2 - 0.6) * 9, 412, 332));
    set('Head_Rig', bone(0, -bounce * 4, Math.sin(t - 0.3) * 8.5, 265, 285));
    set('Veil_Rig', bone(0, 0, Math.sin(t - 0.9) * 6.5, 265, 55));
    set('Back_Hair_Rig', bone(0, 0, Math.sin(t - 0.85) * 5.8, 260, 290));
    set('Left_Side_Lock', bone(0, 0, Math.sin(t - 0.7) * 7.5, 148, 128));
    set('Right_Side_Lock', bone(0, 0, Math.sin(t - 0.9) * 7.5, 345, 140));

    const tearScale = 1 + bounce * 0.1;
    set('Left_Tear', bone(0, -bounce * 2, 0, 160, 212, tearScale, tearScale));
    set('Right_Tear', bone(0, -bounce * 2, 0, 302, 239, tearScale, tearScale));
  } else if (anim === 'hop') {
    // 兔跳式前进：前蓄力压扁 → 双手前探腾空跃起 → 落地微弹
    const t = normalizeRad(theta);
    // 0..0.32π 蓄力下压，0.32π..1.72π 腾空抛物线，1.72π..2π 缓冲
    let air = 0;
    let crouch = 0;
    if (t < 0.35 * Math.PI) {
      crouch = Math.sin((t / (0.35 * Math.PI)) * Math.PI);
    } else if (t < 1.72 * Math.PI) {
      const u = (t - 0.35 * Math.PI) / (1.37 * Math.PI);
      air = Math.sin(u * Math.PI);
    } else {
      const u = (t - 1.72 * Math.PI) / (0.28 * Math.PI);
      crouch = Math.sin(u * Math.PI) * 0.75;
    }

    const rootTy = -air * 44 + crouch * 7;
    const pitch = air > 0 ? Math.cos(((t - 0.35 * Math.PI) / (1.37 * Math.PI)) * Math.PI) * -9 : crouch * 3.5;
    const sx = 1 - air * 0.04 + crouch * 0.05;
    const sy = 1 + air * 0.05 - crouch * 0.055;
    liftY = Math.max(0, -rootTy);

    set('Character_Root', bone(0, rootTy, pitch, 315, 445, sx, sy));
    shadowScale = 1 - air * 0.28 + crouch * 0.05;
    shadowSquash = 1 - air * 0.18;

    // 腾空时双臂一起前伸，后腿向后蹬展
    set('Far_Arm_Rig', bone(-air * 6, -air * 10 + crouch * 4, air * 22 - crouch * 8, 226, 308));
    set('Near_Arm_Rig', bone(-air * 5, -air * 12 + crouch * 4, air * 20 - crouch * 8, 312, 315));
    set('Far_Leg_Rig', bone(air * 16 - crouch * 4, -air * 6, -air * 14 + crouch * 4, 365, 405));
    set('Near_Leg_Rig', bone(air * 18 - crouch * 4, -air * 8, -air * 16 + crouch * 4, 405, 405));
    set('Torso_Rig', bone(0, -air * 2.5 + crouch * 2, -air * 3.2 + crouch * 2, 315, 360));
    set('Skull_Rig', bone(0, 0, air * 11 - crouch * 4, 412, 332));
    set('Head_Rig', bone(0, -air * 6 + crouch * 3, -pitch * 0.45 + Math.sin(t) * 3, 265, 285));
    set('Veil_Rig', bone(0, 0, air * 10 + Math.sin(t - 0.8) * 4, 265, 55));
    set('Back_Hair_Rig', bone(0, 0, air * 9.5 + Math.sin(t - 0.7) * 3.5, 260, 290));
    set('Left_Side_Lock', bone(0, 0, air * 9.5 + Math.sin(t - 0.6) * 4, 148, 128));
    set('Right_Side_Lock', bone(0, 0, air * 8.5 + Math.sin(t - 0.8) * 4, 345, 140));

    const tearScale = 1 + air * 0.1;
    set('Left_Tear', bone(0, air * 2.5, 0, 160, 212, tearScale, tearScale));
    set('Right_Tear', bone(0, air * 2.5, 0, 302, 239, tearScale, tearScale));
  } else if (anim === 'lifted') {
    // 被玩家举过头顶：凌空晃荡、四肢扑腾、头纱与鬓角跟着摆动、眼泪微颤
    const sway = Math.sin(theta * 0.5);
    const kick = Math.sin(theta);
    const kickAlt = Math.sin(theta + Math.PI);
    const rootTy = -10 + Math.sin(theta * 1.0) * 4.5;
    const rootRot = sway * 6.2;
    liftY = 10;
    shadowScale = 0;

    set('Character_Root', bone(0, rootTy, rootRot, 315, 360, 1 - Math.abs(sway) * 0.02, 1 + Math.abs(sway) * 0.024));
    set('Far_Arm_Rig', bone(-4 + Math.cos(theta) * 4, 8 + kick * 9, 14 + kick * 24, 226, 308));
    set('Near_Arm_Rig', bone(-2 + Math.cos(theta + Math.PI) * 4, 8 + kickAlt * 9, 14 + kickAlt * 24, 312, 315));
    set('Far_Leg_Rig', bone(6 + Math.cos(theta + Math.PI) * 7, 11 + kickAlt * 11, -10 + kickAlt * 19, 365, 405));
    set('Near_Leg_Rig', bone(6 + Math.cos(theta) * 7, 11 + kick * 11, -10 + kick * 19, 405, 405));
    set('Torso_Rig', bone(0, kick * 1.8, sway * 3.2, 315, 360));
    set('Skull_Rig', bone(0, 0, -sway * 13 + Math.sin(theta - 0.7) * 8, 412, 332));
    set('Head_Rig', bone(0, -3 + Math.sin(theta - 0.4) * 2.8, -sway * 7.5 + Math.sin(theta - 0.3) * 4.2, 265, 285));
    set('Veil_Rig', bone(0, 0, -sway * 9.5 + Math.sin(theta - 0.9) * 6.5, 265, 55));
    set('Back_Hair_Rig', bone(0, 0, -sway * 8.5 + Math.sin(theta - 0.8) * 5.8, 260, 290));
    set('Left_Side_Lock', bone(0, 0, -sway * 10.5 + Math.sin(theta - 0.6) * 7.5, 148, 128));
    set('Right_Side_Lock', bone(0, 0, -sway * 10.5 + Math.sin(theta - 0.85) * 7.5, 345, 140));

    const tearScale = 1.08 + Math.abs(kick) * 0.14;
    set('Left_Tear', bone(0, kick * 2.4, 0, 160, 212, tearScale, tearScale));
    set('Right_Tear', bone(0, Math.sin(theta + 0.5) * 2.4, 0, 302, 239, tearScale, tearScale));
  } else {
    // 步态家族：crawl（标准爬行）、stroll（悠闲溜达）、dash（加速狂爬）、tiptoe（偷偷摸摸潜行）
    const isDash = anim === 'dash';
    const isStroll = anim === 'stroll';
    const isTiptoe = anim === 'tiptoe';
    const amp = isDash ? 1.2 : isStroll ? 0.74 : isTiptoe ? 0.56 : 1.0;
    const forwardLean = isDash ? -4.5 : isTiptoe ? -2.8 : isStroll ? 0.8 : 0;
    const crouchY = isTiptoe ? 6.5 : 0;

    const farArm = armKinematics(theta, amp);
    const nearLeg = legKinematics(theta, amp);
    const nearArm = armKinematics(theta + Math.PI, amp);
    const farLeg = legKinematics(theta + Math.PI, amp);

    const rootTy = -Math.abs(Math.sin(theta)) * (isTiptoe ? 4.2 : 8) * amp + crouchY;
    const rootRot = Math.sin(theta * 2) * 2.2 * amp + forwardLean;
    const squash = Math.sin(theta * 2) * 0.018 * amp;

    set('Character_Root', bone(0, rootTy, rootRot, 315, 445, 1 + squash + (isTiptoe ? 0.025 : 0), 1 - squash - (isTiptoe ? 0.028 : 0)));
    shadowScale = 1 - Math.abs(Math.sin(theta)) * (isDash ? 0.08 : 0.055) + (isTiptoe ? 0.04 : 0);

    set('Far_Arm_Rig', bone(farArm.tx, farArm.ty, farArm.rot, 226, 308));
    set('Near_Arm_Rig', bone(nearArm.tx, nearArm.ty, nearArm.rot, 312, 315));
    set('Far_Leg_Rig', bone(farLeg.tx, farLeg.ty, farLeg.rot, 365, 405));
    set('Near_Leg_Rig', bone(nearLeg.tx, nearLeg.ty, nearLeg.rot, 405, 405));
    set('Torso_Rig', bone(0, Math.sin(theta * 2) * 1.4, Math.sin(theta) * 1.6, 315, 360));

    const headRot = Math.sin(theta - 0.5) * (isStroll ? 6.2 : isTiptoe ? 3.2 : 4.5) * amp + (isTiptoe ? 3.5 : 0);
    const headTy = -Math.abs(Math.sin(theta - 0.45)) * 5 * amp;
    set('Head_Rig', bone(isTiptoe ? -4 : 0, headTy, headRot, 265, 285));
    set('Veil_Rig', bone(0, 0, Math.sin(theta * 2 - 1.1) * 3.8 * amp + (isDash ? 4.2 : 0), 265, 55));
    set('Back_Hair_Rig', bone(0, 0, Math.sin(theta * 2 - 0.9) * 3.6 * amp + (isDash ? 4.8 : 0), 260, 290));
    set('Left_Side_Lock', bone(0, 0, Math.sin(theta - 0.75) * 4.2 * amp + (isDash ? 5.0 : 0), 148, 128));
    set('Right_Side_Lock', bone(0, 0, Math.sin(theta - 0.95) * 4.0 * amp + (isDash ? 4.2 : 0), 345, 140));
    set('Skull_Rig', bone(0, 0, Math.sin(theta * 2 - 0.8) * (isDash ? 7.5 : 6) * amp, 412, 332));

    const tearScale = 1 + Math.sin(theta * 2) * 0.06;
    const tearY = Math.sin(theta * 2 - 0.4) * 1.5;
    set('Left_Tear', bone(0, tearY, 0, 160, 212, tearScale, tearScale));
    set('Right_Tear', bone(0, tearY, 0, 302, 239, tearScale, tearScale));
  }

  // 眨眼：围绕双瞳中心压扁
  if (blink < 0.999) {
    set('Left_Eye_Blink', bone(0, 0, 0, 188, 193, 1, blink));
    set('Right_Eye_Blink', bone(0, 0, 0, 284, 212, 1, blink));
  }

  return { bones: b, shadowScale, shadowSquash, liftY };
}

function applyTf(ctx: CanvasRenderingContext2D, tf: BoneTf) {
  if (tf.tx !== 0 || tf.ty !== 0) ctx.translate(tf.tx, tf.ty);
  if (tf.sx !== 1 || tf.sy !== 1) {
    ctx.translate(tf.px, tf.py);
    ctx.scale(tf.sx, tf.sy);
    ctx.translate(-tf.px, -tf.py);
  }
  if (tf.rot !== 0) {
    ctx.translate(tf.px, tf.py);
    ctx.rotate((tf.rot * Math.PI) / 180);
    ctx.translate(-tf.px, -tf.py);
  }
}

function paintOf(ctx: CanvasRenderingContext2D, paint: BakedPaint): string | CanvasGradient {
  if (paint.k === 's') return paint.c;
  const g = ctx.createLinearGradient(paint.x1, paint.y1, paint.x2, paint.y2);
  for (const [offset, color] of paint.s) g.addColorStop(offset, color);
  return g;
}

/**
 * 在世界坐标里画一次角色。
 * @param scale 世界像素 / SVG 用户单位
 */
export function drawRig(
  ctx: CanvasRenderingContext2D,
  rig: CompiledRig,
  pose: RigPose,
  worldX: number,
  worldY: number,
  scale: number
) {
  ctx.save();
  // 脚底对齐 (worldX, worldY)
  ctx.translate(worldX - rig.foot.x * scale, worldY - rig.foot.y * scale);
  ctx.scale(scale, scale);

  for (const part of rig.parts) {
    ctx.save();
    for (const id of part.chain) {
      const tf = pose.bones[id];
      if (tf) applyTf(ctx, tf);
    }
    // 脸部裁剪：裁剪路径与图元同在最后一个骨骼的坐标系里
    if (part.clip) ctx.clip(part.clip);
    if (part.opacity < 1) ctx.globalAlpha *= part.opacity;
    if (part.fill) {
      ctx.fillStyle = paintOf(ctx, part.fill);
      ctx.fill(part.path);
    }
    if (part.stroke) {
      ctx.strokeStyle = paintOf(ctx, part.stroke);
      ctx.lineWidth = part.strokeWidth;
      ctx.lineCap = part.cap;
      ctx.lineJoin = part.join;
      ctx.stroke(part.path);
    }
    ctx.restore();
  }

  ctx.restore();
}
