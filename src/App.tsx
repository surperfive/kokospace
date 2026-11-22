import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Megaphone,
  Smile,
  MessageCircle,
  Map as MapIcon,
  ListVideo,
  UserCog,
  BookOpen,
  Share2,
  Check,
  Send,
  X,
  Users,
  Sparkles,
  Power,
  RefreshCw,
  Loader2,
  PictureInPicture2,
  Palette,
  ChevronDown,
} from 'lucide-react';
import {
  AvatarConfig,
  ChatMessage,
  FloatingReaction,
  FurnitureItem,
  FurnitureType,
  MapId,
  PlayerState,
  VideoSourceType,
  VideoState,
} from './types/metaverse';
import { BUILTIN_MAPS, BUILTIN_VIDEOS, DEFAULT_AVATAR } from './data/maps';
import {
  deleteLocalScene,
  loadLocalScenes,
  saveLocalScene,
  type LocalScenePreset,
} from './lib/scenePresets';
import { pluginRegistry } from './lib/pluginRegistry';
import { SpatialAudioManager } from './lib/spatialAudio';
import { P2PRoom, isP2PEnabled, setLinkModePreference } from './lib/p2pRoom';
import { CARRY, SCREEN_CARRY_TARGET, extractBiliPage } from './lib/roomCore';
import { detectVideoLink } from './lib/videoLink';
import { CHAT_BUBBLE_LIFETIME_MS } from './lib/chatBubble';
import { extractBvid, fetchBilibiliMetaJsonp } from './lib/bilibiliMeta';
import {
  clearWatchHistory,
  loadWatchHistory,
  pushWatchHistory,
  removeWatchHistory,
  type WatchHistoryItem,
} from './lib/watchHistory';
import { MetaverseCanvas } from './components/MetaverseCanvas';
import { MobileJoystick } from './components/MobileJoystick';
import { AvatarEditorModal } from './components/AvatarEditorModal';
import { VideoQueueDrawer } from './components/VideoQueueDrawer';
import { SceneEditorModal } from './components/SceneEditorModal';
import { DeveloperDocsModal } from './components/DeveloperDocsModal';
import { PixelArtStudio } from './components/PixelArtStudio';
import { AiDirectorModal } from './components/AiDirectorModal';
import { useDocumentPip } from './hooks/useDocumentPip';

function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  const r = params.get('room');
  return r ? r.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'lobby' : 'lobby';
}

