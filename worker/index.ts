/// <reference types="@cloudflare/workers-types" />

/**
 * KokoSpace on Cloudflare
 * -------------------------------------------------------------
 * 前端（dist/）由 Workers Static Assets 托管；
 * 每个房间（?room=xxx）映射到一个 Durable Object 实例，
 * 由它独占房间状态并持有该房间所有 WebSocket 连接。
 *
 * 房间状态与消息处理在 `src/lib/roomCore.ts`（三端共用），
 * 这里只负责「连接 → 事件 → 发给谁」的搬运。
 */

import {
  RoomCore,
  sanitizeRoomId,
  AUTO_ADVANCE_GRACE_SEC,
  type Outbound,
} from '../src/lib/roomCore';
import { fetchVideoMeta } from '../src/lib/videoMeta';
import { proxyAiChat } from '../src/lib/aiProxy';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const roomId = sanitizeRoomId(url.searchParams.get('room'));
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      // 把房间号带给 DO，由它负责真正的握手（Upgrade 头必须原样透传）
      const target = new URL(request.url);
      target.searchParams.set('room', roomId);
      return stub.fetch(target.toString(), {
        method: request.method,
        headers: request.headers,
      });
    }

    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, runtime: 'cloudflare-workers', timestamp: Date.now() });
    }

    // 视频链接元信息（标题 / 封面 / 时长）。B 站对齐滑块靠 durationSec 定量程，
    // 线上缺这个接口会退化成「时长未知」，所以和本地 Express 用同一份实现。
    if (url.pathname === '/api/parse-video') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      let videoUrl = '';
      try {
        const body = (await request.json()) as { url?: string };
        videoUrl = typeof body?.url === 'string' ? body.url.trim() : '';
      } catch {
        /* 非法 JSON 按空链接处理 */
      }
      if (!videoUrl) {
        return Response.json({ error: '请输入有效的视频链接' }, { status: 400 });
      }
      return Response.json(await fetchVideoMeta(videoUrl));
    }

    // 外部大模型转发：多数厂商 API 不返回 CORS 头，浏览器直连会被拦，只能从这里走。
    // 只允许白名单 https 域名，避免变成开放代理。
    if (url.pathname === '/api/ai') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      let payload: unknown = null;
      try {
        payload = await request.json();
      } catch {
        return Response.json({ error: '请求体不是合法 JSON' }, { status: 400 });
      }
      const result = await proxyAiChat(payload);
      return Response.json(result.ok ? { ok: true, data: result.data } : { ok: false, error: result.error }, {
        status: result.status,
      });
    }

    // 静态资源 + SPA 回退
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class RoomDurableObject {
  private core: RoomCore | null = null;
  private sockets = new Map<string, WebSocket>();
  /**
   * 片尾看门狗（快速通道）：客户端 rAF 在后台标签页会被暂停，服务端每秒兜底推进。
   *
   * 注意：**setInterval 在 Durable Object 里不可靠** —— 实例没有活跃 I/O 时会被挂起，
   * 定时器跟着停，等再被唤醒时已经过去很久。所以真正的兜底是下面的 `alarm()`
   * （Cloudflare 官方定时机制，会主动唤醒实例），这个 interval 只是实例还热着时的
   * 细粒度补充。两者都调 `tick()`，而 tick 是幂等的，重复调用不会连跳两部。
   */
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(private ctx: DurableObjectState) {}

  private sendRaw(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      /* 连接已断开，忽略 */
    }
  }

  /** 下一次该检查片尾的时间点；不需要检查就返回 null */
  private computeNextAlarmAt(): number | null {
    const vs = this.core?.videoState;
    if (!vs) return null;
    const dur = vs.currentItem.durationSec;
    if (!dur || dur <= 5) return null;
    if (!vs.isPlaying) {
      // 暂停：只有停在片尾才需要排（3 秒后由 tick 的暂停分支推进）
      if (vs.currentTime < dur - 0.5) return null;
      return vs.updatedAtMs + 3000;
    }
    return vs.updatedAtMs + (dur + AUTO_ADVANCE_GRACE_SEC) * 1000;
  }

  /**
   * 排/清 DO Alarm。
   * 每次房间状态变化后都调一次：它会把唤醒时间对齐到「这一部播完的那一刻」，
   * 到点由 `alarm()` 唤醒实例执行推进。
   */
  private async armAlarm(): Promise<void> {
    try {
      const at = this.computeNextAlarmAt();
      const existing = await this.ctx.storage.getAlarm();
      if (at == null) {
        if (existing != null) await this.ctx.storage.deleteAlarm();
        return;
      }
      const target = Math.max(Date.now() + 500, at);
      // 已经排了不晚于目标时间的唤醒就不用重写，避免每条消息都落一次 storage
      if (existing != null && existing <= target) return;
      await this.ctx.storage.setAlarm(target);
    } catch {
      /* 排不上就靠 interval / 客户端自己上报，不阻塞主流程 */
    }
  }

  /** DO 定时器：到点检查一次，再排下一次 */
  async alarm(): Promise<void> {
    const core = this.core;
    if (!core) return;
    const out = core.tick(Date.now());
    for (const item of out) {
      if (item.kind === 'to') {
        const target = this.sockets.get(item.targetId);
        if (target) this.sendRaw(target, item.payload);
      } else {
        for (const [pid, ws] of this.sockets.entries()) {
          if (item.excludeId && pid === item.excludeId) continue;
          this.sendRaw(ws, item.payload);
        }
      }
    }
    await this.armAlarm();
  }

  private startWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      const core = this.core;
      if (!core) return;
      const out = core.tick(Date.now());
      for (const item of out) {
        if (item.kind === 'to') {
          const target = this.sockets.get(item.targetId);
          if (target) this.sendRaw(target, item.payload);
        } else {
          for (const [pid, ws] of this.sockets.entries()) {
            if (item.excludeId && pid === item.excludeId) continue;
            this.sendRaw(ws, item.payload);
          }
        }
      }
      void this.armAlarm();
    }, 1000);
  }

  private stopWatchdog(): void {
    if (!this.watchdog) return;
    clearInterval(this.watchdog);
    this.watchdog = null;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = sanitizeRoomId(url.searchParams.get('room'));

    if (!this.core || this.core.roomId !== roomId) {
      this.core = new RoomCore(roomId);
    }
    const core = this.core;

    if (request.headers.get('Upgrade') !== 'websocket') {
      return Response.json(core.snapshot());
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as unknown as WebSocket & {
      accept: () => void;
      send: (d: string) => void;
      addEventListener: (t: string, fn: (ev: any) => void) => void;
    };
    server.accept();

    let playerId: string | null = null;

    const send = (ws: WebSocket, payload: unknown) => this.sendRaw(ws, payload);

    const apply = (out: Outbound[]) => {
      for (const item of out) {
        if (item.kind === 'to') {
          const target = this.sockets.get(item.targetId);
          if (target) send(target, item.payload);
        } else {
          for (const [pid, ws] of this.sockets.entries()) {
            if (item.excludeId && pid === item.excludeId) continue;
            send(ws, item.payload);
          }
        }
      }
      // 状态变了就重新对一次「这一部什么时候播完」，让 alarm 落在片尾那一刻
      void this.armAlarm();
    };

    server.addEventListener('message', (event: { data: any }) => {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
      } catch {
        return;
      }

      if (msg.type === 'room:join') {
        const pid =
          typeof msg.playerId === 'string' && msg.playerId.length > 0
            ? msg.playerId.slice(0, 48)
            : `p_${Math.random().toString(36).slice(2, 10)}`;
        playerId = pid;
        this.sockets.set(pid, server);
        this.startWatchdog();
        apply(core.join(pid, msg));
        return;
      }

      if (!playerId) return;

      // 语音信令与 P2P 状态通道信令都是纯转发，不参与房间状态
      if ((msg.type === 'webrtc:signal' || msg.type === 'p2p:signal') && typeof msg.targetId === 'string') {
        const target = this.sockets.get(msg.targetId);
        if (target) send(target, { type: msg.type, fromId: playerId, signal: msg.signal });
        return;
      }

      // P2P 房主把权威状态镜像过来：房主关机后，云端房间不是空的，接管的人能接着播
      if (msg.type === 'room:snapshot') {
        if (core.hostId === playerId && msg.state) core.restoreState(msg.state);
        return;
      }

      apply(core.handle(playerId, msg));
    });

    const cleanup = () => {
      if (!playerId) return;
      const pid = playerId;
      playerId = null;
      this.sockets.delete(pid);
      apply(core.leave(pid));
      // 人走光了就停掉看门狗，别让空房间空转
      if (this.sockets.size === 0) {
        this.stopWatchdog();
        void this.ctx.storage.deleteAlarm().catch(() => {});
      }
      // 和 Node 端一致：人走光了就把房间清掉，否则同名房间下次进来会看到上一场的内容
      if (core.isEmpty) this.core = new RoomCore(core.roomId);
    };

    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }
}
