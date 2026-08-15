# AGENTS.md —— 爱好日记（Hobby Diary）项目说明

## 项目简介

爱好日记是一个零依赖、可离线使用的本地 Web 应用（PWA），用于记录每日爱好。每条记录可填写心情、备注并上传多张照片；部署在 GitHub Pages 与 Cloudflare Pages（国内可直连），手机和电脑均可访问。

## 技术栈

- 原生 HTML / CSS / JavaScript，无框架、无构建步骤、无第三方依赖
- 数据存储：浏览器 localStorage（JSON，不含照片）；照片以压缩后的 Blob 存入 IndexedDB（photoStore.js），记录中只存照片 ID
- PWA：Service Worker（sw.js）+ manifest.webmanifest，支持离线与安装
- 本地服务器：Node.js 标准库（serve.js），支持手机通过局域网访问

## 目录结构

```text
index.html            主页面（含弹窗、照片查看器结构）
styles.css            样式
app.js                核心逻辑（数据管理、视图渲染、交互）
audio.js              背景音乐引擎（Web Audio 实时合成，无需音频文件）
photoStore.js         照片存储层（IndexedDB，容量远大于 localStorage）
sw.js                 离线缓存 Service Worker
serve.js              本地服务器（启动时打印手机访问地址）
test-check.mjs        无头 Chrome + CDP 冒烟测试
manifest.webmanifest  PWA 配置
icons/                应用图标（app-icon.svg 为源文件）
AGENTS.md             本说明
```

## 常用命令

- 启动本地服务：`node serve.js`（同一 Wi-Fi 下手机可访问打印的局域网地址）
- 冒烟测试：`node test-check.mjs`（默认测试本地 8080；设置环境变量 `BASE_URL` 可测试线上站点）
- 部署 GitHub Pages：提交并推送到 main 分支，自动重新部署
- 部署 Cloudflare Pages：登录后 `wrangler pages deploy <站点目录> --project-name hobby-diary --branch main`（wrangler 可通过 `npm i -g wrangler@latest` 或 `npx wrangler` 使用）

## 部署说明

- GitHub Pages：https://lis-li.github.io/Hobby-Diary-made-by-Codex-deepseek/ （境外，国内访问可能慢）
- Cloudflare Pages：https://hobby-diary.pages.dev/ （国内一般可直连，作为国内主要入口）
- 两处部署同一套静态文件；数据都存在各设备浏览器本地，不随站点同步，换入口需手动导出/导入备份
- 若在 Cloudflare 控制台把仓库连上 Git 集成，推送到 main 也会自动部署到 Pages（当前为 wrangler 手动上传）

## 数据模型

- hobbies：`{ id, name, emoji, color, createdAt }`，其中 emoji 可以是 Emoji 字符，也可以是上传图片压缩后的 data URL
- records：`{ id, date(YYYY-MM-DD), hobbyId, minutes(可选), mood(1-5), note, photos(照片 ID 数组，最多 9 张，实际二进制存于 IndexedDB), createdAt }`
- localStorage 键：`hobby-diary:v1`（数据）、`hobby-diary:theme`（主题）、`hobby-diary:focus-session`（专注计时会话）、`hobby-diary:lock`（应用锁密码哈希，仅本机保存）

## 代码规范

- 新建或修改代码文件时，在文件开头用中文注释说明主要功能或创建目的
- 界面文案、图形标题、注释使用中文；变量名、函数名、配置键使用英文
- 所有静态资源使用相对路径（GitHub Pages 部署在子路径下也能正常工作）
- 用户输入插入 HTML 前必须经过 `escapeHtml` 转义；图片只接受 `data:image` 前缀的字符串
- 界面文案统一使用“记录”，不使用已废弃的“打卡”等概念

## 注意事项

- 照片先压缩（最长边 1280px、JPEG 0.75）再存入 IndexedDB；记录本身在 localStorage（约 5MB），照片不再占用其空间
- 换浏览器或清缓存前，提醒用户先在「数据」页导出 JSON 备份
- 修改代码后先运行 `node --check app.js`，再运行 `node test-check.mjs` 验证再交付
- 修改应用图标后，需从 `icons/hobby diary.png`（用户提供的最新封面）重新生成 icons/icon-192.png 与 icon-512.png
- 发布新版本时，同步更新以下版本标记（必须一致）：app.js 与 sw.js 中的 `APP_VERSION`、根目录 `version.json`、index.html 与 sw.js ASSETS 中的资源版本参数（如 `?v=1.7`）
- 版本检查机制：主线程直接读取 `version.json`（带时间戳参数绕过缓存）与本地 `APP_VERSION` 对比，不一致即提示更新；点击横幅后发送 `SKIP_WAITING` 让新 Service Worker 接管并自动刷新，若检测不到等待中的 SW 则直接刷新兜底
