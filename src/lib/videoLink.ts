/**
 * 从聊天文本里认出视频链接。
 *
 * 只做「是不是视频」的判定和标题清洗，真正的解析（拿标题/时长/封面）还是走
 * `/api/parse-video` + `handleEnqueueUrl`，跟点播面板里粘链接完全同一条链路。
 *
 * 支持的写法：
 *   - 直链：.mp4 / .m3u8 / .webm / .mov / .flv（可带 query）
 *   - B 站：bilibili.com/video/BV…、av…、b23.tv 短链、整段「【标题】链接」分享文案
 *   - YouTube：youtube.com/watch?v=、youtu.be/、/shorts/
 *   - 裸 BV 号（BV1xx411c7mD）、整条消息就是 av 号的情况
 */

const URL_RE = /https?:\/\/[^\s"'<>，。；、）】]+/i;
const VIDEO_EXT_RE = /\.(mp4|m3u8|webm|mov|flv)(\?|#|$)/i;
const VIDEO_HOST_RE = /(bilibili\.com|b23\.tv|youtube\.com|youtu\.be)/i;

export interface DetectedVideoLink {
  url: string;
  /** 文本里去掉链接后剩下的内容，当标题用；没有就是空串（交给服务端补） */
  titleHint: string;
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/[\[\]【】()（）<>《》「」""''`]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-—:：·|]+/, '')
    .replace(/[\s\-—:：·|]+$/, '')
    .trim()
    .slice(0, 60);
}

export function detectVideoLink(raw: string): DetectedVideoLink | null {
  const text = (raw || '').trim();
  if (!text) return null;

  const urlMatch = text.match(URL_RE);
  if (urlMatch) {
    const rawUrl = urlMatch[0];
    // 句尾的标点不属于链接
    const url = rawUrl.replace(/[.,;:!?]+$/, '');
    if (!VIDEO_EXT_RE.test(url) && !VIDEO_HOST_RE.test(url)) return null;
    return { url, titleHint: cleanTitle(text.replace(rawUrl, ' ')) };
  }

  // 裸 BV 号：B 站 App 里「复制 BV 号」很常见，贴进来也该能播
  const bv = text.match(/BV[0-9A-Za-z]{10}/);
  if (bv) {
    return {
      url: `https://www.bilibili.com/video/${bv[0]}`,
      titleHint: cleanTitle(text.replace(bv[0], ' ')),
    };
  }

  // 裸 av 号只在整条消息就是它时认，避免把闲聊里的「av123」当成视频
  const av = text.match(/^av(\d{1,12})$/i);
  if (av) return { url: `https://www.bilibili.com/video/av${av[1]}`, titleHint: '' };

  return null;
}
