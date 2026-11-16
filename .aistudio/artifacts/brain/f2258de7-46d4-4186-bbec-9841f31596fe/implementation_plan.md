# KokoSpace — 2D 扁平矢量元宇宙多人共看影院平台

本计划旨在打造一款手机与电脑通用的 2D 轻量化元宇宙共看空间。平台以现代极简几何 Q 版扁平矢量插画为视觉基调，将 Gather.town 式的自由漫游社交与中央巨幕多人点播影院融为一体，并原生支持空间距离实时语音、表情包互动、跨平台云端配置同步及面向社区的插件扩展机制。

---

## User Review & Critical Decisions

> [!IMPORTANT]
> 以下核心设计决策已在需求访谈阶段确认，后续开发将严格围绕这些确认项展开：

- **Confirmed Decision 1（视觉美术风格）**：采用**扁平矢量插画风（现代极简几何 Q 版）**，人物造型圆润亲切，地图场景以明快清晰的几何色块、柔和阴影与建筑平面插画呈现，兼顾桌面高分屏与移动端可读性。
- **Confirmed Decision 2（中央巨幕点播源）**：中央巨型屏幕同时支持**内置精选片单、MP4/WebM 直链点播，以及 Bilibili / YouTube 外链解析与同步嵌入**，所有房间成员共享统一播放进度与队列。
- **Confirmed Decision 3（跨平台云端同步策略）**：采用 **Google 账号登录 + 游客模式体验**。游客可零门槛直接进入空间体验全部互动；登录 Google 账号后，自定义 Q 版虚拟化身与个人场景布置将实时保存至云端，支持跨设备无缝漫游同步。
- **Confirmed Decision 4（实时语音聊天模式）**：采用**空间距离衰减语音（Proximity Audio）+ 舞台全员广播切换**。靠近其他玩家即可自然听见彼此声音，站在中央舞台或开启广播权限时可向全房间成员喊话。
- **Open Choice（基础设施配置确认）**：执行阶段将先向您弹出 **Firebase 配置授权界面** 以启用 Google 登录与 Firestore 云端存储，并在同一服务端口（3000）上集成 Express + WebSocket 信令与房间状态服务器。

---

## 1. Overview & Core Concept

- **What It Does**：
  用户进入应用后，可先捏出专属的扁平几何 Q 版虚拟形象并选择心仪主题地图（或通过房间链接加入好友空间）。进入 2D 世界后，屏幕正中央矗立着一块大型交互式点播巨幕，周围环绕着沙发观影区、舞台讲台、茶歇闲聊角等场景元素。玩家可在电脑上用键盘/鼠标、在手机上用虚拟摇杆/点触移动自由走动、落座互动、发送头顶表情包与弹幕、进行基于距离的空间语音聊天，并随时在公共点播队列中添加或控制中央屏幕视频。
- **Target Audience / Persona**：
  - **异地好友 / 情侣 / 线上观影社团**：希望边看视频边吐槽、发表情包、像坐在同一间客厅一样实时交流。
  - **小型远程团队 / 社区分享会**：主讲人站在舞台区开启全员广播演示视频或分享会，听众在下方沙发区就座并小声互动。
  - **二次开发开发者与创作者**：希望基于开源友好的插件钩子扩展新地图主题、定制 Q 版装扮部件或接入第三方互动微件。
- **Key Value**：
  打破传统直播间“孤立列表 + 延迟弹幕”的扁平体验，用 2D 空间距离感重新赋予线上共看“在场感”与“社交温度”，同时保持 Web 端即开即用与移动端单手友好的轻量体验。

---

## 2. User Experience & Visual Design

### Key User Flows

1. **零状态入口与形象工坊（Entry & Avatar Studio）**：
   - 首次进入展示简洁明快的分屏引导面板：左侧实时预览 Q 版人物动态待机动画，右侧选择「游客快速进入」或「Google 登录同步我的形象与场景」。
   - 用户可自由调节发型、发色、肤色、几何五官表情、服饰配色、头饰配件与个性昵称，实时生成并缓存化身数据。
2. **多地图大厅与场景选择（Multi-Map & Scene Customization）**：
   - 提供三套风格迥异的内置矢量地图供随时切换或创建房间：
     - **「日落天台影院」**：暖灰石板地面、盆栽绿植、阶梯懒人沙发与中央露天巨幕。
     - **「极简美术馆放映厅」**：浅米色建筑网格、几何雕塑、环形长凳与沉浸式中央银幕。
     - **「林间木屋剧场」**：鼠尾草绿草坪、原木露台、野餐垫观影区与篝火闲聊角。
   - 房主/用户可进入「场景编辑模式」，拖拽摆放或切换场景预设家具（沙发、盆栽、灯柱、地毯），并同步保存场景配置。
