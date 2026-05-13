# 素材管理库 (Asset Management Library)

一个功能完善的推广素材管理系统，支持按「项目 → 渠道」两级分类管理各类设计素材、视频和文档。适用于推广团队、设计工作室等需要集中管理多媒体素材的场景。

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| **框架** | Next.js 16 (App Router) | React 19 + TypeScript，Standalone 输出模式 |
| **运行时** | Bun | 高性能 JavaScript 运行时，替代 Node.js |
| **UI 框架** | Tailwind CSS 4 + shadcn/ui (New York 风格) | 深色主题，CSS 变量驱动的设计系统 |
| **动画** | Framer Motion 12 | 流畅的过渡动画和微交互 |
| **状态管理** | Zustand 5 | 轻量级全局状态，无 boilerplate |
| **数据库** | SQLite + Prisma ORM 6 | 零配置本地数据库，类型安全的查询构建器 |
| **图片处理** | Sharp | 自动提取图片尺寸 + 生成 300px 缩略图 |
| **文件打包** | Archiver | 批量 ZIP 下载（流式响应，支持 200 文件） |
| **图标** | Lucide React | 矢量图标库 |

## 功能特性

### 核心功能

- **拖拽上传** — 支持批量上传，自动生成缩略图和提取图片尺寸
- **两级分类** — 项目 (Project) → 渠道 (Channel) 树形组织结构
- **列表 / 网格视图** — 两种视图模式自由切换
- **全文搜索** — 按文件名实时搜索
- **多维排序** — 按名称、大小、日期、类型排序
- **类型过滤** — 全部 / 图片 / 视频 / 文档 快速筛选
- **悬停预览** — 鼠标悬停即时预览图片，无需点击
- **全屏预览** — 支持缩放、拖拽、键盘左右导航
- **批量操作** — 多选后批量删除、移动到项目/渠道、批量 ZIP 下载
- **右键菜单** — 完整的上下文菜单操作
- **重命名** — 支持单个素材重命名
- **存储统计** — 实时展示各类型素材的存储占用

### 项目 & 渠道管理

- 创建 / 重命名 / 删除项目
- 在项目下创建 / 重命名 / 删除渠道
- 左侧可折叠树形侧边栏，折叠状态持久化到 localStorage
- 上传时自动关联当前选中的项目和渠道
- 项目/渠道删除时自动解除素材关联（不删除素材文件）

### 支持的文件格式

| 类型 | 格式 |
|------|------|
| 图片 | JPG, JPEG, PNG, GIF, SVG, WebP, BMP, TIFF, TIF |
| 视频 | MP4, MOV, AVI |
| 文档 | PSD, AI, EPS, PDF |

## 系统架构

```
┌─────────────────────────────────────────────┐
│                   Frontend                   │
│  Next.js 16 App Router (Client Component)   │
│  ┌───────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Zustand   │ │ Framer   │ │ shadcn/ui  │ │
│  │ Store     │ │ Motion   │ │ Components │ │
│  └───────────┘ └──────────┘ └────────────┘ │
├─────────────────────────────────────────────┤
│                 API Layer                    │
│  Next.js Route Handlers (REST API)          │
│  ┌─────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ /assets │ │/projects │ │  /channels  │ │
│  │  CRUD   │ │  CRUD    │ │    CRUD     │ │
│  └────┬────┘ └──────────┘ └─────────────┘ │
├──────────┼──────────────────────────────────┤
│          │       Data Layer                 │
│  ┌───────▼───────┐  ┌────────────────────┐ │
│  │  Prisma ORM   │  │  Local Filesystem  │ │
│  │  (SQLite)     │  │  upload/assets/    │ │
│  │               │  │  upload/thumbnails/│ │
│  └───────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 数据库模型

```
Project (项目)
├── id: UUID (PK)
├── name: String
├── description: String?
├── createdAt / updatedAt
├── channels[] → Channel (一对多，级联删除)
└── assets[] → Asset (一对多，置空删除)

Channel (渠道)
├── id: UUID (PK)
├── name: String
├── projectId: UUID (FK → Project)
├── createdAt / updatedAt
└── assets[] → Asset (一对多，置空删除)

Asset (素材)
├── id: CUID (PK)
├── fileName: String (UUID 命名，磁盘文件名)
├── originalName: String (用户原始文件名)
├── fileSize: Int (字节)
├── mimeType: String
├── width / height: Int? (图片尺寸)
├── filePath: String (API 访问路径)
├── projectId: UUID? (FK → Project)
├── channelId: UUID? (FK → Channel)
└── createdAt / updatedAt
```

## API 接口

### 素材管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/assets` | 素材列表（支持 search、sortBy、sortOrder、typeFilter、projectId、channelId 查询参数） |
| `POST` | `/api/assets/upload` | 上传文件（multipart/form-data: files, projectId, channelId） |
| `GET` | `/api/assets/[id]` | 获取单个素材详情 |
| `PUT` | `/api/assets/[id]` | 重命名或移动素材 |
| `DELETE` | `/api/assets/[id]` | 删除单个素材（文件 + 缩略图 + 数据库记录） |
| `DELETE` | `/api/assets` | 批量删除（body: `{ ids: string[] }`） |
| `PUT` | `/api/assets/batch-move` | 批量移动到项目/渠道 |
| `POST` | `/api/assets/batch-download` | 批量 ZIP 下载（最多 200 个文件，流式响应） |

