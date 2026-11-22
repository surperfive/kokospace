/**
 * 构建期编译骨骼角色：把 public/npc/sipiqi_rig.svg 拍扁成一份纯数据（几何 + 颜色），
 * 写到 src/lib/sipiqiRigData.ts。运行时就不再需要 DOM / getComputedStyle / getBBox。
 *
 * 拍扁时顺手修掉三处「运行时直接照抄会丢」的信息：
 *   1. 图元自身的 transform（19 个 rotate）→ 直接烘进路径坐标；
 *   2. 上级 <g> 的 clip-path（脸部裁剪）→ 记成每个图元的 clip 路径；
 *   3. <defs> 里的图元（裁剪路径本身）→ 不当成绘图元素。
 *
 * 用法：npm run rig:bake
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { RIG_BONES } from './rigBones.mjs';

const TRACE = 'C:/Users/OOW/Downloads/kokospace (1)/_scratch/bake_trace.log';
const trace = (...a) => {
  try {
    fs.appendFileSync(TRACE, a.join(' ') + '\n');
  } catch {}
};
trace('--- start');

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/OOW/Downloads/qing (2)/node_modules/playwright-core');

const ROOT = 'C:/Users/OOW/Downloads/kokospace (1)';
const SRC = `${ROOT}/public/npc/sipiqi_rig.svg`;
const OUT_TS = `${ROOT}/src/lib/sipiqiRigData.ts`;
const OUT_REPORT = `${ROOT}/_scratch/rig_bake_report.txt`;
const OUT_IMG = `${ROOT}/_scratch/rig_bake`;

const svgText = fs.readFileSync(SRC, 'utf8');
trace('svg loaded', svgText.length);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
trace('browser launched');
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
page.on('console', (m) => trace('PAGE', m.type(), m.text().slice(0, 200)));
page.on('pageerror', (e) => trace('PAGEERROR', String(e && e.message).slice(0, 400)));
await page.setContent('<!doctype html><html><body style="margin:0;background:#ffffff"></body></html>');
trace('page ready');

let res;
try {
  res = await Promise.race([
    page.evaluate(bake, { svgText, bones: RIG_BONES }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('evaluate timeout 60s')), 60000)),
  ]);
  trace('evaluate done', res && res.fatal ? 'fatal' : 'ok', res && res.parts ? res.parts.length : 'n/a');
} catch (e) {
  trace('EVAL ERR', String(e && e.message).slice(0, 500));
  await browser.close();
  process.exit(1);
}
await browser.close();
trace('browser closed');

if (res.fatal) {
  fs.writeFileSync(OUT_REPORT, `FATAL: ${res.fatal}\n`, 'utf8');
  console.error(res.fatal);
  process.exit(1);
}

/* ---------------- 写数据文件 ---------------- */
const lines = [];
lines.push('/**');
lines.push(' * 自动生成，请勿手改 —— 改素材请编辑 public/npc/sipiqi_rig.svg，然后跑 `npm run rig:bake`。');
lines.push(' *');
lines.push(' * 这份数据是「拍扁后」的角色：几何已含图元自身 transform，颜色已从 CSS 解析成具体值，');
lines.push(' * 渐变已换算成用户坐标。运行时只做 new Path2D() + 按骨骼压变换栈，不再碰 DOM。');
lines.push(' */');
lines.push('');
lines.push('export type BakedPaint =');
lines.push("  | { k: 's'; c: string }");
lines.push("  | { k: 'l'; s: [number, string][]; x1: number; y1: number; x2: number; y2: number };");
lines.push('');
lines.push('export interface BakedPart {');
lines.push('  /** 路径数据；基本图元的 transform 已烘进坐标，path 的原样保留并配合 m 使用 */');
lines.push('  d: string;');
lines.push('  /** path 图元自身的变换矩阵 [a,b,c,d,e,f]（没有则省略） */');
lines.push('  m?: number[];');
lines.push('  /** 骨骼链，从最外层到最内层 */');
lines.push('  c: string[];');
lines.push('  f: BakedPaint | null;');
lines.push('  st: BakedPaint | null;');
lines.push('  /** stroke-width */');
lines.push('  w: number;');
lines.push('  /** opacity */');
lines.push('  o: number;');
lines.push("  lc: CanvasLineCap;");
lines.push("  lj: CanvasLineJoin;");
lines.push('  /** 裁剪路径（脸部轮廓），已含该图元自身的 transform */');
lines.push('  cl?: string;');
lines.push('}');
lines.push('');
lines.push(
  `export const RIG_VIEWBOX = ${JSON.stringify(res.viewBox)} as const;`
);
lines.push(`export const RIG_FOOT = ${JSON.stringify(res.foot)} as const;`);
lines.push('');
lines.push(`export const RIG_PARTS: BakedPart[] = [`);
for (const p of res.parts) lines.push(`  ${JSON.stringify(p)},`);
lines.push('];');
lines.push('');
fs.writeFileSync(OUT_TS, lines.join('\n'), 'utf8');

