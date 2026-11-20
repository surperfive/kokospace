import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  FlipHorizontal,
  Grid,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Save,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { loadPixelArts, removePixelArt, savePixelArt, type PixelArt } from '../lib/pixelArtStore';

/**
 * 像素画板。
 *
 * 交互骨架参考 Piskel（MIT，https://github.com/piskelapp/piskel）：
 * 铅笔 / 橡皮 / 油漆桶 / 取色 + 网格 + 镜像 + 撤销栈，成品导出 PNG。
 * 调色板用两个常见的开源配色：Sweetie 16（GrafxKid，CC0）与 PICO-8。
 *
 * 之所以没用现成的编辑器组件（dotting / pixel-art-react / pixel-dust）：
 * 它们要么是整站应用，要么自带一套样式和画布交互，嵌进来改造成本比按这套骨架重写更高。
 */

const SWEETIE_16 = [
  '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57',
  '#ffcd75', '#a7f070', '#38b764', '#257179',
  '#29366f', '#3b5dc9', '#41a6f6', '#73eff7',
  '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
];

const PICO_8 = [
  '#000000', '#1d2b53', '#7e2553', '#008751',
  '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
  '#ff004d', '#ffa300', '#ffec27', '#00e436',
  '#29adff', '#83769c', '#ff77a8', '#ffccaa',
];

const SIZES = [16, 24, 32] as const;
type Size = (typeof SIZES)[number];
type Tool = 'pen' | 'eraser' | 'fill' | 'pick';

interface PixelArtStudioProps {
  open: boolean;
  onClose: () => void;
  /** 挂到房间里：App 会切进场景编辑，让用户点一下位置 */
  onHang: (dataUrl: string) => void;
}

const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

