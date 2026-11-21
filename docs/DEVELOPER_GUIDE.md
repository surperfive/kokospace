# KokoSpace 社区二次开发与插件扩展指南

KokoSpace 是一个支持桌面端与移动端无缝联机的 2D 扁平矢量元宇宙共看影院平台。本文档面向希望进行二次开发、自定义地图、扩展 Q 版虚拟化身部件或接入第三方微件的社区开发者。

---

## 1. 技术栈与核心模块

- **前端视图层**：React 19 + TypeScript + Tailwind CSS v4 + HTML5 Canvas 2D 世界引擎
- **实时同步与信令**：Node.js + Express + `ws` WebSocket 权威房间服务端（统一运行在 3000 端口）
- **实时空间语音**：WebRTC 点对点音频流 + Web Audio API `GainNode` 空间距离衰减与舞台广播
- **本地持久化**：localStorage（形象、本机场景方案、个人点播记录），无账号体系、不联网

---

## 2. WebSocket 房间同步协议

客户端连接 `ws(s)://<host>/ws` 后通过 JSON 消息通信：

| 事件名 | 方向 | 说明 |
| --- | --- | --- |
| `room:join` | Client → Server | 加入指定 `roomId` 并携带玩家昵称与 Q 版形象配置 |
| `room:init` | Server → Client | 下发完整房间状态（在线玩家、家具布局、权威视频进度、服务器时间） |
| `player:move` / `player:moved` | 双向广播 | 同步玩家坐标 `(x, y)`、朝向 `dir`、移动态与落座状态 |
| `video:control` / `video:synced` | 双向广播 | 同步中央巨幕播放、暂停、进度条拖拽及点播队列变更 |
| `video:control action:'next'` | Client → Server | 跳过当前影片：**谁都能发，不需要投票**（`expectedItemId` 对不上会被丢弃，防多端连跳两部） |
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

---

## 6. 像素画板与开源引用

房间里的挂画来自内置画板 `src/components/PixelArtStudio.tsx`：铅笔 / 橡皮 / 油漆桶 / 吸管、
16·24·32 三档网格、对称绘制、撤销重做，导出 32×32 PNG dataURL。

挂画的数据形态：`FurnitureItem { type: 'art_frame', art: <PNG dataURL>, label: '像素画' }`，
跟着 `scene:update` 一起广播（一张画约 300~800 字节，塞进 furniture 完全不占带宽），
`MetaverseCanvas` 里按 URL 缓存成 `<img>` 再最近邻放大到 64×64 画到世界画布上。

### 参考的开源项目

| 项目 | 许可 | 用到了什么 |
| --- | --- | --- |
| [Piskel](https://github.com/piskelapp/piskel) (13k★) | Apache-2.0 | 交互骨架：铅笔/橡皮/油漆桶/取色、网格、**左右对称绘制**、撤销栈 |
| [dotting](https://github.com/hunkim98/dotting) | MIT | 参考了 React 侧的画布受控封装与 pointer 事件坐标换算写法 |
| [pixel-art-react](https://github.com/jvalen/pixel-art-react) (6k★) | MIT | 参考了导出 PNG 的缩放策略（`image-rendering: pixelated` + 最近邻） |
| [Sweetie 16](https://lospec.com/palette-list/sweetie-16) | CC0 | 默认调色板（GrafxKid） |
| PICO-8 | 调色板公开 | 备选调色板 |

**没有直接把这些库作为依赖引入**：Piskel / pixel-art-react 是整站应用（无法当组件嵌入），
dotting 会带进自己的画布样式与交互，改造成本高于按同样的骨架重写一版。上表只是设计来源，代码是独立实现。
另有一个 `pixel-dust` 也看过，但仓库**没有 LICENSE 文件**（GitHub 识别不到许可），不能引用，已排除。

