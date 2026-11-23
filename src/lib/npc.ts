/**
 * 房间里的巡逻 NPC（见习修女）—— 基于房间共识时间的 2D 多样化巡逻编排。
 *
 * 所有位置、朝向、步态和动作都由 `elapsedMs = Date.now() - serverTimeOffsetMs` 确定性推算，
 * 房间内所有人看到她在同一坐标、做同一个动作，无需任何服务端同步消息。
 *
 * 行走多样性：
 *   - 2D 全场漫游：舞台前、观影过道、左右走廊、茶歇角、后排广场之间平滑衔接
 *   - 多种路径形态：弧线绕行（arc）、S 形蛇步（wave）、开心转圈（circle）
 *   - 多种步态：悠闲溜达（stroll）、标准爬行（crawl）、兔跳前进（hop）、加速狂爬（dash）、偷偷潜行（tiptoe）
 *   - 多种停留互动：呼吸待机（idle）、左右好奇张望（look）、伸懒腰（stretch）、原地开心晃晃（happy）
 */
import type { RigAnim } from './sipiqiRig';

export const NPC = {
  id: 'npc_sipiqi',
  name: '见习修女',
  sheet: '/npc/sipiqi_moves.png',
  /** 真骨骼驱动用的角色 SVG（骨骼 id 齐全） */
  rig: '/npc/sipiqi_rig.svg',
  cols: 12,
  rows: 3,
  /** 源图每帧边长 */
  framePx: 256,
  /** 画到世界里的边长（正方形帧） */
  size: 116,
  /** 初始默认锚点（仅做参考，实际 y 随 2D 巡逻实时变化） */
  y: 620,
  x0: 360,
  x1: 1220,
};

export type NpcState = RigAnim;

const ROW: Record<NpcState, number> = {
  crawl: 0,
  stroll: 0,
  tiptoe: 0,
  dash: 1,
  hop: 1,
  idle: 2,
  look: 2,
  stretch: 2,
  happy: 2,
  lifted: 2,
};

const FPS: Record<NpcState, number> = {
  crawl: 12,
  stroll: 9.5,
  tiptoe: 7.5,
  dash: 22,
  hop: 13.5,
  idle: 7,
  look: 6.5,
  stretch: 5.5,
  happy: 11,
  lifted: 14,
};

export interface NpcPose {
  state: NpcState;
  row: number;
  frame: number;
  x: number;
  y: number;
  /** +1 朝右 / -1 朝左 */
  facing: 1 | -1;
  /** 骨骼驱动用的步态相位（弧度，一轮 = 2π） */
  theta: number;
  /** 眨眼系数：1 睁眼 */
  blink: number;
  /** 脚下扬尘强度 0..1（加速狂爬 / 蹦跳落地时出现） */
  dust: number;
}

interface Pt {
  x: number;
  y: number;
}

type MoveAnim = 'crawl' | 'stroll' | 'dash' | 'hop' | 'tiptoe';
type PauseAnim = 'idle' | 'look' | 'stretch' | 'happy';

type Segment =
  | {
      kind: 'arc';
      anim: MoveAnim;
      from: Pt;
      to: Pt;
      /** 垂直于连线的弧度弯曲偏移（像素，正负决定左右拐弯） */
      bend: number;
      durationMs: number;
    }
  | {
      kind: 'wave';
      anim: MoveAnim;
      from: Pt;
      to: Pt;
      /** S 形侧向摆幅（像素） */
      amp: number;
      /** 摆动周期数 */
      waves: number;
      durationMs: number;
    }
  | {
      kind: 'circle';
      anim: MoveAnim;
      /** 起止锚点（绕行一圈后精确回到该点，无缝衔接） */
      anchor: Pt;
      /** 圆心相对锚点的偏移 */
      cxOff: number;
      cyOff: number;
      /** 1 顺时针 / -1 逆时针 */
      dir: 1 | -1;
      durationMs: number;
    }
  | {
      kind: 'pause';
      anim: PauseAnim;
      at: Pt;
      /** 停留初始朝向 */
      facing: 1 | -1;
      durationMs: number;
    };

