/**
 * 视频链接元信息抓取（标题 / 封面 / 时长）
 *
 * 纯 fetch 实现，Node（server.ts）与 Cloudflare Workers（worker/index.ts）共用。
 * 注意：所有外部请求都带 2.5 秒超时，超时就退回本地正则解析的结果 ——
 * 点播链路不能因为第三方站点慢而卡住。
 */

import { extractBiliPage, parseVideoUrlServer } from './roomCore.ts';

export interface VideoMetaResult {
  sourceType: string;
  embedUrl: string;
  titleHint: string;
  thumbnail?: string;
  durationSec?: number;
  /** 解析出的 B 站 BV 号（短链解析成功后也会填） */
  bvid?: string;
  /** 规范化后的地址：短链会变成 https://www.bilibili.com/video/BVxxx，前端入队用这个 */
  canonicalUrl?: string;
  /** 抓取失败时的原因，便于线上排查（不影响前端逻辑） */
  fetchNote?: string;
}

/** 单个外部请求的超时。链路差的时候 4 秒太紧（短链要跟一次 302） */
const TIMEOUT_MS = 6000;

/** BV 号出现的位置不固定：整段分享文案里也可能夹着，所以全文扫 */
export function extractBvid(text: string): string | null {
  const m = String(text || '').match(/BV([0-9A-Za-z]{10})/);
  return m ? `BV${m[1]}` : null;
}

/**
 * B 站 App 分享文案形如「【【4K】标题-哔哩哔哩】 https://b23.tv/xxx」，抠出标题。
 *
 * 坑：标题本身经常带方括号（【4K】【MV】【合集】），所以分享文案会变成双层括号
 * `【【4K】标题-哔哩哔哩】`。必须从「第一个【」一直取到「链接之前的最后一个】」，
 * 否则只会拿到内层的「4K」。
 */
