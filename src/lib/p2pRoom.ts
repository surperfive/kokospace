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
import { buildRtcConfig } from './rtcConfig';

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
  /**
   * 房主专用：把权威状态镜像到云端（对应 WS 的 room:snapshot 消息）。
   * 房主关机后浏览器发不出任何东西，只能靠这条把房间内容留在云端，
   * 让接管的人不会看到一个空房间。
   */
  onSnapshot?: (state: unknown) => void;
  /**
   * 房主专用：一条指令**没有任何直连客人收到**时，把这条原始指令镜像给云端。
   *
   * 为什么需要：客人刚进房、DataChannel 还没建好的这几秒里，房主的下发在本地就断了，
   * 云端也一无所知 —— 客人看到的是一间静止的房间（别人不动、点播不出现），
   * 表现出来就是「进房很慢」。镜像给云端后，这段时间由云端先兜着。
   *
   * 注意镜像的是**客户端指令**（player:move / video:control 这种），不是广播结果，
   * 因为服务端 RoomCore 只认指令，收到广播会当作未知消息丢掉。
   */
  onMirrorCommand?: (json: string) => void;
  /**
   * 房主专用：启动时用这份状态初始化核心，而不是读 localStorage。
   * 「云端 → 直连」切换时用它把当前房间内容带过来，否则房主会拿一份旧存档开局，
   * 全屋人的视频进度和布置会跳回上次直连时的样子。
   */
  initialState?: unknown;
}

