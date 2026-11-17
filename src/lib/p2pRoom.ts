/**
 * P2PRoom —— 房主当服务器（星型 WebRTC DataChannel）
 *
 * 拓扑：房主浏览器里跑 `RoomCore` 作为权威；客人各自与房主建一条
 * DataChannel（label `koko-state`），所有业务消息走 P2P，不再经过云端。
 *
 * 云端 WebSocket 只用于两件事：
 *   1. 进房间拿 `hostId`（谁是房主）
 *   2. 转发 `p2p:signal`（交换 SDP / ICE，几秒内用完）
 *
 * 消息格式与云端模式完全一致，App.tsx 只需要换一个 transport。
 */

import { RoomCore, type Outbound } from './roomCore';

export type P2PRole = 'host' | 'guest';
export type P2PStatus = 'connecting' | 'connected' | 'failed';

export interface P2PRoomOptions {
  roomId: string;
  /** 自己的 playerId（与云端 join 用的一致） */
  selfId: string;
  /** 房主的 playerId（来自 room:init 的 hostId） */
  hostId: string;
  role: P2PRole;
  /** 把信令交给云端转发（对应 WS 的 p2p:signal 消息） */
  sendSignal: (targetId: string, signal: unknown) => void;
  /** 收到业务消息（等效于原来 ws.onmessage 的 event.data 解析结果） */
  onMessage: (payload: any) => void;
  onStatus?: (status: P2PStatus, detail?: string) => void;
}

const DC_LABEL = 'koko-state';

function rtcConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  // 有 TURN 就带上（对称 NAT 需要），通过 VITE_TURN_URL / VITE_TURN_USER / VITE_TURN_PASS 注入
  const turnUrl = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl,
      username: (import.meta.env.VITE_TURN_USER as string | undefined) || undefined,
      credential: (import.meta.env.VITE_TURN_PASS as string | undefined) || undefined,
    });
  }
  return { iceServers };
}

interface PeerEntry {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  bindId: string | null;
}

export class P2PRoom {
  private opts: P2PRoomOptions;
  private core: RoomCore | null = null;
  private peers = new Map<string, PeerEntry>();
  private outbox: string[] = [];
  private joinMsg: Record<string, any> | null = null;
  private closed = false;
  status: P2PStatus = 'connecting';

  constructor(opts: P2PRoomOptions) {
    this.opts = opts;
    if (opts.role === 'host') this.core = new RoomCore(opts.roomId);
  }

  get connected(): boolean {
    if (this.opts.role === 'host') return this.status === 'connected';
    const peer = this.peers.get(this.opts.hostId);
    return !!peer?.dc && peer.dc.readyState === 'open';
  }

  private setStatus(s: P2PStatus, detail?: string) {
    this.status = s;
    this.opts.onStatus?.(s, detail);
  }

  /** 房主：把自己注册进核心；客人：向房主发起连接，通道就绪后补发 join */
  start(joinMessage: Record<string, any>) {
    this.joinMsg = joinMessage;
    if (this.opts.role === 'host') {
      this.apply(this.core!.join(this.opts.selfId, joinMessage));
      this.setStatus('connecting');
      return;
    }
    // 客人：如果 hostId 就是自己，说明云端把我当房主了，直接降级为房主模式
    if (this.opts.hostId === this.opts.selfId) {
      this.core = new RoomCore(this.opts.roomId);
      this.apply(this.core.join(this.opts.selfId, joinMessage));
      this.setStatus('connected');
      return;
    }
    this.connectToHost();
  }

