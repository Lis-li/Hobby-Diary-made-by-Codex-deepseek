// app.js —— 爱好日记（Hobby Diary）核心逻辑：本地数据管理、五个视图的渲染与交互事件。
'use strict';

/* ============ 常量 ============ */
const STORAGE_KEY = 'hobby-diary:v1';
const THEME_KEY = 'hobby-diary:theme';
const APP_ICON_KEY = 'hobby-diary:app-icon';
const UPDATE_DISMISS_KEY = 'hobby-diary:update-dismissed';
const APP_VERSION = '1.8';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const VIEWS = ['today', 'calendar', 'stats', 'hobbies', 'data'];
const COLOR_PRESETS = ['#FF6B6B', '#F9A825', '#4CAF50', '#26C6DA', '#5C6BC0', '#AB47BC', '#EC407A', '#8D6E63'];
const EMOJI_PRESETS = ['🎨', '📚', '🏃', '🎵', '🎸', '🎹', '🎤', '🎬', '📷', '🎧', '🎮', '🕹', '🧩', '♟️', '⚽', '🏸', '🚴', '🏊', '🧗', '⛺', '🎣', '🌱', '🪴', '🍳', '☕', '✍️', '🖌', '📖', '🧵', '🧶', '🛹', '🧘', '🚶', '🗺', '🔭', '🪁', '🦋', '🌻', '🐱', '🐶', '🏀', '🎾', '🏓', '🎳', '🥊', '⛸', '🎿', '🏂', '🚣', '🏇', '🤸', '🤹', '🪂', '🏋', '🎻', '🎷', '🎺', '🪕', '🥁', '🎼', '🎶', '🎙', '🖼', '🧑‍🎨', '📝', '🖍', '✂️', '📓', '🗞', '💻', '🖥', '🎛', '🛠', '🤖', '📹', '🎞', '🃏', '🎲', '🎯', '🪀', '🧸', '🎪', '🏝', '🏔', '🌋', '🎡', '🎢', '🚁', '🚀', '✈️', '🚂', '🛥', '🏕', '🌌', '🌷', '🍀', '🌵', '🌈', '⭐', '🔥', '🍜', '🍰', '🍪', '🍩', '🥗', '🍣', '🍹', '🦊', '🐼', '🐨', '🦁', '🐰', '🦄', '🐢', '🐬', '🦜'];
const MOODS = [
  { v: 1, emoji: '😫', label: '很差' },
  { v: 2, emoji: '🙁', label: '不佳' },
  { v: 3, emoji: '😐', label: '一般' },
  { v: 4, emoji: '🙂', label: '不错' },
  { v: 5, emoji: '🤩', label: '超棒' }
];
const SAMPLE_HOBBIES = [
  { name: '画画', emoji: '🎨', color: '#5C6BC0' },
  { name: '阅读', emoji: '📚', color: '#4CAF50' },
  { name: '运动', emoji: '🏃', color: '#FF6B6B' }
];

