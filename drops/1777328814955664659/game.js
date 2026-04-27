"use strict";

/* ────────────────────────────────────────────
   Device detection & adaptive fade curve
    ─────────────────────────────────────────── */
function detectDevice() {
  const ua = navigator.userAgent || "";
  const isPhone = /Mobi|Android|iPhone|iPad/i.test(ua);
  const sr = (typeof window.AudioContext !== "undefined")
    ? new (window.AudioContext || window.webkitAudioContext)().sampleRate
    : 48000;
  return {
    isPhone,
    sampleRate: sr,
    aggressiveHighPass: isPhone || sr < 44100,
  };
}

const DEVICE = detectDevice();

/* ────────────────────────────────────────────
   Constants
    ─────────────────────────────────────────── */
const PEAK_TIME    = 1.2; // hold time to reach peak (s)
const HARD_CAP     = 2.5; // max hold before auto-release (s)
const EXHALE_MS    = 600; // exhale visual duration (ms)
const BLOOM_MS     = 350; // bloom fade duration (ms)
const EXHALE_AUDIO = 0.4; // audio fade tail (s), device-adaptive below

/* ────────────────────────────────────────────
   State machine: IDLE → INHALING → PEAK → EXHALING → IDLE
    ─────────────────────────────────────────── */
const State = { IDLE: 0, INHALING: 1, PEAK: 2, EXHALING: 3 };

let state       = State.IDLE;
let holdStart   = 0;
let holdElapsed = 0;
let peakTime    = 0;
let exhaleStart = 0;

/* ────────────────────────────────────────────
   Audio engine — all procedural, no external assets
    ─────────────────────────────────────────── */
let audioCtx    = null;
let masterGain  = null;
let oscs        = [];
let fmOsc       = null;
let fmGain      = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioCtx.destination);

  const layers = [
    { type: "sine",     freq: 174,  vol: 0.25 }, // warm base
    { type: "triangle",  freq: 174.5, vol: 0.15 }, // body
    { type: "sine",     freq: 348,  vol: 0.08 }, // 2× overtone
    { type: "sine",     freq: 870,  vol: 0.04 }, // shimmer
  ];

  layers.forEach(l => {
    const o = audioCtx.createOscillator();
    o.type = l.type;
    o.frequency.value = l.freq;
    const g = audioCtx.createGain();
    g.gain.value = l.vol;
    o.connect(g).connect(masterGain);
    oscs.push({ osc: o, gain: g, baseFreq: l.freq });
    o.start();
  });

  // FM modulator for gentle wobble
  fmOsc = audioCtx.createOscillator();
  fmOsc.type = "sine";
  fmOsc.frequency.value = 0.4;
  fmGain = audioCtx.createGain();
  fmGain.gain.value = 2.5;
  fmOsc.connect(fmGain);
  oscs.forEach(o => fmGain.connect(o.osc.frequency));
  fmOsc.start();
}

function setMaster(target, dur) {
  if (!masterGain || !audioCtx) return;
  masterGain.gain.setTargetAtTime(target, audioCtx.currentTime, dur);
}

/* ────────────────────────────────────────────
   Adaptive fade curve
    ─────────────────────────────────────────── */
function fadeCurve(progress, isExhaling = false) {
  const p = Math.max(0, Math.min(progress, 1));
  if (DEVICE.aggressiveHighPass) {
    return isExhaling ? p * p * (3 - 2 * p) : Math.pow(p, 1.4);
  }
  return p * (2 - p);
}

/* ────────────────────────────────────────────
   Canvas & rendering
    ─────────────────────────────────────────── */
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");
let dpr  = Math.min(window.devicePixelRatio || 1, 2);
let cx, cy, radius;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = w / 2;
  cy = h / 2;
  radius = Math.min(w, h) * 0.18;
}
window.addEventListener("resize", resize);
resize();

/* ────────────────────────────────────────────
   Colors: indigo → amber interpolation
    ─────────────────────────────────────────── */
function lerpColor(t) {
  const c = [
    [59, 40, 130],   // indigo
    [255, 190, 60],  // amber
  ];
  const a = c[0], b = c[1];
  const s = Math.max(0, Math.min(t, 1));
  return {
    r: Math.round(a[0] + (b[0] - a[0]) * s),
    g: Math.round(a[1] + (b[1] - a[1]) * s),
    b: Math.round(a[2] + (b[2] - a[2]) * s),
  };
}

