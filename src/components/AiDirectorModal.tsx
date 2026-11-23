import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  Eye,
  EyeOff,
  FastForward,
  Film,
  KeyRound,
  Link2,
  ListVideo,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings2,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import type { VideoState } from '../types/metaverse';
import {
  AI_PROVIDERS,
  askDirector,
  clearAiConfig,
  loadAiConfig,
  saveAiConfig,
  type AiConfig,
  type DirectorCommand,
  type RoomContext,
} from '../lib/aiDirector';
import { detectVideoLink } from '../lib/videoLink';

interface AiDirectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoState: VideoState;
  onVideoControl: (action: 'play' | 'pause' | 'seek', currentTime?: number) => void;
  onSkipNext: () => void;
  onEnqueueUrl: (url: string, title: string) => Promise<void>;
  showToast: (msg: string) => void;
}

interface LogLine {
  id: string;
  role: 'user' | 'assistant' | 'action' | 'error';
  text: string;
  actionKind?: DirectorCommand['type'];
  timeLabel: string;
}

interface CommandPreset {
  group: string;
  items: {
    label: string;
    desc: string;
    prompt: string;
    fillOnly?: boolean;
  }[];
}

const COMMAND_PRESETS: CommandPreset[] = [
  {
    group: '播放控制',
    items: [
      { label: '暂停当前影片', desc: '立即同步暂停全屋画面', prompt: '暂停一下' },
      { label: '跳过前 3 分钟', desc: '快速越过片头进入正片', prompt: '跳到 3 分钟' },
      { label: '从头重新播放', desc: '进度归零并同步开播', prompt: '从头开始播' },
    ],
  },
  {
    group: '队列与信息',
    items: [
      { label: '播下一部影片', desc: '切换至队列中的下一项', prompt: '跳过这一部' },
      { label: '查看当前片单', desc: '播报当前影片与待播数量', prompt: '现在在放什么？队列里还有几部？' },
      { label: '粘贴链接点播', desc: '附上视频链接即可自动入队', prompt: '帮我把这个视频加入队列：', fillOnly: true },
    ],
  },
];

