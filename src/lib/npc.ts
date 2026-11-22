/**
 * 房间里那位 NPC（见习修女）—— 动作直接来自 `q_h5.html` 那套爬行骨骼引擎。
 *
 * 素材是 H5 自己导出的雪碧图（12 帧 × 256px，透明）：
 *   `_scratch/h5_export.mjs` 驱动 H5 依次切到 crawl / dash / idle 三个模式并点「生成雪碧图」，
 *   `_scratch/merge_moves.mjs` 再把三条 3072×256 的动作条纵向拼成 `sipiqi_moves.png`（3072×768）。
 *
 * 于是这里只需要一张图 + 一条时间轴：
 *   row 0 = 循环爬行 (12fps)  row 1 = 加速狂爬 (22fps)  row 2 = 待机呼吸 (7fps)
 *
 * 位置与帧号全部由「房间共识时间」推出来（Date.now() - serverTimeOffsetMs），
 * 所以所有人看到她在同一条路线上、同一拍上，不需要任何服务端同步。
 */

export const NPC = {
  id: 'npc_sipiqi',
  name: '见习修女',
  sheet: '/npc/sipiqi_moves.png',
  /** 真骨骼驱动用的角色 SVG（骨骼 id 齐全，来自 q_h5.html） */
  rig: '/npc/sipiqi_rig.svg',
  cols: 12,
  rows: 3,
  /** 源图每帧边长 */
  framePx: 256,
  /** 画到世界里的边长（正方形帧） */
  size: 116,
  /** 贴地高度（脚底 y）：地毯上半部，在懒人沙发前面 */
  y: 600,
  /** 巡逻线段 */
  x0: 360,
  x1: 820,
};

export type NpcState = 'crawl' | 'dash' | 'idle';

const ROW: Record<NpcState, number> = { crawl: 0, dash: 1, idle: 2 };
const FPS: Record<NpcState, number> = { crawl: 12, dash: 22, idle: 7 };

/** 一轮 20 秒：爬过去 → 歇一下 → 加速爬回来 → 歇一下，首尾位置对齐所以无缝 */
const T_CRAWL = 10000;
const T_IDLE_1 = 3000;
const T_DASH = 4000;
const T_IDLE_2 = 3000;
const CYCLE_MS = T_CRAWL + T_IDLE_1 + T_DASH + T_IDLE_2;

export interface NpcPose {
  state: NpcState;
  row: number;
  frame: number;
  x: number;
  y: number;
  /** +1 朝右 / -1 朝左 */
  facing: 1 | -1;
  /** 骨骼驱动用的步态相位（弧度，一轮 = 2π），与导出的 12 帧一一对应 */
  theta: number;
  /** 眨眼系数：1 睁眼 */
  blink: number;
}

export function npcPoseAt(elapsedMs: number): NpcPose {
  const t = Math.max(0, elapsedMs);
  const phase = t % CYCLE_MS;
  const { x0, x1, y } = NPC;

  let state: NpcState;
  let localMs: number;
  let x: number;
  let facing: 1 | -1;

  if (phase < T_CRAWL) {
    state = 'crawl';
    localMs = phase;
    facing = 1;
    x = x0 + ((x1 - x0) * phase) / T_CRAWL;
  } else if (phase < T_CRAWL + T_IDLE_1) {
    state = 'idle';
    localMs = phase - T_CRAWL;
    facing = 1;
    x = x1;
  } else if (phase < T_CRAWL + T_IDLE_1 + T_DASH) {
    state = 'dash';
    localMs = phase - T_CRAWL - T_IDLE_1;
    facing = -1;
    x = x1 - ((x1 - x0) * localMs) / T_DASH;
  } else {
    state = 'idle';
    localMs = phase - T_CRAWL - T_IDLE_1 - T_DASH;
    facing = -1;
    x = x0;
  }

  const frame = Math.floor((localMs / 1000) * FPS[state]) % NPC.cols;
  // 骨骼驱动用的相位：一轮 = 12 帧，所以周期 = 12 / fps 秒
  const cycleSec = NPC.cols / FPS[state];
  const theta = ((localMs / 1000 / cycleSec) % 1) * Math.PI * 2;
  // 眨眼：每 4.2 秒眨一次，持续 120ms
  const blink = t % 4200 < 120 ? 0.12 : 1;

  return { state, row: ROW[state], frame, x, y, facing, theta, blink };
}
