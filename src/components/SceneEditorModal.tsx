import React, { useState } from 'react';
import { X, Trash2, Check, Palette, RotateCcw } from 'lucide-react';
import { FurnitureType, MapId, MapThemeDefinition } from '../types/metaverse';
import type { LocalScenePreset } from '../lib/scenePresets';

interface SceneEditorModalProps {
  isOpen: boolean;
  maps: MapThemeDefinition[];
  currentMapId: MapId;
  savedScenes: LocalScenePreset[];
  isEditingOnCanvas: boolean;
  selectedBrush: FurnitureType | 'erase';
  onClose: () => void;
  onSelectMap: (mapId: MapId) => void;
  onToggleCanvasEditMode: (editing: boolean) => void;
  onSelectBrush: (brush: FurnitureType | 'erase') => void;
  onResetFurniture: () => void;
  onSaveSceneLocal: (roomName: string) => Promise<void>;
  onLoadLocalScene: (preset: LocalScenePreset) => void;
  onDeleteLocalScene: (sceneId: string) => Promise<void>;
  /** 打开像素画板（画完直接进画布编辑挂到墙上） */
  onOpenPixelStudio: () => void;
}

const BRUSH_ITEMS: Array<{ type: FurnitureType | 'erase'; label: string; category: string }> = [
  { type: 'beanbag_coral', label: '珊瑚懒人沙发', category: '座位' },
  { type: 'beanbag_cream', label: '奶油抱枕座', category: '座位' },
  { type: 'sofa_coral', label: '珊瑚双人沙发', category: '座位' },
  { type: 'sofa_slate', label: '深灰双人沙发', category: '座位' },
  { type: 'plant_olive', label: '橄榄盆栽', category: '装饰' },
  { type: 'plant_fern', label: '蕨类绿植', category: '装饰' },
  { type: 'lamp_warm', label: '暖光落地灯', category: '装饰' },
  { type: 'table_round', label: '圆木茶几', category: '装饰' },
  { type: 'erase', label: '移除家具', category: '工具' },
];

export const SceneEditorModal: React.FC<SceneEditorModalProps> = ({
  isOpen,
  maps,
  currentMapId,
  savedScenes,
  isEditingOnCanvas,
  selectedBrush,
  onClose,
  onSelectMap,
  onToggleCanvasEditMode,
  onSelectBrush,
  onResetFurniture,
  onSaveSceneLocal,
  onLoadLocalScene,
  onDeleteLocalScene,
  onOpenPixelStudio,
}) => {
  const [tab, setTab] = useState<'maps' | 'furniture' | 'presets'>('maps');
  const [sceneName, setSceneName] = useState('我的专属影院布置');
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (saving || !sceneName.trim()) return;
    setSaving(true);
    try {
      await onSaveSceneLocal(sceneName.trim());
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/50 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-4 shrink-0">
          <div>
            <h3 className="font-display text-base font-bold text-zinc-900">空间场景与布置</h3>
            <p className="text-xs text-zinc-500 mt-0.5">切换主题空间、自由摆放家具或保存本机布置方案</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Clean Segmented Tabs */}
        <div className="px-6 pt-3 pb-3 border-b border-zinc-200 bg-[#F7F7F8] shrink-0">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-zinc-200/70">
            <button
              type="button"
              onClick={() => setTab('maps')}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                tab === 'maps' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              主题地图 · {maps.length}
            </button>
            <button
              type="button"
              onClick={() => setTab('furniture')}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                tab === 'furniture' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              家具与画框
            </button>
            <button
              type="button"
              onClick={() => setTab('presets')}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors tabular-nums cursor-pointer ${
                tab === 'presets' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              本机方案 · {savedScenes.length}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'maps' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {maps.map((m) => {
                const active = m.id === currentMapId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectMap(m.id)}
                    className={`group rounded-xl overflow-hidden border text-left transition-all cursor-pointer ${
                      active
                        ? 'border-[#FF5A36] ring-2 ring-[#FF5A36]/20 bg-white'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="aspect-[16/9] w-full bg-zinc-100 overflow-hidden relative">
                      <img
                        src={m.coverImage}
                        alt={m.name}
                        referrerPolicy="no-referrer"
                        className={`w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ${
                          m.mapSvg ? 'object-[50%_42%]' : ''
                        }`}
                      />
                    </div>
                    <div className="p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-zinc-900">{m.name}</span>
                        {active && (
                          <span className="text-[11px] font-semibold text-[#FF5A36] flex items-center gap-1 shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            使用中
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{m.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'furniture' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">选择家具画笔</div>
                  <p className="text-xs text-zinc-500 mt-0.5">选好样式后点击「进入画布摆放」，在房间内点击即可放置</p>
                </div>
                <button
                  type="button"
                  onClick={onResetFurniture}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-600 hover:bg-zinc-50 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  恢复默认
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {BRUSH_ITEMS.map((b) => {
                  const active = selectedBrush === b.type;
                  return (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => onSelectBrush(b.type)}
                      className={`px-3 py-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="text-xs font-semibold">{b.label}</div>
                      <div className={`text-[11px] mt-0.5 ${active ? 'text-zinc-300' : 'text-zinc-400'}`}>
                        {b.category}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-5 border-t border-zinc-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenPixelStudio();
                  }}
                  className="px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-medium text-zinc-700 flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Palette className="w-4 h-4 text-[#FF5A36]" />
                  <span>打开像素画板 · 自绘挂画</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onToggleCanvasEditMode(!isEditingOnCanvas);
                    if (!isEditingOnCanvas) onClose();
                  }}
                  className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    isEditingOnCanvas
                      ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                      : 'bg-[#FF5A36] text-white hover:bg-[#E84B28]'
                  }`}
                >
                  {isEditingOnCanvas ? '退出画布编辑' : '进入画布点选摆放'}
                </button>
              </div>
            </div>
          )}

          {tab === 'presets' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  maxLength={40}
                  placeholder="为当前场景布局命名"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-zinc-200 text-xs focus:outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !sceneName.trim()}
                  className="px-4 py-2 rounded-xl bg-[#FF5A36] hover:bg-[#E84B28] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {savedFeedback && <Check className="w-3.5 h-3.5" />}
                  <span>{savedFeedback ? '已保存' : '保存当前方案'}</span>
                </button>
              </div>

              {savedScenes.length === 0 ? (
                <div className="py-10 text-center space-y-1">
                  <div className="text-sm font-medium text-zinc-700">还没有保存过场景方案</div>
                  <p className="text-xs text-zinc-400">布置好家具后可一键存档，随时切换复用</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-200/80 border-t border-b border-zinc-200/80">
                  {savedScenes.map((preset) => (
                    <div key={preset.sceneId} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 truncate">{preset.roomName}</div>
                        <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                          {maps.find((m) => m.id === preset.mapId)?.name || preset.mapId} ·{' '}
                          {preset.furniture.length} 件家具
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadLocalScene(preset);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-medium cursor-pointer"
                        >
                          应用
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteLocalScene(preset.sceneId)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          aria-label="删除方案"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