function formatClock(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec < 0) return '00:00';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function nowTimeLabel(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const AiDirectorModal: React.FC<AiDirectorModalProps> = ({
  isOpen,
  onClose,
  videoState,
  onVideoControl,
  onSkipNext,
  onEnqueueUrl,
  showToast,
}) => {
  const [cfg, setCfg] = useState<AiConfig>(() => loadAiConfig());
  const [view, setView] = useState<'studio' | 'setup'>('studio');
  const [draftCfg, setDraftCfg] = useState<AiConfig>(() => loadAiConfig());
  const [showKey, setShowKey] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [tickNow, setTickNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const c = loadAiConfig();
    setCfg(c);
    setDraftCfg(c);
    setView('studio');
    setShowKey(false);
  }, [isOpen]);

  // Keep live elapsed time ticking while modal is open and playing
  useEffect(() => {
    if (!isOpen || !videoState.isPlaying) return;
    const timer = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, videoState.isPlaying]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, busy]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const roomContext: RoomContext = useMemo(() => {
    const vs = videoState;
    const elapsed =
      vs.currentTime + (vs.isPlaying ? Math.max(0, tickNow - vs.updatedAtMs) / 1000 : 0);
    return {
      currentTitle: vs.currentItem?.title || '未知影片',
      currentSource: vs.currentItem?.sourceType || 'mp4',
      currentUrl: vs.currentItem?.url || '',
      elapsedSec: elapsed,
      durationSec: vs.currentItem?.durationSec,
      isPlaying: vs.isPlaying,
      queue: (vs.queue || []).map((q) => ({ title: q.title, url: q.url })),
      recentChat: [],
    };
  }, [videoState, tickNow]);

  const detectedLink = useMemo(() => detectVideoLink(input), [input]);

  const push = (role: LogLine['role'], text: string, actionKind?: DirectorCommand['type']) =>
    setLog((prev) => [
      ...prev,
      {
        id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        role,
        text,
        actionKind,
        timeLabel: nowTimeLabel(),
      },
    ]);

  const runCommand = async (cmd: DirectorCommand) => {
    switch (cmd.type) {
      case 'pause':
        onVideoControl('pause', roomContext.elapsedSec);
        push('action', '已同步暂停中央巨幕', 'pause');
        break;
      case 'play':
        onVideoControl('play', roomContext.elapsedSec);
        push('action', '已恢复全屋同步播放', 'play');
        break;
      case 'skip':
        onSkipNext();
        push('action', '已切换至队列下一部影片', 'skip');
        break;
      case 'seek':
        onVideoControl('seek', cmd.seconds);
        push('action', `已同步跳转至 ${formatClock(cmd.seconds)}`, 'seek');
        break;
      case 'enqueue':
        push('action', `正在解析并点播：${cmd.title || cmd.url}`, 'enqueue');
        await onEnqueueUrl(cmd.url, cmd.title || '');
        push('action', '影片已成功加入播放队列', 'enqueue');
        break;
    }
  };

  const submit = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    if (!cfg.apiKey) {
      setDraftCfg(cfg);
      setView('setup');
      showToast('请先配置模型 API Key 后再执行 AI 指令');
      return;
    }
    setInput('');
    push('user', message);
    setBusy(true);
    try {
      const history = [
        ...log
          .filter((l) => l.role === 'user' || l.role === 'assistant')
          .slice(-6)
          .map((l) => ({ role: l.role as 'user' | 'assistant', content: l.text })),
        { role: 'user' as const, content: message },
      ];
      const result = await askDirector(cfg, history, roomContext);
      push('assistant', result.reply);
      if (result.command) await runCommand(result.command);
    } catch (err) {
      push('error', `${(err as Error)?.message || '模型请求失败，请检查配置或网络'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveConfig = () => {
    if (!draftCfg.apiKey.trim() || !draftCfg.baseUrl.trim() || !draftCfg.model.trim()) {
      showToast('接口地址、模型名与 API Key 均不能为空');
      return;
    }
    const clean: AiConfig = {
      ...draftCfg,
      baseUrl: draftCfg.baseUrl.trim(),
      model: draftCfg.model.trim(),
      apiKey: draftCfg.apiKey.trim(),
    };
    saveAiConfig(clean);
    setCfg(clean);
    setDraftCfg(clean);
    setView('studio');
    showToast('模型配置已保存');
  };

  if (!isOpen) return null;

  const activeProvider = AI_PROVIDERS.find((p) => p.id === cfg.providerId);
  const durationSec = roomContext.durationSec;
  const progressPct =
    durationSec && durationSec > 0 ? Math.min(100, Math.max(0, (roomContext.elapsedSec / durationSec) * 100)) : 0;
  const upNext = (videoState.queue || []).filter((q) => q.id !== videoState.currentItem?.id).slice(0, 4);

  const actionIcon = (kind?: DirectorCommand['type']) => {
    switch (kind) {
      case 'pause':
        return <Pause className="w-3.5 h-3.5 text-zinc-700" />;
      case 'play':
        return <Play className="w-3.5 h-3.5 text-zinc-700" />;
      case 'skip':
        return <SkipForward className="w-3.5 h-3.5 text-zinc-700" />;
      case 'seek':
        return <FastForward className="w-3.5 h-3.5 text-zinc-700" />;
      case 'enqueue':
        return <ListVideo className="w-3.5 h-3.5 text-[#FF5A36]" />;
      default:
        return <Check className="w-3.5 h-3.5 text-emerald-600" />;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/50 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[min(640px,88vh)] bg-white rounded-2xl border border-zinc-200 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Top Studio Header */}
        <div className="h-14 px-5 border-b border-zinc-200 flex items-center justify-between gap-4 shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold text-zinc-900 leading-tight truncate">
                AI 影院导演台
              </h2>
              <div className="text-xs text-zinc-500 truncate mt-0.5">
                {cfg.apiKey
                  ? `${activeProvider?.name || '自定义接口'} · ${cfg.model}`
                  : '尚未配置模型 · 左侧可直接控片'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Segmented Mode Switch */}
            <div className="flex items-center p-0.5 rounded-lg bg-zinc-100 border border-zinc-200/70">
              <button
                type="button"
                onClick={() => setView('studio')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  view === 'studio'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                指令工作台
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftCfg(cfg);
                  setView('setup');
                }}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                  view === 'setup'
                    ? 'bg-white text-zinc-900 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Settings2 className="w-3.5 h-3.5" />
                <span>模型配置</span>
              </button>
            </div>

            {view === 'studio' && log.length > 0 && (
              <button
                type="button"
                onClick={() => setLog([])}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                title="清空对话记录"
                aria-label="清空对话记录"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
              aria-label="关闭导演台"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-Column Body: Left Live Cinema Monitor + Right Command/Setup Workspace */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* Left Context Column (Desktop sidebar / Mobile compact header) */}
          <aside className="md:w-72 shrink-0 bg-[#F7F7F8] border-b md:border-b-0 md:border-r border-zinc-200 flex flex-col justify-between overflow-y-auto">
            <div className="p-4 space-y-5">
              {/* Live Now Playing */}
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 mb-2.5">当前巨幕画面</div>
                <div className="rounded-xl bg-white border border-zinc-200/90 overflow-hidden">
                  <div className="relative aspect-video bg-zinc-900 flex items-center justify-center overflow-hidden">
                    {videoState.currentItem?.thumbnail ? (
                      <img
                        src={videoState.currentItem.thumbnail}
                        alt={roomContext.currentTitle}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-90"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <Film className="w-7 h-7 text-zinc-600" />
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[11px] text-white/90 font-mono tabular-nums">
                      <span>{roomContext.isPlaying ? '播放中' : '已暂停'}</span>
                      <span>
                        {formatClock(roomContext.elapsedSec)}
                        {durationSec ? ` / ${formatClock(durationSec)}` : ''}
                      </span>
                    </div>
                    {durationSec && durationSec > 0 ? (
                      <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/25">
                        <div
                          className="h-full bg-[#FF5A36] transition-[width] duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="p-3 space-y-2.5">
                    <div>
                      <div className="text-xs font-semibold text-zinc-900 line-clamp-2 leading-snug">
                        {roomContext.currentTitle}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        {roomContext.currentSource.toUpperCase()}
                        <span aria-hidden="true"> · </span>
                        队列共 {videoState.queue.length} 部
                      </div>
                    </div>

                    {/* Direct Transport Controls (instant, no API key required) */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-zinc-100">
                      <button
                        type="button"
                        onClick={() => {
                          onVideoControl(roomContext.isPlaying ? 'pause' : 'play', roomContext.elapsedSec);
                          push('action', roomContext.isPlaying ? '已手动暂停播放' : '已手动恢复播放', roomContext.isPlaying ? 'pause' : 'play');
                        }}
                        className="h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title={roomContext.isPlaying ? '暂停播放' : '继续播放'}
                      >
                        {roomContext.isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        <span>{roomContext.isPlaying ? '暂停' : '播放'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onVideoControl('seek', 0);
                          push('action', '已手动回到片头 00:00', 'seek');
                        }}
                        className="h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="回到片头"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>重播</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSkipNext();
                          push('action', '已手动跳过当前影片', 'skip');
                        }}
                        className="h-8 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="切换下一部"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                        <span>下一部</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Up Next Queue Context (Desktop) */}
              <div className="hidden md:block">
                <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500 mb-2">
                  <span>接下来播放</span>
                  <span className="font-mono tabular-nums text-zinc-400">{upNext.length} 部待播</span>
                </div>
                {upNext.length === 0 ? (
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    暂无后续影片。把视频链接直接发给导演即可自动入队。
                  </p>
                ) : (
                  <ul className="divide-y divide-zinc-200/80 border-t border-b border-zinc-200/80">
                    {upNext.map((item, idx) => (
                      <li key={item.id} className="py-2 flex items-baseline gap-2.5">
                        <span className="text-[11px] font-mono tabular-nums text-zinc-400 shrink-0">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-zinc-800 font-medium truncate">{item.title}</div>
                          <div className="text-[11px] text-zinc-400 truncate">
                            {item.sourceType.toUpperCase()}
                            {item.durationSec ? ` · ${formatClock(item.durationSec)}` : ''}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Bottom Model Summary */}
            <div className="hidden md:flex items-center justify-between gap-2 px-4 py-3 border-t border-zinc-200 bg-white/70 text-xs">
              <div className="min-w-0">
                <div className="font-medium text-zinc-800 truncate">
                  {cfg.apiKey ? activeProvider?.name || '自定义模型' : '未连接 AI 模型'}
                </div>
                <div className="text-[11px] text-zinc-500 truncate">
                  {cfg.apiKey ? cfg.model : '支持 OpenAI 兼容接口'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraftCfg(cfg);
                  setView(view === 'setup' ? 'studio' : 'setup');
                }}
                className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer"
              >
                {cfg.apiKey ? '更换' : '去配置'}
              </button>
            </div>
          </aside>

          {/* Right Main Workspace */}
          <div className="flex-1 min-w-0 flex flex-col bg-white">
            {view === 'setup' ? (
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-base font-bold text-zinc-900">配置 AI 模型接口</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      选择任意 OpenAI 兼容服务商，密钥仅保存在本机浏览器。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setView('studio')}
                    className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    返回工作台
                  </button>
                </div>

                {/* Provider Grid */}
                <div>
                  <div className="text-xs font-semibold text-zinc-700 mb-2">选择服务商</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {AI_PROVIDERS.map((p) => {
                      const active = draftCfg.providerId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setDraftCfg((prev) => ({
                              ...prev,
                              providerId: p.id,
                              baseUrl: p.baseUrl,
                              model: p.model,
                            }))
                          }
                          className={`px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                            active
                              ? 'border-zinc-900 bg-zinc-900 text-white'
                              : 'border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-semibold truncate">{p.name}</span>
                            {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                          </div>
                          <div
                            className={`text-[11px] truncate mt-0.5 font-mono ${
                              active ? 'text-zinc-300' : 'text-zinc-400'
                            }`}
                          >
                            {p.model || '手动填写'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Connection Form */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <label className="block">
                    <span className="block text-xs font-medium text-zinc-700 mb-1.5">
                      接口地址 (Base URL)
                    </span>
                    <input
                      value={draftCfg.baseUrl}
                      onChange={(e) =>
                        setDraftCfg((p) => ({ ...p, baseUrl: e.target.value, providerId: 'custom' }))
                      }
                      placeholder="https://api.deepseek.com/v1"
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-zinc-200 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                    />
                  </label>

                  <label className="block">
                    <span className="block text-xs font-medium text-zinc-700 mb-1.5">模型名称</span>
                    <input
                      value={draftCfg.model}
                      onChange={(e) => setDraftCfg((p) => ({ ...p, model: e.target.value }))}
                      placeholder="deepseek-chat"
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-zinc-200 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="block text-xs font-medium text-zinc-700 mb-1.5">API Key</span>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={draftCfg.apiKey}
                      onChange={(e) => setDraftCfg((p) => ({ ...p, apiKey: e.target.value }))}
                      placeholder="sk-..."
                      className="w-full pl-3 pr-10 py-2.5 rounded-xl bg-white border border-zinc-200 text-xs font-mono text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                      aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </label>

                <div className="flex items-start gap-2.5 pt-1 text-xs text-zinc-500 leading-relaxed">
                  <KeyRound className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
                  <span>
                    密钥仅存储在你的本机浏览器。调用时经当前服务转发以解决跨域，服务端不落盘、不记录日志。
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 pt-4 border-t border-zinc-200">
                  <div>
                    {cfg.apiKey && (
                      <button
                        type="button"
                        onClick={() => {
                          clearAiConfig();
                          const fresh = loadAiConfig();
                          setCfg(fresh);
                          setDraftCfg(fresh);
                          showToast('已清除本机保存的密钥');
                        }}
                        className="px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        清除本机密钥
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setView('studio')}
                      className="px-4 py-2 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      className="px-4 py-2 rounded-lg bg-[#FF5A36] hover:bg-[#E84B28] text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      保存并返回工作台
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Optional inline banner when API key is not configured */}
                {!cfg.apiKey && (
                  <div className="px-5 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between gap-3 shrink-0">
                    <div className="text-xs text-zinc-600 leading-snug">
                      配置任意 OpenAI 兼容 API Key 后，即可用自然语言指挥播放与点播。
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftCfg(cfg);
                        setView('setup');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      配置模型
                    </button>
                  </div>
                )}

                {/* Stream / Empty Onboarding */}
                <div ref={listRef} className="flex-1 overflow-y-auto p-5 space-y-4">
                  {log.length === 0 ? (
                    <div className="space-y-6 max-w-xl">
                      <div>
                        <h3 className="font-display text-lg font-bold text-zinc-900 tracking-tight">
                          用一句话指挥影院播放
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                          可直接控制进度、切换片单，或把 B 站 / YouTube / 直链粘贴进来让导演自动入队。
                        </p>
                      </div>

                      <div className="space-y-4">
                        {COMMAND_PRESETS.map((group) => (
                          <div key={group.group}>
                            <div className="text-[11px] font-semibold text-zinc-400 mb-2">
                              {group.group}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {group.items.map((item) => (
                                <button
                                  key={item.label}
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    if (item.fillOnly) {
                                      setInput(item.prompt);
                                      inputRef.current?.focus();
                                    } else {
                                      void submit(item.prompt);
                                    }
                                  }}
                                  className="p-3 rounded-xl border border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/70 text-left transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  <div className="text-xs font-semibold text-zinc-900">{item.label}</div>
                                  <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                                    {item.desc}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {log.map((l) => {
                        if (l.role === 'user') {
                          return (
                            <div key={l.id} className="flex flex-col items-end gap-1">
                              <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-zinc-900 text-white px-3.5 py-2.5 text-[13px] leading-relaxed">
                                {l.text}
                              </div>
                              <span className="text-[10px] text-zinc-400 font-mono tabular-nums px-1">
                                {l.timeLabel}
                              </span>
                            </div>
                          );
                        }
                        if (l.role === 'action') {
                          return (
                            <div
                              key={l.id}
                              className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50/80 text-xs text-zinc-700"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {actionIcon(l.actionKind)}
                                <span className="font-medium truncate">{l.text}</span>
                              </div>
                              <span className="text-[10px] text-zinc-400 font-mono tabular-nums shrink-0">
                                {l.timeLabel}
                              </span>
                            </div>
                          );
                        }
                        if (l.role === 'error') {
                          return (
                            <div
                              key={l.id}
                              className="flex items-start justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-red-200 bg-red-50/80 text-xs text-red-700"
                            >
                              <div className="flex items-start gap-2 min-w-0">
                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                                <span className="leading-relaxed">{l.text}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setDraftCfg(cfg);
                                  setView('setup');
                                }}
                                className="text-[11px] font-semibold underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                检查配置
                              </button>
                            </div>
                          );
                        }
                        return (
                          <div key={l.id} className="flex flex-col items-start gap-1">
                            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-zinc-100 text-zinc-800 px-3.5 py-2.5 text-[13px] leading-relaxed">
                              {l.text}
                            </div>
                            <span className="text-[10px] text-zinc-400 font-mono tabular-nums px-1">
                              导演 · {l.timeLabel}
                            </span>
                          </div>
                        );
                      })}
                      {busy && (
                        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 text-xs text-zinc-600">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5A36]" />
                          <span>正在解析指令…</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Command Composer */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submit(input);
                  }}
                  className="p-4 border-t border-zinc-200 bg-white shrink-0 space-y-2"
                >
                  {detectedLink && (
                    <div className="flex items-center gap-1.5 text-[11px] text-[#FF5A36] font-medium px-1">
                      <Link2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        已识别视频链接 · 发送后将自动解析并加入队列
                        {detectedLink.titleHint ? `（${detectedLink.titleHint}）` : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="输入指令，例如「跳到 5 分钟」或直接粘贴视频链接…"
                      className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-zinc-100 border border-transparent focus:bg-white focus:border-zinc-300 text-[13px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/25 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={busy || !input.trim()}
                      className="h-10 px-4 rounded-xl bg-[#FF5A36] hover:bg-[#E84B28] text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>执行</span>
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