/* ============ 工具函数 ============ */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function pad2(n) { return String(n).padStart(2, '0'); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function todayStr() { return toDateStr(new Date()); }
function addDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); }
function weekLabel(s) { return '周' + WEEKDAYS[parseDate(s).getDay()]; }
function fmtCnDate(s) { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日`; }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function moodInfo(v) { return MOODS.find(m => m.v === v) || null; }
function isImageUrl(s) { return typeof s === 'string' && s.startsWith('data:image'); }
function iconText(h) {
  const v = h && h.emoji;
  return v && !isImageUrl(v) ? v : '🎯';
}
function iconTag(h, cls) {
  const v = h && h.emoji;
  if (!v || !isImageUrl(v)) return `<span class="${cls}">${iconText(h)}</span>`;
  return `<img class="${cls} img" src="${v}" alt="">`;
}

/* ============ 状态与数据层 ============ */
let state = loadState();
let currentDate = todayStr();
let calendarCursor = todayStr().slice(0, 7);
let activeTab = 'today';
let selectedCalendarDate = todayStr();
let modalRecordId = null;
let modalHobbyId = null;
let selectedMood = null;
let selectedColor = COLOR_PRESETS[0];
let selectedIcon = '🎯';
let modalPhotos = [];
let pendingUpdateWorker = null;
let lastRenderedDate = null;

function defaultState() { return { hobbies: [], records: [] }; }
function seedSampleHobbies() {
  return { hobbies: SAMPLE_HOBBIES.map(h => ({ id: uid(), name: h.name, emoji: h.emoji, color: h.color, createdAt: Date.now() })), records: [] };
}
function normalizeHobby(h) {
  return {
    id: String(h.id || uid()),
    name: String(h.name || '未命名').slice(0, 20),
    emoji: isImageUrl(h.emoji) ? String(h.emoji) : String(h.emoji || '🎯').slice(0, 8),
    color: COLOR_PRESETS.includes(h.color) ? h.color : COLOR_PRESETS[0],
    createdAt: h.createdAt || Date.now()
  };
}
function normalizeRecord(r) {
  return {
    id: String(r.id || uid()),
    date: String(r.date || todayStr()),
    hobbyId: String(r.hobbyId || ''),
    mood: r.mood ? Number(r.mood) : null,
    note: String(r.note || '').slice(0, 500),
    photos: Array.isArray(r.photos) ? r.photos.filter(p => typeof p === 'string' && p.startsWith('data:image')).slice(0, 9) : [],
    createdAt: r.createdAt || Date.now()
  };
}
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedSampleHobbies();
    const data = JSON.parse(raw);
    return {
      hobbies: (Array.isArray(data.hobbies) ? data.hobbies : []).map(normalizeHobby),
      records: (Array.isArray(data.records) ? data.records : []).map(normalizeRecord)
    };
  } catch (err) { return seedSampleHobbies(); }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (err) { toast('保存失败：本地存储空间可能已满'); }
}
function hobbyById(id) { return state.hobbies.find(h => h.id === id); }
function recordsOn(date) { return state.records.filter(r => r.date === date); }
function recordFor(date, hobbyId) { return state.records.find(r => r.date === date && r.hobbyId === hobbyId); }
function uniqueDays() { return [...new Set(state.records.map(r => r.date))].sort(); }
function currentStreakFor(days) {
  let c = 0, d = todayStr();
  if (!days.includes(d)) d = addDays(d, -1);
  while (days.includes(d)) { c++; d = addDays(d, -1); }
  return c;
}
function longestStreakFor(days) {
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    run = (prev && addDays(prev, 1) === d) ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}
function monthStats(ym) {
  const days = uniqueDays().filter(d => d.startsWith(ym));
  return { activeDays: days.length, records: state.records.filter(r => r.date.startsWith(ym)).length };
}
function hobbyStats(id) {
  const recs = state.records.filter(r => r.hobbyId === id);
  const days = [...new Set(recs.map(r => r.date))].sort();
  return {
    count: recs.length,
    current: currentStreakFor(days),
    longest: longestStreakFor(days),
    last: days.length ? days[days.length - 1] : null
  };
}

/* ============ 渲染 ============ */
function renderAll() {
  renderHeader();
  renderToday();
  renderCalendar();
  renderStats();
  renderHobbies();
  renderData();
}
function renderHeader() {
  const chip = $('#streak-chip');
  if (chip) chip.textContent = `🔥 连续 ${currentStreakFor(uniqueDays())} 天`;
  const sub = $('#header-sub');
  if (sub) sub.textContent = `${fmtCnDate(todayStr())} ${weekLabel(todayStr())} · 累计 ${state.records.length} 条记录`;
  const tag = $('#version-tag');
  if (tag) tag.textContent = 'v' + APP_VERSION;
}

function hobbyCardHtml(h, date) {
  const rec = recordFor(date, h.id);
  const meta = rec
    ? (rec.mood ? `${moodInfo(rec.mood).emoji} ${moodInfo(rec.mood).label}` : '已记录')
    : '点击记录';
  return `<div class="hobby-card ${rec ? 'active' : ''}" style="--hcolor:${h.color}" data-action="open-record" data-hobby="${h.id}">
    <button class="hc-edit" data-action="edit-record" data-hobby="${h.id}" title="补充心情/照片/备注">✎</button>
    ${iconTag(h, 'hc-emoji')}
    <span class="hc-name">${escapeHtml(h.name)}</span>
    <span class="hc-meta">${meta}</span>
  </div>`;
}
function recordRowHtml(r) {
  const h = hobbyById(r.hobbyId);
  const m = moodInfo(r.mood);
  return `<div class="record-row" style="--hcolor:${h ? h.color : '#bbb'}">
    ${iconTag(h, 'rec-emoji')}
    <div class="rec-main">
      <div class="rec-name">${h ? escapeHtml(h.name) : '未知爱好'}${m ? `<span class="rec-mood">${m.emoji} ${m.label}</span>` : ''}</div>
      ${r.note ? `<div class="rec-note">${escapeHtml(r.note)}</div>` : ''}
      ${(r.photos && r.photos.length) ? `<div class="rec-photos">${r.photos.map((p, i) => `<img class="rec-photo" src="${p}" alt="照片" data-action="view-photo" data-id="${r.id}" data-index="${i}" loading="lazy">`).join('')}</div>` : ''}
    </div>
    <div class="rec-actions">
      <button data-action="edit-record" data-id="${r.id}" title="编辑">✎</button>
      <button data-action="delete-record" data-id="${r.id}" title="删除">🗑</button>
    </div>
  </div>`;
}

function renderToday() {
  const el = $('#view-today');
  if (!el) return;
  const bumpDate = currentDate !== lastRenderedDate;
  lastRenderedDate = currentDate;
  const recs = recordsOn(currentDate);
  const moods = recs.filter(r => r.mood).map(r => r.mood);
  const avg = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length) : null;
  const moodEmoji = avg ? MOODS.reduce((best, m) => Math.abs(m.v - avg) < Math.abs(best.v - avg) ? m : best, MOODS[0]).emoji : null;
  const isToday = currentDate === todayStr();

  const nav = `
    <div class="date-nav">
      <button class="icon-btn" data-action="shift-day" data-offset="-1" title="前一天">‹</button>
      <div class="date-chip${bumpDate ? ' bump' : ''}">
        <span class="date-chip-ico">🗓️</span>
        <input type="date" class="date-input" value="${currentDate}" aria-label="选择日期">
      </div>
      <button class="icon-btn" data-action="shift-day" data-offset="1" title="后一天">›</button>
    </div>
    ${isToday ? '' : '<div class="pill-row"><button class="pill" data-action="go-today">📌 回到今天</button></div>'}
    <div class="day-summary">
      <span class="sum-item">🧩 <b>${recs.length}</b> 项</span>
      <span class="sum-item">${moodEmoji ? `<b>${moodEmoji}</b> 心情` : '心情 --'}</span>
    </div>`;

  const grid = state.hobbies.length
    ? `<div class="hobby-grid">${state.hobbies.map(h => hobbyCardHtml(h, currentDate)).join('')}<button class="hobby-card add-card" data-action="go-hobbies"><span class="add-plus">＋</span><span>添加爱好</span></button></div>`
    : '<div class="empty-card">还没有爱好。<br>点击下方按钮添加你的第一个爱好吧～</div>';

  const list = recs.length
    ? `<div class="section-title">当日记录（${recs.length}）</div><div class="record-list">${recs.map(recordRowHtml).join('')}</div>`
    : `<div class="empty-card">${state.hobbies.length ? '今天还没有记录：点击上方的爱好卡片即可开始记录，或添加一条记录。' : '添加爱好后即可开始记录。'}</div>`;

  el.innerHTML = nav + grid + list +
    `<div class="bottom-actions"><button class="btn-primary" data-action="add-record">＋ 添加记录</button><button class="btn-secondary" data-action="go-hobbies">管理爱好</button></div>`;
}

function renderCalendar() {
  const el = $('#view-calendar');
  if (!el) return;
  const [y, m] = calendarCursor.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const ms = monthStats(calendarCursor);
  const byDate = {};
  for (const r of state.records) { (byDate[r.date] ||= []).push(r); }

  let cells = '';
  for (let i = 0; i < first; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${calendarCursor}-${pad2(d)}`;
    const recs = byDate[ds] || [];
    const cls = ['cal-cell', ds === todayStr() ? 'today' : '', ds === selectedCalendarDate ? 'selected' : ''].filter(Boolean).join(' ');
    cells += `<div class="${cls}" data-action="select-day" data-date="${ds}">
      <span class="cal-num">${d}</span>
      <span class="cal-dots">${recs.slice(0, 3).map(r => { const h = hobbyById(r.hobbyId); return `<i style="background:${h ? h.color : '#bbb'}"></i>`; }).join('')}${recs.length > 3 ? `<em>+${recs.length - 3}</em>` : ''}</span>
    </div>`;
  }

  const selRecs = recordsOn(selectedCalendarDate);
  const sd = parseDate(selectedCalendarDate);
  const detail = `
    <div class="cal-detail">
      <div class="cal-detail-head">
        <div><b>${fmtCnDate(selectedCalendarDate)}</b><span class="week">${weekLabel(selectedCalendarDate)}${selectedCalendarDate === todayStr() ? ' · 今天' : ''}</span></div>
        <button class="link-btn" data-action="go-to-date" data-date="${selectedCalendarDate}">去记录 ›</button>
      </div>
      ${selRecs.length ? `<div class="record-list">${selRecs.map(recordRowHtml).join('')}</div>` : '<div class="empty-card small">这一天还没有记录</div>'}
      <div class="bottom-actions"><button class="btn-primary" data-action="add-record" data-date="${selectedCalendarDate}">＋ 添加记录</button></div>
    </div>`;

  el.innerHTML = `
    <div class="cal-nav">
      <button class="icon-btn" data-action="shift-month" data-offset="-1" title="上个月">‹</button>
      <div class="cal-title">${y}年${m}月 <span class="cal-sub">打卡 ${ms.activeDays} 天</span></div>
      <button class="icon-btn" data-action="shift-month" data-offset="1" title="下个月">›</button>
    </div>
    ${calendarCursor !== todayStr().slice(0, 7) ? '<div class="pill-row"><button class="pill" data-action="go-current-month">📌 回到本月</button></div>' : ''}
    <div class="cal-week">${WEEKDAYS.map(w => `<span>${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    ${detail}`;
}

function renderStats() {
  const el = $('#view-stats');
  if (!el) return;
  const days14 = [];
  for (let i = 13; i >= 0; i--) days14.push(addDays(todayStr(), -i));
  const counts = days14.map(d => recordsOn(d).length);
  const max = Math.max(...counts, 1);
  const ms = monthStats(todayStr().slice(0, 7));
  const total = state.records.length;
  const cur = currentStreakFor(uniqueDays());
  const longest = longestStreakFor(uniqueDays());

  const bars = days14.map((d, i) => {
    const c = counts[i];
    const p = c ? Math.max(14, Math.round(c / max * 100)) : 4;
    const pd = parseDate(d);
    return `<div class="bar-col" title="${pd.getMonth() + 1}月${pd.getDate()}日 · ${c} 项">
      <div class="bar-track"><div class="bar ${c ? 'has' : ''}" style="height:${p}%">${c ? `<span class="bar-val">${c}</span>` : ''}</div></div>
      <span class="bar-label">${i % 2 === 0 ? `${pd.getMonth() + 1}/${pd.getDate()}` : ''}</span>
    </div>`;
  }).join('');

  const ranked = state.hobbies.map(h => ({ h, s: hobbyStats(h.id) }))
    .sort((a, b) => b.s.count - a.s.count);
  const rows = ranked.length
    ? ranked.map(({ h, s }, i) => `<div class="rank-row">
        <span class="rank-no">${i + 1}</span>
        ${iconTag(h, 'rank-emoji')}
        <div class="rank-main">
          <div class="rank-name">${escapeHtml(h.name)}</div>
          <div class="rank-sub">当前连续 ${s.current} 天 · 最长连续 ${s.longest} 天</div>
        </div>
        <div class="rank-nums"><b>${s.count}</b> 次</div>
      </div>`).join('')
    : '<div class="empty-card">还没有爱好数据，去今日页开始记录吧。</div>';

  el.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card"><b>${ms.activeDays}</b><span>本月记录天数</span></div>
      <div class="stat-card"><b>${total}</b><span>累计记录</span></div>
      <div class="stat-card"><b>${cur}</b><span>当前连续</span></div>
      <div class="stat-card"><b>${longest}</b><span>最长连续</span></div>
    </div>
    <div class="section-title">最近 14 天</div>
    <div class="chart">${bars}</div>
    <div class="section-title">爱好排行</div>
    <div class="rank-list">${rows}</div>`;
}

