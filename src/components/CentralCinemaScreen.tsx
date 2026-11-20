import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// 只引类型：hls.js 本体压缩后 600KB+，改成用到时再动态 import（见下方 HLS effect）
import type Hls from 'hls.js';
import { canUseMseHls } from '../lib/mediaSupport';
import {
  Play,
  Pause,
  Maximize2,
  Minimize2,
  ListVideo,
  Volume2,
  VolumeX,
  Radio,
  SkipForward,
  FastForward,
  Loader2,
  AlertTriangle,
  RotateCcw,
  X,
  MessageCircle,
} from 'lucide-react';
import { StageWidgetPlugin, VideoState } from '../types/metaverse';

interface CentralCinemaScreenProps {
  videoState: VideoState;
  serverTimeOffsetMs: number;
  screenWorldRect: { x: number; y: number; width: number; height: number };
  camera: { x: number; y: number; zoom: number };
  viewport: { width: number; height: number };
  accentColor: string;
  frameColor: string;
  isTheaterFocused: boolean;
  onToggleTheaterFocus: () => void;
  /** 小窗模式：巨幕缩成可拖动的浮窗，走动时也能看。与影院聚焦互斥 */
  isMini?: boolean;
  onToggleMini?: () => void;
  /** 小窗镜像：静音起播，且不上报播放进度 / 不处理播完事件（避免和大屏重复触发） */
  silent?: boolean;
  /** 小窗里飘过的聊天气泡（新消息短暂出现后消散） */
  miniChat?: { id: string; name: string; text: string }[];
  /** 小窗左下角「发言」：打开聊天面板 */
  onOpenChat?: () => void;
  onOpenQueue: () => void;
  onVideoControl: (action: 'play' | 'pause' | 'seek', currentTime?: number) => void;
  /** 当前用户是否是点播人：不是就只能看，进度条与播放键禁用 */
  canControlProgress?: boolean;
  /** 是否允许跳过当前影片（点播人或房主） */
  canSkip?: boolean;
  /** 跳过投票：已投人数 / 通过票数 / 自己是否已投（不能直接跳过的人才走这里） */
  skipVoteCount?: number;
  skipVoteThreshold?: number;
  hasVotedSkip?: boolean;
  onVoteSkip?: () => void;
  /** 快进跳过步长（秒） */
  skipStepSec?: number;
  /** 自动跳过片尾（剩余秒数 <= 该值时切下一部，0 表示关闭） */
  autoSkipOutroSec?: number;
  /** 上报真实播放位置（点播人用它当权威时间源） */
  onPlaybackTime?: (time: number) => void;
  /** 当前这一部播完了 */
  onMediaEnded?: () => void;
  /** 队列里当前项之后还有内容 */
  hasNext?: boolean;
  onSkipNext?: () => void;
  activeWidgets: StageWidgetPlugin[];
}

