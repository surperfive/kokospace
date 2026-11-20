import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AvatarConfig,
  FloatingReaction,
  FurnitureItem,
  FurnitureType,
  MapThemeDefinition,
  PlayerState,
  StageWidgetPlugin,
  VideoState,
} from '../types/metaverse';
import { drawChibiAvatar } from '../lib/avatarRenderer';
import { CARRY, DEFAULT_SCREEN_ANCHOR, SCREEN_CARRY_TARGET, distanceToScreen } from '../lib/roomCore';
import { PROXIMITY_RADIUS } from '../lib/spatialAudio';
import { CentralCinemaScreen } from './CentralCinemaScreen';

/**
 * 各设备的默认缩放。
 * 手机保持 0.62（视野小，需要看得远一点）；
 * PC 从 0.92 起步，屏幕越大越往里推一点，最多 1.12——
 * 否则 2K/4K 显示器上整张地图缩得太远，巨幕和人都显得很小。
 * 「复位」按钮也用这个值，保证复位到该设备的舒适视野。
 */
function defaultZoomFor(viewportWidth: number): number {
  if (viewportWidth < 768) return 0.62;
  return Math.max(0.92, Math.min(1.12, viewportWidth / 1560));
}

/** 靠近可搬运目标 / 正在搬运时的操作提示 */
type CarryHint =
  | { kind: 'screen' }
  | { kind: 'player'; id: string; name: string }
  | { kind: 'holding'; name: string }
  | { kind: 'held'; name: string };

interface MetaverseCanvasProps {
  mapTheme: MapThemeDefinition;
  players: PlayerState[];
  localPlayerId: string;
  localFallback?: { name: string; avatar: AvatarConfig };
  furniture: FurnitureItem[];
  videoState: VideoState;
  serverTimeOffsetMs: number;
  reactions: FloatingReaction[];
  chatBubbles: Map<string, { text: string; expiresAt: number }>;
  joystickVector: { dx: number; dy: number };
  isEditingScene: boolean;
  selectedBrush: FurnitureType | 'erase';
  isTheaterFocused: boolean;
  /** 小窗模式：巨幕缩成可拖动的浮窗 */
  isMini?: boolean;
  onToggleMini?: () => void;
  /** 小窗里飘过的聊天气泡 */
  miniChat?: { id: string; name: string; text: string }[];
  onOpenChat?: () => void;
  activeWidgets: StageWidgetPlugin[];
  onMoveLocalPlayer: (next: {
    x: number;
    y: number;
    dir: 'down' | 'up' | 'left' | 'right';
    isMoving: boolean;
    isSitting: boolean;
    seatId: string | null;
  }) => void;
  /** 扛起 / 放下：`@screen` 扛巨幕、玩家 id 背人、null 放下 */
  onCarry: (target: string | null) => void;
  /** 巨幕底边中心的世界坐标；null = 还没人搬过，用地图默认位置 */
  screenAnchor?: { x: number; y: number } | null;
  onPlaceOrRemoveFurniture: (worldX: number, worldY: number) => void;
  onToggleTheaterFocus: () => void;
  onOpenQueue: () => void;
  onVideoControl: (action: 'play' | 'pause' | 'seek', currentTime?: number) => void;
  /** 点播人 mp4 真实播放位置回传 */
  onPlaybackTime?: (time: number) => void;
  /** 当前这一部播完了，交给上层推进队列 */
  onMediaEnded?: () => void;
  /** 队列里还有下一部 */
  hasNext?: boolean;
  onSkipNext?: () => void;
  /** 当前用户是否是点播人（不是就只能看） */
  canControlProgress?: boolean;
  canSkip?: boolean;
  /** 跳过投票：当前这一部已投人数 / 通过票数 / 自己是否已投 */
  skipVoteCount?: number;
  skipVoteThreshold?: number;
  hasVotedSkip?: boolean;
  onVoteSkip?: () => void;
  skipStepSec?: number;
  autoSkipOutroSec?: number;
  onProximityUpdate?: (nearbyCount: number, inStageZone: boolean) => void;
}

