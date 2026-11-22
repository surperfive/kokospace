/**
 * AI 转发：浏览器直连各家大模型 API 会被 CORS 拦（大多数服务端不返回 CORS 头），
 * 所以统一从 Worker / Express 转发一次。两份运行时的实现必须一致，逻辑放这里。
 *
 * 安全边界：
 *  - 只允许 https；
 *  - 只允许白名单里的厂商域名 —— 否则这个公开接口会变成一个能向任意地址 POST 的开放代理；
 *  - 上游错误原样透传状态码，密钥不落任何日志。
 */

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: AiChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

/** 允许转发的厂商域名（OpenAI 兼容接口） */
export const AI_HOST_WHITELIST = [
  'api.openai.com',
  'api.deepseek.com',
  'dashscope.aliyuncs.com',
  'api.moonshot.cn',
  'api.siliconflow.cn',
  'openrouter.ai',
  'api.groq.com',
  'api.together.xyz',
  'api.mistral.ai',
  'api.x.ai',
  'api.minimax.chat',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
];

export type AiChatResult =
  | { ok: true; status: number; data: any }
  | { ok: false; status: number; error: string };

export async function proxyAiChat(input: unknown): Promise<AiChatResult> {
  const body = (input ?? {}) as Partial<AiChatRequest>;
  const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!baseUrl || !apiKey || !model) {
    return { ok: false, status: 400, error: '缺少 baseUrl / apiKey / model' };
  }
  if (!messages.length || messages.length > 40) {
    return { ok: false, status: 400, error: 'messages 数量不合法' };
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return { ok: false, status: 400, error: 'baseUrl 不是合法地址' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, status: 400, error: '只支持 https 接口' };
  }
  // www. 之类的等价写法统一掉再比对
  const host = parsed.hostname.replace(/^www\./, '');
  if (!AI_HOST_WHITELIST.includes(host)) {
    return {
      ok: false,
      status: 400,
      error: `不在允许列表里：${host}。可用：${AI_HOST_WHITELIST.slice(0, 6).join(' / ')} 等`,
    };
  }

  const endpoint = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}/chat/completions`;
  const payload: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({
      role: m?.role === 'assistant' || m?.role === 'system' ? m.role : 'user',
      content: String(m?.content ?? '').slice(0, 8000),
    })),
    stream: false,
  };
  if (typeof body.temperature === 'number' && Number.isFinite(body.temperature)) {
    payload.temperature = Math.max(0, Math.min(2, body.temperature));
  }
  if (typeof body.maxTokens === 'number' && Number.isFinite(body.maxTokens)) {
    payload.max_tokens = Math.max(16, Math.min(4000, Math.round(body.maxTokens)));
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      const msg =
        data?.error?.message || data?.message || data?.raw || `上游返回 ${res.status}`;
      return { ok: false, status: res.status, error: String(msg).slice(0, 300) };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: (err as Error)?.message?.slice(0, 200) || '请求上游失败',
    };
  }
}
