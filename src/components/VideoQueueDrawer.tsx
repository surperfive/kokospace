import React, { useState } from 'react';
import {
  X,
  Play,
  Plus,
  Trash2,
  SkipForward,
  Film,
  Loader2,
  Bot,
} from 'lucide-react';
import { VideoState } from '../types/metaverse';
import { formatHistoryTime, type WatchHistoryItem } from '../lib/watchHistory';

interface VideoQueueDrawerProps {
  isOpen: boolean;
  videoState: VideoState;
  canSkip: boolean;
  skipStepSec: number;
  autoSkipOutroSec: number;
  history: WatchHistoryItem[];
  onChangeSkipStepSec: (sec: number) => void;
  onChangeAutoSkipOutroSec: (sec: number) => void;
  onSkipCurrent: () => void;
  onJumpToItem: (itemId: string) => void;
  onClose: () => void;
  onEnqueueUrl: (url: string, title: string, preset?: WatchHistoryItem) => Promise<void>;
  onRemoveFromQueue: (itemId: string) => void;
  onReplayHistory: (item: WatchHistoryItem) => Promise<void>;
  onRemoveHistory: (url: string) => void;
  onClearHistory: () => void;
  /** 打开 AI 点播导演 */
  onOpenAi: () => void;
}

const SKIP_STEP_OPTIONS = [15, 30, 60, 90];
const AUTO_SKIP_OUTRO_OPTIONS = [
  { value: 0, label: '关闭' },
  { value: 10, label: '最后 10 秒' },
  { value: 15, label: '最后 15 秒' },
  { value: 30, label: '最后 30 秒' },
];