function renderHobbies() {
  const el = $('#view-hobbies');
  if (!el) return;
  const items = state.hobbies.length
    ? state.hobbies.map(h => {
        const s = hobbyStats(h.id);
        return `<div class="hobby-item" style="--hcolor:${h.color}">
          ${iconTag(h, 'hobby-emoji')}
          <div class="hobby-info">
            <div class="hobby-name">${escapeHtml(h.name)}</div>
            <div class="hobby-stats">${s.count} 次 · 连续 ${s.current} 天</div>
          </div>
          <div class="hobby-actions">
            <button data-action="edit-hobby" data-id="${h.id}" title="编辑">✎</button>
            <button data-action="delete-hobby" data-id="${h.id}" title="删除">🗑</button>
          </div>
        </div>`;
      }).join('')
    : '<div class="empty-card">还没有爱好，点击下方按钮添加第一个爱好。</div>';
  el.innerHTML = `
    <div class="page-head"><h2>我的爱好</h2><span class="page-sub">共 ${state.hobbies.length} 个</span></div>
    <button class="btn-primary" data-action="add-hobby">＋ 添加新爱好</button>
    <div class="hobby-list">${items}</div>
    <div class="tip-card">💡 在「今日」页点击爱好卡片即可开始记录；卡片角落的 ✎ 可补充时长、心情、照片和备注。</div>`;
}

