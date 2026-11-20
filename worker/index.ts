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

import { RoomCore, sanitizeRoomId, type Outbound } from '../src/lib/roomCore';
import { fetchVideoMeta } from '../src/lib/videoMeta';

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

    // 静态资源 + SPA 回退
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

export class RoomDurableObject {
  private core: RoomCore | null = null;
  private sockets = new Map<string, WebSocket>();
  /** 片尾看门狗：客户端 rAF 在后台标签页会被浏览器暂停，服务端每秒兜底推进 */
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(_ctx: DurableObjectState) {}

  private sendRaw(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      /* 连接已断开，忽略 */
    }
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
      if (this.sockets.size === 0) this.stopWatchdog();
      // 和 Node 端一致：人走光了就把房间清掉，否则同名房间下次进来会看到上一场的内容
      if (core.isEmpty) this.core = new RoomCore(core.roomId);
    };

    server.addEventListener('close', cleanup);
    server.addEventListener('error', cleanup);

    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }
}