/* ---------------- 报告 ---------------- */
fs.mkdirSync(OUT_IMG, { recursive: true });
for (const [name, dataUrl] of Object.entries(res.images || {})) {
  const b64 = dataUrl.split(',')[1];
  fs.writeFileSync(`${OUT_IMG}/${name}.png`, Buffer.from(b64, 'base64'));
}

const rep = [];
rep.push(`源文件 ${SRC}`);
rep.push(`图元 ${res.parts.length} 个，viewBox ${JSON.stringify(res.viewBox)}，脚底 ${JSON.stringify(res.foot)}`);
rep.push('');
rep.push('== 自查 ==');
rep.push(`不支持的特性: ${JSON.stringify(res.unsupported)}`);
rep.push(`带自身 transform 的图元: ${res.withTransform}`);
rep.push(`被裁剪的图元: ${res.clipped}`);
rep.push(`跳过的 <defs> 图元: ${res.skippedDefs}`);
rep.push(`跳过的 #Ground_Shadow 图元: ${res.skippedShadow}`);
rep.push(`祖先带 opacity 的图元: ${res.inheritedOpacity}`);
rep.push(`缺失 fill 而继承来的图元: ${res.inheritedFill.length} -> ${JSON.stringify(res.inheritedFill)}`);
rep.push(`渐变数: ${res.gradients}，其中带 transform 的: ${res.gradientsWithTransform}`);
rep.push('');
rep.push('== 光栅对比（参考图 = 浏览器自己渲染这份 SVG） ==');
rep.push(`新版（烘焙数据）: ${res.diffB}`);
rep.push(`旧版（运行时逻辑）: ${res.diffC}`);
rep.push('');
rep.push('== warnings ==');
rep.push(...(res.warnings.length ? res.warnings : ['（无）']));

fs.writeFileSync(OUT_REPORT, rep.join('\n'), 'utf8');
console.log(rep.join('\n'));

/* ============================================================ */