function renderData() {
  const el = $('#view-data');
  if (!el) return;
  const sizeKb = (JSON.stringify(state).length / 1024).toFixed(1);
  const theme = localStorage.getItem(THEME_KEY) || 'light';
  el.innerHTML = `
    <div class="page-head"><h2>数据与设置</h2></div>
    <div class="setting-card">
      <div class="setting-title">💾 数据备份</div>
      <p class="setting-desc">数据保存在当前浏览器的本地存储中，建议定期导出备份；换设备或换浏览器时再导入即可恢复。</p>
      <div class="btn-row">
        <button class="btn-secondary" data-action="export-data">⬇ 导出 JSON</button>
        <label class="btn-secondary">⬆ 导入 JSON<input type="file" id="import-file" accept=".json,application/json" hidden></label>
      </div>
    </div>
    <div class="setting-card">
      <div class="setting-title">🖼 应用图标</div>
      <p class="setting-desc">上传一张图片作为应用图标（显示在首页和浏览器标签页）。安装到手机桌面后的图标是项目里的固定文件，想换成你自己的图，把图片发给我替换即可。</p>
      <div class="app-icon-row">
        <div class="app-icon-preview" id="app-icon-preview"></div>
        <div class="btn-row">
          <label class="btn-secondary" for="app-icon-input">⬆ 上传图片</label>
          <button class="btn-secondary" data-action="reset-app-icon">↺ 恢复默认</button>
        </div>
      </div>
      <input type="file" id="app-icon-input" accept="image/*" hidden>
    </div>
    <div class="setting-card">
      <div class="setting-title">🕶 外观</div>
      <div class="btn-row">
        <button class="btn-secondary ${theme === 'light' ? 'on' : ''}" data-action="set-theme" data-theme="light">☀️ 浅色</button>
        <button class="btn-secondary ${theme === 'dark' ? 'on' : ''}" data-action="set-theme" data-theme="dark">🌙 深色</button>
      </div>
    </div>
    <div class="setting-card danger">
      <div class="setting-title">🗑 清空全部数据</div>
      <p class="setting-desc">删除所有爱好和记录，且无法恢复。请先导出备份。</p>
      <button class="btn-danger" data-action="clear-data">清空全部数据</button>
    </div>
    <div class="about">
      <div>Hobby Diary · 本地版 v${APP_VERSION}</div>
      <div>当前数据约 ${sizeKb} KB（${state.hobbies.length} 个爱好、${state.records.length} 条记录）</div>
      <button class="link-btn" data-action="check-update">🔄 检查更新</button>
      <div>支持离线使用；发现新版本时顶部会提示一键更新。</div>
    </div>`;
  renderAppIconPreview();
}

