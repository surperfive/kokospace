import React from 'react';
import { Dices, Check, Cloud, LogIn, LogOut, X } from 'lucide-react';
import { User } from 'firebase/auth';
import { AvatarConfig, AvatarPartPluginItem } from '../types/metaverse';
import { HAIR_PALETTE, OUTFIT_PALETTE, SKIN_PALETTE } from '../data/maps';
import { AvatarPreviewCanvas } from './AvatarPreviewCanvas';

interface AvatarEditorModalProps {
  isOpen: boolean;
  isInitialLobby: boolean;
  name: string;
  avatar: AvatarConfig;
  user: User | null;
  roomId: string;
  isSyncingCloud: boolean;
  pluginParts: AvatarPartPluginItem[];
  onChangeName: (name: string) => void;
  onChangeRoomId: (roomId: string) => void;
  onChangeAvatar: (avatar: AvatarConfig) => void;
  onSignInGoogle: () => void;
  onSignOut: () => void;
  onSaveAndEnter: () => void;
  onClose?: () => void;
}

const HAIR_OPTIONS = [
  { id: 'short', label: '清爽短发' },
  { id: 'bob', label: '几何波波头' },
  { id: 'bun', label: '元气丸子头' },
  { id: 'wavy', label: '微卷长发' },
  { id: 'sidepart', label: '斜分刘海' },
  { id: 'spiky', label: '蓬松刺猬头' },
];

const EYE_OPTIONS = [
  { id: 'smile', label: '元气豆豆眼' },
  { id: 'star', label: '高光星星眼' },
  { id: 'gentle', label: '温柔弯弯眼' },
  { id: 'wink', label: '俏皮眨眼' },
  { id: 'cool', label: '墨镜潮酷' },
];

const OUTFIT_OPTIONS = [
  { id: 'hoodie', label: '连帽卫衣' },
  { id: 'overalls', label: '牛仔背带' },
  { id: 'knit', label: '学院针织' },
  { id: 'blazer', label: '休闲西装' },
  { id: 'dress', label: 'A字连衣裙' },
];

const BASE_ACCESSORIES = [
  { id: 'none', label: '无配饰' },
  { id: 'headphones', label: '头戴耳机' },
  { id: 'beret', label: '画家贝雷帽' },
  { id: 'glasses', label: '圆框眼镜' },
  { id: 'catEars', label: '猫耳发箍' },
];

export const AvatarEditorModal: React.FC<AvatarEditorModalProps> = ({
  isOpen,
  isInitialLobby,
  name,
  avatar,
  user,
  roomId,
  isSyncingCloud,
  pluginParts,
  onChangeName,
  onChangeRoomId,
  onChangeAvatar,
  onSignInGoogle,
  onSignOut,
  onSaveAndEnter,
  onClose,
}) => {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/55 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-white rounded-3xl border border-zinc-200 shadow-2xl overflow-hidden flex flex-col md:flex-row my-auto">
        {/* Left Preview & Account Sync Column */}
        <div className="md:w-72 bg-[#F4F5F7] p-6 flex flex-col items-center justify-between border-b md:border-b-0 md:border-r border-zinc-200">
          <div className="w-full flex items-center justify-between">
            <span className="font-display font-bold text-lg tracking-tight text-zinc-900">
              KokoSpace
            </span>
            {!isInitialLobby && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="md:hidden p-2 rounded-lg text-zinc-500 hover:bg-zinc-200/70"
                aria-label="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="my-4 w-full flex flex-col items-center">
            <div className="w-40 h-40 rounded-2xl bg-white border border-zinc-200/90 shadow-sm flex items-center justify-center">
              <AvatarPreviewCanvas avatar={avatar} name={name} size={148} />
            </div>
            <button
              type="button"
              onClick={randomizeAvatar}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <Dices className="w-3.5 h-3.5" />
              随机搭配形象
            </button>
          </div>

          {/* Google Account Cloud Sync Block */}
          <div className="w-full pt-4 border-t border-zinc-200/80">
            {user ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
                  <Cloud className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">已登录 · {user.displayName || user.email}</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  形象与自定义场景将自动同步至云端，手机电脑登录同一账号即可恢复。
                </p>
                <button
                  type="button"
                  onClick={onSignOut}
                  className="mt-1 w-full py-1.5 px-3 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-medium text-zinc-700 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  退出登录
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onSignInGoogle}
                  className="w-full py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Google 登录云端同步
                </button>
                <p className="text-[11px] text-zinc-500 text-center">
                  或直接作为游客进入体验
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Controls Column */}
        <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between max-h-[82vh] overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-xl font-bold text-zinc-900">
                  {isInitialLobby ? '定制你的 Q 版虚拟化身' : '编辑形象与昵称'}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  扁平几何矢量风 · 实时同步至当前共看房间
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
                <div className="flex items-center gap-2">
                  {SKIN_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeAvatar({ ...avatar, skinColor: c })}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full border-2 cursor-pointer transition-transform ${
                        avatar.skinColor === c ? 'border-zinc-900 scale-110' : 'border-zinc-200'
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
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${
                        avatar.hairColor === c ? 'border-zinc-900 scale-110' : 'border-zinc-200'
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
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-zinc-700">服饰穿搭</span>
                <div className="flex items-center gap-1.5">
                  {OUTFIT_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onChangeAvatar({ ...avatar, outfitColor: c })}
                      style={{ backgroundColor: c }}
                      className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                        avatar.outfitColor === c ? 'border-zinc-900 scale-110' : 'border-zinc-200'
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
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-zinc-600 hover:bg-zinc-100 cursor-pointer"
              >
                取消
              </button>
            )}
            <button
              type="button"
              onClick={onSaveAndEnter}
              disabled={isSyncingCloud}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#FF5A36] hover:bg-[#E84B28] text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {isInitialLobby ? '进入共看空间' : '保存并同步形象'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