/**
 * 覆盖三张内置地图（日落天台 / 美术馆 / 林间木屋）的公共安全漫游锚点。
 * 巨幕障碍在 x:[460..1140], y:[120..460]，这里全部落在 y:[510..860] 且远离四周墙体。
 */
const WP = {
  stageL: { x: 545, y: 520 },
  stageC: { x: 800, y: 515 },
  stageR: { x: 1055, y: 525 },
  leftHall: { x: 405, y: 625 },
  frontLeft: { x: 555, y: 635 },
  centerAisle: { x: 800, y: 642 },
  frontRight: { x: 1050, y: 638 },
  rightHall: { x: 1185, y: 625 },
  teaEdge: { x: 485, y: 785 },
  plazaL: { x: 640, y: 835 },
  plazaC: { x: 815, y: 845 },
  plazaR: { x: 1035, y: 810 },
} as const;

/**
 * 完整 2D 巡逻剧本（总时长 ~148 秒，首尾精确闭环）：
 * 每段都从上一段的终点出发，交替使用弧线、S 形、绕圈与四种不同停留互动，
 * 节奏有快有慢、路线不重复，观感生动自然。
 */
const SCRIPT: Segment[] = [
  // 1. 从前排左侧悠闲溜达到舞台中央看巨幕
  { kind: 'arc', anim: 'stroll', from: WP.frontLeft, to: WP.stageC, bend: -52, durationMs: 5600 },
  { kind: 'pause', anim: 'look', at: WP.stageC, facing: 1, durationMs: 3600 },

  // 2. 开心蹦跳着沿着舞台前向右跑
  { kind: 'wave', anim: 'hop', from: WP.stageC, to: WP.stageR, amp: 16, waves: 1.5, durationMs: 4200 },
  { kind: 'pause', anim: 'happy', at: WP.stageR, facing: -1, durationMs: 2600 },

  // 3. 绕大弧线加速冲进右侧走廊
  { kind: 'arc', anim: 'dash', from: WP.stageR, to: WP.rightHall, bend: 46, durationMs: 2600 },
  { kind: 'pause', anim: 'idle', at: WP.rightHall, facing: -1, durationMs: 2200 },

  // 4. 偷偷摸摸潜行到右下休闲区
  { kind: 'arc', anim: 'tiptoe', from: WP.rightHall, to: WP.plazaR, bend: 42, durationMs: 5400 },
  { kind: 'pause', anim: 'look', at: WP.plazaR, facing: -1, durationMs: 3400 },

  // 5. S 形扭着爬过观影区后方，来到后排广场中央迎接大家
  { kind: 'wave', anim: 'crawl', from: WP.plazaR, to: WP.plazaC, amp: 24, waves: 1.5, durationMs: 4600 },
  // 6. 在广场中央原地开心地转一个小圈撒欢
  { kind: 'circle', anim: 'hop', anchor: WP.plazaC, cxOff: 0, cyOff: -58, dir: 1, durationMs: 4800 },
  { kind: 'pause', anim: 'stretch', at: WP.plazaC, facing: -1, durationMs: 3600 },

  // 7. 悠闲慢步去茶歇角边逛逛
  { kind: 'arc', anim: 'stroll', from: WP.plazaC, to: WP.teaEdge, bend: 58, durationMs: 6200 },
  { kind: 'pause', anim: 'look', at: WP.teaEdge, facing: 1, durationMs: 3200 },

  // 8. 一路蹦蹦跳跳斜穿回中央观影过道
  { kind: 'arc', anim: 'hop', from: WP.teaEdge, to: WP.centerAisle, bend: -44, durationMs: 5200 },
  { kind: 'pause', anim: 'happy', at: WP.centerAisle, facing: 1, durationMs: 2800 },

  // 9. 在中央过道沿着地毯突然加速狂爬到右侧前排
  { kind: 'wave', anim: 'dash', from: WP.centerAisle, to: WP.frontRight, amp: 14, waves: 1, durationMs: 2500 },
  { kind: 'pause', anim: 'look', at: WP.frontRight, facing: -1, durationMs: 2800 },

  // 10. 弯回舞台左前：偷偷摸摸斜着潜行
  { kind: 'arc', anim: 'tiptoe', from: WP.frontRight, to: WP.stageL, bend: -68, durationMs: 7800 },
  { kind: 'pause', anim: 'stretch', at: WP.stageL, facing: 1, durationMs: 3400 },

  // 11. 顺着左走廊滑弧线溜达下来
  { kind: 'arc', anim: 'crawl', from: WP.stageL, to: WP.leftHall, bend: -38, durationMs: 4200 },
  { kind: 'pause', anim: 'idle', at: WP.leftHall, facing: 1, durationMs: 2200 },

  // 12. 开心冲刺到左下广场再绕小圈
  { kind: 'arc', anim: 'dash', from: WP.leftHall, to: WP.plazaL, bend: -45, durationMs: 3200 },
  { kind: 'circle', anim: 'crawl', anchor: WP.plazaL, cxOff: 56, cyOff: -24, dir: -1, durationMs: 4600 },
  { kind: 'pause', anim: 'happy', at: WP.plazaL, facing: 1, durationMs: 2600 },

  // 13. S 形悠闲散步穿过中间回到右侧再收尾回起点
  { kind: 'wave', anim: 'stroll', from: WP.plazaL, to: WP.centerAisle, amp: 22, waves: 1.5, durationMs: 5200 },
  { kind: 'pause', anim: 'look', at: WP.centerAisle, facing: -1, durationMs: 2800 },

  // 14. 轻快蹦跳回前排左侧起点，无缝接回第 1 段
  { kind: 'arc', anim: 'hop', from: WP.centerAisle, to: WP.frontLeft, bend: 36, durationMs: 3800 },
  { kind: 'pause', anim: 'idle', at: WP.frontLeft, facing: 1, durationMs: 2400 },
];