/* ============ 弹窗 ============ */
function openModal(title, bodyHtml) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  $('#modal-backdrop').classList.remove('hidden');
  document.body.classList.add('modal-open');
  const first = $('#modal-body input:not([type=hidden]), #modal-body select, #modal-body textarea');
  if (first) first.focus();
}
function closeModal() {
  $('#modal-backdrop').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

function openRecordModal(date, record, preferredHobbyId) {
  modalRecordId = record ? record.id : null;
  selectedMood = record && record.mood ? record.mood : null;
  modalPhotos = record && Array.isArray(record.photos) ? [...record.photos] : [];
  const isNew = !record;
  const targetHobby = record ? hobbyById(record.hobbyId) : null;
  const moodBtns = MOODS.map(m => `<button type="button" class="mood-btn ${selectedMood === m.v ? 'on' : ''}" data-mood="${m.v}" title="${m.label}">${m.emoji}</button>`).join('');
  const hobbyOpts = state.hobbies.map(h =>
    `<option value="${h.id}" ${(targetHobby && h.id === targetHobby.id) || (!targetHobby && h.id === preferredHobbyId) ? 'selected' : ''}>${iconText(h)} ${escapeHtml(h.name)}</option>`).join('');
  const hobbyField = state.hobbies.length === 0
    ? '<p class="form-hint">请先到「爱好」页添加爱好。</p>'
    : (isNew
        ? `<label>爱好<select name="hobbyId" required>${hobbyOpts}</select></label>`
        : `<input type="hidden" name="hobbyId" value="${record.hobbyId}"><div class="form-static">${targetHobby ? `${iconTag(targetHobby, 'form-ico')}${escapeHtml(targetHobby.name)}` : '未知爱好'}</div>`);
  openModal(isNew ? `为 ${fmtCnDate(date)} 添加记录` : '编辑记录', `
    <form id="record-form">
      <input type="hidden" name="date" value="${escapeHtml(date)}">
      ${hobbyField}
      <label>心情（可选）</label>
      <div class="mood-picker" id="mood-picker">${moodBtns}</div>
      <label>备注（可选）<textarea name="note" rows="2" maxlength="500" placeholder="今天有什么特别想说的…">${record ? escapeHtml(record.note) : ''}</textarea></label>
      <label>照片（最多 9 张，可选）</label>
      <div class="photo-grid" id="photo-grid"></div>
      <label class="btn-secondary photo-add" for="photo-input">＋ 添加照片</label>
      <input type="file" id="photo-input" accept="image/*" multiple hidden>
      <p class="form-hint">照片会压缩后保存在本机浏览器中。</p>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-action="close-modal">取消</button>
        <button type="submit" class="btn-primary">保存</button>
      </div>
    </form>`);
  $$('#mood-picker .mood-btn').forEach(b => b.addEventListener('click', () => {
    selectedMood = Number(b.dataset.mood);
    $$('#mood-picker .mood-btn').forEach(x => x.classList.toggle('on', x === b));
  }));
  renderPhotoGrid();
  const photoInput = $('#photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', () => {
      handlePhotoFiles(photoInput.files);
      photoInput.value = '';
    });
  }
  $('#record-form').addEventListener('submit', onRecordSubmit);
}
function onRecordSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const date = String(fd.get('date') || currentDate);
  const hobbyId = String(fd.get('hobbyId') || '');
  if (!hobbyId && state.hobbies.length === 0) { toast('请先添加爱好'); return; }
  const note = String(fd.get('note') || '').trim();
  if (modalRecordId) {
    const r = state.records.find(x => x.id === modalRecordId);
    if (r) { r.date = date; r.hobbyId = hobbyId; r.mood = selectedMood; r.note = note; r.photos = modalPhotos.slice(0, 9); }
    toast('已更新');
  } else {
    state.records.push({ id: uid(), date, hobbyId, mood: selectedMood, note, photos: modalPhotos.slice(0, 9), createdAt: Date.now() });
    toast('已记录 🎉');
  }
  saveState();
  closeModal();
  renderAll();
}

