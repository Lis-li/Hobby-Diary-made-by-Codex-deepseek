# AGENTS.md —— 爱好日记（Hobby Diary）项目说明

## 项目简介

爱好日记是一个零依赖、可离线使用的本地 Web 应用（PWA），用于记录每日爱好。每条记录可填写心情、备注并上传多张照片；部署在 GitHub Pages，手机和电脑均可访问。

## 技术栈

- 原生 HTML / CSS / JavaScript，无框架、无构建步骤、无第三方依赖
- 数据存储：浏览器 localStorage（JSON）；照片以压缩后的 data URL 存入记录
- PWA：Service Worker（sw.js）+ manifest.webmanifest，支持离线与安装
- 本地服务器：Node.js 标准库（serve.js），支持手机通过局域网访问

## 目录结构

```text
index.html            主页面（含弹窗、照片查看器结构）
styles.css            样式
app.js                核心逻辑（数据管理、视图渲染、交互）
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
- 部署：提交并推送到 main 分支，GitHub Pages 自动重新部署

## 数据模型

- hobbies：`{ id, name, emoji, color, createdAt }`，其中 emoji 可以是 Emoji 字符，也可以是上传图片压缩后的 data URL
- records：`{ id, date(YYYY-MM-DD), hobbyId, mood(1-5), note, photos(data URL 数组，最多 9 张), createdAt }`
- localStorage 键：`hobby-diary:v1`（数据）、`hobby-diary:theme`（主题）、`hobby-diary:app-icon`（自定义应用图标）

## 代码规范

- 新建或修改代码文件时，在文件开头用中文注释说明主要功能或创建目的
- 界面文案、图形标题、注释使用中文；变量名、函数名、配置键使用英文
- 所有静态资源使用相对路径（GitHub Pages 部署在子路径下也能正常工作）
- 用户输入插入 HTML 前必须经过 `escapeHtml` 转义；图片只接受 `data:image` 前缀的字符串
- 界面文案统一使用“记录”，不使用已废弃的“打卡”等概念

## 注意事项

- 照片先压缩（最长边 1280px、JPEG 0.75）再存储，避免撑爆 localStorage（约 5MB）
- 换浏览器或清缓存前，提醒用户先在「数据」页导出 JSON 备份
- 修改代码后先运行 `node --check app.js`，再运行 `node test-check.mjs` 验证再交付
- 修改应用图标后，需重新生成 icons/icon-192.png 与 icon-512.png（源文件为 icons/app-icon.svg）
- 发布新版本时，同步更新以下版本标记（必须一致）：app.js 与 sw.js 中的 `APP_VERSION`、根目录 `version.json`、index.html 与 sw.js ASSETS 中的资源版本参数（如 `?v=1.7`）
- 版本检查机制：主线程直接读取 `version.json`（带时间戳参数绕过缓存）与本地 `APP_VERSION` 对比，不一致即提示更新；点击横幅后发送 `SKIP_WAITING` 让新 Service Worker 接管并自动刷新，若检测不到等待中的 SW 则直接刷新兜底
