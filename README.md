# YouTube 自动推流管理系统

一个基于 Next.js 的 YouTube 视频自动推流管理系统，支持视频队列管理、RTMP 推流等功能。

## 功能特点

- 🎬 **视频队列管理** - 支持拖拽排序、批量添加
- 📺 **多平台支持** - YouTube、Vimeo、Bilibili、直接视频URL
- 🔄 **自动推流** - 使用 FFmpeg 进行 RTMP 推流
- 🍪 **Cookies 支持** - 支持 YouTube cookies 认证
- 📊 **实时监控** - 进程状态、推流日志实时显示
- 🎨 **现代UI** - 基于 shadcn/ui 的现代化界面

## 技术栈

- **前端**: Next.js 16, React, TypeScript, Tailwind CSS
- **UI组件**: shadcn/ui, Lucide Icons
- **数据库**: Prisma ORM + SQLite
- **视频处理**: yt-dlp, FFmpeg

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 初始化数据库

```bash
bun run db:push
```

### 3. 配置环境变量

创建 `.env` 文件：

```env
DATABASE_URL="file:./db/custom.db"
```

### 4. 启动开发服务器

```bash
bun run dev
```

## YouTube Cookies 配置

YouTube 视频需要 cookies 才能解析：

1. 在 Chrome/Firefox 浏览器登录 YouTube 账号
2. 安装 cookies 导出扩展：
   - Chrome: [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   - Firefox: [cookies.txt](https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/)
3. 访问 YouTube 视频页面
4. 点击扩展图标，导出 cookies.txt
5. 在系统中上传 cookies.txt 文件

## 推流配置

1. 配置 RTMP 服务器地址和推流密钥
2. 添加视频到队列
3. 点击播放按钮开始推流

### FFmpeg 推流命令

```bash
ffmpeg -re -i "视频URL" -c:v copy -c:a copy -f flv "rtmp://服务器地址/密钥"
```

## 目录结构

```
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── api/          # API 路由
│   │   └── page.tsx      # 主页面
│   ├── components/       # React 组件
│   └── lib/              # 工具函数
├── prisma/               # 数据库 Schema
├── public/               # 静态资源
└── cookies/              # YouTube Cookies 存储
```

## API 接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/videos` | GET/POST/PUT/DELETE | 视频管理 |
| `/api/videos/youtube` | GET/POST/PUT/DELETE | YouTube 解析 & Cookies 管理 |
| `/api/stream/force-switch` | POST | 强制切换视频 |
| `/api/stream/stop` | POST | 停止推流 |
| `/api/stream/processes` | GET | 获取进程状态 |
| `/api/stream-configs` | GET/POST | 推流配置管理 |

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