function openHobbyModal(hobby) {
  modalHobbyId = hobby ? hobby.id : null;
  selectedColor = hobby ? hobby.color : COLOR_PRESETS[0];
  selectedIcon = hobby && hobby.emoji ? hobby.emoji : '🎯';
  const dots = COLOR_PRESETS.map(c => `<button type="button" class="color-dot ${selectedColor === c ? 'on' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
  const emojiOpts = EMOJI_PRESETS.map(e => `<button type="button" class="emoji-opt ${selectedIcon === e ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('');
  openModal(hobby ? '编辑爱好' : '添加新爱好', `
    <form id="hobby-form">
      <input type="hidden" name="id" value="${hobby ? hobby.id : ''}">
      <label>图标</label>
      <div class="icon-preview" id="hobby-icon-preview"></div>
      <div class="emoji-grid">${emojiOpts}</div>
      <label class="btn-secondary photo-add" for="hobby-icon-input">🖼 上传图片作图标</label>
      <input type="file" id="hobby-icon-input" accept="image/*" hidden>
      <label>名称<input name="name" required maxlength="20" value="${hobby ? escapeHtml(hobby.name) : ''}" placeholder="例如：画画"></label>
      <label>颜色</label>
      <div class="color-picker">${dots}</div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" data-action="close-modal">取消</button>
        <button type="submit" class="btn-primary">保存</button>
      </div>
    </form>`);
  renderIconPreview();
  $$('#modal-body .emoji-opt').forEach(b => b.addEventListener('click', () => {
    selectedIcon = b.dataset.emoji;
    $$('#modal-body .emoji-opt').forEach(x => x.classList.toggle('on', x === b));
    renderIconPreview();
  }));
  $('#hobby-icon-input').addEventListener('change', () => {
    const file = $('#hobby-icon-input').files[0];
    $('#hobby-icon-input').value = '';
    if (!file || !file.type.startsWith('image/')) return;
    compressImage(file, 256, 0.9).then(dataUrl => {
      selectedIcon = dataUrl;
      renderIconPreview();
      toast('图标已更新');
    }).catch(() => toast('图片读取失败'));
  });
  $$('#modal-body .color-dot').forEach(b => b.addEventListener('click', () => {
    selectedColor = b.dataset.color;
    $$('#modal-body .color-dot').forEach(x => x.classList.toggle('on', x === b));
  }));
  $('#hobby-form').addEventListener('submit', onHobbySubmit);
}
function onHobbySubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const id = String(fd.get('id') || '');
  const name = String(fd.get('name') || '').trim();
  if (!name) { toast('请输入名称'); return; }
  const emoji = selectedIcon || '🎯';
  const color = selectedColor || COLOR_PRESETS[0];
  if (id) {
    const h = hobbyById(id);
    if (h) { h.name = name; h.emoji = emoji; h.color = color; }
    toast('已更新');
  } else {
    state.hobbies.push({ id: uid(), name, emoji, color, createdAt: Date.now() });
    toast('已添加爱好 🎨');
  }
  saveState();
  closeModal();
  renderAll();
}

function renderIconPreview() {
  const box = $('#hobby-icon-preview');
  if (!box) return;
  box.innerHTML = isImageUrl(selectedIcon)
    ? `<img src="${selectedIcon}" alt="图标预览">`
    : `<span>${selectedIcon}</span>`;
}

