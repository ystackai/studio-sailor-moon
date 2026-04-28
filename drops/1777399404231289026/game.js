// ============================================================
// Honey Drop — Core Interactive Object
// Normalized 0‑1 pressure → haptic intensity + melt shader glow
// 70% threshold heartbeat pulse — pre‑rendered decay envelope
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// --- Canvas sizing (60fps target, cap blur kernel to 3x) ---
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// --- Normalized pressure state (0‑1 API, raw coordinates rejected) ---
let pressure = 0;
let active = false;
let heartbeatFired = false;
const THRESHOLD = 0.7;

// --- Decay envelope state ---
let inDecay = false;
let decayT = 0;
const DECAY_DURATION = 1.8;

// --- Particles (honey droplets) ---
const particles = [];
const MAX_PARTICLES = 30;

// --- Haptic / Vibration API ---
function triggerHaptic(ms) {
  if (navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

// --- Audio Engine (pre‑rendered buffers, phone‑speaker optimized) ---
let audioCtx = null;
let ambientPad = null;
let padGain = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Generate a pre‑rendered tone buffer (frequency, duration, type, rolloff)
function createToneBuffer(freq, dur, type) {
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * dur);
  const buf = audioCtx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.min(1, t * 40) * Math.exp(-(((t - dur * 0.3) / (dur * 0.6)) ** 2));
      const noise = (Math.random() * 2 - 1) * 0.005;
      d[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.35 + noise;
    }
  }
  return buf;
}

// Generate a soft click buffer for squeeze onset
function createClickBuffer() {
  const sr = audioCtx.sampleRate;
  const dur = 0.08;
  const len = Math.floor(sr * dur);
  const buf = audioCtx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t / 0.015);
      d[i] = (Math.random() * 2 - 1) * env * 0.2 + Math.sin(2 * Math.PI * 800 * t) * env * 0.15;
    }
  }
  return buf;
}

// Generate decay "drip" buffer matching decay envelope
function createDripBuffer() {
  const sr = audioCtx.sampleRate;
  const dur = DECAY_DURATION;
  const len = Math.floor(sr * dur);
  const buf = audioCtx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t / (DECAY_DURATION * 0.5));
      const noise = (Math.random() * 2 - 1) * 0.003;
      d[i] = Math.sin(2 * Math.PI * 340 * t) * env * 0.2 +
             Math.sin(2 * Math.PI * 520 * t) * env * 0.1 +
             noise;
    }
  }
  return buf;
}

// Generate ambient pad buffer (warm, slow‑attack, C minor / G major, 60bpm pulse)
function createPadBuffer() {
  const sr = audioCtx.sampleRate;
  const dur = 2.0;
  const len = Math.floor(sr * dur);
  const buf = audioCtx.createBuffer(2, len, sr);
  const chords = [130.81, 155.56, 196.00, 261.63];
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const attack = Math.min(1, t * 0.8);
      const pulse = (Math.sin(2 * Math.PI * (60 / 60) * t) + 1) * 0.5;
      let s = 0;
      for (const f of chords) {
        s += Math.sin(2 * Math.PI * f * t) * 0.12;
      }
      const noise = (Math.random() * 2 - 1) * 0.002;
      d[i] = s * attack * (0.7 + 0.3 * pulse) + noise;
    }
  }
  return buf;
}

let heartbeatBuffer = null;
let clickBuffer = null;
let dripBuffer = null;

function initBuffers() {
  if (!audioCtx) return;
  heartbeatBuffer = createToneBuffer(120, 0.4, 'sine');
  clickBuffer   = createClickBuffer();
  dripBuffer    = createDripBuffer();
}

function playSource(buf) {
  if (!audioCtx || !buf) return;
  const src = audioCtx.createBufferSource();
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 150;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 8000;
  const g = audioCtx.createGain();
  g.gain.value = 0.6;
  src.connect(hp);
  hp.connect(lp);
  lp.connect(g);
  g.connect(audioCtx.destination);
  src.buffer = buf;
  src.start(0);
  return src;
}

// Start ambient pad loop
function startAmbientPad() {
  if (!audioCtx) return;
  const padBuf = createPadBuffer();
  const src = audioCtx.createBufferSource();
  src.buffer = padBuf;
  src.loop = true;
  const hp = audioCtx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 150;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 8000;
  padGain = audioCtx.createGain();
  padGain.gain.value = 0.08;
  src.connect(hp);
  hp.connect(lp);
  lp.connect(padGain);
  padGain.connect(audioCtx.destination);
  src.start(0);
  ambientPad = src;
}

