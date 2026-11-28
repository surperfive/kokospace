import React, { useEffect, useRef, useState } from 'react';
import { Dices, Check, X, RotateCcw, Upload } from 'lucide-react';
import { AvatarConfig, AvatarPartPluginItem, CustomAvatarLayers } from '../types/metaverse';
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

const THEME_PRESETS = [
  {
    id: 'default',
    label: '原版潮流',
    hairStyle: 'bob',
    eyeStyle: 'rainbow',
    outfitStyle: 'pleated',
  },
  {
    id: 'sailor',
    label: '学院水手',
    hairStyle: 'sailor',
    eyeStyle: 'sailor',
    outfitStyle: 'sailor',
  },
  {
    id: 'explorer',
    label: '探险家',
    hairStyle: 'explorer',
    eyeStyle: 'explorer',
    outfitStyle: 'explorer',
  },
  {
    id: 'punk',
    label: '朋克机车',
    hairStyle: 'punk',
    eyeStyle: 'punk',
    outfitStyle: 'punk',
  },
  {
    id: 'wuxia',
    label: '古风侠客',
    hairStyle: 'wuxia',
    eyeStyle: 'punkGrin',
    outfitStyle: 'wuxia',
  },
];

const HAIR_OPTIONS = [
  { id: 'bob', label: '原版鸭舌帽', thumb: '/assets/avatar-parts/user-layers/haircap/front.png' },
  { id: 'sailor', label: '水手双麻花', thumb: '/assets/avatar-parts/packs/sailor/haircap/front.png' },
  { id: 'explorer', label: '探险护目镜', thumb: '/assets/avatar-parts/packs/explorer/haircap/front.png' },
  { id: 'punk', label: '朋克护目镜', thumb: '/assets/avatar-parts/packs/punk/haircap/front.png' },
  { id: 'punkBandana', label: '朋克头巾', thumb: '/assets/avatar-parts/packs/punk/haircap/bandana_front.png' },
  { id: 'wuxia', label: '古风高马尾', thumb: '/assets/avatar-parts/packs/wuxia/haircap/front.png' },
];

const EYE_OPTIONS = [
  { id: 'rainbow', label: '原版虹彩', thumb: '/assets/avatar-parts/user-layers/head/front_rainbow.png' },
  { id: 'happy', label: '虹彩大笑', thumb: '/assets/avatar-parts/user-layers/head/front_happy.png' },
  { id: 'surprised', label: '虹彩惊讶', thumb: '/assets/avatar-parts/user-layers/head/front_surprised.png' },
  { id: 'sailor', label: '星空蓝眸', thumb: '/assets/avatar-parts/packs/sailor/head/front_gentle.png' },
  { id: 'sailorHappy', label: '元气蓝眸笑', thumb: '/assets/avatar-parts/packs/sailor/head/front_happy.png' },
  { id: 'explorer', label: '探险琥珀眸', thumb: '/assets/avatar-parts/packs/explorer/head/front_happy.png' },
  { id: 'punk', label: '帅气创可贴', thumb: '/assets/avatar-parts/packs/punk/head/front_smile.png' },
  { id: 'punkGrin', label: '张扬露齿笑', thumb: '/assets/avatar-parts/packs/punk/head/front_grin.png' },
];

const OUTFIT_OPTIONS = [
  { id: 'pleated', label: '原版百褶裙', thumb: '/assets/avatar-parts/user-layers/body/front_idle_0.png' },
  { id: 'sailor', label: '学院水手服', thumb: '/assets/avatar-parts/packs/sailor/body/front_idle_0.png' },
  { id: 'explorer', label: '探险家套装', thumb: '/assets/avatar-parts/packs/explorer/body/front_idle_0.png' },
  { id: 'punk', label: '朋克机车服', thumb: '/assets/avatar-parts/packs/punk/body/front_idle_0.png' },
  { id: 'wuxia', label: '古风侠客装', thumb: '/assets/avatar-parts/packs/wuxia/body/front_idle_0.png' },
];

