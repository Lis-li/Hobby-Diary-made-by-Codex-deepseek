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
  const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
  const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  await send('Page.navigate', { url: BASE + 'today' });
  await wait(1000);
  const before = await ev(`document.querySelectorAll('#view-today .record-row').length`);
  const chipIcon = await ev(`document.querySelector('.date-chip-ico').textContent`);
  const dateText = await ev(`document.querySelector('.date-text').textContent`);
  const catSwitchCount = await ev(`document.querySelectorAll('#view-today .cat-btn').length`);
  const statsChipCount = await ev(`document.querySelectorAll('[data-action="stats-category"]').length`);
  const projectTabLabel = await ev(`document.querySelector('[data-tab="hobbies"] span:last-child').textContent`);
  const healthSeededCount = await ev(`state.hobbies.filter(h => (h.category || 'hobby') === 'health').length`);
  const healthSeededNames = await ev(`state.hobbies.filter(h => (h.category || 'hobby') === 'health').map(h => h.name).join(',')`);
  await ev(`document.querySelector('[data-action="set-today-category"][data-category="work"]').click()`);
  await wait(300);
  const workCatEmpty = await ev(`document.querySelectorAll('#view-today .hobby-card').length === 0`);
  await ev(`document.querySelector('[data-action="set-today-category"][data-category="health"]').click()`);
  await wait(300);
  const focusHiddenInHealth = await ev(`!document.querySelector('#view-today .focus-card')`);
  await ev(`document.querySelector('[data-action="set-today-category"][data-category="hobby"]').click()`);
  await wait(300);
  const musicBtnInit = await ev(`document.querySelector('#music-toggle').textContent`);
  await ev(`document.querySelector('[data-action="toggle-music"]').click()`);
  await wait(200);
  const musicBtnMuted = await ev(`document.querySelector('#music-toggle').textContent`);
  await ev(`document.querySelector('[data-action="toggle-music"]').click()`);
  await wait(200);
  const musicBtnOn = await ev(`document.querySelector('#music-toggle').textContent`);
  const focusCardExists = await ev(`!!document.querySelector('.focus-card')`);
  const focusAfterNav = await ev(`document.querySelector('#view-today .date-nav').compareDocumentPosition(document.querySelector('#view-today .focus-card')) & Node.DOCUMENT_POSITION_FOLLOWING`);
  const focusCardCollapsedInit = await ev(`!document.querySelector('.focus-card').classList.contains('open')`);
  const dateAnchorFix = await ev(`(()=>{const old=addDays(todayStr(),-1); currentDate=old; selectedCalendarDate=old; lastToday=old; refreshTodayAnchors(); return currentDate===todayStr() && selectedCalendarDate===todayStr();})()`);
  await ev(`document.querySelector('[data-action="toggle-focus-card"]').click()`);
  await wait(200);
  const focusCardOpened = await ev(`document.querySelector('.focus-card').classList.contains('open')`);
  await ev(`document.querySelector('[data-action="focus-start"]').click()`);
  await wait(2500);
  const focusTimerRunning = await ev(`!!document.querySelector('#focus-timer')`);
  const focusTimeText = await ev(`document.querySelector('#focus-timer').textContent`);
  await ev(`document.querySelector('[data-action="focus-pause"]').click()`);
  await wait(200);
  const focusPaused = await ev(`document.querySelector('[data-action="focus-pause"]').textContent === '继续'`);
  await ev(`document.querySelector('[data-action="focus-pause"]').click()`);
  await wait(200);
  await ev(`document.querySelector('[data-action="focus-stop"]').click()`);
  await wait(300);
  const focusSaveModal = await ev(`!document.querySelector('#modal-backdrop').classList.contains('hidden') && !!document.querySelector('[data-action="focus-confirm-save"]')`);
  const focusSaveText = await ev(`document.querySelector('.focus-save-text').textContent.trim()`);
  await ev(`document.querySelector('[data-action="focus-confirm-save"]').click()`);
  await wait(400);
  const focusMinShown = await ev(`(()=>{const m=document.querySelector('#view-today .rec-min'); return m ? m.textContent.trim() : null;})()`);
  const focusTodayText = await ev(`document.querySelector('.focus-today').textContent.trim()`);
  await ev(`document.querySelector('#view-today .hobby-card[data-action="open-record"]:not(.active)').click()`);
  await wait(400);
  const cardModalOpened = await ev(`!!document.querySelector('#record-form') && document.querySelector('#record-form [name="hobbyId"]').value.length > 0`);
  await ev(`(()=>{const f=document.querySelector('#record-form'); f.querySelector('[name="note"]').value='测试备注'; f.requestSubmit(); return true;})()`);
  await wait(400);
  const after = await ev(`document.querySelectorAll('#view-today .record-row').length`);
  const toastAfterAdd = await ev(`document.querySelector('#toast').textContent`);
  const noteAdded = await ev(`[...document.querySelectorAll('#view-today .rec-note')].some(n=>n.textContent.includes('测试备注'))`);
  const moodSummary = await ev(`document.querySelector('#view-today .day-summary .sum-item:nth-child(2)').textContent.trim()`);

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
  await ev(`document.querySelector('#view-today .rec-photo').click()`);
  await wait(500);
  const lightboxOpened = await ev(`!document.querySelector('#lightbox').classList.contains('hidden') && document.querySelector('#lightbox-img').src.length > 0`);
  await ev(`document.querySelector('[data-action="close-lightbox"]').click()`);
  const lightboxClosed = await ev(`document.querySelector('#lightbox').classList.contains('hidden')`);
  await ev(`location.reload()`);
  await wait(2500);
  const photoAfterReload = await ev(`document.querySelectorAll('#view-today .rec-photo').length`);
  const photoSrcAfterReload = await ev(`(()=>{const img=document.querySelector('#view-today .rec-photo'); return img ? img.src.length > 0 : false;})()`);
  await ev(`document.querySelector('[data-action="switch-tab"][data-tab="calendar"]').click()`);
  await wait(600);
  await ev(`document.querySelector('#view-calendar .cal-cell.today').click()`);
  await wait(1200);
  const calPhotoCount = await ev(`document.querySelectorAll('#view-calendar .rec-photo').length`);
  const calPhotoSrc = await ev(`(()=>{const img=document.querySelector('#view-calendar .rec-photo'); return img ? img.src.length > 0 : false;})()`);
  await ev(`document.querySelector('[data-action="switch-tab"][data-tab="today"]').click()`);
  await wait(400);

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
  const projectGroupCount = await ev(`document.querySelectorAll('.project-group').length`);
  const perGroupAddCount = await ev(`document.querySelectorAll('.project-add').length`);
  await ev(`document.querySelector('[data-action="add-hobby"]').click()`);
  await wait(400);
  const emojiCount = await ev(`document.querySelectorAll('.emoji-opt').length`);
  const emojiPicked = await ev(`(()=>{const b=document.querySelector('.emoji-opt:not(.on)'); if(!b) return false; b.click(); return true;})()`);
  await ev(injectInto('#hobby-icon-input'));
  await wait(1500);
  const iconPreviewImg = await ev(`!!document.querySelector('#hobby-icon-preview img')`);
  await ev(`(()=>{const f=document.querySelector('#hobby-form'); f.querySelector('[name="name"]').value='摄影'; f.requestSubmit(); return true;})()`);
  await wait(400);
  const hobbyCountAfter = await ev(`document.querySelectorAll('.hobby-item').length`);
  const hobbyImgIcon = await ev(`!!document.querySelector('.hobby-item .hobby-emoji.img')`);

  /* 第二阶段：工作/健康分类记录 */
  await ev(`document.querySelector('[data-action="add-hobby"]').click()`);
  await wait(300);
  await ev(`document.querySelector('[data-action="pick-project-category"][data-category="work"]').click()`);
  const workEmojiCount = await ev(`document.querySelectorAll('#hobby-emoji-grid .emoji-opt').length`);
  const workEmojiHasBriefcase = await ev(`document.querySelector('#hobby-emoji-grid').textContent.includes('💼')`);
  await ev(`(()=>{const f=document.querySelector('#hobby-form'); f.querySelector('[name="name"]').value='工作项目A'; f.requestSubmit(); return true;})()`);
  await wait(400);
  await ev(`document.querySelector('[data-action="add-hobby"]').click()`);
  await wait(300);
  await ev(`document.querySelector('[data-action="pick-project-category"][data-category="health"]').click()`);
  const healthEmojiCount = await ev(`document.querySelectorAll('#hobby-emoji-grid .emoji-opt').length`);
  await ev(`(()=>{const f=document.querySelector('#hobby-form'); f.querySelector('[name="name"]').value='健康项目A'; f.requestSubmit(); return true;})()`);
  await wait(400);
  await ev(`document.querySelector('[data-action="switch-tab"][data-tab="today"]').click()`);
  await wait(400);
  await ev(`document.querySelector('[data-action="set-today-category"][data-category="work"]').click()`);
  await wait(300);
  await ev(`document.querySelector('#view-today .hobby-card[data-action="open-record"]').click()`);
  await wait(400);
  const optgroupCount = await ev(`document.querySelectorAll('#record-form optgroup').length`);
  const workOptionCount = await ev(`document.querySelectorAll('#record-form option').length`);
  const workStatusBtns = await ev(`document.querySelectorAll('.status-btn[data-action="pick-work-status"]').length`);
  await ev(`document.querySelector('[data-action="pick-work-status"][data-status="done"]').click()`);
  await ev(`(()=>{const f=document.querySelector('#record-form'); f.querySelector('[name="note"]').value='完成了一个任务'; f.requestSubmit(); return true;})()`);
  await wait(400);
  const workStatusShown = await ev(`document.querySelector('#view-today .record-row').textContent.includes('完成')`);
  await ev(`document.querySelector('[data-action="set-today-category"][data-category="health"]').click()`);
  await wait(300);
  await ev(`document.querySelector('#view-today .hobby-card[data-action="open-record"]').click()`);
  await wait(400);
  const healthPeriodInputs = await ev(`document.querySelectorAll('#record-form .period-picker input').length`);
  const healthValueInput = await ev(`!!document.querySelector('#health-p1')`);
  await ev(`(()=>{const f=document.querySelector('#record-form'); document.querySelector('#health-p1').value='65'; f.requestSubmit(); return true;})()`);
  await wait(400);
  const healthValueShown = await ev(`document.querySelector('#view-today .record-row').textContent.includes('体重')`);
  await ev(`document.querySelector('[data-action="switch-tab"][data-tab="stats"]').click()`);
  await wait(400);
  await ev(`document.querySelector('[data-action="stats-category"][data-category="health"]').click()`);
  await wait(400);
  const healthChartArea = await ev(`!!document.querySelector('.health-chart, .empty-card.small')`);
  const healthStatCards = await ev(`document.querySelectorAll('#view-stats .stat-card').length`);

  /* 设置页测试：折叠面板 + 存储空间条 */
  await send('Page.navigate', { url: BASE + 'data' });
  await wait(800);
  const panelCollapsedInit = await ev(`document.querySelectorAll('.setting-card.collapsible:not(.open)').length`);
  await ev(`document.querySelector('[data-action="toggle-panel"][data-panel="storage"]').click()`);
  await ev(`document.querySelector('[data-action="toggle-panel"][data-panel="changelog"]').click()`);
  await wait(200);
  const panelOpenCount = await ev(`document.querySelectorAll('.setting-card.collapsible.open').length`);
  await wait(600);
  const storageBarShown = await ev(`!!document.querySelector('#storage-bar-fill')`);
  const storageText = await ev(`document.querySelector('#storage-text').textContent`);
  const settingsTabLabel = await ev(`document.querySelector('[data-tab="data"] span:last-child').textContent`);
  await ev(`document.querySelector('[data-action="toggle-panel"][data-panel="music"]').click()`);
  await wait(200);
  const musicStyleCount = await ev(`document.querySelectorAll('[data-action="music-style"]').length`);
  await ev(`document.querySelector('[data-action="music-style"][data-style="bright"]').click()`);
  await wait(300);
  const musicStyleSaved = await ev(`localStorage.getItem('hobby-diary:music-style')`);

  /* 更新横幅测试 */
  const bannerHiddenInit = await ev(`document.querySelector('#update-banner').classList.contains('hidden')`);
  const bannerAction = await ev(`document.querySelector('#update-banner').getAttribute('data-action')`);
  await ev(`showUpdateBanner()`);
  const bannerShown = await ev(`!document.querySelector('#update-banner').classList.contains('hidden')`);
  await ev(`document.querySelector('[data-action="dismiss-update"]').click()`);
  const bannerDismissed = await ev(`document.querySelector('#update-banner').classList.contains('hidden')`);
  await ev(`document.querySelector('[data-action="open-changelog"]').click()`);
  await wait(300);
  const changelogItems = await ev(`document.querySelectorAll('#modal-body .cl-item').length`);
  const changelogFirst = await ev(`document.querySelector('#modal-body .cl-item .cl-v').textContent`);
  await ev(`document.querySelector('[data-action="close-modal"]').click()`);
  const versionText = await ev(`document.querySelector('#view-data .about').textContent`);
  const remoteVersion = await ev(`fetch('version.json?t=' + Date.now()).then(r=>r.json()).then(d=>d.version)`);
  const versionTag = await ev(`document.querySelector('#version-tag').textContent`);

  /* 应用锁测试 */
  await ev(`document.querySelector('[data-action="toggle-panel"][data-panel="lock"]').click()`);
  await wait(200);
  await ev(`(()=>{document.querySelector('#lock-new').value='1234'; document.querySelector('#lock-confirm').value='1234'; document.querySelector('[data-action="lock-save"]').click(); return true;})()`);
  await wait(500);
  await ev(`sessionStorage.removeItem('hobby-diary:unlocked'); location.reload()`);
  await wait(2200);
  const lockScreenShown = await ev(`!document.querySelector('#lock-screen').classList.contains('hidden')`);
  await ev(`(()=>{document.querySelector('#lock-input').value='1234'; document.querySelector('[data-action="lock-unlock"]').click(); return true;})()`);
  await wait(600);
  const lockScreenGone = await ev(`document.querySelector('#lock-screen').classList.contains('hidden')`);

  console.log('交互结果：', JSON.stringify({ before, chipIcon, dateText, catSwitchCount, statsChipCount, projectTabLabel, healthSeededCount, healthSeededNames, workCatEmpty, focusHiddenInHealth, musicBtnInit, musicBtnMuted, musicBtnOn, focusCardExists, focusAfterNav, focusCardCollapsedInit, dateAnchorFix, focusCardOpened, focusTimerRunning, focusTimeText, focusPaused, focusSaveModal, focusSaveText, focusMinShown, focusTodayText, cardModalOpened, after, toastAfterAdd, noteAdded, moodSummary, photoGridCount, photoGridAfterRemove, photoGridAfterReadd, photoCount, lightboxOpened, lightboxClosed, photoAfterReload, photoSrcAfterReload, calPhotoCount, calPhotoSrc, modalOpened, submitted, noteEdited, toastAfterEdit, theme, hobbyCountBefore, projectGroupCount, perGroupAddCount, emojiCount, emojiPicked, iconPreviewImg, hobbyCountAfter, hobbyImgIcon, workEmojiCount, workEmojiHasBriefcase, healthEmojiCount, optgroupCount, workOptionCount, workStatusBtns, workStatusShown, healthPeriodInputs, healthValueInput, healthValueShown, healthChartArea, healthStatCards, settingsTabLabel, storageBarShown, storageText, musicStyleCount, musicStyleSaved, bannerHiddenInit, bannerAction, bannerShown, bannerDismissed, changelogItems, changelogFirst, panelCollapsedInit, panelOpenCount, lockScreenShown, lockScreenGone, versionShows27: versionText.includes('v2.7'), remoteVersion, versionTag }, null, 2));

  ws.close();
  proc.kill();
}

main().catch(e => {
  console.error('测试失败：', e.message);
  proc.kill();
  process.exit(1);
});