const DC_LABEL = 'koko-state';

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
  private persistTimer: number | null = null;
  private everConnected = false;
  /** 房主每 2 秒往各条 DataChannel 打一次心跳；客人据此判断房主是否还在 */
  private pingTimer: number | null = null;
  private watchdogTimer: number | null = null;
  private lastHostSeenAt = 0;
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
      if (this.opts.initialState) {
        try {
          this.core!.restoreState(this.opts.initialState as any);
        } catch {
          this.restoreHostState();
        }
      } else {
        this.restoreHostState();
      }
      this.apply(this.core!.join(this.opts.selfId, joinMessage));
      this.startPersisting();
      // 立刻镜像一次：否则进房头 5 秒内房主掉线，接管的人会看到空房间
      this.persistNow();
      // 房主本身就是权威，没有「连不上」这回事 —— 必须立刻置为 connected。
      // 否则 App 里 6 秒的直连超时会先把房主踢回云端（房主进房时还没客人，
      // status 永远是 connecting），之后的 p2p:signal 就再也没人应答了。
      this.setStatus('connected');
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

  // ── 房主状态持久化：刷新页面后房间不会回到初始状态 ──
  private storageKey(): string {
    return `koko_host_state_${this.opts.roomId}`;
  }

  private restoreHostState() {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return;
      this.core!.restoreState(JSON.parse(raw));
    } catch {
      /* 存档损坏就忽略 */
    }
  }

  private startPersisting() {
    if (this.persistTimer) window.clearInterval(this.persistTimer);
    this.persistTimer = window.setInterval(() => this.persistNow(), 5000);
  }

  // ── 心跳：客人问，房主答 ────────────────────────────────────────────
  // 为什么是反向的：房主如果在后台标签，浏览器会把它的 setInterval 节流到 1 分钟一次，
  // 由房主主动发心跳就会被误判成「房主没了」。改成客人每 2 秒发一问、房主在
  // DataChannel 的 onmessage 里立刻回包 —— 那是网络事件，不受定时器节流影响。
  // 房主直接关机时浏览器发不出 close 帧，只能等 ICE 自己超时（通常 30 秒以上），
  // 心跳把这段压到 7 秒。
  private startWatchdog() {
    if (this.watchdogTimer) return;
    this.lastHostSeenAt = Date.now();

    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(() => {
      if (this.closed) return;
      const dc = this.peers.get(this.opts.hostId)?.dc;
      if (dc?.readyState === 'open') {
        try {
          dc.send(JSON.stringify({ type: 'p2p:ping', t: Date.now() }));
        } catch {
          /* 下一轮再发 */
        }
      }
    }, 2000);

    this.watchdogTimer = window.setInterval(() => {
      if (this.closed || this.status === 'failed') return;
      if (Date.now() - this.lastHostSeenAt > 7000) {
        this.setStatus('failed', '房主已离开，已切回云端房间');
      }
    }, 1500);
  }

  private persistNow() {
    if (this.opts.role !== 'host' || !this.core) return;
    let state: unknown;
    try {
      state = this.core.exportState();
      localStorage.setItem(this.storageKey(), JSON.stringify(state));
    } catch {
      /* 隐私模式或超配额，忽略；云端镜像仍然要发 */
    }
    if (state) {
      try {
        this.opts.onSnapshot?.(state);
      } catch {
        /* 镜像失败不影响本地 */
      }
    }
  }

  private createPeer(remoteId: string): PeerEntry {
    const pc = new RTCPeerConnection(buildRtcConfig());
    const entry: PeerEntry = { pc, dc: null, bindId: null };
    this.peers.set(remoteId, entry);

    pc.onicecandidate = (e) => {
      if (e.candidate) this.opts.sendSignal(remoteId, { candidate: e.candidate });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        // 客人连不上房主才回落云端；房主侧某个 peer 失败只是那个客人掉线，
        // 不能把房主自己也踢回云端（那样整个房间的直连全废）
        if (this.opts.role === 'guest') {
          this.setStatus('failed', '与房主的连接失败（可能需要 TURN）');
        } else {
          console.warn('[p2p] peer connection failed:', remoteId);
        }
      } else if (pc.connectionState === 'connected' && this.opts.role === 'guest') {
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
      this.everConnected = true;
      if (this.opts.role === 'guest') {
        // 客人：连上后补发 join，房主据此注册并回 room:init
        if (this.joinMsg) dc.send(JSON.stringify(this.joinMsg));
        this.flush();
        this.setStatus('connected');
        // 通道通了才开始盯房主心跳：连不上的情况由 App 的 6 秒超时兜底
        this.startWatchdog();
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
        // 任何一条来自房主的消息都算「房主还活着」，不只是心跳
        this.lastHostSeenAt = Date.now();
        if (msg.type === 'p2p:pong') return;
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
        this.setStatus(
          'failed',
          this.everConnected ? '房主已离开，已切回云端房间' : '直连房主失败，已切回云端房间'
        );
      }
    };
    if (dc.readyState === 'open') {
      // 通道在绑定前就已 open（客人侧常见）
      if (this.opts.role === 'guest') {
        if (this.joinMsg) dc.send(JSON.stringify(this.joinMsg));
        this.flush();
        this.setStatus('connected');
        this.startWatchdog();
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

    // 客人的存活探测：直接回包，别进核心（这是传输层的事，不是房间状态）
    if (msg.type === 'p2p:ping') {
      if (entry?.dc && entry.dc.readyState === 'open') {
        try {
          entry.dc.send(JSON.stringify({ type: 'p2p:pong', t: Date.now() }));
        } catch {
          /* ignore */
        }
      }
      return;
    }

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
        // 没有任何直连客人收得到 → 把这条指令镜像给云端，让「正在建直连」的人也能实时看到
        let anyOpen = false;
        for (const entry of this.peers.values()) {
          if (entry.dc && entry.dc.readyState === 'open') {
            anyOpen = true;
            break;
          }
        }
        if (!anyOpen) this.opts.onMirrorCommand?.(json);
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

  /** 房主：导出当前权威状态。切回云端前推一次，避免云端状态比现场落后 5 秒 */
  snapshotState(): unknown {
    return this.opts.role === 'host' && this.core ? this.core.exportState() : null;
  }

  close() {
    this.closed = true;
    if (this.persistTimer) {
      window.clearInterval(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.pingTimer) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.watchdogTimer) {
      window.clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.persistNow();
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

/**
 * 是否启用 P2P。
 * 优先级：URL 显式指定 > 本地偏好 > 默认云端。
 * URL 上 `p2p=1` / `p2p=0` 保留给分享链接和排查用；用户在界面上切过一次之后，
 * 写进 localStorage 并同步改 URL，刷新不会跳回原来的模式。
 */
export function isP2PEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const param = new URLSearchParams(window.location.search).get('p2p');
  if (param === '1') return true;
  if (param === '0') return false;
  try {
    return localStorage.getItem('koko_link_mode') === 'direct';
  } catch {
    return false;
  }
}

/** 记住用户选的连接方式，并把 URL 上的 p2p 参数改成一致（分享出去的链接也一致） */
export function setLinkModePreference(mode: 'cloud' | 'direct'): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('koko_link_mode', mode);
  } catch {
    /* 隐私模式忽略 */
  }
  try {
    const url = new URL(window.location.href);
    if (mode === 'direct') url.searchParams.set('p2p', '1');
    else url.searchParams.delete('p2p');
    window.history.replaceState(null, '', url.toString());
  } catch {
    /* ignore */
  }
}