const CUSTOM_LAYER_SLOTS: Array<{ key: keyof CustomAvatarLayers; label: string }> = [
  { key: 'body', label: '服装身体' },
  { key: 'head', label: '头部五官' },
  { key: 'hairCap', label: '发型帽子' },
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
  const uploadSlotRef = useRef<keyof CustomAvatarLayers>('body');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const pluginHairCount = pluginParts.filter((p) => p.category === 'hairStyle').length;
  void pluginHairCount;

  const triggerCustomLayerUpload = (slot: keyof CustomAvatarLayers) => {
    uploadSlotRef.current = slot;
    fileInputRef.current?.click();
  };

  const handleCustomLayerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const slot = uploadSlotRef.current;
      onChangeAvatar({
        ...avatar,
        customLayers: {
          ...avatar.customLayers,
          [slot]: reader.result,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  const clearCustomLayer = (slot: keyof CustomAvatarLayers) => {
    const next = { ...(avatar.customLayers || {}) };
    delete next[slot];
    onChangeAvatar({
      ...avatar,
      customLayers: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const applyThemePreset = (preset: (typeof THEME_PRESETS)[number]) => {
    onChangeAvatar({
      ...DEFAULT_AVATAR,
      hairStyle: preset.hairStyle,
      eyeStyle: preset.eyeStyle,
      outfitStyle: preset.outfitStyle,
      customLayers: undefined,
    });
  };

  const randomizeAvatar = () => {
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
    onChangeAvatar({
      skinColor: pick(SKIN_PALETTE),
      hairStyle: pick(HAIR_OPTIONS).id,
      hairColor: DEFAULT_AVATAR.hairColor,
      eyeStyle: pick(EYE_OPTIONS).id,
      outfitStyle: pick(OUTFIT_OPTIONS).id,
      outfitColor: DEFAULT_AVATAR.outfitColor,
      accessory: 'cap',
      customLayers: undefined,
    });
  };

  const resetDefaultAvatar = () => {
    onChangeAvatar({ ...DEFAULT_AVATAR, customLayers: undefined });
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
            {/* High-precision Chibi Studio Stage */}
            <div
              data-testid="avatar-preview-stage"
              className="w-48 h-48 rounded-2xl bg-white border border-zinc-200/90 shadow-sm overflow-hidden flex items-center justify-center"
            >
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
        <div className="flex-1 flex flex-col max-h-[86vh] overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 pb-3">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-zinc-900">
                  {isInitialLobby ? '定制你的 Q 版虚拟化身' : '编辑形象与昵称'}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  3 层可替换 PNG 拆分层（服装身体 · 头部五官 · 发型帽子）
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

            {/* Quick 1-Click Theme Packs */}
            <div className="mb-3.5">
              <span className="block text-xs font-medium text-zinc-700 mb-1.5">一键换主题套装</span>
              <div className="grid grid-cols-5 gap-1.5">
                {THEME_PRESETS.map((preset) => {
                  const isActive =
                    !avatar.customLayers &&
                    avatar.hairStyle === preset.hairStyle &&
                    avatar.eyeStyle === preset.eyeStyle &&
                    avatar.outfitStyle === preset.outfitStyle;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyThemePreset(preset)}
                      className={`py-1.5 px-2 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-[#FF5A36] text-white border-[#FF5A36] shadow-xs'
                          : 'bg-[#F4F5F7] text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Hair & Hat Style (6 Unified Packs) */}
            <div className="mb-3.5">
              <span className="block text-xs font-medium text-zinc-700 mb-1.5">发型与帽子</span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {HAIR_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onChangeAvatar({
                        ...avatar,
                        hairStyle: opt.id,
                        customLayers: avatar.customLayers
                          ? { ...avatar.customLayers, hairCap: undefined }
                          : undefined,
                      })
                    }
                    className={`flex flex-col items-center gap-1 py-1.5 px-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      !avatar.customLayers?.hairCap && avatar.hairStyle === opt.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#F3F6FB]">
                      <img
                        src={opt.thumb}
                        alt={opt.label}
                        referrerPolicy="no-referrer"
                        className="max-w-full max-h-full object-contain"
                      />
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Eyes & Faces (8 Native 4-Direction Heads) */}
            <div className="mb-3.5">
              <span className="block text-xs font-medium text-zinc-700 mb-1.5">五官表情</span>
              <div className="grid grid-cols-4 gap-1.5">
                {EYE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onChangeAvatar({
                        ...avatar,
                        eyeStyle: opt.id,
                        customLayers: avatar.customLayers
                          ? { ...avatar.customLayers, head: undefined }
                          : undefined,
                      })
                    }
                    className={`flex flex-col items-center gap-1 py-1.5 px-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      !avatar.customLayers?.head && avatar.eyeStyle === opt.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="w-10 h-8 flex items-center justify-center rounded-lg bg-[#FDECE2]">
                      <img
                        src={opt.thumb}
                        alt={opt.label}
                        referrerPolicy="no-referrer"
                        className="max-w-[92%] max-h-[90%] object-contain"
                      />
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Outfit & Color (5 Full 24-Frame Outfits) */}
            <div className="mb-3.5">
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
              <div className="grid grid-cols-5 gap-1.5">
                {OUTFIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onChangeAvatar({
                        ...avatar,
                        outfitStyle: opt.id,
                        customLayers: avatar.customLayers
                          ? { ...avatar.customLayers, body: undefined }
                          : undefined,
                      })
                    }
                    className={`flex flex-col items-center gap-1 py-1.5 px-1.5 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      !avatar.customLayers?.body && avatar.outfitStyle === opt.id
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <span className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#F3F6FB]">
                      <img
                        src={opt.thumb}
                        alt={opt.label}
                        referrerPolicy="no-referrer"
                        className="max-w-full max-h-full object-contain"
                      />
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Direct Custom Layer PNG Upload Replacement */}
            <div className="mb-4 p-2.5 rounded-2xl bg-[#F4F5F7] border border-zinc-200/80">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/webp,image/jpeg"
                onChange={handleCustomLayerFile}
                className="hidden"
              />
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] font-semibold text-zinc-700">
                  导入自定义 PNG 替换图层
                </span>
                <span className="text-[10px] text-zinc-400">支持透明 PNG / 自动抠纯白底</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {CUSTOM_LAYER_SLOTS.map((slot) => {
                  const hasCustom = Boolean(avatar.customLayers?.[slot.key]);
                  return (
                    <div key={slot.key} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => triggerCustomLayerUpload(slot.key)}
                        className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-xl text-[11px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                          hasCustom
                            ? 'bg-[#FF5A36]/10 text-[#D94322] border-[#FF5A36]/40'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
                        }`}
                      >
                        <Upload className="w-3 h-3 shrink-0" />
                        <span>{hasCustom ? `已替换${slot.label}` : `换${slot.label}`}</span>
                      </button>
                      {hasCustom && (
                        <button
                          type="button"
                          onClick={() => clearCustomLayer(slot.key)}
                          aria-label={`还原${slot.label}`}
                          className="p-1.5 rounded-xl bg-white border border-zinc-200 text-zinc-500 hover:text-zinc-900 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="shrink-0 px-5 sm:px-6 py-3 border-t border-zinc-200 bg-white flex items-center justify-end gap-3">
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