/* ============ 照片相关 ============ */
function renderPhotoGrid() {
  const grid = $('#photo-grid');
  if (!grid) return;
  grid.innerHTML = modalPhotos.map((p, i) => `
    <div class="photo-item">
      <img src="${p}" alt="照片预览">
      <button type="button" class="photo-remove" data-action="remove-photo" data-index="${i}" title="移除照片">✕</button>
    </div>`).join('');
}
function compressImage(file, maxDim, quality) {
  const limit = maxDim || 1280;
  const q = quality || 0.75;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > limit) {
          const scale = limit / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', q));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function handlePhotoFiles(files) {
  const remaining = 9 - modalPhotos.length;
  if (remaining <= 0) { toast('最多添加 9 张照片'); return; }
  let added = 0;
  for (const file of [...files].slice(0, remaining)) {
    try {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await compressImage(file);
      modalPhotos.push(dataUrl);
      added++;
      renderPhotoGrid();
    } catch (err) { /* 跳过无法读取的图片 */ }
  }
  if (added) toast(`已添加 ${added} 张照片`);
}
function openLightbox(recordId, index) {
  const r = state.records.find(x => x.id === recordId);
  if (!r || !r.photos || !r.photos[index]) return;
  $('#lightbox-img').src = r.photos[index];
  $('#lightbox').classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function closeLightbox() {
  $('#lightbox').classList.add('hidden');
  $('#lightbox-img').src = '';
  document.body.classList.remove('modal-open');
}

/* ============ 数据操作 ============ */
function deleteRecord(id) {
  const r = state.records.find(x => x.id === id);
  if (!r) return;
  if (!confirm('确定删除这条记录吗？')) return;
  state.records = state.records.filter(x => x.id !== id);
  saveState();
  renderAll();
  toast('已删除');
}
function deleteHobby(id) {
  const h = hobbyById(id);
  if (!h) return;
  const n = state.records.filter(r => r.hobbyId === id).length;
  if (!confirm(`确定删除「${h.name}」吗？${n ? `将同时删除它的 ${n} 条记录。` : ''}`)) return;
  state.hobbies = state.hobbies.filter(x => x.id !== id);
  state.records = state.records.filter(r => r.hobbyId !== id);
  saveState();
  renderAll();
  toast('已删除');
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `爱好日记备份-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('已导出备份文件');
}
async function importData(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.hobbies) || !Array.isArray(data.records)) throw new Error('bad');
    if (!confirm(`导入将覆盖当前全部数据（当前 ${state.hobbies.length} 个爱好、${state.records.length} 条记录）。是否继续？`)) return;
    state = { hobbies: data.hobbies.map(normalizeHobby), records: data.records.map(normalizeRecord) };
    saveState();
    renderAll();
    toast('导入成功 ✅');
  } catch (err) {
    toast('导入失败：文件格式不正确');
  }
}
function clearData() {
  if (!confirm('确定清空全部数据吗？此操作无法撤销。')) return;
  if (!confirm('再次确认：所有爱好和记录都会被删除。')) return;
  state = defaultState();
  saveState();
  renderAll();
  toast('已清空');
}

/* ============ 标签页与事件 ============ */
function setTab(tab, rerender) {
  if (!VIEWS.includes(tab)) return;
  activeTab = tab;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${tab}`));
  $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  window.scrollTo({ top: 0 });
  if (rerender !== false) renderAll();
}
function onAction(action, el) {
  switch (action) {
    case 'switch-tab': setTab(el.dataset.tab); break;
    case 'shift-day': currentDate = addDays(currentDate, Number(el.dataset.offset)); renderAll(); break;
    case 'go-today': currentDate = todayStr(); renderAll(); toast('已回到今天'); break;
    case 'open-record': {
      const rec = recordFor(currentDate, el.dataset.hobby);
      openRecordModal(currentDate, rec, el.dataset.hobby);
      break;
    }
    case 'view-photo': openLightbox(el.dataset.id, Number(el.dataset.index)); break;
    case 'remove-photo': modalPhotos.splice(Number(el.dataset.index), 1); renderPhotoGrid(); break;
    case 'close-lightbox': closeLightbox(); break;
    case 'edit-record': {
      const date = el.dataset.date || currentDate;
      const rec = el.dataset.id ? state.records.find(r => r.id === el.dataset.id) : recordFor(date, el.dataset.hobby);
      if (rec) openRecordModal(rec.date, rec);
      else openRecordModal(date, null, el.dataset.hobby);
      break;
    }
    case 'add-record': openRecordModal(el.dataset.date || currentDate, null); break;
    case 'delete-record': deleteRecord(el.dataset.id); break;
    case 'select-day': selectedCalendarDate = el.dataset.date; renderCalendar(); break;
    case 'go-to-date': currentDate = el.dataset.date; setTab('today'); break;
    case 'shift-month': {
      const [y, m] = calendarCursor.split('-').map(Number);
      const nd = new Date(y, m - 1 + Number(el.dataset.offset), 1);
      calendarCursor = `${nd.getFullYear()}-${pad2(nd.getMonth() + 1)}`;
      renderCalendar();
      break;
    }
    case 'go-current-month': calendarCursor = todayStr().slice(0, 7); selectedCalendarDate = todayStr(); renderCalendar(); break;
    case 'add-hobby': openHobbyModal(null); break;
    case 'edit-hobby': openHobbyModal(hobbyById(el.dataset.id)); break;
    case 'delete-hobby': deleteHobby(el.dataset.id); break;
    case 'export-data': exportData(); break;
    case 'clear-data': clearData(); break;
    case 'set-theme': localStorage.setItem(THEME_KEY, el.dataset.theme); applyTheme(); renderData(); break;
    case 'toggle-theme': {
      const cur = localStorage.getItem(THEME_KEY) || 'light';
      localStorage.setItem(THEME_KEY, cur === 'dark' ? 'light' : 'dark');
      applyTheme();
      renderData();
      break;
    }
    case 'close-modal': closeModal(); break;
    case 'go-hobbies': setTab('hobbies'); break;
    case 'reset-app-icon': {
      localStorage.removeItem(APP_ICON_KEY);
      applyAppIcon();
      renderData();
      toast('已恢复默认图标');
      break;
    }
    case 'apply-update': applyUpdate(); break;
    case 'dismiss-update': dismissUpdate(); break;
    case 'check-update': checkForUpdates(true); break;
  }
}
function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el) onAction(el.dataset.action, el);
  });
  $('#modal-backdrop').addEventListener('click', e => { if (e.target.id === 'modal-backdrop') closeModal(); });
  $('#lightbox').addEventListener('click', e => { if (e.target.id === 'lightbox') closeLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  document.addEventListener('change', e => {
    if (e.target.classList && e.target.classList.contains('date-input')) {
      currentDate = e.target.value || todayStr();
      renderAll();
    }
    if (e.target && e.target.id === 'import-file') importData(e.target);
    if (e.target && e.target.id === 'app-icon-input') handleAppIconUpload(e.target);
  });
}

/* ============ 应用图标 ============ */
function applyAppIcon() {
  const icon = localStorage.getItem(APP_ICON_KEY);
  const logo = $('#brand-logo');
  if (logo) logo.innerHTML = icon ? `<img src="${icon}" alt="图标">` : '🌸';
  const fav = $('#favicon');
  if (fav) fav.href = icon || 'icons/icon-192.png';
}
function renderAppIconPreview() {
  const box = $('#app-icon-preview');
  if (!box) return;
  const icon = localStorage.getItem(APP_ICON_KEY);
  box.innerHTML = `<img src="${icon || 'icons/icon-192.png'}" alt="应用图标">`;
}
async function handleAppIconUpload(input) {
  const file = input.files[0];
  input.value = '';
  if (!file || !file.type.startsWith('image/')) { toast('请选择图片文件'); return; }
  try {
    const dataUrl = await compressImage(file, 512, 0.9);
    localStorage.setItem(APP_ICON_KEY, dataUrl);
    applyAppIcon();
    renderAppIconPreview();
    toast('应用图标已更新 🎉');
  } catch (err) {
    toast('图片处理失败，请换一张试试');
  }
}

/* ============ 主题 ============ */
function applyTheme() {
  const theme = localStorage.getItem(THEME_KEY) || 'light';
  document.documentElement.dataset.theme = theme;
  const btn = $('#theme-toggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

/* ============ 其他 ============ */
function toast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2200);
}
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (pendingUpdateWorker) {
      pendingUpdateWorker = null;
      window.location.reload();
    }
  });
  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            if (sessionStorage.getItem(UPDATE_DISMISS_KEY)) return;
            pendingUpdateWorker = worker;
            showUpdateBanner();
          }
        });
      });
      reg.update().catch(() => {});
    })
    .catch(() => {});
}
function showUpdateBanner() {
  const b = $('#update-banner');
  if (b) b.classList.remove('hidden');
}
function applyUpdate() {
  if (pendingUpdateWorker) {
    toast('正在升级，马上回来…');
    pendingUpdateWorker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  // 兜底：直接检查更新并刷新
  toast('正在升级，马上回来…');
  navigator.serviceWorker.getRegistration()
    .then(reg => {
      if (!reg) { window.location.reload(); return; }
      return reg.update().then(() => {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        } else {
          window.location.reload();
        }
      });
    })
    .catch(() => window.location.reload());
}
function dismissUpdate() {
  sessionStorage.setItem(UPDATE_DISMISS_KEY, '1');
  $('#update-banner').classList.add('hidden');
}
async function checkForUpdates(manual) {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) {
    toast('当前环境不支持在线更新');
    return;
  }
  if (manual) toast('正在检查更新…');
  try {
    // 直接读取线上版本号，绕开浏览器与站点缓存
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    const remote = String(data.version || '');
    if (remote && remote !== String(APP_VERSION)) {
      showUpdateBanner();
      if (manual) toast('发现新版本，点顶部横幅升级');
      return;
    }
    // 版本一致时，再让浏览器兜底检查一次 Service Worker
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) reg.update().catch(() => {});
    setTimeout(() => {
      if (!pendingUpdateWorker && $('#update-banner').classList.contains('hidden')) {
        toast('已是最新版本');
      }
    }, 1500);
  } catch (err) {
    if (manual) toast('检查更新失败，请稍后再试');
  }
}
function maybeSeedDemo() {
  if (new URLSearchParams(location.search).get('demo') !== '1') return;
  if (!state.hobbies.length || state.records.length) return;
  const notes = ['今天状态不错', '专注的一小时', '有点累但很充实', '慢慢来，不急', '享受其中'];
  const demo = [];
  for (let i = 29; i >= 0; i--) {
    if (i % 4 === 3) continue;
    const date = addDays(todayStr(), -i);
    const count = 1 + (i % 3);
    for (let k = 0; k < count; k++) {
      const h = state.hobbies[(i + k) % state.hobbies.length];
      demo.push({ id: uid(), date, hobbyId: h.id, mood: (i % 5) + 1, note: notes[i % notes.length], createdAt: Date.now() - i * 86400000 });
    }
  }
  state.records = demo;
}

/* ============ 初始化 ============ */
function init() {
  const p = new URLSearchParams(location.search);
  const t = p.get('tab');
  if (t && VIEWS.includes(t)) activeTab = t;
  maybeSeedDemo();
  applyTheme();
  applyAppIcon();
  bindEvents();
  setTab(activeTab, false);
  renderAll();
  registerSW();
}
document.addEventListener('DOMContentLoaded', init);