// 预计算每段的起止时间戳，方便 O(log N) / 线性快速定位
interface TimelineEntry {
  seg: Segment;
  startMs: number;
  endMs: number;
}

const TIMELINE: TimelineEntry[] = [];
let totalCycleMs = 0;
for (const seg of SCRIPT) {
  TIMELINE.push({ seg, startMs: totalCycleMs, endMs: totalCycleMs + seg.durationMs });
  totalCycleMs += seg.durationMs;
}

/** 平滑缓动：起止不突兀，中段保持均匀巡航感 */
function easeInOutSoft(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  // 混合 65% 线性 + 35% cubic smoothstep，既柔和起步又不会中间拖慢脚步
  const smooth = c * c * (3 - 2 * c);
  return c * 0.65 + smooth * 0.35;
}

function evalCurve(seg: Extract<Segment, { kind: 'arc' | 'wave' | 'circle' }>, u: number): Pt {
  const s = easeInOutSoft(u);
  if (seg.kind === 'arc') {
    const mx = (seg.from.x + seg.to.x) * 0.5;
    const my = (seg.from.y + seg.to.y) * 0.5;
    const dx = seg.to.x - seg.from.x;
    const dy = seg.to.y - seg.from.y;
    const len = Math.hypot(dx, dy) || 1;
    // 法向量 (-dy/len, dx/len)
    const cx = mx + (-dy / len) * seg.bend;
    const cy = my + (dx / len) * seg.bend;
    const mt = 1 - s;
    return {
      x: mt * mt * seg.from.x + 2 * mt * s * cx + s * s * seg.to.x,
      y: mt * mt * seg.from.y + 2 * mt * s * cy + s * s * seg.to.y,
    };
  }
  if (seg.kind === 'wave') {
    const dx = seg.to.x - seg.from.x;
    const dy = seg.to.y - seg.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    // 首尾包络 sin(πs) 保证起止精确贴合锚点
    const lateral = Math.sin(s * Math.PI * 2 * seg.waves) * Math.sin(s * Math.PI) * seg.amp;
    return {
      x: seg.from.x + dx * s + nx * lateral,
      y: seg.from.y + dy * s + ny * lateral,
    };
  }
  // circle：从 anchor 出发绕圆心一圈回到 anchor
  const cx = seg.anchor.x + seg.cxOff;
  const cy = seg.anchor.y + seg.cyOff;
  const r = Math.hypot(seg.cxOff, seg.cyOff) || 1;
  const startAngle = Math.atan2(seg.anchor.y - cy, seg.anchor.x - cx);
  const angle = startAngle + seg.dir * s * Math.PI * 2;
  return {
    x: cx + Math.cos(angle) * r,
    y: cy + Math.sin(angle) * r,
  };
}

