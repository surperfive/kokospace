import React, { useState } from 'react';
import { X, Code2, Puzzle, Layers, Copy, Check } from 'lucide-react';
import { KokoPlugin } from '../types/metaverse';

interface DeveloperDocsModalProps {
  isOpen: boolean;
  plugins: Array<{ plugin: KokoPlugin; enabled: boolean }>;
  onTogglePlugin: (pluginId: string) => void;
  onClose: () => void;
}

const SAMPLE_PLUGIN_CODE = `import { pluginRegistry } from './lib/pluginRegistry';

pluginRegistry.register({
  id: 'my-community-lounge',
  name: '赛博咖啡角扩展包',
  version: '1.0.0',
  author: 'Community Dev',
  description: '新增自定义表情、Q版头饰与专属2D地图主题',
  emojiPacks: [
    { emoji: '☕', label: '续命咖啡' },
    { emoji: '🎬', label: '开拍' },
  ],
  avatarParts: [
    { category: 'accessory', id: 'crown', label: '金冠头饰' },
  ],
  widgets: [
    {
      id: 'room-mood',
      title: '氛围标签',
      renderBadgeText: () => '周末电影马拉松',
    },
  ],
});`;

export const DeveloperDocsModal: React.FC<DeveloperDocsModalProps> = ({
  isOpen,
  plugins,
  onTogglePlugin,
  onClose,
}) => {
  const [tab, setTab] = useState<'plugins' | 'architecture' | 'sdk'>('plugins');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copyCode = () => {
    navigator.clipboard?.writeText(SAMPLE_PLUGIN_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-zinc-900">开发者文档与社区插件扩展中心</h3>
            <p className="text-xs text-zinc-500 mt-0.5">开放 KokoPlugin 运行时注册表 · 完整支持二次开发与自定义拓展</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 cursor-pointer"
            aria-label="关闭文档"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-zinc-200 flex items-center gap-2 bg-[#F4F5F7]/60">
          <button
            type="button"
            onClick={() => setTab('plugins')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              tab === 'plugins'
                ? 'border-[#FF5A36] text-zinc-900 bg-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Puzzle className="w-3.5 h-3.5" />
            社区插件沙箱
          </button>
          <button
            type="button"
            onClick={() => setTab('architecture')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              tab === 'architecture'
                ? 'border-[#FF5A36] text-zinc-900 bg-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            协议与架构规范
          </button>
          <button
            type="button"
            onClick={() => setTab('sdk')}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-xl border-b-2 flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              tab === 'sdk'
                ? 'border-[#FF5A36] text-zinc-900 bg-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Plugin SDK 示例
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-sm text-zinc-700">
          {tab === 'plugins' && (
            <div className="space-y-4">
              <p className="text-xs text-zinc-600 leading-relaxed">
                以下社区插件已通过 <code className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded">pluginRegistry</code> 注册。点击开关即可在当前运行态实时注入新地图、新表情包、Q版配饰或中央屏幕挂件：
              </p>
              <div className="space-y-3">
                {plugins.map(({ plugin, enabled }) => (
                  <div
                    key={plugin.id}
                    className="p-4 rounded-2xl border border-zinc-200 flex items-start justify-between gap-4 bg-white"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-900 text-sm">{plugin.name}</span>
                        <span className="font-mono text-[11px] text-zinc-400">v{plugin.version} · {plugin.author}</span>
                      </div>
                      <p className="text-xs text-zinc-600 leading-relaxed">{plugin.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onTogglePlugin(plugin.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-colors cursor-pointer ${
                        enabled
                          ? 'bg-[#10B981] text-white'
                          : 'bg-zinc-900 text-white hover:bg-zinc-800'
                      }`}
                    >
                      {enabled ? '已启用' : '启用插件'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'architecture' && (
            <div className="space-y-4 text-xs leading-relaxed">
              <div className="p-4 rounded-2xl bg-[#F4F5F7] border border-zinc-200 space-y-2">
                <h4 className="font-semibold text-zinc-900 text-sm">1. 权威服务端 WebSocket 事件模型</h4>
                <ul className="list-disc pl-5 space-y-1 text-zinc-600 font-mono">
                  <li>room:join / room:init — 房间状态初始化与服务端时间戳对齐</li>
                  <li>player:move / player:moved — 60ms 节流同步坐标、朝向与坐姿</li>
                  <li>video:control / video:synced — 点播、play/pause/seek、next 切下一部</li>
                  <li>video:queued — 点播只入队时给发起人的回执（含排队位次，不换片）</li>
                  <li>video:rejected — 非点播人修改播放进度时被拒绝（控片权在点播人手上）</li>
                  <li>video:control(action=progress) — 点播人每 2 秒上报真实播放位置，静默广播给全房间对齐</li>
                  <li>video:control(action=next) — 跳过当前影片，房间里谁都能发（不需要投票）</li>
                  <li>webrtc:signal — 点对点空间语音 SDP/ICE 信令透传</li>
                  <li>scene:update / scene:updated — 地图切换与可交互家具实时同步</li>
                </ul>
              </div>
              <div className="p-4 rounded-2xl bg-[#F4F5F7] border border-zinc-200 space-y-2">
                <h4 className="font-semibold text-zinc-900 text-sm">2. 空间距离语音衰减公式 (Web Audio API)</h4>
                <p className="text-zinc-600">
                  在全音量半径 <code className="font-mono">110px</code> 内增益为 <code className="font-mono">1.0</code>，超出后按幂次曲线平滑衰减至 <code className="font-mono">420px</code> 处静音；当发言者站上舞台区或开启「舞台广播」时，GainNode 自动强制提升为 <code className="font-mono">1.0</code> 覆盖全房间。
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-[#F4F5F7] border border-zinc-200 space-y-2">
                <h4 className="font-semibold text-zinc-900 text-sm">3. Firestore 云端持久化结构</h4>
                <p className="text-zinc-600">
                  已登录用户数据隔离存储于 <code className="font-mono">/profiles/&#123;uid&#125;</code> 与 <code className="font-mono">/scenes/&#123;sceneId&#125;</code>，并受零信任 Firestore Rules 保护。完整开发手册详见项目根目录 <code className="font-mono">docs/DEVELOPER_GUIDE.md</code>。
                </p>
              </div>
            </div>
          )}

          {tab === 'sdk' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600">
                  编写自定义插件并调用 <code className="font-mono text-zinc-900">pluginRegistry.register()</code> 即可热加载扩展：
                </span>
                <button
                  type="button"
                  onClick={copyCode}
                  className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? '已复制' : '复制代码'}
                </button>
              </div>
              <pre className="p-4 rounded-2xl bg-zinc-950 text-zinc-100 font-mono text-xs overflow-x-auto leading-relaxed">
                <code>{SAMPLE_PLUGIN_CODE}</code>
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
