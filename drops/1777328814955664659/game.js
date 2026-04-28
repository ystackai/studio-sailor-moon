"use strict";

/* ────────────────────────────────────────────
   Device detection & adaptive fade curve
   ──────────────────────────────────────────── */
function detectDevice() {
  const ua = navigator.userAgent || "";
  const isPhone = /Mobi|Android|iPhone|iPad/i.test(ua);
  let sampleRate = 48000;
  try {
    const tmp = new (window.AudioContext || window.webkitAudioContext)();
    sampleRate = tmp.sampleRate;
    tmp.close();
  } catch (_) { /* noop */ }
  return {
    isPhone,
    sampleRate,
    aggressiveHighPass: isPhone || sampleRate < 44100,
  };
}

const DEVICE = detectDevice();

/* ────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────── */
const PEAK_TIME   = 1.2;   // hold time to reach peak (s)
const HARD_CAP    = 2.5;   // max hold before auto-release (s)
const EXHALE_MS   = 600;   // exhale visual duration (ms)
const BLOOM_MS    = 350;   // bloom fade duration (ms)
const IDLE_PULSE  = 4.0;   // idle breathing pulse period (s)

/* ────────────────────────────────────────────
   State machine: IDLE → INHALING → PEAK → EXHALING → IDLE
   ──────────────────────────────────────────── */
const State = Object.freeze({ IDLE: 0, INHALING: 1, PEAK: 2, EXHALING: 3 });

let state        = State.IDLE;
let holdStart    = 0;
let holdElapsed  = 0;
let peakTime     = 0;
let peakStay     = 0; // how long we've stayed at peak
let exhaleStart  = 0;
let lastTick     = 0;

/* ────────────────────────────────────────────
   Audio engine — procedural, Web Audio API
   Uses Blob-based AudioWorklet for off-thread processing
   ──────────────────────────────────────────── */
let audioCtx       = null;
let masterGain     = null;
let analyser       = null;
let workletNode    = null;
let oscs           = [];
let fmOsc          = null;
let fmGain         = null;
let tapOsc         = null;
let audioReady     = false;

// AudioWorklet processor source — Blob loaded
const workletSource = `
class BreathProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.phase = 0;
    this.targetVol = 0;
    this.currentVol = 0;
  }
  process(inputs, outputs) {
    const output = outputs[0];
    const ch0 = output[0];
    for (let i = 0; i < ch0.length; i++) {
      // Smooth volume interpolation
      this.currentVol += (this.targetVol - this.currentVol) * 0.15;
      // Gentle ambient carrier — dual LFO shimmer
      const t = this.phase;
      const v  = this.currentVol
                 * (0.22 * Math.sin(t * 6.2832)
                  + 0.18 * Math.sin(t * 3.1416)
                  + 0.60);
      ch0[i] = v * 0.15;
      this.phase += 0.0008;
      if (this.phase > 1) this.phase -= 1;
    }
    return true;
  }
}
registerProcessor("breath-processor", BreathProcessor);
`;

