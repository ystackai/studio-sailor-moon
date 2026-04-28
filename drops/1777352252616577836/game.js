"use strict";

// ─── Device Detection ───────────────────────────────────────────
const ua = navigator.userAgent || "";
const platform = navigator.platform || "";
const IS_PHONE = /android|iphone|ipad|phone/i.test(ua + " " + platform);

// ─── Canvas Setup ───────────────────────────────────────────────
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const vw = () => window.innerWidth;
const vh = () => window.innerHeight;

// ─── Audio Engine ───────────────────────────────────────────────
let audioCtx = null;
let basePadGain = null;
let bgMixerGain = null;
let rippleGain = null;
let rippleFilter = null;
let rippleOsc = null;
let freezeOsc = null;
let freezeGain = null;
let crossfadeGain = null;
let fadeToBgGain = null;
let crossfadeBuffer = null;

const CROSSFADE_MS = 40;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();

   // ── Base Pad: low-pass filtered sine + triangle ~80Hz, 0.1Hz LFO ──
  basePadGain = audioCtx.createGain();
  basePadGain.gain.value = 0.12;

  bgMixerGain = audioCtx.createGain();
  bgMixerGain.gain.value = 1;

  const o1 = audioCtx.createOscillator();
  o1.type = "sine";
  o1.frequency.value = 80;
  const o2 = audioCtx.createOscillator();
  o2.type = "triangle";
  o2.frequency.value = 80.5;

  const lfo = audioCtx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.1;
  const lfoG = audioCtx.createGain();
  lfoG.gain.value = 3;
  lfo.connect(lfoG);
  lfoG.connect(o1.frequency);
  lfoG.connect(o2.frequency);

  const padFilt = audioCtx.createBiquadFilter();
  padFilt.type = "lowpass";
  padFilt.frequency.value = IS_PHONE ? 200 : 350;
  padFilt.Q.value = 0.5;
  o1.connect(padFilt);
  o2.connect(padFilt);
  padFilt.connect(basePadGain);

  basePadGain.connect(bgMixerGain);
  bgMixerGain.connect(audioCtx.destination);

  o1.start();
  o2.start();
  lfo.start();

   // ── Ripple chain: bandpass sweep ──
  rippleOsc = audioCtx.createOscillator();
  rippleOsc.type = "sine";
  rippleOsc.frequency.value = 200;

  rippleFilter = audioCtx.createBiquadFilter();
  rippleFilter.type = "bandpass";
  rippleFilter.frequency.value = 300;
  rippleFilter.Q.value = IS_PHONE ? 3.5 : 2;

  rippleGain = audioCtx.createGain();
  rippleGain.gain.value = 0;

  rippleOsc.connect(rippleFilter);
  rippleFilter.connect(rippleGain);
  rippleGain.connect(audioCtx.destination);
  rippleOsc.start();

   // ── Freeze source (sustained tone for frozen state) ──
  freezeOsc = audioCtx.createOscillator();
  freezeOsc.type = "sine";
  freezeOsc.frequency.value = 400;
  freezeGain = audioCtx.createGain();
  freezeGain.gain.value = 0;
  freezeOsc.connect(freezeGain);
  freezeGain.connect(audioCtx.destination);
  freezeOsc.start();

   // ── Crossfade gain (for 40ms buffer blend) ──
  crossfadeGain = audioCtx.createGain();
  crossfadeGain.gain.value = 0;
  crossfadeGain.connect(audioCtx.destination);

   // ── Mute-crossfade bridge: fades bgMixerGain when system audio detected ──
  fadeToBgGain = audioCtx.createGain();
  fadeToBgGain.gain.value = 1;
  bgMixerGain.disconnect();
  bgMixerGain.connect(fadeToBgGain);
  fadeToBgGain.connect(audioCtx.destination);

   // Detect media session / background audio
  try {
    navigator.mediaSession && (fadeToBgGain.gain.value = 0.85);
   } catch(_) {}
}

// Generate a 40ms windowed, zero-phase crossfade buffer at the current ripple frequency
function buildCrossfadeBuffer() {
  if (!audioCtx) return null;
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * CROSSFADE_MS / 1000);
  const buf = audioCtx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const f0 = rippleFilter.frequency.value;
  const f1 = 500;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (len - 1)); // Hann window
    const f = f0 + (f1 - f0) * (i / len);
    d[i] = Math.sin(2 * Math.PI * f * t) * env * 0.35;
   }
  return buf;
}

