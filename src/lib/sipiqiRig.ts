/**
 * 真·骨骼驱动：把 q_h5.html 里那套爬行骨骼直接搬到 canvas 上跑。
 *
 * 思路：canvas 不认 SVG，但认路径。所以页面加载时解析一次 SVG：
 *   - 每个图元 → Path2D（永久复用）
 *   - 每个图元的填充/描边 → 具体颜色或 CanvasGradient（getComputedStyle 固化，CSS 类不再参与）
 *   - 每个图元记下它的骨骼链（从 Facing_Wrapper 到最内层骨骼）
 * 每帧只做：按骨骼链压变换栈 → fillR(path)。
 *
 * 姿态数学原样移植自 q_h5.html 的 applyPoseToSvg / computeArmKinematics / computeLegKinematics
 * （手脚对角交错步态），所以动画与 H5 里看到的完全一致。
 */

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

type Paint =
  | { kind: 'solid'; color: string }
  | {
      kind: 'linear';
      stops: { offset: number; color: string }[];
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };

interface RigPart {
  path: Path2D;
  chain: string[];
  fill: Paint | null;
  stroke: Paint | null;
  strokeWidth: number;
  opacity: number;
  doFill: boolean;
  doStroke: boolean;
}

export interface CompiledRig {
  parts: RigPart[];
  /** viewBox */
  viewBox: { x: number; y: number; w: number; h: number };
  /** 脚底在 SVG 用户坐标里的位置（地面阴影椭圆的圆心） */
  foot: { x: number; y: number };
}

const BONES = new Set([
  'Facing_Wrapper',
  'Character_Root',
  'Back_Hair_Rig',
  'Far_Leg_Rig',
  'Far_Arm_Rig',
  'Torso_Rig',
  'Skull_Rig',
  'Near_Leg_Rig',
  'Near_Arm_Rig',
  'Head_Rig',
  'Left_Side_Lock',
  'Right_Side_Lock',
  'Veil_Rig',
  'Left_Eye_Blink',
  'Right_Eye_Blink',
  'Left_Tear',
  'Right_Tear',
]);

const IDENTITY: BoneTf = { tx: 0, ty: 0, rot: 0, px: 0, py: 0, sx: 1, sy: 1 };

const num = (v: string | null, fallback = 0) => {
  const n = Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
};

/** 解析 matrix(a,b,c,d,e,f) 这类 gradientTransform，只支持 matrix 与 translate */
function gradientMatrix(str: string | null): [number, number, number, number, number, number] {
  const id: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  if (!str) return id;
  const m = /matrix\(([^)]+)\)/.exec(str);
  if (m) {
    const p = m[1].split(/[\s,]+/).map((v) => Number.parseFloat(v));
    if (p.length === 6 && p.every((v) => Number.isFinite(v))) {
      return [p[0], p[1], p[2], p[3], p[4], p[5]];
    }
  }
  const t = /translate\(([^)]+)\)/.exec(str);
  if (t) {
    const p = t[1].split(/[\s,]+/).map((v) => Number.parseFloat(v));
    return [1, 0, 0, 1, p[0] || 0, p[1] || 0];
  }
  return id;
}

