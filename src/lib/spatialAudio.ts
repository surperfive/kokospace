import { PlayerState } from '../types/metaverse';

export const PROXIMITY_RADIUS = 420;
export const FULL_VOLUME_RADIUS = 110;

interface PeerAudioEntry {
  pc: RTCPeerConnection;
  audioEl: HTMLAudioElement;
  gainNode?: GainNode;
  sourceNode?: MediaStreamAudioSourceNode;
  remoteStream?: MediaStream;
}

type SignalSender = (targetId: string, signal: unknown) => void;

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export class SpatialAudioManager {
  private localStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private peers = new Map<string, PeerAudioEntry>();
  private sendSignal: SignalSender;
  private localId = '';
  private analyser: AnalyserNode | null = null;
  private micLevelTimer: number | null = null;
  private onSpeakingLevel?: (level: number) => void;

  constructor(sendSignal: SignalSender, onSpeakingLevel?: (level: number) => void) {
    this.sendSignal = sendSignal;
    this.onSpeakingLevel = onSpeakingLevel;
  }

  setLocalId(id: string) {
    this.localId = id;
  }

  private ensureAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new Ctx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  async enableMic(): Promise<boolean> {
    if (this.localStream) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      this.localStream = stream;
      const ctx = this.ensureAudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      this.analyser = analyser;

      for (const entry of this.peers.values()) {
        for (const track of stream.getAudioTracks()) {
          entry.pc.addTrack(track, stream);
        }
      }

      this.startMicMonitor();
      return true;
    } catch (err) {
      console.warn('Microphone access declined or unavailable:', err);
      return false;
    }
  }

  disableMic() {
    if (this.micLevelTimer) {
      window.clearInterval(this.micLevelTimer);
      this.micLevelTimer = null;
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    this.onSpeakingLevel?.(0);
  }

  private startMicMonitor() {
    if (this.micLevelTimer) window.clearInterval(this.micLevelTimer);
    const data = new Uint8Array(128);
    this.micLevelTimer = window.setInterval(() => {
      if (!this.analyser || !this.localStream) {
        this.onSpeakingLevel?.(0);
        return;
      }
      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length / 255;
      this.onSpeakingLevel?.(avg > 0.04 ? Math.min(1, avg * 3) : 0);
    }, 120);
  }

  async connectToPeer(remoteId: string) {
    if (!remoteId || remoteId === this.localId || this.peers.has(remoteId)) return;
    // Deterministic initiator to avoid glare
    if (this.localId < remoteId) {
      const entry = this.createPeerEntry(remoteId);
      const offer = await entry.pc.createOffer({ offerToReceiveAudio: true });
      await entry.pc.setLocalDescription(offer);
      this.sendSignal(remoteId, { sdp: entry.pc.localDescription });
    }
  }

  private createPeerEntry(remoteId: string): PeerAudioEntry {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const audioEl = new Audio();
    audioEl.autoplay = true;
    audioEl.setAttribute('playsinline', 'true');

    const entry: PeerAudioEntry = { pc, audioEl };
    this.peers.set(remoteId, entry);

    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.sendSignal(remoteId, { candidate: e.candidate });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      entry.remoteStream = stream;
      audioEl.srcObject = stream;
      audioEl.muted = true; // Route audio through Web Audio GainNode for smooth spatial attenuation
      try {
        const ctx = this.ensureAudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = 0.8;
        src.connect(gain);
        gain.connect(ctx.destination);
        entry.sourceNode = src;
        entry.gainNode = gain;
      } catch {
        audioEl.muted = false;
      }
    };

    return entry;
  }

  async handleSignal(fromId: string, signal: any) {
    let entry = this.peers.get(fromId);
    if (!entry) {
      entry = this.createPeerEntry(fromId);
    }

    try {
      if (signal.sdp) {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        if (signal.sdp.type === 'offer') {
          const answer = await entry.pc.createAnswer();
          await entry.pc.setLocalDescription(answer);
          this.sendSignal(fromId, { sdp: entry.pc.localDescription });
        }
      } else if (signal.candidate) {
        await entry.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.warn('WebRTC signaling error:', err);
    }
  }

  updateSpatialGains(me: PlayerState | undefined, others: PlayerState[]) {
    if (!me) return;
    for (const peer of others) {
      if (peer.id === me.id) continue;
      const entry = this.peers.get(peer.id);
      if (!entry) continue;

      let targetGain = 0;
      if (!peer.isMicOn) {
        targetGain = 0;
      } else if (peer.isBroadcasting) {
        targetGain = 1;
      } else {
        const dist = Math.hypot(peer.x - me.x, peer.y - me.y);
        if (dist <= FULL_VOLUME_RADIUS) {
          targetGain = 1;
        } else if (dist >= PROXIMITY_RADIUS) {
          targetGain = 0;
        } else {
          const t = 1 - (dist - FULL_VOLUME_RADIUS) / (PROXIMITY_RADIUS - FULL_VOLUME_RADIUS);
          targetGain = Math.pow(t, 1.5);
        }
      }

      if (entry.gainNode && this.audioCtx) {
        entry.gainNode.gain.setTargetAtTime(targetGain, this.audioCtx.currentTime, 0.08);
      } else {
        entry.audioEl.volume = targetGain;
      }
    }
  }

  removePeer(remoteId: string) {
    const entry = this.peers.get(remoteId);
    if (!entry) return;
    entry.pc.close();
    entry.audioEl.srcObject = null;
    this.peers.delete(remoteId);
  }

  destroy() {
    this.disableMic();
    for (const id of Array.from(this.peers.keys())) {
      this.removePeer(id);
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
  }
}
