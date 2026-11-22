/**
 * 构建期编译骨骼角色：把 public/npc/sipiqi_rig.svg 拍扁成一份纯数据（几何 + 颜色），
 * 写到 src/lib/sipiqiRigData.ts。运行时只做 new Path2D() + 按骨骼压变换栈，不再碰 DOM。
 *
 * 零外部依赖（纯 Node 执行），支持 path / ellipse / circle / rect / line / polygon / polyline、
 * transform 烘焙、linearGradient（userSpaceOnUse / objectBoundingBox）、clip-path 与祖先 opacity 继承。
 *
 * 用法：node scripts/bakeRig.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RIG_BONES } from './rigBones.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'npc', 'sipiqi_rig.svg');
const OUT_TS = path.join(ROOT, 'src', 'lib', 'sipiqiRigData.ts');

const BONES = new Set(RIG_BONES);
const K = 0.5522847498307936;
const R = (n) => Math.round(n * 100) / 100;
const fmt = (n) => {
  const v = R(n);
  return Object.is(v, -0) ? '0' : String(v);
};
const NUM = (v, d = 0) => {
  const n = Number.parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : d;
};

/* ---------------- 轻量 XML/SVG 解析器 ---------------- */

function parseAttrs(raw) {
  const attrs = {};
  const re = /([a-zA-Z0-9_:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(raw))) attrs[m[1]] = m[2];
  return attrs;
}

function parseSvgTree(xml) {
  const cleaned = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const root = { tag: '#root', attrs: {}, children: [], parent: null };
  const stack = [root];
  const tokenRe = /<\/([a-zA-Z0-9_:-]+)\s*>|<([a-zA-Z0-9_:-]+)((?:\s+[^<>]*?)?)(\/?)\s*>/g;
  let m;
  while ((m = tokenRe.exec(cleaned))) {
    if (m[1]) {
      if (stack.length > 1) stack.pop();
    } else {
      const node = {
        tag: m[2].toLowerCase(),
        attrs: parseAttrs(m[3] || ''),
        children: [],
        parent: stack[stack.length - 1],
      };
      stack[stack.length - 1].children.push(node);
      if (!m[4]) stack.push(node);
    }
  }
  return root.children.find((n) => n.tag === 'svg');
}

function walk(node, fn) {
  fn(node);
  for (const child of node.children) walk(child, fn);
}

function hasAncestor(node, pred) {
  let cur = node.parent;
  while (cur) {
    if (pred(cur)) return true;
    cur = cur.parent;
  }
  return false;
}

/* ---------------- 变换矩阵与图元烘焙 ---------------- */

