// audio.js —— Hobby Diary 背景音乐引擎：用 Web Audio API 实时合成轻松的纯音乐（无需外部音频文件），支持开关与记忆。
'use strict';

const MusicPlayer = (() => {
  const MUSIC_KEY = 'hobby-diary:music';
  const CHORDS = [
    [261.63, 329.63, 392.00, 493.88], // Cmaj7
    [220.00, 261.63, 329.63, 392.00], // Am7
    [174.61, 220.00, 261.63, 349.23], // Fmaj7
    [196.00, 246.94, 293.66, 329.63]  // G6
  ];
  const SPARKLES = [1046.50, 1318.51, 1567.98, 2093.00];
  const CHORD_SECONDS = 8;

  let ctx = null;
  let master = null;
  let filter = null;
  let playing = false;
  let muted = localStorage.getItem(MUSIC_KEY) === 'off';
  let chordIndex = 0;
  let chordTimer = null;

  function ensureCtx() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.26;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    master.connect(filter);
    filter.connect(ctx.destination);
  }

  function playPad(freq, t, dur) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 2);
    g.gain.setValueAtTime(0.045, t + dur - 2);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  function playPluck(freq, t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 2.4);
  }

  function playSpark(freq, t) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 4.2);
  }

  function scheduleChord() {
    if (!playing || !ctx) return;
    const chord = CHORDS[chordIndex % CHORDS.length];
    const t0 = ctx.currentTime + 0.06;
    chord.forEach(f => playPad(f, t0, CHORD_SECONDS));
    [0, 1, 2, 3].forEach((_, i) => playPluck(chord[i % chord.length] * 2, t0 + i * 2));
    if (chordIndex % 2 === 1) playSpark(SPARKLES[chordIndex % SPARKLES.length], t0 + 3);
    chordIndex++;
    chordTimer = setTimeout(scheduleChord, CHORD_SECONDS * 1000);
  }

  function startMusicIfIdle() {
    if (muted || playing) return;
    if (!ctx || ctx.state !== 'running') return;
    playing = true;
    scheduleChord();
    document.dispatchEvent(new CustomEvent('hobby-music-started'));
  }

  function start() {
    if (muted) return;
    ensureCtx();
    if (!ctx) return;
    // 等音频上下文真正恢复运行后再开始排程（iOS 必须在用户手势内恢复）
    ctx.resume().then(startMusicIfIdle).catch(() => {});
  }

  function stop() {
    playing = false;
    clearTimeout(chordTimer);
    if (ctx) ctx.suspend().catch(() => {});
  }

  function toggle() {
    muted = !muted;
    localStorage.setItem(MUSIC_KEY, muted ? 'off' : 'on');
    if (muted) stop(); else start();
    refreshButton();
  }

  function refreshButton() {
    const b = document.getElementById('music-toggle');
    if (b) b.textContent = muted ? '🔇' : '🎵';
  }

  function isPending() {
    return !!ctx && ctx.state === 'suspended' && !muted;
  }

  function init() {
    refreshButton();
    if (!muted) start(); // 尝试自动播放；被浏览器拦截时由首次点击兜底
    // 兼容多种手机浏览器的手势事件（iOS/安卓的 Safari、Chrome 等）
    ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => document.addEventListener(evt, () => { if (!muted) start(); }));
  }

  return { init, toggle, refreshButton, isPending };
})();

document.addEventListener('DOMContentLoaded', () => MusicPlayer.init());
