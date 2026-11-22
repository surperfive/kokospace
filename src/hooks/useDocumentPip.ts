import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Document Picture-in-Picture：把一块真实 DOM（我们的迷你播放器）搬进一个**系统级悬浮窗**，
 * 切到别的标签页、别的应用（VS Code、Word…）都能一直看到、一直播。
 *
 * 只有 Chromium 系支持（Chrome / Edge 116+），Safari / Firefox 会走到不支持分支。
 * 关键点：
 *  - 新窗口是独立 document，主文档的 Tailwind 样式不会跟过去，必须把 <link>/<style> 逐个克隆过去；
 *  - 不能把已有的 <video> 节点“移动”过去（会重载），所以是**重新挂载**一份迷你播放器，
 *    播放位置靠房间时钟 getExpectedTime() 自然对齐；
 *  - 用户从浏览器自带的“返回标签页”关掉窗口时触发 pagehide，这里要把 container 清空，
 *    小窗才会自动回落到页面里。
 */
export function useDocumentPip(opts?: { width?: number; height?: number; onClosed?: () => void }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const winRef = useRef<any>(null);
  const appWindowRef = useRef<Window | null>(null);
  /** 用 ref 存回调：调用方每次渲染都会传新函数，不能让它进 open 的依赖 */
  const onClosedRef = useRef(opts?.onClosed);
  onClosedRef.current = opts?.onClosed;

  const supported =
    typeof window !== 'undefined' && Boolean((window as any).documentPictureInPicture);

  const close = useCallback(() => {
    const win = winRef.current;
    winRef.current = null;
    setContainer(null);
    try {
      win?.close();
    } catch {
      /* ignore */
    }
  }, []);

  const open = useCallback(async () => {
    const dpip = (window as any).documentPictureInPicture;
    if (!dpip) return false;
    // 已经开着就不重复开
    if (winRef.current) return true;
    try {
      const win: Window = await dpip.requestWindow({
        width: opts?.width ?? 380,
        height: opts?.height ?? 300,
      });
      appWindowRef.current = win;
      winRef.current = win;

      const doc = win.document;
      // 样式必须搬：Vite 开发模式是 <style>，生产是 <link rel=stylesheet>
      document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
        doc.head.appendChild(node.cloneNode(true));
      });

      doc.documentElement.style.background = '#09090b';
      doc.body.style.margin = '0';
      doc.body.style.overflow = 'hidden';
      doc.body.style.background = '#09090b';

      const root = doc.createElement('div');
      root.id = 'koko-pip-root';
      root.style.cssText = 'position:absolute;inset:0;';
      doc.body.appendChild(root);

      win.addEventListener('pagehide', () => {
        winRef.current = null;
        appWindowRef.current = null;
        setContainer(null);
        // 用户从浏览器自带的「返回标签页」关掉了悬浮窗：调用方据此退出小窗模式
        onClosedRef.current?.();
      });

      setContainer(root);
      return true;
    } catch {
      return false;
    }
  }, [opts?.width, opts?.height]);

  // 组件卸载（退出房间 / 热更新）时别把悬浮窗留在桌面上
  useEffect(
    () => () => {
      try {
        winRef.current?.close();
      } catch {
        /* ignore */
      }
    },
    []
  );

  return { supported, container, open, close };
}
