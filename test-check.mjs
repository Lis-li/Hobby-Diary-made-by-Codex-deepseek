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
  const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  await send('Page.navigate', { url: BASE + 'today' });
  await wait(1000);
  const before = await ev(`document.querySelectorAll('#view-today .record-row').length`);
  await ev(`document.querySelector('#view-today .hobby-card[data-action="open-record"]:not(.active)').click()`);
  await wait(400);
  const cardModalOpened = await ev(`!!document.querySelector('#record-form') && document.querySelector('#record-form [name="hobbyId"]').value.length > 0`);
  await ev(`(()=>{const f=document.querySelector('#record-form'); f.querySelector('[name="note"]').value='测试备注'; f.requestSubmit(); return true;})()`);
  await wait(400);
  const after = await ev(`document.querySelectorAll('#view-today .record-row').length`);
  const toastAfterAdd = await ev(`document.querySelector('#toast').textContent`);
  const noteAdded = await ev(`[...document.querySelectorAll('#view-today .rec-note')].some(n=>n.textContent.includes('测试备注'))`);

  /* 照片上传测试：添加记录 → 注入图片 → 移除 → 再添加 → 保存 */
  await ev(`document.querySelector('#view-today .bottom-actions [data-action="add-record"]').click()`);
  await wait(400);
  const injectInto = sel => `(()=>{const dt=new DataTransfer(); const bin=atob('${TINY_PNG}'); const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0)); dt.items.add(new File([bytes],'p.png',{type:'image/png'})); const inp=document.querySelector('${sel}'); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`;
  await ev(injectInto('#photo-input'));
  await wait(1500);
  const photoGridCount = await ev(`document.querySelectorAll('#photo-grid .photo-item').length`);
  await ev(`document.querySelector('#photo-grid .photo-remove').click()`);
  await wait(200);
  const photoGridAfterRemove = await ev(`document.querySelectorAll('#photo-grid .photo-item').length`);
  await ev(injectInto('#photo-input'));
  await wait(1500);
  const photoGridAfterReadd = await ev(`document.querySelectorAll('#photo-grid .photo-item').length`);
  await ev(`(()=>{const f=document.querySelector('#record-form'); f.querySelector('[name="note"]').value='带照片的记录'; f.requestSubmit(); return true;})()`);
  await wait(500);
  const photoCount = await ev(`document.querySelectorAll('#view-today .rec-photo').length`);
  const lightboxOpened = await ev(`(()=>{document.querySelector('#view-today .rec-photo').click(); return !document.querySelector('#lightbox').classList.contains('hidden') && document.querySelector('#lightbox-img').src.startsWith('data:image');})()`);
  await ev(`document.querySelector('[data-action="close-lightbox"]').click()`);
  const lightboxClosed = await ev(`document.querySelector('#lightbox').classList.contains('hidden')`);

  /* 编辑已有记录测试 */
  const modalOpened = await ev(`(()=>{const b=document.querySelector('#view-today .rec-actions [data-action="edit-record"]'); if(!b) return false; b.click(); return !document.querySelector('#modal-backdrop').classList.contains('hidden') && !!document.querySelector('#record-form');})()`);
  const submitted = await ev(`(()=>{const f=document.querySelector('#record-form'); f.querySelector('[name="note"]').value='更新后的备注'; f.requestSubmit(); return true;})()`);
  await wait(400);
  const noteEdited = await ev(`[...document.querySelectorAll('#view-today .rec-note')].some(n=>n.textContent.includes('更新后的备注'))`);
  const toastAfterEdit = await ev(`document.querySelector('#toast').textContent`);
  await ev(`document.querySelector('[data-action="toggle-theme"]').click()`);
  const theme = await ev(`document.documentElement.dataset.theme`);

  /* 爱好图标测试：Emoji 选择 + 上传图片作图标 */
  await send('Page.navigate', { url: BASE + 'hobbies' });
  await wait(800);
  const hobbyCountBefore = await ev(`document.querySelectorAll('.hobby-item').length`);
  await ev(`document.querySelector('[data-action="add-hobby"]').click()`);
  await wait(400);
  const emojiPicked = await ev(`(()=>{const b=document.querySelector('.emoji-opt:not(.on)'); if(!b) return false; b.click(); return true;})()`);
  await ev(injectInto('#hobby-icon-input'));
  await wait(1500);
  const iconPreviewImg = await ev(`!!document.querySelector('#hobby-icon-preview img')`);
  await ev(`(()=>{const f=document.querySelector('#hobby-form'); f.querySelector('[name="name"]').value='摄影'; f.requestSubmit(); return true;})()`);
  await wait(400);
  const hobbyCountAfter = await ev(`document.querySelectorAll('.hobby-item').length`);
  const hobbyImgIcon = await ev(`!!document.querySelector('.hobby-item .hobby-emoji.img')`);

  /* 应用图标测试：上传 + 恢复默认 */
  await send('Page.navigate', { url: BASE + 'data' });
  await wait(800);
  await ev(injectInto('#app-icon-input'));
  await wait(1500);
  const logoCustom = await ev(`!!document.querySelector('#brand-logo img')`);
  const appIconPreview = await ev(`!!document.querySelector('#app-icon-preview img')`);
  await ev(`document.querySelector('[data-action="reset-app-icon"]').click()`);
  await wait(200);
  const logoDefault = await ev(`document.querySelector('#brand-logo').textContent.trim() === '🌸'`);

  console.log('交互结果：', JSON.stringify({ before, cardModalOpened, after, toastAfterAdd, noteAdded, photoGridCount, photoGridAfterRemove, photoGridAfterReadd, photoCount, lightboxOpened, lightboxClosed, modalOpened, submitted, noteEdited, toastAfterEdit, theme, hobbyCountBefore, emojiPicked, iconPreviewImg, hobbyCountAfter, hobbyImgIcon, logoCustom, appIconPreview, logoDefault }, null, 2));

  ws.close();
  proc.kill();
}

main().catch(e => {
  console.error('测试失败：', e.message);
  proc.kill();
  process.exit(1);
});