async function initAudio() {
  if (audioReady) return;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();

  // Load AudioWorklet from Blob URL
  const blob = new Blob([workletSource], { type: "application/javascript" });
  const url  = URL.createObjectURL(blob);
  await audioCtx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  workletNode = new AudioWorkletNode(audioCtx, "breath-processor");
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0;

  workletNode.connect(masterGain);
  masterGain.connect(analyser);
  analyser.connect(audioCtx.destination);

  // Main tone layers
  const layers = [
    { type: "sine",     freq: 174,   vol: 0.25 }, // warm base
    { type: "triangle",  freq: 174.5, vol: 0.15 }, // body
    { type: "sine",     freq: 348,   vol: 0.08 }, // 2× overtone
    { type: "sine",     freq: 870,   vol: 0.04 }, // shimmer
    { type: "sine",     freq: 1305,  vol: 0.02 }, // 5th shimmer (174*7.5)
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

  // FM modulator — gentle wobble on all oscillators
  fmOsc = audioCtx.createOscillator();
  fmOsc.type = "sine";
  fmOsc.frequency.value = 0.35;
  fmGain = audioCtx.createGain();
  fmGain.gain.value = 2.2;
  fmOsc.connect(fmGain);
  oscs.forEach(o => fmGain.connect(o.osc.frequency));
  fmOsc.start();

  audioReady = true;
}

function setMasterVolume(target, dur = 0.02) {
  if (!masterGain || !audioCtx) return;
  masterGain.gain.setTargetAtTime(target, audioCtx.currentTime, dur);
}

function setWorkletVolume(target) {
  if (!workletNode) return;
  workletNode.port.postMessage({ targetVol: target });
}

/* ────────────────────────────────────────────
   Adaptive fade curve
   Phone: faster roll-off to preserve transients
   Headphones: gentle smooth curve
   ──────────────────────────────────────────── */
function fadeCurve(p, exhaling = false) {
  const v = Math.max(0, Math.min(p, 1));
  if (DEVICE.aggressiveHighPass) {
    // Faster high-pass roll-off for phone speakers
    return exhaling
      ? v * v * (3 - 2 * v)       // smoothstep decay
      : Math.pow(v, 1.4);           // steeper inhale
  }
  // Smooth ease-in-out for good headphones
  return v * (2 - v);
}

/* ────────────────────────────────────────────
   Canvas & rendering
   ──────────────────────────────────────────── */
const canvas = document.getElementById("canvas");
const ctx    = canvas.getContext("2d");
let dpr  = Math.min(window.devicePixelRatio || 1, 3);
let cw       = 0;  // CSS width
let ch       = 0;  // CSS height
let cx, cy, orbR;

function resize() {
  cw = window.innerWidth;
  ch = window.innerHeight;
  canvas.width  = cw * dpr;
  canvas.height = ch * dpr;
  canvas.style.width  = cw + "px";
  canvas.style.height = ch + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx  = cw / 2;
  cy  = ch / 2;
  orbR = Math.min(cw, ch) * 0.13;
}
window.addEventListener("resize", resize);
resize();

/* ────────────────────────────────────────────
   Color helpers — indigo → amber interpolation
   ──────────────────────────────────────────── */
function lerpColor(t) {
  // indigo [59,40,130] → amber [255,190,60]
  const s = Math.max(0, Math.min(t, 1));
  return {
    r: Math.round(59  + 196 * s),
    g: Math.round(40  + 150 * s),
    b: Math.round(130 -  70 * s),
  };
}

function rgba(c, a = 1) {
  return `rgba(${c.r},${c.g},${c.b},${a})`;
}

/* ────────────────────────────────────────────
   Ripple / orb render state
   ──────────────────────────────────────────── */
let ripplePhase     = 0;
let glowIntensity   = 0;
let isFrozen        = false;
let freezeGlow      = 0;
let idleT           = 0;   // idle breathing counter

/* ────────────────────────────────────────────
   Draw one frame — background + ripple rings + orb + bloom
   ──────────────────────────────────────────── */
function drawFrame() {
  const w = cw, h = ch;

  // ── Twilight background ──
  const bgPeak   = (state === State.PEAK) ? 1 : 0;
  const bgGrad = ctx.createLinearGradient(0, 0, w * 0.6, h);
  bgGrad.addColorStop(0,  "#" + hexRGB(lerpColor(0.06 + bgPeak * 0.04)));
  bgGrad.addColorStop(0.5, "#" + hexRGB(lerpColor(0.03)));
  bgGrad.addColorStop(1,   "#080820");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Subtle star field — static, drawn once in background tint
  ctx.fillStyle = "rgba(200, 210, 255, 0.06)";
  const seed = 42;
  for (let i = 0; i < 40; i++) {
    const sx = Math.abs(Math.sin(i * 127.1 + seed) * 43758.5453 % 1) * w;
    const sy = Math.abs(Math.sin(i * 269.5 + seed) * 18456.2321 % 1) * h;
    const sr = 0.5 + Math.abs(Math.sin(i * 43.1)) * 1.5;
    const sa = 0.03 + Math.abs(Math.sin(now() * 0.001 + i)) * 0.03;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(190,200,240,${sa})`;
    ctx.fill();
  }

  // ── Ripple rings — expanding outward ──
  const fc = fadeCurve(ripplePhase);
  const numRings = 8;
  for (let i = numRings - 1; i >= 0; i--) {
    const frac = i / (numRings - 1);
    const r    = orbR * (0.7 + frac * 2.2) * (isFrozen ? 1 : (0.5 + fc * 0.5));
    if (r < 2) continue;
    const alpha = (1 - frac * 0.7) * 0.25 * (isFrozen ? 1.2 : fc);
    const col   = lerpColor(isFrozen ? 1 : (fc * (1 - frac * 0.3)));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(col, Math.min(alpha, 0.6));
    ctx.lineWidth = 1.2 + (1 - frac) * (isFrozen ? 2 : fc * 3.5);
    ctx.stroke();
  }

  // ── Idle breathing pulse ──
  if (state === State.IDLE) {
    const pulse = 0.5 + 0.5 * Math.sin(idleT * Math.PI * 2 / IDLE_PULSE);
    const idleAlpha = 0.06 + pulse * 0.06;
    const idleCol   = lerpColor(0.15 + pulse * 0.15);
    ctx.beginPath();
    ctx.arc(cx, cy, orbR * (1.0 + pulse * 0.08), 0, Math.PI * 2);
    const idleGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR * 1.8);
    idleGrad.addColorStop(0,  rgba(idleCol, idleAlpha * 2));
    idleGrad.addColorStop(1,  rgba(idleCol, 0));
    ctx.fillStyle = idleGrad;
    ctx.fill();
  }

  // ── Central orb ──
  const coreT = ripplePhase * (isFrozen ? 1 : ripplePhase);
  const coreC = lerpColor(coreT);
  const edgeA = 0.08 + 0.42 * ripplePhase;

  const orbGrow = isFrozen ? 1 : (1 + ripplePhase * 0.15);
  const drawR   = orbR * orbGrow;

  const orbGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, drawR);
  orbGrad.addColorStop(0.0,  rgba(coreC, 0.92));
  orbGrad.addColorStop(0.35, rgba(coreC, 0.55));
  orbGrad.addColorStop(0.7,  rgba(coreC, 0.25 * (0.5 + ripplePhase * 0.5)));
  orbGrad.addColorStop(1.0,  rgba(coreC, edgeA * 0.3));

  // Bloom pass
  ctx.shadowColor = rgba(coreC, 0.25 + glowIntensity * 0.65);
  ctx.shadowBlur  = 8 + glowIntensity * 55;

  ctx.beginPath();
  ctx.arc(cx, cy, drawR, 0, Math.PI * 2);
  ctx.fillStyle = orbGrad;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Core highlight — inner bright spot
  const hiR = drawR * 0.35;
  const hiGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, hiR);
  hiGrad.addColorStop(0, rgba(lerpColor(1), 0.4 + glowIntensity * 0.35));
  hiGrad.addColorStop(1, rgba(lerpColor(1), 0));
  ctx.beginPath();
  ctx.arc(cx, cy, hiR, 0, Math.PI * 2);
  ctx.fillStyle = hiGrad;
  ctx.fill();

  // ── Bloom / freeze-frame glow overlay ──
  if (freezeGlow > 0.01) {
    const bloomR  = orbR * (2.0 + freezeGlow * 1.5);
    const bloomCol = lerpColor(1);
    const bGrad = ctx.createRadialGradient(cx, cy, orbR * 0.3, cx, cy, bloomR);
    bGrad.addColorStop(0, rgba(bloomCol, 0.30 * freezeGlow));
    bGrad.addColorStop(0.5, rgba(bloomCol, 0.10 * freezeGlow));
    bGrad.addColorStop(1, rgba(bloomCol, 0));
    ctx.beginPath();
    ctx.arc(cx, cy, bloomR, 0, Math.PI * 2);
    ctx.fillStyle = bGrad;
    ctx.fill();

    // Peak ring glow
    const peakRingR = drawR * (1.3 + freezeGlow * 0.4);
    ctx.beginPath();
    ctx.arc(cx, cy, peakRingR, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(bloomCol, 0.15 * freezeGlow);
    ctx.lineWidth = 3 * freezeGlow;
    ctx.stroke();
  }

  // ── Exhale ring fade ──
  if (state === State.EXHALING) {
    const eF = Math.max(0, fadeCurve(ripplePhase, true));
    const eR = orbR * (2.5 - eF * 1.2);
    const eCol = lerpColor(1 - ripplePhase * 0.5);
    ctx.beginPath();
    ctx.arc(cx, cy, eR, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(eCol, 0.12 * eF);
    ctx.lineWidth = 1.5 * eF;
    ctx.stroke();
  }
}

// Helper to convert RGB to hex
function hexRGB(c) {
  return [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, "0")).join("");
}

/* ────────────────────────────────────────────
   Audio per-frame update (called from ticker)
   ──────────────────────────────────────────── */
function updateAudio() {
  if (!audioCtx || !masterGain) return;

  switch (state) {
    case State.INHALING: {
      const t   = Math.min(holdElapsed / PEAK_TIME, 1);
      const vol = fadeCurve(t) * 0.55;
      setMasterVolume(vol, 0.018);
      setWorkletVolume(t);

      // Pitch bend +2 semitones (~12.6%) toward peak
      const bend = Math.pow(t, 1.5) * 0.126;
      oscs.forEach(o => {
        o.osc.frequency.setTargetAtTime(
          o.baseFreq * (1 + bend),
          audioCtx.currentTime,
          0.03
        );
      });
      // Speed up FM modulator slightly as we approach peak
      fmOsc.frequency.setTargetAtTime(
        0.35 + t * 0.2,
        audioCtx.currentTime,
        0.05
      );
      glowIntensity = fadeCurve(t);
      break;
    }

    case State.PEAK: {
      setMasterVolume(0.58, 0.008);
      setWorkletVolume(1);
      // Boost shimmer and overtone for peak harmonic cluster
      if (oscs[2]) oscs[2].gain.gain.setTargetAtTime(0.16, audioCtx.currentTime, 0.015);
      if (oscs[3]) oscs[3].gain.gain.setTargetAtTime(0.10, audioCtx.currentTime, 0.015);
      if (oscs[4]) oscs[4].gain.gain.setTargetAtTime(0.06, audioCtx.currentTime, 0.015);
      glowIntensity = 1;
      break;
    }

    case State.EXHALING: {
      const eT  = (performance.now() - exhaleStart) / 1000;
      const dur = DEVICE.aggressiveHighPass ? 0.25 : 0.45;
      const eF  = Math.max(0, 1 - eT / dur);
      const vol = fadeCurve(eF, true) * 0.55;
      setMasterVolume(vol, 0.018);
      setWorkletVolume(eF);

      // Gradual pitch return to baseline
      const unBend = 1 - fadeCurve(eF, true);
      oscs.forEach(o => {
        o.osc.frequency.setTargetAtTime(
          o.baseFreq * (1 + unBend * 0.05),
          audioCtx.currentTime,
          0.06
        );
      });

      // Fade shimmer and overtones
      if (oscs[2]) oscs[2].gain.gain.setTargetAtTime(0.06 * eF, audioCtx.currentTime, 0.05);
      if (oscs[3]) oscs[3].gain.gain.setTargetAtTime(0.03 * eF, audioCtx.currentTime, 0.05);
      if (oscs[4]) oscs[4].gain.gain.setTargetAtTime(0.02 * eF, audioCtx.currentTime, 0.05);

      glowIntensity = fadeCurve(eF, true);
      break;
    }

    case State.IDLE:
      setMasterVolume(0, 0.04);
      setWorkletVolume(0);
      glowIntensity = 0;
      // Restore frequencies to baseline
      oscs.forEach(o => {
        o.osc.frequency.setTargetAtTime(o.baseFreq, audioCtx.currentTime, 0.08);
      });
      break;
  }
}

/* ────────────────────────────────────────────
   Haptic feedback
   ──────────────────────────────────────────── */
function peakHaptic() {
  if (navigator.vibrate) navigator.vibrate(30);
}

function exhaleHaptic() {
  if (navigator.vibrate) navigator.vibrate([8, 20, 8]);
}

function tapHaptic() {
  if (navigator.vibrate) navigator.vibrate(2);
}

/* ────────────────────────────────────────────
   Tap sound — 20ms attack blip
   ──────────────────────────────────────────── */
function playTapBlip() {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = "sine";
  o.frequency.value = 920;
  g.gain.setValueAtTime(0.25, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.035);
  o.connect(g).connect(audioCtx.destination);
  o.start(audioCtx.currentTime);
  o.stop(audioCtx.currentTime + 0.045);
  tapHaptic();
}

/* ────────────────────────────────────────────
   State transition helpers — non-blocking
   ──────────────────────────────────────────── */
function startInhale() {
  if (state !== State.IDLE) return;
  // initAudio is async but non-blocking; ticker guards on audioReady
  initAudio();
  state        = State.INHALING;
  holdStart    = performance.now();
  holdElapsed  = 0;
  ripplePhase  = 0;
  isFrozen     = false;
  freezeGlow   = 0;
  playTapBlip();
}

function reachPeak() {
  if (state !== State.INHALING) return;
  state       = State.PEAK;
  isFrozen    = true;
  peakTime    = performance.now();
  peakStay    = 0;
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
  state        = State.IDLE;
  ripplePhase  = 0;
  isFrozen     = false;
  freezeGlow   = 0;
  glowIntensity = 0;
  if (audioCtx && masterGain) setMasterVolume(0, 0.06);
}

/* ────────────────────────────────────────────
   Main render loop — non-blocking RAF, target 60fps
   ──────────────────────────────────────────── */
let lastFrame = 0;

function now() {
  return performance.now();
}

function ticker(ts) {
  requestAnimationFrame(ticker);
  if (!lastFrame) lastFrame = ts;
  const dt = Math.min((ts - lastFrame) / 1000, 0.1);
  lastFrame = ts;

  // Idle breathing
  if (state === State.IDLE) idleT += dt;

  switch (state) {
    case State.INHALING: {
      holdElapsed = (ts - holdStart) / 1000;
      ripplePhase  = Math.min(holdElapsed / PEAK_TIME, 1);
      if (holdElapsed >= PEAK_TIME) {
        reachPeak();
      } else if (holdElapsed >= HARD_CAP) {
        // Hard cap — auto-release to prevent deadlocks
        startExhale();
      }
      break;
    }

    case State.PEAK: {
      peakStay = (ts - peakTime) / 1000;
      freezeGlow = Math.max(0, 1 - peakStay * 1000 / BLOOM_MS);
      if (peakStay > 0.8) {
        // Stay at peak for ~800ms then auto-exhale if user hasn't released
        // (user may release earlier via pointerup)
        // Note: BLOOM_MS=350, freezeGlow reaches 0 at 0.35s, but we hold longer
      }
      // Auto-transition after freezeGlow fades but user still holding
      if (freezeGlow < 0.01 && peakStay > 1.0) {
        startExhale();
      }
      break;
    }

    case State.EXHALING: {
      const eT = (ts - exhaleStart);
      ripplePhase = Math.max(0, 1 - eT / EXHALE_MS);
      if (ripplePhase <= 0) resetToIdle();
      break;
    }

    case State.IDLE:
      ripplePhase  = 0;
      break;
  }

  updateAudio();
  drawFrame();
}

/* ────────────────────────────────────────────
   Input — pointer events (touch + mouse unified)
   ──────────────────────────────────────────── */
canvas.addEventListener("pointerdown", e => {
  e.preventDefault();
  startInhale();
}, { passive: false });

canvas.addEventListener("pointerup", e => {
  e.preventDefault();
  if (state === State.INHALING || state === State.PEAK) startExhale();
}, { passive: false });

canvas.addEventListener("pointercancel", () => {
  if (state === State.INHALING || state === State.PEAK) startExhale();
});

canvas.addEventListener("pointerleave", () => {
  if (state === State.INHALING || state === State.PEAK) startExhale();
});

// Block touch scrolling on canvas
canvas.addEventListener("touchstart", e => e.preventDefault(), { passive: false });
canvas.addEventListener("touchmove",  e => e.preventDefault(), { passive: false });

/* ────────────────────────────────────────────
   Boot
   ──────────────────────────────────────────── */
requestAnimationFrame(ticker);