// --- Drawing helpers ---
function dropRadius() {
  return Math.min(W, H) * 0.22;
}

function dropCenter() {
  return { x: W / 2, y: H / 2 };
}

// --- Honey‑like melt shader (2D canvas approximation, blur capped at 3x) ---
function drawDrop(p, dt) {
  const c = dropCenter();
  const r = dropRadius();

  // Breathing / heartbeat scale
  let scale = 1;
  let glowIntensity = p;

  // Heartbeat visual pulse
  if (p >= THRESHOLD || inDecay) {
    const beatPhase = Math.sin(performance.now() / 300 * Math.PI * 2);
    const beatStrength = inDecay ? Math.exp(-decayT / DECAY_DURATION * 3) : 0.25;
    scale = 1 + beatPhase * beatStrength * 0.08;
    glowIntensity = Math.max(glowIntensity, beatPhase * beatStrength * 0.5);
  }

  const cr = r * scale;

  // Glow layers (max 3 kernel passes, capped for 60fps stability)
  const glowPasses = Math.min(3, 1 + Math.floor(glowIntensity * 3));
  for (let g = glowPasses; g >= 1; g--) {
    const gr = cr * (1 + g * 0.35 * glowIntensity);
    const alpha = 0.06 * glowIntensity * (glowPasses - g + 1) / glowPasses;
    const grad = ctx.createRadialGradient(c.x, c.y, cr * 0.2, c.x, c.y, gr);
    grad.addColorStop(0, `rgba(255, 191, 60, ${alpha})`);
    grad.addColorStop(0.5, `rgba(220, 150, 40, ${alpha * 0.5})`);
    grad.addColorStop(1, 'rgba(220, 150, 40, 0)');
    ctx.beginPath();
    ctx.arc(c.x, c.y, gr, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Main drop body — organic rounded shape
  const bodyGrad = ctx.createRadialGradient(c.x - cr * 0.2, c.y - cr * 0.2, cr * 0.05, c.x, c.y, cr);
  bodyGrad.addColorStop(0, '#ffe099');
  bodyGrad.addColorStop(0.4, '#ffb533');
  bodyGrad.addColorStop(0.75, '#c4781a');
  bodyGrad.addColorStop(1, '#1a1028');

  // Viscous distortion: slight wobble proportional to pressure
  const wobble = Math.sin(performance.now() / 200) * p * 6;

  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(1 + wobble * 0.002, 1 - wobble * 0.0015);

  // Draw organic drop shape using bezier curves
  ctx.beginPath();
  const k = cr;
  ctx.moveTo(0, -k * 1.3);
  ctx.bezierCurveTo(k * 0.8, -k * 1.1, k * 1.0, -k * 0.3, k * 0.9, k * 0.3);
  ctx.bezierCurveTo(k * 0.7, k * 1.1, -k * 0.7, k * 1.1, -k * 0.9, k * 0.3);
  ctx.bezierCurveTo(-k * 1.0, -k * 0.3, -k * 0.8, -k * 1.1, 0, -k * 1.3);
  ctx.closePath();

  // Shadow / moonlit indigo tint
  ctx.shadowColor = 'rgba(60, 40, 100, 0.6)';
  ctx.shadowBlur = 20 + p * 30;
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Highlight
  const hl = ctx.createRadialGradient(-k * 0.25, -k * 0.5, 0, -k * 0.25, -k * 0.5, k * 0.5);
  hl.addColorStop(0, 'rgba(255, 240, 200, 0.6)');
  hl.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.fillStyle = hl;
  ctx.fill();

  ctx.restore();

  // Melt shader glow: amber bloom ring, intensity = pressure
  if (p > 0.05) {
    const bloomR = cr * (1.1 + p * 0.5);
    const bloom = ctx.createRadialGradient(c.x, c.y, cr * 0.9, c.x, c.y, bloomR);
    bloom.addColorStop(0, `rgba(255, 180, 50, ${p * 0.35})`);
    bloom.addColorStop(0.6, `rgba(240, 140, 30, ${p * 0.15})`);
    bloom.addColorStop(1, 'rgba(240, 140, 30, 0)');
    ctx.beginPath();
    ctx.arc(c.x, c.y, bloomR, 0, Math.PI * 2);
    ctx.fillStyle = bloom;
    ctx.fill();
  }

  // Particles: honey‑like droplets
  updateAndDrawParticles(p, dt);
}

// --- Particle system ---
function spawnParticle(p) {
  if (particles.length >= MAX_PARTICLES) return;
  const c = dropCenter();
  const r = dropRadius() * (1 + p * 0.3);
  const angle = Math.random() * Math.PI * 2;
  const dist = r * (0.6 + Math.random() * 0.6);
  particles.push({
    x: c.x + Math.cos(angle) * dist,
    y: c.y + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 30 * p,
    vy: (Math.random() - 0.5) * 20 + 15,
    life: 1,
    size: 2 + Math.random() * 4 * p,
    hue: 35 + Math.random() * 15,
  });
}

function updateAndDrawParticles(p, dt) {
  if (p > 0.2 && Math.random() < p * 0.15) {
    spawnParticle(p);
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 12 * dt;
    pt.life -= dt * 0.6;

    if (inDecay) {
      pt.life -= dt * 0.4;
    }

    if (pt.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    const alpha = pt.life * 0.6;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${pt.hue}, 85%, 65%, ${alpha})`;
    ctx.fill();
  }
}

// --- Touch / Mouse handlers with normalized 0‑1 pressure ---
function getPressure(e) {
  if (e.touches && e.touches.length > 0) {
    const t = e.touches[0];
    return t.force !== undefined ? Math.min(1, t.force) : 0.5;
  }
  return 1;
}

function handleStart(e) {
  e.preventDefault();
  ensureAudioCtx();
  if (!heartbeatBuffer) initBuffers();

  if (!ambientPad) startAmbientPad();

  active = true;
  heartbeatFired = false;
  inDecay = false;

  const p = getPressure(e);
  pressure = p;

  // Squeeze onset: soft click + haptic
  playSource(clickBuffer);
  triggerHaptic(15);
}

function handleMove(e) {
  if (!active) return;
  e.preventDefault();
  const p = getPressure(e);
  pressure = p;

  // 70% threshold heartbeat trigger
  if (p >= THRESHOLD && !heartbeatFired) {
    heartbeatFired = true;
    onHeartbeat();
  }
}

function handleEnd(e) {
  if (!active) return;
  active = false;

  // Trigger pre‑rendered decay envelope
  startDecay();
}

function onHeartbeat() {
  // 120Hz thrum audio synced to haptic motor + shader glow peak
  playSource(heartbeatBuffer);
  triggerHaptic(300);
  if (padGain) {
    const now = audioCtx.currentTime;
    padGain.gain.cancelScheduledValues(now);
    padGain.gain.setValueAtTime(0.2, now);
    padGain.gain.exponentialRampToValueAtTime(0.08, now + 0.5);
  }
}

function startDecay() {
  inDecay = true;
  decayT = 0;

  // Pre‑rendered drip/drop sound matching decay envelope
  playSource(dripBuffer);

  // Soft haptic release pulse
  triggerHaptic(80);

  // Fade ambient pad
  if (padGain) {
    const now = audioCtx.currentTime;
    padGain.gain.cancelScheduledValues(now);
    padGain.gain.setValueAtTime(padGain.gain.value, now);
    padGain.gain.exponentialRampToValueAtTime(0.01, now + DECAY_DURATION);
  }
}

// Mouse fallback for dev testing
canvas.addEventListener('mousedown', (e) => handleStart(e));
canvas.addEventListener('mousemove', (e) => { if (active) handleMove(e); });
canvas.addEventListener('mouseup', () => handleEnd());
canvas.addEventListener('mouseleave', () => { if (active) handleEnd(); });

// Touch events
canvas.addEventListener('touchstart', handleStart, { passive: false });
canvas.addEventListener('touchmove',  handleMove,  { passive: false });
canvas.addEventListener('touchend',   handleEnd,   { passive: false });
canvas.addEventListener('touchcancel', handleEnd, { passive: false });

// --- Main render loop (targets 60fps, blur capped at 3x) ---
let lastTs = 0;

function frame(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;

  // Background: moonlit indigo gradient
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0a0a1a');
  bg.addColorStop(0.5, '#111128');
  bg.addColorStop(1, '#161630');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Update pressure during decay
  if (inDecay) {
    decayT += dt;
    const progress = decayT / DECAY_DURATION;
    if (progress >= 1) {
      // Soft noise floor: never hard‑cut, maintain minimum intensity
      pressure = 0.005;
      inDecay = false;
    } else {
      // Exponential decay with soft noise floor (-60dB ≈ 0.001)
      pressure = Math.exp(-progress * 4) + 0.001;
    }
  }

  drawDrop(pressure, dt);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
