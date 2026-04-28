// ─── Device Detection ───────────────────────────────────────────────────────
const isMobile =
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);

// ─── State Machine Constants ───────────────────────────────────────────────
const STATE = {
  IDLE: 'idle',
  ATTACK: 'attack',
  FREEZE: 'freeze',
  MELT: 'melt',
};

const FREEZE_MAX_MS = 2500;
const CROSSFADE_MS = 40;

// ─── Canvas Setup ──────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const W = () => window.innerWidth;
const H = () => window.innerHeight;
const CX = () => W() / 2;
const CY = () => H() / 2;

// ─── Audio Engine ──────────────────────────────────────────────────────────
let audioCtx = null;
let masterGain = null;
let oscillators = [];
let lpfNode = null;
let crossfadeGain = null;
let analyser = null;
let compressor = null;
let analyserData = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Compressor to duck background audio / prevent masking
    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -30;
    compressor.knee.value = 10;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.12;

    // Analyser for tight audio-visual sync (±15ms)
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    analyserData = new Uint8Array(analyser.frequencyBinCount);

    // Master gain
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;

    // Low-pass filter for melt roll-off
    lpfNode = audioCtx.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = 8000;
    lpfNode.Q.value = 0.7;

    // Crossfade buffer gain node (40ms smooth transitions)
    crossfadeGain = audioCtx.createGain();
    crossfadeGain.gain.value = 1;

    // Signal chain: oscillators -> masterGain -> lpf -> crossfade -> compressor -> analyser -> destination
    masterGain.connect(lpfNode);
    lpfNode.connect(crossfadeGain);
    crossfadeGain.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(audioCtx.destination);

    // Procedural ambient pad oscillators (A minor with extended harmonics)
    const frequencies = [220, 329.63, 440, 493.88, 659.25]; // A3, E4, A4, B4, E5
    const gains     = [0.18, 0.12, 0.10, 0.07, 0.05]; // harmonic rolloff
    frequencies.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      // Mix sine and triangle for warmth
      osc.type = (i % 2 === 0) ? 'sine' : 'triangle';
      osc.frequency.value = freq;

      // Slight detune for organic feel
      osc.detune.value = (Math.random() - 0.5) * 8;

      g.gain.value = gains[i];

      osc.connect(g);
      g.connect(masterGain);
      osc.start();

      oscillators.push({ osc, gain: g });
    });
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Read RMS amplitude from the analyser for tight audio-visual sync
function getAudioAmplitude() {
  if (!analyser || !analyserData) return 0;
  analyser.getByteFrequencyData(analyserData);
  let sum = 0;
  for (let i = 0; i < analyserData.length; i++) {
    sum += analyserData[i];
  }
  // Normalise 0..1
  return (sum / (analyserData.length * 255)) * 2;
}

function setAmplitude(t, target, duration) {
  const now = audioCtx.currentTime + t;
  masterGain.gain.setTargetAtTime(target, now, duration);
}

function setLpf(t, freq, duration) {
  const now = audioCtx.currentTime + t;
  lpfNode.frequency.setTargetAtTime(freq, now, duration);
}

// 40ms crossfade UP: prevent clicks on attack / freeze entry
function crossfadeUp() {
  if (!crossfadeGain) return;
  const now = audioCtx.currentTime;
  crossfadeGain.gain.cancelScheduledValues(now);
  crossfadeGain.gain.setValueAtTime(0, now);
  crossfadeGain.gain.linearRampToValueAtTime(1, now + CROSSFADE_MS / 1000);
}

// 40ms crossfade DOWN: prevent clicks on freeze / melt transitions
function crossfadeDown() {
  if (!crossfadeGain) return;
  const now = audioCtx.currentTime;
  crossfadeGain.gain.cancelScheduledValues(now);
  crossfadeGain.gain.setValueAtTime(crossfadeGain.gain.value, now);
  crossfadeGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_MS / 1000);
}