export const PixelArtStudio: React.FC<PixelArtStudioProps> = ({ open, onClose, onHang }) => {
  const [size, setSize] = useState<Size>(32);
  const [pixels, setPixels] = useState<string[]>(() => new Array(32 * 32).fill(''));
  const [color, setColor] = useState('#ffcd75');
  const [tool, setTool] = useState<Tool>('pen');
  const [mirror, setMirror] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [paletteName, setPaletteName] = useState<'sweetie' | 'pico'>('sweetie');
  const [arts, setArts] = useState<PixelArt[]>([]);
  const [title, setTitle] = useState('');
  const [past, setPast] = useState<string[][]>([]);
  const [future, setFuture] = useState<string[][]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pixelsRef = useRef(pixels);
  pixelsRef.current = pixels;
  const paintingRef = useRef(false);
  const strokeSnapshotRef = useRef(false);

  const palette = paletteName === 'sweetie' ? SWEETIE_16 : PICO_8;

  useEffect(() => {
    if (open) setArts(loadPixelArts());
  }, [open]);

  /** 改尺寸时保留左上角能对上的像素，不整张清掉 */
  const changeSize = useCallback((next: Size) => {
    setSize(next);
    setPixels((prev) => {
      const grid = new Array(next * next).fill('');
      const oldSize = Math.round(Math.sqrt(prev.length));
      for (let y = 0; y < Math.min(oldSize, next); y++) {
        for (let x = 0; x < Math.min(oldSize, next); x++) {
          grid[y * next + x] = prev[y * oldSize + x] || '';
        }
      }
      return grid;
    });
    setPast([]);
    setFuture([]);
  }, []);

  /** 画布重绘 */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < pixels.length; i++) {
      const c = pixels[i];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(i % size, Math.floor(i / size), 1, 1);
    }
  }, [pixels, size]);

  const pushHistory = useCallback(() => {
    setPast((prev) => [...prev.slice(-39), pixelsRef.current.slice()]);
    setFuture([]);
  }, []);

  const applyPixel = useCallback(
    (x: number, y: number) => {
      const n = size;
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      const value = tool === 'eraser' ? '' : color;
      const idx = y * n + x;
      const mirrorIdx = y * n + (n - 1 - x);
      setPixels((prev) => {
        if (prev[idx] === value && (!mirror || prev[mirrorIdx] === value)) return prev;
        const next = prev.slice();
        next[idx] = value;
        if (mirror) next[mirrorIdx] = value;
        return next;
      });
    },
    [color, mirror, size, tool]
  );

  const floodFill = useCallback(
    (x: number, y: number) => {
      const n = size;
      if (x < 0 || y < 0 || x >= n || y >= n) return;
      const target = pixelsRef.current[y * n + x] || '';
      if (target === color) return;
      const next = pixelsRef.current.slice();
      const stack = [[x, y]];
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        if (cx < 0 || cy < 0 || cx >= n || cy >= n) continue;
        const i = cy * n + cx;
        if ((next[i] || '') !== target) continue;
        next[i] = color;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      setPixels(next);
    },
    [color, size]
  );

  const cellFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * size);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * size);
    return { x: Math.max(0, Math.min(size - 1, x)), y: Math.max(0, Math.min(size - 1, y)) };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = cellFromEvent(e);
    if (tool === 'pick') {
      const picked = pixelsRef.current[y * size + x];
      if (picked) setColor(picked);
      setTool('pen');
      return;
    }
    pushHistory();
    if (tool === 'fill') {
      floodFill(x, y);
      return;
    }
    paintingRef.current = true;
    strokeSnapshotRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    applyPixel(x, y);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    const { x, y } = cellFromEvent(e);
    applyPixel(x, y);
  };

  const endStroke = () => {
    paintingRef.current = false;
  };

  const handleUndo = () => {
    setPast((prev) => {
      if (!prev.length) return prev;
      const snapshot = prev[prev.length - 1];
      setFuture((f) => [pixelsRef.current.slice(), ...f].slice(0, 40));
      setPixels(snapshot);
      return prev.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setFuture((prev) => {
      if (!prev.length) return prev;
      const snapshot = prev[0];
      setPast((p) => [...p.slice(-39), pixelsRef.current.slice()]);
      setPixels(snapshot);
      return prev.slice(1);
    });
  };

  const handleClear = () => {
    pushHistory();
    setPixels(new Array(size * size).fill(''));
  };

  /** 导出成 size×size 的 PNG dataURL（每个格子 1px，渲染时用 pixelated 放大） */
  const exportPng = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    for (let i = 0; i < pixels.length; i++) {
      const c = pixels[i];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(i % size, Math.floor(i / size), 1, 1);
    }
    return canvas.toDataURL('image/png');
  }, [pixels, size]);

  const hasContent = pixels.some(Boolean);

  const handleSave = () => {
    if (!hasContent) return;
    setArts(savePixelArt({ title: title.trim() || '无名像素画', dataUrl: exportPng() }));
  };

  const handleHang = () => {
    if (!hasContent) return;
    const dataUrl = exportPng();
    setArts(savePixelArt({ title: title.trim() || '无名像素画', dataUrl }));
    onHang(dataUrl);
  };

  /** 点已有作品：解回像素网格，可以继续改 */
  const loadArt = (art: PixelArt) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const grid = new Array(size * size).fill('');
      for (let i = 0; i < size * size; i++) {
        if (data[i * 4 + 3] > 16) grid[i] = rgbToHex(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
      }
      setPixels(grid);
      setPast([]);
      setFuture([]);
      setTitle(art.title);
    };
    img.src = art.dataUrl;
  };

  const toolButtons = useMemo(
    () =>
      [
        { id: 'pen' as Tool, label: '铅笔', icon: Pencil },
        { id: 'eraser' as Tool, label: '橡皮', icon: Eraser },
        { id: 'fill' as Tool, label: '油漆桶', icon: PaintBucket },
        { id: 'pick' as Tool, label: '吸管', icon: Pipette },
      ] as const,
    []
  );

  // Ctrl/Cmd + Z 撤销，Shift 加回去重做
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, past, future]);

  if (!open) return null;

  const boardSize = 384;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[92vh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-zinc-200 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-zinc-900">像素画板</h2>
            <p className="text-[11px] text-zinc-500 truncate">
              画完可以挂到房间墙上，房间里所有人都能看到
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col md:flex-row gap-5">
          {/* 左侧：画布 */}
          <div className="flex flex-col items-center gap-3 shrink-0">
            <div
              className="relative rounded-2xl p-2 bg-zinc-100 border border-zinc-200"
              style={{ width: boardSize + 16, maxWidth: '100%' }}
            >
              <div
                className="relative rounded-lg overflow-hidden"
                style={{
                  width: '100%',
                  aspectRatio: '1 / 1',
                  backgroundColor: '#ffffff',
                  backgroundImage:
                    'linear-gradient(45deg, #eceef1 25%, transparent 25%, transparent 75%, #eceef1 75%), linear-gradient(45deg, #eceef1 25%, transparent 25%, transparent 75%, #eceef1 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 8px 8px',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={size}
                  height={size}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endStroke}
                  onPointerCancel={endStroke}
                  onPointerLeave={endStroke}
                  style={{
                    width: '100%',
                    height: '100%',
                    imageRendering: 'pixelated',
                    touchAction: 'none',
                    cursor: tool === 'pick' ? 'crosshair' : 'cell',
                  }}
                />
                {showGrid && (
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, rgba(24,24,27,0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(24,24,27,0.09) 1px, transparent 1px)',
                      backgroundSize: `${100 / size}% ${100 / size}%`,
                    }}
                  />
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => changeSize(s)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
                    size === s
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  {s}×{s}
                </button>
              ))}
              <span className="mx-1 w-px h-4 bg-zinc-200" />
              <button
                type="button"
                onClick={handleUndo}
                disabled={!past.length}
                className="p-1.5 rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 cursor-pointer"
                title="撤销 (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={!future.length}
                className="p-1.5 rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 cursor-pointer"
                title="重做 (Ctrl+Shift+Z)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 rounded-lg text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                title="清空画布"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 右侧：工具与调色板 */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              {toolButtons.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                    tool === t.id
                      ? 'bg-zinc-900 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMirror((v) => !v)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                  mirror ? 'bg-[#FF5A36] text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
                title="左右对称绘制"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
                对称
              </button>
              <button
                type="button"
                onClick={() => setShowGrid((v) => !v)}
                className={`p-1.5 rounded-xl cursor-pointer transition-colors ${
                  showGrid ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                }`}
                title="网格"
              >
                <Grid className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label
                className="relative w-7 h-7 rounded-lg border border-zinc-300 overflow-hidden shrink-0 cursor-pointer"
                style={{ backgroundColor: color }}
                title="自定义颜色"
              >
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </label>
              <span className="text-[11px] font-mono text-zinc-500">{color}</span>
              <div className="ml-auto flex items-center gap-1">
                {(['sweetie', 'pico'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPaletteName(p)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium cursor-pointer ${
                      paletteName === p ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-500'
                    }`}
                    title={p === 'sweetie' ? 'Sweetie 16（开源调色板）' : 'PICO-8 调色板'}
                  >
                    {p === 'sweetie' ? 'Sweetie 16' : 'PICO-8'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-8 gap-1">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  style={{ backgroundColor: c }}
                  className={`aspect-square rounded-md cursor-pointer transition-transform hover:scale-105 ${
                    color.toLowerCase() === c.toLowerCase()
                      ? 'ring-2 ring-zinc-900 ring-offset-1'
                      : 'ring-1 ring-black/10'
                  }`}
                  title={c}
                />
              ))}
            </div>

            <div className="mt-1">
              <div className="text-[11px] text-zinc-500 mb-1">作品名称</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={24}
                placeholder="给它起个名字"
                className="w-full px-3 py-1.5 rounded-xl bg-zinc-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#FF5A36]/40"
              />
            </div>

            {arts.length > 0 && (
              <div className="mt-1">
                <div className="text-[11px] text-zinc-500 mb-1.5">我的画作（点一下继续编辑）</div>
                <div className="flex gap-1.5 flex-wrap">
                  {arts.map((a) => (
                    <div key={a.id} className="relative group">
                      <button
                        type="button"
                        onClick={() => loadArt(a)}
                        className="w-11 h-11 rounded-lg border border-zinc-200 overflow-hidden bg-zinc-50 cursor-pointer"
                        title={a.title}
                      >
                        <img
                          src={a.dataUrl}
                          alt={a.title}
                          className="w-full h-full object-contain"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => setArts(removePixelArt(a.id))}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-900 text-white text-[9px] leading-none hidden group-hover:flex items-center justify-center cursor-pointer"
                        title="删除本地作品"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-3 space-y-1">
              <div className="text-[11px] font-medium text-zinc-700">怎么画</div>
              <ul className="text-[10px] leading-relaxed text-zinc-500 space-y-0.5">
                <li>· 按住左键拖动连续落笔，橡皮擦掉；「对称」开着会左右同时画</li>
                <li>· 吸管可以取画布上已有的颜色，油漆桶填同一色的连通区域</li>
                <li>· 画完点「挂到房间里」，再点房间的墙就挂上去了，所有人可见</li>
                <li>· 挂上去的画存在本机「我的画作」里，随时点回来继续改</li>
              </ul>
            </div>

            <p className="mt-auto text-[10px] leading-relaxed text-zinc-400">
              交互参考 Piskel（MIT）；调色板 Sweetie 16（GrafxKid，CC0）与 PICO-8。
            </p>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-3 border-t border-zinc-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasContent}
            className="px-3 py-2 rounded-xl bg-zinc-100 text-zinc-700 text-xs font-medium flex items-center gap-1.5 hover:bg-zinc-200 disabled:opacity-40 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            存到我的画作
          </button>
          <button
            type="button"
            onClick={handleHang}
            disabled={!hasContent}
            className="px-3.5 py-2 rounded-xl bg-[#FF5A36] text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-[#E84B28] disabled:opacity-40 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            挂到房间里
          </button>
        </div>
      </div>
    </div>
  );
};
