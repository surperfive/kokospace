# 部署到 Cloudflare（可分享的房间链接）

## 先看结论

这个项目**不是纯静态站**：多人同房间依赖 `server.ts` 里的 WebSocket 长连接 + 内存中的房间状态。
所以 **Cloudflare Pages 单独托管不够用**（Pages 只发静态文件，没有常驻长连接服务端）。

两条路，按需要选：

| 方案 | 得到什么 | 代价 | 适合 |
| --- | --- | --- | --- |
| **A. Workers + Durable Objects**（已配好） | 永久链接 `https://kokospace.<子域>.workers.dev/?room=xxx` | 一条 `npm run deploy` | 真的要发给别人用 |
| **B. cloudflared 隧道** | 临时链接 `https://xxx.trycloudflare.com` | 本机必须一直开着，域名每次重启都变 | 本地演示、5 分钟试水 |

方案 A 的代码已经写好并提交到仓库，不需要再改协议：
`worker/index.ts`（服务端）+ `wrangler.jsonc`（部署配置）+ `src/App.tsx`（WebSocket 带上 `?room=`）。

---

## 方案 A：Workers + Durable Objects（推荐）

### 架构对应关系

```
浏览器 ──GET /index.html──────▶ Workers Static Assets (dist/)
       └─WSS /ws?room=abc123──▶ Worker ──▶ Durable Object「abc123」
                                              ├─ 该房间所有 WebSocket 连接
                                              └─ 玩家位置 / 视频进度 / 家具 / 聊天记录
```

- 一个房间 = 一个 Durable Object 实例，房间之间天然隔离，不会串线。
- DO 只按房间号路由，`/ws` 的 JSON 协议与 `server.ts` **完全一致**，客户端逻辑没动。
- 静态资源和 WebSocket 同一个域名同一个 Worker，没有跨域、没有 CORS、wss 自动生效。

### 一次性准备

```bash
# 0. 装依赖（必须带 --legacy-peer-deps）
#    原因：package.json 里 esbuild 是 ^0.25，而 vite 8 的 peer 要求 esbuild ^0.27/^0.28，
#    npm 会 ERESOLVE 直接失败。原来的 bun.lock 是 bun 装的，走的不是严格 peer 校验。
npm install --legacy-peer-deps

# 1. 免费注册 https://dash.cloudflare.com/sign-up（不绑卡，免费计划已含 Durable Objects）
# 2. 授权本机（会弹浏览器，选你刚注册的账号）
npx wrangler login
```

`wrangler`、`@cloudflare/workers-types` 已写进 `devDependencies`，装完就能用 `npx wrangler`。
（这台机器实测 `npm install` 走了 17 分钟，wrangler 依赖树还要再等一会儿，网络慢属于正常。）

### 本地先验一遍（不上线）

```bash
npm run cf:dev      # = vite build && wrangler dev
```

打开 `http://localhost:8787/?room=test`，**开两个浏览器标签页**：

- 两个角色互相可见、能走动 → WebSocket 通了
- 一边播放/暂停，另一边同步 → 房间状态权威性 OK
- 发消息两边都收到 → 广播 OK

> 注意：`localhost:8787` 是 Workers 运行时（workerd），不是 Node。
> 旧的 `npm run dev`（Express + Vite，:3000）仍然可用，本地开发照旧。

### 部署

```bash
npm run deploy      # = vite build && wrangler deploy
```

成功后终端会打印：

```
https://kokospace.<你的子域>.workers.dev
```

### 怎么让别人点链接进房间

1. 打开 `https://kokospace.<子域>.workers.dev/?room=abc123`（`abc123` 随便换，`[a-zA-Z0-9_-]`，最长 32）
2. 应用内右上角「复制邀请链接」按的也是 `window.location.origin + /?room=当前房间`，部署后它自动就是线上地址，直接粘贴发人。
3. 对方点开 → 选形象 → 进同一个房间。`room` 相同即同房间；不带 `room` 参数会落到公共大厅 `lobby`。

### 自定义域名（可选）

Workers → 选中 `kokospace` → **Settings → Domains & Routes → Add custom domain**。
域名必须已经托管在同一个 Cloudflare 账号下（可用免费的 NS 接入）。

---

## 方案 B：cloudflared 隧道（临时链接）

不想动 Cloudflare 账号时用这个，本机跑着服务，隧道给它一个公网地址。

```bash
# 1. 本机跑服务（Express + Vite，监听 3000）
npm install --legacy-peer-deps
npm run dev

# 2. 另开一个终端
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

终端里会出现 `https://xxxx-yyyy.trycloudflare.com`，加 `?room=abc123` 就是房间链接。

**什么时候不能用它**：本机休眠/断网/关终端 → 链接立刻失效；每次重启域名都变；别当成正式发布。