function parseTransform(str) {
  if (!str) return null;
  let m = [1, 0, 0, 1, 0, 0];
  const mul = (m1, m2) => [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  const re = /(translate|rotate|scale|matrix)\(([^)]+)\)/g;
  let match;
  while ((match = re.exec(str))) {
    const fn = match[1];
    const args = match[2].trim().split(/[\s,]+/).map(Number);
    let t = [1, 0, 0, 1, 0, 0];
    if (fn === 'translate') {
      t = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
    } else if (fn === 'scale') {
      t = [args[0] ?? 1, 0, 0, args.length > 1 ? args[1] : (args[0] ?? 1), 0, 0];
    } else if (fn === 'rotate') {
      const rad = ((args[0] || 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      if (args.length === 3) {
        const [, cx, cy] = args;
        t = mul(mul([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
      } else {
        t = [cos, sin, -sin, cos, 0, 0];
      }
    } else if (fn === 'matrix' && args.length === 6) {
      t = args;
    }
    m = mul(m, t);
  }
  if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0) return null;
  return m;
}

const tp = (m, x, y) => (m ? [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] : [x, y]);
const pt = (m, x, y) => {
  const [px, py] = tp(m, x, y);
  return `${fmt(px)} ${fmt(py)}`;
};

function shapeToD(node, m) {
  const { tag, attrs } = node;
  if (tag === 'path') {
    if (!attrs.d) return null;
    return { d: attrs.d, m: m || undefined };
  }
  if (tag === 'circle' || tag === 'ellipse') {
    const cx = NUM(attrs.cx);
    const cy = NUM(attrs.cy);
    const rx = tag === 'circle' ? NUM(attrs.r) : NUM(attrs.rx);
    const ry = tag === 'circle' ? NUM(attrs.r) : NUM(attrs.ry);
    const kx = rx * K;
    const ky = ry * K;
    const seg = [
      [cx + rx, cy - ky, cx + kx, cy - ry, cx, cy - ry],
      [cx - kx, cy - ry, cx - rx, cy - ky, cx - rx, cy],
      [cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry],
      [cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy],
    ];
    let d = `M ${pt(m, cx + rx, cy)}`;
    for (const [c1x, c1y, c2x, c2y, ex, ey] of seg) {
      d += ` C ${pt(m, c1x, c1y)} ${pt(m, c2x, c2y)} ${pt(m, ex, ey)}`;
    }
    return { d: `${d} Z` };
  }
  if (tag === 'rect') {
    const x = NUM(attrs.x);
    const y = NUM(attrs.y);
    const w = NUM(attrs.width);
    const h = NUM(attrs.height);
    let rx = attrs.rx !== undefined ? NUM(attrs.rx) : -1;
    let ry = attrs.ry !== undefined ? NUM(attrs.ry) : -1;
    if (rx < 0) rx = ry < 0 ? 0 : ry;
    if (ry < 0) ry = rx;
    rx = Math.min(rx, w / 2);
    ry = Math.min(ry, h / 2);
    if (rx <= 0 || ry <= 0) {
      return {
        d: `M ${pt(m, x, y)} L ${pt(m, x + w, y)} L ${pt(m, x + w, y + h)} L ${pt(m, x, y + h)} Z`,
      };
    }
    const kx = rx * K;
    const ky = ry * K;
    let d = `M ${pt(m, x + rx, y)}`;
    d += ` L ${pt(m, x + w - rx, y)}`;
    d += ` C ${pt(m, x + w - rx + kx, y)} ${pt(m, x + w, y + ry - ky)} ${pt(m, x + w, y + ry)}`;
    d += ` L ${pt(m, x + w, y + h - ry)}`;
    d += ` C ${pt(m, x + w, y + h - ry + ky)} ${pt(m, x + w - rx + kx, y + h)} ${pt(m, x + w - rx, y + h)}`;
    d += ` L ${pt(m, x + rx, y + h)}`;
    d += ` C ${pt(m, x + rx - kx, y + h)} ${pt(m, x, y + h - ry + ky)} ${pt(m, x, y + h - ry)}`;
    d += ` L ${pt(m, x, y + ry)}`;
    d += ` C ${pt(m, x, y + ry - ky)} ${pt(m, x + rx - kx, y)} ${pt(m, x + rx, y)}`;
    return { d: `${d} Z` };
  }
  if (tag === 'line') {
    return {
      d: `M ${pt(m, NUM(attrs.x1), NUM(attrs.y1))} L ${pt(m, NUM(attrs.x2), NUM(attrs.y2))}`,
    };
  }
  if (tag === 'polygon' || tag === 'polyline') {
    const nums = (attrs.points || '').trim().split(/[\s,]+/).map(Number);
    if (nums.length < 4) return null;
    let d = `M ${pt(m, nums[0], nums[1])}`;
    for (let i = 2; i + 1 < nums.length; i += 2) d += ` L ${pt(m, nums[i], nums[i + 1])}`;
    return { d: tag === 'polygon' ? `${d} Z` : d };
  }
  return null;
}

function hexToRgb(color) {
  const c = String(color || '').trim();
  if (c.startsWith('#')) {
    const hex = c.slice(1);
    const full = hex.length === 3 ? hex.split('').map((h) => h + h).join('') : hex;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    if ([r, g, b].every(Number.isFinite)) return `rgb(${r}, ${g}, ${b})`;
  }
  return c;
}

function inheritedAttr(node, attr, fallback) {
  let cur = node;
  while (cur && cur.tag !== '#root') {
    if (cur.attrs && cur.attrs[attr] !== undefined) return cur.attrs[attr];
    cur = cur.parent;
  }
  return fallback;
}

/* ---------------- 主流程 ---------------- */

const svgText = fs.readFileSync(SRC, 'utf8');
const svg = parseSvgTree(svgText);
if (!svg) {
  console.error('SVG 解析失败:', SRC);
  process.exit(1);
}

const vbParts = (svg.attrs.viewBox || '0 0 680 560').trim().split(/[\s,]+/).map(Number);
const viewBox = {
  x: vbParts[0] || 0,
  y: vbParts[1] || 0,
  w: vbParts[2] || 680,
  h: vbParts[3] || 560,
};

// 收集 <defs> 里的渐变与裁剪路径
const gradients = new Map();
const clipPaths = new Map();
let foot = { x: 320, y: 466 };

walk(svg, (node) => {
  if (node.tag === 'lineargradient' && node.attrs.id) {
    const stops = node.children
      .filter((c) => c.tag === 'stop')
      .map((s) => {
        const offRaw = s.attrs.offset || '0';
        const off = offRaw.endsWith('%') ? NUM(offRaw) / 100 : NUM(offRaw);
        return [Math.min(1, Math.max(0, R(off * 100) / 100)), hexToRgb(s.attrs['stop-color'] || '#888888')];
      });
    gradients.set(node.attrs.id, {
      id: node.attrs.id,
      units: node.attrs.gradientUnits || 'objectBoundingBox',
      x1: NUM(node.attrs.x1, 0),
      y1: NUM(node.attrs.y1, 0),
      x2: NUM(node.attrs.x2, 1),
      y2: NUM(node.attrs.y2, 0),
      href: (node.attrs.href || node.attrs['xlink:href'] || '').replace(/^#/, ''),
      stops,
    });
  } else if (node.tag === 'clippath' && node.attrs.id) {
    const shape = node.children.find((c) =>
      ['path', 'ellipse', 'rect', 'circle', 'polygon'].includes(c.tag)
    );
    if (shape) {
      const geo = shapeToD(shape, parseTransform(shape.attrs.transform));
      if (geo) clipPaths.set(node.attrs.id, geo.d);
    }
  } else if (node.attrs.id === 'Ground_Shadow_Ellipse') {
    foot = { x: NUM(node.attrs.cx, 320), y: NUM(node.attrs.cy, 466) };
  }
});

function resolvePaint(value) {
  if (!value || value === 'none' || value === 'transparent') return null;
  const mm = /^url\(["']?#([^"')]+)["']?\)/.exec(value.trim());
  if (!mm) return { k: 's', c: hexToRgb(value) };
  const g = gradients.get(mm[1]);
  if (!g) return null;
  const stops = g.stops.length ? g.stops : (gradients.get(g.href)?.stops ?? []);
  if (!stops.length) return { k: 's', c: 'rgb(136, 136, 136)' };
  return { k: 'l', s: stops, x1: R(g.x1), y1: R(g.y1), x2: R(g.x2), y2: R(g.y2) };
}

function clipFor(node) {
  let cur = node.parent;
  while (cur && cur !== svg) {
    const cp = cur.attrs?.['clip-path'];
    if (cp) {
      const mm = /url\(["']?#([^"')]+)["']?\)/.exec(cp);
      if (mm && clipPaths.has(mm[1])) return clipPaths.get(mm[1]);
    }
    cur = cur.parent;
  }
  return null;
}

const SHAPE_TAGS = new Set(['path', 'ellipse', 'circle', 'rect', 'line', 'polygon', 'polyline']);
const parts = [];

walk(svg, (node) => {
  if (!SHAPE_TAGS.has(node.tag)) return;
  if (hasAncestor(node, (a) => a.tag === 'defs')) return;
  if (hasAncestor(node, (a) => a.attrs?.id === 'Ground_Shadow')) return;

  const m = parseTransform(node.attrs.transform);
  const geo = shapeToD(node, m);
  if (!geo) return;

  const fillRaw = inheritedAttr(node, 'fill', node.tag === 'line' ? 'none' : '#000000');
  const strokeRaw = inheritedAttr(node, 'stroke', 'none');
  const strokeWidth = NUM(inheritedAttr(node, 'stroke-width', '1'), 1);
  const lc = inheritedAttr(node, 'stroke-linecap', 'round');
  const lj = inheritedAttr(node, 'stroke-linejoin', 'round');

  let op = 1;
  let anc = node;
  while (anc && anc !== svg) {
    if (anc.attrs?.opacity !== undefined) op *= NUM(anc.attrs.opacity, 1);
    anc = anc.parent;
  }

  const chain = [];
  let cur = node.parent;
  while (cur && cur !== svg) {
    const id = cur.attrs?.id;
    if (id && BONES.has(id)) chain.unshift(id);
    cur = cur.parent;
  }

  const cl = clipFor(node);
  const part = {
    d: geo.d,
    c: chain,
    f: node.tag !== 'line' ? resolvePaint(fillRaw) : null,
    st: strokeRaw !== 'none' && strokeWidth > 0 ? resolvePaint(strokeRaw) : null,
    w: R(strokeWidth),
    o: Math.round(op * 1000) / 1000,
    lc,
    lj,
  };
  if (geo.m) part.m = geo.m.map((v) => Math.round(v * 10000) / 10000);
  if (cl) part.cl = cl;
  parts.push(part);
});

/* ---------------- 写 src/lib/sipiqiRigData.ts ---------------- */

const lines = [
  '/**',
  ' * 自动生成，请勿手改 —— 改素材请编辑 public/npc/sipiqi_rig.svg，然后跑 `node scripts/bakeRig.mjs`。',
  ' *',
  ' * 这份数据是「拍扁后」的角色：几何已含图元自身 transform，颜色已解析成具体值，',
  ' * 渐变已换算成用户坐标。运行时只做 new Path2D() + 按骨骼压变换栈，不再碰 DOM。',
  ' */',
  '',
  'export type BakedPaint =',
  "  | { k: 's'; c: string }",
  "  | { k: 'l'; s: [number, string][]; x1: number; y1: number; x2: number; y2: number };",
  '',
  'export interface BakedPart {',
  '  /** 路径数据；基本图元的 transform 已烘进坐标，path 的原样保留并配合 m 使用 */',
  '  d: string;',
  '  /** path 图元自身的变换矩阵 [a,b,c,d,e,f]（没有则省略） */',
  '  m?: number[];',
  '  /** 骨骼链，从最外层到最内层 */',
  '  c: string[];',
  '  f: BakedPaint | null;',
  '  st: BakedPaint | null;',
  '  /** stroke-width */',
  '  w: number;',
  '  /** opacity */',
  '  o: number;',
  '  lc: CanvasLineCap;',
  '  lj: CanvasLineJoin;',
  '  /** 裁剪路径（脸部轮廓），已含该图元自身的 transform */',
  '  cl?: string;',
  '}',
  '',
  `export const RIG_VIEWBOX = ${JSON.stringify(viewBox)} as const;`,
  `export const RIG_FOOT = ${JSON.stringify(foot)} as const;`,
  '',
  'export const RIG_PARTS: BakedPart[] = [',
  ...parts.map((p) => `  ${JSON.stringify(p)},`),
  '];',
  '',
];

fs.writeFileSync(OUT_TS, lines.join('\n'), 'utf8');
console.log(`Baked ${parts.length} parts from ${path.relative(ROOT, SRC)} -> ${path.relative(ROOT, OUT_TS)}`);