### 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/projects` | 项目列表（含素材计数） |
| `POST` | `/api/projects` | 创建项目 |
| `PUT` | `/api/projects/[id]` | 重命名项目 |
| `DELETE` | `/api/projects/[id]` | 删除项目（解除素材关联） |

### 渠道管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/channels` | 渠道列表（支持 ?projectId= 筛选） |
| `POST` | `/api/channels` | 创建渠道（需指定 projectId） |
| `GET` | `/api/channels/[id]` | 获取渠道详情（含素材计数） |
| `PUT` | `/api/channels/[id]` | 重命名渠道 |
| `DELETE` | `/api/channels/[id]` | 删除渠道（解除素材关联） |

### 文件服务

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/upload/assets/[filename]` | 访问原始文件（支持 ?download=1 触发下载） |
| `GET` | `/api/upload/thumbnails/[filename]` | 访问缩略图 |

## 项目结构

```
src/
├── app/
│   ├── layout.tsx              # 根布局（深色主题）
│   ├── page.tsx                # 主 SPA 页面（全功能单文件组件）
│   └── api/
│       ├── route.ts            # 健康检查
│       ├── assets/             # 素材 CRUD + 上传 + 批量操作
│       ├── projects/           # 项目 CRUD
│       ├── channels/           # 渠道 CRUD
│       └── upload/             # 文件服务路由
├── components/ui/              # 47 个 shadcn/ui 基础组件
├── hooks/                      # 自定义 Hooks（移动端检测、Toast）
├── lib/
│   ├── config.ts               # 统一路径配置（环境变量驱动）
│   ├── db.ts                   # Prisma 客户端单例
│   ├── file-utils.ts           # 类型定义 + 文件工具函数
│   └── utils.ts                # cn() 样式合并工具
└── store/
    └── asset-store.ts          # Zustand 全局状态
```

## 快速开始

### 环境要求

- Bun >= 1.0
- SQLite（Bun 自带）

### 安装 & 运行

```bash
# 克隆项目
git clone <repository-url>
cd asset-management

# 安装依赖
bun install

# 初始化数据库
bun run db:push

# 开发模式
bun run dev

# 生产构建
bun run build
bun run start
```

### 环境变量

创建 `.env` 文件：

```env
DATABASE_URL=file:./db/custom.db
```

## 部署说明

本项目采用 **SQLite + 本地文件存储** 架构，所有路径通过环境变量 `DATA_DIR` 驱动，可一键部署到支持持久化磁盘的平台。

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | SQLite 数据库文件路径 | `file:./db/custom.db` |
| `DATA_DIR` | 素材文件存储根目录 | `./data` |

### 方式一：Render.com 部署（推荐）

Render 的 Persistent Disk 适合 SQLite + 本地文件存储。注意：持久盘需要付费实例；免费实例可以测试页面，但数据库和上传文件不适合长期保存。

**步骤：**

1. Fork 本仓库到你的 GitHub
2. 登录 [Render Dashboard](https://dashboard.render.com)
3. 点击 **New** → **Blueprint** → 连接你的 GitHub 仓库
4. Render 会自动识别 `render.yaml` 配置并创建服务
5. 部署完成后即可访问

`render.yaml` 已预配置好：
- Docker 构建
- 自动创建 1GB Persistent Disk 挂载到 `/app/data`
- 环境变量 `DATA_DIR=/app/data`
- 健康检查路径 `/api`

**手动创建方式：**

1. Render Dashboard → **New** → **Web Service** → 连接 GitHub 仓库
2. 配置如下：
   - **Runtime**: Docker
   - **Plan**: 支持 Persistent Disk 的付费实例
   - **Environment**:
     - `NODE_ENV` = `production`
     - `DATA_DIR` = `/app/data`
     - `DATABASE_URL` = `file:/app/data/custom.db`
3. 在 **Disks** 中添加：
   - Name: `asset-data`
   - Mount Path: `/app/data`
   - Size: `1 GB`
4. 点击 **Create Web Service**

### 方式二：Docker 部署

```bash
# 构建镜像
docker build -t asset-management .

# 运行（挂载数据卷）
docker run -d \
  -p 3000:3000 \
  -v ./data:/app/data \
  -e DATA_DIR=/app/data \
  -e DATABASE_URL=file:/app/data/custom.db \
  asset-management
```

### 方式三：本地开发

```bash
# 安装依赖
bun install

# 初始化数据库
bun run db:push

# 开发模式
bun run dev
```

### 不支持 Vercel

> Vercel 为 Serverless 架构，不支持持久化文件系统和原生 SQLite，无法直接部署本项目。如需部署 Vercel，需将数据库换成云 PostgreSQL、文件存储换成 S3/R2，改动量较大。推荐使用 Render.com。

## UI 设计

- **主题**：深色模式（#1E1E1E 主背景，#2D2D2D 卡片背景）
- **设计系统**：shadcn/ui New York 风格，CSS 变量驱动的语义化配色
- **交互**：Framer Motion 过渡动画，流畅的展开/收起、悬停反馈
- **响应式**：支持桌面端使用，侧边栏可折叠
- **键盘快捷键**：全屏预览中支持左右方向键导航、Esc 关闭

## License

Private