// Play the crossfade buffer
function playCrossfade(buf) {
  if (!buf || !audioCtx) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(crossfadeGain);
  const t = audioCtx.currentTime;
  crossfadeGain.gain.setValueAtTime(0, t);
  crossfadeGain.gain.linearRampToValueAtTime(0.5, t + 0.01);
  crossfadeGain.gain.linearRampToValueAtTime(0, t + CROSSFADE_MS / 1000);
  src.start(t);
  src.onended = () => {
    crossfadeGain.gain.setValueAtTime(0, audioCtx.currentTime);
   };
}

function playInhaleSwell() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
   // Soft inhale swell: gain ramp 0->0.4 over 200ms
  rippleGain.gain.cancelScheduledValues(t);
  rippleGain.gain.setValueAtTime(0.001, t);
  rippleGain.gain.linearRampToValueAtTime(0.4, t + 0.2);
}

function playFreezeTransition() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const buf = buildCrossfadeBuffer();

   // 40ms crossfade: fade out ripple, fade in freeze tone
  rippleGain.gain.cancelScheduledValues(t);
  rippleGain.gain.setValueAtTime(rippleGain.gain.value, t);
  rippleGain.gain.linearRampToValueAtTime(0, t + 0.02);

  freezeGain.gain.cancelScheduledValues(t);
  freezeGain.gain.setValueAtTime(0, t);
  freezeGain.gain.linearRampToValueAtTime(0.3, t + 0.04);
  freezeOsc.frequency.setValueAtTime(rippleFilter.frequency.value, t);

  playCrossfade(buf);
}

function playMeltDecay() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
   // Exponential decay τ=1.2s
  freezeGain.gain.cancelScheduledValues(t);
  freezeGain.gain.setValueAtTime(freezeGain.gain.value, t);
  freezeGain.gain.setTargetAtTime(0, t, 1.2);
  rippleFilter.frequency.setTargetAtTime(300, t, 1.2);
}

// ─── State Machine (non-blocking async) ─────────────────────────
const S = { IDLE: 0, RISING: 1, FROZEN: 2, MELTING: 3 };
let state = S.IDLE;
const HOLDCAP = 2500; // 2.5s hold cap
let holdT0 = 0;
let ripplePhase = 0;
let amp = 0;
let frozenAmp = 0;
let freezePulse = 0;
let lastTs = 0;

const RISE_MS = 800;

function setState(s) {
  state = s;
}

// ─── Input ──────────────────────────────────────────────────────
canvas.addEventListener("pointerdown", e => {
  e.preventDefault();
  initAudio();
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  const now = performance.now();

  switch (state) {
    case S.IDLE:
       // Init: start ripple
      setState(S.RISING);
      ripplePhase = 0;
      amp = 0;
      holdT0 = now;
      playInhaleSwell();
      break;

    case S.RISING:
       // Peak catch: tap near apex to freeze
      if (ripplePhase > 0.55) {
        triggerFreeze();
       } else {
         // Early tap accelerates the rise
        ripplePhase = Math.min(ripplePhase + 0.2, 0.95);
       }
      break;

    case S.FROZEN:
       // Tap while frozen also melts
      triggerMelt();
      break;

    case S.MELTING:
      // Restart from melting goes to idle then next tap starts new
      break;
   }
});

canvas.addEventListener("pointerup", e => {
  e.preventDefault();
  if (state === S.FROZEN) triggerMelt();
});
canvas.addEventListener("pointercancel", e => {
  if (state === S.FROZEN) triggerMelt();
});

function triggerFreeze() {
  setState(S.FROZEN);
  frozenAmp = Math.max(amp, 0.7);
  holdT0 = performance.now();
  freezePulse = 0;
  playFreezeTransition();
}

function triggerMelt() {
  setState(S.MELTING);
  amp = frozenAmp;
  holdT0 = performance.now();
  playMeltDecay();
}

function checkHoldCap() {
  if ((state === S.FROZEN || state === S.RISING) &&
      performance.now() - holdT0 > HOLDCAP) {
    if (state === S.FROZEN) {
      triggerMelt();
     } else {
      setState(S.MELTING);
      holdT0 = performance.now();
      playMeltDecay();
     }
   }
}

