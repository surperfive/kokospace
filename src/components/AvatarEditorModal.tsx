import React, { useEffect, useState } from 'react';
import { Dices, Check, X, RotateCcw } from 'lucide-react';
import { AvatarConfig, AvatarPartPluginItem } from '../types/metaverse';
import { DEFAULT_AVATAR, HAIR_PALETTE, OUTFIT_PALETTE, SKIN_PALETTE } from '../data/maps';
import { AvatarPreviewCanvas, type PreviewPoseMode } from './AvatarPreviewCanvas';

interface AvatarEditorModalProps {
  isOpen: boolean;
  isInitialLobby: boolean;
  name: string;
  avatar: AvatarConfig;
  roomId: string;
  pluginParts: AvatarPartPluginItem[];
  onChangeName: (name: string) => void;
  onChangeRoomId: (roomId: string) => void;
  onChangeAvatar: (avatar: AvatarConfig) => void;
  onSaveAndEnter: () => void;
  onClose?: () => void;
}

const HAIR_OPTIONS = [
  { id: 'bun', label: '元气丸子头' },
  { id: 'short', label: '蓬松短发' },
  { id: 'bob', label: '内扣波波头' },
  { id: 'wavy', label: '柔和微卷' },
  { id: 'sidepart', label: '斜分刘海' },
  { id: 'spiky', label: '刺猬短发' },
];

const EYE_OPTIONS = [
  { id: 'smile', label: '圆眸猫嘴' },
  { id: 'star', label: '星光亮眸' },
  { id: 'gentle', label: '温柔笑眼' },
  { id: 'wink', label: '俏皮眨眼' },
  { id: 'cool', label: '潮酷墨镜' },
];

const OUTFIT_OPTIONS = [
  { id: 'hoodie', label: '翻领夹克' },
  { id: 'overalls', label: '背带工装' },
  { id: 'knit', label: '软糯针织' },
  { id: 'blazer', label: '学院西装' },
  { id: 'dress', label: '泡泡连衣裙' },
];

const BASE_ACCESSORIES = [
  { id: 'none', label: '清爽无饰' },
  { id: 'headphones', label: '包耳耳机' },
  { id: 'beret', label: '画家贝雷帽' },
  { id: 'glasses', label: '圆框眼镜' },
  { id: 'catEars', label: '渐变猫耳' },
];

const DIR_OPTIONS: Array<{ id: 'down' | 'left' | 'right' | 'up'; label: string }> = [
  { id: 'down', label: '正面' },
  { id: 'left', label: '左侧' },
  { id: 'right', label: '右侧' },
  { id: 'up', label: '背面' },
];

const POSE_OPTIONS: Array<{ id: PreviewPoseMode; label: string }> = [
  { id: 'idle', label: '待机' },
  { id: 'walk', label: '行走' },
  { id: 'carry', label: '举起' },
];