---

## 已验证到哪一步

在动手交付前跑过两层验证，不是「理论上能跑」：

1. **协议单测**（`_scratch/do_test.ts`，24 项全过）：用桩替 workerd，直接驱动 `RoomDurableObject`。
   覆盖 join/init、房主判定、出生点错开、移动广播且不回显自己、坐标钳制（x≤1520, y≥120）、
   聊天、暂停/seek 同步、B 站链接转 embed、场景切换换家具、WebRTC 定向信令、
   房主移交、脏数据不崩、房间隔离、HTTP 快照。
2. **真实 workerd 端到端**（`npm run cf:dev` + `_scratch/e2e_test.ts`，15 项全过）：
   `wrangler dev` 起真实 Workers 运行时 + Durable Object，两个真实 WebSocket 客户端进同一房间，
   验证静态资源 200、深链接 SPA 回退、`/api/health`、room:init、player:joined、移动、聊天、
   播放进度、房间隔离、离开广播；并用无头 Chrome 截图确认前端在 Workers 上正常渲染、URL 里的
   `?room=cfe2e` 正确带入房间。

> 两个测试脚本留在 `_scratch/`，可以随时重跑：`node_modules\.bin\tsx.cmd _scratch\do_test.ts`

---

## 部署记录

| 项 | 值 |
| --- | --- |
| 线上地址 | https://kokospace.kccogk.workers.dev |
| Cloudflare 账号 | kccogk@outlook.com（Account ID `ce72297a5f7faac96aeb087d4ad1b77e`） |
| Worker 名称 | `kokospace` |
| 最近部署 | 2026-11-16 00:37 (+08:00)，Version `0a78e96b-7211-4492-8a02-dd1c6bbcd1c8`，100% 流量 |
| 房间链接 | https://kokospace.kccogk.workers.dev/?room=任意房间号 |

**已知网络问题**：部署这台机器直连 `*.workers.dev` 会 20 秒超时，走本地代理是 502（CONNECT 被拒），
`api.cloudflare.com` 却能通（部署就是走它）。也就是说 **Worker 已在 Cloudflare 侧正常运行，但从这个网络环境打不开**。
要在国内稳定访问，需要绑定自己的域名并接入 Cloudflare（`wrangler domains` 或 Dashboard → Custom Domain），
或者按上一节的方案把 WS 源站放到国内常驻主机。

---

## 注意事项（踩过才知道的）

1. **免费计划配额**：Workers 每天 10 万请求；Durable Object 在房间有连接期间计 duration。几个人一起看电影完全够，几十人长期挂机需要升 Workers Paid（约 $5/月）。
2. **房间状态在 DO 内存里**：最后一个人离开后 DO 会被回收，下次进同一房间是干净的初始状态（和现在 Express 版行为一致）。要保留聊天/播放进度，后续加 `ctx.storage` 持久化即可。
3. **语音是 P2P WebRTC**：信令走我们的 WebSocket，音视频流不经过 Cloudflare。项目里没配 TURN 服务器，双方都在对称 NAT / 企业网下可能连不上——这是现有实现的限制，与部署无关。要稳定就加个 TURN（Cloudflare Calls 或自建 coturn）。
4. **Google 登录要加白名单**：Firebase Auth 只放行授权域名。要用登录功能，去 Firebase 控制台 → Authentication → Settings → Authorized domains，加上 `kokospace.<子域>.workers.dev`。不加也能进房间（游客身份 + localStorage 形象）。
5. **回滚**：`npx wrangler rollback` 回到上一个版本，或在 Dashboard → Workers → Deployments 里点回退。
6. **首次部署会创建 DO 迁移**：`wrangler.jsonc` 里 `migrations` 已经声明 `new_sqlite_classes`（免费计划只能用 SQLite 版 DO）。改类名/删类名要新增 migration tag，别复用旧 tag。

---

## 改了哪些文件

| 文件 | 作用 |
| --- | --- |
| `worker/index.ts` | 新增。Workers 入口 + `RoomDurableObject`，移植 `server.ts` 的全部消息协议与房间逻辑 |
| `wrangler.jsonc` | 新增。静态资源绑定、DO 绑定、迁移声明、SPA 回退 |
| `worker/tsconfig.json` | 新增。Worker 侧的 workers-types 类型检查（与前端 tsconfig 隔离） |
| `src/App.tsx` | 改 3 行。WebSocket URL 带上 `?room=<roomId>`，供 DO 路由；Express 端忽略 query，两端兼容 |
| `package.json` | 加 `cf:dev` / `deploy` 脚本，`wrangler`、`@cloudflare/workers-types` 进 devDependencies |
| `tsconfig.json` | `exclude` 增加 `worker`，避免前端 lint 误报 |