function rgba(c, alpha = 1) {
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

/* ────────────────────────────────────────────
   Ripple / orb render state
    ─────────────────────────────────────────── */
let ripplePhase   = 0;
let glowIntensity = 0;
let isFrozen      = false;
let freezeGlow    = 0;

function drawOrb() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Background twilight gradient
  const bgGrad = ctx.createLinearGradient(0, 0, w * 0.6, h);
  bgGrad.addColorStop(0,    state === State.PEAK ? "#15103a" : "#0a0a1a");
  bgGrad.addColorStop(0.6,  state === State.PEAK ? "#1a1040" : "#1a1035");
  bgGrad.addColorStop(1,    "#080810");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Ripple rings (6 expanding rings)
  const fc = fadeCurve(ripplePhase);
  for (let i = 5; i >= 0; i--) {
    const r = radius * (0.8 + i * 0.6) * (isFrozen ? 1 : fc);
    if (r < 2) continue;
    const alpha = (1 - i * 0.15) * 0.35 * (isFrozen ? 0.8 : fc);
    const col = lerpColor(isFrozen ? 1 : fc);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(col, alpha);
    ctx.lineWidth = 2 + (1 - i * 0.18) * (isFrozen ? 1 : fc) * 4;
    ctx.stroke();
  }

  // Central orb gradient
  const orbGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  const coreT = ripplePhase * (isFrozen ? 1 : ripplePhase);
  const coreColor = lerpColor(coreT);
  const edgeA     = 0.12 + 0.38 * ripplePhase;

  orbGrad.addColorStop(0,    rgba(coreColor, 0.9));
  orbGrad.addColorStop(0.55, rgba(coreColor, 0.45));
  orbGrad.addColorStop(1,    rgba(coreColor, edgeA));

  const orbR = radius + (isFrozen ? 4 : 0);

  // Shadow / glow pass
  ctx.shadowColor = rgba(coreColor, 0.35 + glowIntensity * 0.55);
  ctx.shadowBlur  = 12 + glowIntensity * 42;
  ctx.beginPath();
  ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
  ctx.fillStyle = orbGrad;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Bloom / freeze-frame glow overlay
  if (freezeGlow > 0.01) {
    const bloomR = radius * (1.8 + freezeGlow * 0.8);
    const bGrad  = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, bloomR);
    const bCol   = lerpColor(1);
    bGrad.addColorStop(0, rgba(bCol, 0.28 * freezeGlow));
    bGrad.addColorStop(1, rgba(bCol, 0));
    ctx.beginPath();
    ctx.arc(cx, cy, bloomR, 0, Math.PI * 2);
    ctx.fillStyle = bGrad;
    ctx.fill();
  }
}

/* ────────────────────────────────────────────
   Audio per-frame update
    ─────────────────────────────────────────── */
function updateAudio() {
  if (!audioCtx || !masterGain) return;

  switch (state) {
    case State.INHALING: {
      const t = Math.min(holdElapsed / PEAK_TIME, 1);
      const vol = fadeCurve(t) * 0.6;
      setMaster(vol, 0.02);
      // Pitch bend +2 semitones (~6%) toward peak
      const bend = Math.pow(t, 1.5) * 0.06;
      oscs.forEach(o => {
        o.osc.frequency.setTargetAtTime(o.baseFreq * (1 + bend), audioCtx.currentTime, 0.04);
      });
      glowIntensity = fadeCurve(t);
      break;
    }

    case State.PEAK: {
      setMaster(0.6, 0.01);
      oscs[2].gain.gain.setTargetAtTime(0.14, audioCtx.currentTime, 0.02);
      oscs[3].gain.gain.setTargetAtTime(0.08, audioCtx.currentTime, 0.02);
      glowIntensity = 1;
      break;
    }

    case State.EXHALING: {
      const eT = (performance.now() - exhaleStart) / 1000;
      const dur = DEVICE.aggressiveHighPass ? 0.3 : 0.5;
      const eF = Math.max(0, 1 - eT / dur);
      const vol = fadeCurve(eF, true) * 0.6;
      setMaster(vol, 0.02);
      oscs[2].gain.gain.setTargetAtTime(0.08, audioCtx.currentTime, 0.08);
      oscs[3].gain.gain.setTargetAtTime(0.04, audioCtx.currentTime, 0.08);
      glowIntensity = fadeCurve(eF, true);
      break;
    }

    case State.IDLE:
      setMaster(0, 0.04);
      glowIntensity = 0;
      break;
  }
}