export const CentralCinemaScreen: React.FC<CentralCinemaScreenProps> = ({
  videoState,
  serverTimeOffsetMs,
  screenWorldRect,
  camera,
  viewport,
  accentColor,
  frameColor,
  isTheaterFocused,
  onToggleTheaterFocus,
  isMini = false,
  onToggleMini,
  /** 小窗镜像：静音起播、不参与控片与进度上报 */
  silent = false,
  miniChat = [],
  onOpenChat,
  onOpenQueue,
  onVideoControl,
  canControlProgress = true,
  canSkip = canControlProgress,
  skipVoteCount = 0,
  skipVoteThreshold = 2,
  hasVotedSkip = false,
  onVoteSkip,
  skipStepSec = 30,
  autoSkipOutroSec = 0,
  onPlaybackTime,
  onMediaEnded,
  hasNext = false,
  onSkipNext,
  activeWidgets,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const builtinCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  /** 小窗镜像永远静音起播：声音由房间里的大屏负责，两个播放器同时出声会有回声 */
  const [muted, setMuted] = useState(silent);
  /**
   * 浏览器自动播放策略会拦「带声音的自动播放」。中途进房/新点播时我们会降级成静音起播，
   * 画面照常走但不该让用户以为坏了 —— 用它驱动一个「点一下开声音」的浮层。
   */
  const [autoplayMuted, setAutoplayMuted] = useState(false);
  /** 房间在播、本地却被浏览器拦下：超过几秒仍没动就露出「点一下」兜底 */
  const [localStuck, setLocalStuck] = useState(false);
  const [volume, setVolume] = useState<number>(() => {
    const saved = Number(localStorage.getItem('koko_cinema_volume'));
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.8;
  });
  const [displayTime, setDisplayTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [isLiveStream, setIsLiveStream] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const seekTimerRef = useRef<number | null>(null);
  const displayedSecRef = useRef(-1);
  /** B 站对齐：拖动中的草稿值 / 触发 iframe 重建的计数器 / 上次重建时的对齐秒数 */
  const [biliDraft, setBiliDraft] = useState<number | null>(null);
  const [biliSyncNonce, setBiliSyncNonce] = useState(0);
  const biliAlignedSecRef = useRef(0);

  /** 小窗被拖动到的位置（fixed 坐标）；null = 默认贴右下角 */
  const [miniPos, setMiniPos] = useState<{ x: number; y: number } | null>(null);
  const miniDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const miniBoxRef = useRef<HTMLDivElement | null>(null);

  const item = videoState.currentItem;
  const isHls = item.sourceType === 'hls';
  const isMp4 = item.sourceType === 'mp4';
  const isVideoStream = isMp4 || isHls;
  const isYouTube = item.sourceType === 'youtube';
  const isBilibili = item.sourceType === 'bilibili';

  // 回调放进 ref，避免父组件每次渲染都重建事件监听
  const onPlaybackTimeRef = useRef(onPlaybackTime);
  onPlaybackTimeRef.current = onPlaybackTime;
  const onMediaEndedRef = useRef(onMediaEnded);
  onMediaEndedRef.current = onMediaEnded;
  /** 内置短片是循环动画，用"时间回绕"或到达时长判断跑完一轮 */
  const prevBuiltinTimeRef = useRef<number | null>(null);
  const builtinItemRef = useRef<string>('');
  const endedSentKeyRef = useRef<string | null>(null);
  /** 上次上报「播完了」的时间：服务端没认（各端时钟偏差）时用来重试 */
  const lastEndedSentAtRef = useRef(0);

  /** YouTube IFrame postMessage 状态跟踪 */
  const ytTimeRef = useRef<number | null>(null);
  const ytPlayerStateRef = useRef<number>(-1);
  const ytLastSeekCommandMsRef = useRef<number>(0);
  const ytRemoteSyncMsRef = useRef<number>(0);
  const initialVideoSeekDoneRef = useRef<boolean>(false);
  /** YouTube 是否已尝试过「静音换自动播放」，每部片只试一次，避免反复 mute */
  const ytAutoMuteTriedRef = useRef<boolean>(false);
  const ytAutoMuteTimerRef = useRef<number | null>(null);

  const sendYouTubeCmd = useCallback((func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(
        JSON.stringify({
          event: 'command',
          func,
          args,
        }),
        '*'
      );
    } catch {
      /* ignore */
    }
  }, []);

  const registerYouTubeListeners = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage(JSON.stringify({ event: 'listening', id: item.id }), '*');
      sendYouTubeCmd('addEventListener', ['onStateChange']);
    } catch {
      /* ignore */
    }
  }, [item.id, sendYouTubeCmd]);

  const getExpectedTime = () => {
    if (!videoState.isPlaying) return videoState.currentTime;
    const nowServer = Date.now() + serverTimeOffsetMs;
    const elapsed = Math.max(0, (nowServer - videoState.updatedAtMs) / 1000);
    const total = videoState.currentTime + elapsed;
    const dur =
      (isVideoStream || isYouTube) && mediaDuration > 0
        ? mediaDuration
        : item.durationSec;
    if (dur && dur > 0 && Number.isFinite(dur)) {
      // B 站和 mp4 一样是线性播放，到片尾就停在 dur（用于判断「播完」）；
      // 只有内置待机短片需要取模，让它无限循环
      return isVideoStream || isYouTube || isBilibili ? Math.min(total, dur) : total % dur;
    }
    return total;
  };

  /** 当前真实播放位置：video 元素或 YouTube 汇报，其它用服务端时钟 */
  const currentPlaybackTime = () => {
    const el = videoRef.current;
    if (isVideoStream && el && el.readyState >= 1 && Number.isFinite(el.currentTime)) {
      return el.currentTime;
    }
    if (isYouTube && ytTimeRef.current != null && Number.isFinite(ytTimeRef.current)) {
      return ytTimeRef.current;
    }
    return getExpectedTime();
  };

  // 换片或手动重试时重置状态
  useEffect(() => {
    setMediaDuration(0);
    setIsLiveStream(false);
    setMediaError(null);
    setIsBuffering(isVideoStream);
    setSeekDraft(null);
    displayedSecRef.current = -1;
    ytTimeRef.current = null;
    ytPlayerStateRef.current = -1;
    initialVideoSeekDoneRef.current = false;
    ytAutoMuteTriedRef.current = false;
    if (ytAutoMuteTimerRef.current != null) {
      window.clearTimeout(ytAutoMuteTimerRef.current);
      ytAutoMuteTimerRef.current = null;
    }
    setAutoplayMuted(false);
    setDisplayTime(videoState.currentTime || 0);
    endedSentKeyRef.current = null;
    if (seekTimerRef.current) {
      window.clearTimeout(seekTimerRef.current);
      seekTimerRef.current = null;
    }
    return () => {
      if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, retryNonce]);

  // HLS.js 挂载 / 销毁与错误恢复
  useEffect(() => {
    if (!isHls) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      return;
    }

    const el = videoRef.current;
    if (!el) return;

    let mediaRecoverAttempts = 0;
    let networkRecoverAttempts = 0;
    let disposed = false;

    if (canUseMseHls()) {
      // 动态加载：只有真的要播 m3u8 才拉这 600KB，不拖累首屏
      let hls: Hls | null = null;

      import('hls.js')
        .then(({ default: HlsCtor }) => {
          if (disposed || !videoRef.current) return;

          const instance = new HlsCtor({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
          });
          hls = instance;
          hlsRef.current = instance;

          instance.on(HlsCtor.Events.MANIFEST_PARSED, () => {
            if (disposed) return;
            setMediaError(null);
            if (videoState.isPlaying) {
              el.play().catch(() => {
                el.muted = true;
                setMuted(true);
                setAutoplayMuted(true);
                el.play().catch(() => {});
              });
            }
          });

          instance.on(HlsCtor.Events.LEVEL_UPDATED, (_evt: unknown, data: any) => {
            if (disposed) return;
            if (data?.details) {
              setIsLiveStream(Boolean(data.details.live));
              if (
                !data.details.live &&
                Number.isFinite(data.details.totalduration) &&
                data.details.totalduration > 0
              ) {
                setMediaDuration(data.details.totalduration);
              }
            }
          });

          instance.on(HlsCtor.Events.ERROR, (_evt: unknown, data: any) => {
            if (disposed || !data.fatal) return;
            if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR && networkRecoverAttempts < 1) {
              networkRecoverAttempts += 1;
              instance.startLoad();
              return;
            }
            if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR && mediaRecoverAttempts < 1) {
              mediaRecoverAttempts += 1;
              instance.recoverMediaError();
              return;
            }
            setIsBuffering(false);
            setMediaError(`HLS 播放失败 (${data.details || '网络或跨域受限'})`);
            instance.destroy();
            if (hlsRef.current === instance) hlsRef.current = null;
          });

          instance.loadSource(item.url);
          instance.attachMedia(el);
        })
        .catch(() => {
          if (disposed) return;
          setIsBuffering(false);
          setMediaError('HLS 播放组件加载失败，检查网络后重试');
        });

      return () => {
        disposed = true;
        if (hls) {
          hls.destroy();
          if (hlsRef.current === hls) hlsRef.current = null;
        }
      };
    }

    if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = item.url;
      return () => {
        el.removeAttribute('src');
        el.load();
      };
    }

    setIsBuffering(false);
    setMediaError('当前浏览器不支持 HLS (.m3u8) 流媒体播放');
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHls, item.id, item.url, retryNonce]);

  // 同步音量与静音到 <video>
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !isVideoStream) return;
    el.volume = volume;
    el.muted = muted;
  }, [volume, muted, isVideoStream, item.id, retryNonce]);

  // 点播人上报真实播放位置（mp4 / hls）：seek 中 / 未就绪 / 直播流时不上报
  useEffect(() => {
    if (!isVideoStream) return;
    const el = videoRef.current;
    if (!el) return;
    const report = () => {
      if (isLiveStream || el.seeking || el.readyState < 2) return;
      if (!Number.isFinite(el.currentTime)) return;
      onPlaybackTimeRef.current?.(el.currentTime);
    };
    el.addEventListener('timeupdate', report);
    el.addEventListener('seeked', report);
    report();
    return () => {
      el.removeEventListener('timeupdate', report);
      el.removeEventListener('seeked', report);
    };
  }, [isVideoStream, isLiveStream, item.url, retryNonce]);

  // <video> 播放/暂停同步
  useEffect(() => {
    if (!isVideoStream) return;
    const el = videoRef.current;
    if (!el) return;

    if (videoState.isPlaying && el.paused) {
      el.play().catch(() => {
        el.muted = true;
        setMuted(true);
        setAutoplayMuted(true);
        el.play().catch(() => {});
      });
    } else if (!videoState.isPlaying && !el.paused) {
      el.pause();
    }
  }, [videoState.isPlaying, item.id, item.url, isVideoStream, retryNonce]);

  /**
   * 播放守护：房间在播，本地就必须在播。
   *
   * 只靠 autoPlay 属性和 onCanPlay 会漏：自动播放被浏览器策略拒掉之后，
   * 浏览器会停下缓冲，canplay 可能再也不触发，onCanPlay 里的补播就永远跑不到，
   * 客人看到的就是一张静止画面 —— 只能自己去点。
   * 这里每 700ms 查一次，没在播就补一次；被拒就降级静音再补。
   */
  useEffect(() => {
    if (!isVideoStream || !videoState.isPlaying || mediaError) {
      setLocalStuck(false);
      return;
    }
    let attempts = 0;
    const id = window.setInterval(() => {
      const el = videoRef.current;
      if (!el) return;
      // 已经在播，或已经播完（ended 也满足 paused），守护结束
      if (!el.paused || el.ended) {
        window.clearInterval(id);
        setLocalStuck(false);
        return;
      }
      if (el.readyState < 1) return; // 连元数据都没到，再等等
      attempts += 1;
      if (attempts === 8) setLocalStuck(true); // 约 5.6s 还没动：露出兜底按钮
      if (attempts > 40) {
        window.clearInterval(id);
        return;
      }
      el.play().catch(() => {
        el.muted = true;
        setMuted(true);
        setAutoplayMuted(true);
        el.play().catch(() => {});
      });
    }, 700);
    return () => window.clearInterval(id);
  }, [isVideoStream, videoState.isPlaying, item.id, retryNonce, mediaError]);

  // YouTube IFrame Player API postMessage 监听与双向同步
  useEffect(() => {
    if (!isYouTube) return;

    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== 'https://www.youtube.com' &&
        event.origin !== 'https://www.youtube-nocookie.com'
      ) {
        return;
      }
      let data: Record<string, any>;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!data || typeof data !== 'object') return;

      if (data.event === 'onReady') {
        setIsBuffering(false);
        sendYouTubeCmd('setVolume', [Math.round(volume * 100)]);
        sendYouTubeCmd(muted ? 'mute' : 'unMute');
        if (videoState.isPlaying) {
          sendYouTubeCmd('playVideo');
        } else {
          sendYouTubeCmd('pauseVideo');
        }
      }

      if (data.event === 'infoDelivery' && data.info && typeof data.info === 'object') {
        const info = data.info;
        if (typeof info.duration === 'number' && Number.isFinite(info.duration) && info.duration > 0) {
          setMediaDuration(info.duration);
        }
        if (typeof info.currentTime === 'number' && Number.isFinite(info.currentTime)) {
          ytTimeRef.current = info.currentTime;
          if (canControlProgress) {
            onPlaybackTimeRef.current?.(info.currentTime);
          }
        }
        if (typeof info.playerState === 'number') {
          const prevYtState = ytPlayerStateRef.current;
          ytPlayerStateRef.current = info.playerState;
          if (info.playerState === 3) {
            setIsBuffering(true);
          } else if (info.playerState === 1 || info.playerState === 2 || info.playerState === 5) {
            setIsBuffering(false);
          }
          /**
           * 自动播放被浏览器拦下时，YouTube 会停在「已就绪待播」(5) 不动。
           * 观察 2 秒仍然没走，就静音重试一次 —— 静音播放是策略放行的。
           */
          if (info.playerState === 5 && videoState.isPlaying && !ytAutoMuteTriedRef.current) {
            if (ytAutoMuteTimerRef.current == null) {
              ytAutoMuteTimerRef.current = window.setTimeout(() => {
                ytAutoMuteTimerRef.current = null;
                if (ytPlayerStateRef.current !== 5 || ytAutoMuteTriedRef.current) return;
                ytAutoMuteTriedRef.current = true;
                setMuted(true);
                setAutoplayMuted(true);
                sendYouTubeCmd('mute');
                sendYouTubeCmd('playVideo');
              }, 2000);
            }
          } else if (ytAutoMuteTimerRef.current != null) {
            window.clearTimeout(ytAutoMuteTimerRef.current);
            ytAutoMuteTimerRef.current = null;
          }
          // 控片人在 YouTube 内置按钮点击暂停/继续时，同步到全房间
          if (
            canControlProgress &&
            Date.now() - ytRemoteSyncMsRef.current > 1200 &&
            ((prevYtState === 1 && info.playerState === 2) ||
              (prevYtState === 2 && info.playerState === 1))
          ) {
            const nextAction = info.playerState === 2 ? 'pause' : 'play';
            if (
              (nextAction === 'pause' && videoState.isPlaying) ||
              (nextAction === 'play' && !videoState.isPlaying)
            ) {
              ytRemoteSyncMsRef.current = Date.now();
              onVideoControl(nextAction, ytTimeRef.current ?? getExpectedTime());
            }
          }
          // YouTube 的 ENDED 状态同样不限定控片人：谁看到都能报，服务端校验
          if (info.playerState === 0) {
            const endKey = `${item.id}:${videoState.updatedAtMs}`;
            if (endedSentKeyRef.current !== endKey) {
              endedSentKeyRef.current = endKey;
              onMediaEndedRef.current?.();
            }
          }
        }
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (ytAutoMuteTimerRef.current != null) {
        window.clearTimeout(ytAutoMuteTimerRef.current);
        ytAutoMuteTimerRef.current = null;
      }
    };
  }, [
    isYouTube,
    item.id,
    videoState.isPlaying,
    videoState.updatedAtMs,
    canControlProgress,
    muted,
    volume,
    onVideoControl,
    sendYouTubeCmd,
  ]);

  // YouTube 音量与静音同步
  useEffect(() => {
    if (!isYouTube) return;
    sendYouTubeCmd('setVolume', [Math.round(volume * 100)]);
    sendYouTubeCmd(muted ? 'mute' : 'unMute');
  }, [isYouTube, volume, muted, sendYouTubeCmd]);

  // YouTube 播放状态与进度下行命令
  useEffect(() => {
    if (!isYouTube) return;
    const ytState = ytPlayerStateRef.current;
    if (videoState.isPlaying && ytState !== 1 && ytState !== 3) {
      ytRemoteSyncMsRef.current = Date.now();
      sendYouTubeCmd('playVideo');
    } else if (!videoState.isPlaying && ytState === 1) {
      ytRemoteSyncMsRef.current = Date.now();
      sendYouTubeCmd('pauseVideo');
    }

    const expected = getExpectedTime();
    const cur = ytTimeRef.current;
    if (
      !canControlProgress &&
      cur != null &&
      Math.abs(expected - cur) > 1.5 &&
      Date.now() - ytLastSeekCommandMsRef.current > 800
    ) {
      ytLastSeekCommandMsRef.current = Date.now();
      ytRemoteSyncMsRef.current = Date.now();
      sendYouTubeCmd('seekTo', [expected, true]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYouTube, videoState.isPlaying, videoState.currentTime, videoState.updatedAtMs, canControlProgress, sendYouTubeCmd]);

  // 逐帧：UI 进度 + 非点播人持续追踪权威时间（含缓冲后的追赶）
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = videoRef.current;
      const serverTime = getExpectedTime();

      if (isVideoStream && !isLiveStream && el && !canControlProgress && !el.seeking) {
        if (!videoState.isPlaying) {
          if (el.readyState >= 1 && Math.abs(serverTime - el.currentTime) > 0.3) {
            try {
              el.currentTime = serverTime;
            } catch {
              /* ignore */
            }
          }
          if (el.playbackRate !== 1) el.playbackRate = 1;
        } else if (el.readyState >= 2) {
          const drift = serverTime - el.currentTime;
          const abs = Math.abs(drift);
          if (abs > 0.3) {
            try {
              el.currentTime = serverTime;
            } catch {
              /* ignore */
            }
            if (el.playbackRate !== 1) el.playbackRate = 1;
          } else if (abs > 0.06) {
            el.playbackRate = 1 + Math.max(-0.1, Math.min(0.1, drift * 0.6));
          } else if (el.playbackRate !== 1) {
            el.playbackRate = 1;
          }
        }
      } else if (isVideoStream && el && el.playbackRate !== 1) {
        el.playbackRate = 1;
      }

      if (
        isYouTube &&
        !canControlProgress &&
        ytTimeRef.current != null &&
        Date.now() - ytLastSeekCommandMsRef.current > 2500 &&
        Math.abs(serverTime - ytTimeRef.current) > 2.2
      ) {
        ytLastSeekCommandMsRef.current = Date.now();
        sendYouTubeCmd('seekTo', [serverTime, true]);
      }

      const t =
        isVideoStream && el && el.readyState >= 1 && Number.isFinite(el.currentTime)
          ? el.currentTime
          : isYouTube && ytTimeRef.current != null && Number.isFinite(ytTimeRef.current)
            ? ytTimeRef.current
            : serverTime;

      const sec = Math.floor(t);
      if (sec !== displayedSecRef.current) {
        displayedSecRef.current = sec;
        setDisplayTime(t);
      }

      if (item.sourceType === 'builtin' && builtinCanvasRef.current) {
        const canvas = builtinCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawBuiltinVectorFilm(ctx, canvas.width, canvas.height, serverTime, item.builtinMode || 'cosmos');
        }
      }

      const activeDur =
        (isVideoStream || isYouTube) && mediaDuration > 0 && Number.isFinite(mediaDuration)
          ? mediaDuration
          : item.durationSec || 0;
      if (
        !isLiveStream &&
        autoSkipOutroSec > 0 &&
        canControlProgress &&
        videoState.isPlaying &&
        hasNext &&
        activeDur > autoSkipOutroSec + 5 &&
        t >= activeDur - autoSkipOutroSec
      ) {
        const endKey = `${item.id}:${videoState.updatedAtMs}`;
        if (endedSentKeyRef.current !== endKey) {
          endedSentKeyRef.current = endKey;
          onMediaEndedRef.current?.();
        }
      }

      // B 站播放器没有 ended 事件：用房间时钟 + 已知时长判断播完，自动推进下一部。
      // 时长来自 /api/parse-video 或浏览器 JSONP；拿不到时长就退化成「播完停住」。
      //
      // 这里**不限定控片人**：控片人切后台时 rAF 会被浏览器暂停，他本人也可能已经
      // 退出房间，只让他一个人上报会让整屋人永远停在片尾。现在任何人在前台看着
      // 都能上报，服务端按「已播到 90%」校验 + expectedItemId 去重。
      // 4 秒节流是为了服务端拒绝时（时钟偏差）还能重试，而不是发一次就死心。
      if (
        isBilibili &&
        !isLiveStream &&
        videoState.isPlaying &&
        activeDur > 5 &&
        t >= activeDur
      ) {
        const endKey = `${item.id}:${videoState.updatedAtMs}`;
        const nowMs = Date.now();
        const retryDue = nowMs - lastEndedSentAtRef.current > 4000;
        if (endedSentKeyRef.current !== endKey || retryDue) {
          endedSentKeyRef.current = endKey;
          lastEndedSentAtRef.current = nowMs;
          onMediaEndedRef.current?.();
        }
      }

      if (item.sourceType === 'builtin' && canControlProgress) {
        if (builtinItemRef.current !== item.id) {
          builtinItemRef.current = item.id;
          prevBuiltinTimeRef.current = null;
        }
        const dur = item.durationSec || 180;
        const prev = prevBuiltinTimeRef.current;
        const rawElapsed = videoState.isPlaying
          ? Math.max(0, (Date.now() + serverTimeOffsetMs - videoState.updatedAtMs) / 1000)
          : 0;
        const rawTotal = videoState.currentTime + rawElapsed;
        const wrappedAtEnd = prev != null && dur > 5 && prev > dur - 2 && serverTime < 2;
        const reachedEnd = videoState.isPlaying && dur > 5 && rawTotal >= dur;
        if (wrappedAtEnd || reachedEnd) {
          const endKey = `${item.id}:${videoState.updatedAtMs}`;
          if (endedSentKeyRef.current !== endKey) {
            endedSentKeyRef.current = endKey;
            onMediaEndedRef.current?.();
          }
        }
        prevBuiltinTimeRef.current = serverTime;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    videoState,
    serverTimeOffsetMs,
    item.id,
    item.sourceType,
    item.builtinMode,
    item.durationSec,
    isVideoStream,
    isYouTube,
    isLiveStream,
    canControlProgress,
    mediaDuration,
    autoSkipOutroSec,
    hasNext,
    sendYouTubeCmd,
  ]);

  const formatSec = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  // Convert world rect to screen rect unless Theater Focus mode is enabled
  const screenLeft = viewport.width / 2 + (screenWorldRect.x - camera.x) * camera.zoom;
  const screenTop = viewport.height / 2 + (screenWorldRect.y - camera.y) * camera.zoom;
  const screenW = screenWorldRect.width * camera.zoom;
  const screenH = screenWorldRect.height * camera.zoom;

  // 聚焦模式按 16:9 推尺寸。
  // 原来是固定 min(94vw,960px) × min(58vh,540px)：竖屏手机上变成 367×489 的竖条，
  // 16:9 的视频缩在里面只有 206px 高，上下两百多像素全是黑边。
  // 现在用宽度推高度（视频区 16:9 + 标题栏/控制条约 72px），再用视口高度兜底。
  const focusWidth = Math.min(viewport.width * 0.94, 1100);
  const focusHeight = Math.min(
    focusWidth * (9 / 16) + 72,
    Math.max(240, viewport.height * 0.82)
  );

  /** 小窗尺寸：按视口推，竖屏手机上也不会盖住半个屏幕 */
  const miniWidth = Math.round(Math.min(viewport.width * 0.62, 320));
  const miniHeight = Math.round(miniWidth * (9 / 16)) + 34;

  /** 拖/转屏之后把窗口拉回视口内；上边界留出顶部导航（56px），否则会被压在导航栏下面 */
  const clampMiniPos = (x: number, y: number) => {
    const w = miniBoxRef.current?.offsetWidth ?? miniWidth;
    const h = miniBoxRef.current?.offsetHeight ?? miniHeight;
    return {
      x: Math.max(6, Math.min(Math.max(6, viewport.width - w - 6), x)),
      y: Math.max(62, Math.min(Math.max(62, viewport.height - h - 6), y)),
    };
  };

  useEffect(() => {
    if (!isMini || !miniPos) return;
    const next = clampMiniPos(miniPos.x, miniPos.y);
    if (next.x !== miniPos.x || next.y !== miniPos.y) setMiniPos(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMini, viewport.width, viewport.height]);

  // 拖动用 Pointer Events：鼠标和手指走同一套，不用分别写 touch/mouse
  const handleMiniPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMini) return;
    // 顶栏上的按钮不参与拖动
    if ((e.target as HTMLElement).closest('button')) return;
    const box = miniBoxRef.current?.getBoundingClientRect();
    if (!box) return;
    miniDragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: box.left,
      originY: box.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleMiniPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = miniDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setMiniPos(
      clampMiniPos(
        drag.originX + (e.clientX - drag.startX),
        drag.originY + (e.clientY - drag.startY)
      )
    );
  };

  const endMiniDrag = () => {
    miniDragRef.current = null;
  };

  const containerStyle: React.CSSProperties = isMini
    ? {
        position: 'fixed',
        left: miniPos ? `${miniPos.x}px` : undefined,
        top: miniPos ? `${miniPos.y}px` : undefined,
        right: miniPos ? undefined : '10px',
        bottom: miniPos ? undefined : '92px',
        width: `${miniWidth}px`,
        height: `${miniHeight}px`,
        zIndex: 25,
      }
    : isTheaterFocused
    ? {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: `${Math.round(focusWidth)}px`,
        height: `${Math.round(focusHeight)}px`,
        zIndex: 45,
      }
    : {
        position: 'absolute',
        left: `${screenLeft}px`,
        top: `${screenTop}px`,
        width: `${screenW}px`,
        height: `${screenH}px`,
        zIndex: 12,
      };

  const duration =
    (isVideoStream || isYouTube) && mediaDuration > 0 && Number.isFinite(mediaDuration)
      ? Math.floor(mediaDuration)
      : item.durationSec || 180;

  /** B 站滑块范围：拿不到时长时给 1 小时兜底，避免拖不动 */
  const biliRangeMax = Math.max(60, item.durationSec && item.durationSec > 0 ? item.durationSec : 3600);

  /** B 站「对齐所有人」：把目标时间写进房间状态，所有人的 iframe 按 ?t= 重建 */
  const alignBilibili = () => {
    if (!canControlProgress) return;
    const target = Math.max(0, Math.min(biliRangeMax - 1, biliDraft ?? displayTime));
    setBiliDraft(null);
    onVideoControl('seek', target);
  };

  // iframe 起播点锁定，避免重新渲染重加载 iframe；YouTube 追加 origin 激活 postMessage
  // B 站没有 JS API，只能靠 biliSyncNonce 主动重建 iframe 来「对齐」到目标时间点
  const iframeStartRef = useRef(0);
  const iframeSrc = useMemo(() => {
    if (item.sourceType !== 'youtube' && item.sourceType !== 'bilibili') return item.url;
    const start = Math.floor(getExpectedTime());
    iframeStartRef.current = start;
    if (item.sourceType === 'bilibili') biliAlignedSecRef.current = start;
    try {
      const u = new URL(item.url);
      if (item.sourceType === 'youtube') {
        u.searchParams.set('enablejsapi', '1');
        u.searchParams.set('origin', window.location.origin);
        u.searchParams.set('autoplay', videoState.isPlaying ? '1' : '0');
        // 小窗镜像必须静音起播，不然和大屏的 YouTube 一起出声
        if (silent) u.searchParams.set('mute', '1');
        if (start >= 3) u.searchParams.set('start', String(start));
      } else {
        // B 站播放器是黑盒：只能通过 URL 的 t 参数决定起播点
        if (start >= 1) u.searchParams.set('t', String(start));
        u.searchParams.set('autoplay', videoState.isPlaying ? '1' : '0');
      }
      return u.toString();
    } catch {
      return item.url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.url, item.sourceType, retryNonce, biliSyncNonce]);

  /**
   * B 站对齐：房间里有人 seek 后，videoState.currentTime 会跳到新位置。
   * 因为 iframe 内部时间读不到也控制不了，唯一的手段是把 iframe 按新时间点重建。
   * 差值小于 2 秒不重建 —— 避免暂停/恢复这种小抖动也触发整段重载。
   */
  useEffect(() => {
    if (!isBilibili) return;
    const target = videoState.currentTime;
    if (!Number.isFinite(target) || target < 0) return;
    if (Math.abs(target - biliAlignedSecRef.current) > 2) {
      setBiliSyncNonce((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBilibili, videoState.currentTime, videoState.updatedAtMs]);

  /** 换片时清掉 B 站对齐草稿 */
  useEffect(() => {
    setBiliDraft(null);
    biliAlignedSecRef.current = 0;
  }, [item.id]);

  /** 点浮层开声音：这是一次真实用户手势，浏览器会放行带声音播放 */
  const handleUnmuteClick = () => {
    const nextVol = volume > 0 ? volume : 0.8;
    setMuted(false);
    setAutoplayMuted(false);
    const el = videoRef.current;
    if (el) {
      el.muted = false;
      el.volume = nextVol;
      if (videoState.isPlaying && el.paused) el.play().catch(() => {});
    }
    if (isYouTube) {
      sendYouTubeCmd('setVolume', [Math.round(nextVol * 100)]);
      sendYouTubeCmd('unMute');
      if (videoState.isPlaying) sendYouTubeCmd('playVideo');
    }
  };

  const showBottomControls =
    item.sourceType === 'builtin' || isVideoStream || isYouTube;

  return (
    <>
      {isTheaterFocused && (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/65 backdrop-blur-sm transition-opacity"
          onClick={onToggleTheaterFocus}
        />
      )}
      <div
        ref={miniBoxRef}
        style={{
          ...containerStyle,
          backgroundColor: frameColor,
        }}
        className={`group overflow-hidden flex flex-col select-none ${
          isMini
            ? 'rounded-xl border-2 border-zinc-900 shadow-xl'
            : 'rounded-2xl border-4 border-zinc-900 shadow-2xl transition-[box-shadow] duration-200'
        } ${isTheaterFocused ? 'ring-4 ring-white/20' : ''}`}
      >
        {/* Top Screen Header Strip（小窗模式下整条就是拖动把手） */}
        <div
          onPointerDown={isMini ? handleMiniPointerDown : undefined}
          onPointerMove={isMini ? handleMiniPointerMove : undefined}
          onPointerUp={isMini ? endMiniDrag : undefined}
          onPointerCancel={isMini ? endMiniDrag : undefined}
          style={isMini ? { touchAction: 'none', cursor: 'grab' } : undefined}
          className={`flex items-center justify-between gap-2 bg-zinc-900/95 text-white text-xs shrink-0 border-b border-white/10 ${
            isMini ? 'px-2 py-1' : 'px-3 py-1.5'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
            <span className="font-medium truncate" title={item.title}>
              {item.title}
            </span>
            {isLiveStream && (
              <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold tracking-wider flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
            )}
            {!isMini && <span className="text-zinc-400 hidden sm:inline">·</span>}
            {!isMini && (
              <span className="text-zinc-400 truncate hidden sm:inline">
                控片: {videoState.controllerName || item.addedBy}
              </span>
            )}
            {!canControlProgress && !isMini && (
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-zinc-300 shrink-0">
                只看
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isMini &&
              activeWidgets.map((w) => (
                <span
                  key={w.id}
                  className="px-2 py-0.5 rounded bg-white/10 text-[11px] font-mono tabular-nums text-amber-300 hidden md:inline"
                >
                  {w.renderBadgeText()}
                </span>
              ))}
            {!isMini && (
              <button
                type="button"
                onClick={onOpenQueue}
                className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                title="打开点播片单"
              >
                <ListVideo className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">点播单</span>
              </button>
            )}
            {canSkip ? (
              (hasNext || !videoState.isPlaceholder) && (
                <button
                  type="button"
                  onClick={() => onSkipNext?.()}
                  className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                  title={hasNext ? '跳过当前，播放下一部' : '跳过当前点播视频'}
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">跳过</span>
                </button>
              )
            ) : (
              // 不是房主/控片人：只能投票，满 2 票服务端直接切下一部
              <button
                type="button"
                onClick={() => onVoteSkip?.()}
                className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer tabular-nums ${
                  hasVotedSkip
                    ? 'bg-amber-400 text-zinc-900 hover:bg-amber-300'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                title={
                  hasVotedSkip
                    ? `你已投票（${skipVoteCount}/${skipVoteThreshold}），再点一次撤销`
                    : `投票跳过当前影片，满 ${skipVoteThreshold} 票自动切下一部（当前 ${skipVoteCount}/${skipVoteThreshold}）`
                }
              >
                <SkipForward className="w-3.5 h-3.5" />
                <span>{hasVotedSkip ? '已投' : '投票'}</span>
                {skipVoteCount > 0 && (
                  <span className="text-[10px] opacity-75">
                    {skipVoteCount}/{skipVoteThreshold}
                  </span>
                )}
              </button>
            )}
            {isMini ? (
              <>
                <button
                  type="button"
                  onClick={onToggleTheaterFocus}
                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="放大为影院视图"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleMini?.()}
                  className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                  title="收起小窗，回到房间里的巨幕"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onToggleTheaterFocus}
                className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title={isTheaterFocused ? '返回 2D 空间视图' : '影院放大聚焦'}
              >
                {isTheaterFocused ? (
                  <Minimize2 className="w-3.5 h-3.5" />
                ) : (
                  <Maximize2 className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Media Viewport */}
        <div className="relative flex-1 bg-zinc-950 overflow-hidden">
          {item.sourceType === 'builtin' && (
            <canvas
              ref={builtinCanvasRef}
              width={640}
              height={320}
              className="w-full h-full object-cover block"
            />
          )}

          {isVideoStream && (
            <video
              key={`${item.id}-${retryNonce}`}
              ref={videoRef}
              src={isMp4 ? item.url : undefined}
              autoPlay={videoState.isPlaying}
              muted={muted}
              playsInline
              onLoadStart={() => {
                setIsBuffering(true);
                setMediaError(null);
              }}
              onWaiting={() => setIsBuffering(true)}
              onLoadedMetadata={(e) => {
                const el = e.currentTarget;
                const d = el.duration;
                if (d === Infinity || !Number.isFinite(d)) {
                  setIsLiveStream(true);
                } else if (d > 0) {
                  setIsLiveStream(false);
                  setMediaDuration(d);
                  if (!initialVideoSeekDoneRef.current) {
                    initialVideoSeekDoneRef.current = true;
                    const expected = getExpectedTime();
                    /**
                     * 中途进房（房间已经播了一段）：带声音的自动播放几乎必被浏览器拦，
                     * 被拦之后还要多走一次「拒绝 → 降级静音 → 重播」，画面会先停一下。
                     * 干脆一开始就静音起播，保证零点击就有画面；声音交给左下角浮层一键恢复。
                     */
                    if (expected > 3 && videoState.isPlaying) {
                      el.muted = true;
                      setMuted(true);
                      setAutoplayMuted(true);
                    }
                    if (expected > 1.5 && el.currentTime < 1) {
                      try {
                        el.currentTime = Math.min(expected, Math.max(0, d - 0.5));
                      } catch {
                        /* ignore */
                      }
                    }
                  }
                }
              }}
              onDurationChange={(e) => {
                const d = e.currentTarget.duration;
                if (d === Infinity || !Number.isFinite(d)) {
                  setIsLiveStream(true);
                } else if (d > 0) {
                  setIsLiveStream(false);
                  setMediaDuration(d);
                }
              }}
              onCanPlay={(e) => {
                setIsBuffering(false);
                setMediaError(null);
                const el = e.currentTarget;
                el.volume = volume;
                if (videoState.isPlaying && el.paused) {
                  el.play().catch(() => {
                    el.muted = true;
                    setMuted(true);
                    setAutoplayMuted(true);
                    el.play().catch(() => {});
                  });
                }
              }}
              onPlaying={() => {
                setIsBuffering(false);
                setMediaError(null);
                setLocalStuck(false);
              }}
              onError={() => {
                if (isMp4 || !canUseMseHls()) {
                  setIsBuffering(false);
                  setMediaError('视频加载失败，链接可能已失效或存在防盗链限制');
                }
              }}
              onEnded={() => {
                // 不限定控片人：浏览器保证这个事件只在真正播完时触发，
                // 控片人切后台/退房时别人也能把片子推走
                if (isLiveStream) return;
                const endKey = `${item.id}:${videoState.updatedAtMs}`;
                if (endedSentKeyRef.current === endKey) return;
                endedSentKeyRef.current = endKey;
                onMediaEndedRef.current?.();
              }}
              className="w-full h-full object-contain bg-black"
            />
          )}

          {(isYouTube || item.sourceType === 'bilibili') && !(silent && item.sourceType === 'bilibili') && (
            <iframe
              key={`${item.id}-${iframeSrc}-${retryNonce}`}
              ref={isYouTube ? iframeRef : undefined}
              src={iframeSrc}
              title={item.title}
              onLoad={() => {
                if (isYouTube) {
                  registerYouTubeListeners();
                  window.setTimeout(registerYouTubeListeners, 500);
                }
              }}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}

          {/*
           * B 站播放器是黑盒，没法静音也没法被脚本控制：两个 iframe 同时播会双重出声。
           * 所以小窗里对 B 站只放封面，声音和画面都留在房间的大屏上。
           */}
          {silent && item.sourceType === 'bilibili' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-zinc-950 text-center px-3">
              {item.thumbnail && (
                <img
                  src={item.thumbnail}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover opacity-25"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="relative text-[11px] font-medium text-white/90">B 站视频在小窗不可用</div>
              <div className="relative text-[10px] leading-tight text-white/60">
                播放器无法静音，两个窗口会双重出声
              </div>
            </div>
          )}

          {/* 自动播放被浏览器拦下后已静音起播：给一个一次点击就能开声音的入口 */}
          {(isVideoStream || isYouTube) && autoplayMuted && !silent && !mediaError && !localStuck && (
            <button
              type="button"
              onClick={handleUnmuteClick}
              className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 text-[11px] font-medium text-white ring-1 ring-white/20 backdrop-blur transition-colors hover:bg-black/90 cursor-pointer"
              title="浏览器默认拦截带声音的自动播放，点一下即可开启声音"
            >
              <VolumeX className="w-3.5 h-3.5 shrink-0" />
              已静音自动播放 · 点这里开声音
            </button>
          )}

          {/* Buffering Spinner (non-blocking) */}
          {isBuffering && !mediaError && videoState.isPlaying && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
              <div className="px-3 py-1.5 rounded-full bg-zinc-900/85 text-white text-xs flex items-center gap-1.5 shadow-lg">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5A36]" />
                <span>缓冲中…</span>
              </div>
            </div>
          )}

          {/* Broken-link / Error Recovery Overlay（小窗里只留一行 + 图标按钮，塞不下文案） */}
          {mediaError && isMini && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-zinc-950/92 text-white text-center px-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <div className="text-[10px] font-medium">无法播放当前影片</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMediaError(null);
                    setRetryNonce((n) => n + 1);
                  }}
                  className="px-1.5 py-0.5 rounded bg-white/15 hover:bg-white/25 text-[10px] flex items-center gap-1 cursor-pointer"
                  title="重试加载"
                >
                  <RotateCcw className="w-3 h-3" />
                  重试
                </button>
                <button
                  type="button"
                  onClick={() => (canSkip ? onSkipNext?.() : onVoteSkip?.())}
                  className="px-1.5 py-0.5 rounded bg-[#FF5A36] text-white text-[10px] flex items-center gap-1 cursor-pointer"
                  title={canSkip ? '跳过此片' : `投票跳过 ${skipVoteCount}/${skipVoteThreshold}`}
                >
                  <SkipForward className="w-3 h-3" />
                  {canSkip ? '跳过' : `投票 ${skipVoteCount}/${skipVoteThreshold}`}
                </button>
              </div>
            </div>
          )}

          {mediaError && !isMini && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-4 bg-zinc-950/90 text-white text-center">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
              <div className="space-y-1 max-w-xs">
                <div className="text-xs font-semibold">无法播放当前影片</div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">{mediaError}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMediaError(null);
                    setRetryNonce((n) => n + 1);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>重试加载</span>
                </button>
                {canSkip ? (
                  onSkipNext && (
                    <button
                      type="button"
                      onClick={onSkipNext}
                      className="px-3 py-1.5 rounded-lg bg-[#FF5A36] hover:bg-[#E84B28] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      <span>跳过此片</span>
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => onVoteSkip?.()}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer tabular-nums ${
                      hasVotedSkip
                        ? 'bg-amber-400 text-zinc-900 hover:bg-amber-300'
                        : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                    title={`投票跳过，满 ${skipVoteThreshold} 票自动切下一部`}
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>{hasVotedSkip ? '已投' : '投票跳过'}</span>
                    <span className="opacity-70">
                      {skipVoteCount}/{skipVoteThreshold}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 房间在播、本地却被浏览器拦死：给一个只需点一下的兜底（不动房间状态） */}
          {videoState.isPlaying && localStuck && !mediaError && isVideoStream && (
            <button
              type="button"
              onClick={() => {
                const el = videoRef.current;
                if (!el) return;
                setLocalStuck(false);
                el.play().catch(() => {
                  el.muted = true;
                  setMuted(true);
                  setAutoplayMuted(true);
                  el.play().catch(() => {});
                });
              }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/45 cursor-pointer"
              title="浏览器拦下了自动播放，点一下继续"
            >
              <div className="w-14 h-14 rounded-full bg-white/95 text-zinc-900 flex items-center justify-center shadow-lg">
                <Play className="w-6 h-6 ml-0.5 fill-current" />
              </div>
              <span className="text-[11px] text-white/85">浏览器拦下了自动播放，点一下继续</span>
            </button>
          )}

          {/* Paused Overlay */}
          {!videoState.isPlaying && !mediaError && (item.sourceType === 'builtin' || isVideoStream) && (
            <button
              type="button"
              onClick={() => canControlProgress && onVideoControl('play', currentPlaybackTime())}
              disabled={!canControlProgress}
              title={canControlProgress ? '继续播放' : `由「${videoState.controllerName || '点播人'}」控片，你只能观看`}
              className={`absolute inset-0 flex items-center justify-center bg-black/35 transition-colors ${
                canControlProgress ? 'hover:bg-black/45 cursor-pointer' : 'cursor-not-allowed'
              }`}
            >
              <div
                className={`${
                  isMini ? 'w-9 h-9' : 'w-14 h-14'
                } rounded-full bg-white/95 text-zinc-900 flex items-center justify-center shadow-lg`}
              >
                <Play className={`${isMini ? 'w-4 h-4' : 'w-6 h-6'} ml-0.5 fill-current`} />
              </div>
            </button>
          )}

          {/* 小窗专属：左下角快捷操作 + 右下角飘过的聊天气泡 */}
          {isMini && (
            <>
              <div className="absolute left-1.5 bottom-1.5 z-20 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenQueue}
                  className="w-7 h-7 rounded-md bg-black/20 hover:bg-black/45 active:bg-black/60 text-white/90 flex items-center justify-center backdrop-blur-md ring-1 ring-white/20 cursor-pointer transition-colors"
                  title="点播：打开片单"
                  aria-label="点播：打开片单"
                >
                  <ListVideo className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onOpenChat?.()}
                  className="w-7 h-7 rounded-md bg-black/20 hover:bg-black/45 active:bg-black/60 text-white/90 flex items-center justify-center backdrop-blur-md ring-1 ring-white/20 cursor-pointer transition-colors"
                  title="发言 / 看聊天记录"
                  aria-label="发言 / 看聊天记录"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* 容器底边固定，新消息贴着底部出现、旧消息在上方消散，移除时不会把下面的顶走 */}
              <div className="absolute right-1.5 bottom-1.5 z-20 flex flex-col items-end gap-1 max-w-[64%] pointer-events-none">
                {miniChat.map((m) => (
                  <div
                    key={m.id}
                    className="animate-mini-chat max-w-full line-clamp-2 rounded-lg rounded-br-[3px] bg-black/70 px-2 py-1 text-[10px] leading-snug text-white shadow-lg backdrop-blur-sm"
                  >
                    <span className="mr-1 font-medium" style={{ color: accentColor }}>
                      {m.name}
                    </span>
                    <span className="break-words">{m.text}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bottom Synchronized Controls（小窗太窄，藏起来，只留顶栏） */}
        {showBottomControls && !isMini && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900/95 text-white text-xs shrink-0 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                if (!canControlProgress) return;
                const nextAction = videoState.isPlaying ? 'pause' : 'play';
                if (isYouTube) {
                  sendYouTubeCmd(nextAction === 'play' ? 'playVideo' : 'pauseVideo');
                }
                onVideoControl(nextAction, currentPlaybackTime());
              }}
              disabled={!canControlProgress}
              className={`p-1 rounded transition-colors ${
                canControlProgress ? 'hover:bg-white/15 cursor-pointer' : 'opacity-40 cursor-not-allowed'
              }`}
              aria-label={videoState.isPlaying ? '暂停同步播放' : '开始同步播放'}
            >
              {videoState.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>

            {isLiveStream ? (
              <div className="flex-1 flex items-center gap-2 text-[11px] text-zinc-300">
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-600/90 text-white text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
                <span className="text-zinc-400 truncate">正在同步观看实时流</span>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (!canControlProgress) return;
                    const nextT = Math.min(Math.max(0, duration - 1), currentPlaybackTime() + skipStepSec);
                    const el = videoRef.current;
                    if (isVideoStream && el) {
                      try {
                        el.currentTime = nextT;
                      } catch {
                        /* ignore */
                      }
                    } else if (isYouTube) {
                      ytLastSeekCommandMsRef.current = Date.now();
                      ytTimeRef.current = nextT;
                      sendYouTubeCmd('seekTo', [nextT, true]);
                    }
                    onVideoControl('seek', nextT);
                  }}
                  disabled={!canControlProgress}
                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums flex items-center gap-0.5 transition-colors shrink-0 ${
                    canControlProgress ? 'hover:bg-white/15 cursor-pointer' : 'opacity-40 cursor-not-allowed'
                  }`}
                  title={
                    canControlProgress
                      ? `快进跳过 ${skipStepSec} 秒（可在点播单中调整跳过选项）`
                      : `由「${videoState.controllerName || '点播人'}」控片`
                  }
                >
                  <FastForward className="w-3 h-3" />
                  <span>+{skipStepSec}s</span>
                </button>

                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={1}
                  value={seekDraft ?? Math.min(duration, Math.floor(displayTime))}
                  onChange={(e) => {
                    if (!canControlProgress) return;
                    const v = Number(e.target.value);
                    setSeekDraft(v);
                    if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
                    seekTimerRef.current = window.setTimeout(() => {
                      seekTimerRef.current = null;
                      const el = videoRef.current;
                      if (isVideoStream && el) {
                        try {
                          el.currentTime = v;
                        } catch {
                          /* ignore */
                        }
                      } else if (isYouTube) {
                        ytLastSeekCommandMsRef.current = Date.now();
                        ytTimeRef.current = v;
                        sendYouTubeCmd('seekTo', [v, true]);
                      }
                      onVideoControl('seek', v);
                      setSeekDraft(null);
                    }, 200);
                  }}
                  disabled={!canControlProgress}
                  className={`flex-1 min-w-[60px] h-1.5 accent-[#FF5A36] ${
                    canControlProgress ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
                  }`}
                />

                <span className="font-mono tabular-nums text-[11px] text-zinc-300 shrink-0">
                  {formatSec(displayTime)} / {formatSec(duration)}
                </span>
              </>
            )}

            {(isVideoStream || isYouTube) && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    setAutoplayMuted(false);
                    const el = videoRef.current;
                    if (el) {
                      el.muted = next;
                      if (!next) el.volume = volume > 0 ? volume : 0.8;
                    }
                  }}
                  className="p-1 rounded hover:bg-white/15 transition-colors cursor-pointer"
                  title={muted ? '取消静音' : '静音画面'}
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const nextVol = Number(e.target.value);
                    setVolume(nextVol);
                    localStorage.setItem('koko_cinema_volume', String(nextVol));
                    if (nextVol > 0 && muted) {
                      setMuted(false);
                      setAutoplayMuted(false);
                      const el = videoRef.current;
                      if (el) el.muted = false;
                    }
                  }}
                  className="w-12 sm:w-16 h-1 accent-[#FF5A36] cursor-pointer hidden sm:block"
                  aria-label="影院音量"
                  title={`影院音量 ${Math.round((muted ? 0 : volume) * 100)}%`}
                />
              </div>
            )}
          </div>
        )}

        {/* B 站专用对齐条：播放器是黑盒，只能靠重建 iframe 对齐起播点 */}
        {isBilibili && (
          <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900/95 text-white text-xs shrink-0 border-t border-white/10">
            <span className="text-[10px] px-1 py-0.5 rounded bg-[#FB7299]/25 text-[#FB7299] font-bold shrink-0 leading-none">
              B站
            </span>
            <input
              type="range"
              min={0}
              max={biliRangeMax}
              step={1}
              value={biliDraft ?? Math.min(biliRangeMax, Math.floor(displayTime))}
              onChange={(e) => setBiliDraft(Number(e.target.value))}
              disabled={!canControlProgress}
              className={`flex-1 min-w-[50px] h-1.5 accent-[#FB7299] ${
                canControlProgress ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
              }`}
              aria-label="B 站对齐时间轴"
              title="B 站播放器不可控：拖到目标时间点，再点右侧「对齐所有人」"
            />
            <span className="font-mono tabular-nums text-[10px] text-zinc-300 shrink-0">
              {formatSec(biliDraft ?? displayTime)} /{' '}
              {item.durationSec && item.durationSec > 0 ? formatSec(item.durationSec) : '--:--'}
            </span>
            <button
              type="button"
              onClick={alignBilibili}
              disabled={!canControlProgress}
              className={`px-2 py-0.5 rounded text-[10px] font-medium shrink-0 transition-colors ${
                canControlProgress
                  ? 'bg-[#FB7299] hover:bg-[#e05f84] text-white cursor-pointer'
                  : 'bg-white/10 text-zinc-400 cursor-not-allowed'
              }`}
              title={
                canControlProgress
                  ? 'B 站没有控制接口：把所有人（包括自己）的画面重新加载到这个时间点。播放/暂停只在各自本地生效。'
                  : `由「${videoState.controllerName || '点播人'}」控片`
              }
            >
              对齐所有人
            </button>
          </div>
        )}
      </div>
    </>
  );
};