// ─── Colors ─────────────────────────────────────────────────────
const AMBER = [255, 180, 60];
const DEEP  = [200, 100, 20];
const GLOW  = [255, 220, 140];

function rgba(c, a) {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

// ─── Rendering ──────────────────────────────────────────────────
function drawBg() {
  const cx = vw() / 2, cy = vh() / 2;
  const r = Math.max(vw(), vh());
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, "rgba(55,32,5,1)");
  g.addColorStop(0.35, "rgba(32,18,2,1)");
  g.addColorStop(1, "rgba(12,8,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw(), vh());
}

function drawRipple(_amp, _phase) {
  const cx = vw() / 2, cy = vh() / 2;
  const maxR = Math.min(vw(), vh()) * 0.38;
  const nRings = 4;

  for (let i = 0; i < nRings; i++) {
    const rp = (_phase + i * 0.18) % 1;
    const ringR = rp * maxR * (0.25 + _amp * 0.75);
    const alpha = _amp * (1 - rp * rp) * 0.55;
    if (alpha < 0.008) continue;

    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(AMBER, alpha * (IS_PHONE ? 0.45 : 0.6));
    ctx.lineWidth = 2.5 + _amp * 9;
    ctx.lineCap = "round";
    ctx.stroke();
   }

   // Center warm glow dot
  const ca = _amp * 0.75;
  if (ca > 0.01) {
    const cr = 35 + _amp * 65;
    const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    cg.addColorStop(0, rgba(GLOW, ca));
    cg.addColorStop(1, rgba(GLOW, 0));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
   }
}

function drawFreezeGlow(_frozenAmp, _pulse) {
  const cx = vw() / 2, cy = vh() / 2;
   // 0.5s pulse loop
  const pulse = 0.5 + 0.5 * Math.sin(2 * Math.PI * _pulse / 0.5);
  const intensity = Math.min(0.6, _frozenAmp * (0.25 + pulse * 0.3));

  const r = Math.min(vw(), vh()) * 0.33;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(GLOW, intensity));
  g.addColorStop(0.45, rgba(AMBER, intensity * 0.4));
  g.addColorStop(1, rgba(DEEP, 0));

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawIdleHint() {
  const cx = vw() / 2, cy = vh() / 2;
  const p = 0.6 + 0.4 * Math.sin(performance.now() * 0.0018);
  ctx.save();
  ctx.globalAlpha = 0.22 * p;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(GLOW, 0.5);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

// ─── Tick ───────────────────────────────────────────────────────
function tick(now) {
  switch (state) {
    case S.IDLE:
      amp = 0;
      ripplePhase = 0;
      break;

    case S.RISING: {
      const prog = Math.min(1, (now - holdT0) / RISE_MS);
      ripplePhase = prog;
       // Smoothstep ease-in-out
      amp = prog * prog * (3 - 2 * prog);

       // Keep audio filter in sync
      if (rippleFilter && audioCtx) {
        rippleFilter.frequency.setTargetAtTime(
          300 + amp * 900, audioCtx.currentTime, 0.06
         );
       }

      if (prog >= 0.99) {
         // Auto-freeze if user didn't tap; still a valid peak catch
        triggerFreeze();
       }
      break;
     }

    case S.FROZEN:
      amp = frozenAmp;
      freezePulse = (now - holdT0) / 1000;
      checkHoldCap();
      break;

    case S.MELTING: {
      const mt = (now - holdT0) / 1000;
      amp = frozenAmp * Math.exp(-mt / 1.2);
      if (amp < 0.005) {
        setState(S.IDLE);
        amp = 0;
        if (rippleGain && audioCtx) {
          rippleGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.08);
         }
       }
      break;
     }
   }
}

// ─── Render loop ────────────────────────────────────────────────
function frame(ts) {
  if (!lastTs) lastTs = ts;
  lastTs = ts;
  const now = performance.now();

  tick(now);
  ctx.clearRect(0, 0, vw(), vh());
  drawBg();

  if (state === S.IDLE) {
    drawIdleHint();
   } else {
    drawRipple(amp, ripplePhase);
   }

  if (state === S.FROZEN) {
    drawFreezeGlow(frozenAmp, freezePulse);
   }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Block scroll
document.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
