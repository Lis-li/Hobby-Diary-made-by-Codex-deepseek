# 爱好日记（Hobby Diary）

一个零依赖、可离线使用的本地 Web 应用，用来记录每天的爱好。

## 功能

- 今日打卡：点一下爱好卡片即可打卡，支持补充时长、心情和备注
- 日历视图：按月查看记录，点选任意日期查看或补记
- 统计视图：本月打卡天数、连续打卡、最近 14 天趋势、爱好排行
- 爱好管理：自定义名称、Emoji 图标与颜色
- 数据备份：一键导出 / 导入 JSON，换设备不丢数据
- 深色 / 浅色主题
- 离线可用，可「安装」到浏览器作为应用

## 运行方式

方式一（推荐）：

```bash
node serve.js
```

然后浏览器打开 http://localhost:8080

方式二：直接双击 `index.html`（本地存储与安装功能受限）。

方式三：`python -m http.server 8080`（需已安装 Python）。

## 安装为应用（PWA）

通过 localhost 或 HTTPS 打开后，在 Chrome / Edge 地址栏点击「安装」图标，即可像普通应用一样使用。

## 数据说明

- 数据保存在浏览器本地存储（localStorage）中
- 请定期在「数据」页导出 JSON 备份
- 换浏览器或设备时导入备份即可恢复

## 目录结构

```text
index.html            主页面
styles.css            样式
app.js                应用逻辑
sw.js                 离线缓存（Service Worker）
serve.js              本地服务器
manifest.webmanifest  PWA 配置
icons/                应用图标
```
