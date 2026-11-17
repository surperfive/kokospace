# KokoSpace 自托管镜像：Node 内跑 Express + ws，前端 dist 由同一个进程托管
#
# 构建： docker build -f deploy/Dockerfile -t kokospace .
# 运行： docker run -d --name kokospace -p 3000:3000 --restart unless-stopped kokospace
#
# 说明：
# - 保留 devDependencies，因为生产用 `npx tsx` 直接跑 TypeScript 版 server.ts（最省事，不用编译）。
# - 只想跑 WS、前端放 EdgeOne Pages 的话，同样用这个镜像，前端构建时把 VITE_WS_URL 指过来即可。

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json .npmrc ./
# .npmrc 里已设 legacy-peer-deps=true，避免 vite8/esbuild peer 冲突
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