3. **2D 空间漫游与多端操作（Cross-Platform Spatial Navigation）**：
   - **桌面端**：`WASD` / 方向键平滑移动，支持画布内点击自动寻路移动；`Shift` 加速，靠近沙发或互动点按 `E` 或点击悬浮提示即可落座/触发互动。
   - **移动端（375px–430px 触控优先）**：左下角提供高响应虚拟摇杆（或点击地图直接走动），底部符合人体工学拇指热区（Bottom Thumb Zone）集中放置麦克风、广播开关、表情盘、点播单与更多菜单，保证每颗按钮点击热区 $\ge 44 \times 44\text{px}$ 且底部/顶部悬浮控件总高度占屏比控制在 15% 以内。
4. **中央巨幕点播与影院交互（Central Cinema & Sync）**：
   - 地图正中央为高分辨率矢量边框巨型显示屏，直接内嵌视频播放画布。当玩家靠近屏幕观影区时画面自动聚焦增强，或一键点击「全屏沉浸观影 / 画中画缩小」，在看清视频的同时保留空间内漂浮的表情雨与语音。
   - 点击「点播列表」抽屉可选择内置高清示范片单、输入任意 MP4/WebM 直链，或粘贴 YouTube / Bilibili 链接自动解析为嵌入式同步播放器；所有播放、暂停、切集与时间轴跳转由服务端统一校时同步。
5. **空间语音、表情雨与近距离互动（Voice & Social Reactions）**：
   - 玩家人物脚下带有柔和的「声场感知圈」。当两位玩家距离拉近，系统自动建立 WebRTC 音频连接并根据欧氏距离平滑调节音量；开启「舞台广播」时，声音无视距离覆盖全房间。
   - 一键触发表情包面板，Q 版人物头顶立即弹出弹性动画气泡（如欢呼、比心、爆米花、大笑、鼓掌），同时支持发送快捷气泡文字及「挥手 / 击掌」双人近距离动作互动。
6. **社区开发文档与插件中心（Developer Docs & Plugin Hub）**：
   - 顶部导航可直接打开结构化的「开发者文档与插件扩展指南」，包含架构图、状态协议、自定义地图 JSON 规范、Q 版装扮 SVG 扩展接口、实时加载/测试自定义插件的沙箱面板（如现场注入一个社区时钟/弹幕小组件或自定义表情包）。

### Visual Identity & Theme

- **Aesthetic Direction**：现代极简几何 Q 版插画风（受 Gather.town 空间布局与 Monument Valley / Duolingo 矢量质感启发）。线条利落、造型圆润、光影克制，摒弃凌乱杂色与过度霓虹。
- **Color Palette & Mood（60-30-10 配色纪律）**：
  - **60% 主导画布底色**：温和中性建筑浅灰白 `--bg-canvas`（`#F4F5F7`）与地图内低饱和地面色块（暖石 `#EAECEF`、鼠尾草绿 `#DCE8DF`），保障长达数小时观影的视觉舒适度。
  - **30% 结构容器与地图建筑**：纯白浮层卡片 `--surface`（`#FFFFFF`）、柔和阴影与 1px 极细描边（`#E2E8F0`），中央巨幕区域采用深炭黑影院框体（`#18181B`）形成视觉聚焦中心。
  - **10% 高意图主交互色**：活力珊瑚橙 `--primary`（`#FF5A36`）用于主按钮、当前发言波纹与舞台广播高亮；辅助状态采用森林绿 `#10B981`（语音开启）与琥珀黄 `#F59E0B`（房主/同步提示），所有状态均配文字与图标双重指示，不单独依赖颜色。
- **Typography & Hierarchy**：
  - 遵循 2+1 字体规范：展示标题使用 `Outfit` / `Plus Jakarta Sans` 搭配中文无衬线黑体（`PingFang SC`, `Noto Sans SC`），正文使用 `Plus Jakarta Sans`，时间轴码率与开发文档代码块使用 `JetBrains Mono`（开启 `tabular-nums` 等宽数字）。
  - 标题启用 `text-wrap: balance` 避免孤立尾字，卡片信息采用「·」分隔的纯文本排版，杜绝满屏胶囊标签。
