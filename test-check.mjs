// test-check.mjs —— 爱好日记冒烟测试：用无头 Chrome + CDP 检查各页面关键元素渲染与脚本错误。
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
// 默认测本地服务器；部署验证时可设置环境变量 BASE_URL 指向线上站点
const BASE = (process.env.BASE_URL || 'http://localhost:8080/index.html') + '?demo=1&tab=';

const userDir = mkdtempSync(join(tmpdir(), 'hobby-cdp-'));
const proc = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--disable-software-rasterizer',
  '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`, 'about:blank'
], { stdio: 'ignore' });

const wait = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  let target = null;
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE + 'today')}`, { method: 'PUT' });
      if (r.ok) { target = await r.json(); break; }
    } catch (e) { /* 开发服务器尚未就绪 */ }
    await wait(200);
  }
  if (!target || !target.webSocketDebuggerUrl) throw new Error('无法创建 Chrome 标签页');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(d.exception ? d.exception.description : d.text);
    }
  };
  const send = (method, params = {}) => new Promise(res => {
    const mid = ++msgId;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');

  const checks = {
    today: `(()=>{const v=document.querySelector('#view-today');return {active:document.querySelector('.view.active')&&document.querySelector('.view.active').id, cards:v.querySelectorAll('.hobby-card').length, rows:v.querySelectorAll('.record-row').length};})()`,
    calendar: `(()=>{const v=document.querySelector('#view-calendar');return {cells:v.querySelectorAll('.cal-cell:not(.empty)').length, detail:!!v.querySelector('.cal-detail'), dots:v.querySelectorAll('.cal-dots i').length};})()`,
    stats: `(()=>{const v=document.querySelector('#view-stats');return {cards:v.querySelectorAll('.stat-card').length, bars:v.querySelectorAll('.bar-col').length, ranks:v.querySelectorAll('.rank-row').length};})()`,
    hobbies: `(()=>{const v=document.querySelector('#view-hobbies');return {items:v.querySelectorAll('.hobby-item').length};})()`,
    data: `(()=>{const v=document.querySelector('#view-data');return {cards:v.querySelectorAll('.setting-card').length};})()`
  };

  const results = {};
  for (const [tab, expr] of Object.entries(checks)) {
    await send('Page.navigate', { url: BASE + tab });
    await wait(1200);
    const loc = await send('Runtime.evaluate', { expression: 'location.href + " || " + document.title', returnByValue: true });
    console.log('[' + tab + '] 当前页面：' + JSON.stringify(loc.result.result.value));
    const out = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (out.result && out.result.result) results[tab] = out.result.result.value;
    else console.log('原始响应[' + tab + ']：' + JSON.stringify(out));
  }

  console.log(JSON.stringify(results, null, 2));
  console.log('JS 错误：' + (errors.length ? '\n' + errors.join('\n') : '无'));

  /* ===== 交互测试（在「今日」页） ===== */
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value;
  await send('Page.navigate', { url: BASE + 'today' });
  await wait(1000);
  const before = await ev(`document.querySelectorAll('#view-today .record-row').length`);
  await ev(`document.querySelector('#view-today .hobby-card[data-action="toggle-hobby"]:not(.active)').click()`);
  await wait(300);
  const after = await ev(`document.querySelectorAll('#view-today .record-row').length`);
  const modalOpened = await ev(`(()=>{const b=document.querySelector('#view-today .rec-actions [data-action="edit-record"]'); if(!b) return false; b.click(); return !document.querySelector('#modal-backdrop').classList.contains('hidden') && !!document.querySelector('#record-form');})()`);
  const submitted = await ev(`(()=>{const f=document.querySelector('#record-form'); f.querySelector('[name="minutes"]').value='75'; f.requestSubmit(); return true;})()`);
  await wait(400);
  const minutesShown = await ev(`(()=>{const m=document.querySelector('#view-today .rec-min'); return m ? m.textContent.trim() : null;})()`);
  const toastText = await ev(`document.querySelector('#toast').textContent`);
  await ev(`document.querySelector('[data-action="toggle-theme"]').click()`);
  const theme = await ev(`document.documentElement.dataset.theme`);
  console.log('交互结果：', JSON.stringify({ before, after, modalOpened, submitted, minutesShown, toastText, theme }, null, 2));

  ws.close();
  proc.kill();
}

main().catch(e => {
  console.error('测试失败：', e.message);
  proc.kill();
  process.exit(1);
});
