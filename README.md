# KokoSpace · 2D 元宇宙多人共看影院

走进一个 2D 像素风房间，和朋友们一起看电影。角色可以走动、坐下、贴脸聊天（空间语音）、
看电影、切场景、摆家具，房间地址可以随手发人，对方点开就进同一个房间。
巨幕可以缩成可拖动的**小窗**（电脑和手机都支持），边逛边看；小窗里能直接点播、发言，
别人发的消息会在画面右下角冒个气泡，约 3 秒后消散。
还有内置**像素画板**：画完可以挂到房间墙上，房间里所有人都能看到。

线上地址：**https://kokospace.kccogk.workers.dev**（房间链接 `?room=任意房间号`）

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 19 + Vite 8 + Tailwind 4 + motion |
| 实时 | WebSocket（自研 JSON 协议，一个房间一份权威状态） |
| 服务端（线上） | Cloudflare Workers + Durable Objects（`worker/index.ts`） |
| 服务端（本地） | Express + ws（`server.ts`，房间状态在内存） |
| 账号 | 无。形象、场景方案、点播记录都存在本机 localStorage |

两套服务端**协议完全一致**，改消息格式要两边同时改。

---

## 本地开发

```bash
npm install          # .npmrc 里已设 legacy-peer-deps，不用再加参数
npm run dev          # Express + Vite，http://localhost:3000
```

打开 `http://localhost:3000/?room=test`，多开几个标签页就能看到彼此。

想跑 Cloudflare 的运行时（workerd + Durable Object）：

```bash
npm run cf:dev       # http://localhost:8787
```

---

## 部署

两条路，任选一条，见文档：

- **GitHub 修改 → 自动部署**：[`docs/DEPLOY_GITHUB.md`](docs/DEPLOY_GITHUB.md)
- **Cloudflare 手动/完整说明**：[`docs/DEPLOY_CLOUDFLARE.md`](docs/DEPLOY_CLOUDFLARE.md)

```bash
npm run deploy       # vite build && wrangler deploy（需先 npx wrangler login）
```

---

## 目录

```
src/                前端（组件 / 场景数据 / 形象绘制 / 空间音频 / 本地存储）
worker/index.ts     Cloudflare Worker 入口 + RoomDurableObject（房间协议实现）
server.ts           本地 Express + ws 版本，协议同 worker/index.ts
wrangler.jsonc      Workers 配置：静态资源 + Durable Object 绑定 + 迁移
docs/               部署与开发文档
```

---

## 已知限制

- 房间状态在内存（DO 内存 / Node 的 Map），最后一人离开后重置。
- **房主关机 = 房间结束。** 直连模式下房间状态在房主浏览器里，关机就没了。
  剩下的人会在 7 秒内察觉并自动回落到云端房间；房主每 5 秒会把状态镜像到云端，
  所以队列、正在播的片子、聊天记录能接着用，但「房主」这个角色跟着没了，
  由云端重新推举一个。所有人都关掉页面，房间就彻底消失。
- 语音是 P2P WebRTC，信令走业务 WS，未配 TURN，双方都在严格 NAT 下可能连不上。
- `*.workers.dev` 在中国大陆网络经常不可达，要稳定需绑自己的域名。
- **B 站视频只能「对齐起播点」，不能真正同步进度**：B 站嵌入播放器没有 JS API，
  读不到也控制不了播放位置。进房会自动跟到房主当前时间，之后靠巨幕下方的
  「对齐所有人」手动校正，播放/暂停各端独立。细节与原因见
  [`docs/BILIBILI_SYNC.md`](docs/BILIBILI_SYNC.md)。
