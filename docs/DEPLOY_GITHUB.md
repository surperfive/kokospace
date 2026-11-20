# 用 GitHub 管理代码 + 自动部署（以后在云端改）

## 先说清楚一件事

**GitHub Pages 跑不了这个项目。** Pages 只发静态文件，没有常驻 WebSocket 服务端；
而这个应用的多人同步（走路、视频进度、聊天）全靠 `/ws` + 房间状态。把前端放 Pages，
`/ws` 那一端仍然是 404，进房间后一个人都看不见。

所以这里的做法是：

```
GitHub 仓库（代码 / 云端编辑）
      │  push 到 main
      ▼
GitHub Actions（npm ci → vite build → wrangler deploy）
      │
      ▼
Cloudflare Workers（前端静态资源 + Durable Object 房间）  ← 访问的是这里
```

「云端修改」由 GitHub 的网页编辑器（github.dev）实现，不用在本机装任何环境；
**部署目标仍是 Cloudflare**，只是不再需要本地命令行。

---

## 已经准备好的东西

| 文件 | 作用 |
| --- | --- |
| `.github/workflows/deploy.yml` | push 到 main / 手动触发 → 自动构建并部署 |
| `.npmrc` | `legacy-peer-deps=true`，让 CI 里 `npm ci` 不会因 vite8/esbuild peer 冲突失败 |
| `.gitignore` | 已排除 `node_modules/`、`dist/`、`.wrangler/`、`_scratch/` |
| 本地 git 仓库 | 已 `git init -b main` 并完成首次提交（47 个文件） |

---

## 你只需要做 4 步（约 3 分钟）

### 1. 建一个空仓库

打开 <https://github.com/new> → Repository name 填 `kokospace` → **不要**勾 "Add a README" / "Add .gitignore" / license → Create repository。

> 建议选 **Public**：Actions 分钟数不限；私有仓库每月 2000 分钟（一次部署约 1 分钟，其实也够）。
> 这个仓库里没有密钥，公开是安全的。

### 2. 建一个 Cloudflare API Token

Dashboard → 右上头像 → **My Profile → API Tokens → Create Token** →
选模板 **「Edit Cloudflare Workers」** → Continue → Create → 复制那串 token（只显示一次）。

这个 token 权限是：Workers Scripts 读写 + Account 只读 + Zone 读取，够用且不过度。

### 3. 把 token 存成仓库 Secret

仓库 → **Settings → Secrets and variables → Actions → New repository secret**，加两条：

| Name | Secret |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | 上一步复制的 token |
| `CLOUDFLARE_ACCOUNT_ID` | `ce72297a5f7faac96aeb087d4ad1b77e` |

Secret 只存加密值，不会出现在代码或日志里。

### 4. 推送

```powershell
cd "C:\Users\OOW\Downloads\kokospace-—-2d-元宇宙多人共看影院 (1)"
git remote add origin https://github.com/surperfive/kokospace.git
git push -u origin main
```

首次推送会弹 GitHub 登录窗口（浏览器授权即可）。推完去仓库的 **Actions** 标签页，能看到 `Deploy to Cloudflare Workers` 正在跑，
约 40 秒完成，最后输出 `https://kokospace.kccogk.workers.dev`。

---

## 另一条路：让 Cloudflare 自己拉 GitHub（不用建 API Token）

如果你不想折腾 API Token，Cloudflare 现在也能**直接连 Git 仓库**，push 后由 Cloudflare 自己构建：

Dashboard → Workers & Pages → `kokospace` → **Settings → Builds → Connect** → 授权 GitHub → 选仓库和 `main` 分支
→ 构建命令填 `npm run build` → 部署命令填 `npx wrangler deploy` → Save。
（`npm ci` 会自动读仓库里的 `.npmrc`，`legacy-peer-deps` 生效。）

两条路的取舍：

| | GitHub Actions（本仓库已配好） | Cloudflare Workers Builds |
| --- | --- | --- |
| 需要什么 | 2 个仓库 Secret（API Token + Account ID） | 只需在 Cloudflare 里授权一次 GitHub |
| 构建日志 | 在 GitHub 的 Actions 页 | 在 Cloudflare 的 Builds 页 |
| 适合 | 想留完整 CI 记录、以后加测试/lint | 只想「push 就上线」，越少配置越好 |

⚠️ **两条路只能开一条**。同时开着，一次 push 会触发两次部署、互相覆盖。
走 Workers Builds 的话，把 `.github/workflows/deploy.yml` 删掉或改名成 `.yml.bak` 再提交。

---

## 以后怎么改（这就是「云端修改」）

1. 浏览器打开 `https://github.dev/<你的用户名>/kokospace`
   —— 网页版 VS Code，左侧文件树、右侧编辑，支持搜索/全局替换/提交，不用装任何东西。
   （也可以按 `.` 键从仓库页面直接跳进去，或在仓库里点某个文件直接改。）
2. 改完在左侧 Source Control 里写一句提交信息 → Commit to main。
3. GitHub Actions 自动构建 + 部署，40 秒后线上就是新版本。
4. 想看日志：仓库 → Actions → 点最新那次运行。

也可以在任意一台电脑上 `git clone` 后改完 push，效果一样。

---

## 常见问题

**Actions 报 `npm ci can only install with an existing package-lock.json`**
→ 仓库里缺 `package-lock.json`。当前提交里已经有了；以后改依赖记得把 `package-lock.json` 一起提交。

**Actions 报 Authentication error**
→ Secret 名字拼错（必须是 `CLOUDFLARE_API_TOKEN`），或 token 没给 Workers 权限（用「Edit Cloudflare Workers」模板）。

**`Install dependencies` 和 `Build frontend` 都绿，只有 `Deploy worker + assets` 红**
→ 基本就是 Secret 没配或名字不对。那一步 3 秒内就失败（正常部署要 20 秒以上），说明是认证问题不是网络问题。
现在工作流前面加了 `Check Cloudflare secrets` 步骤，缺 Secret 会直接告诉你缺哪个、去哪儿加。

**在 Cloudflare 控制台误开了 Pages 项目**
→ Pages 只能放静态文件，这个项目进房间要靠 Durable Object + WebSocket，Pages 上跑不了。
如果已经建了，去 Pages 项目 → Settings → 最下面 Delete project 删掉；重新走「Workers → Import a repository」。
`*.pages.dev` 那个域名访问前端能打开，但进房间会一直重连。

**部署成功但打开是 404**
→ 检查是不是访问了 `https://<worker>.<账号>.workers.dev` 而不是别的域名；`wrangler.jsonc` 里 `name` 就是 worker 名。

**Actions 免费额度**
→ 公开仓库不限；私有仓库每月 2000 分钟，一次部署约 1 分钟，正常用完全够。

**能不能顺手也要一个 github.io 页面**
→ 可以，但只是前端壳子：构建时注入 `VITE_WS_URL=wss://kokospace.kccogk.workers.dev`，
让 WS 指向 Cloudflare。功能依旧依赖 Cloudflare Worker 活着，等于两处部署、两个地址，
且国内访问 github.io 本身也慢。除非你确实需要 github.io 这个域名，否则不建议。

**怎么改 worker 名字 / 绑自定义域名**
→ 改 `wrangler.jsonc` 的 `name` 后 push；自定义域名在 Dashboard → Workers → kokospace → Settings → Domains & Routes 添加。

---

## 回滚

- 代码层面：GitHub 上把某次提交 revert（网页就能操作），push 后自动回到旧版本。
- Cloudflare 层面：Dashboard → Workers → kokospace → Deployments → 选旧版本 → Rollback；
  或本地 `npx wrangler rollback`。
