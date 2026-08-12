// serve.js —— 爱好日记本地使用服务器：零依赖静态文件服务器，执行 node serve.js 即可运行。
// 支持手机访问：手机与电脑连接同一 Wi-Fi 后，用手机浏览器打开启动时打印的“手机访问”地址。
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(filePath, (err, st) => {
    if (!err && st.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (err2, data) => {
      if (err2) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 Not Found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  const lanIps = Object.entries(os.networkInterfaces()).flatMap(([name, addrs]) =>
    (addrs || []).filter(i => i.family === 'IPv4' && !i.internal).map(i => ({ name, ip: i.address }))
  );
  console.log(`爱好日记已启动：http://localhost:${PORT}`);
  for (const { name, ip } of lanIps) {
    console.log(`手机访问（${name}）：http://${ip}:${PORT}`);
  }
  console.log('按 Ctrl+C 停止服务');
});