- **Interactive Feedback & Motion**：
  - 所有 UI 状态切换（弹窗、抽屉、按钮反馈）严格控制在 150–200ms 内的仅限 `transform` / `opacity` 合成层动画；2D 画布通过 `requestAnimationFrame` 实现 60fps 人物平滑插值移动、走路上下 Q 弹节奏、头顶表情弹跳与语音声波环扩散。

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1：2D 地图与 Q 版角色渲染引擎选型**
  - *Chosen Approach*：采用原生 HTML5 `<canvas>` 2D 高清渲染管线（配合 `devicePixelRatio` 适配与矢量路径/程序化 SVG 部件绘制）驱动地图网格、建筑障碍物、Q 版人物骨骼动效与声场光环，而将中央巨型视频屏幕作为空间世界坐标对齐的 DOM 复合层精确嵌入地图中心。
  - *Why*：在 Canvas 内直接绘制高分辨率动态视频（尤其是 YouTube / Bilibili 的 iframe 播放器）会受跨域限制无法提取像素，采用「Canvas 底层世界 + 世界坐标同步变换的 DOM 巨幕层」既能让人物在 60fps 下丝滑穿梭、遮挡排序（Y-Sorting），又能原生无损播放 MP4 与第三方视频外链。
  - *Alternatives Considered*：纯 DOM 节点渲染所有玩家（百人场景卡顿且寻路插值复杂）或全 Canvas 绘制（无法嵌入 B 站 / YouTube 播放器）。

- **Decision 2：多人实时同步与语音传输架构**
  - *Chosen Approach*：后端采用 Express + `ws` WebSocket 服务端作为房间状态与视频进度的唯一权威源（Server-Authoritative），并兼作 WebRTC 点对点音频信令服务器；客户端本地基于 `Web Audio API` GainNode 根据人物空间距离实时计算立体声衰减。
  - *Why*：相比强依赖第三方付费语音 SDK，原生 WebRTC P2P Mesh 结合 WebSocket 信令在中小规模共看房间（2–20 人）下具备零额外第三方密钥门槛、超低端到端延迟以及精细的本地空间衰减控制能力，且当浏览器未授权麦克风时可优雅降级为纯文字/表情互动。
  - *Alternatives Considered*：纯中心化 SFU 媒体服务器（运维复杂度过高）或无服务端状态的纯本地模拟（无法实现真正跨设备联机）。

- **Decision 3：跨平台云端同步存储方案**
  - *Chosen Approach*：集成 Firebase Authentication（Google 登录）与 Cloud Firestore 持久化存储用户的 `avatarConfig`（自定义虚拟化身）、`scenePresets`（各房间/地图的家具与背景配置）以及 `recentPlaylists`（常用片单）；未登录游客使用本地临时状态并与服务端当前房间同步。
  - *Why*：完美匹配“支持游客零门槛体验 + Google 登录后跨手机/电脑自动同步个性化形象与场景配置”的诉求，且无需自建复杂账号与密码找回系统。
  - *Alternatives Considered*：仅使用浏览器 `localStorage`（换设备即丢失配置，无法跨平台同步）。

- **Decision 4：插件扩展架构（Community Plugin SDK）**
  - *Chosen Approach*：设计声明式与钩子驱动的 `KokoPlugin` 注册表接口，暴露 `registerMapTheme`、`registerAvatarPart`、`registerEmojiPack` 与 `registerStageWidget` 四类标准扩展点，并在 UI 中内建可交互的「插件管理与开发者文档中心」，配套详尽的中英文双语开发文档。
  - *Why*：社区开发者无需修改核心引擎源码，仅按接口编写轻量插件配置或模块即可快速新增地图主题、表情包与舞台微件，同时文档内提供实时验证示例。

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                         跨端客户端 (Desktop & Mobile Web)                  │
│                                                                           │
│  ┌──────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐  │
│  │   入口与形象工坊层    │  │  2D 元宇宙空间视口   │  │ 交互控制与扩展层 │  │
│  │  • Google 登录 / 游客 │  │  • Canvas 矢量渲染   │  │ • 移动摇杆 / 键鼠 │  │
│  │  • Q版装扮自定义器    │  │  • Y-Sort 人物图层   │  │ • 点播队列抽屉    │  │
│  │  • 多地图切换大厅     │  │  • 空间坐标巨幕层    │  │ • 表情雨与弹幕    │  │
│  └──────────┬───────────┘  └──────────┬──────────┘  │ • 场景家具编辑器  │  │
│             │                         │             │ • 插件与开发文档  │  │
│             ▼                         ▼             └────────┬─────────┘  │
│  ┌───────────────────────────────────────────────────────────┴─────────┐  │
│  │           前端核心引擎 (State, Spatial Audio & Plugin Hub)           │  │
│  │  • WebSocket 客户端同步器 (重连恢复 + 乐观预测移动)                 │  │
│  │  • WebRTC + Web Audio API (距离衰减计算 + 舞台全员广播混音)          │  │
│  │  • PluginRegistry (地图 / 装扮 / 表情 / 舞台微件运行时扩展中心)      │  │
│  └──────────────────┬─────────────────────────────┬────────────────────┘  │
└─────────────────────┼─────────────────────────────┼───────────────────────┘
                      │ HTTPS / Firebase SDK        │ WSS (Port 3000)
                      ▼                             ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│   Firebase 云端同步基础设施      │   │  Node.js + Express + WS 权威服务端   │