export const MetaverseCanvas: React.FC<MetaverseCanvasProps> = ({
  mapTheme,
  players,
  localPlayerId,
  localFallback,
  furniture,
  videoState,
  serverTimeOffsetMs,
  reactions,
  chatBubbles,
  joystickVector,
  isEditingScene,
  selectedBrush,
  isTheaterFocused,
  isMini = false,
  onToggleMini,
  miniChat,
  onOpenChat,
  activeWidgets,
  onMoveLocalPlayer,
  onCarry,
  screenAnchor = null,
  onPlaceOrRemoveFurniture,
  onToggleTheaterFocus,
  onOpenQueue,
  onVideoControl,
  onPlaybackTime,
  onMediaEnded,
  hasNext = false,
  onSkipNext,
  canControlProgress = true,
  canSkip = canControlProgress,
  skipVoteCount = 0,
  skipVoteThreshold = 2,
  hasVotedSkip = false,
  onVoteSkip,
  skipStepSec = 30,
  autoSkipOutroSec = 0,
  onProximityUpdate,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [zoom, setZoom] = useState(() => defaultZoomFor(window.innerWidth));
  const [camera, setCamera] = useState({ x: 800, y: 540 });
  const [nearbySeat, setNearbySeat] = useState<FurnitureItem | null>(null);
  const [carryHint, setCarryHint] = useState<CarryHint | null>(null);
  const carryHintRef = useRef<CarryHint | null>(null);
  const carryHintKeyRef = useRef('');
  carryHintRef.current = carryHint;
  /** 触屏设备不显示快捷键（手机上按不了 F） */
  const showCarryKey =
    typeof window !== 'undefined' && !window.matchMedia('(pointer: coarse)').matches;

  /**
   * 巨幕尺寸自适应。
   *
   * 原来所有设备都是同一块 680×340 的世界屏幕：手机竖屏（390 宽）按默认 0.62 缩放
   * 会渲染成 421px，直接顶出屏幕右边、控制条被裁；而 PC 1440 宽时只占 43%，显得小气。
   *
   * 做法是按「默认缩放下屏幕该占视口宽度的比例」反推世界尺寸：
   *   手机 86%、PC 50%（宽屏再往上靠一点）
   * 注意用的是**参考缩放**（该设备的默认 zoom）而不是实时 zoom，
   * 否则放大时屏幕世界尺寸会同步缩小，等于抵消掉缩放，手感就死了。
   * 现在的行为是：默认缩放下正好占目标比例，放大缩小时照常等比变化。
   */
  /** 谁正在扛着巨幕（同一时间只会有一个人） */
  const screenCarrierId = useMemo(
    () => players.find((p) => p.carryTarget === SCREEN_CARRY_TARGET)?.id ?? null,
    [players]
  );

  const screenLayout = useMemo(() => {
    const base = mapTheme.screenRect;
    const narrow = viewport.width < 768;
    const refZoom = narrow ? 0.62 : 0.92;
    const targetRatio = narrow ? 0.86 : 0.5;
    const raw = (viewport.width * targetRatio) / (base.width * refZoom);
    // 横屏手机这类「宽但很矮」的视口，光按宽度算会把屏幕竖向撑爆，
    // 再补一条高度约束：巨幕最多占视口高度的 45%。
    const rawByHeight = (viewport.height * 0.45) / (base.height * refZoom);
    // 上限 1.17：屏幕底边固定在 y=460，而地板从 y=60 开始画，
    // 再往上长就会顶出地板边界，看着像挂在房间外面。1.17 时顶边正好落在 62 左右。
    // 下限 0.72：太小的话屏幕里的播放器 UI 会挤成一团。
    const scale = Math.max(0.72, Math.min(1.17, raw, rawByHeight));
    // 锚点：默认是地图里那块，被人搬走后换成房间状态里的实时位置
    const cx = screenAnchor?.x ?? base.x + base.width / 2;
    const bottom = screenAnchor?.y ?? base.y + base.height;
    const width = base.width * scale;
    const height = base.height * scale;
    return { x: cx - width / 2, y: bottom - height, width, height };
  }, [
    mapTheme.screenRect.x,
    mapTheme.screenRect.y,
    mapTheme.screenRect.width,
    mapTheme.screenRect.height,
    viewport.width,
    viewport.height,
    screenAnchor?.x,
    screenAnchor?.y,
  ]);

  /**
   * 给渲染层和 DOM 层共用的主题副本：
   * 屏幕矩形换成自适应后的，同时把「与巨幕完全重合」的碰撞障碍一起改，
   * 否则放大后会出现「人走进屏幕里」或者屏幕外一圈走不进去的透明墙。
   *
   * 巨幕被扛起来的时候整块障碍要拿掉：屏幕跟着人走，留着的话扛的人立刻被自己卡死。
   */
  const renderTheme = useMemo(() => {
    const base = mapTheme.screenRect;
    const isScreenObstacle = (o: { x: number; y: number; width: number; height: number }) =>
      o.x === base.x && o.y === base.y && o.width === base.width && o.height === base.height;
    const obstacles = mapTheme.obstacles
      .filter((o) => !(screenCarrierId && isScreenObstacle(o)))
      .map((o) => (isScreenObstacle(o) ? { ...o, ...screenLayout } : o));
    return { ...mapTheme, screenRect: screenLayout, obstacles };
  }, [mapTheme, screenLayout, screenCarrierId]);

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
    mapTheme: renderTheme,
    screenLayout,
    screenAnchor,
    viewport,
    players,
    localPlayerId,
    localFallback,
    furniture,
    chatBubbles,
    joystickVector,
    zoom,
    onMoveLocalPlayer,
    onCarry,
    onProximityUpdate,
  });
  latestPropsRef.current = {
    mapTheme: renderTheme,
    screenLayout,
    screenAnchor,
    viewport,
    players,
    localPlayerId,
    localFallback,
    furniture,
    chatBubbles,
    joystickVector,
    zoom,
    onMoveLocalPlayer,
    onCarry,
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
      // 首帧就直接落到「能看见巨幕顶边」的位置，别先卡在 me.y-90 再慢慢飘上去
      const safeCamY = Math.max(
        360,
        Math.min(
          me.y - 110,
          Math.max(screenLayout.y + (56 - viewport.height / 2) / zoom, me.y - 300)
        )
      );
      setCamera({ x: me.x, y: safeCamY });
      initializedRef.current = true;
    }
  }, [players, localPlayerId]);

  /**
   * 服务端偶尔会强制挪动本地玩家（例如扛起巨幕时先退一步，给头顶让出放屏幕的空间）。
   * 自己的移动是本地先算再上报的，服务端不会回传，所以收到「自己的位置」基本只有这种情况。
   * 阈值 30：正常上报延迟最多差十几像素，不会误触发。
   */
  useEffect(() => {
    if (!initializedRef.current) return;
    const me = players.find((p) => p.id === localPlayerId);
    if (!me) return;
    const lp = localPosRef.current;
    if (Math.hypot(me.x - lp.x, me.y - lp.y) > 30) {
      lp.x = me.x;
      lp.y = me.y;
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
        if (!e.repeat) toggleSitNearest();
      }
      if (k === 'f') {
        // 长按 F 会触发系统按键重复，不加这个守卫会疯狂「扛起/放下」
        if (!e.repeat) toggleCarryNearest();
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
    const me = latestPropsRef.current.players.find(
      (p) => p.id === latestPropsRef.current.localPlayerId
    );
    // 扛着东西 / 被人扛着时不能坐
    if (me?.carryTarget || me?.carriedBy) return;
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

  /** F 键 / 提示按钮：按当前提示决定是扛起、背人还是放下 */
  const toggleCarryNearest = () => {
    const hint = carryHintRef.current;
    if (!hint) return;
    if (hint.kind === 'screen') {
      latestPropsRef.current.onCarry(SCREEN_CARRY_TARGET);
    } else if (hint.kind === 'player') {
      latestPropsRef.current.onCarry(hint.id);
    } else {
      latestPropsRef.current.onCarry(null);
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
    let lastCommittedCamX = camX;
    let lastCommittedCamY = camY;
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
        screenLayout: screenRectNow,
        screenAnchor: anchorNow,
        viewport: viewportNow,
        players: currentPlayers,
        localPlayerId: meId,
        localFallback: fallbackIdentity,
        furniture: items,
        chatBubbles: bubbles,
        joystickVector: joy,
        zoom: currentZoom,
        onMoveLocalPlayer: emitMove,
        onProximityUpdate: emitProx,
      } = latestPropsRef.current;

      const lp = localPosRef.current;

      // 远端玩家位置插值。放在输入之前算：被扛的人要读「扛他的人」的平滑坐标，
      // 否则自己会被 20Hz 的原始坐标拽得一顿一顿。
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

      const meState = currentPlayers.find((p) => p.id === meId);
      const carriedBy = meState?.carriedBy || null;
      const myCarry = meState?.carryTarget || null;
      const carryingScreen = myCarry === SCREEN_CARRY_TARGET;
      const screenIsCarried = currentPlayers.some((p) => p.carryTarget === SCREEN_CARRY_TARGET);

      // 被扛着：位置完全交给扛人的人，自己不能走也不能坐
      if (carriedBy) {
        const carrier = currentPlayers.find((p) => p.id === carriedBy);
        if (carrier) {
          const cp = remotePos.get(carrier.id) ?? { x: carrier.x, y: carrier.y };
          lp.x = cp.x;
          lp.y = cp.y;
          lp.dir = carrier.dir;
          lp.isSitting = false;
          lp.seatId = null;
        }
      }

      // Compute input vector from keyboard + mobile joystick + click-to-walk
      let vx = carriedBy ? 0 : joy.dx;
      let vy = carriedBy ? 0 : joy.dy;

      const keys = keysRef.current;
      if (!carriedBy) {
        if (keys.has('w') || keys.has('arrowup')) vy -= 1;
        if (keys.has('s') || keys.has('arrowdown')) vy += 1;
        if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
        if (keys.has('d') || keys.has('arrowright')) vx += 1;
      }

      if (vx === 0 && vy === 0 && !carriedBy && clickTargetRef.current) {
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
      // 扛着东西走不快：巨幕最沉，背人次之
      const carrySlow = carryingScreen ? 0.55 : myCarry ? 0.74 : 1;
      const speed = (keys.has('shift') ? 310 : 210) * carrySlow;

      if (isMoving) {
        if (lp.isSitting) {
          lp.isSitting = false;
          lp.seatId = null;
        }
        const nx = vx / len;
        const ny = vy / len;
        let nextX = lp.x + nx * speed * dt;
        let nextY = lp.y + ny * speed * dt;
        if (carryingScreen) {
          // 扛着巨幕：走动范围收窄，保证屏幕不会拖出地板（和服务端用同一套边界）。
          // 抓取时服务端已把人推到合法范围内，这里直接硬夹。
          nextX = Math.max(CARRY.screenMinX, Math.min(CARRY.screenMaxX, nextX));
          nextY = Math.max(CARRY.screenMinY, Math.min(CARRY.screenMaxY, nextY));
        }

        // 已经卡在障碍里（比如别人把巨幕放你头上）就放行，先让人走出来再恢复正常碰撞，
        // 否则四个方向全被挡住，人就永远钉在原地了。
        const stuck = isBlocked(lp.x, lp.y, theme);
        if (stuck || !isBlocked(nextX, lp.y, theme)) lp.x = nextX;
        if (stuck || !isBlocked(lp.x, nextY, theme)) lp.y = nextY;

        if (Math.abs(nx) > Math.abs(ny)) {
          lp.dir = nx < 0 ? 'left' : 'right';
        } else {
          lp.dir = ny < 0 ? 'up' : 'down';
        }
      }

      if (!carriedBy && (isMoving || wasMoving) && now - lastEmitTs > 50) {
        lastEmitTs = now;
        try {
          emitMove({
            x: lp.x,
            y: lp.y,
            dir: lp.dir,
            isMoving,
            isSitting: lp.isSitting,
            seatId: lp.seatId,
          });
        } catch (err) {
          console.warn('[canvas] emitMove failed:', err);
        }
      }
      wasMoving = isMoving;

      // Smooth camera follow centered slightly above player so giant screen stays visible
      const targetCamX = lp.x;
      const desiredCamY = lp.y - 110;
      // 巨幕顶边不能被顶部页头切掉。
      // 由「屏幕顶边在屏幕上至少露出 56px」反推相机纵坐标上限，
      // 但相机最多往上偏 300 个世界单位——再偏玩家就被挤到屏幕最底下去了。
      // 屏幕变高（大屏/自适应放大）时这条约束会自动把相机再抬一点。
      const screenTopMargin = 56;
      const screenSafeCamY =
        screenRectNow.y + (screenTopMargin - viewportNow.height / 2) / currentZoom;
      // 巨幕被人扛走时不再拿它的顶边约束相机——那块屏跟着人跑，约束会把镜头拽走
      const targetCamY = screenIsCarried
        ? Math.max(360, lp.y - 110)
        : Math.max(360, Math.min(desiredCamY, Math.max(screenSafeCamY, lp.y - 300)));
      camX += (targetCamX - camX) * Math.min(1, dt * 6);
      camY += (targetCamY - camY) * Math.min(1, dt * 6);
      if (Math.abs(camX - lastCommittedCamX) > 0.25 || Math.abs(camY - lastCommittedCamY) > 0.25) {
        lastCommittedCamX = camX;
        lastCommittedCamY = camY;
        setCamera({ x: camX, y: camY });
      }

      // Periodic UI proximity & seat check (~6Hz)
      if (now - lastUiCheckTs > 160) {
        lastUiCheckTs = now;
        const seat = lp.isSitting || myCarry || carriedBy ? null : findNearestSeat(lp.x, lp.y, items);
        setNearbySeat((prev) => (prev?.id === seat?.id ? prev : seat));

        // 搬运提示：手里有东西 > 被人扛着 > 附近有人 > 附近有巨幕
        let nextHint: CarryHint | null = null;
        if (carriedBy) {
          const carrier = currentPlayers.find((p) => p.id === carriedBy);
          nextHint = { kind: 'held', name: carrier?.name || '队友' };
        } else if (myCarry === SCREEN_CARRY_TARGET) {
          nextHint = { kind: 'holding', name: '巨幕' };
        } else if (myCarry) {
          const held = currentPlayers.find((p) => p.id === myCarry);
          nextHint = { kind: 'holding', name: held?.name || '队友' };
        } else {
          let bestDist: number = CARRY.playerReach;
          let bestPlayer: PlayerState | null = null;
          for (const p of currentPlayers) {
            if (p.id === meId || p.carriedBy || p.carryTarget) continue;
            const d = Math.hypot(p.x - lp.x, p.y - lp.y);
            if (d <= bestDist) {
              bestDist = d;
              bestPlayer = p;
            }
          }
          if (bestPlayer) {
            nextHint = { kind: 'player', id: bestPlayer.id, name: bestPlayer.name };
          } else if (
            !screenIsCarried &&
            // 只能从屏幕正面（下方）抓：站在屏幕背后抓会把屏幕举到人身前，反而被整块盖住
            lp.y > (anchorNow ?? DEFAULT_SCREEN_ANCHOR).y &&
            distanceToScreen(lp.x, lp.y, anchorNow ?? DEFAULT_SCREEN_ANCHOR) <= CARRY.screenReach
          ) {
            nextHint = { kind: 'screen' };
          }
        }
        const hintKey = nextHint
          ? `${nextHint.kind}:${nextHint.kind === 'player' ? nextHint.id : nextHint.kind === 'screen' ? '' : nextHint.name}`
          : '';
        if (hintKey !== carryHintKeyRef.current) {
          carryHintKeyRef.current = hintKey;
          setCarryHint(nextHint);
        }

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

      // Draw Canvas (skip rendering when tab is in background to save power)
      const canvas = canvasRef.current;
      if (canvas && !document.hidden) {
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
          // 远端玩家的位置插值已经在每帧开头做完了，这里直接用结果
          const hasMeInList = Boolean(meId && currentPlayers.some((p) => p.id === meId));
          const renderList: PlayerState[] = currentPlayers.map((p) =>
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
          // Even before room:init arrives (or if WS is reconnecting), always draw the local character
          if (!hasMeInList && fallbackIdentity) {
            renderList.push({
              id: meId || '__local_preview__',
              name: fallbackIdentity.name,
              avatar: fallbackIdentity.avatar,
              x: lp.x,
              y: lp.y,
              dir: lp.dir,
              isMoving,
              isSitting: lp.isSitting,
              seatId: lp.seatId,
              isMicOn: false,
              isBroadcasting: false,
              isHost: false,
            });
          }
          renderList.sort((a, b) => a.y - b.y);

          const nowMs = Date.now();
          const drawPlayer = (
            p: PlayerState,
            atX?: number,
            atY?: number,
            scale = 1,
            piggyback = false
          ) => {
            const bubble = bubbles.get(p.id);
            const activeBubble = bubble && bubble.expiresAt > nowMs ? bubble.text : undefined;
            const px = atX ?? p.x;
            const py = atY ?? p.y;
            ctx.save();
            if (scale !== 1) {
              ctx.translate(px, py);
              ctx.scale(scale, scale);
              ctx.translate(-px, -py);
            }
            drawChibiAvatar(ctx, {
              avatar: p.avatar,
              x: px,
              y: py,
              dir: p.dir,
              isMoving: p.isMoving,
              isSitting: p.carriedBy ? false : p.isSitting,
              isMicOn: p.isMicOn,
              isBroadcasting: p.isBroadcasting,
              isHost: p.isHost,
              isMe: p.id === meId,
              name: p.name,
              timeMs: now,
              speakingLevel: p.speakingLevel,
              chatBubble: activeBubble,
              hideShadow: piggyback,
              hideName: piggyback,
            });
            ctx.restore();
          };

          for (const p of renderList) {
            // 被扛的人留到最后画，保证压在扛人者身上而不是被挡住
            if (p.carriedBy) continue;
            drawPlayer(p);
          }
          for (const p of renderList) {
            if (!p.carriedBy) continue;
            const carrier = renderList.find((c) => c.id === p.carriedBy);
            if (!carrier) {
              drawPlayer(p);
              continue;
            }
            // 骑在扛人者肩上：抬高到头顶之上、缩小一圈，跟着走路的节奏轻轻晃
            const bob = carrier.isMoving ? Math.sin(now / 120) * 2.5 : 0;
            drawPlayer(p, carrier.x, carrier.y - 42 + bob, 0.78, true);
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
    // 被人扛着时点地面没有意义：走不动
    if (players.find((p) => p.id === localPlayerId)?.carriedBy) return;
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
      className="absolute inset-0 overflow-hidden select-none"
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

      {/* World-Synchronized Giant Central Cinema Screen（房间里的大屏，开小窗也一直在） */}
      <CentralCinemaScreen
        videoState={videoState}
        serverTimeOffsetMs={serverTimeOffsetMs}
        screenWorldRect={screenLayout}
        camera={{ x: camera.x, y: camera.y, zoom }}
        viewport={viewport}
        accentColor={mapTheme.palette.accent}
        frameColor={mapTheme.palette.screenFrame}
        isTheaterFocused={isTheaterFocused}
        onToggleTheaterFocus={onToggleTheaterFocus}
        onOpenQueue={onOpenQueue}
        onVideoControl={onVideoControl}
        onPlaybackTime={onPlaybackTime}
        onMediaEnded={onMediaEnded}
        hasNext={hasNext}
        onSkipNext={onSkipNext}
        canControlProgress={canControlProgress}
        canSkip={canSkip}
        skipVoteCount={skipVoteCount}
        skipVoteThreshold={skipVoteThreshold}
        hasVotedSkip={hasVotedSkip}
        onVoteSkip={onVoteSkip}
        skipStepSec={skipStepSec}
        autoSkipOutroSec={autoSkipOutroSec}
        activeWidgets={activeWidgets}
      />

      {/*
       * 小窗：和大屏是两个独立实例（同一个节点不可能同时在两个位置）。
       * 小窗静音、不上报播放进度、不处理播完事件，权威时间仍然只由大屏那个负责。
       */}
      {isMini && (
        <CentralCinemaScreen
          videoState={videoState}
          serverTimeOffsetMs={serverTimeOffsetMs}
          screenWorldRect={screenLayout}
          camera={{ x: camera.x, y: camera.y, zoom }}
          viewport={viewport}
          accentColor={mapTheme.palette.accent}
          frameColor={mapTheme.palette.screenFrame}
          isTheaterFocused={false}
          isMini
          silent
          onToggleMini={onToggleMini}
          onToggleTheaterFocus={onToggleTheaterFocus}
          miniChat={miniChat}
          onOpenChat={onOpenChat}
          onOpenQueue={onOpenQueue}
          onVideoControl={onVideoControl}
          hasNext={hasNext}
          onSkipNext={onSkipNext}
          canControlProgress={canControlProgress}
          canSkip={canSkip}
          skipVoteCount={skipVoteCount}
          skipVoteThreshold={skipVoteThreshold}
          hasVotedSkip={hasVotedSkip}
          onVoteSkip={onVoteSkip}
          skipStepSec={skipStepSec}
          autoSkipOutroSec={autoSkipOutroSec}
          activeWidgets={[]}
        />
      )}

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

      {/* Contextual prompts: 搬运 / 坐下 */}
      {!isEditingScene && (carryHint || nearbySeat || localMe?.isSitting) && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2">
          {carryHint && (
            <button
              type="button"
              onClick={toggleCarryNearest}
              className={`px-4 py-2 rounded-xl text-xs font-medium shadow-lg backdrop-blur-md flex items-center gap-2 transition-transform active:scale-95 cursor-pointer ${
                carryHint.kind === 'held'
                  ? 'bg-amber-500/95 hover:bg-amber-500 text-white'
                  : 'bg-zinc-900/90 hover:bg-zinc-800 text-white'
              }`}
            >
              <span>{carryLabel(carryHint, showCarryKey)}</span>
            </button>
          )}
          {(nearbySeat || localMe?.isSitting) && (
            <button
              type="button"
              onClick={toggleSitNearest}
              className="px-4 py-2 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-white text-xs font-medium shadow-lg backdrop-blur-md flex items-center gap-2 transition-transform active:scale-95 cursor-pointer"
            >
              <span>
                {localMe?.isSitting
                  ? `起身走动${showCarryKey ? ' (E)' : ''}`
                  : `坐上 ${nearbySeat?.label || '座位'}${showCarryKey ? ' (E)' : ''}`}
              </span>
            </button>
          )}
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
          onClick={() => setZoom(defaultZoomFor(viewport.width))}
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

function carryLabel(hint: CarryHint, showKey: boolean): string {
  const k = showKey ? ' (F)' : '';
  switch (hint.kind) {
    case 'screen':
      return `扛起巨幕${k}`;
    case 'player':
      return `背起 ${hint.name}${k}`;
    case 'holding':
      return hint.name === '巨幕' ? `放下巨幕${k}` : `放下 ${hint.name}${k}`;
    case 'held':
      return showKey ? `被 ${hint.name} 扛着 · 按 F 下来` : `被 ${hint.name} 扛着 · 点这里下来`;
  }
}

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
