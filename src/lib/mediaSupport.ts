/**
 * 浏览器能不能用 MSE 播 HLS —— 等价于 hls.js 的 `Hls.isSupported()`。
 *
 * 单独抽出来是为了不让首屏静态引入 hls.js：那个包压缩后 600KB+，
 * 而 90% 的人打开房间只是聊天、看 B 站，根本用不到 m3u8 解码。
 * 首屏 JS 从 936KB 降到 ~330KB，弱网下少等 1~2 秒。
 */

function getMediaSourceCtor(): any {
  if (typeof self === 'undefined') return undefined;
  const s = self as any;
  return s.MediaSource || s.ManagedMediaSource || s.WebKitMediaSource;
}

function mimeTypeForCodec(codec: string, type: string): string {
  return `${type}/mp4;codecs="${codec}"`;
}

let cached: boolean | null = null;

export function canUseMseHls(): boolean {
  if (cached !== null) return cached;

  const s = typeof self !== 'undefined' ? (self as any) : undefined;
  const mediaSource = getMediaSourceCtor();
  if (!s || !mediaSource || typeof mediaSource.isTypeSupported !== 'function' || !s.SourceBuffer) {
    cached = false;
    return cached;
  }

  try {
    const videoOk = ['avc1.42E01E,mp4a.40.2', 'av01.0.01M.08', 'vp09.00.50.08'].some((codec) =>
      mediaSource.isTypeSupported(mimeTypeForCodec(codec, 'video'))
    );
    const audioOk =
      videoOk ||
      ['mp4a.40.2', 'fLaC'].some((codec) =>
        mediaSource.isTypeSupported(mimeTypeForCodec(codec, 'audio'))
      );
    cached = videoOk || audioOk;
  } catch {
    cached = false;
  }
  return cached;
}
