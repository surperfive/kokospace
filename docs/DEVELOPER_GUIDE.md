# KokoSpace 社区二次开发与插件扩展指南

KokoSpace 是一个支持桌面端与移动端无缝联机的 2D 扁平矢量元宇宙共看影院平台。本文档面向希望进行二次开发、自定义地图、扩展 Q 版虚拟化身部件或接入第三方微件的社区开发者。

---

## 1. 技术栈与核心模块

- **前端视图层**：React 19 + TypeScript + Tailwind CSS v4 + HTML5 Canvas 2D 世界引擎
- **实时同步与信令**：Node.js + Express + `ws` WebSocket 权威房间服务端（统一运行在 3000 端口）
- **实时空间语音**：WebRTC 点对点音频流 + Web Audio API `GainNode` 空间距离衰减与舞台广播
- **云端跨平台持久化**：Firebase Authentication（Google OAuth）+ Cloud Firestore（零信任安全规则）

---

## 2. WebSocket 房间同步协议

客户端连接 `ws(s)://<host>/ws` 后通过 JSON 消息通信：

| 事件名 | 方向 | 说明 |
| --- | --- | --- |
| `room:join` | Client → Server | 加入指定 `roomId` 并携带玩家昵称与 Q 版形象配置 |
| `room:init` | Server → Client | 下发完整房间状态（在线玩家、家具布局、权威视频进度、服务器时间） |
| `player:move` / `player:moved` | 双向广播 | 同步玩家坐标 `(x, y)`、朝向 `dir`、移动态与落座状态 |
| `video:control` / `video:synced` | 双向广播 | 同步中央巨幕播放、暂停、进度条拖拽及点播队列变更 |
| `player:reaction` | 双向广播 | 触发人物头顶浮动表情包或近距离互动动作 |
| `player:chat` | 双向广播 | 发送空间头顶聊天气泡与聊天面板消息 |
| `scene:update` / `scene:updated` | 双向广播 | 切换地图主题或实时增删改地图家具 |
| `webrtc:signal` | 点对点路由 | 转发 WebRTC `sdp` 与 `candidate` 完成音频建连 |

---

## 3. 编写与注册社区插件 (`KokoPlugin`)

社区插件无需修改核心渲染代码，只需通过 `src/lib/pluginRegistry.ts` 暴露的 `pluginRegistry.register()` 注册即可热加载：

```ts
import { pluginRegistry } from './src/lib/pluginRegistry';

pluginRegistry.register({
  id: 'my-custom-pack',
  name: '社区主题拓展包',
  version: '1.0.0',
  author: 'YourName',
  description: '新增地图主题、表情包与舞台微件',
  maps: [
    {
      id: 'custom-cinema-01',
      name: '极简北欧放映室',
      subtitle: '社区投稿地图',
      coverImage: '/src/assets/images/map_gallery_theater_1794673853411.jpg',
      worldWidth: 1600,
      worldHeight: 1050,
      palette: {
        ground: '#F8FAFC',
        groundAccent: '#E2E8F0',
        gridLine: 'rgba(15, 23, 42, 0.08)',
        wall: '#1E293B',
        wallTrim: '#94A3B8',
        stageFloor: '#FFFFFF',
        stageBorder: '#FF5A36',
        seatingZone: 'rgba(255, 90, 54, 0.06)',
        loungeZone: 'rgba(16, 185, 129, 0.06)',
        screenFrame: '#0F172A',
        accent: '#FF5A36',
      },
      screenRect: { x: 460, y: 120, width: 680, height: 340 },
      spawnPoint: { x: 800, y: 800 },
      zones: [
        { id: 'stage', label: '舞台广播区', type: 'stage', x: 520, y: 470, width: 560, height: 74 },
      ],
      defaultFurniture: [],
      obstacles: [{ x: 460, y: 120, width: 680, height: 340 }],
    },
  ],
  emojiPacks: [{ emoji: '🍿', label: '加爆米花' }],
  widgets: [
    {
      id: 'custom-widget',
      title: '映后讨论',
      renderBadgeText: () => 'Q&A 环节已开启',
    },
  ],
});
```

---

## 4. 扩展示例：新增 Q 版服装或头饰

在 `src/lib/avatarRenderer.ts` 的 `drawChibiAvatar` 中遵循以下坐标原点约定：
- `(0, 0)` 为人物身体中心（脚底阴影位于 `y = 15`）
- 头部绘制区域位于 `x: [-16, 16], y: [-36, -9]`
- 配饰扩展建议放置在 `y < -36`（帽子/发箍）或 `[-19, 19]` 两侧（耳机），并在 `AvatarEditorModal.tsx` 中读取 `pluginRegistry.getActiveAvatarParts()` 即可自动呈现。

---

## 5. 本地开发与生产构建

```bash
# 安装依赖
npm install

# 启动开发环境（Express + Vite + WebSocket，监听 3000 端口）
npm run dev

# 类型检查与生产构建
npm run lint
npm run build
npm run start
```
