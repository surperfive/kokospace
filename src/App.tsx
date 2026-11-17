import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
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
} from 'lucide-react';
import {
  AvatarConfig,
  ChatMessage,
  FloatingReaction,
  FurnitureItem,
  FurnitureType,
  MapId,
  PlayerState,
  ScenePreset,
  VideoQueueItem,
  VideoState,
} from './types/metaverse';
import { BUILTIN_MAPS, BUILTIN_VIDEOS, DEFAULT_AVATAR } from './data/maps';
import {
  deleteScenePresetFromCloud,
  listUserScenesFromCloud,
  loadUserProfileFromCloud,
  saveScenePresetToCloud,
  saveUserProfileToCloud,
  signInWithGoogle,
  signOutUser,
  subscribeAuthState,
} from './lib/firebase';
import { pluginRegistry } from './lib/pluginRegistry';
import { SpatialAudioManager } from './lib/spatialAudio';
import { P2PRoom, isP2PEnabled } from './lib/p2pRoom';
import { MetaverseCanvas } from './components/MetaverseCanvas';
import { MobileJoystick } from './components/MobileJoystick';
import { AvatarEditorModal } from './components/AvatarEditorModal';
import { VideoQueueDrawer } from './components/VideoQueueDrawer';
import { SceneEditorModal } from './components/SceneEditorModal';
import { DeveloperDocsModal } from './components/DeveloperDocsModal';

function getInitialRoomId(): string {
  const params = new URLSearchParams(window.location.search);
  const r = params.get('room');
  return r ? r.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'lobby' : 'lobby';
}