export default function App() {
  // 本地场景方案（没有账号体系，全在本机 localStorage）
  const [savedScenes, setSavedScenes] = useState<LocalScenePreset[]>(() => loadLocalScenes());
  // 本机点播记录（不需要登录，按设备存）
  const [watchHistory, setWatchHistory] = useState<WatchHistoryItem[]>(() => loadWatchHistory());

  // Entry & Local Identity State
  const [hasEnteredRoom, setHasEnteredRoom] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(true);
  const [roomId, setRoomId] = useState<string>(() => getInitialRoomId());
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('koko_name') || `旅人${Math.floor(100 + Math.random() * 899)}`;
  });
  const [avatar, setAvatar] = useState<AvatarConfig>(() => {
    try {
      const saved = localStorage.getItem('koko_avatar');
      return saved ? { ...DEFAULT_AVATAR, ...JSON.parse(saved) } : DEFAULT_AVATAR;
    } catch {
      return DEFAULT_AVATAR;
    }
  });

  // Plugin Registry Subscription
  const [, setPluginTick] = useState(0);
  useEffect(() => {
    return pluginRegistry.subscribe(() => setPluginTick((t) => t + 1));
  }, []);
  const allMaps = pluginRegistry.getActiveMaps();
  const activeReactions = pluginRegistry.getActiveReactions();
  const activeAvatarParts = pluginRegistry.getActiveAvatarParts();
  const activeWidgets = pluginRegistry.getActiveWidgets();
  const allPlugins = pluginRegistry.getAllPlugins();

  // Room Authoritative State
  const [localPlayerId, setLocalPlayerId] = useState<string>('');
  const [mapId, setMapId] = useState<MapId>('sunset-rooftop');
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [furniture, setFurniture] = useState<FurnitureItem[]>(BUILTIN_MAPS[0].defaultFurniture);
  /** 巨幕底边中心的世界坐标；null = 还没人搬过，用地图默认位置 */
  const [screenAnchor, setScreenAnchor] = useState<{ x: number; y: number } | null>(null);
  const [videoState, setVideoState] = useState<VideoState>({
    currentItem: BUILTIN_VIDEOS[0],
    isPlaying: true,
    currentTime: 0,
    updatedAtMs: Date.now(),
    queue: [],
    isPlaceholder: true,
  });
  const [serverTimeOffsetMs, setServerTimeOffsetMs] = useState(0);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [chatBubbles, setChatBubbles] = useState<Map<string, { text: string; expiresAt: number }>>(
    () => new Map()
  );

  // UI & Interaction Controls
  const [isMicOn, setIsMicOn] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [inStageZone, setInStageZone] = useState(false);
  const [joystickVec, setJoystickVec] = useState({ dx: 0, dy: 0 });
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isTheaterFocused, setIsTheaterFocused] = useState(false);
  /** 小窗模式：巨幕缩成可拖动的浮窗，和影院聚焦互斥 */
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);
  const [showSceneModal, setShowSceneModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showPixelStudio, setShowPixelStudio] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  /** 画板导出后待挂的画（挂到墙上时塞进 furniture.art） */
  const [pendingArt, setPendingArt] = useState<string | null>(null);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatInput, setChatInput] = useState('');
  /** 聊天里贴链接触发的点播正在解析（慢的时候要十几秒，得让用户看到还在跑） */
  const [chatEnqueueing, setChatEnqueueing] = useState(false);
  /** 小窗里飘过的聊天气泡（3 秒自动消散） */
  const [miniChatFeed, setMiniChatFeed] = useState<
    { id: string; name: string; text: string; at: number }[]
  >([]);
  const [isEditingScene, setIsEditingScene] = useState(false);
  const [selectedBrush, setSelectedBrush] = useState<FurnitureType | 'erase'>('beanbag_coral');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [skipStepSec, setSkipStepSec] = useState<number>(() => {
    const saved = Number(localStorage.getItem('koko_skip_step_sec'));
    return [15, 30, 60, 90].includes(saved) ? saved : 30;
  });
  const [autoSkipOutroSec, setAutoSkipOutroSec] = useState<number>(() => {
    const saved = Number(localStorage.getItem('koko_skip_outro_sec'));
    return [0, 10, 15, 30].includes(saved) ? saved : 0;
  });
  // 连接方式：off=云端模式；connecting=正在打洞；direct=已直连房主；cloud=直连失败回落
  const [linkMode, setLinkMode] = useState<'off' | 'connecting' | 'direct' | 'cloud'>(() =>
    isP2PEnabled() ? 'connecting' : 'off'
  );
  // 手动断开：与网络掉线区分开。true 时连接 effect 不重连、不发送任何业务消息。
  const [manuallyDisconnected, setManuallyDisconnected] = useState(false);
  /** 连接方式选择菜单（点状态胶囊展开） */
  const [showLinkMenu, setShowLinkMenu] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const manuallyDisconnectedRef = useRef<boolean>(false);
  /** 云端模式下点状态胶囊手动重试直连（由连接 effect 注入） */
  const p2pRetryRef = useRef<(() => void) | null>(null);
  /** 切换连接方式（由连接 effect 注入）：'direct' 自己当房主开直连，'cloud' 关掉直连回云端 */
  const linkSwitchRef = useRef<((mode: 'direct' | 'cloud') => void) | null>(null);
  const p2pRef = useRef<P2PRoom | null>(null);
  const p2pEnabledRef = useRef<boolean>(isP2PEnabled());
  const p2pHostRef = useRef<string | null>(null);
  const p2pFallbackRef = useRef<number | null>(null);
  /** 直连失败过就别再自动重试：否则「join → 自动直连 → 12 秒超时 → 回落 → join」会死循环 */
  const p2pGaveUpRef = useRef(false);
  const isP2PHostRef = useRef(false);
  const audioMgrRef = useRef<SpatialAudioManager | null>(null);
  const playersRef = useRef<PlayerState[]>([]);
  const localIdRef = useRef<string>('');
  const videoStateRef = useRef(videoState);
  const serverOffsetRef = useRef(serverTimeOffsetMs);
  /** 点播人 mp4 元素的真实播放位置（由影院组件回传），比时钟外推可靠 */
  const playbackTimeRef = useRef<number | null>(null);
  /** B 站使用提示只对每部片子弹一次 */
  const biliHintedRef = useRef<string | null>(null);
  playersRef.current = players;
  localIdRef.current = localPlayerId;
  videoStateRef.current = videoState;
  serverOffsetRef.current = serverTimeOffsetMs;
  manuallyDisconnectedRef.current = manuallyDisconnected;
  /**
   * 云端 → 直连时，把「现在屏幕上这份状态」交给新房主核心。
   * 用 ref 而不是闭包捕获，保证点击那一刻拿到的是最新值。
   */
  const linkStateRef = useRef({ mapId, furniture, videoState, chatHistory, screenAnchor });
  linkStateRef.current = { mapId, furniture, videoState, chatHistory, screenAnchor };

  /** 当前用户是不是房主（只有房主能决定全屋走直连还是云端） */
  const isRoomHost = useMemo(
    () => players.some((p) => p.id === localPlayerId && p.isHost),
    [players, localPlayerId]
  );

  const currentMapTheme = useMemo(() => {
    return allMaps.find((m) => m.id === mapId) || allMaps[0] || BUILTIN_MAPS[0];
  }, [allMaps, mapId]);

  /** 队列里当前项之后还有内容，或待机状态下可切内置片库下一部 → 显示「下一部」 */
  const hasNext = useMemo(() => {
    const q = videoState.queue || [];
    const idx = q.findIndex((it) => it.id === videoState.currentItem.id);
    if (idx >= 0 && idx < q.length - 1) return true;
    return Boolean(videoState.isPlaceholder && q.length === 0);
  }, [videoState.queue, videoState.currentItem.id, videoState.isPlaceholder]);

  /** 跳过不需要投票：房间里谁都能直接切下一部 */
  const canSkipVideo = true;

  /** 聊天框里有没有可点播的视频链接：只用来给输入提示，真正点播在提交时做 */
  const chatVideoLink = useMemo(() => detectVideoLink(chatInput), [chatInput]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  /** 点「小窗」时递增：主屏趁机在用户手势里把声音打开 */
  const [unmuteSignal, setUnmuteSignal] = useState(0);

  /** 小窗的独立悬浮窗（Document PiP）：切到别的应用也能继续看 */
  const pip = useDocumentPip({
    width: 380,
    height: 300,
    // 用户用浏览器自带的「返回标签页」关掉悬浮窗时，小窗模式一起退出
    onClosed: () => setIsMiniPlayer(false),
  });

  // 业务消息统一出口：P2P 模式下交给房主，否则走云端 WebSocket。
  // 注意语音信令（webrtc:signal）不走这里 —— 它必须走云端的转发通道。
  const sendGame = useCallback((payload: string) => {
    if (manuallyDisconnectedRef.current) return;
    const p2p = p2pRef.current;
    if (p2p) {
      p2p.send(payload);
      return;
    }
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(payload);
    }
  }, []);

  // Detect touch capability for responsive virtual joystick
  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 768);
    };
    checkTouch();
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  // Initialize Spatial Audio Manager
  useEffect(() => {
    const mgr = new SpatialAudioManager(
      (targetId, signal) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({ type: 'webrtc:signal', targetId, signal })
          );
        }
      },
      (level) => {
        setPlayers((prev) =>
          prev.map((p) => (p.id === localIdRef.current ? { ...p, speakingLevel: level } : p))
        );
      }
    );
    audioMgrRef.current = mgr;

    // 移动端切后台会挂起 AudioContext，回来时不会自己恢复 —— 不补这一下，
    // 别人说话你就听不见了（自己说话别人还能听到，因为麦克风是另一条链路）。
    const resumeAudio = () => {
      if (document.visibilityState === 'visible') mgr.resume();
    };
    document.addEventListener('visibilitychange', resumeAudio);
    window.addEventListener('pageshow', resumeAudio);

    return () => {
      document.removeEventListener('visibilitychange', resumeAudio);
      window.removeEventListener('pageshow', resumeAudio);
      mgr.destroy();
      audioMgrRef.current = null;
    };
  }, []);

  // Update Web Audio API spatial gains whenever player positions or mic states change
  useEffect(() => {
    const me = players.find((p) => p.id === localPlayerId);
    audioMgrRef.current?.updateSpatialGains(me, players);
  }, [players, localPlayerId]);

  // Clean up expired floating reactions
  useEffect(() => {
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 2400;
      setReactions((prev) => prev.filter((r) => r.createdAt > cutoff));
    }, 600);
    return () => window.clearInterval(timer);
  }, []);

  // WebSocket Connection & Reconnection Loop
  useEffect(() => {
    if (!hasEnteredRoom || manuallyDisconnected) return;
    let closedByUser = false;
    // 换房间/重新进房是一次全新的连接机会，之前放弃过直连也重新试一次
    p2pGaveUpRef.current = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;

    // 默认与前端同源（Workers / 本地 Express 都是这种）。
    // 若前端单独托管在别处（如 GitHub Pages），用 VITE_WS_URL 指向 WS 服务端。
    const wsOrigin =
      (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/+$/, '') ||
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

    // clientId / joinPayload 提到 connect 外面：手动重试直连时还要用同一份身份
    const clientId =
      sessionStorage.getItem('koko_client_id') || `p_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('koko_client_id', clientId);

    const joinPayload = {
      type: 'room:join',
      roomId,
      playerId: clientId,
      uid: null,
      name: playerName,
      avatar,
    };

    const connect = () => {
      // room 参数让 Cloudflare Durable Object 能把连接路由到对应房间；
      // 本地 Express 服务器的 ws path 匹配会忽略 query，两端都兼容。
      const ws = new WebSocket(`${wsOrigin}/ws?room=${encodeURIComponent(roomId)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify(joinPayload));

        // 心跳：部分 CDN / 反代（如 EdgeOne）对空闲 WebSocket 有 300s 超时，
        // 看电影时没人走动就会断。25s 一次轻量消息保活；服务端不认识这个 type，会直接忽略。
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'client:ping', t: Date.now() }));
          }
        }, 25000);
      };

      ws.onmessage = (event) => {
        let msg: Record<string, any>;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        // ── 房主主动关掉直连 ──────────────────────────────────────────────
        // 服务端只允许房主发这条。收到就说明「这屋子回云端了」，正在直连的客人立刻回落，
        // 不要等 DataChannel 自己断（那要 7 秒心跳超时）。
        if (msg.type === 'p2p:off') {
          // 房主主动关的，不是失败：不算「放弃直连」，房主再开回来时还要自动跟随
          if (p2pEnabledRef.current) fallbackToCloud('房主已切回云端模式', false);
          return;
        }

        // ── 进房时房主已经在直连 ──────────────────────────────────────────
        // room:init 带着 linkMode，不用等房主再广播一次 p2p:host
        // （房主在后台标签时 setInterval 会被节流，广播可能要等半分钟）。
        if (
          msg.type === 'room:init' &&
          !p2pEnabledRef.current &&
          !p2pGaveUpRef.current &&
          msg.linkMode === 'direct' &&
          typeof msg.hostId === 'string' &&
          msg.hostId !== clientId
        ) {
          p2pHostRef.current = msg.hostId;
          p2pEnabledRef.current = true;
          setLinkMode('connecting');
          startP2P('guest', clientId, msg.hostId);
          armP2PFallback();
        }

        // ── 房主宣告：即使本端是云端模式，也自动跟随到 P2P ────────────────
        // 否则「房主用 p2p=1、别人用普通链接」会变成两个世界，看起来就是「没同步」。
        if (msg.type === 'p2p:host' && typeof msg.hostId === 'string') {
          p2pHostRef.current = msg.hostId;
          // 房主可能被别人接管过：本地 isHost 跟着服务端改，否则「切换连接方式」的入口
          // 会留在旧房主身上，点了也发不出去（服务端只认新房主）。
          setPlayers((prev) =>
            prev.map((p) => (p.isHost === (p.id === msg.hostId) ? p : { ...p, isHost: p.id === msg.hostId }))
          );
          // 云端模式下收到房主宣告 → 自动跟随到 P2P，避免一端直连一端云端（表现为「没同步」）
          // 房主主动宣告不受「放弃直连」限制：房主刷新回来会重新宣告，
          // 这时客人应该再试一次，而不是永远停在云端。
          if (!p2pEnabledRef.current && msg.hostId !== clientId) {
            p2pEnabledRef.current = true;
            setLinkMode('connecting');
            startP2P('guest', clientId, msg.hostId);
            armP2PFallback();
          }
          return;
        }

        // ── P2P 模式分流 ────────────────────────────────────────────────
        // 云端 WebSocket 只做三件事：拿 hostId、转发信令、当兜底。
        // 业务消息一律走房主的 DataChannel，收到云端的业务广播要丢弃（那是幽灵状态）。
        if (p2pEnabledRef.current) {
          if (msg.type === 'p2p:signal') {
            void p2pRef.current?.handleSignal(msg.fromId, msg.signal);
            return;
          }
          if (msg.type === 'room:init') {
            // 云端只告诉我们谁是房主；真正的房间状态稍后由房主通过 DataChannel 下发。
            // 房主刷新后云端可能会把 hostId 判给别人，所以本地记一份「我曾经是房主」。
            const hostKey = `koko_p2p_host_${roomId}`;
            const iWasHost = sessionStorage.getItem(hostKey) === msg.playerId;
            const role = msg.hostId === msg.playerId || iWasHost ? 'host' : 'guest';
            if (role === 'host') sessionStorage.setItem(hostKey, msg.playerId);
            // 记住房主 id：云端模式下点「重试直连」要用它，否则只能等 p2p:host 广播
            if (typeof msg.hostId === 'string' && msg.hostId) p2pHostRef.current = msg.hostId;
            if (!p2pRef.current) {
              startP2P(role, msg.playerId, p2pHostRef.current || msg.hostId || msg.playerId);
              // 房主显式认领身份：刷新后云端可能把 hostId 判给了别人，
              // 这一条让云端把房主改回来，后来的人才知道该连谁。
              if (role === 'host' && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'p2p:host' }));
              }
              armP2PFallback();
            }
            // 还没直连成功时，先用云端 init 渲染（手机打洞失败也不会一片空白）
            if (!p2pRef.current?.connected) dispatchMessage(msg);
            return;
          }
          /**
           * 直连还没建立好之前，云端广播照常消费。
           * 以前这里无条件丢弃，客人进房后要干等直连建好（现在最长 12 秒），
           * 这段时间别人的走动、聊天、视频状态全是静止的 —— 看起来就是「进房很慢」。
           * 只有真正连上之后才切换成「只信 DataChannel」，避免两条通路打架。
           */
          if (p2pRef.current?.connected && msg.type !== 'webrtc:signal') return;
        }

        dispatchMessage(msg);
      };

      /**
       * 回落到云端模式。
       * 关键：必须把 p2pEnabledRef 也关掉 —— 否则分流逻辑会继续丢弃云端业务消息，
       * 表现就是「显示云端，但谁都不同步」。
       */
      function fallbackToCloud(reason: string, gaveUp = true) {
        if (p2pFallbackRef.current) {
          window.clearTimeout(p2pFallbackRef.current);
          p2pFallbackRef.current = null;
        }
        if (gaveUp) p2pGaveUpRef.current = true;
        p2pEnabledRef.current = false;
        isP2PHostRef.current = false;
        try {
          p2pRef.current?.close();
        } catch {
          /* ignore */
        }
        p2pRef.current = null;
        setLinkMode('cloud');
        showToast(reason);
        // 重新 join 一次，拉全量房间状态（含已在线玩家的位置）
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(joinPayload));
        }
      }

      /**
       * 直连超时回落云端。
       * 12 秒而不是 6 秒：信令本身要走一趟云端（offer 上行 + answer 下行），
       * 链路差的时候单程就要 2~3 秒，6 秒会在「其实能打通」的情况下误判失败，
       * 白白回落到云端模式 —— 表现就是「今天特别卡」。
       */
      function armP2PFallback() {
        if (p2pFallbackRef.current) window.clearTimeout(p2pFallbackRef.current);
        p2pFallbackRef.current = window.setTimeout(() => {
          if (p2pRef.current && !p2pRef.current.connected) {
            fallbackToCloud('直连超时，已切回云端房间（刷新页面可重试直连）');
          }
        }, 12000);
      }

      /** 云端模式下点状态胶囊重试直连，不必刷新整页（每次 connect 重挂一次，幂等） */
      p2pRetryRef.current = () => {
        if (p2pRef.current?.connected) return;
        const hostId = p2pHostRef.current;
        if (!hostId) {
          showToast('还没拿到房主信息，稍等一下再试');
          return;
        }
        p2pGaveUpRef.current = false;
        p2pEnabledRef.current = true;
        setLinkMode('connecting');
        startP2P('guest', clientId, hostId);
        armP2PFallback();
      };

      /**
       * 切换连接方式（只有房主会调）。
       * direct：自己当房主开直连，把当前云端状态交给新房主核心，并广播 p2p:host 让客人跟过来。
       * cloud：广播 p2p:off 让所有客人回落，然后自己也回云端重新 join 拉全量状态。
       */
      linkSwitchRef.current = (mode) => {
        if (mode === 'direct') {
          if (p2pRef.current) return;
          setLinkModePreference('direct');
          p2pGaveUpRef.current = false;
          p2pEnabledRef.current = true;
          setLinkMode('connecting');
          startP2P('host', clientId, clientId, linkStateRef.current);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'p2p:host' }));
          }
          armP2PFallback();
          return;
        }
        setLinkModePreference('cloud');
        if (ws.readyState === WebSocket.OPEN) {
          // 先把房主核心的最新状态推给云端，再关直连：
          // 否则云端还停在最多 5 秒前的快照，切回来视频会往回跳。
          const state = p2pRef.current?.snapshotState();
          if (state) ws.send(JSON.stringify({ type: 'room:snapshot', state }));
          ws.send(JSON.stringify({ type: 'p2p:off' }));
        }
        if (p2pEnabledRef.current) {
          fallbackToCloud('已切回云端模式');
        } else {
          setLinkMode('cloud');
        }
      };

      /** 建 P2P 会话（房主 / 客人共用），供 room:init 与 p2p:host 两条路径调用 */
      function startP2P(
        role: 'host' | 'guest',
        selfId: string,
        hostId: string,
        initialState?: unknown
      ) {
        if (p2pRef.current) return p2pRef.current;
        const room = new P2PRoom({
          roomId,
          selfId,
          hostId,
          role,
          initialState,
          sendSignal: (targetId, signal) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'p2p:signal', targetId, signal }));
            }
          },
          // 房主把权威状态镜像到云端：房主关机/断网后，接管的人还能接着播同一部片
          onSnapshot: (state) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'room:snapshot', state }));
            }
          },
          // 还没客人直连上时，把房主的指令也发给云端，让「正在建连」的客人不至于看到静止画面
          onMirrorCommand: (json) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(json);
          },
          onMessage: (payload) => {
            try {
              dispatchMessage(payload);
            } catch (err) {
              console.warn('[p2p] dispatch failed', err);
            }
          },
          onStatus: (status, detail) => {
            if (status === 'failed') {
              fallbackToCloud(detail || '直连失败，已切回云端房间');
            } else if (status === 'connected') {
              if (p2pFallbackRef.current) window.clearTimeout(p2pFallbackRef.current);
              setLinkMode('direct');
              // 房主自己就是服务器，没有「直连房主」这回事，别弹这条
              if (role === 'guest') showToast('已直连房主，延迟更低');
            }
          },
        });
        p2pRef.current = room;
        isP2PHostRef.current = role === 'host';
        room.start(joinPayload);
        return room;
      }

      function dispatchMessage(msgIn: Record<string, any>) {
        const msg = msgIn;
        switch (msg.type) {
          case 'room:init': {
            setLocalPlayerId(msg.playerId);
            audioMgrRef.current?.setLocalId(msg.playerId);
            setMapId(msg.mapId);
            // 兜底：万一列表里没有自己（P2P 客人尚未拿到房主 init、或房间状态异常），
            // 补一条自己的记录，否则画布上会「看不到自己的角色」。
            const initPlayers: PlayerState[] = Array.isArray(msg.players) ? [...msg.players] : [];
            if (msg.playerId && !initPlayers.some((p) => p.id === msg.playerId)) {
              initPlayers.push({
                id: msg.playerId,
                name: playerName,
                avatar,
                x: 800,
                y: 790,
                dir: 'up',
                isMoving: false,
                isSitting: false,
                seatId: null,
                isMicOn: false,
                isBroadcasting: false,
                isHost: false,
              });
            }
            setPlayers(initPlayers);
            setFurniture(msg.furniture || []);
            setScreenAnchor(msg.screenAnchor ?? null);
            if (msg.videoState) setVideoState(msg.videoState);
            if (msg.serverTimeMs) {
              setServerTimeOffsetMs(msg.serverTimeMs - Date.now());
            }
            if (Array.isArray(msg.chatHistory)) {
              setChatHistory(msg.chatHistory);
            }
            // Initiate WebRTC audio peer connections for existing players
            for (const p of (msg.players || []) as PlayerState[]) {
              if (p.id !== msg.playerId) {
                audioMgrRef.current?.connectToPeer(p.id);
              }
            }
            break;
          }
          case 'player:joined': {
            const incoming = msg.player as PlayerState;
            setPlayers((prev) => {
              if (prev.some((p) => p.id === incoming.id)) {
                return prev.map((p) => (p.id === incoming.id ? incoming : p));
              }
              return [...prev, incoming];
            });
            audioMgrRef.current?.connectToPeer(incoming.id);
            // 房主：有人进来就再宣告一次，保证后到的人也知道该连谁
            if (isP2PHostRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'p2p:host' }));
            }
            break;
          }
          case 'player:moved': {
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === msg.playerId
                  ? {
                      ...p,
                      x: msg.x,
                      y: msg.y,
                      dir: msg.dir,
                      isMoving: msg.isMoving,
                      isSitting: msg.isSitting,
                      seatId: msg.seatId,
                    }
                  : p
              )
            );
            // 扛着巨幕的人走动时，屏幕位置跟着这条消息一起过来
            if (msg.screenAnchor) setScreenAnchor(msg.screenAnchor);
            break;
          }
          case 'player:carried': {
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === msg.playerId
                  ? {
                      ...p,
                      carryTarget: msg.carryTarget ?? null,
                      carriedBy: msg.carriedBy ?? null,
                      isMoving: false,
                    }
                  : p
              )
            );
            break;
          }
          case 'screen:moved': {
            setScreenAnchor(msg.anchor ?? null);
            break;
          }
          case 'player:avatar_updated': {
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === msg.playerId ? { ...p, name: msg.name, avatar: msg.avatar } : p
              )
            );
            break;
          }
          case 'player:audio_updated': {
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === msg.playerId
                  ? { ...p, isMicOn: msg.isMicOn, isBroadcasting: msg.isBroadcasting }
                  : p
              )
            );
            break;
          }
          case 'player:reaction': {
            setReactions((prev) => [
              ...prev.slice(-24),
              {
                id: msg.id,
                playerId: msg.playerId,
                playerName: msg.playerName,
                emoji: msg.emoji,
                label: msg.label,
                x: msg.x,
                y: msg.y,
                createdAt: Date.now(),
              },
            ]);
            break;
          }
          case 'player:chat': {
            const chatMsg = msg.message as ChatMessage;
            setChatHistory((prev) => [...prev.slice(-49), chatMsg]);
            setChatBubbles((prev) => {
              const next = new Map(prev);
              next.set(chatMsg.playerId, {
                text: chatMsg.text,
                expiresAt: Date.now() + CHAT_BUBBLE_LIFETIME_MS,
              });
              return next;
            });
            break;
          }
          case 'video:rejected': {
            showToast(msg.reason || '只有点播人可以改播放进度');
            break;
          }
          case 'video:queued': {
            const pos = Number(msg.position) || 0;
            const total = Number(msg.total) || 0;
            const title = msg.item?.title || '该视频';
            if (msg.already) {
              showToast(`「${title}」已在播放队列第 ${pos} 位`);
            } else if (total > pos) {
              showToast(`已加入队列：第 ${pos} 位 / 共 ${total} 部，当前片播完自动播放`);
            } else {
              showToast('已加入队列，当前片播完自动播放');
            }
            break;
          }
          case 'video:synced': {
            if (msg.videoState) {
              const nextItem = msg.videoState.currentItem;
              if (msg.videoState.currentItem?.id !== videoStateRef.current.currentItem.id) {
                playbackTimeRef.current = null;
              }
              // B 站播放器是黑盒：进片时提示一次正确用法，否则房主会去拖 B 站自带进度条
              if (
                nextItem?.sourceType === 'bilibili' &&
                nextItem.id &&
                biliHintedRef.current !== nextItem.id
              ) {
                biliHintedRef.current = nextItem.id;
                showToast('B 站播放器无法被控制：请用巨幕下方的时间轴「对齐所有人」，别用 B 站自带的进度条');
              }
              setVideoState(msg.videoState);
            }
            if (typeof msg.serverTimeMs === 'number') {
              // 单条消息的 offset 含网络单程延迟，逐条套用会来回抖；
              // 120ms 死区内不动，超出才半量跟随，时钟才稳。
              setServerTimeOffsetMs((prev) => {
                const measured = msg.serverTimeMs - Date.now();
                if (Math.abs(measured - prev) < 120) return prev;
                return Math.round(prev + (measured - prev) * 0.5);
              });
            }
            if (msg.triggeredBy && msg.triggeredBy !== playerName && !msg.silent) {
              showToast(`${msg.triggeredBy} 同步更新了中央巨幕播放状态`);
            }
            break;
          }
          case 'scene:updated': {
            if (msg.mapId) setMapId(msg.mapId);
            if (Array.isArray(msg.furniture)) setFurniture(msg.furniture);
            setScreenAnchor(msg.screenAnchor ?? null);
            if (msg.updatedBy) {
              showToast(`${msg.updatedBy} 更新了空间场景配置`);
            }
            break;
          }
          case 'player:left': {
            setPlayers((prev) =>
              prev
                .filter((p) => p.id !== msg.playerId)
                .map((p) => ({ ...p, isHost: p.id === msg.newHostId }))
            );
            audioMgrRef.current?.removePeer(msg.playerId);
            break;
          }
          case 'webrtc:signal': {
            audioMgrRef.current?.handleSignal(msg.fromId, msg.signal);
            break;
          }
        }
      }

      ws.onclose = () => {
        if (pingTimer) {
          window.clearInterval(pingTimer);
          pingTimer = null;
        }
        if (!closedByUser) {
          reconnectTimer = window.setTimeout(connect, 1800);
        }
      };
    };

    /** 云端模式下点状态胶囊重试直连，不必刷新整页 */
    connect();
    return () => {
      closedByUser = true;
      p2pRetryRef.current = null;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      p2pRef.current?.close();
      p2pRef.current = null;
      wsRef.current?.close();
    };
  }, [hasEnteredRoom, roomId, manuallyDisconnected]);

  // 换片时清掉上一部的真实播放位置，防止进度上报定时器把旧时间写进新视频
  useEffect(() => {
    playbackTimeRef.current = null;
  }, [videoState.currentItem.id]);

  // Actions & Handlers
  // 点播人每 2 秒上报一次**真实播放位置**（不是时钟外推值）：
  // 视频缓冲、解码慢、切后台都会让真实位置落后，只有元素自己知道。
  // 上报后服务端广播静默同步，所有人重新对齐。
  useEffect(() => {
    if (!hasEnteredRoom || manuallyDisconnected) return;
    if (!videoState.controllerId || videoState.controllerId !== localPlayerId) return;
    const timer = window.setInterval(() => {
      const vs = videoStateRef.current;
      let t: number;
      if (
        vs.currentItem.sourceType === 'mp4' ||
        vs.currentItem.sourceType === 'hls' ||
        vs.currentItem.sourceType === 'youtube'
      ) {
        if (playbackTimeRef.current == null || !Number.isFinite(playbackTimeRef.current)) return;
        t = playbackTimeRef.current;
      } else if (vs.currentItem.sourceType === 'builtin') {
        // 内置短片由时钟直接绘制，外推即是真实位置；若已到片尾则直接推进下一部
        const nowServer = Date.now() + serverOffsetRef.current;
        const elapsed = vs.isPlaying ? Math.max(0, (nowServer - vs.updatedAtMs) / 1000) : 0;
        t = vs.currentTime + elapsed;
        const dur = vs.currentItem.durationSec;
        if (vs.isPlaying && dur && dur > 5 && t >= dur) {
          sendGame(
            JSON.stringify({
              type: 'video:control',
              action: 'next',
              expectedItemId: vs.currentItem.id,
            })
          );
          return;
        }
      } else if (vs.currentItem.sourceType === 'bilibili') {
        // B 站 iframe 读不到进度，本来就不该上报 progress —— 那会把 updatedAtMs
        // 一直刷新，反过来把服务端看门狗饿死。只在片尾时上报「播完了」。
        //
        // 放在这个 setInterval 里而不是只靠 rAF：标签页切后台时 rAF 会整个暂停，
        // setInterval 只是被节流（约每分钟一次），还能兜住最后一次。
        //
        // 暂停时用 currentTime 本身（不外加已播时间）：它若贴在片尾，说明是
        // 「播完停住」而不是「暂停在中间」。暂停状态多等 3 秒再上报。
        const nowServer = Date.now() + serverOffsetRef.current;
        const elapsed = vs.isPlaying ? Math.max(0, (nowServer - vs.updatedAtMs) / 1000) : 0;
        const t = vs.isPlaying ? vs.currentTime + elapsed : vs.currentTime;
        const dur = vs.currentItem.durationSec;
        const atTail = !!dur && dur > 5 && t >= dur - 0.5;
        const holdOk = vs.isPlaying || nowServer - vs.updatedAtMs > 3000;
        if (atTail && holdOk) {
          sendGame(
            JSON.stringify({
              type: 'video:control',
              action: 'ended',
              expectedItemId: vs.currentItem.id,
            })
          );
        }
        return;
      } else {
        return;
      }
      sendGame(JSON.stringify({ type: 'video:control', action: 'progress', currentTime: t }));
    }, 2000);
    return () => window.clearInterval(timer);
  }, [hasEnteredRoom, manuallyDisconnected, localPlayerId, videoState.controllerId, sendGame]);

  const handleSaveAvatarAndEnter = async () => {
    const cleanName = playerName.trim() || '旅人';
    setPlayerName(cleanName);
    localStorage.setItem('koko_name', cleanName);
    localStorage.setItem('koko_avatar', JSON.stringify(avatar));

    sendGame(
      JSON.stringify({
        type: 'player:update_avatar',
        name: cleanName,
        avatar,
      })
    );

    setHasEnteredRoom(true);
    setShowAvatarModal(false);
  };

  /** 手动断开整个房间连接 / 重新连接。断开后所有收发都停，再点恢复。 */
  const handleToggleConnection = () => {
    if (manuallyDisconnected) {
      setLinkMode(isP2PEnabled() ? 'connecting' : 'off');
      setManuallyDisconnected(false);
      showToast('正在重新连接房间…');
      return;
    }
    if (p2pFallbackRef.current) {
      window.clearTimeout(p2pFallbackRef.current);
      p2pFallbackRef.current = null;
    }
    // 停麦并关闭所有语音 peer，避免断开后还留着别人的声音
    for (const p of playersRef.current) {
      if (p.id !== localIdRef.current) audioMgrRef.current?.removePeer(p.id);
    }
    audioMgrRef.current?.disableMic();
    setIsMicOn(false);
    setIsBroadcasting(false);
    setNearbyCount(0);
    // 清掉远端玩家，画布上只留自己；重连时 room:init 会拉回全量状态
    setPlayers((prev) => prev.filter((p) => p.id === localIdRef.current));
    setManuallyDisconnected(true);
    setLinkMode('off');
    showToast('已断开房间连接，点「重新连接」恢复');
  };

  /**
   * 底栏「小窗」= 一步到位：直接弹出系统级悬浮窗（Document PiP），不再先开页面内小窗。
   * 只有浏览器不支持 / 开窗失败时才回落到页面内小窗，并在 toast 里说明。
   */
  const handleToggleMini = useCallback(async () => {
    if (isMiniPlayer) {
      pip.close();
      setIsMiniPlayer(false);
      return;
    }
    setIsTheaterFocused(false);
    // 先趁手势还在，让主屏把声音打开（小窗自己开声音会被自动播放策略拦掉）
    setUnmuteSignal((n) => n + 1);
    // 先开窗再挂载：避免页面内小窗闪一下再跳进悬浮窗
    const ok = await pip.open();
    setIsMiniPlayer(true);
    if (!ok) showToast('这个浏览器不支持独立悬浮窗，先用页面内小窗（Chrome / Edge 可弹出）');
  }, [isMiniPlayer, pip, showToast]);

  /** 页面内小窗顶栏的「独立窗口」按钮（只在回落模式里出现） */
  const handleTogglePip = useCallback(async () => {
    if (pip.container) {
      pip.close();
      return;
    }
    const ok = await pip.open();
    if (!ok) showToast('当前浏览器不支持独立悬浮窗，请用 Chrome / Edge 打开');
    else showToast('已弹出独立悬浮窗，切到别的应用也能继续看');
  }, [pip, showToast]);

  const handleToggleTheaterFocus = useCallback(() => {
    setIsTheaterFocused((prev) => {
      const next = !prev;
      if (next) {
        setIsMiniPlayer(false);
        pip.close();
      }
      return next;
    });
  }, [pip]);

  // 页面内回落模式（不支持 PiP 时）才需要这句提示
  useEffect(() => {
    if (isMiniPlayer && !pip.container) {
      showToast('已打开小窗 · 拖动顶栏可移动，点 ✕ 关闭（大屏照常在房间里播）');
    }
  }, [isMiniPlayer, pip.container, showToast]);

  /**
   * 新聊天消息 → 塞进小窗气泡队列。
   * 用 chatHistory 的末尾来判断「有新消息」，这样云端 WS 和 P2P 两条链路都能覆盖到。
   */
  const lastChatIdRef = useRef<string>('');
  useEffect(() => {
    const last = chatHistory[chatHistory.length - 1];
    if (!last || last.id === lastChatIdRef.current) return;
    lastChatIdRef.current = last.id;
    // 系统播报不弹气泡；进房时补进来的历史消息也不弹
    if (last.isSystem) return;
    if (Date.now() - last.createdAt > 5000) return;
    setMiniChatFeed((prev) => [
      ...prev.slice(-2),
      { id: last.id, name: last.playerName, text: last.text, at: Date.now() },
    ]);
  }, [chatHistory]);

  // 气泡动画 3 秒，过期就移出队列（动画结束后不再占位）
  useEffect(() => {
    if (!miniChatFeed.length) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - 3200;
      setMiniChatFeed((prev) => {
        const next = prev.filter((m) => m.at > cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, [miniChatFeed.length]);

  /** 扛起 / 放下：target 传 '@screen'、玩家 id，或 null（放下手里的东西） */
  const handleCarry = useCallback(
    (target: string | null) => {
      sendGame(JSON.stringify({ type: 'player:carry', target }));
    },
    [sendGame]
  );

  const handleMoveLocalPlayer = useCallback(
    (next: {
      x: number;
      y: number;
      dir: 'down' | 'up' | 'left' | 'right';
      isMoving: boolean;
      isSitting: boolean;
      seatId: string | null;
    }) => {
      setPlayers((prev) =>
        prev.map((p) => (p.id === localIdRef.current ? { ...p, ...next } : p))
      );
      // 扛着巨幕时本地立刻跟手：服务端不会把「自己的移动」回显给自己，
      // 不在这里补一下，自己这边的巨幕会一直停在原地。
      const me = playersRef.current.find((p) => p.id === localIdRef.current);
      if (me?.carryTarget === SCREEN_CARRY_TARGET) {
        setScreenAnchor({ x: next.x, y: next.y - CARRY.screenLift });
      }
      sendGame(
        JSON.stringify({
          type: 'player:move',
          ...next,
        })
      );
    },
    [sendGame]
  );

  const toggleMic = async () => {
    if (manuallyDisconnected) {
      showToast('连接已断开，请先重新连接');
      return;
    }
    if (isMicOn) {
      audioMgrRef.current?.disableMic();
      setIsMicOn(false);
      setIsBroadcasting(false);
      sendGame(
        JSON.stringify({ type: 'player:audio_state', isMicOn: false, isBroadcasting: false })
      );
      return;
    }
    const ok = await audioMgrRef.current?.enableMic();
    if (!ok) {
      showToast('无法访问麦克风，请检查浏览器权限');
      return;
    }
    setIsMicOn(true);
    sendGame(
      JSON.stringify({ type: 'player:audio_state', isMicOn: true, isBroadcasting })
    );
  };

  const toggleBroadcast = async () => {
    if (manuallyDisconnected) {
      showToast('连接已断开，请先重新连接');
      return;
    }
    const next = !isBroadcasting;
    if (next && !isMicOn) {
      const ok = await audioMgrRef.current?.enableMic();
      if (!ok) {
        showToast('请先允许麦克风权限以开启舞台广播');
        return;
      }
      setIsMicOn(true);
      setIsBroadcasting(true);
      sendGame(
        JSON.stringify({ type: 'player:audio_state', isMicOn: true, isBroadcasting: true })
      );
      showToast('已开启全房间舞台广播');
      return;
    }
    setIsBroadcasting(next);
    sendGame(
      JSON.stringify({ type: 'player:audio_state', isMicOn, isBroadcasting: next })
    );
    showToast(next ? '已开启全房间舞台广播' : '已切换回空间距离语音');
  };

  const sendReaction = (emoji: string, label?: string) => {
    sendGame(
      JSON.stringify({
        type: 'player:reaction',
        emoji,
        label,
      })
    );
    setShowEmojiMenu(false);
  };

  /** 发一条聊天（主聊天框和悬浮窗共用）：里面贴了视频链接就顺手点播 */
  const handleSendChatText = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    sendGame(JSON.stringify({ type: 'player:chat', text }));
    const link = detectVideoLink(text);
    if (link) {
      showToast('识别到视频链接，正在点播…');
      setChatEnqueueing(true);
      // 解析要等服务端抓元信息（海外源偶尔要十几秒），期间输入框下方常驻一条状态
      void handleEnqueueUrl(link.url, link.titleHint).finally(() => setChatEnqueueing(false));
    }
  };

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendChatText(chatInput);
    setChatInput('');
  };

  /** 影院组件回传 mp4 真实播放位置，供点播人上报使用 */
  const handlePlaybackTime = useCallback((t: number) => {
    playbackTimeRef.current = t;
  }, []);

  /** 这一部播完了：谁看到都能上报，服务端校验「已经播到接近片尾」后推进 */
  const handleMediaEnded = useCallback(() => {
    const vs = videoStateRef.current;
    playbackTimeRef.current = null;
    sendGame(
      JSON.stringify({
        type: 'video:control',
        action: 'ended',
        expectedItemId: vs.currentItem.id,
      })
    );
  }, [sendGame]);

  /** 手动跳到下一部 */
  const handleSkipNext = useCallback(() => {
    const vs = videoStateRef.current;
    playbackTimeRef.current = null;
    sendGame(
      JSON.stringify({
        type: 'video:control',
        action: 'next',
        expectedItemId: vs.currentItem.id,
      })
    );
  }, [sendGame]);

  /** 跳到队列中指定影片 */
  const handleJumpToItem = useCallback(
    (itemId: string) => {
      playbackTimeRef.current = null;
      sendGame(
        JSON.stringify({
          type: 'video:control',
          action: 'jump_to',
          itemId,
        })
      );
    },
    [sendGame]
  );

  const handleChangeSkipStepSec = useCallback((sec: number) => {
    setSkipStepSec(sec);
    localStorage.setItem('koko_skip_step_sec', String(sec));
  }, []);

  const handleChangeAutoSkipOutroSec = useCallback((sec: number) => {
    setAutoSkipOutroSec(sec);
    localStorage.setItem('koko_skip_outro_sec', String(sec));
  }, []);

  const handleVideoControl = (action: 'play' | 'pause' | 'seek', currentTime?: number) => {
    // 进度只由点播人控制；别人点了只给提示，不发消息
    const controllerId = videoState.controllerId;
    if (controllerId && controllerId !== localPlayerId) {
      showToast(`「${videoState.controllerName || '点播人'}」在控片，只有他能改进度`);
      return;
    }
    sendGame(
      JSON.stringify({
        type: 'video:control',
        action,
        currentTime,
      })
    );
  };

  const handleEnqueueUrl = async (rawInput: string, title: string, preset?: WatchHistoryItem) => {
    const input = rawInput.trim();
    if (!input) return;
    const userTitle = title.trim();
    let resolvedTitle = userTitle;
    let thumbnail: string | undefined;
    let durationSec: number | undefined;
    let sourceType: string | undefined;
    let canonicalUrl: string | undefined;
    let bvid = extractBvid(input);

    if (preset) {
      // 从「我的点播记录」重新入队：元信息都是现成的，不用再解析一次
      resolvedTitle = userTitle || preset.title;
      thumbnail = preset.thumbnail;
      durationSec = preset.durationSec;
      sourceType = preset.sourceType;
      canonicalUrl = preset.url;
    } else {
      try {
        const controller = new AbortController();
        // 短链要跟一次 302；链路差的时候服务端实测要 5~9 秒，给足 15 秒再放弃
        const timer = window.setTimeout(() => controller.abort(), 15000);
        const res = await fetch('/api/parse-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: input }),
          signal: controller.signal,
        });
        window.clearTimeout(timer);
        if (res.ok) {
          const meta = (await res.json()) as {
            sourceType?: string;
            titleHint?: string;
            thumbnail?: string;
            durationSec?: number;
            bvid?: string;
            canonicalUrl?: string;
          };
          if (!resolvedTitle && meta.titleHint) resolvedTitle = meta.titleHint;
          if (meta.thumbnail) thumbnail = meta.thumbnail;
          if (typeof meta.durationSec === 'number' && meta.durationSec > 0) {
            durationSec = meta.durationSec;
          }
          if (meta.sourceType) sourceType = meta.sourceType;
          if (meta.canonicalUrl) canonicalUrl = meta.canonicalUrl;
          if (meta.bvid) bvid = meta.bvid;
        }
      } catch {
        // 无后端或解析超时（如 P2P/Workers 环境）时回退为直接入队，由 RoomCore 做基础解析
      }
    }

    // 只给了 b23 短链、服务端又没解析出来：直接入队只会变成一个打不开的 mp4，不如明说
    if (!bvid && !preset && /b23\.tv\//i.test(input)) {
      showToast('短链解析失败，请改用含 BV 号的链接');
      return;
    }

    // 服务端拿不到元信息（Cloudflare 出口被 B 站 412 风控）时，用浏览器自己的 IP 走 JSONP 补一次。
    // 时长决定「播完能不能自动跳下一部」，标题决定列表里显示什么 —— 两个都靠它。
    // 注意 sourceType 可能因为 /api/parse-video 超时而为空，只要抠到了 BV 就仍然要补，
    // 否则这类片子会永远缺时长 → 播完卡在 B 站推荐页不推进。
    const needsBiliMeta =
      !!bvid &&
      (sourceType === 'bilibili' || !sourceType) &&
      (!durationSec || !resolvedTitle || /^Bilibili 视频\s*\(/i.test(resolvedTitle));
    if (needsBiliMeta && bvid) {
      const biliPage = extractBiliPage(input);
      // 第一次 5 秒，失败再给 5 秒：B 站这个接口偶尔会抖，
      // 单次超时就放弃的话，时长缺失会让这部片播完永远停在最后一帧。
      let meta = await fetchBilibiliMetaJsonp(bvid, biliPage, 5000);
      if (!meta) meta = await fetchBilibiliMetaJsonp(bvid, biliPage, 5000);
      if (meta) {
        if (!durationSec && meta.durationSec) durationSec = meta.durationSec;
        // 用户手填的标题优先；服务端在 Worker 上只能给「Bilibili 视频 (BVxxx)」这种兜底标题，
        // 用 JSONP 拿到的真实标题覆盖它
        if (meta.title && !userTitle) resolvedTitle = meta.title;
        if (!thumbnail && meta.thumbnail) thumbnail = meta.thumbnail;
      }
    }

    // 时长是「播完自动跳下一部」的唯一依据：B 站 iframe 是黑盒，
    // 没有 ended 事件，也没法读播放进度。真拿不到时长就只会停在它的推荐页，
    // 这里至少提前说清楚，别让人干等。
    if (bvid && !durationSec) {
      showToast('没拿到这部片的时长，播完需要手动点「跳过」');
    }

    // 入队用规范地址：短链/分享文案在服务端和房主端都解析不了，只有 BV 是稳定标识。
    // 分 P 序号要保留 —— 丢了的话服务端会把 embedUrl 拼成 page=1，播的和时长对不上。
    const biliPageForUrl = extractBiliPage(input);
    const enqueueUrl =
      canonicalUrl ||
      (bvid
        ? `https://www.bilibili.com/video/${bvid}${
            biliPageForUrl > 1 ? `?p=${biliPageForUrl}` : ''
          }`
        : input);

    // 记录到本机点播历史：同一个地址只留最新一条，重播会把它顶到最前面
    setWatchHistory(
      pushWatchHistory({
        url: enqueueUrl,
        title: resolvedTitle || enqueueUrl,
        sourceType: (sourceType || 'mp4') as VideoSourceType,
        thumbnail,
        durationSec,
      })
    );

    sendGame(
      JSON.stringify({
        type: 'video:control',
        action: 'enqueue',
        item: {
          url: enqueueUrl,
          title: resolvedTitle,
          thumbnail,
          durationSec,
          sourceType,
        },
      })
    );
  };

  const handleRemoveHistory = (url: string) => {
    setWatchHistory(removeWatchHistory(url));
  };

  const handleClearHistory = () => {
    setWatchHistory(clearWatchHistory());
    showToast('已清空本机点播记录');
  };

  const handleRemoveFromQueue = (itemId: string) => {
    sendGame(
      JSON.stringify({
        type: 'video:control',
        action: 'remove_queue',
        itemId,
      })
    );
  };

  const handleSelectMap = (nextMapId: MapId) => {
    const theme = allMaps.find((m) => m.id === nextMapId) || BUILTIN_MAPS[0];
    setMapId(nextMapId);
    setFurniture(theme.defaultFurniture);
    sendGame(
      JSON.stringify({
        type: 'scene:update',
        mapId: nextMapId,
        furniture: theme.defaultFurniture,
      })
    );
  };

  const handlePlaceOrRemoveFurniture = (worldX: number, worldY: number) => {
    let updated: FurnitureItem[];
    if (selectedBrush === 'erase') {
      const target = furniture.find((f) => Math.hypot(f.x - worldX, f.y - worldY) < 38);
      if (!target) return;
      updated = furniture.filter((f) => f.id !== target.id);
    } else {
      if (furniture.length >= 40) {
        showToast('单个房间最多摆放 40 件家具');
        return;
      }
      if (selectedBrush === 'art_frame' && !pendingArt) {
        showToast('先画一张，再点房间挂上去');
        return;
      }
      const sittable = ['sofa_coral', 'sofa_slate', 'beanbag_coral', 'beanbag_cream'].includes(
        selectedBrush
      );
      const newItem: FurnitureItem = {
        id: `furn_${Date.now().toString(36)}`,
        type: selectedBrush,
        x: Math.round(worldX),
        y: Math.round(worldY),
        sittable,
        label: sittable ? '自定义座位' : selectedBrush === 'art_frame' ? '像素画' : undefined,
        art: selectedBrush === 'art_frame' ? pendingArt ?? undefined : undefined,
      };
      updated = [...furniture, newItem];
    }
    setFurniture(updated);
    sendGame(
      JSON.stringify({
        type: 'scene:update',
        furniture: updated,
      })
    );
  };

  /** 画板「挂到房间」：带着这张画进场景编辑，下一次点房间就把画框放到那儿 */
  const handleHangArt = (dataUrl: string) => {
    setPendingArt(dataUrl);
    setShowPixelStudio(false);
    setIsEditingScene(true);
    setSelectedBrush('art_frame');
    showToast('点一下房间的墙，把画挂上去');
  };

  const handleResetFurniture = () => {    const defaults = currentMapTheme.defaultFurniture;
    setFurniture(defaults);
    sendGame(
      JSON.stringify({
        type: 'scene:update',
        furniture: defaults,
      })
    );
  };

  const handleSaveSceneLocal = async (roomName: string) => {
    const next = saveLocalScene({
      roomName,
      mapId,
      furniture,
      defaultVideoUrl: videoState.currentItem.url,
    });
    setSavedScenes(next);
    showToast('场景布局已保存到本机');
  };

  const handleLoadLocalScene = (preset: LocalScenePreset) => {
    setMapId(preset.mapId);
    setFurniture(preset.furniture);
    sendGame(
      JSON.stringify({
        type: 'scene:update',
        mapId: preset.mapId,
        furniture: preset.furniture,
      })
    );
    showToast(`已应用场景「${preset.roomName}」`);
  };

  const handleDeleteLocalScene = async (sceneId: string) => {
    setSavedScenes(deleteLocalScene(sceneId));
    showToast('已删除本机场景');
  };

  const copyInviteLink = () => {
    // 房主在 P2P 模式下复制链接必须带上 p2p=1，否则别人进来是云端模式，连不到房主
    const p2pSuffix = p2pEnabledRef.current ? '&p2p=1' : '';
    const url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}${p2pSuffix}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    showToast(`已复制房间「${roomId}」邀请链接`);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="relative w-full h-full bg-[#F4F5F7] overflow-hidden flex flex-col">
      {/* Compact 3-Zone Top Navigation Bar */}
      <header className="h-14 px-4 sm:px-6 bg-white/90 backdrop-blur-md border-b border-zinc-200/90 flex items-center justify-between gap-4 sm:gap-8 z-30 shrink-0">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-lg font-bold tracking-tight text-zinc-900 whitespace-nowrap shrink-0">
            KokoSpace
          </span>
          <span className="hidden sm:inline text-xs text-zinc-400">·</span>
          <span className="hidden sm:inline text-xs text-zinc-600 truncate">
            {currentMapTheme.name} · 房间 {roomId}
          </span>
          {manuallyDisconnected ? (
            <span
              title="已手动断开房间连接，点击底部「重新连接」恢复"
              className="hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-600"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              已断开
            </span>
          ) : (
            <div className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setShowLinkMenu((v) => !v)}
                title={
                  isRoomHost
                    ? '连接方式：点这里切换直连 / 云端（作用于全屋）'
                    : '连接方式由房主决定，你会自动跟随'
                }
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium cursor-pointer hover:brightness-95 ${
                  linkMode === 'direct'
                    ? 'bg-emerald-50 text-emerald-600'
                    : linkMode === 'connecting'
                      ? 'bg-zinc-100 text-zinc-500'
                      : 'bg-sky-50 text-sky-600'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    linkMode === 'direct'
                      ? 'bg-emerald-500'
                      : linkMode === 'connecting'
                        ? 'bg-zinc-400 animate-pulse'
                        : 'bg-sky-500'
                  }`}
                />
                {linkMode === 'direct' ? '直连' : linkMode === 'connecting' ? '连接中' : '云端'}
                <span className="opacity-70">· {players.length}人</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>

              {showLinkMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLinkMenu(false)} />
                  <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl">
                    <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      连接方式
                    </div>
                    {(
                      [
                        {
                          id: 'direct' as const,
                          title: '直连（P2P）',
                          desc: '房主当服务器，延迟最低；打洞失败会自动回落云端',
                        },
                        {
                          id: 'cloud' as const,
                          title: '云端',
                          desc: '所有人走 Cloudflare 服务器，最稳，不受网络环境影响',
                        },
                      ]
                    ).map((opt) => {
                      const active =
                        opt.id === 'direct'
                          ? linkMode === 'direct' || linkMode === 'connecting'
                          : linkMode === 'cloud' || linkMode === 'off';
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={!isRoomHost}
                          onClick={() => {
                            if (!isRoomHost) return;
                            setShowLinkMenu(false);
                            linkSwitchRef.current?.(opt.id);
                          }}
                          className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left ${
                            isRoomHost ? 'hover:bg-zinc-50 cursor-pointer' : 'opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <span
                            className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${
                              active ? 'border-zinc-900 bg-zinc-900' : 'border-zinc-300 bg-white'
                            }`}
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-zinc-900">{opt.title}</span>
                            <span className="block text-[10px] leading-relaxed text-zinc-500">{opt.desc}</span>
                          </span>
                        </button>
                      );
                    })}
                    <p className="border-t border-zinc-100 px-2 pb-1 pt-2 text-[10px] leading-relaxed text-zinc-500">
                      {isRoomHost
                        ? '切换立刻作用于全屋：客人会自动跟随，不用重新进房。'
                        : '只有房主能切换。房主改了你也会自动跟随。'}
                    </p>
                    {!isRoomHost && linkMode === 'cloud' && p2pHostRef.current && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowLinkMenu(false);
                          p2pRetryRef.current?.();
                        }}
                        className="mt-1 w-full rounded-lg bg-zinc-100 px-2 py-1.5 text-[10px] font-medium text-zinc-700 hover:bg-zinc-200 cursor-pointer"
                      >
                        重试直连房主
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Zone 2: Clean Single-Line Nav Links (Desktop) */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-zinc-600">
          <button
            type="button"
            onClick={() => setShowQueueDrawer(true)}
            className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            点播队列
          </button>
          <button
            type="button"
            onClick={() => setShowSceneModal(true)}
            className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            地图与布置
          </button>
          <button
            type="button"
            onClick={() => setShowPixelStudio(true)}
            className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            像素画
          </button>
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            AI 点播
          </button>
          <button
            type="button"
            onClick={() => setShowAvatarModal(true)}
            className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            虚拟化身
          </button>
          <button
            type="button"
            onClick={() => setShowDocsModal(true)}
            className="hover:text-zinc-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            开发文档与插件
          </button>
        </nav>

        {/* Zone 3: Online Count + Primary Invite CTA */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-600 tabular-nums whitespace-nowrap">
            <Users className="w-3.5 h-3.5 text-zinc-400" />
            <span>{players.length} 人在线</span>
          </div>
          <button
            type="button"
            onClick={copyInviteLink}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copiedLink ? '已复制链接' : '邀请好友'}</span>
          </button>
        </div>
      </header>

      {/* Scene Edit Mode Floating Strip */}
      {isEditingScene && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-2xl bg-zinc-900 text-white text-xs font-medium shadow-xl flex items-center gap-3">
          <span>场景编辑模式：点击地图摆放「{selectedBrush === 'erase' ? '移除模式' : selectedBrush}」</span>
          <button
            type="button"
            onClick={() => setShowSceneModal(true)}
            className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 cursor-pointer"
          >
            切换家具
          </button>
          <button
            type="button"
            onClick={() => setIsEditingScene(false)}
            className="px-2.5 py-1 rounded-lg bg-[#FF5A36] hover:bg-[#E84B28] font-semibold cursor-pointer"
          >
            完成编辑
          </button>
        </div>
      )}

      {/* Main 2D Spatial World */}
      <main className="relative flex-1 min-h-0">
        {hasEnteredRoom && (
          <MetaverseCanvas
            mapTheme={currentMapTheme}
            players={players}
            localPlayerId={localPlayerId}
            localFallback={{ name: playerName, avatar }}
            furniture={furniture}
            videoState={videoState}
            serverTimeOffsetMs={serverTimeOffsetMs}
            reactions={reactions}
            chatBubbles={chatBubbles}
            joystickVector={joystickVec}
            isEditingScene={isEditingScene}
            selectedBrush={selectedBrush}
            isTheaterFocused={isTheaterFocused}
            isMini={isMiniPlayer}
            onToggleMini={handleToggleMini}
            pipContainer={pip.container}
            onTogglePip={handleTogglePip}
            pipSupported={pip.supported}
            unmuteSignal={unmuteSignal}
            miniChat={miniChatFeed}
            onOpenChat={() => setShowChatDrawer(true)}
            miniMessages={chatHistory}
            onSendMiniChat={handleSendChatText}
            onEnqueueMini={(url) => handleEnqueueUrl(url, '')}
            activeWidgets={activeWidgets}
            onMoveLocalPlayer={handleMoveLocalPlayer}
            onCarry={handleCarry}
            screenAnchor={screenAnchor}
            onPlaceOrRemoveFurniture={handlePlaceOrRemoveFurniture}
            onToggleTheaterFocus={handleToggleTheaterFocus}
            onOpenQueue={() => setShowQueueDrawer(true)}
            onVideoControl={handleVideoControl}
            onPlaybackTime={handlePlaybackTime}
            onMediaEnded={handleMediaEnded}
            hasNext={hasNext}
            onSkipNext={handleSkipNext}
            canControlProgress={
              !videoState.controllerId || videoState.controllerId === localPlayerId
            }
            canSkip={canSkipVideo}
            skipStepSec={skipStepSec}
            autoSkipOutroSec={autoSkipOutroSec}
            onProximityUpdate={(count, stage) => {
              setNearbyCount(count);
              setInStageZone(stage);
            }}
          />
        )}

        {/* Proximity & Stage Zone Indicator (Subtle Bottom-Left Info on Desktop) */}
        {hasEnteredRoom && (
          <div className="hidden md:flex fixed left-4 bottom-24 z-20 flex-col gap-1.5 px-3.5 py-2.5 rounded-2xl bg-white/88 backdrop-blur-md border border-zinc-200/90 shadow-sm text-xs text-zinc-700">
            <div className="font-medium flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#FF5A36]" />
              <span>
                {isBroadcasting
                  ? '全房间舞台广播中'
                  : inStageZone
                  ? '位于舞台区 · 可开启全员广播'
                  : `声场范围内有 ${nearbyCount} 位同伴`}
              </span>
            </div>
            <div className="text-[11px] text-zinc-500">
              WASD / 点击移动 · E 落座 · 滚轮缩放
            </div>
          </div>
        )}

        {/* Mobile Virtual Joystick (Bottom-Left Thumb Zone) */}
        {hasEnteredRoom && isTouchDevice && !isTheaterFocused && (
          <div className="fixed left-4 bottom-20 z-30">
            <MobileJoystick onVectorChange={setJoystickVec} />
          </div>
        )}

        {/* Bottom Floating Interaction Dock */}
        {hasEnteredRoom && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 sm:gap-2 px-2.5 py-2 rounded-2xl bg-white/92 backdrop-blur-md border border-zinc-200 shadow-xl max-w-[96vw] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Disconnect / Reconnect Connection Toggle */}
            <button
              type="button"
              onClick={handleToggleConnection}
              className={`min-h-[44px] px-3 sm:px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                manuallyDisconnected
                  ? 'bg-[#10B981] text-white hover:bg-[#0EA371]'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
              title={manuallyDisconnected ? '重新连接房间' : '断开整个房间连接（停止收发同步）'}
            >
              {manuallyDisconnected ? (
                <RefreshCw className="w-4 h-4" />
              ) : (
                <Power className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {manuallyDisconnected ? '重新连接' : '断开连接'}
              </span>
            </button>

            <div className="w-px h-6 bg-zinc-200 shrink-0" />

            {/* Voice Mic Toggle */}
            <button
              type="button"
              onClick={toggleMic}
              className={`min-h-[44px] px-3 sm:px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isMicOn
                  ? 'bg-[#10B981] text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
              title={isMicOn ? '关闭麦克风' : '开启空间语音麦克风'}
            >
              {isMicOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span className="hidden sm:inline">{isMicOn ? '麦已开' : '开麦'}</span>
            </button>

            {/* Stage Broadcast Toggle */}
            <button
              type="button"
              onClick={toggleBroadcast}
              className={`min-h-[44px] px-3 sm:px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isBroadcasting
                  ? 'bg-[#FF5A36] text-white'
                  : inStageZone
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
              title="切换舞台全员广播"
            >
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">{isBroadcasting ? '广播中' : '广播'}</span>
            </button>

            {/* Emoji & Sticker Reactions */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiMenu((v) => !v)}
                className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                title="发送表情包与互动"
              >
                <Smile className="w-4 h-4" />
                <span className="hidden sm:inline">表情互动</span>
              </button>

              {showEmojiMenu && (
                <div className="absolute bottom-14 left-1/2 -translate-x-1/2 w-64 p-3 rounded-2xl bg-white border border-zinc-200 shadow-2xl grid grid-cols-4 gap-1.5">
                  {activeReactions.map((r) => (
                    <button
                      key={`${r.emoji}-${r.label}`}
                      type="button"
                      onClick={() => sendReaction(r.emoji, r.label)}
                      className="p-2 rounded-xl hover:bg-zinc-100 flex flex-col items-center gap-0.5 transition-transform active:scale-90 cursor-pointer"
                    >
                      <span className="text-xl">{r.emoji}</span>
                      <span className="text-[10px] text-zinc-500 truncate max-w-full">{r.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Chat / Danmaku Toggle */}
            <button
              type="button"
              onClick={() => setShowChatDrawer((v) => !v)}
              className={`min-h-[44px] min-w-[44px] px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                showChatDrawer ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800'
              }`}
              title="文字聊天"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">聊天</span>
            </button>

            {/* Mini Player Toggle（小窗：边逛边看，大屏不受影响） */}
            <button
              type="button"
              onClick={handleToggleMini}
              className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                isMiniPlayer ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800'
              }`}
              title={isMiniPlayer ? '关闭小窗' : '弹出悬浮小窗（切到别的应用也能看）'}
            >
              <PictureInPicture2 className="w-4 h-4" />
              <span className="hidden sm:inline">小窗</span>
            </button>

            {/* Pixel Art Studio */}
            <button
              type="button"
              onClick={() => setShowPixelStudio(true)}
              className={`min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                showPixelStudio ? 'bg-zinc-900 text-white' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800'
              }`}
              title="像素画板：画完挂到墙上"
            >
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">像素画</span>
            </button>

            {/* Mobile/Tablet Quick Feature Buttons (hidden on lg where top nav handles them) */}
            <button
              type="button"
              onClick={() => setShowQueueDrawer(true)}
              className="lg:hidden min-h-[44px] min-w-[44px] px-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 flex items-center justify-center cursor-pointer"
              title="点播片单"
            >
              <ListVideo className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowSceneModal(true)}
              className="lg:hidden min-h-[44px] min-w-[44px] px-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 flex items-center justify-center cursor-pointer"
              title="地图与场景"
            >
              <MapIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowAvatarModal(true)}
              className="lg:hidden min-h-[44px] min-w-[44px] px-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 flex items-center justify-center cursor-pointer"
              title="虚拟化身"
            >
              <UserCog className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowDocsModal(true)}
              className="lg:hidden min-h-[44px] min-w-[44px] px-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 flex items-center justify-center cursor-pointer"
              title="开发文档与插件"
            >
              <BookOpen className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Compact Floating Chat Panel（小窗在右下时，桌面端把面板挪到左边，别压住画面） */}
        {hasEnteredRoom && showChatDrawer && (
          <div
            className={`fixed bottom-20 z-30 w-[calc(100vw-24px)] max-w-xs bg-white/95 backdrop-blur-md rounded-2xl border border-zinc-200 shadow-2xl flex flex-col overflow-hidden ${
              isMiniPlayer ? 'right-3 sm:right-auto sm:left-5' : 'right-3 sm:right-5'
            }`}
          >
            <div className="px-4 py-2.5 border-b border-zinc-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-900">空间聊天室</span>
              <button
                type="button"
                onClick={() => setShowChatDrawer(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="h-56 overflow-y-auto p-3 space-y-2 text-xs">
              {chatHistory.map((m) => (
                <div key={m.id} className={m.isSystem ? 'text-zinc-400 italic' : 'text-zinc-800'}>
                  {!m.isSystem && (
                    <span className="font-semibold text-zinc-900 mr-1.5">{m.playerName}:</span>
                  )}
                  <span>{m.text}</span>
                </div>
              ))}
            </div>
            <form onSubmit={sendChatMessage} className="p-2 border-t border-zinc-200 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  maxLength={300}
                  autoFocus
                  placeholder="发消息…（贴视频链接可直接点播）"
                  className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-[#FF5A36] text-white hover:bg-[#E84B28] cursor-pointer"
                  aria-label="发送"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              {chatEnqueueing ? (
                <div className="px-1 text-[10px] text-[#FF5A36] flex items-center gap-1 leading-tight">
                  <Loader2 className="w-2.5 h-2.5 shrink-0 animate-spin" />
                  <span className="truncate">正在解析链接并点播，请稍候…</span>
                </div>
              ) : chatVideoLink ? (
                <div className="px-1 text-[10px] text-[#FF5A36] flex items-center gap-1 leading-tight">
                  <ListVideo className="w-2.5 h-2.5 shrink-0" />
                  <span className="truncate">
                    检测到视频链接 · 发送后会同时点播
                    {chatVideoLink.titleHint ? `「${chatVideoLink.titleHint}」` : ''}
                  </span>
                </div>
              ) : null}
            </form>
          </div>
        )}

        {/* Toast Notification */}
        {toastMsg && (
          <div className="fixed top-16 right-4 z-50 px-4 py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-medium shadow-lg">
            {toastMsg}
          </div>
        )}
      </main>

      {/* Modals & Drawers */}
      <PixelArtStudio
        open={showPixelStudio}
        onClose={() => setShowPixelStudio(false)}
        onHang={handleHangArt}
      />

      <AiDirectorModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        videoState={videoState}
        onVideoControl={handleVideoControl}
        onSkipNext={handleSkipNext}
        onEnqueueUrl={handleEnqueueUrl}
        showToast={showToast}
      />

      <AvatarEditorModal
        isOpen={showAvatarModal}
        isInitialLobby={!hasEnteredRoom}
        name={playerName}
        avatar={avatar}
        roomId={roomId}
        pluginParts={activeAvatarParts}
        onChangeName={setPlayerName}
        onChangeRoomId={setRoomId}
        onChangeAvatar={setAvatar}
        onSaveAndEnter={handleSaveAvatarAndEnter}
        onClose={() => setShowAvatarModal(false)}
      />

      <VideoQueueDrawer
        isOpen={showQueueDrawer}
        videoState={videoState}
        canSkip={canSkipVideo}
        skipStepSec={skipStepSec}
        autoSkipOutroSec={autoSkipOutroSec}
        history={watchHistory}
        onChangeSkipStepSec={handleChangeSkipStepSec}
        onChangeAutoSkipOutroSec={handleChangeAutoSkipOutroSec}
        onSkipCurrent={handleSkipNext}
        onJumpToItem={handleJumpToItem}
        onClose={() => setShowQueueDrawer(false)}
        onOpenAi={() => {
          setShowQueueDrawer(false);
          setShowAiModal(true);
        }}
        onEnqueueUrl={handleEnqueueUrl}
        onRemoveFromQueue={handleRemoveFromQueue}
        onReplayHistory={(item) => handleEnqueueUrl(item.url, item.title, item)}
        onRemoveHistory={handleRemoveHistory}
        onClearHistory={handleClearHistory}
      />

      <SceneEditorModal
        isOpen={showSceneModal}
        maps={allMaps}
        currentMapId={mapId}
        savedScenes={savedScenes}
        isEditingOnCanvas={isEditingScene}
        selectedBrush={selectedBrush}
        onClose={() => setShowSceneModal(false)}
        onSelectMap={handleSelectMap}
        onToggleCanvasEditMode={setIsEditingScene}
        onSelectBrush={setSelectedBrush}
        onResetFurniture={handleResetFurniture}
        onSaveSceneLocal={handleSaveSceneLocal}
        onLoadLocalScene={handleLoadLocalScene}
        onDeleteLocalScene={handleDeleteLocalScene}
        onOpenPixelStudio={() => setShowPixelStudio(true)}
      />

      <DeveloperDocsModal
        isOpen={showDocsModal}
        plugins={allPlugins}
        onTogglePlugin={(pid) => pluginRegistry.toggle(pid)}
        onClose={() => setShowDocsModal(false)}
      />
    </div>
  );
}
