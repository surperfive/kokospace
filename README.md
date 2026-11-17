# KokoSpace · 2D 元宇宙多人共看影院

走进一个 2D 像素风房间，和朋友们一起看电影。角色可以走动、坐下、贴脸聊天（空间语音）、
看电影、切场景、摆家具，房间地址可以随手发人，对方点开就进同一个房间。

线上地址：**https://kokospace.kccogk.workers.dev**（房间链接 `?room=任意房间号`）

---

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 19 + Vite 8 + Tailwind 4 + motion |
| 实时 | WebSocket（自研 JSON 协议，一个房间一份权威状态） |
| 服务端（线上） | Cloudflare Workers + Durable Objects（`worker/index.ts`） |
| 服务端（本地） | Express + ws（`server.ts`，房间状态在内存） |
| 账号 | Firebase Auth / Firestore（可选，游客也能进房间） |

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
src/                前端（组件 / 场景数据 / 形象绘制 / 空间音频 / Firebase）
worker/index.ts     Cloudflare Worker 入口 + RoomDurableObject（房间协议实现）
server.ts           本地 Express + ws 版本，协议同 worker/index.ts
wrangler.jsonc      Workers 配置：静态资源 + Durable Object 绑定 + 迁移
docs/               部署与开发文档
```

---

## 已知限制

- 房间状态在内存（DO 内存 / Node 的 Map），最后一人离开后重置。
- 语音是 P2P WebRTC，信令走业务 WS，未配 TURN，双方都在严格 NAT 下可能连不上。
- `*.workers.dev` 在中国大陆网络经常不可达，要稳定需绑自己的域名。
