// audio.js —— Hobby Diary 背景音乐引擎：用 Web Audio API 实时合成多种风格的纯音乐（无需外部音频文件），支持风格切换与开关。
'use strict';

const MusicPlayer = (() => {
  const MUSIC_KEY = 'hobby-diary:music';
  const STYLE_KEY = 'hobby-diary:music-style';

  const STYLES = {
    calm: {
      name: '宁静',
      chordSeconds: 8,
      arpStep: 2,
      padGain: 0.045,
      pluckGain: 0.07,
      sparkGain: 0.05,
      padWave: 'triangle',
      pluckWave: 'sine',
      octaveUp: true,
      sparkEvery: 2,
      bass: false,
      chords: [
        [261.63, 329.63, 392.00, 493.88],
        [220.00, 261.63, 329.63, 392.00],
        [174.61, 220.00, 261.63, 349.23],
        [196.00, 246.94, 293.66, 329.63]
      ],
      sparkles: [1046.50, 1318.51, 1567.98, 2093.00]
    },
    piano: {
      name: '钢琴',
      chordSeconds: 8,
      arpStep: 2,
      padGain: 0.03,
      pluckGain: 0.1,
      sparkGain: 0.05,
      padWave: 'sine',
      pluckWave: 'triangle',
      octaveUp: true,
      sparkEvery: 2,
      bass: false,
      chords: [
        [220.00, 261.63, 329.63, 392.00],
        [196.00, 246.94, 293.66, 349.23],
        [261.63, 329.63, 392.00, 493.88],
        [174.61, 220.00, 261.63, 329.63]
      ],
      sparkles: [880.00, 1046.50, 1318.51, 1567.98]
    },
    bright: {
      name: '轻快',
      chordSeconds: 6,
      arpStep: 1,
      padGain: 0.04,
      pluckGain: 0.09,
      sparkGain: 0.06,
      padWave: 'triangle',
      pluckWave: 'triangle',
      octaveUp: true,
      sparkEvery: 1,
      bass: false,
      chords: [
        [261.63, 329.63, 392.00, 523.25],
        [246.94, 293.66, 392.00, 493.88],
        [220.00, 261.63, 329.63, 440.00],
        [174.61, 220.00, 261.63, 349.23]
      ],
      sparkles: [1046.50, 1318.51, 1567.98, 2093.00, 2637.02]
    },
    energetic: {
      name: '活力',
      chordSeconds: 3,
      arpStep: 0.5,
      padGain: 0.035,
      pluckGain: 0.1,
      sparkGain: 0.05,
      padWave: 'triangle',
      pluckWave: 'triangle',
      octaveUp: false,
      sparkEvery: 1,
      bass: true,
      bassGain: 0.14,
      chords: [
        [261.63, 329.63, 392.00, 523.25],
        [220.00, 261.63, 329.63, 440.00],
        [174.61, 220.00, 261.63, 349.23],
        [196.00, 246.94, 293.66, 392.00]
      ],
      sparkles: [1318.51, 1567.98, 2093.00, 2637.02]
    }
  };

  let ctx = null;
  let master = null;
  let filter = null;
  let playing = false;
  let muted = localStorage.getItem(MUSIC_KEY) === 'off';
  let chordIndex = 0;
  let chordTimer = null;

  function currentStyle() {
    return STYLES[localStorage.getItem(STYLE_KEY)] || STYLES.calm;
  }
  function currentStyleName() {
    return localStorage.getItem(STYLE_KEY) || 'calm';
  }

  function ensureCtx() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    master.connect(filter);
    filter.connect(ctx.destination);
  }

  function playPad(freq, t, dur, st) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = st.padWave;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(st.padGain, t + 2);
    g.gain.setValueAtTime(st.padGain, t + dur - 2);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  function playPluck(freq, t, st) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = st.pluckWave;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(st.pluckGain, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 2.4);
  }

  function playSpark(freq, t, st) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(st.sparkGain, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 4.2);
  }

  function playBass(freq, t, st) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(st.bassGain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  function scheduleChord() {
    if (!playing || !ctx) return;
    const st = currentStyle();
    const chord = st.chords[chordIndex % st.chords.length];
    const t0 = ctx.currentTime + 0.05;
    chord.forEach(f => playPad(f, t0, st.chordSeconds, st));
    const steps = Math.max(2, Math.round(st.chordSeconds / st.arpStep));
    for (let i = 0; i < steps; i++) {
      playPluck(chord[i % chord.length] * (st.octaveUp ? 2 : 1), t0 + i * st.arpStep, st);
      if (st.bass) playBass(chord[0] / 2, t0 + i * st.arpStep, st);
    }
    if (chordIndex % st.sparkEvery === 0) {
      playSpark(st.sparkles[chordIndex % st.sparkles.length], t0 + st.chordSeconds / 2, st);
    }
    chordIndex++;
    chordTimer = setTimeout(scheduleChord, st.chordSeconds * 1000);
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
    ctx.resume().then(startMusicIfIdle).catch(() => {});
  }

  function stop() {
    playing = false;
    clearTimeout(chordTimer);
    if (ctx) ctx.suspend().catch(() => {});
  }

  function setStyle(name) {
    if (!STYLES[name]) return;
    localStorage.setItem(STYLE_KEY, name);
    if (playing) {
      clearTimeout(chordTimer);
      playing = false;
      start();
    }
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
    if (!muted) start();
    ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => document.addEventListener(evt, () => { if (!muted) start(); }));
  }

  return { init, toggle, refreshButton, isPending, setStyle, currentStyleName };
})();

document.addEventListener('DOMContentLoaded', () => MusicPlayer.init());
