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

export type RigAnim = 'crawl' | 'dash' | 'idle';

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

/* ============================ 姿态数学（移植自 H5） ============================ */

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

  if (anim === 'idle') {
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
    set('Head_Rig', bone(0, breathLag * 2.2, Math.sin(t - 0.4) * 2.0, 265, 285));
    set('Veil_Rig', bone(0, 0, Math.sin(t - 1.0) * 2.2, 265, 55));
    set('Back_Hair_Rig', bone(0, 0, Math.sin(t - 0.85) * 1.8, 260, 290));
    set('Left_Side_Lock', bone(0, 0, Math.sin(t - 0.9) * 2.0, 148, 128));
    set('Right_Side_Lock', bone(0, 0, Math.sin(t - 0.75) * 2.0, 345, 140));

    const tearPulse = 1 + Math.sin(t * 2) * 0.04;
    set('Left_Tear', bone(0, 0, 0, 160, 212, tearPulse, tearPulse));
    set('Right_Tear', bone(0, 0, 0, 302, 239, tearPulse, tearPulse));
  } else {
    const isDash = anim === 'dash';
    const amp = isDash ? 1.18 : 1.0;
    const forwardLean = isDash ? -4.2 : 0;

    const farArm = armKinematics(theta, amp);
    const nearLeg = legKinematics(theta, amp);
    const nearArm = armKinematics(theta + Math.PI, amp);
    const farLeg = legKinematics(theta + Math.PI, amp);

    const rootTy = -Math.abs(Math.sin(theta)) * 8 * amp;
    const rootRot = Math.sin(theta * 2) * 2.2 * amp + forwardLean;
    const squash = Math.sin(theta * 2) * 0.018 * amp;

    set('Character_Root', bone(0, rootTy, rootRot, 315, 445, 1 + squash, 1 - squash));
    shadowScale = 1 - Math.abs(Math.sin(theta)) * 0.06;

    set('Far_Arm_Rig', bone(farArm.tx, farArm.ty, farArm.rot, 226, 308));
    set('Near_Arm_Rig', bone(nearArm.tx, nearArm.ty, nearArm.rot, 312, 315));
    set('Far_Leg_Rig', bone(farLeg.tx, farLeg.ty, farLeg.rot, 365, 405));
    set('Near_Leg_Rig', bone(nearLeg.tx, nearLeg.ty, nearLeg.rot, 405, 405));
    set('Torso_Rig', bone(0, Math.sin(theta * 2) * 1.4, Math.sin(theta) * 1.6, 315, 360));

    const headRot = Math.sin(theta - 0.5) * 4.5 * amp;
    const headTy = -Math.abs(Math.sin(theta - 0.45)) * 5 * amp;
    set('Head_Rig', bone(0, headTy, headRot, 265, 285));
    set('Veil_Rig', bone(0, 0, Math.sin(theta * 2 - 1.1) * 3.8 * amp + (isDash ? 3.5 : 0), 265, 55));
    set('Back_Hair_Rig', bone(0, 0, Math.sin(theta * 2 - 0.9) * 3.6 * amp + (isDash ? 4.2 : 0), 260, 290));
    set('Left_Side_Lock', bone(0, 0, Math.sin(theta - 0.75) * 4.2 * amp + (isDash ? 4.5 : 0), 148, 128));
    set('Right_Side_Lock', bone(0, 0, Math.sin(theta - 0.95) * 4.0 * amp + (isDash ? 3.8 : 0), 345, 140));
    set('Skull_Rig', bone(0, 0, Math.sin(theta * 2 - 0.8) * 6 * amp, 412, 332));

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

  return { bones: b, shadowScale, shadowSquash: 1 };
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
