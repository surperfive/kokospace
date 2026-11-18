import React, { useState } from 'react';
import { X, Play, Plus, Trash2, Link2, Film } from 'lucide-react';
import { VideoQueueItem, VideoState } from '../types/metaverse';
import { BUILTIN_VIDEOS } from '../data/maps';

interface VideoQueueDrawerProps {
  isOpen: boolean;
  videoState: VideoState;
  onClose: () => void;
  onSelectVideo: (item: VideoQueueItem) => void;
  onEnqueueUrl: (url: string, title: string) => Promise<void>;
  onRemoveFromQueue: (itemId: string) => void;
}

export const VideoQueueDrawer: React.FC<VideoQueueDrawerProps> = ({
  isOpen,
  videoState,
  onClose,
  onSelectVideo,
  onEnqueueUrl,
  onRemoveFromQueue,
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
              <span>点播外部视频链接</span>
            </div>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="粘贴 MP4 直链 / B站 BV 链接 / YouTube 链接"
              className="w-full px-3 py-2 rounded-xl bg-white border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
            />
            <input
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="可选：自定义影片标题"
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
                {videoState.isPlaceholder ? (
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

          {/* Current Room Queue */}
          <section className="space-y-2.5">
            <h4 className="text-xs font-semibold text-zinc-700">播放队列 ({videoState.queue.length})</h4>
            <div className="space-y-2">
              {videoState.queue.length === 0 && (
                <p className="text-[11px] text-zinc-400 px-1">队列为空，现在点播会立即开播</p>
              )}
              {videoState.queue.map((item, index) => {
                const isActive = videoState.currentItem.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-colors ${
                      isActive ? 'bg-[#FF5A36]/8 border-[#FF5A36]/40' : 'bg-white border-zinc-200'
                    }`}
                  >
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
                    {!isActive && (
                      <button
                        type="button"
                        onClick={() => onRemoveFromQueue(item.id)}
                        className="p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                        title="移出队列"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Built-in Curated Library */}
          <section className="space-y-2.5">
            <h4 className="text-xs font-semibold text-zinc-700">内置精选片库</h4>
            <p className="text-[11px] text-zinc-500 -mt-1">点击即点播，排队规则同上</p>
            <div className="grid grid-cols-1 gap-2.5">
              {BUILTIN_VIDEOS.map((vid) => (
                <button
                  key={vid.id}
                  type="button"
                  onClick={() => onSelectVideo(vid)}
                  className="flex items-center gap-3 p-2.5 rounded-2xl border border-zinc-200 bg-white hover:border-zinc-300 text-left transition-colors cursor-pointer"
                >
                  <div className="w-20 h-12 rounded-xl overflow-hidden bg-zinc-900 shrink-0 flex items-center justify-center">
                    {vid.thumbnail ? (
                      <img
                        src={vid.thumbnail}
                        alt={vid.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Film className="w-5 h-5 text-zinc-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-zinc-900 truncate">{vid.title}</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{vid.addedBy}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
};
