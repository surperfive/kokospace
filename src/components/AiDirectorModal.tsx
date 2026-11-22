import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, KeyRound, Loader2, Send, Settings2, Sparkles, X } from 'lucide-react';
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
}

const QUICK: { label: string; text: string }[] = [
  { label: '暂停', text: '暂停一下' },
  { label: '继续', text: '继续播放' },
  { label: '下一部', text: '跳过这一部' },
  { label: '回到开头', text: '从头开始播' },
  { label: '现在在放什么', text: '现在在放什么？队列里还有几部？' },
];

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
  const [showSetup, setShowSetup] = useState(false);
  const [draftCfg, setDraftCfg] = useState<AiConfig>(() => loadAiConfig());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const c = loadAiConfig();
    setCfg(c);
    setDraftCfg(c);
    setShowSetup(!c.apiKey);
  }, [isOpen]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const roomContext: RoomContext = useMemo(() => {
    const vs = videoState;
    const elapsed =
      vs.currentTime + (vs.isPlaying ? Math.max(0, Date.now() - vs.updatedAtMs) / 1000 : 0);
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
  }, [videoState]);

  const push = (role: LogLine['role'], text: string) =>
    setLog((prev) => [...prev, { id: `l_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`, role, text }]);

  const runCommand = async (cmd: DirectorCommand) => {
    switch (cmd.type) {
      case 'pause':
        onVideoControl('pause', roomContext.elapsedSec);
        push('action', '已暂停');
        break;
      case 'play':
        onVideoControl('play', roomContext.elapsedSec);
        push('action', '继续播放');
        break;
      case 'skip':
        onSkipNext();
        push('action', '已跳过当前影片');
        break;
      case 'seek':
        onVideoControl('seek', cmd.seconds);
        push('action', `已跳到 ${Math.floor(cmd.seconds / 60)}:${String(cmd.seconds % 60).padStart(2, '0')}`);
        break;
      case 'enqueue':
        push('action', `正在点播：${cmd.title || cmd.url}`);
        await onEnqueueUrl(cmd.url, cmd.title || '');
        push('action', '已加入队列');
        break;
    }
  };

  const submit = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    if (!cfg.apiKey) {
      setShowSetup(true);
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
      push('error', `调用失败：${(err as Error)?.message || '未知错误'}`);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  const activeProvider = AI_PROVIDERS.find((p) => p.id === cfg.providerId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[88vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-900">AI 点播导演</div>
              <div className="text-[11px] text-zinc-500 truncate">
                {cfg.apiKey ? `${activeProvider?.name || '自定义'} · ${cfg.model}` : '还没配置模型'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setDraftCfg(cfg);
                setShowSetup((v) => !v);
              }}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              title="模型设置"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showSetup ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex items-start gap-2 rounded-2xl bg-zinc-50 border border-zinc-200 p-3">
              <KeyRound className="w-3.5 h-3.5 text-zinc-400 mt-0.5 shrink-0" />
              <p className="text-[11px] leading-relaxed text-zinc-500">
                密钥只存在本机浏览器，每次请求经由本服务转发一次（多数厂商接口不返回 CORS 头，
                浏览器直连会被拦），服务端不落盘、不打日志。
              </p>
            </div>

            <div>
              <div className="text-[11px] text-zinc-500 mb-1.5">厂商</div>
              <div className="flex flex-wrap gap-1.5">
                {AI_PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setDraftCfg((prev) => ({ ...prev, providerId: p.id, baseUrl: p.baseUrl, model: p.model }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
                      draftCfg.providerId === p.id
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <div className="text-[11px] text-zinc-500 mb-1">接口地址（OpenAI 兼容）</div>
              <input
                value={draftCfg.baseUrl}
                onChange={(e) => setDraftCfg((p) => ({ ...p, baseUrl: e.target.value, providerId: 'custom' }))}
                placeholder="https://api.deepseek.com/v1"
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
              />
            </label>

            <label className="block">
              <div className="text-[11px] text-zinc-500 mb-1">模型名</div>
              <input
                value={draftCfg.model}
                onChange={(e) => setDraftCfg((p) => ({ ...p, model: e.target.value }))}
                placeholder="deepseek-chat"
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
              />
            </label>

            <label className="block">
              <div className="text-[11px] text-zinc-500 mb-1">API Key</div>
              <input
                type="password"
                value={draftCfg.apiKey}
                onChange={(e) => setDraftCfg((p) => ({ ...p, apiKey: e.target.value }))}
                placeholder="sk-..."
                className="w-full px-3 py-2 rounded-xl bg-zinc-100 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
              />
            </label>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (!draftCfg.apiKey.trim() || !draftCfg.baseUrl.trim() || !draftCfg.model.trim()) {
                    showToast('接口地址、模型名、密钥都要填');
                    return;
                  }
                  saveAiConfig(draftCfg);
                  setCfg(draftCfg);
                  setShowSetup(false);
                  showToast('已保存，可以让 AI 帮你点播了');
                }}
                className="px-3.5 py-2 rounded-xl bg-[#FF5A36] text-white text-xs font-semibold hover:bg-[#E84B28] cursor-pointer"
              >
                保存
              </button>
              {cfg.apiKey && (
                <button
                  type="button"
                  onClick={() => {
                    clearAiConfig();
                    const fresh = loadAiConfig();
                    setCfg(fresh);
                    setDraftCfg(fresh);
                    showToast('已清除本机密钥');
                  }}
                  className="px-3 py-2 rounded-xl bg-zinc-100 text-zinc-600 text-xs font-medium hover:bg-zinc-200 cursor-pointer"
                >
                  清除密钥
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[180px]">
              {log.length === 0 && (
                <div className="text-[11px] leading-relaxed text-zinc-400 px-1">
                  直接用一句话指挥播放。比如：「暂停一下」「跳到 3 分钟」「把这部电影从头放」
                  「帮我把 https://… 加进队列」。
                  <br />
                  AI 不会凭空编造视频链接 —— 想放新片，请把链接一起发进来。
                </div>
              )}
              {log.map((l) => (
                <div
                  key={l.id}
                  className={
                    l.role === 'user'
                      ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-zinc-900 text-white px-3 py-1.5 text-[11px] leading-snug w-fit'
                      : l.role === 'action'
                      ? 'text-[10px] text-[#FF5A36] font-medium px-1'
                      : l.role === 'error'
                      ? 'text-[11px] text-red-600 bg-red-50 rounded-xl px-2.5 py-1.5'
                      : 'max-w-[85%] text-[11px] leading-snug text-zinc-700 bg-zinc-100 rounded-2xl rounded-bl-md px-3 py-1.5 w-fit'
                  }
                >
                  {l.text}
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 px-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  正在想…
                </div>
              )}
            </div>

            <div className="px-3 pb-1 flex flex-wrap gap-1.5 shrink-0">
              {QUICK.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => void submit(q.text)}
                  disabled={busy}
                  className="px-2 py-1 rounded-lg bg-zinc-100 text-[10px] font-medium text-zinc-600 hover:bg-zinc-200 disabled:opacity-50 cursor-pointer"
                >
                  {q.label}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(input);
              }}
              className="flex items-center gap-2 p-3 border-t border-zinc-200 shrink-0"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="想怎么播？说一句就行"
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="px-3 py-2 rounded-xl bg-[#FF5A36] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#E84B28] disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                执行
              </button>
            </form>
          </>
        )}

        <div className="px-4 py-2 border-t border-zinc-200 flex items-center gap-1.5 text-[10px] text-zinc-400 shrink-0">
          <Sparkles className="w-3 h-3" />
          支持任意 OpenAI 兼容接口（DeepSeek / OpenAI / 通义 / Kimi / 硅基流动 / Groq / OpenRouter）
        </div>
      </div>
    </div>
  );
};