/** 更自然的眨眼节律：不规则间隔 + 偶尔俏皮连眨两下 */
function naturalBlinkAt(tMs: number): number {
  const period = 7400;
  const p = tMs % period;
  // 第 1 次单眨
  if (p < 115) return 0.12;
  // 第 2 次快速双眨
  if (p >= 3100 && p < 3210) return 0.12;
  if (p >= 3370 && p < 3480) return 0.12;
  return 1;
}

export function npcPoseAt(elapsedMs: number): NpcPose {
  const t = Math.max(0, elapsedMs);
  const phase = t % totalCycleMs;

  // 找到当前所处剧本段
  let entry = TIMELINE[0];
  for (let i = 0; i < TIMELINE.length; i++) {
    if (phase < TIMELINE[i].endMs) {
      entry = TIMELINE[i];
      break;
    }
  }

  const { seg, startMs } = entry;
  const localMs = phase - startMs;
  const u = seg.durationMs > 0 ? localMs / seg.durationMs : 0;
  const state: NpcState = seg.anim;

  let x: number;
  let y: number;
  let facing: 1 | -1;

  if (seg.kind === 'pause') {
    x = seg.at.x;
    y = seg.at.y;
    if (seg.anim === 'look') {
      // 张望时中途自然转头看另一边，再转回来
      facing = u > 0.34 && u < 0.72 ? (seg.facing === 1 ? -1 : 1) : seg.facing;
    } else {
      facing = seg.facing;
    }
  } else {
    const pos = evalCurve(seg, u);
    x = pos.x;
    y = pos.y;

    // 沿路径切线方向决定朝向；垂直移动时退回到整段主方向避免频繁翻转
    const eps = 0.012;
    const pPrev = evalCurve(seg, Math.max(0, u - eps));
    const pNext = evalCurve(seg, Math.min(1, u + eps));
    const vx = pNext.x - pPrev.x;
    if (Math.abs(vx) > 0.35) {
      facing = vx >= 0 ? 1 : -1;
    } else if (seg.kind === 'circle') {
      facing = seg.dir === 1 ? (pos.y < seg.anchor.y + seg.cyOff ? 1 : -1) : pos.y < seg.anchor.y + seg.cyOff ? -1 : 1;
    } else {
      facing = seg.to.x >= seg.from.x ? 1 : -1;
    }
  }

  const fps = FPS[state];
  const frame = Math.floor((localMs / 1000) * fps) % NPC.cols;
  const cycleSec = NPC.cols / fps;
  const theta = ((localMs / 1000 / cycleSec) % 1) * Math.PI * 2;
  const blink = state === 'stretch' && u > 0.22 && u < 0.62 ? 0.14 : naturalBlinkAt(t);

  // 加速狂爬全程有轻尘，兔跳在落地瞬间扬起一点点小烟尘
  let dust = 0;
  if (state === 'dash') {
    dust = 0.75 + Math.sin(theta * 2) * 0.25;
  } else if (state === 'hop') {
    const norm = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (norm > 1.62 * Math.PI || norm < 0.24 * Math.PI) {
      dust = 0.65;
    }
  }

  return { state, row: ROW[state], frame, x, y, facing, theta, blink, dust };
}