export function extractShareTitle(text: string): string | null {
  const src = String(text || '');
  const start = src.indexOf('【');
  if (start < 0) return null;
  // 只看到第一个链接为止，避免把链接后面的正文括号也吞进来
  const tail = src.slice(start);
  const urlIdx = tail.search(/https?:\/\//i);
  const scope = urlIdx > 0 ? tail.slice(0, urlIdx) : tail;
  const end = scope.lastIndexOf('】');
  if (end <= 1) return null;
  const inner = scope
    .slice(1, end)
    .replace(/[-—\s]*哔哩哔哩\s*$/u, '')
    .trim();
  return inner ? inner.slice(0, 80) : null;
}

/** 从文本里取出第一个 http(s) 链接 */
export function extractFirstUrl(text: string): string | null {
  const m = String(text || '').match(/https?:\/\/[^\s"'<>）)】]+/i);
  return m ? m[0] : null;
}

const SHORT_LINK_RE = /https?:\/\/b23\.tv\/[0-9A-Za-z]+/i;

/**
 * av 号 → BV 号（B 站官方那套混淆算法，纯数学，不需要联网）
 * 为什么需要：老链接和部分短链跳过去还是 `av123` 形式，只有 BV 才是全局稳定的标识。
 */
const BV_TABLE = 'fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF';
const BV_S = [11, 10, 3, 8, 4, 6];
const BV_XOR = 177451812;
const BV_ADD = 8728348608;

export function avToBvid(avid: number | string): string | null {
  const av = typeof avid === 'string' ? parseInt(avid.replace(/\D/g, ''), 10) : avid;
  if (!Number.isFinite(av) || av <= 0) return null;
  const x = (av ^ BV_XOR) + BV_ADD;
  const r = ['B', 'V', '1', ' ', ' ', '4', ' ', '1', ' ', '7', ' ', ' '];
  for (let i = 0; i < 6; i++) {
    r[BV_S[i]] = BV_TABLE[Math.floor(x / Math.pow(58, i)) % 58];
  }
  return r.join('');
}

/**
 * 从文本里找 av 号。
 * 支持 `/video/av170001`、`aid=170001`，以及**裸 av 号**（用户直接粘 `av170001`，
 * 这种以前会被当成直链视频，标题变成 "av170001"）。
 */
function extractAvid(text: string): string | null {
  const s = String(text || '');
  // 裸 av 号只在「不是 URL」时才认：否则 example.com/av123.mp4 会被误判成 B 站视频
  // 不用 lookbehind（Safari 16.4 以下会解析报错，整个包都加载不了）
  const bareAv = /:\/\//.test(s) ? null : s.match(/(?:^|[^0-9A-Za-z])av(\d{1,12})(?![0-9A-Za-z])/i);
  const m = s.match(/\/video\/av(\d{1,12})/i) || s.match(/\baid=(\d{1,12})/i) || bareAv;
  return m ? m[1] : null;
}

/**
 * b23.tv 短链只有服务端能解析：浏览器里跨域拿不到重定向目标。
 * 跟着 302 走到最终页面，再从最终 URL 里抠 BV 号。
 */
export async function resolveBilibiliShortLink(
  text: string
): Promise<{ bvid: string | null; note?: string }> {
  const shortUrl = (String(text || '').match(SHORT_LINK_RE) || [])[0];
  if (!shortUrl) return { bvid: null, note: 'no short link' };

  const pickFrom = (target: string): string | null => {
    const fromBv = extractBvid(target);
    if (fromBv) return fromBv;
    const av = extractAvid(target);
    return av ? avToBvid(av) : null;
  };

  try {
    /**
     * 关键优化：b23.tv 是纯 302，Location 头里已经写着目标地址。
     * 以前用 redirect:'follow' 一路跟到 bilibili.com，多一跳不说，
     * 还会撞上 B 站对云端出口的 412 风控 —— 线上实测要 9 秒，
     * 前端 7 秒就超时了，表现就是「短链解析失败」。
     */
    const head = await fetch(shortUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = head.headers.get('location') || '';
    const fromLocation = pickFrom(location);
    if (fromLocation) return { bvid: fromLocation };

    // 少数短链是 HTML/JS 跳转，没有 Location：退回跟随后再看最终地址
    const res = await fetch(shortUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const fromUrl = pickFrom(res.url || '');
    if (fromUrl) return { bvid: fromUrl };
    // 有些短链会跳到一个中转页，BV 只在 HTML 里
    const body = await res.text();
    const fromBody = extractBvid(body.slice(0, 4000));
    if (fromBody) return { bvid: fromBody };
    return { bvid: null, note: `no bv in ${res.status} ${String(res.url).slice(0, 80)}` };
  } catch (err) {
    return { bvid: null, note: `short link fetch failed: ${String(err).slice(0, 100)}` };
  }
}

export async function fetchVideoMeta(rawUrl: string): Promise<VideoMetaResult> {
  const input = String(rawUrl || '').trim();
  const parsed = parseVideoUrlServer(input);
  let sourceType = parsed.sourceType;
  let thumbnail: string | undefined;
  let durationSec: number | undefined;
  let titleHint = parsed.titleHint;
  let fetchNote: string | undefined;
  let bvid: string | null = extractBvid(input);
  let canonicalUrl: string | undefined;
  let embedUrl = parsed.embedUrl;
  /** 分 P 序号：多 P 视频只播这一集，时长也必须按这一集算 */
  const biliPage = extractBiliPage(input);

  // 没有 BV 但有 b23 短链：先解析短链，解析出来后按 B 站视频走
  if (!bvid && SHORT_LINK_RE.test(input)) {
    const resolved = await resolveBilibiliShortLink(input);
    bvid = resolved.bvid;
    if (!bvid) {
      fetchNote = `b23 短链解析失败（${resolved.note || 'unknown'}）`;
      return {
        ...parsed,
        sourceType: 'bilibili',
        titleHint: extractShareTitle(input) || 'B站视频（短链解析失败，请改用含 BV 号的链接）',
        fetchNote,
      };
    }
  }

  // 老 av 号链接也统一换成 BV，方便入队、存档和跨端复用
  if (!bvid) {
    const av = extractAvid(input) || extractAvid(parsed.embedUrl);
    if (av) bvid = avToBvid(av);
  }

  if (bvid) {
    sourceType = 'bilibili';
    // 分 P 序号要一路带到规范地址里，否则入队时又变回 page=1
    canonicalUrl = `https://www.bilibili.com/video/${bvid}${
      biliPage > 1 ? `?p=${biliPage}` : ''
    }`;
    // embedUrl 直接复用解析结果（里面已经带上正确的 page=N）
    embedUrl = parsed.embedUrl;
    // 标题只认两种：分享文案里抠出来的，或者标准的「Bilibili 视频 (BVxxx)」。
    // 绝不能留原始输入 —— 以前会把「看看这个 … 很有意思」整段、甚至裸 av 号原样当标题。
    titleHint = extractShareTitle(input) || `Bilibili 视频 (${bvid})`;
  }

  try {
    if (sourceType === 'youtube') {
      const vidMatch = parsed.embedUrl.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (vidMatch) {
        thumbnail = `https://i.ytimg.com/vi/${vidMatch[1]}/hqdefault.jpg`;
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidMatch[1]}`)}&format=json`,
          { signal: AbortSignal.timeout(TIMEOUT_MS) }
        );
        if (oembedRes.ok) {
          const data = (await oembedRes.json()) as { title?: string; thumbnail_url?: string };
          if (data.title) titleHint = String(data.title).slice(0, 80);
          if (data.thumbnail_url) thumbnail = String(data.thumbnail_url).slice(0, 512);
        }
      }
    } else if (sourceType === 'bilibili') {
      const avMatch = parsed.embedUrl.match(/aid=(\d+)/);
      const queryParam = bvid ? `bvid=${bvid}` : avMatch ? `aid=${avMatch[1]}` : '';
      if (queryParam) {
        const biliRes = await fetch(`https://api.bilibili.com/x/web-interface/view?${queryParam}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: {
            // B 站对云端出口 IP 有风控：缺 Referer 时常见 -412 / 空 data，
            // 带上完整的浏览器指纹头成功率明显更高。
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Referer: 'https://www.bilibili.com/',
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          },
        });
        if (biliRes.ok) {
          const json = (await biliRes.json()) as {
            code?: number;
            message?: string;
            data?: {
              title?: string;
              pic?: string;
              duration?: number;
              pages?: Array<{ duration?: number }>;
            };
          };
          if (json.code === 0 && json.data) {
            if (json.data.title) titleHint = String(json.data.title).slice(0, 80);
            if (json.data.pic) {
              thumbnail = String(json.data.pic).replace(/^http:\/\//i, 'https://').slice(0, 512);
            }
            // 时长必须按「当前这一 P」取。
            // 多 P 视频的 data.duration 是所有分 P 之和（实测 28P 的合集是 39585s，
            // 而 P1 只有 399s），用总和会让房间时钟永远追不上，播完就卡在 B 站推荐页。
            const pages = Array.isArray(json.data.pages) ? json.data.pages : [];
            const pageDur = pages[biliPage - 1]?.duration;
            if (typeof pageDur === 'number' && pageDur > 0) {
              durationSec = pageDur;
            } else if (typeof json.data.duration === 'number' && json.data.duration > 0) {
              durationSec = json.data.duration;
            }
          } else {
            fetchNote = `bilibili code=${json.code} ${json.message || ''}`.trim();
          }
        } else {
          fetchNote = `bilibili http=${biliRes.status}`;
        }
      }
    } else if (sourceType === 'mp4' && /^https?:\/\//i.test(input)) {
      const headRes = await fetch(input, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const ct = (headRes.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('mpegurl') || ct.includes('m3u8')) {
        sourceType = 'hls';
        if (titleHint === '外部直链视频') titleHint = 'HLS 流媒体';
      }
    }
  } catch (err) {
    // 外部站点超时或不可达时优雅回退到本地正则解析结果
    fetchNote = `fetch failed: ${String(err).slice(0, 120)}`;
  }

  return {
    ...parsed,
    sourceType,
    embedUrl,
    titleHint,
    thumbnail,
    durationSec,
    bvid: bvid || undefined,
    canonicalUrl,
    fetchNote,
  };
}
