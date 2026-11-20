/**
 * WebRTC ICE 配置（状态通道 + 空间语音共用）
 *
 * 实测（2026-11-19，国内家宽）：
 *   stun.miwifi.com      137ms  ✅
 *   stun.douyucdn.cn     138ms  ✅
 *   stun.chat.bilibili   954ms  ✅
 *   stun.cloudflare.com  6703ms ❌ 太慢，UDP 绕路，别用
 *   stun.qq.com          6007ms ❌ 已不可用
 *   stun.l.google.com    6003ms ⚠️ 国内不可达，仅作海外兜底
 *
 * Google 的放最后：浏览器虽然并发收集，但慢的 STUN 会拖长 iceGathering 完成时间，
 * 一旦超过 App 里 6 秒的直连超时，就会「能打洞却回落云端」。
 *
 * TURN 不是必需的：家庭宽带靠 STUN 打洞能覆盖大部分组合。
 * 只有对称 NAT（公司 / 校园 / 部分 4G）才需要，通过
 * VITE_TURN_URL / VITE_TURN_USER / VITE_TURN_PASS 注入即可。
 */

const STUN_URLS = [
  'stun:stun.miwifi.com:3478',
  'stun:stun.douyucdn.cn:18000',
  'stun:stun.chat.bilibili.com:3478',
  'stun:stun.l.google.com:19302',
];

export function buildRtcConfig(): RTCConfiguration {
  const iceServers: RTCIceServer[] = [{ urls: STUN_URLS }];

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
