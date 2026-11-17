import React, { useEffect, useRef, useState } from 'react';
import {
  FloatingReaction,
  FurnitureItem,
  FurnitureType,
  MapThemeDefinition,
  PlayerState,
  StageWidgetPlugin,
  VideoState,
} from '../types/metaverse';
import { drawChibiAvatar } from '../lib/avatarRenderer';
import { PROXIMITY_RADIUS } from '../lib/spatialAudio';
import { CentralCinemaScreen } from './CentralCinemaScreen';

interface MetaverseCanvasProps {
  mapTheme: MapThemeDefinition;
  players: PlayerState[];
  localPlayerId: string;
  furniture: FurnitureItem[];
  videoState: VideoState;
  serverTimeOffsetMs: number;
  reactions: FloatingReaction[];
  chatBubbles: Map<string, { text: string; expiresAt: number }>;
  joystickVector: { dx: number; dy: number };
  isEditingScene: boolean;
  selectedBrush: FurnitureType | 'erase';
  isTheaterFocused: boolean;
  activeWidgets: StageWidgetPlugin[];
  onMoveLocalPlayer: (next: {
    x: number;
    y: number;
    dir: 'down' | 'up' | 'left' | 'right';
    isMoving: boolean;
    isSitting: boolean;
    seatId: string | null;
  }) => void;
  onPlaceOrRemoveFurniture: (worldX: number, worldY: number) => void;
  onToggleTheaterFocus: () => void;
  onOpenQueue: () => void;
  onVideoControl: (action: 'play' | 'pause' | 'seek', currentTime?: number) => void;
  /** 点播人 mp4 真实播放位置回传 */
  onPlaybackTime?: (time: number) => void;
  /** 当前用户是否是点播人（不是就只能看） */
  canControlProgress?: boolean;
  onProximityUpdate?: (nearbyCount: number, inStageZone: boolean) => void;
}

