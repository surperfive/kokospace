/**
 * AI 点播导演：把一句自然语言变成一条点播指令。
 *
 * 走的是「OpenAI 兼容」协议（/chat/completions），所以只要厂商兼容这套接口，
 * 把 baseUrl / model / key 填进去就能用。请求统一经本服务 `/api/ai` 转发，
 * 因为绝大多数厂商不返回 CORS 头，浏览器直连必被拦。
 *
 * 密钥只存在本机 localStorage，转发时只在请求体里出现，服务端不落盘、不打日志。
 */

export interface AiProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  hint?: string;
}

export const AI_PROVIDERS: AiProviderPreset[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  { id: 'moonshot', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
  },
];

export interface AiConfig {
  providerId: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

const CONFIG_KEY = 'koko_ai_config';

export const DEFAULT_AI_CONFIG: AiConfig = {
  providerId: 'deepseek',
  baseUrl: AI_PROVIDERS[0].baseUrl,
  model: AI_PROVIDERS[0].model,
  apiKey: '',
};

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_AI_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AiConfig>;
    return {
      providerId: parsed.providerId || DEFAULT_AI_CONFIG.providerId,
      baseUrl: parsed.baseUrl || DEFAULT_AI_CONFIG.baseUrl,
      model: parsed.model || DEFAULT_AI_CONFIG.model,
      apiKey: parsed.apiKey || '',
    };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export function saveAiConfig(cfg: AiConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* 存不下就算了，本次会话仍可用 */
  }
}

export function clearAiConfig() {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* ignore */
  }
}

/** 交给模型看的房间状态（故意只给必要信息，省 token 也避免泄露太多） */
export interface RoomContext {
  currentTitle: string;
  currentSource: string;
  currentUrl: string;
  elapsedSec: number;
  durationSec?: number;
  isPlaying: boolean;
  queue: { title: string; url: string }[];
  recentChat: { name: string; text: string }[];
}

export type DirectorCommand =
  | { type: 'pause' }
  | { type: 'play' }
  | { type: 'skip' }
  | { type: 'seek'; seconds: number }
  | { type: 'enqueue'; url: string; title?: string };

export interface DirectorReply {
  reply: string;
  command: DirectorCommand | null;
}

const COMMAND_SPEC = `命令对象只能是以下之一：
{"type":"pause"} 暂停
{"type":"play"} 继续播放
{"type":"skip"} 跳过当前这一部
{"type":"seek","seconds":120} 跳到第 120 秒（整数秒）
{"type":"enqueue","url":"https://...","title":"标题"} 点播/加入队列`;

export function buildSystemPrompt(ctx: RoomContext): string {
  const state = [
    `正在播放：《${ctx.currentTitle}》（${ctx.currentSource}）`,
    ctx.currentUrl ? `当前链接：${ctx.currentUrl}` : '',
    `播放进度：${Math.round(ctx.elapsedSec)} 秒${ctx.durationSec ? ` / 总长 ${Math.round(ctx.durationSec)} 秒` : ''}`,
    `状态：${ctx.isPlaying ? '播放中' : '已暂停'}`,
    ctx.queue.length
      ? `队列：${ctx.queue.map((q, i) => `${i + 1}.${q.title} ${q.url}`).join('；')}`
      : '队列：空',
    ctx.recentChat.length
      ? `最近聊天：${ctx.recentChat.map((c) => `${c.name}: ${c.text}`).join(' | ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `你是「KokoSpace」共看房间里的播放导演。根据用户的一句话和下面的房间状态，决定要不要执行一个操作。

只输出一个 JSON 对象，不要代码块、不要任何多余文字：
{"reply":"用中文回一句（不超过 40 字）","command":null 或 命令}

${COMMAND_SPEC}

规则：
1. enqueue 的 url 只能来自用户给的链接或「房间状态」里已有的链接，**绝对不要编造视频链接**。
2. 用户只是提问、或你无法确定具体链接时，command 设为 null，并在 reply 里请他给链接或说清要求。
3. 时间一律换算成秒的数字，不要写「两分钟」这种文字。
4. reply 要像个人在说话，不要复述 JSON、不要解释规则。

房间状态：
${state}`;
}

/** 拉一次模型，返回解析好的指令 */
export async function askDirector(
  cfg: AiConfig,
  history: { role: 'user' | 'assistant'; content: string }[],
  ctx: RoomContext
): Promise<DirectorReply> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      temperature: 0.3,
      maxTokens: 400,
      messages: [{ role: 'system', content: buildSystemPrompt(ctx) }, ...history.slice(-8)],
    }),
  });

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    throw new Error('服务返回的不是 JSON');
  }
  if (!res.ok || payload?.ok === false) {
    throw new Error(payload?.error || `请求失败（${res.status}）`);
  }

  const content: string =
    payload?.data?.choices?.[0]?.message?.content ??
    payload?.data?.choices?.[0]?.text ??
    '';
  return parseDirectorReply(content);
}

/** 模型偶尔会裹一层 ```json，或者前后带解释 —— 这里尽量宽容地抠出那个对象 */
export function parseDirectorReply(content: string): DirectorReply {
  const text = String(content || '').trim();
  if (!text) return { reply: '模型没有返回内容', command: null };

  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const candidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  try {
    const obj = JSON.parse(candidate);
    const reply = typeof obj?.reply === 'string' ? obj.reply.trim() : '';
    const cmd = obj?.command;
    if (!cmd || typeof cmd !== 'object') return { reply: reply || '好的', command: null };

    const type = String(cmd.type || '');
    if (type === 'pause' || type === 'play' || type === 'skip') {
      return { reply: reply || '好的', command: { type } };
    }
    if (type === 'seek') {
      const sec = Number(cmd.seconds);
      if (Number.isFinite(sec)) {
        return { reply: reply || '好的', command: { type: 'seek', seconds: Math.max(0, Math.round(sec)) } };
      }
    }
    if (type === 'enqueue' && typeof cmd.url === 'string' && /^https?:\/\//i.test(cmd.url)) {
      return {
        reply: reply || '好的',
        command: {
          type: 'enqueue',
          url: cmd.url.trim(),
          title: typeof cmd.title === 'string' ? cmd.title.slice(0, 80) : undefined,
        },
      };
    }
    return { reply: reply || '好的', command: null };
  } catch {
    // 不是 JSON：当成一句普通回复显示出来
    return { reply: cleaned.slice(0, 300), command: null };
  }
}
