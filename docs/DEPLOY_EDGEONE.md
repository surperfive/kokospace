# 部署到 EdgeOne（含国内访问的真实前提）

## 先明确一件事

**EdgeOne 的 serverless 跑不了这个项目的房间服务。**

| EdgeOne 能力 | 能不能扛房间 | 原因 |
| --- | --- | --- |
| Edge Functions（V8） | ✗ | 官方明确不支持 WebSocket |
| Cloud Functions（Node 20） | ✗ | 请求级无状态，请求之间不保留内存；单次墙钟时长也有限 |
| Agent 函数 | ✗ | 有会话亲和，但入口是 HTTP、空闲 5 分钟回收、会话最长 6 小时，没有 WS 入口 |
| KV | ✗ | 60 秒最终一致、每天 1 万次写，位置同步几分钟就打满 |
| **边缘安全加速平台（CDN）** | ✓ | 支持 WebSocket 回源，但空闲超时最长 300 秒 |

所以能落地的只有两种组合，**房间服务必须跑在一台常驻主机上**（云服务器 / 云托管容器）。

---

## 方案 A：整站放服务器 + EdgeOne 加速（推荐，改动最小）

一个域名、同源 WebSocket、不用改 `VITE_WS_URL`。

```
用户 ──▶ EdgeOne 加速域名（大陆节点，需备案）
          ├── 静态资源 dist/（缓存命中率高）
          └── /ws 回源到你的服务器:3000（开 WebSocket）
```

### 1. 一台服务器（顺带把镜像做了）

已在仓库里准备好 `deploy/Dockerfile`：

```bash
# 服务器上（装好 docker 后）
git clone https://github.com/surperfive/kokospace.git && cd kokospace
docker build -f deploy/Dockerfile -t kokospace .
docker run -d --name kokospace -p 3000:3000 --restart unless-stopped kokospace
curl -s http://127.0.0.1:3000/api/health   # 应返回 {"ok":true,...}
```

服务器建议 1 核 2G，Node 进程常驻内存约 80–150MB，够几十人。

### 2. EdgeOne 接入

1. EdgeOne 控制台 → **添加站点** → 填你的域名 → 按提示到域名注册商改 NS
2. **站点加速 → 网络优化 → WebSocket**：**开启**，超时按默认 300 秒即可
   （客户端已加 25 秒心跳，不会因为看电影时没人走动被断）
3. **规则引擎** → 新增规则：
   - 匹配：`Path` 等于 `/ws` → 动作：**WebSocket 开启**、**不缓存**、超时 300s
   - 匹配：其余路径 → **缓存**（`/assets/*` 可设长缓存，`index.html` 设不缓存）
4. **源站配置**：回源协议 HTTP，端口 3000，指向你的服务器公网 IP
5. 域名解析到 EdgeOne 给的 CNAME

### 3. 验证

- `https://你的域名/api/health` → `{"ok":true,"runtime":...}`
- `https://你的域名/?room=test` → 能进房间、两个设备能互相看见

### 前置条件（绕不过去）

**域名必须完成 ICP 备案**。EdgeOne 只要加速区域包含中国大陆，绑定自定义域名就要求工信部备案，
未备案会被拦截（403/401）。备案通过腾讯云/阿里云提交，周期一般 1–3 周，免费。

---

## 方案 B：前端放 EdgeOne Pages，WS 留在别处

适合「已经有一台境外/其他机器在跑 WS」的情况。项目已经支持，构建时注入 `VITE_WS_URL` 即可。

1. EdgeOne Pages 控制台 → 导入 Git 仓库 `surperfive/kokospace`
   - 构建命令：`npm install && npm run build`
   - 输出目录：`dist`
   - 环境变量：`VITE_WS_URL=wss://你的-ws-域名`（不带末尾斜杠）
2. 前端不需要 SPA 回退规则——这个应用只用 `?room=` 查询参数，没有 path 路由。
3. WS 侧仍要一台常驻主机（方案 A 的第 1 步，或继续用 Cloudflare Worker）。

注意：Pages 的默认域名（`*.edgeone.app`）在中国大陆加速区只有 3 小时有效的预览链接，
对外长期用必须绑**已备案的自定义域名**。选「全球可用区（不含中国大陆）」可免备案，但国内访问也就不快了——
如果目的就是国内快，那这条没有意义。

---

## 提前说清的取舍

| 方案 | 国内速度 | 前置成本 | 维护 |
| --- | --- | --- | --- |
| **EdgeOne + 国内服务器（A）** | 20–50ms，稳 | 域名 + 备案（1–3 周）+ 服务器 ¥60/月起 | 要管一台机器 |
| Cloudflare + 自有域名 | 150–300ms，偶抖动 | 域名 ¥30/年，无备案 | 零运维 |
| Cloudflare `workers.dev` | 经常打不开 | 0 | 零运维 |

如果只是想「国内能稳定打开、别太折腾」，绑域名到 Cloudflare 就够了；
如果要求真正低延迟（多人同步手感），才值得走 EdgeOne + 备案这条。

---

## 已经改好的代码

- `src/App.tsx`：WebSocket 每 25 秒发一次 `{"type":"client:ping"}` 心跳，防 EdgeOne 300 秒空闲断连；
  服务端不认识这个类型会自动忽略，两套服务端都不用改。
- `src/App.tsx`：WS 地址支持 `VITE_WS_URL` 覆盖，默认同源。
- `deploy/Dockerfile` + `.dockerignore`：一条命令把整站（前端 + WS）打进镜像。