/* ────────────────────────────────────────────
   Haptic feedback
    ─────────────────────────────────────────── */
function peakHaptic() {
  if (navigator.vibrate) navigator.vibrate(30);
}

function exhaleHaptic() {
  if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
}

/* ────────────────────────────────────────────
   Tap sound — 20ms attack blip
    ─────────────────────────────────────────── */
function playTapBlip() {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.3, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
  o.connect(g).connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + 0.05);
}

/* ────────────────────────────────────────────
   State transition helpers (non-blocking)
    ─────────────────────────────────────────── */
function startInhale() {
  if (state !== State.IDLE) return;
  initAudio();
  state       = State.INHALING;
  holdStart   = performance.now();
  holdElapsed = 0;
  ripplePhase = 0;
  isFrozen    = false;
  freezeGlow  = 0;
  playTapBlip();
}

function reachPeak() {
  if (state !== State.INHALING) return;
  state       = State.PEAK;
  isFrozen    = true;
  peakTime    = performance.now();
  ripplePhase = 1;
  freezeGlow  = 1;
  peakHaptic();
}

function startExhale() {
  if (state !== State.INHALING && state !== State.PEAK) return;
  state       = State.EXHALING;
  isFrozen    = false;
  exhaleStart = performance.now();
  exhaleHaptic();
}

function resetToIdle() {
  state       = State.IDLE;
  ripplePhase = 0;
  isFrozen    = false;
  freezeGlow  = 0;
  glowIntensity = 0;
  if (audioCtx && masterGain) setMaster(0, 0.06);
}

/* ────────────────────────────────────────────
   Main render loop — non-blocking, target 60fps
    ─────────────────────────────────────────── */
let lastFrame = performance.now();

function ticker(now) {
  requestAnimationFrame(ticker);
  const dt = Math.min((now - lastFrame) / 1000, 0.1);
  lastFrame = now;

  switch (state) {
    case State.INHALING: {
      holdElapsed = (now - holdStart) / 1000;
      ripplePhase = Math.min(holdElapsed / PEAK_TIME, 1);
      if (holdElapsed >= PEAK_TIME) {
        reachPeak();
      } else if (holdElapsed >= HARD_CAP) {
        startExhale();
      }
      break;
    }

    case State.PEAK: {
      const pt = (now - peakTime) / 1000;
      freezeGlow = Math.max(0, 1 - pt * 1000 / BLOOM_MS);
      if (freezeGlow < 0.01) startExhale();
      break;
    }

    case State.EXHALING: {
      const eT = (now - exhaleStart);
      ripplePhase = Math.max(0, 1 - eT / EXHALE_MS);
      if (ripplePhase <= 0) resetToIdle();
      break;
    }

    case State.IDLE:
      ripplePhase = 0;
      break;
  }

  updateAudio();
  drawOrb();
}

/* ────────────────────────────────────────────
   Input — pointer events for touch + mouse
    ─────────────────────────────────────────── */
let pointerDown = false;

canvas.addEventListener("pointerdown", e => {
  e.preventDefault();
  pointerDown = true;
  startInhale();
}, { passive: false });

canvas.addEventListener("pointerup", e => {
  e.preventDefault();
  pointerDown = false;
  if (state === State.INHALING || state === State.PEAK) startExhale();
}, { passive: false });

canvas.addEventListener("pointercancel", () => {
  pointerDown = false;
  if (state === State.INHALING || state === State.PEAK) startExhale();
});

canvas.addEventListener("pointerleave", () => {
  if (pointerDown) {
    pointerDown = false;
    if (state === State.INHALING || state === State.PEAK) startExhale();
  }
});

canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
canvas.addEventListener("touchmove",  e => e.preventDefault(), { passive: false });

/* ────────────────────────────────────────────
   Boot
    ─────────────────────────────────────────── */
requestAnimationFrame(ticker);