export const AvatarEditorModal: React.FC<AvatarEditorModalProps> = ({
  isOpen,
  isInitialLobby,
  name,
  avatar,
  roomId,
  pluginParts,
  onChangeName,
  onChangeRoomId,
  onChangeAvatar,
  onSaveAndEnter,
  onClose,
}) => {
  const [previewDir, setPreviewDir] = useState<'down' | 'left' | 'right' | 'up'>('down');
  const [previewMode, setPreviewMode] = useState<PreviewPoseMode>('idle');

  useEffect(() => {
    if (!isOpen) return;
    setPreviewDir('down');
    setPreviewMode('idle');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isInitialLobby || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isInitialLobby, onClose]);

  if (!isOpen) return null;

  const accessoryOptions = [
    ...BASE_ACCESSORIES,
    ...pluginParts
      .filter((p) => p.category === 'accessory')
      .map((p) => ({ id: p.id, label: p.label })),
  ];

  const randomizeAvatar = () => {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    onChangeAvatar({
      skinColor: pick(SKIN_PALETTE),
      hairStyle: pick(HAIR_OPTIONS).id,
      hairColor: pick(HAIR_PALETTE),
      eyeStyle: pick(EYE_OPTIONS).id,
      outfitStyle: pick(OUTFIT_OPTIONS).id,
      outfitColor: pick(OUTFIT_PALETTE),
      accessory: pick(accessoryOptions).id,
    });
  };

  const resetDefaultAvatar = () => {
    onChangeAvatar({ ...DEFAULT_AVATAR });
    setPreviewDir('down');
    setPreviewMode('idle');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/55 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-4xl bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col md:flex-row my-auto">
        {/* Left Preview Studio Column */}
        <div className="md:w-80 bg-[#F4F5F7] p-5 sm:p-6 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-zinc-200 gap-4">
          <div className="w-full flex items-center justify-between">
            <span className="font-display font-bold text-lg tracking-tight text-zinc-900 whitespace-nowrap">
              KokoSpace
            </span>
            {!isInitialLobby && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="md:hidden p-2 rounded-lg text-zinc-500 hover:bg-zinc-200/70 cursor-pointer"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="w-full flex flex-col items-center gap-3">
            {/* High-precision 2.5D Studio Stage */}
            <div className="w-48 h-48 rounded-2xl bg-white border border-zinc-200/90 shadow-sm overflow-hidden flex items-center justify-center">
              <AvatarPreviewCanvas
                avatar={avatar}
                name={name}
                size={188}
                dir={previewDir}
                previewMode={previewMode}
                showStudioBackdrop
              />
            </div>

            {/* 4-Direction Turn Controls */}
            <div className="w-full max-w-[232px] grid grid-cols-4 gap-1 p-1 bg-zinc-200/70 rounded-xl">
              {DIR_OPTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setPreviewDir(d.id)}
                  className={`py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    previewDir === d.id
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Pose Preview Controls */}
            <div className="w-full max-w-[232px] grid grid-cols-3 gap-1 p-1 bg-zinc-200/70 rounded-xl">
              {POSE_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPreviewMode(m.id)}
                  className={`py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    previewMode === m.id
                      ? 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Quick Shuffle / Default Reset */}
            <div className="w-full max-w-[232px] grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={randomizeAvatar}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Dices className="w-3.5 h-3.5 shrink-0" />
                <span>随机搭配</span>
              </button>
              <button
                type="button"
                onClick={resetDefaultAvatar}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>默认形象</span>
              </button>
            </div>
          </div>

          <div className="w-full pt-3 border-t border-zinc-200/80">
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              形象与昵称保存在当前设备中，下次打开自动恢复，无需登录任何账号。
            </p>
          </div>
        </div>

        {/* Right Controls Column */}
        <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between max-h-[86vh] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-zinc-900">
                  {isInitialLobby ? '定制你的 2.5D 虚拟化身' : '编辑形象与昵称'}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  柔光厚涂矢量画风 · 实时同步至当前共看房间
                </p>
              </div>
              {!isInitialLobby && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="hidden md:flex p-2 rounded-xl text-zinc-500 hover:bg-zinc-100 cursor-pointer"
                  aria-label="关闭窗口"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Name & Room */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">玩家昵称</label>
                <input
                  type="text"
                  maxLength={24}
                  value={name}
                  onChange={(e) => onChangeName(e.target.value)}
                  placeholder="输入你的昵称"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
                />
              </div>
              {isInitialLobby && (
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">房间号（同房即联机）</label>
                  <input
                    type="text"
                    maxLength={32}
                    value={roomId}
                    onChange={(e) => onChangeRoomId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="lobby"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
                  />
                </div>
              )}
            </div>

            {/* Skin & Hair Colors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <span className="block text-xs font-medium text-zinc-700 mb-1.5">肤色</span>
                <div className="flex items-center gap-2 flex-wrap">
                  {SKIN_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeAvatar({ ...avatar, skinColor: c })}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform ${
                        avatar.skinColor.toUpperCase() === c.toUpperCase()
                          ? 'border-zinc-900 scale-110 ring-2 ring-zinc-900/15'
                          : 'border-zinc-200 hover:scale-105'
                      }`}
                      aria-label={`肤色 ${c}`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <span className="block text-xs font-medium text-zinc-700 mb-1.5">发色</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {HAIR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeAvatar({ ...avatar, hairColor: c })}
                      style={{ backgroundColor: c }}
                      className={`w-6.5 h-6.5 rounded-full border-2 cursor-pointer transition-transform ${
                        avatar.hairColor.toUpperCase() === c.toUpperCase()
                          ? 'border-zinc-900 scale-110 ring-2 ring-zinc-900/15'
                          : 'border-zinc-200 hover:scale-105'
                      }`}
                      aria-label={`发色 ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Hair Style */}
            <div className="mb-4">
              <span className="block text-xs font-medium text-zinc-700 mb-1.5">发型</span>
              <div className="grid grid-cols-3 gap-1.5">
                {HAIR_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeAvatar({ ...avatar, hairStyle: opt.id })}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap truncate ${
                      avatar.hairStyle === opt.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Eyes */}
            <div className="mb-4">
              <span className="block text-xs font-medium text-zinc-700 mb-1.5">五官神态</span>
              <div className="flex flex-wrap gap-1.5">
                {EYE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeAvatar({ ...avatar, eyeStyle: opt.id })}
                    className={`py-1.5 px-3 rounded-xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      avatar.eyeStyle === opt.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Outfit & Color */}
            <div className="mb-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-medium text-zinc-700 whitespace-nowrap">服饰穿搭</span>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {OUTFIT_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeAvatar({ ...avatar, outfitColor: c })}
                      style={{ backgroundColor: c }}
                      className={`w-5.5 h-5.5 rounded-full border-2 cursor-pointer transition-transform ${
                        avatar.outfitColor.toUpperCase() === c.toUpperCase()
                          ? 'border-zinc-900 scale-110 ring-2 ring-zinc-900/15'
                          : 'border-zinc-200 hover:scale-105'
                      }`}
                      aria-label={`服饰颜色 ${c}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {OUTFIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeAvatar({ ...avatar, outfitStyle: opt.id })}
                    className={`py-1.5 px-3 rounded-xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      avatar.outfitStyle === opt.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Accessories */}
            <div className="mb-4">
              <span className="block text-xs font-medium text-zinc-700 mb-1.5">头饰配件</span>
              <div className="flex flex-wrap gap-1.5">
                {accessoryOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChangeAvatar({ ...avatar, accessory: opt.id })}
                    className={`py-1.5 px-3 rounded-xl text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      avatar.accessory === opt.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            {!isInitialLobby && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-600 hover:bg-zinc-100 whitespace-nowrap cursor-pointer"
              >
                取消
              </button>
            )}
            <button
              type="button"
              onClick={onSaveAndEnter}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#FF5A36] hover:bg-[#E84B28] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{isInitialLobby ? '进入共看空间' : '保存形象'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