export default function App() {
  // Auth & Cloud Profile State
  const [user, setUser] = useState<User | null>(null);
  const [savedScenes, setSavedScenes] = useState<ScenePreset[]>([]);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);

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
  const [videoState, setVideoState] = useState<VideoState>({
    currentItem: BUILTIN_VIDEOS[0],
    isPlaying: true,
    currentTime: 0,
    updatedAtMs: Date.now(),
    queue: BUILTIN_VIDEOS,
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
  const [showQueueDrawer, setShowQueueDrawer] = useState(false);
  const [showSceneModal, setShowSceneModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isEditingScene, setIsEditingScene] = useState(false);
  const [selectedBrush, setSelectedBrush] = useState<FurnitureType | 'erase'>('beanbag_coral');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const p2pRef = useRef<P2PRoom | null>(null);
  const p2pEnabledRef = useRef<boolean>(isP2PEnabled());
  const p2pHostRef = useRef<string | null>(null);
  const audioMgrRef = useRef<SpatialAudioManager | null>(null);
  const playersRef = useRef<PlayerState[]>([]);
  const localIdRef = useRef<string>('');
  playersRef.current = players;
  localIdRef.current = localPlayerId;

  const currentMapTheme = useMemo(() => {
    return allMaps.find((m) => m.id === mapId) || allMaps[0] || BUILTIN_MAPS[0];
  }, [allMaps, mapId]);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  // 业务消息统一出口：P2P 模式下交给房主，否则走云端 WebSocket。
  // 注意语音信令（webrtc:signal）不走这里 —— 它必须走云端的转发通道。
  const sendGame = useCallback((payload: string) => {
    const p2p = p2pRef.current;
    if (p2p) {
      p2p.send(payload);
      return;
    }
    const socket = wsRef.current;
    socket?.send(payload);
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

  // Subscribe to Firebase Auth & hydrate cloud profile + scenes
  useEffect(() => {
    return subscribeAuthState(async (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        try {
          const [profile, scenes] = await Promise.all([
            loadUserProfileFromCloud(nextUser.uid),
            listUserScenesFromCloud(nextUser.uid),
          ]);
          if (profile) {
            setPlayerName(profile.displayName);
            setAvatar(profile.avatar);
            setMapId(profile.preferredMapId);
          } else if (nextUser.displayName) {
            setPlayerName(nextUser.displayName.slice(0, 20));
          }
          setSavedScenes(scenes);
        } catch (err) {
          console.warn('Cloud profile sync failed:', err);
        }
      } else {
        setSavedScenes([]);
      }
    });
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
    return () => {
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
    if (!hasEnteredRoom) return;
    let closedByUser = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;

    // 默认与前端同源（Workers / 本地 Express 都是这种）。
    // 若前端单独托管在别处（如 GitHub Pages），用 VITE_WS_URL 指向 WS 服务端。
    const wsOrigin =
      (import.meta.env.VITE_WS_URL as string | undefined)?.replace(/\/+$/, '') ||
      `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;

    const connect = () => {
      // room 参数让 Cloudflare Durable Object 能把连接路由到对应房间；
      // 本地 Express 服务器的 ws path 匹配会忽略 query，两端都兼容。
      const ws = new WebSocket(`${wsOrigin}/ws?room=${encodeURIComponent(roomId)}`);
      wsRef.current = ws;

      const clientId =
        sessionStorage.getItem('koko_client_id') || `p_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('koko_client_id', clientId);

      const joinPayload = {
        type: 'room:join',
        roomId,
        playerId: clientId,
        uid: user?.uid || null,
        name: playerName,
        avatar,
      };

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

        // ── P2P 模式分流 ────────────────────────────────────────────────
        // 云端 WebSocket 只做三件事：拿 hostId、转发信令、当兜底。
        // 业务消息一律走房主的 DataChannel，收到云端的业务广播要丢弃（那是幽灵状态）。
        if (p2pEnabledRef.current) {
          if (msg.type === 'p2p:signal') {
            void p2pRef.current?.handleSignal(msg.fromId, msg.signal);
            return;
          }
          if (msg.type === 'p2p:host') {
            // 房主刷新后重新认领身份，记下来给后面建链用
            p2pHostRef.current = msg.hostId || null;
            return;
          }
          if (msg.type === 'room:init') {
            // 云端只告诉我们谁是房主；真正的房间状态稍后由房主通过 DataChannel 下发。
            // 房主刷新后云端可能会把 hostId 判给别人，所以本地记一份「我曾经是房主」。
            const hostKey = `koko_p2p_host_${roomId}`;
            const iWasHost = sessionStorage.getItem(hostKey) === msg.playerId;
            const role = msg.hostId === msg.playerId || iWasHost ? 'host' : 'guest';
            if (role === 'host') sessionStorage.setItem(hostKey, msg.playerId);
            if (!p2pRef.current) {
              const room = new P2PRoom({
                roomId,
                selfId: msg.playerId,
                hostId: p2pHostRef.current || msg.hostId || msg.playerId,
                role,
                sendSignal: (targetId, signal) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'p2p:signal', targetId, signal }));
                  }
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
                    showToast(detail || '直连失败，已切回云端房间');
                    p2pRef.current?.close();
                    p2pRef.current = null;
                  } else if (status === 'connected') {
                    showToast('已直连房主，延迟更低');
                  }
                },
              });
              p2pRef.current = room;
              room.start(joinPayload);

              // 房主显式认领身份：刷新后云端可能把 hostId 判给了别人，
              // 这一条让云端把房主改回来，后来的人才知道该连谁。
              if (role === 'host' && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'p2p:host' }));
              }              return; // 等房主下发 room:init
            }
          }
          if (msg.type !== 'webrtc:signal') return; // 其余云端消息在 P2P 模式下忽略
        }

        dispatchMessage(msg);
      };

      function dispatchMessage(msgIn: Record<string, any>) {
        const msg = msgIn;
        switch (msg.type) {
          case 'room:init': {
            setLocalPlayerId(msg.playerId);
            audioMgrRef.current?.setLocalId(msg.playerId);
            setMapId(msg.mapId);
            setPlayers(msg.players || []);
            setFurniture(msg.furniture || []);
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
                expiresAt: Date.now() + 4500,
              });
              return next;
            });
            break;
          }
          case 'video:synced': {
            if (msg.videoState) setVideoState(msg.videoState);
            if (msg.serverTimeMs) {
              setServerTimeOffsetMs(msg.serverTimeMs - Date.now());
            }
            if (msg.triggeredBy && msg.triggeredBy !== playerName) {
              showToast(`${msg.triggeredBy} 同步更新了中央巨幕播放状态`);
            }
            break;
          }
          case 'scene:updated': {
            if (msg.mapId) setMapId(msg.mapId);
            if (Array.isArray(msg.furniture)) setFurniture(msg.furniture);
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

    connect();
    return () => {
      closedByUser = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      p2pRef.current?.close();
      p2pRef.current = null;
      wsRef.current?.close();
    };
  }, [hasEnteredRoom, roomId]);

  // Actions & Handlers
  const handleSaveAvatarAndEnter = async () => {
    const cleanName = playerName.trim() || '旅人';
    setPlayerName(cleanName);
    localStorage.setItem('koko_name', cleanName);
    localStorage.setItem('koko_avatar', JSON.stringify(avatar));

    if (user) {
      setIsSyncingCloud(true);
      try {
        await saveUserProfileToCloud(user.uid, cleanName, mapId, avatar);
        showToast('形象配置已同步至云端');
      } catch {
        showToast('云端同步受限，已保留本地配置');
      } finally {
        setIsSyncingCloud(false);
      }
    }

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

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    sendGame(JSON.stringify({ type: 'player:chat', text }));
    setChatInput('');
  };

  const handleVideoControl = (action: 'play' | 'pause' | 'seek', currentTime?: number) => {
    sendGame(
      JSON.stringify({
        type: 'video:control',
        action,
        currentTime,
      })
    );
  };

  const handleSelectVideo = (item: VideoQueueItem) => {
    sendGame(
      JSON.stringify({
        type: 'video:control',
        action: 'select_item',
        item,
      })
    );
  };

  const handleEnqueueUrl = async (url: string, title: string, playNow: boolean) => {
    sendGame(
      JSON.stringify({
        type: 'video:control',
        action: 'enqueue',
        item: { url, title },
        playNow,
      })
    );
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
      const sittable = ['sofa_coral', 'sofa_slate', 'beanbag_coral', 'beanbag_cream'].includes(
        selectedBrush
      );
      const newItem: FurnitureItem = {
        id: `furn_${Date.now().toString(36)}`,
        type: selectedBrush,
        x: Math.round(worldX),
        y: Math.round(worldY),
        sittable,
        label: sittable ? '自定义座位' : undefined,
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

  const handleResetFurniture = () => {
    const defaults = currentMapTheme.defaultFurniture;
    setFurniture(defaults);
    sendGame(
      JSON.stringify({
        type: 'scene:update',
        furniture: defaults,
      })
    );
  };

  const handleSaveSceneToCloud = async (roomName: string, isPublic: boolean) => {
    if (!user) return;
    const saved = await saveScenePresetToCloud({
      sceneId: `scene_${user.uid.slice(0, 8)}_${Date.now().toString(36)}`,
      ownerUid: user.uid,
      roomName,
      mapId,
      furniture,
      defaultVideoUrl: videoState.currentItem.url,
      isPublic,
    });
    setSavedScenes((prev) => [saved, ...prev]);
    showToast('场景布局已保存至云端');
  };

  const handleLoadCloudScene = (preset: ScenePreset) => {
    setMapId(preset.mapId);
    setFurniture(preset.furniture);
    sendGame(
      JSON.stringify({
        type: 'scene:update',
        mapId: preset.mapId,
        furniture: preset.furniture,
      })
    );
    showToast(`已加载云端场景「${preset.roomName}」`);
  };

  const handleDeleteCloudScene = async (sceneId: string) => {
    await deleteScenePresetFromCloud(sceneId);
    setSavedScenes((prev) => prev.filter((s) => s.sceneId !== sceneId));
    showToast('已删除云端场景');
  };

  const copyInviteLink = () => {
    const url = `${window.location.origin}/?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard?.writeText(url);
    setCopiedLink(true);
    showToast(`已复制房间「${roomId}」邀请链接`);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      showToast('Google 登录成功，已同步云端配置');
    } catch {
      showToast('登录已取消或未完成');
    }
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
            furniture={furniture}
            videoState={videoState}
            serverTimeOffsetMs={serverTimeOffsetMs}
            reactions={reactions}
            chatBubbles={chatBubbles}
            joystickVector={joystickVec}
            isEditingScene={isEditingScene}
            selectedBrush={selectedBrush}
            isTheaterFocused={isTheaterFocused}
            activeWidgets={activeWidgets}
            onMoveLocalPlayer={handleMoveLocalPlayer}
            onPlaceOrRemoveFurniture={handlePlaceOrRemoveFurniture}
            onToggleTheaterFocus={() => setIsTheaterFocused((v) => !v)}
            onOpenQueue={() => setShowQueueDrawer(true)}
            onVideoControl={handleVideoControl}
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
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 sm:gap-2 px-2.5 py-2 rounded-2xl bg-white/92 backdrop-blur-md border border-zinc-200 shadow-xl max-w-[96vw]">
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

        {/* Compact Floating Chat Panel */}
        {hasEnteredRoom && showChatDrawer && (
          <div className="fixed right-3 sm:right-5 bottom-20 z-30 w-[calc(100vw-24px)] max-w-xs bg-white/95 backdrop-blur-md rounded-2xl border border-zinc-200 shadow-2xl flex flex-col overflow-hidden">
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
            <form onSubmit={sendChatMessage} className="p-2 border-t border-zinc-200 flex items-center gap-1.5">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                maxLength={140}
                placeholder="发送气泡消息..."
                className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-[#FF5A36] text-white hover:bg-[#E84B28] cursor-pointer"
                aria-label="发送"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
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
      <AvatarEditorModal
        isOpen={showAvatarModal}
        isInitialLobby={!hasEnteredRoom}
        name={playerName}
        avatar={avatar}
        user={user}
        roomId={roomId}
        isSyncingCloud={isSyncingCloud}
        pluginParts={activeAvatarParts}
        onChangeName={setPlayerName}
        onChangeRoomId={setRoomId}
        onChangeAvatar={setAvatar}
        onSignInGoogle={handleGoogleSignIn}
        onSignOut={() => signOutUser()}
        onSaveAndEnter={handleSaveAvatarAndEnter}
        onClose={() => setShowAvatarModal(false)}
      />

      <VideoQueueDrawer
        isOpen={showQueueDrawer}
        videoState={videoState}
        onClose={() => setShowQueueDrawer(false)}
        onSelectVideo={handleSelectVideo}
        onEnqueueUrl={handleEnqueueUrl}
        onRemoveFromQueue={handleRemoveFromQueue}
      />

      <SceneEditorModal
        isOpen={showSceneModal}
        maps={allMaps}
        currentMapId={mapId}
        user={user}
        savedScenes={savedScenes}
        isEditingOnCanvas={isEditingScene}
        selectedBrush={selectedBrush}
        onClose={() => setShowSceneModal(false)}
        onSelectMap={handleSelectMap}
        onToggleCanvasEditMode={setIsEditingScene}
        onSelectBrush={setSelectedBrush}
        onResetFurniture={handleResetFurniture}
        onSaveSceneToCloud={handleSaveSceneToCloud}
        onLoadCloudScene={handleLoadCloudScene}
        onDeleteCloudScene={handleDeleteCloudScene}
        onSignInGoogle={handleGoogleSignIn}
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
