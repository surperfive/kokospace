import React, { useEffect, useRef } from 'react';
import { AvatarConfig } from '../types/metaverse';
import { drawChibiAvatar } from '../lib/avatarRenderer';

interface AvatarPreviewCanvasProps {
  avatar: AvatarConfig;
  name: string;
  size?: number;
}

export const AvatarPreviewCanvas: React.FC<AvatarPreviewCanvasProps> = ({
  avatar,
  name,
  size = 140,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const render = (timeMs: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const targetSize = Math.floor(size * dpr);
          if (canvas.width !== targetSize || canvas.height !== targetSize) {
            canvas.width = targetSize;
            canvas.height = targetSize;
          }
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, size, size);
          ctx.translate(size / 2, size * 0.62);
          ctx.scale(1.65, 1.65);
          drawChibiAvatar(ctx, {
            avatar,
            x: 0,
            y: 0,
            dir: 'down',
            isMoving: false,
            isSitting: false,
            isMicOn: false,
            isBroadcasting: false,
            isHost: false,
            isMe: false,
            name: name || '旅人',
            timeMs,
          });
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [avatar, name, size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="block mx-auto"
    />
  );
};