// ─── Interaction State ─────────────────────────────────────────────────────
let state = STATE.IDLE;
let amplitude = 0;          // model amplitude 0..1
let holdStart = 0;
let freezeStart = 0;
let meltStart = 0;
let pressActive = false;

// Visual ripple parameters
let rippleRadius = 0;
let rippleTarget = 0;
let glowIntensity = 0;
let audioGlow = 0;  // synced glow from analyser

// Ripple ring history for trailing effect
let rippleHistory = []; // { radius: number, alpha: number, born: number, life: number }
const RIPPLE_TRAIL_MAX = 6;

// ─── Input Handling ────────────────────────────────────────────────────────
function onDown(e) {
  e.preventDefault();
  ensureAudio();
  pressActive = true;

  if (state === STATE.IDLE || state === STATE.MELT) {
    // Logarithmic attack ramp
    state = STATE.ATTACK;
    holdStart = performance.now();
    rippleRadius = 0;
    rippleHistory = [];
    crossfadeUp();

    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0.001, now);
    // Log attack: exponential approach with fast initial rise
    masterGain.gain.setTargetAtTime(0.35, now, 0.06);

    // Open LPF wide for full spectrum on attack
    lpfNode.frequency.cancelScheduledValues(now);
    lpfNode.frequency.setValueAtTime(8000, now);
  } else if (state === STATE.FREEZE) {
    // Early release from freeze triggers melt
    triggerMelt();
  }
}

function onUp(e) {
  e.preventDefault();
  pressActive = false;

  if (state === STATE.ATTACK) {
    // Release during attack: freeze at current amplitude
    triggerFreeze();
  } else if (state === STATE.FREEZE) {
    triggerMelt();
  }
}

function triggerFreeze() {
  state = STATE.FREEZE;
  freezeStart = performance.now();
  rippleTarget = rippleRadius;

  // Push a ripple ring into history
  rippleHistory.push({
    radius: rippleRadius,
    alpha: 0.6,
    born: performance.now(),
    life: 2000,
  });

  // Smooth freeze: 40ms crossfade to hold amplitude steady
  const now = audioCtx.currentTime;

  // Briefly dip then restore to create a soft transient (click-free)
  crossfadeDown();
  setTimeout(() => crossfadeUp(), CROSSFADE_MS);

  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
}

function triggerMelt() {
  state = STATE.MELT;
  meltStart = performance.now();

  const now = audioCtx.currentTime;
  // Adaptive fade: mobile gets gentler roll-off, desktop gets steeper
  const fadeTime  = isMobile ? 2.0 : 1.0;
  const lpfTarget = isMobile ? 400 : 250;

  // 40ms crossfade down to kill transient, then exponential fade
  crossfadeDown();

  setTimeout(() => {
    if (state !== STATE.MELT) return;
    const t2 = audioCtx.currentTime;

    masterGain.gain.cancelScheduledValues(t2);
    masterGain.gain.setValueAtTime(masterGain.gain.value || 0.01, t2);
    // Adaptive exponential fade curve
    masterGain.gain.exponentialRampToValueAtTime(0.001, t2 + fadeTime);

    lpfNode.frequency.cancelScheduledValues(t2);
    lpfNode.frequency.setValueAtTime(lpfNode.frequency.value || 8000, t2);
    lpfNode.frequency.exponentialRampToValueAtTime(lpfTarget, t2 + fadeTime);
  }, CROSSFADE_MS);

  // Push a final ripple ring for the melt burst
  rippleHistory.push({
    radius: Math.max(rippleRadius, 30),
    alpha: 0.5,
    born: performance.now(),
    life: fadeTime * 1000 + 300,
  });

  // Return to idle after fade completes
  setTimeout(() => {
    if (state === STATE.MELT) {
      state = STATE.IDLE;
      amplitude = 0;
      rippleRadius = 0;
      glowIntensity = 0;
      audioGlow = 0;
      rippleHistory = [];
    }
  }, fadeTime * 1000 + 200);
}

