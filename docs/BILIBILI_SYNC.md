# B 站视频的进度同步（能做到什么、做不到什么）

## 怎么把片子放进来（粘贴规则）

点播面板的输入框是 `textarea`，**整段分享文案直接粘**就行，不需要自己抠链接：

| 你粘进去的东西 | 怎么处理 |
| --- | --- |
| `https://www.bilibili.com/video/BV1GJ411x7h7` | 直接认出 BV |
| `【标题-哔哩哔哩】 https://b23.tv/xxxxx` | 服务端跟 302 拿到真实 BV，标题用【】里的 |
| `这个不错 BV1GJ411x7h7 你看下` | 全文扫 `BV[0-9A-Za-z]{10}`，命中即锁定 |
| `https://b23.tv/xxxxx`（短链解析失败） | 明确提示改用含 BV 号的链接，不会静默变成一个打不开的 mp4 |

关键实现：`src/lib/videoMeta.ts` 的 `extractBvid` / `extractShareTitle` /
`resolveBilibiliShortLink`。短链只能在服务端解析（浏览器跨域读不到重定向目标），
所以走 `/api/parse-video`；解析成功后返回 `canonicalUrl`，前端入队用的是
`https://www.bilibili.com/video/BVxxx` 这个稳定地址，而不是原始短链。

> 为什么一定要转成 BV：短链在房主浏览器、在 RoomCore、在别的客人那里都解析不了，
> 只有 BV 是全局稳定的标识。

## 结论先说

**B 站嵌入播放器（`player.bilibili.com/player.html`）没有任何外部控制接口，无法真正同步进度。**

它没有公开的 JS API，不响应 `postMessage`，跨域也拿不到内部的 `<video>` 元素。这意味着：

- 读不到它当前播到第几秒
- 控制不了播放 / 暂停 / 跳转
- **感知不到房主在 iframe 里拖了进度条**（最致命：连触发同步的时机都抓不到）

实测（2026-11-19，Chrome headless）：加载 `player.bilibili.com` 后依次发送 6 种格式的控制消息
（`{command:'play'}`、`{event:'command',func:'playVideo'}`、`{command:'seek',time:60}`、
`{method:'seekTo'}` 等），**回包 0 条**，播放器画面纹丝不动。

对比 YouTube：有 `enablejsapi=1` + postMessage，`CentralCinemaScreen.tsx` 里的
`sendYouTubeCmd` 实现了真正的双向同步（播放/暂停/跳转/回传时间）。B 站没有对应物。

## 现在的实现：起播点对齐 + 手动对齐

代码位置：`src/components/CentralCinemaScreen.tsx`

### 1. 起播点自动对齐（进房就有）

`iframeSrc` 用 `getExpectedTime()` 算出「房间此刻应该在播第几秒」，
塞进 B 站播放器的 `?t=` 参数：

```
https://player.bilibili.com/player.html?bvid=BV...&t=134&autoplay=1
```

效果：任何人打开房间链接，都会从房主当前的进度开始看，不用手动找位置。
实测迟到 13 秒进房，起播点 134 秒，误差 1 秒内。

### 2. 手动对齐（房主改了进度之后）

巨幕下方有一条 B 站专用控制条：

```
[B站] [========|=========] 02:21 / 03:33  [对齐所有人]
```

用法：**拖到目标时间 → 点「对齐所有人」**。

点下去会发一条标准的 `video:control action:'seek'`，服务端更新房间状态后广播，
所有人的 `videoState.currentTime` 跳到新值，前端检测到差值超过 2 秒就重建 iframe
（`biliSyncNonce` 计数器 → `iframeSrc` 重算 → iframe key 变化 → 重新加载到 `?t=`）。

只有控片人（点播人）能点，其他人按钮是禁用的。

### 3. 换片 / 时长

- 换片时清空对齐草稿，重新按房间时钟起播
- 时长来自 B 站 `view` 接口的 `duration`，两条路径：
  - **本地 Express**：服务端直接抓（`src/lib/videoMeta.ts`）
  - **Cloudflare Worker**：服务端抓会被 B 站风控打回 `HTTP 412`（出口 IP 问题，加 Referer/UA 无效），
    所以前端用 **JSONP** 兜底（`src/lib/bilibiliMeta.ts`，`jsonp=jsonp&callback=xxx` 走用户自己的 IP）
- 两边都失败时滑块量程兜底 1 小时，右侧显示 `--:--`

### 4. 播完自动切下一部

B 站播放器不会给我们任何「播完了」的事件，所以用**房间时钟 + 已知时长**推：

```
rAF 里每帧检查：t >= item.durationSec  →  发 video:control action:'next'
```

配套改动：`getExpectedTime()` 对 B 站改成 `Math.min(total, dur)`，到片尾就停在 dur
（内置待机短片仍然 `total % dur` 循环，不受影响）。

去重靠 `endedSentKeyRef`（`itemId:updatedAtMs`），一部件只发一次 next。

实际行为（线上实测）：

- 队列里还有片子 → 切到下一部（207s 对齐后约 8 秒触发）
- 队列空了 → 回到待机精选短片，和其它类型一致
- **拿不到时长就不会自动切**（`durationSec` 缺失时退化成播完停住），
  这也是为什么前面要费劲用 JSONP 把时长补上

只有控片人能触发，和 mp4 的 `onEnded` 走同一条 `handleMediaEnded` 路径。

## 必须承认的三个限制

1. **播放/暂停不同步。** 房主在 B 站播放器里点暂停，别人还在播。程序无法控制它，
   也没有任何事件可监听。控制条上刻意**不放**播放/暂停按钮 —— 放了只会让
   房间状态和实际画面对不上。

2. **每次对齐都会重新加载播放器。** iframe 重建 = 黑屏 1–3 秒 + 重新缓冲。
   所以拖动时不要实时广播，必须点按钮确认。`biliDraft` 是本地草稿，
   只有点「对齐所有人」才发消息。

3. **各自的时钟会漂。** 起播后各端按自己的网络走，卡顿一次就差几秒。
   长时间看片建议每隔 10–20 分钟手动对齐一次。滑块右侧的推算时间可以当参照。

## 为什么不做「解析直链」

理论上可以调 `api.bilibili.com/x/player/wbi/playurl` 拿 m4s/mp4 直链，
然后用 `<video>` 播放，复用 mp4 的完整同步链路（play/pause/seek 全同步 + 底部控制条）。

没做的原因：

- **wbi 签名**：2023 年后 playurl 必须签名，要先取 nav 的 img_key/sub_key 现算
- **直链 2 小时过期**：长片看到一半链接失效
- **未登录只有 480P**：高清要带 SESSDATA cookie，等于要用户登录态
- **dash 音视频分离**：1080P 以上返回两条流，得 ffmpeg 合并或双 `<video>` 同步播放
- **版权与 ToS 风险**：绕开播放器直取流，属于明确的灰色地带

结论：做出来是个半成品，掉一次链用户就骂。当前方案（起播对齐 + 手动对齐）
在「不改协议、不碰版权、不加依赖」的前提下已经是上限。

## 如果要真同步

三条路，按推荐度排：

1. **换片源**：把想一起看的内容转成 mp4 / HLS 直链，走现有 `isVideoStream` 链路，
   play/pause/seek 全同步，底部有完整控制条。这是唯一干净的方案。
2. **只支持 YouTube**：`enablejsapi=1` 已经实现，真双向同步，国内需要网络条件。
3. **自建媒体代理**：服务端拉流 + 转码成 HLS，前端播自己的流。工程量大，
   且法律风险不比方案 1 低。
