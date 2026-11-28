import React, { useEffect, useRef } from 'react';
import { AvatarConfig } from '../types/metaverse';
import { drawChibiAvatar } from '../lib/avatarRenderer';

export type PreviewPoseMode = 'idle' | 'walk' | 'carry';

interface AvatarPreviewCanvasProps {
  avatar: AvatarConfig;
  name: string;
  size?: number;
  dir?: 'down' | 'left' | 'right' | 'up';
  previewMode?: PreviewPoseMode;
  showStudioBackdrop?: boolean;
}

export const AvatarPreviewCanvas: React.FC<AvatarPreviewCanvasProps> = ({
  avatar,
  name,
  size = 184,
  dir = 'down',
  previewMode = 'idle',
  showStudioBackdrop = true,
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

          if (showStudioBackdrop) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, size, size * 0.67);
            ctx.fillStyle = '#F3F7FD';
            ctx.fillRect(0, size * 0.67, size, size * 0.33);
          }

          const previewScale = size / 116;
          ctx.translate(size / 2, size * 0.61);
          ctx.scale(previewScale, previewScale);
          drawChibiAvatar(ctx, {
            avatar,
            x: 0,
            y: 0,
            dir,
            isMoving: previewMode === 'walk',
            isSitting: false,
            isMicOn: false,
            isBroadcasting: false,
            isHost: false,
            isMe: false,
            name: name || '旅人',
            timeMs,
            isCarrying: previewMode === 'carry',
            rigKey: 'avatar-preview',
          });
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [avatar, name, size, dir, previewMode, showStudioBackdrop]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className="block mx-auto"
    />
  );
};
