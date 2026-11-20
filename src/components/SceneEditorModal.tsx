import React, { useState } from 'react';
import { X, Map, Armchair, HardDrive, Trash2, Check, Sparkles, Palette } from 'lucide-react';
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

const BRUSH_ITEMS: Array<{ type: FurnitureType | 'erase'; label: string }> = [
  { type: 'beanbag_coral', label: '珊瑚懒人沙发' },
  { type: 'beanbag_cream', label: '奶油抱枕座' },
  { type: 'sofa_coral', label: '珊瑚双人沙发' },
  { type: 'sofa_slate', label: '深灰双人沙发' },
  { type: 'plant_olive', label: '橄榄盆栽' },
  { type: 'plant_fern', label: '蕨类绿植' },
  { type: 'lamp_warm', label: '暖光落地灯' },
  { type: 'table_round', label: '圆木茶几' },
  { type: 'erase', label: '点击移除家具' },
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
  const [sceneName, setSceneName] = useState('我的专属影院布置');
  const [saving, setSaving] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSaveSceneLocal(sceneName);
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/45 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col max-h-[86vh]">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-zinc-900">地图切换与场景布置</h3>
            <p className="text-xs text-zinc-500 mt-0.5">切换主题空间，或将自定义家具布局跨平台保存至云端</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 cursor-pointer"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Map Theme Cards */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
              <Map className="w-4 h-4 text-[#FF5A36]" />
              <span>选择共看空间地图 ({maps.length})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {maps.map((m) => {
                const active = m.id === currentMapId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onSelectMap(m.id)}
                    className={`group rounded-2xl overflow-hidden border text-left transition-all cursor-pointer ${
                      active
                        ? 'border-[#FF5A36] ring-2 ring-[#FF5A36]/25 bg-[#FF5A36]/5'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className="h-28 w-full bg-zinc-100 overflow-hidden relative">
                      <img
                        src={m.coverImage}
                        alt={m.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                      />
                      {active && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-zinc-900/85 text-white text-[10px] font-semibold">
                          当前地图
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-semibold text-zinc-900">{m.name}</div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">{m.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Canvas Furniture Layout Editor */}
          <section className="p-4 rounded-2xl bg-[#F4F5F7] border border-zinc-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
                <Armchair className="w-4 h-4 text-[#FF5A36]" />
                <span>自由摆放场景家具</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onResetFurniture}
                  className="px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  恢复默认布局
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onToggleCanvasEditMode(!isEditingOnCanvas);
                    if (!isEditingOnCanvas) onClose();
                  }}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    isEditingOnCanvas
                      ? 'bg-zinc-900 text-white'
                      : 'bg-[#FF5A36] text-white hover:bg-[#E84B28]'
                  }`}
                >
                  {isEditingOnCanvas ? '退出画布编辑' : '进入画布点选摆放'}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BRUSH_ITEMS.map((b) => (
                <button
                  key={b.type}
                  type="button"
                  onClick={() => onSelectBrush(b.type)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border cursor-pointer ${
                    selectedBrush === b.type
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenPixelStudio();
              }}
              className="w-full px-3 py-2 rounded-xl bg-white border border-dashed border-zinc-300 text-[11px] font-medium text-zinc-600 hover:border-[#FF5A36] hover:text-[#FF5A36] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5" />
              像素画画板 · 画一张挂到墙上
            </button>
          </section>

          {/* 本机场景方案（localStorage，无需登录） */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
              <HardDrive className="w-4 h-4 text-[#FF5A36]" />
              <span>本机场景方案</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={sceneName}
                  onChange={(e) => setSceneName(e.target.value)}
                  maxLength={40}
                  placeholder="为当前场景命名"
                  className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-[#FF5A36] hover:bg-[#E84B28] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {savedFeedback ? <Check className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {savedFeedback ? '已保存' : '保存当前方案'}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                方案保存在这台设备上（同名会覆盖），换设备不会同步，也不需要登录。
              </p>

              {savedScenes.length === 0 ? (
                <p className="text-xs text-zinc-400 py-2">还没有保存过方案，点击上方按钮存一份。</p>
              ) : (
                <div className="space-y-2">
                  {savedScenes.map((preset) => (
                    <div
                      key={preset.sceneId}
                      className="flex items-center justify-between p-3 rounded-2xl border border-zinc-200 bg-white"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 truncate">{preset.roomName}</div>
                        <div className="text-[11px] text-zinc-500">
                          地图: {preset.mapId} · 家具数量: {preset.furniture.length}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadLocalScene(preset);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 cursor-pointer"
                        >
                          应用
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteLocalScene(preset.sceneId)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                          title="删除方案"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
