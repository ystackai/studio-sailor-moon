// ─── Device Detection ───────────────────────────────────────────────
const isMobile =
  /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);

// ─── State Machine Constants ─────────────────────────────────────────
const STATE = {
  IDLE: 'idle',
  ATTACK: 'attack',
  FREEZE: 'freeze',
  MELT: 'melt',
};

const FREEZE_MAX_MS = 2500;
const CROSSFADE_MS = 40;

// ─── Canvas Setup ────────────────────────────────────────────────────
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

// ─── Audio Engine ────────────────────────────────────────────────────
let audioCtx = null;
let masterGain = null;
let oscillators = [];
let lpfNode = null;
let crossfadeGain = null;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;

    // Low-pass filter for the melter
    lpfNode = audioCtx.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = 8000;
    lpfNode.Q.value = 0.7;

    // Crossfade buffer gain node
    crossfadeGain = audioCtx.createGain();
    crossfadeGain.gain.value = 1;

    masterGain.connect(lpfNode);
    lpfNode.connect(crossfadeGain);
    crossfadeGain.connect(audioCtx.destination);

    // Procedural ambient pad oscillators (A minor with extended harmonics)
    const frequencies = [220, 329.63, 440, 493.88, 659.25]; // A3, E4, A4, B4, E5
    frequencies.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();

      // Mix sine and triangle for warmth
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;

      // Slight detune for organic feel
      osc.detune.value = (Math.random() - 0.5) * 8;

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

function setAmplitude(t, target, duration) {
  const now = audioCtx.currentTime + t;
  masterGain.gain.setTargetAtTime(target, now, duration);
}

function setLpf(t, freq, duration) {
  const now = audioCtx.currentTime + t;
  lpfNode.frequency.setTargetAtTime(freq, now, duration);
}

function startCrossfade() {
  if (!crossfadeGain) return;
  crossfadeGain.gain.cancelScheduledValues(audioCtx.currentTime);
  crossfadeGain.gain.setValueAtTime(crossfadeGain.gain.value, audioCtx.currentTime);
  crossfadeGain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + CROSSFADE_MS / 1000);
}

function stopCrossfade() {
  if (!crossfadeGain) return;
  crossfadeGain.gain.cancelScheduledValues(audioCtx.currentTime);
  crossfadeGain.gain.setValueAtTime(crossfadeGain.gain.value, audioCtx.currentTime);
  crossfadeGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + CROSSFADE_MS / 1000);
}

// ─── Interaction State ───────────────────────────────────────────────
let state = STATE.IDLE;
let amplitude = 0;
let holdStart = 0;
let freezeStart = 0;
let pressActive = false;

// Visual ripple parameters
let rippleRadius = 0;
let rippleTarget = 0;
let glowIntensity = 0;

// ─── Input Handling ──────────────────────────────────────────────────
function onDown(e) {
  e.preventDefault();
  ensureAudio();
  pressActive = true;

  if (state === STATE.IDLE || state === STATE.MELT) {
    // Logarithmic attack ramp
    state = STATE.ATTACK;
    holdStart = performance.now();
    rippleRadius = 0;
    startCrossfade();

    // Ramp amplitude with smooth attack curve
    const now = audioCtx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.setTargetAtTime(0.35, now, 0.08);

    // Open LPF
    lpfNode.frequency.cancelScheduledValues(now);
    lpfNode.frequency.setValueAtTime(8000, now);
  } else if (state === STATE.FREEZE) {
    // Trigger melt early
    triggerMelt();
  }
}

function onUp(e) {
  e.preventDefault();
  pressActive = false;

  if (state === STATE.ATTACK) {
    // Trigger freeze at current amplitude
    triggerFreeze();
  } else if (state === STATE.FREEZE) {
    triggerMelt();
  }
}

function triggerFreeze() {
  state = STATE.FREEZE;
  freezeStart = performance.now();
  rippleTarget = rippleRadius;

  // Smooth freeze: crossfade buffer to eliminate clicks
  const now = audioCtx.currentTime;
  // Hold amplitude steady with a tiny buffer to prevent pop
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
}