  private createPeer(remoteId: string): PeerEntry {
    const pc = new RTCPeerConnection(rtcConfig());
    const entry: PeerEntry = { pc, dc: null, bindId: null };
    this.peers.set(remoteId, entry);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.opts.sendSignal(remoteId, { candidate: e.candidate });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.setStatus('failed', `与 ${remoteId} 的连接失败（可能需要 TURN）`);
      } else if (pc.connectionState === 'connected') {
        this.setStatus('connected');
      }
    };

    // 房主侧：客人发起的通道会以 ondatachannel 形式出现
    pc.ondatachannel = (ev) => {
      if (ev.channel.label !== DC_LABEL) return;
      entry.dc = ev.channel;
      this.bindChannel(entry, remoteId);
    };

    return entry;
  }

  private bindChannel(entry: PeerEntry, remoteId: string) {
    const dc = entry.dc!;
    dc.onopen = () => {
      if (this.opts.role === 'guest') {
        // 客人：连上后补发 join，房主据此注册并回 room:init
        if (this.joinMsg) dc.send(JSON.stringify(this.joinMsg));
        this.flush();
        this.setStatus('connected');
      } else {
        this.setStatus('connected');
        // 房主：等对方发 join
      }
    };
    dc.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
      } catch {
        return;
      }
      if (this.opts.role === 'host') {
        this.hostHandle(remoteId, msg);
      } else {
        this.opts.onMessage(msg);
      }
    };
    dc.onclose = () => {
      if (this.opts.role === 'host') {
        const pid = entry.bindId;
        if (pid) {
          this.peers.delete(remoteId);
          this.apply(this.core!.leave(pid));
        }
      } else {
        this.setStatus('failed', '与房主的连接已断开');
      }
    };
    if (dc.readyState === 'open') {
      // 通道在绑定前就已 open（客人侧常见）
      if (this.opts.role === 'guest') {
        if (this.joinMsg) dc.send(JSON.stringify(this.joinMsg));
        this.flush();
        this.setStatus('connected');
      }
    }
  }

  private async connectToHost() {
    const hostId = this.opts.hostId;
    const entry = this.createPeer(hostId);
    const dc = entry.pc.createDataChannel(DC_LABEL, { ordered: true });
    entry.dc = dc;
    this.bindChannel(entry, hostId);
    try {
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      this.opts.sendSignal(hostId, { sdp: entry.pc.localDescription });
    } catch (err) {
      this.setStatus('failed', `创建连接失败：${String(err)}`);
    }
  }

  /** 处理云端转发过来的 p2p:signal */
  async handleSignal(fromId: string, signal: any) {
    let entry = this.peers.get(fromId);
    if (!entry) {
      // 房主收到客人的 offer 时才第一次见到这个 peer
      entry = this.createPeer(fromId);
    }
    try {
      if (signal.sdp) {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await entry.pc.createAnswer();
          await entry.pc.setLocalDescription(answer);
          this.opts.sendSignal(fromId, { sdp: entry.pc.localDescription });
        }
      } else if (signal.candidate) {
        await entry.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.warn('[p2p] signaling error:', err);
    }
  }

  /** 房主：把一条来自某个客人的业务消息喂给核心 */
  private hostHandle(remoteId: string, msg: Record<string, any>) {
    const core = this.core!;
    const entry = this.peers.get(remoteId);

    if (msg.type === 'room:join') {
      const pid =
        typeof msg.playerId === 'string' && msg.playerId.length > 0
          ? msg.playerId.slice(0, 48)
          : `p_${Math.random().toString(36).slice(2, 10)}`;
      if (entry) entry.bindId = pid;
      this.apply(core.join(pid, msg));
      return;
    }

    const pid = entry?.bindId;
    if (!pid) return;

    if (msg.type === 'p2p:signal' || msg.type === 'webrtc:signal') {
      // 客人之间的语音信令仍走云端，这里不处理
      return;
    }
    this.apply(core.handle(pid, msg));
  }

  /** 房主：把核心产出的消息分发出去（自己也要收一份） */
  private apply(out: Outbound[]) {
    for (const item of out) {
      if (item.kind === 'to') {
        if (item.targetId === this.opts.selfId) {
          this.opts.onMessage(item.payload);
        } else {
          const entry = this.peers.get(item.targetId);
          if (entry?.dc && entry.dc.readyState === 'open') {
            entry.dc.send(JSON.stringify(item.payload));
          }
        }
        continue;
      }

      const data = JSON.stringify(item.payload);
      for (const [remoteId, entry] of this.peers.entries()) {
        if (item.excludeId === remoteId) continue;
        if (entry.dc && entry.dc.readyState === 'open') entry.dc.send(data);
      }
      if (item.excludeId !== this.opts.selfId) this.opts.onMessage(item.payload);
    }
  }

  /** 发一条业务消息（与 WS 的 send 等价，参数是 JSON 字符串） */
  send(json: string) {
    if (this.closed) return;
    if (this.opts.role === 'host') {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(json);
      } catch {
        return;
      }
      if (msg.type === 'room:join') {
        this.apply(this.core!.join(this.opts.selfId, msg));
      } else if (msg.type === 'p2p:signal' || msg.type === 'webrtc:signal') {
        // 房主自己不转发信令，交给云端那条 WS
      } else {
        this.apply(this.core!.handle(this.opts.selfId, msg));
      }
      return;
    }

    const entry = this.peers.get(this.opts.hostId);
    if (entry?.dc && entry.dc.readyState === 'open') {
      entry.dc.send(json);
    } else {
      this.outbox.push(json);
      if (this.outbox.length > 50) this.outbox.shift();
    }
  }

  private flush() {
    const entry = this.peers.get(this.opts.hostId);
    if (!entry?.dc || entry.dc.readyState !== 'open') return;
    while (this.outbox.length) {
      const item = this.outbox.shift()!;
      try {
        entry.dc.send(item);
      } catch {
        break;
      }
    }
  }

  close() {
    this.closed = true;
    for (const entry of this.peers.values()) {
      try {
        entry.dc?.close();
      } catch {
        /* ignore */
      }
      try {
        entry.pc.close();
      } catch {
        /* ignore */
      }
    }
    this.peers.clear();
  }
}

/** 是否启用 P2P（URL 上带 p2p=1） */
export function isP2PEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('p2p') === '1';
}