// Mouse + Touch
canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('mouseup', onUp);
canvas.addEventListener('mouseleave', onUp);
canvas.addEventListener('touchstart', onDown, { passive: false });
canvas.addEventListener('touchend', onUp, { passive: false });
canvas.addEventListener('touchcancel', onUp, { passive: false });

// ─── Color Palette ─────────────────────────────────────────────────────────
const HONEY_AMBER = [255, 179, 71];    // warm amber glow
const SOFT_PEACH  = [255, 183, 130];   // peach midtone
const WARM_CREAM  = [255, 223, 173];   // cream highlight
const BG_COLOR    = '#0a0e1a';            // dark moonlit

function rgba(r, g, b, a) {
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

// ─── Rendering ─────────────────────────────────────────────────────────────
function drawRipple(t) {
  const cx = CX();
  const cy = CY();
  const maxR = Math.min(W(), H()) * 0.38;
  const now = performance.now();

  // ── Update amplitude / radius based on state ──────────────────────────
  if (state === STATE.ATTACK && pressActive) {
    const elapsed = now - holdStart;
    // Logarithmic amplitude ramp: fast initial rise, smooth plateau
    amplitude = Math.min(1, 1 - Math.exp(-elapsed / 450));
    rippleRadius = amplitude * maxR;
    glowIntensity = amplitude;

    // Spawn trailing ripple rings periodically during attack
    if (rippleHistory.length < RIPPLE_TRAIL_MAX &&
        Math.floor(elapsed / 180) > rippleHistory.length) {
      rippleHistory.push({
        radius: rippleRadius * 0.7,
        alpha: 0.3 * amplitude,
        born: now,
        life: 1500,
      });
    }

  } else if (state === STATE.FREEZE) {
    const freezeElapsed = now - freezeStart;
    // Hard cap: auto-triggers melt after exactly 2.5s
    if (freezeElapsed > FREEZE_MAX_MS) {
      triggerMelt();
    }

    // Freeze-frame: gentle micro-breathe for life, locked glow
    rippleRadius = rippleTarget + Math.sin(t * 0.004) * 2.5 * amplitude;
    glowIntensity = amplitude + 0.1; // intensity boost during freeze glow

  } else if (state === STATE.MELT) {
    const meltElapsed = now - meltStart;
    const fadeTime = (isMobile ? 2.0 : 1.0);
    const progress = Math.min(1, meltElapsed / (fadeTime * 1000));

    // Adaptive fade curve: mobile uses smoother ease-out, desktop steeper
    if (isMobile) {
      // Gentler: exponential ease-out for phone speakers
      const eased = 1 - Math.exp(-progress * 3);
      rippleRadius *= (1 - eased * 0.004);
      glowIntensity *= (1 - eased * 0.005);
    } else {
      // Steeper: linear-exponential mix for desktop
      rippleRadius *= 0.996;
      glowIntensity *= 0.992;
    }

    if (rippleRadius < 2) {
      rippleRadius = 0;
      glowIntensity = 0;
    }

  } else {
    // IDLE: subtle ambient pulse
    rippleRadius = maxR * 0.06 + Math.sin(t * 0.0008) * 2;
    glowIntensity = 0.015;
    amplitude = 0;
  }

  // Read actual audio amplitude for sync (±15ms target)
  const rawAudioAmp = getAudioAmplitude();
  // Smooth the audio reading with lerp for stable glow
  audioGlow += (rawAudioAmp - audioGlow) * 0.25;

  // Final glow combines model intensity + live audio for tight sync
  glowIntensity = Math.max(glowIntensity, audioGlow * 0.8);

  // ── Clear canvas ─────────────────────────────────────────────────────
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W(), H());

  // ── Trail ripple rings ───────────────────────────────────────────────
  for (let i = rippleHistory.length - 1; i >= 0; i--) {
    const ring = rippleHistory[i];
    const age = now - ring.born;
    const lifeRatio = Math.min(1, age / ring.life);

    if (lifeRatio >= 1) {
      rippleHistory.splice(i, 1);
      continue;
    }

    // Ring expands and fades
    const expandedR = ring.radius * (1 + lifeRatio * 0.6);
    const alpha = ring.alpha * (1 - lifeRatio * lifeRatio); // quadratic fade

    if (alpha > 0.005) {
      ctx.strokeStyle = rgba(...HONEY_AMBER, alpha);
      ctx.lineWidth = 1.5 + (1 - lifeRatio) * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, expandedR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ── Outer glow halo ──────────────────────────────────────────────────
  if (glowIntensity > 0.01) {
    const haloR = rippleRadius * 2;
    const haloGrad = ctx.createRadialGradient(cx, cy, rippleRadius * 0.2, cx, cy, haloR);
    haloGrad.addColorStop(0,   rgba(...WARM_CREAM, glowIntensity * 0.08));
    haloGrad.addColorStop(0.4, rgba(...SOFT_PEACH, glowIntensity * 0.04));
    haloGrad.addColorStop(0.7, rgba(...HONEY_AMBER, glowIntensity * 0.015));
    haloGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Main ripple body ─────────────────────────────────────────────────
  if (rippleRadius > 1) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rippleRadius);

    // Core glow intensity maps to color stops
    const coreA = 0.12 + glowIntensity * 0.5;
    grad.addColorStop(0,    rgba(...WARM_CREAM, coreA));
    grad.addColorStop(0.2,  rgba(...HONEY_AMBER, coreA * 0.85));
    grad.addColorStop(0.45, rgba(...SOFT_PEACH,  coreA * 0.5));
    grad.addColorStop(0.7,  rgba(...HONEY_AMBER, coreA * 0.18));
    grad.addColorStop(0.9,  rgba(...SOFT_PEACH,  coreA * 0.06));
    grad.addColorStop(1,    'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
    ctx.fill();

    // Glow ring on the ripple edge
    const ringWidth = 2 + glowIntensity * 7;
    const ringAlpha = 0.1 + glowIntensity * 0.5;
    ctx.strokeStyle = rgba(...HONEY_AMBER, ringAlpha);
    ctx.lineWidth = ringWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Second accent ring slightly inward (softer)
    ctx.strokeStyle = rgba(...SOFT_PEACH, ringAlpha * 0.4);
    ctx.lineWidth = ringWidth * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, rippleRadius * 0.9, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Freeze-frame glow: distinctive bloom when frozen ──────────────────
  if (state === STATE.FREEZE) {
    const freezeElapsed = now - freezeStart;
    const freezeProgress = freezeElapsed / FREEZE_MAX_MS;

    // Pulsing glow that intensifies slightly over the hold
    const pulse = 0.15 + Math.sin(t * 0.005) * 0.03 + freezeProgress * 0.1;
    const freezeGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rippleRadius * 1.3);
    freezeGrad.addColorStop(0,   rgba(...WARM_CREAM, pulse));
    freezeGrad.addColorStop(0.3, rgba(...HONEY_AMBER, pulse * 0.6));
    freezeGrad.addColorStop(0.7, rgba(...SOFT_PEACH,  pulse * 0.2));
    freezeGrad.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = freezeGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, rippleRadius * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  // ── Center dot with warm glow ────────────────────────────────────────
  const dotR = 5 + glowIntensity * 18;
  const dotGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dotR);
  dotGrad.addColorStop(0, rgba(...WARM_CREAM, 0.4 + glowIntensity * 0.6));
  dotGrad.addColorStop(0.5, rgba(...HONEY_AMBER, 0.15 + glowIntensity * 0.3));
  dotGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dotGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Main Loop ─────────────────────────────────────────────────────────────
let lastTime = 0;

function loop(ts) {
  const delta = ts - lastTime;
  lastTime = ts;

  drawRipple(ts);

  requestAnimationFrame(loop);
}

requestAnimationFrame((ts) => {
  lastTime = ts;
  loop(ts);
});
