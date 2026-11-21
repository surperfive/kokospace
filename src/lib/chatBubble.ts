/** 聊天气泡总存活时长：短句够读完两遍，长句也来得及看 */
export const CHAT_BUBBLE_LIFETIME_MS = 10000;

/** 最后这段时间用于淡出：越长越像「慢慢消散」 */
export const CHAT_BUBBLE_FADE_MS = 4200;

/** 淡出期间气泡上浮的像素数 */
const CHAT_BUBBLE_RISE_PX = 16;

export interface ChatBubbleVisual {
  text: string;
  /** 1 = 完全不透明，0 = 已消失 */
  alpha: number;
  /** 需要向上偏移的像素数 */
  rise: number;
}

/**
 * 按「还剩多久过期」算出气泡当前应该长什么样。
 * 返回 null 表示已经彻底消失，不该再画。
 */
export function bubbleVisual(
  text: string,
  expiresAt: number,
  nowMs: number
): ChatBubbleVisual | null {
  const remaining = expiresAt - nowMs;
  if (remaining <= 0) return null;
  if (remaining >= CHAT_BUBBLE_FADE_MS) return { text, alpha: 1, rise: 0 };

  // 0 → 1 的淡出进度
  const t = 1 - remaining / CHAT_BUBBLE_FADE_MS;
  // smoothstep：两端都平缓，不会突然开始掉透明度
  const eased = t * t * (3 - 2 * t);
  return {
    text,
    alpha: 1 - eased,
    rise: eased * CHAT_BUBBLE_RISE_PX,
  };
}