function drawBuiltinVectorFilm(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  mode: 'cosmos' | 'lofi' | 'mp4'
) {
  if (mode === 'lofi') {
    // Evening balcony skyline flat vector animation
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1E293B');
    sky.addColorStop(0.6, '#3B4268');
    sky.addColorStop(1, '#7C4D5E');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Moon
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.22, 22, 0, Math.PI * 2);
    ctx.fill();

    // City silhouette
    const buildings = [
      { x: 20, w: 65, h: 120 },
      { x: 95, w: 55, h: 160 },
      { x: 165, w: 80, h: 105 },
      { x: 260, w: 70, h: 175 },
      { x: 345, w: 90, h: 130 },
      { x: 450, w: 60, h: 155 },
      { x: 525, w: 95, h: 115 },
    ];
    buildings.forEach((b, idx) => {
      ctx.fillStyle = idx % 2 === 0 ? '#181E2E' : '#232B40';
      ctx.fillRect(b.x, h - b.h, b.w, b.h);
      // Warm twinkling windows
      for (let wy = h - b.h + 14; wy < h - 25; wy += 20) {
        for (let wx = b.x + 10; wx < b.x + b.w - 14; wx += 16) {
          const lit = ((wx * 7 + wy * 13 + Math.floor(t * 0.5)) % 5) !== 0;
          ctx.fillStyle = lit ? 'rgba(251, 191, 36, 0.8)' : 'rgba(255,255,255,0.08)';
          ctx.fillRect(wx, wy, 7, 10);
        }
      }
    });

    // Floating warm string lights
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.65);
    ctx.quadraticCurveTo(w * 0.5, h * 0.76, w, h * 0.62);
    ctx.stroke();

    for (let i = 1; i <= 11; i++) {
      const u = i / 12;
      const lx = u * w;
      const ly = (1 - u) * (1 - u) * (h * 0.65) + 2 * (1 - u) * u * (h * 0.76) + u * u * (h * 0.62);
      const glow = 0.7 + 0.3 * Math.sin(t * 2 + i);
      ctx.fillStyle = `rgba(253, 224, 71, ${glow})`;
      ctx.beginPath();
      ctx.arc(lx, ly + 4, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle film title card
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('暮色阳台 · Lo-Fi 共看频道', 20, 28);
    return;
  }

  // Cosmos vector animation
  ctx.fillStyle = '#182235';
  ctx.fillRect(0, 0, w, h);

  // Twinkling stars
  for (let i = 0; i < 36; i++) {
    const sx = ((i * 97 + t * 8) % (w + 20)) - 10;
    const sy = (i * 53) % h;
    const alpha = 0.35 + 0.55 * Math.abs(Math.sin(t * 1.4 + i));
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, (i % 3) + 1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Coral ringed planet
  const px = w * 0.28;
  const py = h * 0.52 + Math.sin(t * 0.7) * 6;
  ctx.fillStyle = '#FF785A';
  ctx.beginPath();
  ctx.arc(px, py, 56, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#FDBA74';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.ellipse(px, py, 94, 22, -0.25, 0, Math.PI * 2);
  ctx.stroke();

  // Geometric spacecraft gliding smoothly
  const shipX = w * 0.55 + Math.cos(t * 0.6) * 45;
  const shipY = h * 0.44 + Math.sin(t * 1.1) * 14;
  ctx.save();
  ctx.translate(shipX, shipY);
  ctx.rotate(Math.sin(t * 0.8) * 0.06);

  // Thruster trail
  ctx.fillStyle = 'rgba(255, 90, 54, 0.55)';
  ctx.beginPath();
  ctx.moveTo(-36, -6);
  ctx.lineTo(-68 - Math.sin(t * 18) * 8, 0);
  ctx.lineTo(-36, 6);
  ctx.closePath();
  ctx.fill();

  // Hull
  ctx.fillStyle = '#F8FAFC';
  ctx.beginPath();
  ctx.moveTo(42, 0);
  ctx.lineTo(-26, -18);
  ctx.lineTo(-36, -8);
  ctx.lineTo(-36, 8);
  ctx.lineTo(-26, 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#38BDF8';
  ctx.beginPath();
  ctx.arc(10, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('星际漫游 · 矢量视觉短片', 20, 28);
}