function bake({ svgText, bones }) {
  const BONES = new Set(bones);
  const R = (n) => Math.round(n * 100) / 100;
  const NUM = (v, d = 0) => {
    const n = Number.parseFloat(String(v ?? ''));
    return Number.isFinite(n) ? n : d;
  };
  const K = 0.5522847498307936;
  const warnings = [];

  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:0;top:0;';
  host.innerHTML = svgText;
  document.body.appendChild(host);
  const svg = host.querySelector('svg');
  if (!svg) return { fatal: 'SVG 解析失败' };
  console.log('mounted, shapes=', svg.querySelectorAll('path').length);

  const vbAttr = (svg.getAttribute('viewBox') || '0 0 680 560')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBox = { x: vbAttr[0] || 0, y: vbAttr[1] || 0, w: vbAttr[2] || 680, h: vbAttr[3] || 560 };

  // ---------- 不支持的特性 -------------
  const unsupported = {};
  for (const sel of ['filter', 'mask', 'image', 'text', 'use', 'foreignObject']) {
    const n = svg.querySelectorAll(sel).length;
    if (n) unsupported[sel] = n;
  }
  const radialN = svg.querySelectorAll('radialGradient').length;
  if (radialN) unsupported.radialGradient = radialN;

  // ---------- 工具：自身 transform / 点变换 -------------
  const ownMatrix = (el) => {
    const list = el.transform && el.transform.baseVal;
    if (!list || !list.length) return null;
    const c = list.consolidate();
    if (!c) return null;
    const m = c.matrix;
    if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0) return null;
    return [m.a, m.b, m.c, m.d, m.e, m.f];
  };
  const tp = (m, x, y) => (m ? [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]] : [x, y]);
  const fmt = (m, x, y) => {
    const [px, py] = tp(m, x, y);
    return `${R(px)} ${R(py)}`;
  };

  // ---------- 工具：把基本图元转成 d（顺带拍平 transform） -------------
  function shapeToD(el, m) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'path') {
      const d = el.getAttribute('d');
      if (!d) return null;
      // path 的 d 没法直接改坐标；带 transform 时留给运行时用矩阵叠加
      return { d, m: m || undefined };
    }
    if (tag === 'circle' || tag === 'ellipse') {
      const cx = NUM(el.getAttribute('cx'));
      const cy = NUM(el.getAttribute('cy'));
      const rx = tag === 'circle' ? NUM(el.getAttribute('r')) : NUM(el.getAttribute('rx'));
      const ry = tag === 'circle' ? NUM(el.getAttribute('r')) : NUM(el.getAttribute('ry'));
      const kx = rx * K;
      const ky = ry * K;
      const seg = [
        [cx + rx, cy - ky, cx + kx, cy - ry, cx, cy - ry],
        [cx - kx, cy - ry, cx - rx, cy - ky, cx - rx, cy],
        [cx - rx, cy + ky, cx - kx, cy + ry, cx, cy + ry],
        [cx + kx, cy + ry, cx + rx, cy + ky, cx + rx, cy],
      ];
      let d = `M ${fmt(m, cx + rx, cy)}`;
      for (const [c1x, c1y, c2x, c2y, ex, ey] of seg) {
        d += ` C ${fmt(m, c1x, c1y)} ${fmt(m, c2x, c2y)} ${fmt(m, ex, ey)}`;
      }
      return { d: d + ' Z' };
    }
    if (tag === 'rect') {
      const x = NUM(el.getAttribute('x'));
      const y = NUM(el.getAttribute('y'));
      const w = NUM(el.getAttribute('width'));
      const h = NUM(el.getAttribute('height'));
      let rx = NUM(el.getAttribute('rx'), -1);
      let ry = NUM(el.getAttribute('ry'), -1);
      if (rx < 0) rx = ry < 0 ? 0 : ry;
      if (ry < 0) ry = rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (rx <= 0 || ry <= 0) {
        return {
          d:
            `M ${fmt(m, x, y)} L ${fmt(m, x + w, y)} L ${fmt(m, x + w, y + h)} ` +
            `L ${fmt(m, x, y + h)} Z`,
        };
      }
      const kx = rx * K;
      const ky = ry * K;
      // 用三次贝塞尔拼圆角，避免「弧线 + 矩阵」在 canvas 里的参数化差异
      let d = `M ${fmt(m, x + rx, y)}`;
      d += ` L ${fmt(m, x + w - rx, y)}`;
      d += ` C ${fmt(m, x + w - rx + kx, y)} ${fmt(m, x + w, y + ry - ky)} ${fmt(m, x + w, y + ry)}`;
      d += ` L ${fmt(m, x + w, y + h - ry)}`;
      d += ` C ${fmt(m, x + w, y + h - ry + ky)} ${fmt(m, x + w - rx + kx, y + h)} ${fmt(m, x + w - rx, y + h)}`;
      d += ` L ${fmt(m, x + rx, y + h)}`;
      d += ` C ${fmt(m, x + rx - kx, y + h)} ${fmt(m, x, y + h - ry + ky)} ${fmt(m, x, y + h - ry)}`;
      d += ` L ${fmt(m, x, y + ry)}`;
      d += ` C ${fmt(m, x, y + ry - ky)} ${fmt(m, x + rx - kx, y)} ${fmt(m, x + rx, y)}`;
      return { d: d + ' Z' };
    }
    if (tag === 'line') {
      return {
        d:
          `M ${fmt(m, NUM(el.getAttribute('x1')), NUM(el.getAttribute('y1')))} ` +
          `L ${fmt(m, NUM(el.getAttribute('x2')), NUM(el.getAttribute('y2')))}`,
      };
    }
    if (tag === 'polygon' || tag === 'polyline') {
      const nums = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      if (nums.length < 4) return null;
      let d = `M ${fmt(m, nums[0], nums[1])}`;
      for (let i = 2; i + 1 < nums.length; i += 2) d += ` L ${fmt(m, nums[i], nums[i + 1])}`;
      return { d: tag === 'polygon' ? d + ' Z' : d };
    }
    return null;
  }

  // ---------- 渐变解析 ----------
  function resolvePaint(value, bbox) {
    if (!value || value === 'none' || value === 'transparent') return null;
    const mm = /^url\(["']?#([^"')]+)["']?\)/.exec(value);
    if (!mm) return { k: 's', c: value };
    const grad = svg.querySelector(`#${CSS.escape(mm[1])}`);
    if (!grad) return null;
    if (grad.tagName.toLowerCase() !== 'lineargradient') {
      warnings.push(`暂不支持 ${grad.tagName}（#${mm[1]}），退回灰底`);
      return { k: 's', c: '#888888' };
    }
    const stopHost =
      grad.querySelectorAll('stop').length > 0
        ? grad
        : (() => {
            const href = grad.getAttribute('xlink:href') || grad.getAttribute('href');
            const id = href?.startsWith('#') ? href.slice(1) : '';
            return id ? svg.querySelector(`#${CSS.escape(id)}`) : null;
          })();
    if (!stopHost) return { k: 's', c: '#888888' };

    const stops = Array.from(stopHost.querySelectorAll('stop')).map((s) => {
      const cs = getComputedStyle(s);
      const offRaw = s.getAttribute('offset') || '0';
      const off = offRaw.endsWith('%') ? NUM(offRaw) / 100 : NUM(offRaw);
      const color = cs.stopColor || s.getAttribute('stop-color') || '#888888';
      const op = Number.parseFloat(cs.stopOpacity || s.getAttribute('stop-opacity') || '1');
      return [Math.min(1, Math.max(0, off)), op >= 1 ? color : mixAlpha(color, op)];
    });
    if (!stops.length) return { k: 's', c: '#888888' };

    const isOBB = (grad.getAttribute('gradientUnits') || 'objectBoundingBox') === 'objectBoundingBox';
    const toUser = (vx, vy) => (isOBB ? [bbox.x + vx * bbox.w, bbox.y + vy * bbox.h] : [vx, vy]);
    let [x1, y1] = toUser(NUM(grad.getAttribute('x1'), 0), NUM(grad.getAttribute('y1'), 0));
    let [x2, y2] = toUser(NUM(grad.getAttribute('x2'), 1), NUM(grad.getAttribute('y2'), 0));

    const gt = grad.getAttribute('gradientTransform');
    if (gt) {
      const gm = matrixOf(gt);
      [x1, y1] = [gm[0] * x1 + gm[2] * y1 + gm[4], gm[1] * x1 + gm[3] * y1 + gm[5]];
      [x2, y2] = [gm[0] * x2 + gm[2] * y2 + gm[4], gm[1] * x2 + gm[3] * y2 + gm[5]];
      gradientsWithTransform++;
    }
    return { k: 'l', s: stops, x1: R(x1), y1: R(y1), x2: R(x2), y2: R(y2) };
  }
  function mixAlpha(color, alpha) {
    const c = String(color).trim();
    const m = /^rgb\((\d+)[,\s]+(\d+)[,\s]+(\d+)\)$/.exec(c);
    if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
    if (c.startsWith('#')) {
      const hex = c.slice(1);
      const full = hex.length === 3 ? hex.split('').map((h) => h + h).join('') : hex;
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      if ([r, g, b].every(Number.isFinite)) return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return c;
  }
  function matrixOf(str) {
    const id = [1, 0, 0, 1, 0, 0];
    const m = /matrix\(([^)]+)\)/.exec(str);
    if (m) {
      const p = m[1].split(/[\s,]+/).map(Number);
      if (p.length === 6 && p.every(Number.isFinite)) return p;
    }
    const t = /translate\(([^)]+)\)/.exec(str);
    if (t) {
      const p = t[1].split(/[\s,]+/).map(Number);
      return [1, 0, 0, 1, p[0] || 0, p[1] || 0];
    }
    return id;
  }

  // ---------- 祖先裁剪 ----------
  function clipFor(el) {
    let cur = el.parentElement;
    while (cur && cur !== svg) {
      const cp = cur.getAttribute('clip-path');
      if (cp) {
        const mm = /url\(["']?#([^"')]+)["']?\)/.exec(cp);
        if (mm) {
          const holder = svg.querySelector(`#${CSS.escape(mm[1])}`);
          const shape = holder && holder.querySelector('path, ellipse, rect, circle, polygon');
          if (!shape) return null;
          const s = shapeToD(shape, null);
          return s ? s.d : null;
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

  // ---------- 主循环 ----------
  const parts = [];
  const inheritedFill = [];
  let withTransform = 0;
  let clipped = 0;
  let skippedDefs = 0;
  let skippedShadow = 0;
  let inheritedOpacity = 0;
  let gradients = 0;
  let gradientsWithTransform = 0;
  let curClipD = null;

  const shapes = svg.querySelectorAll('path, ellipse, circle, rect, line, polygon, polyline');
  shapes.forEach((el) => {
    if (el.closest('defs')) {
      skippedDefs++;
      return;
    }
    if (el.closest('#Ground_Shadow')) {
      skippedShadow++;
      return;
    }
    const m = ownMatrix(el);
    const geo = shapeToD(el, m);
    if (!geo) return;
    if (m) withTransform++;

    const cs = getComputedStyle(el);
    const tag = el.tagName.toLowerCase();

    // 渐变需要的 bbox：基本图元用解析式（未含自身 transform），path 用 getBBox
    let bbox;
    if (tag === 'circle' || tag === 'ellipse') {
      const cx = NUM(el.getAttribute('cx'));
      const cy = NUM(el.getAttribute('cy'));
      const rx = tag === 'circle' ? NUM(el.getAttribute('r')) : NUM(el.getAttribute('rx'));
      const ry = tag === 'circle' ? NUM(el.getAttribute('r')) : NUM(el.getAttribute('ry'));
      bbox = { x: cx - rx, y: cy - ry, w: rx * 2 || 1, h: ry * 2 || 1 };
    } else if (tag === 'rect') {
      bbox = {
        x: NUM(el.getAttribute('x')),
        y: NUM(el.getAttribute('y')),
        w: NUM(el.getAttribute('width')) || 1,
        h: NUM(el.getAttribute('height')) || 1,
      };
    } else {
      const bb = el.getBBox();
      bbox = { x: bb.x, y: bb.y, w: bb.width || 1, h: bb.height || 1 };
    }

    const fillsRaw = cs.fill;
    const strokesRaw = cs.stroke;
    if (fillsRaw && fillsRaw.startsWith('url(')) gradients++;
    if (strokesRaw && strokesRaw.startsWith('url(')) gradients++;

    if (!el.getAttribute('fill') && fillsRaw && fillsRaw !== 'none') {
      inheritedFill.push(`${tag} -> ${fillsRaw}`);
    }

    // 祖先 opacity 叠乘（当前实现只看自身，这里补全）
    let op = Number.parseFloat(cs.opacity || '1') || 1;
    let anc = el.parentElement;
    while (anc && anc !== svg) {
      const o = getComputedStyle(anc).opacity;
      if (o && o !== '1') {
        op *= Number.parseFloat(o) || 1;
        inheritedOpacity++;
      }
      anc = anc.parentElement;
    }

    const chain = [];
    let node = el.parentElement;
    while (node && node !== svg) {
      const id = node.getAttribute('id');
      if (id && BONES.has(id)) chain.unshift(id);
      node = node.parentElement;
    }

    // 渐变 + 自身 transform 的组合会失准，明确报警
    const hasGrad = /url\(/.test(fillsRaw || '') || /url\(/.test(strokesRaw || '');
    if (m && hasGrad) warnings.push(`图元同时带 transform 与渐变，坐标可能有偏差（${tag}）`);

    curClipD = clipFor(el);
    if (curClipD) clipped++;

    const part = {
      d: geo.d,
      c: chain,
      // <line> 的填充没有面积，直接不填，省一次空绘制
      f: tag !== 'line' && fillsRaw && fillsRaw !== 'none' ? resolvePaint(fillsRaw, bbox) : null,
      st: strokesRaw && strokesRaw !== 'none' && NUM(cs.strokeWidth, 0) > 0 ? resolvePaint(strokesRaw, bbox) : null,
      w: R(NUM(cs.strokeWidth, 1)),
      o: R(op * 1000) / 1000,
      lc: cs.strokeLinecap || 'round',
      lj: cs.strokeLinejoin || 'round',
    };
    if (geo.m) part.m = geo.m.map((v) => R(v * 10000) / 10000);
    if (curClipD) part.cl = curClipD;
    parts.push(part);
  });

  const shadowEl = svg.querySelector('#Ground_Shadow_Ellipse');
  const foot = {
    x: NUM(shadowEl && shadowEl.getAttribute('cx'), 320),
    y: NUM(shadowEl && shadowEl.getAttribute('cy'), 466),
  };
  console.log('parts done', parts.length);

  /* ================= 光栅自检 ================= */
  const S = 2;
  const W = Math.round(viewBox.w);
  const H = Math.round(viewBox.h);
  const mkCanvas = () => {
    const c = document.createElement('canvas');
    c.width = W * S;
    c.height = H * S;
    const x = c.getContext('2d');
    x.scale(S, S);
    x.translate(-viewBox.x, -viewBox.y);
    return { c, x };
  };

  // 参考图：让浏览器自己渲染这份 SVG（按 2× 设备像素光栅化，避免上采样模糊）。
  // 把地面阴影去掉 —— 那块由 canvas 单独画（跟着骨骼缩放），不参与几何对比。
  const refSvg = svgText
    .replace(/<ellipse[^>]*Ground_Shadow_Ellipse[^>]*\/>/, '')
    .replace(/<svg\b/, `<svg width="${W * S}" height="${H * S}"`);
  const refUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(refSvg);

  const paintOf = (ctx, p) => {
    if (!p) return null;
    if (p.k === 's') return p.c;
    const g = ctx.createLinearGradient(p.x1, p.y1, p.x2, p.y2);
    for (const [off, col] of p.s) g.addColorStop(off, col);
    return g;
  };

  const drawBaked = (ctx) => {
    for (const p of parts) {
      ctx.save();
      if (p.cl) ctx.clip(new Path2D(p.cl));
      if (p.o < 1) ctx.globalAlpha *= p.o;
      let path = new Path2D(p.d);
      if (p.m) {
        const t = new Path2D();
        t.addPath(path, new DOMMatrix(p.m));
        path = t;
      }
      if (p.f) {
        ctx.fillStyle = paintOf(ctx, p.f);
        ctx.fill(path);
      }
      if (p.st) {
        ctx.strokeStyle = paintOf(ctx, p.st);
        ctx.lineWidth = p.w;
        ctx.lineCap = p.lc;
        ctx.lineJoin = p.lj;
        ctx.stroke(path);
      }
      ctx.restore();
    }
  };

  // 旧实现：不认自身 transform、不认 clip、把 defs 里那条裁剪路径也画成实心
  const drawLegacy = (ctx) => {
    const list = svg.querySelectorAll('path, ellipse, circle, rect, line, polygon, polyline');
    list.forEach((el) => {
      if (el.closest('#Ground_Shadow')) return;
      const tag = el.tagName.toLowerCase();
      let path = null;
      if (tag === 'path') {
        const d = el.getAttribute('d');
        path = d ? new Path2D(d) : null;
      } else {
        const g = shapeToD(el, null);
        path = g ? new Path2D(g.d) : null;
      }
      if (!path) return;
      const cs = getComputedStyle(el);
      let bbox;
      if (tag === 'circle' || tag === 'ellipse') {
        const cx = NUM(el.getAttribute('cx'));
        const cy = NUM(el.getAttribute('cy'));
        const rx = tag === 'circle' ? NUM(el.getAttribute('r')) : NUM(el.getAttribute('rx'));
        const ry = tag === 'circle' ? NUM(el.getAttribute('r')) : NUM(el.getAttribute('ry'));
        bbox = { x: cx - rx, y: cy - ry, w: rx * 2 || 1, h: ry * 2 || 1 };
      } else {
        const bb = el.getBBox();
        bbox = { x: bb.x, y: bb.y, w: bb.width || 1, h: bb.height || 1 };
      }
      const op = Number.parseFloat(cs.opacity || '1') || 1;
      ctx.save();
      if (op < 1) ctx.globalAlpha *= op;
      if (cs.fill !== 'none') {
        const p = resolvePaint(cs.fill, bbox);
        if (p) {
          ctx.fillStyle = paintOf(ctx, p);
          ctx.fill(path);
        }
      }
      if (cs.stroke !== 'none' && NUM(cs.strokeWidth, 0) > 0) {
        const p = resolvePaint(cs.stroke, bbox);
        if (p) {
          ctx.strokeStyle = paintOf(ctx, p);
          ctx.lineWidth = NUM(cs.strokeWidth, 1);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke(path);
        }
      }
      ctx.restore();
    });
  };

  const b = mkCanvas();
  drawBaked(b.x);
  console.log('drew baked');
  const cCanv = mkCanvas();
  drawLegacy(cCanv.x);
  console.log('drew legacy');

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ref = mkCanvas();
      ref.x.drawImage(img, viewBox.x, viewBox.y, W, H);

      const cmp = (canvas) => {
        const a = ref.x.getImageData(0, 0, ref.c.width, ref.c.height).data;
        const bb = canvas.x.getImageData(0, 0, canvas.c.width, canvas.c.height).data;
        let sum = 0;
        let bad = 0;
        const n = a.length / 4;
        for (let i = 0; i < a.length; i += 4) {
          const d =
            Math.abs(a[i] - bb[i]) + Math.abs(a[i + 1] - bb[i + 1]) + Math.abs(a[i + 2] - bb[i + 2]);
          sum += d / 3;
          if (d > 72) bad++;
        }
        return { mae: (sum / n).toFixed(3), badPct: ((bad / n) * 100).toFixed(3) };
      };

      const dB = cmp(b);
      const dC = cmp(cCanv);

      // 三张对比图 + 一张热力图
      const heat = (canvas) => {
        const out = document.createElement('canvas');
        out.width = ref.c.width;
        out.height = ref.c.height;
        const ox = out.getContext('2d');
        const a = ref.x.getImageData(0, 0, ref.c.width, ref.c.height).data;
        const bb = canvas.x.getImageData(0, 0, ref.c.width, ref.c.height).data;
        const im = ox.createImageData(ref.c.width, ref.c.height);
        for (let i = 0; i < a.length; i += 4) {
          const d =
            Math.abs(a[i] - bb[i]) + Math.abs(a[i + 1] - bb[i + 1]) + Math.abs(a[i + 2] - bb[i + 2]);
          const v = Math.min(255, d * 3);
          im.data[i] = 255;
          im.data[i + 1] = 255 - v;
          im.data[i + 2] = 255 - v;
          im.data[i + 3] = 255;
        }
        ox.putImageData(im, 0, 0);
        return out.toDataURL('image/png');
      };

      resolve({
        parts,
        viewBox,
        foot,
        unsupported,
        warnings,
        withTransform,
        clipped,
        skippedDefs,
        skippedShadow,
        inheritedOpacity,
        inheritedFill,
        gradients,
        gradientsWithTransform,
        diffB: `平均误差 ${dB.mae}/255，明显不符像素 ${dB.badPct}%`,
        diffC: `平均误差 ${dC.mae}/255，明显不符像素 ${dC.badPct}%`,
        images: {
          '1_reference': ref.c.toDataURL('image/png'),
          '2_baked': b.c.toDataURL('image/png'),
          '3_legacy': cCanv.c.toDataURL('image/png'),
          '4_heat_baked': heat(b),
          '5_heat_legacy': heat(cCanv),
        },
      });
    };
    img.onerror = () => resolve({ fatal: '参考图加载失败' });
    img.src = refUrl;
  });
}