function triggerMelt() {
  state = STATE.MELT;
  stopCrossfade();

  const now = audioCtx.currentTime;
  const fadeTime = isMobile ? 1.8 : 0.9;
  const lpfTarget = isMobile ? 350 : 250;

  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.setValueAtTime(masterGain.gain.value, now);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + fadeTime);

  lpfNode.frequency.cancelScheduledValues(now);
  lpfNode.frequency.setValueAtTime(lpfNode.frequency.value, now);
  lpfNode.frequency.exponentialRampToValueAtTime(lpfTarget, now + fadeTime);

  // After freeze max or amplitude decay, return to idle
  setTimeout(() => {
    if (state === STATE.MELT) {
      state = STATE.IDLE;
      amplitude = 0;
      rippleRadius = 0;
      glowIntensity = 0;
    }
  }, fadeTime * 1000 + 100);
}

// Mouse + Touch
canvas.addEventListener('mousedown', onDown);
canvas.addEventListener('mouseup', onUp);
canvas.addEventListener('mouseleave', onUp);
canvas.addEventListener('touchstart', onDown, { passive: false });
canvas.addEventListener('touchend', onUp, { passive: false });
canvas.addEventListener('touchcancel', onUp, { passive: false });

// ─── Color Palette ───────────────────────────────────────────────────
const HONEY_AMBER = [255, 179, 71];   // warm amber glow
const SOFT_PEACH = [255, 183, 130];    // peach midtone
const WARM_CREAM = [255, 223, 173];    // cream highlight
const BG_COLOR = '#0a0e1a';             // dark moonlit

function hsla(r, g, b, a) {
  return `rgba(${r},${g},${b},${a})`;
}

// ─── Rendering ───────────────────────────────────────────────────────
function drawRipple(t) {
  const cx = CX();
  const cy = CY();
  const maxR = Math.min(W(), H()) * 0.35;

  // Update amplitude based on state
  if (state === STATE.ATTACK && pressActive) {
    const elapsed = performance.now() - holdStart;
    // Logarithmic amplitude ramp
    amplitude = Math.min(1, 1 - Math.exp(-elapsed / 600));
    rippleRadius = amplitude * maxR;
    glowIntensity = amplitude;
  } else if (state === STATE.FREEZE) {
    const freezeElapsed = performance.now() - freezeStart;
    if (freezeElapsed > FREEZE_MAX_MS) {
      triggerMelt();
    }
    // Slight micro-breathe during freeze for life
    rippleRadius = rippleTarget + Math.sin(t * 0.003) * 2 * amplitude;
    glowIntensity = amplitude;
  } else if (state === STATE.MELT) {
    // Ripple gently contracts during melt
    const meltProgress = Math.max(0, 1 - (rippleRadius / maxR));
    rippleRadius *= 0.997;
    glowIntensity *= 0.993;
    if (rippleRadius < 2) {
      rippleRadius = 0;
      glowIntensity = 0;
    }
  } else {
    // Idle: slight ambient pulse
    rippleRadius = maxR * 0.08 + Math.sin(t * 0.001) * 3;
    glowIntensity = 0.02;
    amplitude = 0;
  }

  // Clear
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, W(), H());

  // Outer glow halo
  if (glowIntensity > 0.01) {
    const haloR = rippleRadius * 1.8;
    const haloGrad = ctx.createRadialGradient(cx, cy, rippleRadius * 0.3, cx, cy, haloR);
    haloGrad.addColorStop(0, hsla(...WARM_CREAM, glowIntensity * 0.06));
    haloGrad.addColorStop(0.5, hsla(...SOFT_PEACH, glowIntensity * 0.03));
    haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haloGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Main ripple gradient
  if (rippleRadius > 1) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rippleRadius);

    // Core glow (honey amber)
    const coreAlpha = 0.15 + glowIntensity * 0.45;
    grad.addColorStop(0, hsla(...WARM_CREAM, coreAlpha));
    grad.addColorStop(0.25, hsla(...HONEY_AMBER, coreAlpha * 0.8));
    grad.addColorStop(0.55, hsla(...SOFT_PEACH, coreAlpha * 0.4));
    grad.addColorStop(0.8, hsla(...HONEY_AMBER, coreAlpha * 0.12));
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
    ctx.fill();

    // Ripple ring
    const ringWidth = 3 + glowIntensity * 6;
    ctx.strokeStyle = hsla(...HONEY_AMBER, 0.12 + glowIntensity * 0.4);
    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    ctx.arc(cx, cy, rippleRadius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Center dot with warm glow
  const dotR = 4 + glowIntensity * 12;
  const dotGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, dotR);
  dotGrad.addColorStop(0, hsla(...WARM_CREAM, 0.5 + glowIntensity * 0.5));
  dotGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dotGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Main Loop ───────────────────────────────────────────────────────
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