│  • Google OAuth 身份认证        │   │  • 房间生命周期与成员在线表          │
│  • Firestore:                   │   │  • 权威视频状态 (URL/时间戳/播放态)  │
│    - /users/{uid} (基础资料)     │   │  • 场景家具布局实时广播              │
│    - /profiles/{uid} (Q版配置)   │   │  • 位置/朝向/表情/动作高频转发       │
│    - /scenes/{sceneId} (场景配置)│   │  • WebRTC Offer/Answer/ICE 信令路由  │
└─────────────────────────────────┘   └─────────────────────────────────────┘
```

### Data Model & State

1. **云端持久化实体（Firestore）**：
   - **UserProfile（用户虚拟化身与偏好）**：`uid`、`displayName`、`avatar`（发型、发色、肤色、眼型、服饰、配饰、主题色）、`preferredMapId`、`updatedAt`。
   - **SceneConfiguration（用户自定义场景配置）**：`sceneId`、`ownerUid`、`mapId`、`roomName`、`furnitureItems`（限长数组，含家具类型、网格坐标、旋转角度）、`defaultVideoUrl`、`updatedAt`。
   - **Security Invariant**：所有用户私人化身与场景修改严格校验 `request.auth.uid == ownerUid` 且经过类型与长度边界校验；公开共享房间场景支持授权读取与房主独占写入。
2. **实时房间权威状态（WebSocket Server Memory）**：
   - **RoomState**：`roomId`、`mapId`、`hostId`、`players`（Map：`id`, `name`, `avatar`, `x`, `y`, `direction`, `isSitting`, `seatId`, `isBroadcasting`, `isMicOn`, `lastActive`）、`videoState`（`sourceType`: `'builtin' | 'mp4' | 'youtube' | 'bilibili'`、`url`、`title`、`isPlaying`、`currentTime`、`updatedAtServerMs`、`queue`）、`furniture`（动态可编辑场景物件列表）。
3. **社区插件模型（Plugin Registry）**：
   - **KokoPlugin**：`id`、`name`、`version`、`author`、可选贡献点 `maps[]`、`avatarParts[]`、`emojiPacks[]`、`widgets[]`，支持动态注册、卸载与热切换预览。

### Interactive Component & State Mapping

- **登录与形象编辑器**：修改任意装扮字段 → 本地实时更新 Q 版 SVG/Canvas 预览 → 若已登录 Google，自动防抖写入 Firestore 并向当前房间广播 `player:update_avatar` 事件。
- **地图切换与场景编辑**：房主切换地图或拖拽家具 → 触发 `room:update_scene` → 服务端校验碰撞与坐标边界后广播全员重绘地图；已登录用户可一键「保存到我的云端场景」跨设备复用。
- **中央巨幕多源点播与校时**：
  - 内置片单 / MP4 直链：通过原生 `<video>` 渲染，接收服务端 `video:sync` 事件后比对误差（若本地时间偏差 $> 0.8\text{s}$ 则自动平滑校准 `currentTime`）。
  - YouTube / Bilibili 外链：解析 `BV号` / `videoId` 生成纯净嵌入播放器，并同步标题、选集切换与房主共享播放控制提示条。
- **空间语音与舞台广播**：
  - 开启麦克风 → 获取音频流并与房间内其他在线用户建立 WebRTC PeerConnection。
  - 每帧移动更新各玩家间距 $d$：若对方开启 `isBroadcasting`，音量增益设为 `1.0`；否则在听觉半径 $R_{\max}$ 内按反平方曲线平滑衰减至 `0.0`，同时在人物脚下渲染声波强度环。
- **开发文档与插件中心**：
  - 点击顶部「开发文档」打开分栏式交互文档面板（系统架构、WebSocket 协议手册、地图 Tile 规范、插件 API 参考与内置「一键启用示例社区插件」实时演示按钮）。

### Key Sequences

1. **新玩家加入与进度对齐**：
   `Client 连接 WS → 发送 room:join (roomId, playerProfile) → Server 下发完整 room:init (玩家列表 + 当前地图家具 + 视频当前基准时间与服务器时间戳) → Client 补偿网络延迟推算当前视频秒数并立即定位播放`
2. **跨平台场景云端加载**：
   `Google 登录成功 → 读取 Firestore 用户 avatar 与默认 sceneConfig → 若为房主进入房间，自动将云端自定义场景布局应用到当前房间并同步给其他访客`
3. **移动端与桌面端自适应输入**：
   `触屏设备自动激活左下角摇杆与底部单手 HUD；点击画布空地计算网格路径自动走过去；桌面键盘输入即刻接管并隐藏虚拟摇杆，确保视觉零干扰`
