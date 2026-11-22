# 用 GitHub 管理代码 + 自动部署（以后在云端改）

## 当前用的是哪条路（2026-11-23 起）

**Cloudflare 自己的 Git 集成**：Dashboard → Workers & Pages → `kokospace` → Settings → Builds，
已连上 GitHub 仓库的 `main`。push 之后 Cloudflare 自己 `npm run build` + `npx wrangler deploy`，
**不需要任何 API Token，也不占 GitHub Actions 的分钟数**。

因此 `.github/workflows/deploy.yml` 已改成只在手动 `Run workflow` 时执行，不再随 push 自动跑
（之前每次 push 都会因为 `CLOUDFLARE_API_TOKEN` 失效挂一个红叉）。它是备用通道，下面的
「4 步」保留作参考：真要切回 GitHub Actions 时按那个配一遍 Secret 即可。

判断线上是不是最新：打开 <https://kokospace.de5.net/>，`view-source` 里的
`assets/index-XXXX.js` 换了就说明 Cloudflare 构建成功。构建日志在 Cloudflare 的 Builds 页面。

---

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

**为什么要 Token 而不是 `wrangler login`**：登录拿到的是 OAuth 凭证，大约 3 小时就过期，
刷新时还要连 `dash.cloudflare.com`（国内经常连不上），结果就是每部署一次都要在浏览器点一次
「Allow」。API Token 不会过期，本地和 CI 都能用同一串。

打开 <https://dash.cloudflare.com/profile/api-tokens>（或 Dashboard 右上头像 → **My Profile** → 左侧 **API Tokens**）。

1. 点 **Create Token**。
2. 找到模板 **Edit Cloudflare Workers**，点右边的 **Use template**。
3. 按下面填：

   | 字段 | 填什么 |
   | --- | --- |
   | **Token name** | `kokospace-deploy`（随便起，方便以后认） |
   | **Permissions** | 模板默认给的够用：`Account → Workers Scripts: Edit` 是核心（Durable Object 和静态资源都归它管） |
   | **Account Resources** | `Include` → 选你自己的账号 |
   | **Zone Resources** | 见下面的坑 |
   | **TTL** | 留空（永不过期），或设个很长的日期 |

   > ⚠️ **最容易卡住的地方**：模板会自带一条 `Zone → Workers Routes: Edit` 的权限，
   > 而 Zone Resources 默认是「Specific zone」却没选具体域名 —— 页面会标红
   > `Choose a zone resource`，底部的 **Create Token** 按钮点不动。
   > 这个项目只部署到 `*.workers.dev`，**把整条 Zone 权限删掉**（行尾的垃圾桶图标）就能继续。
   > 如果以后绑了自定义域名（比如 `kokospace.de5.net`），保留这条并选中那个域名。

4. 点 **Continue to summary** → **Create Token**。
5. **立刻复制**那串 token（`Continue to summary` 之后只显示这一次，关掉就再也看不到了）。

> 如果部署时 wrangler 报 Durable Object 相关的权限错误，回到这个 token 点 **Edit**，
> 加一条 `Account → Durable Objects: Edit` 再保存。

### 2.5 本地也用这串 token（可选，但强烈建议）

不配的话，本地 `npx wrangler deploy` 会走 OAuth，三小时过期一次。配好之后本地和 CI 用同一串，
`wrangler deploy` 直接生效，不再弹浏览器。

**Windows（PowerShell 或 CMD，二选一跑一次就行）**

```powershell
setx CLOUDFLARE_API_TOKEN "把刚才复制的 token 粘这里"
```

`setx` 写的是**用户级环境变量**，只对**之后新开的**终端生效 —— 当前这个窗口里读不到，
关掉重开一个再验证：

```powershell
npx wrangler whoami
```

能打印出账号名和 Account ID 就说明生效了。（`account_id` 已经写在 `wrangler.jsonc` 里，
所以本地不需要再设 `CLOUDFLARE_ACCOUNT_ID`。）

**macOS / Linux**

```bash
echo 'export CLOUDFLARE_API_TOKEN="把 token 粘这里"' >> ~/.zshrc   # 或 ~/.bashrc
source ~/.zshrc
npx wrangler whoami
```

**只想临时用一次**（不写进环境变量）：

```bash
CLOUDFLARE_API_TOKEN="xxx" npx wrangler deploy
```

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

**本地 `npx wrangler deploy` 老是要我在浏览器点 Allow，或者报 token expired**
→ 那是 `wrangler login` 的 OAuth 凭证过期了（约 3 小时），跟 API Token 无关。报
`could not be refreshed because the Cloudflare auth server could not be reached`
说明 `dash.cloudflare.com` 根本连不上（国内常见），刷新必然失败。
按上面「2.5 本地也用这串 token」设一个 `CLOUDFLARE_API_TOKEN` 环境变量，之后本地部署直接生效，
不用再登录。

**`Install dependencies` 和 `Build frontend` 都绿，只有 `Deploy worker + assets` 红**
→ 历史上这一步失败过三次（11-18 两次、11-20 一次），根因是 **API Token 失效**，不是代码问题。
现在工作流在部署前加了 `Verify Cloudflare token`，会直接调 `/user/tokens/verify` 和
`/accounts/{id}` 验一遍，报错信息里写清了该怎么办。

如果它报 `CLOUDFLARE_API_TOKEN 无效`：
1. 打开 <https://dash.cloudflare.com/profile/api-tokens>
2. **Create Token** → 选模板 **Edit Cloudflare Workers** → Continue → Create
3. 复制生成的 token（只显示一次）
4. 仓库 **Settings → Secrets and variables → Actions** → 点 `CLOUDFLARE_API_TOKEN` → **Update** → 粘贴新值
5. **Actions** → 选 `Deploy to Cloudflare Workers` → **Re-run all jobs**

如果它报 `CLOUDFLARE_ACCOUNT_ID 不对`，说明 token 有效但读不到那个账号，
把 Secret 里的值换成 Dashboard 右侧栏的 Account ID（32 位十六进制）。

顺带一提：`Check Cloudflare secrets` 只检查「有没有值」，不检查「值能不能用」，
所以 Secret 存在但过期时那一步仍然是绿的 —— 真正拦住它的是 `Verify Cloudflare token`。

**CI 红了会不会影响线上**
→ 不会。线上是上一次成功部署的版本，照常访问。CI 只是「以后每次 push 自动上线」这条通道，
修好 token 之前，本地 `npx wrangler deploy` 依然可以正常发布。

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
