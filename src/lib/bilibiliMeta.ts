/**
 * 浏览器端抓 B 站视频元信息（标题 / 封面 / 时长）
 *
 * 为什么不走服务端：Cloudflare Workers 的出口 IP 会被 B 站风控直接打回
 * `HTTP 412`，加 Referer / UA 都没用。用户自己的浏览器 IP 是正常的，
 * 而 B 站这个接口支持 JSONP（`jsonp=jsonp&callback=xxx`），
 * 用 <script> 加载就能绕过 CORS 拿到数据。
 *
 * 本地 Express 服务端能直连成功，所以这条只是「服务端没拿到时」的补位。
 */

export interface BilibiliMeta {
  title?: string;
  durationSec?: number;
  thumbnail?: string;
}

/** 从任意文本里抠出 BV 号（与服务端共用一份实现，避免两边规则漂移） */
export { extractBvid } from './videoMeta';

export function fetchBilibiliMetaJsonp(
  bvid: string,
  page = 1,
  timeoutMs = 4000
): Promise<BilibiliMeta | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !bvid) {
      resolve(null);
      return;
    }

    const cbName = `__bili_meta_${Math.random().toString(36).slice(2, 10)}`;
    const script = document.createElement('script');
    let settled = false;

    const cleanup = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        delete (window as unknown as Record<string, unknown>)[cbName];
      } catch {
        /* ignore */
      }
      script.remove();
    };

    const timer = window.setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    (window as unknown as Record<string, unknown>)[cbName] = (data: unknown) => {
      cleanup();
      const payload = data as {
        code?: number;
        data?: {
          title?: string;
          pic?: string;
          duration?: number;
          pages?: Array<{ duration?: number }>;
        };
      };
      if (!payload || payload.code !== 0 || !payload.data) {
        resolve(null);
        return;
      }
      // 多 P 视频的 duration 是所有分 P 之和，必须按当前这一 P 取，
      // 否则房间时钟永远追不上，播完会卡在 B 站的推荐视频页。
      const pages = Array.isArray(payload.data.pages) ? payload.data.pages : [];
      const pageDur = pages[page - 1]?.duration;
      const durationSec =
        typeof pageDur === 'number' && pageDur > 0
          ? pageDur
          : typeof payload.data.duration === 'number' && payload.data.duration > 0
            ? payload.data.duration
            : undefined;

      resolve({
        title: typeof payload.data.title === 'string' ? payload.data.title.slice(0, 80) : undefined,
        durationSec,
        thumbnail:
          typeof payload.data.pic === 'string'
            ? payload.data.pic.replace(/^http:\/\//i, 'https://').slice(0, 512)
            : undefined,
      });
    };

    script.onerror = () => {
      cleanup();
      resolve(null);
    };
    script.src = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(
      bvid
    )}&jsonp=jsonp&callback=${cbName}`;
    document.head.appendChild(script);
  });
}