function pathFor(el: Element): Path2D | null {
  const tag = el.tagName.toLowerCase();
  const p = new Path2D();
  if (tag === 'path') {
    const d = el.getAttribute('d');
    return d ? new Path2D(d) : null;
  }
  if (tag === 'circle') {
    p.arc(num(el.getAttribute('cx')), num(el.getAttribute('cy')), num(el.getAttribute('r')), 0, Math.PI * 2);
    return p;
  }
  if (tag === 'ellipse') {
    p.ellipse(
      num(el.getAttribute('cx')),
      num(el.getAttribute('cy')),
      num(el.getAttribute('rx')),
      num(el.getAttribute('ry')),
      0,
      0,
      Math.PI * 2
    );
    return p;
  }
  if (tag === 'rect') {
    const x = num(el.getAttribute('x'));
    const y = num(el.getAttribute('y'));
    const w = num(el.getAttribute('width'));
    const h = num(el.getAttribute('height'));
    const r = num(el.getAttribute('rx'));
    if (r > 0) p.roundRect(x, y, w, h, r);
    else p.rect(x, y, w, h);
    return p;
  }
  if (tag === 'line') {
    p.moveTo(num(el.getAttribute('x1')), num(el.getAttribute('y1')));
    p.lineTo(num(el.getAttribute('x2')), num(el.getAttribute('y2')));
    return p;
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
    if (pts.length < 4) return null;
    p.moveTo(pts[0], pts[1]);
    for (let i = 2; i + 1 < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
    if (tag === 'polygon') p.closePath();
    return p;
  }
  return null;
}

/** 把 getComputedStyle 里的 fill/stroke 固化：纯色直接抄，url(#id) 解析成渐变 */
function resolvePaint(
  value: string,
  svg: SVGSVGElement,
  bbox: { x: number; y: number; w: number; h: number }
): Paint | null {
  if (!value || value === 'none' || value === 'transparent') return null;
  const m = /^url\(["']?#([^"')]+)["']?\)/.exec(value);
  if (!m) return { kind: 'solid', color: value };
  const grad = svg.querySelector(`#${CSS.escape(m[1])}`) as SVGElement | null;
  if (!grad) return null;

  // 有些渐变用 xlink:href 继承停靠点
  const stopHost =
    grad.querySelectorAll('stop').length > 0
      ? grad
      : (() => {
          const href = grad.getAttribute('xlink:href') || grad.getAttribute('href');
          const id = href?.startsWith('#') ? href.slice(1) : '';
          return id ? (svg.querySelector(`#${CSS.escape(id)}`) as Element | null) : null;
        })();
  if (!stopHost) return { kind: 'solid', color: '#888888' };

  const stops = Array.from(stopHost.querySelectorAll('stop')).map((s) => {
    const cs = getComputedStyle(s);
    const offRaw = s.getAttribute('offset') || '0';
    const off = offRaw.endsWith('%') ? num(offRaw) / 100 : num(offRaw);
    const color = cs.stopColor || s.getAttribute('stop-color') || '#888';
    const op = Number.parseFloat(cs.stopOpacity || s.getAttribute('stop-opacity') || '1');
    return { offset: Math.min(1, Math.max(0, off)), color, opacity: Number.isFinite(op) ? op : 1 };
  });
  if (!stops.length) return { kind: 'solid', color: '#888888' };

  const isOBB = (grad.getAttribute('gradientUnits') || 'objectBoundingBox') === 'objectBoundingBox';
  const gx1 = grad.getAttribute('x1');
  const gy1 = grad.getAttribute('y1');
  const gx2 = grad.getAttribute('x2');
  const gy2 = grad.getAttribute('y2');
  const toUser = (vx: number, vy: number) =>
    isOBB
      ? [bbox.x + vx * bbox.w, bbox.y + vy * bbox.h]
      : [vx, vy];

  let [x1, y1] = toUser(num(gx1, 0), num(gy1, 0));
  let [x2, y2] = toUser(num(gx2, 1), num(gy2, 0));

  const [a, b, c, d, e, f] = gradientMatrix(grad.getAttribute('gradientTransform'));
  const apply = (x: number, y: number): [number, number] => [a * x + c * y + e, b * x + d * y + f];
  [x1, y1] = apply(x1, y1);
  [x2, y2] = apply(x2, y2);

  return {
    kind: 'linear',
    stops: stops.map((s) => ({
      offset: s.offset,
      // stop-opacity 简化成 rgba 混合，避免额外加一层 globalAlpha
      color: s.opacity >= 1 ? s.color : mixAlpha(s.color, s.opacity),
    })),
    x1,
    y1,
    x2,
    y2,
  };
}

/** 把 rgb()/hex 颜色按 alpha 摊平 */
function mixAlpha(color: string, alpha: number): string {
  const c = color.trim();
  const m = /^rgb\((\d+)[,\s]+(\d+)[,\s]+(\d+)\)$/.exec(c);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    const full = hex.length === 3 ? hex.split('').map((h) => h + h).join('') : hex;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    if ([r, g, b].every((v) => Number.isFinite(v))) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}

function paintToStyle(ctx: CanvasRenderingContext2D, paint: Paint): string | CanvasGradient {
  if (paint.kind === 'solid') return paint.color;
  const g = ctx.createLinearGradient(paint.x1, paint.y1, paint.x2, paint.y2);
  for (const s of paint.stops) g.addColorStop(s.offset, s.color);
  return g;
}

/**
 * 解析 SVG 文本 → 编译好的骨骼角色。
 * 必须临时挂进文档里：getComputedStyle / getBBox 只对已渲染的元素有效。
 */
export function compileRig(svgText: string): CompiledRig {
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden;';
  host.innerHTML = svgText;
  document.body.appendChild(host);

  try {
    const svg = host.querySelector('svg') as SVGSVGElement;
    const vbAttr = (svg.getAttribute('viewBox') || '0 0 680 560').trim().split(/[\s,]+/).map(Number);
    const viewBox = { x: vbAttr[0] || 0, y: vbAttr[1] || 0, w: vbAttr[2] || 680, h: vbAttr[3] || 560 };

    const parts: RigPart[] = [];
    const shapes = svg.querySelectorAll('path, ellipse, circle, rect, line, polygon, polyline');

    shapes.forEach((el) => {
      // 阴影单独用 canvas 画，跳过
      if (el.closest('#Ground_Shadow')) return;

      const path = pathFor(el);
      if (!path) return;

      const cs = getComputedStyle(el);
      const bb = (el as SVGGraphicsElement).getBBox();
      const bbox = { x: bb.x, y: bb.y, w: bb.width || 1, h: bb.height || 1 };

      const chain: string[] = [];
      let node: Element | null = el.parentElement;
      while (node && node !== svg) {
        const id = node.getAttribute('id');
        if (id && BONES.has(id)) chain.unshift(id);
        node = node.parentElement;
      }

      const doFill = cs.fill !== 'none';
      const doStroke = cs.stroke !== 'none' && num(cs.strokeWidth, 0) > 0;

      parts.push({
        path,
        chain,
        fill: doFill ? resolvePaint(cs.fill, svg, bbox) : null,
        stroke: doStroke ? resolvePaint(cs.stroke, svg, bbox) : null,
        strokeWidth: num(cs.strokeWidth, 1),
        opacity: Number.parseFloat(cs.opacity || '1') || 1,
        doFill,
        doStroke,
      });
    });

    const shadowEllipse = svg.querySelector('#Ground_Shadow_Ellipse');
    const foot = {
      x: num(shadowEllipse?.getAttribute('cx') ?? null, 320),
      y: num(shadowEllipse?.getAttribute('cy') ?? null, 466),
    };

    return { parts, viewBox, foot };
  } finally {
    host.remove();
  }
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
    const fade = part.opacity < 1;
    if (fade) ctx.globalAlpha *= part.opacity;
    if (part.doFill && part.fill) {
      ctx.fillStyle = paintToStyle(ctx, part.fill);
      ctx.fill(part.path);
    }
    if (part.doStroke && part.stroke) {
      ctx.strokeStyle = paintToStyle(ctx, part.stroke);
      ctx.lineWidth = part.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke(part.path);
    }
    ctx.restore();
  }

  ctx.restore();
}
