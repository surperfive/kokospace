import { AvatarConfig } from '../types/metaverse';
import { resolveRigMotion, solveAvatarPose } from './avatarPose';
import { drawPaperDollAvatar } from './avatarPaperDoll';

export { deriveChibiPalette, solveAvatarPose } from './avatarPose';

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
  /** 世界画布中的角色缩放倍数（脚底锚定缩放，名牌与气泡保持清晰克制尺寸） */
  worldScale?: number;
}

/**
 * 纯 3 层可替换 PNG 精灵渲染入口（已彻底移除 SVG / 矢量角色绘制）：
 * 每一帧均由「服装与身体」「头部与五官」「发型与帽子」三个独立 PNG 图层实时合成，
 * 任意一层均可自由切换内置素材、改色或上传自定义 PNG 替换。
 */
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
    worldScale = 1,
  } = opts;

  const { phase, walkW, carryW } = resolveRigMotion(rigKey, timeMs, isMoving, isCarrying);
  const pose = solveAvatarPose(dir, timeMs, phase, walkW, carryW, isSitting);
  const isSide = dir === 'left' || dir === 'right';

  ctx.save();
  ctx.translate(x, y);

  // 脚底锚定缩放：角色躯体、阴影与脉冲光环同步放大，脚底稳稳贴合地面坐标
  ctx.save();
  if (worldScale !== 1) {
    ctx.translate(0, 16);
    ctx.scale(worldScale, worldScale);
    ctx.translate(0, -16);
  }

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

  // 2. 地面柔和阴影
  if (!hideShadow) {
    ctx.save();
    ctx.fillStyle = 'rgba(35, 30, 41, 0.16)';
    const sh = pose.shadowScale;
    const rxMain = (isSitting ? 18.5 : isSide ? 15 : 17) * sh;
    ctx.beginPath();
    ctx.ellipse(0, 16, rxMain, 5.6 * sh, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 3. 3 层独立 PNG 纸娃娃实时合成渲染
  drawPaperDollAvatar(
    ctx,
    avatar,
    dir,
    isMoving,
    isSitting,
    isCarrying,
    timeMs,
    pose.rootBouncePx,
    pose.rootSx,
    pose.rootSy
  );
  ctx.restore();

  // 4. 名牌（保持清晰易读比例，贴合放大后的脚底阴影下方）
  if (!hideName) {
    const label = `${isHost ? '★ ' : ''}${name}${isMe ? ' (我)' : ''}`;
    const nameFontPx = worldScale >= 2.2 ? 15 : worldScale > 1.35 ? 13 : 11;
    ctx.font = `600 ${nameFontPx}px "Plus Jakarta Sans", "PingFang SC", sans-serif`;
    const tw = ctx.measureText(label).width;
    const boxW = tw + (isMicOn ? 26 : 18);
    const boxH = worldScale >= 2.2 ? 26 : worldScale > 1.35 ? 24 : 20;
    const nameTopY = 23 + Math.round((worldScale - 1) * 8);

    ctx.fillStyle = isMe ? 'rgba(24, 24, 27, 0.88)' : 'rgba(255, 255, 255, 0.94)';
    roundRectPath(ctx, -boxW / 2, nameTopY, boxW, boxH, 8);
    ctx.fill();
    ctx.strokeStyle = isMe ? '#18181B' : 'rgba(24, 24, 27, 0.14)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isMe ? '#FFFFFF' : '#18181B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, isMicOn ? -4 : 0, nameTopY + boxH / 2 + 0.5);

    if (isMicOn) {
      ctx.fillStyle = isBroadcasting ? '#FF5A36' : '#10B981';
      ctx.beginPath();
      ctx.arc(boxW / 2 - 9, nameTopY + boxH / 2, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 5. 头顶聊天气泡（按放大后的实际帽顶高度自适应上移）
  if (chatBubble && chatBubbleAlpha > 0.01) {
    const truncated = chatBubble.length > 22 ? chatBubble.slice(0, 21) + '…' : chatBubble;
    ctx.save();
    ctx.globalAlpha = chatBubbleAlpha;
    if (chatBubbleRise) ctx.translate(0, -chatBubbleRise);
    const bubbleFontPx = worldScale >= 2.2 ? 15 : worldScale > 1.35 ? 14 : 12;
    ctx.font = `500 ${bubbleFontPx}px "Plus Jakarta Sans", "PingFang SC", sans-serif`;
    const bw = Math.max(48, ctx.measureText(truncated).width + 22);
    const bh = worldScale >= 2.2 ? 32 : worldScale > 1.35 ? 30 : 26;
    const headHeight = avatar.hairStyle === 'wuxia' ? 86 : 78;
    const topY = 16 - headHeight * worldScale - bh;
    ctx.fillStyle = '#FFFFFF';
    roundRectPath(ctx, -bw / 2, topY, bw, bh, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(24, 24, 27, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#18181B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncated, 0, topY + bh / 2);
    ctx.restore();
  }

  ctx.restore();
}
