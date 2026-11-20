import React, { useState } from 'react';
import {
  X,
  Play,
  Plus,
  Trash2,
  Link2,
  SkipForward,
  SlidersHorizontal,
  Film,
  Loader2,
  History,
} from 'lucide-react';
import { VideoState } from '../types/metaverse';
import { formatHistoryTime, type WatchHistoryItem } from '../lib/watchHistory';

interface VideoQueueDrawerProps {
  isOpen: boolean;
  videoState: VideoState;
  canSkip: boolean;
  /** 跳过投票：已投人数 / 通过票数 / 自己是否已投 */
  skipVoteCount: number;
  skipVoteThreshold: number;
  hasVotedSkip: boolean;
  onVoteSkip: () => void;
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
  skipVoteCount,
  skipVoteThreshold,
  hasVotedSkip,
  onVoteSkip,
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
}) => {
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/45 backdrop-blur-[2px]">
      <div className="flex-1" onClick={onClose} />
      <aside className="w-full max-w-md bg-white h-full shadow-2xl border-l border-zinc-200 flex flex-col">
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-base text-zinc-900">中央巨幕点播中心</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {videoState.isPlaceholder
                ? '房间还没人在看片，点播会直接开播'
                : '点播只入队，当前片播完自动播放，不会打断别人'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 cursor-pointer"
            aria-label="关闭点播面板"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Custom URL Form */}
          <section className="p-4 rounded-2xl bg-[#F4F5F7] border border-zinc-200/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
              <Link2 className="w-3.5 h-3.5 text-[#FF5A36]" />
              <span>点播外部视频</span>
            </div>
            <textarea
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              rows={2}
              placeholder="粘贴链接或整段分享文案都行：B 站 App「分享 → 复制链接」直接粘，认得出 BV 号就能锁定视频"
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
            />
            {urlInput.trim() && (
              <div className="text-[11px] text-zinc-500 leading-tight">
                {(() => {
                  const bv = (urlInput.match(/BV[0-9A-Za-z]{10}/) || [])[0];
                  if (bv) {
                    return (
                      <span className="text-emerald-600 font-medium">
                        已锁定 B 站视频 {bv}
                      </span>
                    );
                  }
                  if (/b23\.tv\//i.test(urlInput)) {
                    return <span>识别到 b23 短链，加入时会自动解析成 BV 号</span>;
                  }
                  return <span>支持 MP4 / HLS(.m3u8) / B站 / YouTube</span>;
                })()}
              </div>
            )}
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="可选：自定义影片标题（留空自动抓取）"
              maxLength={60}
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!urlInput.trim() || submitting}
                onClick={handleAdd}
                className="flex-1 py-2 px-3 rounded-xl bg-[#FF5A36] hover:bg-[#E84B28] text-white text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    正在解析并加入…
                  </>
                ) : videoState.isPlaceholder ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    立即同步播放
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    加入播放队列
                  </>
                )}
              </button>
            </div>
          </section>

          {/* Skip Options */}
          <section className="p-4 rounded-2xl bg-white border border-zinc-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#FF5A36]" />
                <span>跳过选项</span>
              </div>
              {canSkip ? (
                <button
                  type="button"
                  onClick={onSkipCurrent}
                  className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                >
                  <SkipForward className="w-3 h-3" />
                  <span>跳过当前影片</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onVoteSkip}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer tabular-nums transition-colors ${
                    hasVotedSkip
                      ? 'bg-amber-400 text-zinc-900 hover:bg-amber-300'
                      : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                  }`}
                  title={
                    hasVotedSkip
                      ? '你已投票，再点一次撤销'
                      : `投票跳过当前影片，满 ${skipVoteThreshold} 票自动切下一部`
                  }
                >
                  <SkipForward className="w-3 h-3" />
                  <span>
                    {hasVotedSkip ? '已投' : '投票'}
                    {skipVoteCount > 0 ? ` ${skipVoteCount}/${skipVoteThreshold}` : ''}
                  </span>
                </button>
              )}
            </div>

            <p className="text-[11px] text-zinc-500 leading-relaxed">
              房主与当前点播人可直接跳过；其他人投票，满 {skipVoteThreshold} 票自动切下一部。
            </p>

            <div>
              <div className="text-[11px] text-zinc-500 mb-1.5">快进跳过步长（跳过片头/广告）</div>
              <div className="grid grid-cols-4 gap-1.5">
                {SKIP_STEP_OPTIONS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => onChangeSkipStepSec(sec)}
                    className={`py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
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

            <div>
              <div className="text-[11px] text-zinc-500 mb-1.5">
                自动跳过片尾（队列有下一部时生效）
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {AUTO_SKIP_OUTRO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => onChangeAutoSkipOutroSec(opt.value)}
                    className={`py-1.5 px-1 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer truncate ${
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
          </section>

          {/* Current Room Queue */}
          <section className="space-y-2.5">
            <h4 className="text-xs font-semibold text-zinc-700">播放队列 ({videoState.queue.length})</h4>
            <div className="space-y-2">
              {videoState.queue.length === 0 && (
                <p className="text-[11px] text-zinc-400 px-1">队列为空，现在点播会立即开播</p>
              )}
              {videoState.queue.map((item, index) => {
                const isActive = videoState.currentItem.id === item.id;
                const durLabel = formatDuration(item.durationSec);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-2.5 p-3 rounded-2xl border transition-colors ${
                      isActive ? 'bg-[#FF5A36]/8 border-[#FF5A36]/40' : 'bg-white border-zinc-200'
                    }`}
                  >
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
                        <Film className="w-4 h-4 text-zinc-500" />
                      )}
                      {durLabel && (
                        <span className="absolute bottom-0.5 right-0.5 px-1 py-px rounded bg-black/75 text-white text-[9px] font-mono tabular-nums leading-tight">
                          {durLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isActive && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded bg-[#FF5A36] text-white text-[10px] font-semibold">
                            正在播放
                          </span>
                        )}
                        <span className="text-xs font-semibold text-zinc-900 truncate">{item.title}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                        {isActive ? '当前播放' : `排队第 ${index + 1} 位`} · {item.sourceType.toUpperCase()} · 点播:{' '}
                        {item.addedBy}
                      </div>
                    </div>
                    {isActive ? (
                      canSkip ? (
                        <button
                          type="button"
                          onClick={onSkipCurrent}
                          className="px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0"
                          title="跳过当前视频"
                        >
                          <SkipForward className="w-3 h-3" />
                          <span>跳过</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onVoteSkip}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1 cursor-pointer shrink-0 tabular-nums transition-colors ${
                            hasVotedSkip
                              ? 'bg-amber-400 text-zinc-900 hover:bg-amber-300'
                              : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200'
                          }`}
                          title={
                            hasVotedSkip
                              ? '你已投票，再点一次撤销'
                              : `投票跳过，满 ${skipVoteThreshold} 票自动切下一部`
                          }
                        >
                          <SkipForward className="w-3 h-3" />
                          <span>
                            {hasVotedSkip ? '已投' : '投票'}
                            {skipVoteCount > 0 ? ` ${skipVoteCount}/${skipVoteThreshold}` : ''}
                          </span>
                        </button>
                      )
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        {canSkip && (
                          <button
                            type="button"
                            onClick={() => onJumpToItem(item.id)}
                            className="px-2 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-medium cursor-pointer"
                            title="跳过前面直接播这一部"
                          >
                            跳到此片
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemoveFromQueue(item.id)}
                          className="p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                          title="移出队列"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 我的点播记录（本机） */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-[#FF5A36]" />
                我的点播记录 ({history.length})
              </h4>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="text-[11px] text-zinc-400 hover:text-red-600 cursor-pointer"
                >
                  清空
                </button>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 leading-tight">
              只存在这台设备上，不登录也不同步。点「再播一次」直接重新入队。
            </p>
            <div className="space-y-2">
              {history.length === 0 && (
                <p className="text-[11px] text-zinc-400 px-1">还没有点播过影片</p>
              )}
              {history.map((item) => {
                const durLabel = formatDuration(item.durationSec);
                return (
                  <div
                    key={item.url}
                    className="flex items-center justify-between gap-2.5 p-2.5 rounded-2xl border border-zinc-200 bg-white"
                  >
                    <div className="relative w-12 h-8 rounded-lg bg-zinc-900 overflow-hidden shrink-0 flex items-center justify-center">
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
                      <div className="text-[10px] text-zinc-500 mt-0.5 truncate">
                        {item.sourceType.toUpperCase()} · {formatHistoryTime(item.playedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onReplayHistory(item)}
                        className="px-2 py-1.5 rounded-lg bg-[#FF5A36]/10 hover:bg-[#FF5A36]/20 text-[#FF5A36] text-[11px] font-medium cursor-pointer"
                        title="按这条记录重新点播"
                      >
                        再播一次
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveHistory(item.url)}
                        className="p-1.5 rounded-lg text-zinc-300 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        title="从记录中删除"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
