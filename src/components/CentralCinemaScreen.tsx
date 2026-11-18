import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  onOpenQueue: () => void;
  onVideoControl: (action: 'play' | 'pause' | 'seek', currentTime?: number) => void;
  /** 当前用户是否是点播人：不是就只能看，进度条与播放键禁用 */
  canControlProgress?: boolean;
  /** 上报 mp4 的真实播放位置（点播人用它当权威时间源） */
  onPlaybackTime?: (time: number) => void;
  /** 当前这一部播完了（mp4 ended / 内置短片跑完一轮） */
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
  onOpenQueue,
  onVideoControl,
  canControlProgress = true,
  onPlaybackTime,
  onMediaEnded,
  hasNext = false,
  onSkipNext,
  activeWidgets,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const builtinCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [displayTime, setDisplayTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [seekDraft, setSeekDraft] = useState<number | null>(null);
  const seekTimerRef = useRef<number | null>(null);
  const displayedSecRef = useRef(-1);

  const item = videoState.currentItem;
  const isMp4 = item.sourceType === 'mp4';

  // 回调放进 ref，避免父组件每次渲染都重建事件监听
  const onPlaybackTimeRef = useRef(onPlaybackTime);
  onPlaybackTimeRef.current = onPlaybackTime;
  const onMediaEndedRef = useRef(onMediaEnded);
  onMediaEndedRef.current = onMediaEnded;
  /** 内置短片是循环动画，用"时间回绕"或到达时长判断跑完一轮 */
  const prevBuiltinTimeRef = useRef<number | null>(null);
  const builtinItemRef = useRef<string>('');
  const endedSentKeyRef = useRef<string | null>(null);

  const getExpectedTime = () => {
    if (!videoState.isPlaying) return videoState.currentTime;
    const nowServer = Date.now() + serverTimeOffsetMs;
    const elapsed = Math.max(0, (nowServer - videoState.updatedAtMs) / 1000);
    const total = videoState.currentTime + elapsed;
    const dur = isMp4 && mediaDuration > 0 ? mediaDuration : item.durationSec;
    if (dur && dur > 0) {
      // mp4 不循环，到片尾就停在总时长；内置短片是循环动画，取模
      return isMp4 ? Math.min(total, dur) : total % dur;
    }
    return total;
  };

  /** 当前真实播放位置：mp4 读元素，其它（内置短片）就是服务端时钟 */
  const currentPlaybackTime = () => {
    const el = videoRef.current;
    if (isMp4 && el && el.readyState >= 1 && Number.isFinite(el.currentTime)) {
      return el.currentTime;
    }
    return getExpectedTime();
  };

  // 点播人上报真实播放位置：seek 中 / 未就绪时不上报，避免把别人的进度拉回去
  useEffect(() => {
    if (!isMp4) return;
    const el = videoRef.current;
    if (!el) return;
    const report = () => {
      if (el.seeking || el.readyState < 2) return;
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
  }, [isMp4, item.url]);

  // 播放/暂停交给这个 effect；进度对齐统一放到下面的逐帧循环里做
  useEffect(() => {
    if (!isMp4) return;
    const el = videoRef.current;
    if (!el) return;

    if (videoState.isPlaying && el.paused) {
      el.play().catch(() => {
        // Browser autoplay policy fallback: mute and retry
        el.muted = true;
        setMuted(true);
        el.play().catch(() => {});
      });
    } else if (!videoState.isPlaying && !el.paused) {
      el.pause();
    }
  }, [videoState.isPlaying, item.id, item.url, isMp4]);

  // 换片时重置上一段视频的时长、展示时间、待提交 seek 与结束防重锁
  useEffect(() => {
    setMediaDuration(0);
    setSeekDraft(null);
    displayedSecRef.current = -1;
    setDisplayTime(videoState.currentTime || 0);
    endedSentKeyRef.current = null;
    if (seekTimerRef.current) {
      window.clearTimeout(seekTimerRef.current);
      seekTimerRef.current = null;
    }
    return () => {
      if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
    };
  }, [item.id]);

  // 逐帧：UI 进度 + 非点播人持续追踪权威时间（含缓冲后的追赶）
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = videoRef.current;
      const serverTime = getExpectedTime();

      // 只有点播人是"源"，不对齐自己；其他人（以及缓冲落后的情况）持续追
      if (isMp4 && el && !canControlProgress && !el.seeking) {
        if (!videoState.isPlaying) {
          // 暂停状态也要对位：别人暂停在 100s，你要停在 100s
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
            // 大漂移：直接跳（缓冲、卡顿、别人 seek 之后）
            try {
              el.currentTime = serverTime;
            } catch {
              /* ignore */
            }
            if (el.playbackRate !== 1) el.playbackRate = 1;
          } else if (abs > 0.06) {
            // 小漂移：改播放速率追，避免画面跳帧
            el.playbackRate = 1 + Math.max(-0.1, Math.min(0.1, drift * 0.6));
          } else if (el.playbackRate !== 1) {
            el.playbackRate = 1;
          }
        }
      } else if (isMp4 && el && el.playbackRate !== 1) {
        el.playbackRate = 1;
      }

      const t = isMp4 && el && el.readyState >= 1 && Number.isFinite(el.currentTime)
        ? el.currentTime
        : serverTime;

      // 只在整秒变化时 setState，避免 60fps 重渲染整个影院组件
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

      // 内置短片到达片尾就当作"这一部播完"，自动推进下一部
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
  }, [videoState, serverTimeOffsetMs, item.id, item.sourceType, item.builtinMode, isMp4, canControlProgress, mediaDuration]);

  const formatSec = (sec: number) => {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  };

  // Convert world rect to screen rect unless Theater Focus mode is enabled
  const screenLeft = viewport.width / 2 + (screenWorldRect.x - camera.x) * camera.zoom;
  const screenTop = viewport.height / 2 + (screenWorldRect.y - camera.y) * camera.zoom;
  const screenW = screenWorldRect.width * camera.zoom;
  const screenH = screenWorldRect.height * camera.zoom;

  const containerStyle: React.CSSProperties = isTheaterFocused
    ? {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(94vw, 960px)',
        height: 'min(58vh, 540px)',
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

  // mp4 用元素真实时长；内置短片用条目自带的时长；iframe 没有可信时长
  const duration =
    isMp4 && mediaDuration > 0 && Number.isFinite(mediaDuration)
      ? Math.floor(mediaDuration)
      : item.durationSec || 180;

  // iframe（YouTube / B 站）无法在播放中控进度，但可以按当前进度决定起播点。
  // 必须用 useMemo 锁住：src 每变一次 iframe 就会重新加载。
  const iframeStartRef = useRef(0);
  const iframeSrc = useMemo(() => {
    if (item.sourceType !== 'youtube' && item.sourceType !== 'bilibili') return item.url;
    const start = Math.floor(getExpectedTime());
    iframeStartRef.current = start;
    if (start < 3) return item.url;
    try {
      const u = new URL(item.url);
      if (item.sourceType === 'youtube') {
        u.searchParams.set('start', String(start));
        u.searchParams.set('autoplay', '1');
      } else {
        u.searchParams.set('t', String(start));
        u.searchParams.set('autoplay', '1');
      }
      return u.toString();
    } catch {
      return item.url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.url, item.sourceType]);

  return (
    <>
      {isTheaterFocused && (
        <div
          className="fixed inset-0 z-40 bg-zinc-950/65 backdrop-blur-sm transition-opacity"
          onClick={onToggleTheaterFocus}
        />
      )}
      <div
        style={{
          ...containerStyle,
          backgroundColor: frameColor,
        }}
        className={`group rounded-2xl border-4 border-zinc-900 shadow-2xl overflow-hidden flex flex-col select-none transition-[box-shadow] duration-200 ${
          isTheaterFocused ? 'ring-4 ring-white/20' : ''
        }`}
      >
        {/* Top Screen Header Strip */}
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-zinc-900/95 text-white text-xs shrink-0 border-b border-white/10">
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor }} />
            <span className="font-medium truncate">{item.title}</span>
            <span className="text-zinc-400 hidden sm:inline">·</span>
            <span className="text-zinc-400 truncate hidden sm:inline">
              控片: {videoState.controllerName || item.addedBy}
            </span>
            {!canControlProgress && (
              <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] text-zinc-300 shrink-0">
                只看
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {activeWidgets.map((w) => (
              <span
                key={w.id}
                className="px-2 py-0.5 rounded bg-white/10 text-[11px] font-mono tabular-nums text-amber-300 hidden md:inline"
              >
                {w.renderBadgeText()}
              </span>
            ))}
            <button
              type="button"
              onClick={onOpenQueue}
              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
              title="打开点播片单"
            >
              <ListVideo className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">点播单</span>
            </button>
            {hasNext && (
              <button
                type="button"
                onClick={() => canControlProgress && onSkipNext?.()}
                disabled={!canControlProgress}
                className={`p-1 rounded-md bg-white/10 text-white transition-colors ${
                  canControlProgress ? 'hover:bg-white/20 cursor-pointer' : 'opacity-40 cursor-not-allowed'
                }`}
                title={canControlProgress ? '跳到下一部' : `由「${videoState.controllerName || '点播人'}」控片`}
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleTheaterFocus}
              className="p-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              title={isTheaterFocused ? '返回 2D 空间视图' : '影院放大聚焦'}
            >
              {isTheaterFocused ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
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

          {item.sourceType === 'mp4' && (
            <video
              key={item.id}
              ref={videoRef}
              src={item.url}
              autoPlay={videoState.isPlaying}
              muted={muted}
              playsInline
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d) && d > 0) setMediaDuration(d);
              }}
              onCanPlay={(e) => {
                const el = e.currentTarget;
                if (videoState.isPlaying && el.paused) {
                  el.play().catch(() => {
                    el.muted = true;
                    setMuted(true);
                    el.play().catch(() => {});
                  });
                }
              }}
              onEnded={() => {
                // 只有点播人是权威，其他人的 ended 时序不可靠
                if (!canControlProgress) return;
                const endKey = `${item.id}:${videoState.updatedAtMs}`;
                if (endedSentKeyRef.current === endKey) return;
                endedSentKeyRef.current = endKey;
                onMediaEndedRef.current?.();
              }}
              className="w-full h-full object-contain bg-black"
            />
          )}

          {(item.sourceType === 'youtube' || item.sourceType === 'bilibili') && (
            <iframe
              key={`${item.id}-${iframeSrc}`}
              src={iframeSrc}
              title={item.title}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}

          {/* Paused Overlay */}
          {!videoState.isPlaying && (item.sourceType === 'builtin' || item.sourceType === 'mp4') && (
            <button
              type="button"
              onClick={() => canControlProgress && onVideoControl('play', currentPlaybackTime())}
              disabled={!canControlProgress}
              title={canControlProgress ? '继续播放' : `由「${videoState.controllerName || '点播人'}」控片，你只能观看`}
              className={`absolute inset-0 flex items-center justify-center bg-black/35 transition-colors ${
                canControlProgress ? 'hover:bg-black/45 cursor-pointer' : 'cursor-not-allowed'
              }`}
            >
              <div className="w-14 h-14 rounded-full bg-white/95 text-zinc-900 flex items-center justify-center shadow-lg">
                <Play className="w-6 h-6 ml-0.5 fill-current" />
              </div>
            </button>
          )}
        </div>

        {/* Bottom Synchronized Controls */}
        {(item.sourceType === 'builtin' || item.sourceType === 'mp4') && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-zinc-900/95 text-white text-xs shrink-0 border-t border-white/10">
            <button
              type="button"
              onClick={() =>
                canControlProgress &&
                onVideoControl(videoState.isPlaying ? 'pause' : 'play', currentPlaybackTime())
              }
              disabled={!canControlProgress}
              className={`p-1 rounded transition-colors ${
                canControlProgress ? 'hover:bg-white/15 cursor-pointer' : 'opacity-40 cursor-not-allowed'
              }`}
              aria-label={videoState.isPlaying ? '暂停同步播放' : '开始同步播放'}
            >
              {videoState.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
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
                // 拖动时先本地跟手，停手 200ms 才发一次 seek，避免刷屏广播
                if (seekTimerRef.current) window.clearTimeout(seekTimerRef.current);
                seekTimerRef.current = window.setTimeout(() => {
                  seekTimerRef.current = null;
                  const el = videoRef.current;
                  if (isMp4 && el) {
                    try {
                      el.currentTime = v;
                    } catch {
                      /* ignore */
                    }
                  }
                  onVideoControl('seek', v);
                  setSeekDraft(null);
                }, 200);
              }}
              disabled={!canControlProgress}
              className={`flex-1 h-1.5 accent-[#FF5A36] ${
                canControlProgress ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'
              }`}
            />

            <span className="font-mono tabular-nums text-[11px] text-zinc-300 shrink-0">
              {formatSec(displayTime)} / {formatSec(duration)}
            </span>

            {item.sourceType === 'mp4' && (
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="p-1 rounded hover:bg-white/15 transition-colors cursor-pointer"
                title={muted ? '取消静音' : '静音画面'}
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            )}
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