function formatDuration(sec?: number): string | null {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return null;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export const VideoQueueDrawer: React.FC<VideoQueueDrawerProps> = ({
  isOpen,
  videoState,
  canSkip,
  skipStepSec,
  autoSkipOutroSec,
  history,
  onChangeSkipStepSec,
  onChangeAutoSkipOutroSec,
  onSkipCurrent,
  onJumpToItem,
  onClose,
  onEnqueueUrl,
  onRemoveFromQueue,
  onReplayHistory,
  onRemoveHistory,
  onClearHistory,
  onOpenAi,
}) => {
  const [tab, setTab] = useState<'queue' | 'history' | 'settings'>('queue');
  const [urlInput, setUrlInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!urlInput.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onEnqueueUrl(urlInput.trim(), titleInput.trim());
      setUrlInput('');
      setTitleInput('');
      setTab('queue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/45 backdrop-blur-[2px]">
      <div className="flex-1" onClick={onClose} />
      <aside className="w-full max-w-md bg-white h-full shadow-2xl border-l border-zinc-200 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-base text-zinc-900">点播队列</h3>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">
              {videoState.isPlaceholder
                ? '当前为空闲待机，点播后立即全屋同步开播'
                : '新影片自动顺延排队，播完自动无缝切换'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onOpenAi}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 text-xs font-medium flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors"
              title="打开 AI 影院导演台"
            >
              <Bot className="w-3.5 h-3.5 text-[#FF5A36]" />
              <span>AI 导演</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 cursor-pointer transition-colors"
              aria-label="关闭点播面板"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sticky Quick Enqueue Bar */}
        <div className="p-4 border-b border-zinc-200 bg-[#F7F7F8] space-y-2.5 shrink-0">
          <textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            rows={2}
            placeholder="粘贴视频链接或 B 站分享文案（支持 B站 / YouTube / MP4 / HLS）"
            className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs leading-relaxed resize-none focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          />
          {urlInput.trim() && (
            <div className="space-y-2">
              <div className="text-[11px] text-zinc-500">
                {(() => {
                  const bv = (urlInput.match(/BV[0-9A-Za-z]{10}/) || [])[0];
                  if (bv) {
                    return <span className="text-emerald-700 font-medium">已识别 B 站视频 {bv}</span>;
                  }
                  if (/b23\.tv\//i.test(urlInput)) {
                    return <span>已识别 b23 短链，入队时自动解析</span>;
                  }
                  return <span>将按外部流媒体链接解析</span>;
                })()}
              </div>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="可选：自定义影片标题（留空自动获取）"
                maxLength={60}
                className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
          )}
          <button
            type="button"
            disabled={!urlInput.trim() || submitting}
            onClick={handleAdd}
            className="w-full h-9 px-4 rounded-xl bg-[#FF5A36] hover:bg-[#E84B28] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>正在解析并加入…</span>
              </>
            ) : videoState.isPlaceholder ? (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>立即同步播放</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>加入播放队列</span>
              </>
            )}
          </button>
        </div>

        {/* Clean Segmented Tabs */}
        <div className="px-4 pt-3 pb-2 border-b border-zinc-200 shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-100">
            <button
              type="button"
              onClick={() => setTab('queue')}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums cursor-pointer ${
                tab === 'queue' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              播放队列 · {videoState.queue.length}
            </button>
            <button
              type="button"
              onClick={() => setTab('history')}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums cursor-pointer ${
                tab === 'history' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              历史记录 · {history.length}
            </button>
            <button
              type="button"
              onClick={() => setTab('settings')}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                tab === 'settings' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              播放偏好
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'queue' && (
            <div className="space-y-2">
              {videoState.queue.length === 0 ? (
                <div className="py-12 text-center space-y-1.5">
                  <div className="text-sm font-medium text-zinc-700">当前队列为空</div>
                  <p className="text-xs text-zinc-400">在上方粘贴视频链接即可立刻全屋开播</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-200/80">
                  {videoState.queue.map((item, index) => {
                    const isActive = videoState.currentItem.id === item.id;
                    const durLabel = formatDuration(item.durationSec);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 py-3 first:pt-1 transition-colors ${
                          isActive ? 'bg-[#FF5A36]/[0.04] -mx-4 px-4' : ''
                        }`}
                      >
                        <div className="relative w-16 h-10 rounded-lg bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center">
                          {item.thumbnail ? (
                            <img
                              src={item.thumbnail}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Film className="w-4 h-4 text-zinc-500" />
                          )}
                          {durLabel && (
                            <span className="absolute bottom-0.5 right-0.5 px-1 py-px rounded bg-black/75 text-white text-[9px] font-mono tabular-nums leading-tight">
                              {durLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-zinc-900 truncate">{item.title}</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                            <span className={isActive ? 'text-[#FF5A36] font-medium' : ''}>
                              {isActive ? '正在播放' : `第 ${index + 1} 位`}
                            </span>
                            <span aria-hidden="true"> · </span>
                            <span>{item.sourceType.toUpperCase()}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{item.addedBy}</span>
                          </div>
                        </div>
                        {isActive ? (
                          canSkip && (
                            <button
                              type="button"
                              onClick={onSkipCurrent}
                              className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0 whitespace-nowrap"
                              title="跳过当前视频"
                            >
                              <SkipForward className="w-3 h-3" />
                              <span>跳过</span>
                            </button>
                          )
                        ) : (
                          <div className="flex items-center gap-1 shrink-0">
                            {canSkip && (
                              <button
                                type="button"
                                onClick={() => onJumpToItem(item.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-medium cursor-pointer whitespace-nowrap"
                                title="跳过前面直接播这一部"
                              >
                                插播
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onRemoveFromQueue(item.id)}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                              title="移出队列"
                              aria-label="移出队列"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">仅保存在本机浏览器，点击即可重新入队</span>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearHistory}
                    className="text-zinc-400 hover:text-red-600 font-medium cursor-pointer whitespace-nowrap"
                  >
                    清空记录
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="py-12 text-center space-y-1.5">
                  <div className="text-sm font-medium text-zinc-700">暂无点播记录</div>
                  <p className="text-xs text-zinc-400">你点播过的影片会自动留在这里方便重播</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-200/80">
                  {history.map((item) => {
                    const durLabel = formatDuration(item.durationSec);
                    return (
                      <div key={item.url} className="flex items-center gap-3 py-2.5">
                        <div className="relative w-14 h-9 rounded-lg bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center">
                          {item.thumbnail ? (
                            <img
                              src={item.thumbnail}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Film className="w-3.5 h-3.5 text-zinc-500" />
                          )}
                          {durLabel && (
                            <span className="absolute bottom-0.5 right-0.5 px-1 py-px rounded bg-black/75 text-white text-[9px] font-mono tabular-nums leading-tight">
                              {durLabel}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-zinc-900 truncate">{item.title}</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                            {item.sourceType.toUpperCase()} · {formatHistoryTime(item.playedAt)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onReplayHistory(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-[#FF5A36] hover:text-white text-zinc-800 text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap"
                          >
                            再播一次
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveHistory(item.url)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            aria-label="删除此条记录"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-6">
              <div>
                <div className="text-xs font-semibold text-zinc-900 mb-1">快进跳过步长</div>
                <p className="text-xs text-zinc-500 mb-3">点击巨幕快进按钮时单次跳过的秒数（适合跳过片头）</p>
                <div className="grid grid-cols-4 gap-2">
                  {SKIP_STEP_OPTIONS.map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => onChangeSkipStepSec(sec)}
                      className={`py-2 rounded-lg text-xs font-medium border tabular-nums transition-colors cursor-pointer ${
                        skipStepSec === sec
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      +{sec}秒
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-5 border-t border-zinc-200">
                <div className="text-xs font-semibold text-zinc-900 mb-1">自动跳过片尾</div>
                <p className="text-xs text-zinc-500 mb-3">队列存在下一部影片时，临近片尾自动切至下一部</p>
                <div className="grid grid-cols-2 gap-2">
                  {AUTO_SKIP_OUTRO_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onChangeAutoSkipOutroSec(opt.value)}
                      className={`py-2 px-3 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        autoSkipOutroSec === opt.value
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {canSkip && (
                <div className="pt-5 border-t border-zinc-200 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold text-zinc-900">立即切歌</div>
                    <p className="text-xs text-zinc-500 mt-0.5">无需投票，全屋同步切至下一部</p>
                  </div>
                  <button
                    type="button"
                    onClick={onSkipCurrent}
                    className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>跳过当前影片</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
