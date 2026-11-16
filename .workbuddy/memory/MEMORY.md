# KokoSpace 项目长期记忆

## 技术栈与结构
- React 19 + Vite 8 + Tailwind 4 + motion + firebase（Auth/Firestore，登录可选，游客也能进房间）。
- 服务端两套实现，协议一致，改消息格式要**两边同时改**：
  - 本地/Node：`server.ts`（Express + ws，`npm run dev` → :3000，房间状态在内存 Map）
  - Cloudflare：`worker/index.ts`（Worker + `RoomDurableObject`，`npm run cf:dev` → :8787）
- WebSocket 路径 `/ws?room=<roomId>`。query 参数是给 Durable Object 路由用的，Express 的 ws path 匹配忽略 query。
- 房间号规则：`[a-zA-Z0-9_-]`，最长 32；不带 `room` → `lobby`。邀请链接 = `origin/?room=xxx`（复制按钮已用 `window.location.origin`，部署后自动适配）。

## 部署
- **线上：https://kokospace.kccogk.workers.dev**（房间链接 `?room=xxx`）。Cloudflare 账号 kccogk@outlook.com，
  Account ID `ce72297a5f7faac96aeb087d4ad1b77e`，Worker 名 `kokospace`，wrangler OAuth 已登录在本机。
- Cloudflare Workers + Static Assets + Durable Objects，配置在 `wrangler.jsonc`，详见 `docs/DEPLOY_CLOUDFLARE.md`。
- 依赖安装必须 `npm install --legacy-peer-deps`（esbuild ^0.25 vs vite 8 peer 冲突）。
- `dist/` 在 .gitignore 里，部署时由 `npm run deploy`（vite build && wrangler deploy）现构建。
- **本机直连 `*.workers.dev` 不通**（超时/代理 502），只能 `wrangler` 走 api.cloudflare.com 操作；线上验收要在能访问 CF 的网络里做。

## 已知限制
- 房间状态只在内存（DO 内存 / Express Map），空房间会重置。
- 语音是 P2P WebRTC，信令走业务 WS，无 TURN，严格 NAT 下可能连不上。
- 免费计划配额：Workers 10 万请求/天；DO 按连接时长计 duration。