export const MetaverseCanvas: React.FC<MetaverseCanvasProps> = ({
  mapTheme,
  players,
  localPlayerId,
  furniture,
  videoState,
  serverTimeOffsetMs,
  reactions,
  chatBubbles,
  joystickVector,
  isEditingScene,
  selectedBrush,
  isTheaterFocused,
  activeWidgets,
  onMoveLocalPlayer,
  onPlaceOrRemoveFurniture,
  onToggleTheaterFocus,
  onOpenQueue,
  onVideoControl,
  onPlaybackTime,
  canControlProgress = true,
  onProximityUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [zoom, setZoom] = useState(() => (window.innerWidth < 768 ? 0.62 : 0.92));
  const [camera, setCamera] = useState({ x: 800, y: 540 });
  const [nearbySeat, setNearbySeat] = useState<FurnitureItem | null>(null);

  const keysRef = useRef<Set<string>>(new Set());
  const clickTargetRef = useRef<{ x: number; y: number; createdAt: number } | null>(null);
  // 远端玩家的渲染坐标（插值用）：服务端每 50ms 才来一次坐标，
  // 直接画会一跳一跳，这里每帧朝目标缓动，看起来才顺。
  const remotePosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const localPosRef = useRef<{
    x: number;
    y: number;
    dir: 'down' | 'up' | 'left' | 'right';
    isSitting: boolean;
    seatId: string | null;
  }>({
    x: mapTheme.spawnPoint.x,
    y: mapTheme.spawnPoint.y,
    dir: 'up',
    isSitting: false,
    seatId: null,
  });

  const latestPropsRef = useRef({
    mapTheme,
    players,
    localPlayerId,
    furniture,
    chatBubbles,
    joystickVector,
    zoom,
    onMoveLocalPlayer,
    onProximityUpdate,
  });
  latestPropsRef.current = {
    mapTheme,
    players,
    localPlayerId,
    furniture,
    chatBubbles,
    joystickVector,
    zoom,
    onMoveLocalPlayer,
    onProximityUpdate,
  };

  // Sync local ref when server first assigns player position
  const initializedRef = useRef(false);
  useEffect(() => {
    const me = players.find((p) => p.id === localPlayerId);
    if (me && !initializedRef.current) {
      localPosRef.current = {
        x: me.x,
        y: me.y,
        dir: me.dir,
        isSitting: me.isSitting,
        seatId: me.seatId || null,
      };
      setCamera({ x: me.x, y: me.y - 90 });
      initializedRef.current = true;
    }
  }, [players, localPlayerId]);

  // Viewport resize listener
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      setViewport({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Keyboard movement + 'E' to sit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
        keysRef.current.add(k);
        clickTargetRef.current = null;
      }
      if (k === 'e') {
        toggleSitNearest();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const toggleSitNearest = () => {
    const lp = localPosRef.current;
    if (lp.isSitting) {
      lp.isSitting = false;
      lp.seatId = null;
      latestPropsRef.current.onMoveLocalPlayer({
        x: lp.x,
        y: lp.y + 18,
        dir: 'down',
        isMoving: false,
        isSitting: false,
        seatId: null,
      });
      lp.y += 18;
      return;
    }
    const seat = findNearestSeat(lp.x, lp.y, latestPropsRef.current.furniture);
    if (seat) {
      lp.x = seat.x;
      lp.y = seat.y - 6;
      lp.dir = 'up';
      lp.isSitting = true;
      lp.seatId = seat.id;
      clickTargetRef.current = null;
      latestPropsRef.current.onMoveLocalPlayer({
        x: lp.x,
        y: lp.y,
        dir: 'up',
        isMoving: false,
        isSitting: true,
        seatId: seat.id,
      });
    }
  };

  // Main 60fps simulation & Canvas rendering loop
  useEffect(() => {
    let raf = 0;
    let lastTs = performance.now();
    let lastEmitTs = 0;
    let lastUiCheckTs = 0;
    let camX = camera.x;
    let camY = camera.y;
    let wasMoving = false;

    const isBlocked = (nx: number, ny: number, theme: MapThemeDefinition) => {
      if (nx < 85 || nx > theme.worldWidth - 85 || ny < 120 || ny > theme.worldHeight - 85) {
        return true;
      }
      for (const obs of theme.obstacles) {
        if (
          nx > obs.x - 16 &&
          nx < obs.x + obs.width + 16 &&
          ny > obs.y - 12 &&
          ny < obs.y + obs.height + 18
        ) {
          return true;
        }
      }
      return false;
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      const {
        mapTheme: theme,
        players: currentPlayers,
        localPlayerId: meId,
        furniture: items,
        chatBubbles: bubbles,
        joystickVector: joy,
        zoom: currentZoom,
        onMoveLocalPlayer: emitMove,
        onProximityUpdate: emitProx,
      } = latestPropsRef.current;

      const lp = localPosRef.current;

      // Compute input vector from keyboard + mobile joystick + click-to-walk
      let vx = joy.dx;
      let vy = joy.dy;

      const keys = keysRef.current;
      if (keys.has('w') || keys.has('arrowup')) vy -= 1;
      if (keys.has('s') || keys.has('arrowdown')) vy += 1;
      if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
      if (keys.has('d') || keys.has('arrowright')) vx += 1;

      if (vx === 0 && vy === 0 && clickTargetRef.current) {
        const dx = clickTargetRef.current.x - lp.x;
        const dy = clickTargetRef.current.y - lp.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8) {
          vx = dx / dist;
          vy = dy / dist;
        } else {
          clickTargetRef.current = null;
        }
      }

      const len = Math.hypot(vx, vy);
      const isMoving = len > 0.05;
      const speed = keys.has('shift') ? 310 : 210;

      if (isMoving) {
        if (lp.isSitting) {
          lp.isSitting = false;
          lp.seatId = null;
        }
        const nx = vx / len;
        const ny = vy / len;
        const nextX = lp.x + nx * speed * dt;
        const nextY = lp.y + ny * speed * dt;

        if (!isBlocked(nextX, lp.y, theme)) lp.x = nextX;
        if (!isBlocked(lp.x, nextY, theme)) lp.y = nextY;

        if (Math.abs(nx) > Math.abs(ny)) {
          lp.dir = nx < 0 ? 'left' : 'right';
        } else {
          lp.dir = ny < 0 ? 'up' : 'down';
        }
      }

      if ((isMoving || wasMoving) && now - lastEmitTs > 50) {
        lastEmitTs = now;
        emitMove({
          x: lp.x,
          y: lp.y,
          dir: lp.dir,
          isMoving,
          isSitting: lp.isSitting,
          seatId: lp.seatId,
        });
      }
      wasMoving = isMoving;

      // Smooth camera follow centered slightly above player so giant screen stays visible
      const targetCamX = lp.x;
      const targetCamY = Math.max(360, lp.y - 110);
      camX += (targetCamX - camX) * Math.min(1, dt * 6);
      camY += (targetCamY - camY) * Math.min(1, dt * 6);
      setCamera({ x: camX, y: camY });

      // Periodic UI proximity & seat check (~6Hz)
      if (now - lastUiCheckTs > 160) {
        lastUiCheckTs = now;
        const seat = lp.isSitting ? null : findNearestSeat(lp.x, lp.y, items);
        setNearbySeat((prev) => (prev?.id === seat?.id ? prev : seat));

        const nearbyCount = currentPlayers.filter(
          (p) => p.id !== meId && Math.hypot(p.x - lp.x, p.y - lp.y) <= PROXIMITY_RADIUS
        ).length;
        const stageZone = theme.zones.find((z) => z.type === 'stage');
        const inStageZone = Boolean(
          stageZone &&
            lp.x >= stageZone.x &&
            lp.x <= stageZone.x + stageZone.width &&
            lp.y >= stageZone.y &&
            lp.y <= stageZone.y + stageZone.height
        );
        emitProx?.(nearbyCount, inStageZone);
      }

      // Draw Canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
          canvas.width = Math.floor(cw * dpr);
          canvas.height = Math.floor(ch * dpr);
        }

        if (ctx) {
          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.fillStyle = theme.palette.groundAccent;
          ctx.fillRect(0, 0, cw, ch);

          // World transform
          ctx.translate(cw / 2, ch / 2);
          ctx.scale(currentZoom, currentZoom);
          ctx.translate(-camX, -camY);

          drawFlatVectorMap(ctx, theme, items);

          // Draw local player proximity audio ring
          ctx.save();
          ctx.beginPath();
          ctx.arc(lp.x, lp.y, PROXIMITY_RADIUS, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(24, 24, 27, 0.07)';
          ctx.setLineDash([8, 8]);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();

          // Draw click-to-walk target indicator
          if (clickTargetRef.current) {
            const age = (Date.now() - clickTargetRef.current.createdAt) / 1000;
            ctx.save();
            ctx.beginPath();
            ctx.ellipse(
              clickTargetRef.current.x,
              clickTargetRef.current.y,
              14 + Math.sin(age * 8) * 3,
              7 + Math.sin(age * 8) * 1.5,
              0,
              0,
              Math.PI * 2
            );
            ctx.strokeStyle = theme.palette.accent;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
          }

          // Y-Sort all players (override local player with high-frequency ref)
          // 远端玩家先做位置插值：目标点是最近一次收到的坐标，渲染点每帧向它靠近
          const remotePos = remotePosRef.current;
          const aliveIds = new Set<string>();
          for (const p of currentPlayers) {
            if (p.id === meId) continue;
            aliveIds.add(p.id);
            const cur = remotePos.get(p.id);
            if (!cur) {
              remotePos.set(p.id, { x: p.x, y: p.y });
              continue;
            }
            const k = Math.min(1, dt * 16); // 约 60ms 内贴合，卡顿时也不会拖尾太久
            cur.x += (p.x - cur.x) * k;
            cur.y += (p.y - cur.y) * k;
          }
          for (const id of Array.from(remotePos.keys())) {
            if (!aliveIds.has(id)) remotePos.delete(id);
          }

          const renderList = currentPlayers.map((p) =>
            p.id === meId
              ? {
                  ...p,
                  x: lp.x,
                  y: lp.y,
                  dir: lp.dir,
                  isMoving,
                  isSitting: lp.isSitting,
                  seatId: lp.seatId,
                }
              : {
                  ...p,
                  x: remotePos.get(p.id)?.x ?? p.x,
                  y: remotePos.get(p.id)?.y ?? p.y,
                }
          );
          renderList.sort((a, b) => a.y - b.y);

          const nowMs = Date.now();
          for (const p of renderList) {
            const bubble = bubbles.get(p.id);
            const activeBubble = bubble && bubble.expiresAt > nowMs ? bubble.text : undefined;
            drawChibiAvatar(ctx, {
              avatar: p.avatar,
              x: p.x,
              y: p.y,
              dir: p.dir,
              isMoving: p.isMoving,
              isSitting: p.isSitting,
              isMicOn: p.isMicOn,
              isBroadcasting: p.isBroadcasting,
              isHost: p.isHost,
              isMe: p.id === meId,
              name: p.name,
              timeMs: now,
              speakingLevel: p.speakingLevel,
              chatBubble: activeBubble,
            });
          }

          ctx.restore();
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const worldX = camera.x + (sx - rect.width / 2) / zoom;
    const worldY = camera.y + (sy - rect.height / 2) / zoom;

    if (isEditingScene) {
      onPlaceOrRemoveFurniture(worldX, worldY);
      return;
    }

    // Check if user tapped directly on a nearby sittable chair
    const clickedSeat = furniture.find(
      (f) => f.sittable && Math.hypot(f.x - worldX, f.y - worldY) < 28
    );
    if (clickedSeat && Math.hypot(clickedSeat.x - localPosRef.current.x, clickedSeat.y - localPosRef.current.y) < 110) {
      localPosRef.current.x = clickedSeat.x;
      localPosRef.current.y = clickedSeat.y - 6;
      localPosRef.current.dir = 'up';
      localPosRef.current.isSitting = true;
      localPosRef.current.seatId = clickedSeat.id;
      clickTargetRef.current = null;
      onMoveLocalPlayer({
        x: localPosRef.current.x,
        y: localPosRef.current.y,
        dir: 'up',
        isMoving: false,
        isSitting: true,
        seatId: clickedSeat.id,
      });
      return;
    }

    clickTargetRef.current = { x: worldX, y: worldY, createdAt: Date.now() };
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    setZoom((z) => Math.max(0.52, Math.min(1.45, z - e.deltaY * 0.0007)));
  };

  const localMe = players.find((p) => p.id === localPlayerId);

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className="relative w-full h-full overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handleCanvasPointerDown}
        style={{ touchAction: 'none' }}
        className={`w-full h-full block ${
          isEditingScene
            ? selectedBrush === 'erase'
              ? 'cursor-not-allowed'
              : 'cursor-crosshair'
            : 'cursor-pointer'
        }`}
      />

      {/* World-Synchronized Giant Central Cinema Screen */}
      <CentralCinemaScreen
        videoState={videoState}
        serverTimeOffsetMs={serverTimeOffsetMs}
        screenWorldRect={mapTheme.screenRect}
        camera={{ x: camera.x, y: camera.y, zoom }}
        viewport={viewport}
        accentColor={mapTheme.palette.accent}
        frameColor={mapTheme.palette.screenFrame}
        isTheaterFocused={isTheaterFocused}
        onToggleTheaterFocus={onToggleTheaterFocus}
        onOpenQueue={onOpenQueue}
        onVideoControl={onVideoControl}
        onPlaybackTime={onPlaybackTime}
        canControlProgress={canControlProgress}
        activeWidgets={activeWidgets}
      />

      {/* Floating Emoji Reactions Overlay */}
      <div className="pointer-events-none fixed inset-0 z-20 overflow-hidden">
        {reactions.map((rx) => {
          const sx = viewport.width / 2 + (rx.x - camera.x) * zoom;
          const sy = viewport.height / 2 + (rx.y - 52 - camera.y) * zoom;
          return (
            <div
              key={rx.id}
              style={{ left: `${sx}px`, top: `${sy}px` }}
              className="absolute animate-reaction-float flex flex-col items-center"
            >
              <span className="text-3xl drop-shadow-md">{rx.emoji}</span>
              {rx.label && (
                <span className="mt-0.5 px-2 py-0.5 rounded-md bg-zinc-900/80 text-white text-[10px] font-medium whitespace-nowrap">
                  {rx.label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Contextual Sit / Stand Prompt */}
      {!isEditingScene && (nearbySeat || localMe?.isSitting) && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30">
          <button
            type="button"
            onClick={toggleSitNearest}
            className="px-4 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-white text-xs font-medium shadow-lg backdrop-blur-md flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
          >
            <span>{localMe?.isSitting ? '起身走动 (E)' : `坐上 ${nearbySeat?.label || '座位'} (E)`}</span>
          </button>
        </div>
      )}

      {/* Desktop Zoom Controls */}
      <div className="hidden md:flex fixed right-4 bottom-24 z-20 flex-col gap-1 bg-white/90 backdrop-blur-md border border-zinc-200 rounded-xl p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(1.45, z + 0.12))}
          className="w-8 h-8 rounded-lg hover:bg-zinc-100 text-zinc-700 font-semibold text-sm cursor-pointer"
          title="放大视角"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom(0.92)}
          className="w-8 h-6 rounded-lg hover:bg-zinc-100 text-zinc-500 font-mono text-[10px] tabular-nums cursor-pointer"
          title="重置缩放"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.52, z - 0.12))}
          className="w-8 h-8 rounded-lg hover:bg-zinc-100 text-zinc-700 font-semibold text-sm cursor-pointer"
          title="缩小视角"
        >
          −
        </button>
      </div>
    </div>
  );
};

function findNearestSeat(x: number, y: number, furniture: FurnitureItem[]): FurnitureItem | null {
  let best: FurnitureItem | null = null;
  let bestDist = 54;
  for (const item of furniture) {
    if (!item.sittable) continue;
    const d = Math.hypot(item.x - x, item.y - y);
    if (d < bestDist) {
      bestDist = d;
      best = item;
    }
  }
  return best;
}

function drawFlatVectorMap(
  ctx: CanvasRenderingContext2D,
  theme: MapThemeDefinition,
  furniture: FurnitureItem[]
) {
  const { worldWidth, worldHeight, palette, zones, screenRect } = theme;

  // Outer floor base
  ctx.fillStyle = palette.ground;
  ctx.beginPath();
  ctx.roundRect(40, 60, worldWidth - 80, worldHeight - 100, 28);
  ctx.fill();

  // Subtle architectural tile grid
  ctx.strokeStyle = palette.gridLine;
  ctx.lineWidth = 1;
  const tile = 64;
  for (let gx = 40; gx <= worldWidth - 40; gx += tile) {
    ctx.beginPath();
    ctx.moveTo(gx, 60);
    ctx.lineTo(gx, worldHeight - 40);
    ctx.stroke();
  }
  for (let gy = 60; gy <= worldHeight - 40; gy += tile) {
    ctx.beginPath();
    ctx.moveTo(40, gy);
    ctx.lineTo(worldWidth - 40, gy);
    ctx.stroke();
  }

  // Architectural outer wall border
  ctx.strokeStyle = palette.wall;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.roundRect(40, 60, worldWidth - 80, worldHeight - 100, 28);
  ctx.stroke();

  ctx.strokeStyle = palette.wallTrim;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(48, 68, worldWidth - 96, worldHeight - 116, 22);
  ctx.stroke();

  // Zones (Stage, Seating, Lounge)
  for (const zone of zones) {
    ctx.save();
    if (zone.type === 'stage') {
      ctx.fillStyle = palette.stageFloor;
      ctx.beginPath();
      ctx.roundRect(zone.x, zone.y, zone.width, zone.height, 14);
      ctx.fill();
      ctx.strokeStyle = palette.stageBorder;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
    } else {
      ctx.fillStyle = zone.type === 'seating' ? palette.seatingZone : palette.loungeZone;
      ctx.beginPath();
      ctx.roundRect(zone.x, zone.y, zone.width, zone.height, 20);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(24, 24, 27, 0.45)';
    ctx.font = '600 11px "Plus Jakarta Sans", "PingFang SC", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(zone.label, zone.x + 14, zone.y + 20);
  }

  // Screen pedestal shadow
  ctx.fillStyle = 'rgba(24, 24, 27, 0.14)';
  ctx.beginPath();
  ctx.roundRect(screenRect.x + 16, screenRect.y + screenRect.height - 6, screenRect.width - 32, 22, 10);
  ctx.fill();

  // Draw Rugs first (underneath other furniture)
  for (const item of furniture) {
    if (item.type === 'rug_geo') {
      drawFurnitureItem(ctx, item);
    }
  }
  // Draw remaining furniture sorted by Y
  const nonRugs = furniture.filter((f) => f.type !== 'rug_geo').sort((a, b) => a.y - b.y);
  for (const item of nonRugs) {
    drawFurnitureItem(ctx, item);
  }
}

function drawFurnitureItem(ctx: CanvasRenderingContext2D, item: FurnitureItem) {
  ctx.save();
  ctx.translate(item.x, item.y);

  switch (item.type) {
    case 'rug_geo': {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.strokeStyle = 'rgba(24, 24, 27, 0.08)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-230, -100, 460, 210, 26);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 90, 54, 0.16)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-210, -82, 420, 174, 18);
      ctx.stroke();
      break;
    }
    case 'sofa_coral':
    case 'sofa_slate': {
      const color = item.type === 'sofa_coral' ? '#FF785A' : '#475569';
      const dark = item.type === 'sofa_coral' ? '#E05336' : '#334155';
      // Shadow
      ctx.fillStyle = 'rgba(24, 24, 27, 0.12)';
      ctx.beginPath();
      ctx.roundRect(-42, -14, 84, 34, 10);
      ctx.fill();
      // Cushion base
      ctx.fillStyle = color;
      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-40, -18, 80, 30, 9);
      ctx.fill();
      ctx.stroke();
      // Backrest
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.roundRect(-42, 4, 84, 12, 6);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'beanbag_coral':
    case 'beanbag_cream': {
      const fill = item.type === 'beanbag_coral' ? '#FF8A70' : '#FAF7F2';
      ctx.fillStyle = 'rgba(24, 24, 27, 0.11)';
      ctx.beginPath();
      ctx.ellipse(0, 4, 22, 15, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = fill;
      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.ellipse(-5, -4, 7, 4, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'plant_olive':
    case 'plant_fern': {
      // Pot
      ctx.fillStyle = '#D97757';
      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 4, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Leaves
      const leafColor = item.type === 'plant_olive' ? '#4D7C5D' : '#10B981';
      ctx.fillStyle = leafColor;
      for (let i = 0; i < 5; i++) {
        const ang = (i * Math.PI * 2) / 5;
        ctx.beginPath();
        ctx.ellipse(Math.cos(ang) * 11, -8 + Math.sin(ang) * 8, 9, 5.5, ang, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      break;
    }
    case 'lamp_warm': {
      // Warm ambient light pool
      const grad = ctx.createRadialGradient(0, -10, 4, 0, -10, 58);
      grad.addColorStop(0, 'rgba(251, 191, 36, 0.28)');
      grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, -10, 58, 0, Math.PI * 2);
      ctx.fill();

      // Stand
      ctx.fillStyle = '#18181B';
      ctx.beginPath();
      ctx.arc(0, 6, 9, 0, Math.PI * 2);
      ctx.fill();
      // Shade
      ctx.fillStyle = '#FEF3C7';
      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -12, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'table_round': {
      ctx.fillStyle = 'rgba(24, 24, 27, 0.12)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 26, 18, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#E5D3B3';
      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, 24, 17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Little coffee cup prop
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-6, -2, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}
