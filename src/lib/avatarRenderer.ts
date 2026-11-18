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
}

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
  } = opts;

  ctx.save();
  ctx.translate(x, y);

  // Subtle proximity / speaking pulse ring on ground
  if (isBroadcasting) {
    const pulse = (Math.sin(timeMs / 240) + 1) * 0.5;
    ctx.beginPath();
    ctx.ellipse(0, 14, 28 + pulse * 10, 14 + pulse * 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 90, 54, 0.55)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  } else if (isMicOn && speakingLevel > 0.05) {
    ctx.beginPath();
    ctx.ellipse(0, 14, 24 + speakingLevel * 10, 12 + speakingLevel * 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Ground shadow
  ctx.beginPath();
  ctx.ellipse(0, 15, isSitting ? 16 : 14, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(24, 24, 27, 0.16)';
  ctx.fill();

  const walkCycle = isMoving ? Math.sin(timeMs / 95) : 0;
  const bounce = isMoving ? Math.abs(walkCycle) * -4 : Math.sin(timeMs / 550) * 1.1;
  const sitDrop = isSitting ? 5 : 0;

  ctx.translate(0, bounce + sitDrop);

  // Legs (hidden/tucked when sitting)
  if (!isSitting) {
    const leftLegY = walkCycle > 0 ? -walkCycle * 3 : 0;
    const rightLegY = walkCycle < 0 ? walkCycle * 3 : 0;
    ctx.fillStyle = '#27272A';
    roundRectPath(ctx, -8, 6 + leftLegY, 6, 9, 3);
    ctx.fill();
    roundRectPath(ctx, 2, 6 + rightLegY, 6, 9, 3);
    ctx.fill();
  }

  // Torso / Outfit (Chibi proportions)
  const bodyW = 24;
  const bodyH = 18;
  ctx.fillStyle = avatar.outfitColor || '#FF5A36';
  roundRectPath(ctx, -bodyW / 2, -10, bodyW, bodyH, 8);
  ctx.fill();
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Outfit style detail
  if (avatar.outfitStyle === 'overalls') {
    ctx.fillStyle = '#334155';
    roundRectPath(ctx, -9, -4, 18, 12, 4);
    ctx.fill();
    ctx.fillRect(-7, -10, 3, 7);
    ctx.fillRect(4, -10, 3, 7);
  } else if (avatar.outfitStyle === 'knit') {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    roundRectPath(ctx, -5, -10, 10, 4, 2);
    ctx.fill();
  } else if (avatar.outfitStyle === 'blazer') {
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(-4, -10);
    ctx.lineTo(0, -1);
    ctx.lineTo(4, -10);
    ctx.closePath();
    ctx.fill();
  } else if (avatar.outfitStyle === 'dress') {
    ctx.fillStyle = avatar.outfitColor;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.lineTo(15, 10);
    ctx.lineTo(-15, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // Hoodie pocket & strings
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    roundRectPath(ctx, -6, 0, 12, 6, 3);
    ctx.fill();
  }

  // Little Chibi arms
  const armSwing = isMoving ? walkCycle * 3.5 : 0;
  ctx.fillStyle = avatar.skinColor || '#FCD5B5';
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(-13, -2 + armSwing, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(13, -2 - armSwing, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Back hair for wavy / bun styles
  if (avatar.hairStyle === 'wavy') {
    ctx.fillStyle = avatar.hairColor || '#2C2623';
    roundRectPath(ctx, -18, -32, 36, 26, 14);
    ctx.fill();
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else if (avatar.hairStyle === 'bun') {
    ctx.fillStyle = avatar.hairColor || '#2C2623';
    ctx.beginPath();
    ctx.arc(0, -40, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  // Big cute Chibi Head
  ctx.fillStyle = avatar.skinColor || '#FCD5B5';
  roundRectPath(ctx, -16, -36, 32, 27, 13);
  ctx.fill();
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 1.7;
  ctx.stroke();

  // Blush cheeks (unless facing up)
  const lookOffsetX = dir === 'left' ? -3 : dir === 'right' ? 3 : 0;
  if (dir !== 'up') {
    ctx.fillStyle = 'rgba(255, 110, 110, 0.32)';
    ctx.beginPath();
    ctx.ellipse(-8 + lookOffsetX, -17, 3.2, 2, 0, 0, Math.PI * 2);
    ctx.ellipse(8 + lookOffsetX, -17, 3.2, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#18181B';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.7;
    if (avatar.eyeStyle === 'cool') {
      // Sunglasses
      ctx.fillStyle = '#18181B';
      roundRectPath(ctx, -12 + lookOffsetX, -25, 10, 6, 2);
      ctx.fill();
      roundRectPath(ctx, 2 + lookOffsetX, -25, 10, 6, 2);
      ctx.fill();
      ctx.fillRect(-2 + lookOffsetX, -23, 4, 2);
    } else if (avatar.eyeStyle === 'gentle') {
      ctx.beginPath();
      ctx.arc(-6 + lookOffsetX, -21, 3, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(6 + lookOffsetX, -21, 3, Math.PI, 0);
      ctx.stroke();
    } else if (avatar.eyeStyle === 'wink') {
      ctx.beginPath();
      ctx.arc(-6 + lookOffsetX, -22, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6 + lookOffsetX, -21, 3, Math.PI, 0);
      ctx.stroke();
    } else if (avatar.eyeStyle === 'star') {
      ctx.beginPath();
      ctx.arc(-6 + lookOffsetX, -22, 2.8, 0, Math.PI * 2);
      ctx.arc(6 + lookOffsetX, -22, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-7 + lookOffsetX, -23, 1.1, 0, Math.PI * 2);
      ctx.arc(5 + lookOffsetX, -23, 1.1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(-6 + lookOffsetX, -22, 2.3, 0, Math.PI * 2);
      ctx.arc(6 + lookOffsetX, -22, 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Little smile
    ctx.beginPath();
    ctx.arc(lookOffsetX, -17, 2.4, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Front Hair Bangs
  ctx.fillStyle = avatar.hairColor || '#2C2623';
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 1.6;
  if (dir === 'up') {
    roundRectPath(ctx, -16, -37, 32, 22, 12);
    ctx.fill();
    ctx.stroke();
  } else if (avatar.hairStyle === 'spiky') {
    ctx.beginPath();
    ctx.moveTo(-16, -26);
    ctx.lineTo(-14, -39);
    ctx.lineTo(-5, -34);
    ctx.lineTo(0, -41);
    ctx.lineTo(6, -34);
    ctx.lineTo(14, -38);
    ctx.lineTo(16, -26);
    ctx.quadraticCurveTo(0, -31, -16, -26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (avatar.hairStyle === 'sidepart') {
    ctx.beginPath();
    ctx.arc(0, -28, 16, Math.PI, 0);
    ctx.lineTo(16, -23);
    ctx.quadraticCurveTo(4, -27, -16, -21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    // Clean geometric bob/short bangs
    ctx.beginPath();
    ctx.arc(0, -27, 16, Math.PI, 0);
    ctx.lineTo(16, -24);
    ctx.quadraticCurveTo(0, -29, -16, -24);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Accessories
  if (avatar.accessory === 'headphones') {
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -26, 17.5, Math.PI * 1.05, -0.05 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = '#FF5A36';
    roundRectPath(ctx, -19, -27, 5, 10, 2.5);
    ctx.fill();
    roundRectPath(ctx, 14, -27, 5, 10, 2.5);
    ctx.fill();
  } else if (avatar.accessory === 'beret') {
    ctx.fillStyle = '#E11D48';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(2, -37, 13, 6, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (avatar.accessory === 'crown') {
    ctx.fillStyle = '#F59E0B';
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-8, -36);
    ctx.lineTo(-9, -45);
    ctx.lineTo(-3, -40);
    ctx.lineTo(0, -47);
    ctx.lineTo(3, -40);
    ctx.lineTo(9, -45);
    ctx.lineTo(8, -36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (avatar.accessory === 'catEars') {
    ctx.fillStyle = '#18181B';
    ctx.beginPath();
    ctx.moveTo(-13, -33);
    ctx.lineTo(-11, -44);
    ctx.lineTo(-4, -36);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(13, -33);
    ctx.lineTo(11, -44);
    ctx.lineTo(4, -36);
    ctx.closePath();
    ctx.fill();
  } else if (avatar.accessory === 'glasses' && dir !== 'up' && avatar.eyeStyle !== 'cool') {
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(-6 + lookOffsetX, -22, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(6 + lookOffsetX, -22, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.5 + lookOffsetX, -22);
    ctx.lineTo(1.5 + lookOffsetX, -22);
    ctx.stroke();
  }

  // Nameplate tag below feet
  ctx.translate(0, -(bounce + sitDrop));
  const label = `${isHost ? '★ ' : ''}${name}${isMe ? ' (我)' : ''}`;
  ctx.font = '600 11px "Plus Jakarta Sans", "PingFang SC", sans-serif';
  const tw = ctx.measureText(label).width;
  const boxW = tw + (isMicOn ? 22 : 14);
  const boxH = 20;

  ctx.fillStyle = isMe ? 'rgba(24, 24, 27, 0.88)' : 'rgba(255, 255, 255, 0.92)';
  roundRectPath(ctx, -boxW / 2, 22, boxW, boxH, 6);
  ctx.fill();
  ctx.strokeStyle = isMe ? '#18181B' : 'rgba(24, 24, 27, 0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = isMe ? '#FFFFFF' : '#18181B';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, isMicOn ? -4 : 0, 32.5);

  if (isMicOn) {
    ctx.fillStyle = isBroadcasting ? '#FF5A36' : '#10B981';
    ctx.beginPath();
    ctx.arc(boxW / 2 - 8, 32, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Floating Speech Bubble above head
  if (chatBubble) {
    const truncated = chatBubble.length > 22 ? chatBubble.slice(0, 21) + '…' : chatBubble;
    ctx.font = '500 12px "Plus Jakarta Sans", "PingFang SC", sans-serif';
    const bw = Math.max(40, ctx.measureText(truncated).width + 18);
    ctx.fillStyle = '#FFFFFF';
    roundRectPath(ctx, -bw / 2, -74, bw, 26, 8);
    ctx.fill();
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = '#18181B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncated, 0, -61);
  }

  ctx.restore();
}
