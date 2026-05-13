// ============================================================
// Lunar Rhythm Garden
// A moonlit garden that grows to the moon's pulse
// Tap stems to bloom · Hold for glow
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// --- Canvas sizing ---
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ============================================================
// DOM helpers
// ============================================================
const el = {
  title: document.getElementById('title-screen'),
  phaseIcon: document.getElementById('phase-icon'),
  phaseName: document.getElementById('phase-name'),
  rhythmPulse: document.getElementById('rhythm-pulse'),
  hintBar: document.getElementById('hint-bar'),
};

// ============================================================
// Moon phases
// ============================================================
const MOON_PHASES = [
  { name: 'New Moon',        icon: '\u{1F311}', freq: 0.4 },
  { name: 'Waxing Crescent', icon: '\u{1F312}', freq: 0.7 },
  { name: 'First Quarter',   icon: '\u{1F313}', freq: 1.0 },
  { name: 'Waxing Gibbous',  icon: '\u{1F314}', freq: 1.4 },
  { name: 'Full Moon',       icon: '\u{1F315}', freq: 1.8 },
  { name: 'Waning Gibbous',  icon: '\u{1F316}', freq: 0.9 },
  { name: 'Last Quarter',    icon: '\u{1F317}', freq: 0.6 },
  { name: 'Waning Crescent', icon: '\u{1F318}', freq: 0.3 },
];

let moonPhase = 0;
let moonTime = 0;
const MOON_CYCLE = 12000;
let moonX = 0, moonY = 0;

// Stable moon crater positions (generated once, not per frame)
const moonCraters = [];
for (let i = 0; i < 4; i++) {
  moonCraters.push({
    cx: (Math.random() - 0.5) * 19,
    cy: (Math.random() - 0.5) * 17,
    r: 1.5 + Math.random() * 2.5,
  });
}

// ============================================================
// Garden state
// ============================================================
let titleVisible = true;
let gardenStarted = false;

const stems = [];
const MAX_STEMS = 24;
let stemTimer = 0;
const STEM_SPACING = 600;

const sparkles = [];
const MAX_SPARKLES = 60;

const groundPlants = [];
const MAX_GROUND = 120;

// ============================================================
// Audio engine
// ============================================================
let audioCtx = null;
let masterGain = null;
let ambientGain = null;
let audioStarted = false;

function initAudio() {
  if (audioStarted) return;
  audioStarted = true;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    audioCtx = null;
    return;
  }
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.2;
  masterGain.connect(audioCtx.destination);
  startAmbientPad();
}

function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function startAmbientPad() {
  if (!audioCtx) return;
  const baseFreqs = [130.81, 196.00, 246.94, 329.63, 392.00];
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  filter.Q.value = 0.8;
  filter.connect(masterGain);

  ambientGain = audioCtx.createGain();
  ambientGain.gain.value = 0;
  ambientGain.connect(filter);

  const oscillators = [];
  for (const f of baseFreqs) {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f + (Math.random() - 0.5) * 2;
    osc.connect(ambientGain);
    osc.start();
    oscillators.push(osc);
  }

  // Gentle random detune every 2.5s
  const detuneInterval = setInterval(function () {
    if (!audioCtx) { clearInterval(detuneInterval); return; }
    for (let i = 0; i < oscillators.length && i < baseFreqs.length; i++) {
      osc = oscillators[i];
      if (osc && osc.frequency) {
        osc.frequency.value = baseFreqs[i] + (Math.random() - 0.5) * 3;
      }
    }
  }, 2500);

  // eslint-disable-next-line no-unused-vars
  var osc; // avoid strict mode error

  ambientGain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 6);
}

function playBloomChime(freq, intensity) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const dur = 0.25 + intensity * 0.35;

  const harmonics = [1, 2.01, 3.0, 4.02];
  for (const mult of harmonics) {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    const amp = 0.015 * intensity / Math.sqrt(mult);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + dur);
  }

  // Noise burst
  const sr = audioCtx.sampleRate;
  const burstLen = Math.floor(sr * 0.05);
  const buf = audioCtx.createBuffer(1, burstLen, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < burstLen; i++) {
    d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.015)) * 0.01 * intensity;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gn = audioCtx.createGain();
  gn.gain.value = 0.25;
  src.connect(gn);
  gn.connect(masterGain);
  src.start(now);
}

// ============================================================
// Rhythm pulse
// ============================================================
let rhythmTime = 0;
let rhythmInterval = 3000;

function onRhythmPulse() {
  if (el.rhythmPulse) {
    el.rhythmPulse.classList.add('active');
    setTimeout(function () {
      if (el.rhythmPulse) el.rhythmPulse.classList.remove('active');
    }, 600);
  }

  for (const s of stems) {
    s.wobbleTarget = 1 + Math.random() * 0.25;
    s.bloomLevel = Math.min(s.bloomLevel + 0.08, 1);
  }

  if (stems.length > 0 && audioStarted) {
    const idx = Math.floor(Math.random() * stems.length);
    playBloomChime(stems[idx].pitch, 0.25);
  }
}

function updateMoon(dt) {
  moonTime += dt * 1000;
  const cyclePos = (moonTime % MOON_CYCLE) / MOON_CYCLE;
  moonPhase = Math.floor(cyclePos * 8) % 8;

  const angle = cyclePos * Math.PI - Math.PI / 2;
  const radius = H * 0.35;
  moonX = W * 0.5 + Math.cos(angle) * radius;
  moonY = H * 0.35 + Math.sin(angle) * radius * 0.45;

  if (el.phaseIcon) {
    const pct = (moonPhase + 1) * 12.5;
    el.phaseIcon.style.background =
      'radial-gradient(circle, #d4c5f0 ' + pct + '%, #050510 ' + (pct + 5) + '%)';
  }
  if (el.phaseName) {
    el.phaseName.textContent = MOON_PHASES[moonPhase].name;
  }

  const freq = MOON_PHASES[moonPhase].freq;
  rhythmInterval = Math.max(400, 2800 - freq * 1400);

  stemTimer += dt * 1000;
  if (stemTimer >= STEM_SPACING && stems.length < MAX_STEMS) {
    stemTimer = 0;
    spawnStem();
  }

  rhythmTime += dt * 1000;
  if (rhythmTime >= rhythmInterval) {
    rhythmTime = 0;
    onRhythmPulse();
  }
}

// ============================================================
// Stems
// ============================================================
function spawnStem(x, y) {
  const gx = x !== undefined ? x : W * (0.15 + Math.random() * 0.7);
  const gy = y !== undefined ? y : H * (0.5 + Math.random() * 0.35);

  const roll = Math.random();
  const type = roll < 0.35 ? 'flower' : roll < 0.6 ? 'leaf' : 'spike';
  const palette = {
    flower: ['#d4c5f0', '#c084fc', '#a78bfa', '#e0d4ff'],
    leaf:   ['#6eaa8f', '#5dbf8f', '#7cde97', '#a8e6cf'],
    spike:  ['#fcd9a0', '#fed7aa', '#fbbf8f', '#f59e0b'],
  };
  const hue = Math.floor(Math.random() * 4);
  const color = palette[type][hue];

  stems.push({
    x: gx, y: gy,
    height: 0,
    maxHeight: 50 + Math.random() * 70,
    grow: 0,
    type: type,
    color: color,
    petalCount: type === 'flower' ? 5 + Math.floor(Math.random() * 4) : 0,
    pitch: 220 + Math.random() * 440,
    wobble: Math.random() * Math.PI * 2,
    wobbleTarget: 1,
    baseWobble: Math.random() * 3 + 1.5,
    bloomLevel: 0.1 + Math.random() * 0.25,
    glow: 0,
    touched: false,
    touchTime: 0,
    stemWidth: 2 + Math.random() * 2,
  });

  for (let i = 0; i < 3; i++) {
    if (groundPlants.length >= MAX_GROUND) break;
    groundPlants.push({
      x: gx + (Math.random() - 0.5) * 50,
      y: gy + 3 + Math.random() * 5,
      size: 2 + Math.random() * 4,
      color: 'hsl(' + (120 + Math.random() * 40) + ',' + (30 + Math.random() * 40) + '%,' + (20 + Math.random() * 25) + '%)',
      sway: Math.random() * Math.PI * 2,
    });
  }

  if (audioStarted) {
    playBloomChime(stems[stems.length - 1].pitch, 0.1);
  }
}

function updateStems(dt) {
  for (const s of stems) {
    if (s.grow < 1) {
      s.grow += dt * (0.2 + s.bloomLevel * 0.08);
      s.height = s.maxHeight * smoothStep(s.grow);
    }

    s.wobble += dt * s.baseWobble;

    if (s.touched) {
      s.touchTime += dt;
      if (s.touchTime > 2) {
        s.touched = false;
        s.touchTime = 0;
      }
      s.glow = Math.max(s.glow, 0.7);
    }
    s.glow *= 0.94;

    s.bloomLevel = Math.max(0.05, Math.min(1,
      s.bloomLevel + Math.sin(s.wobble * 0.3 + moonPhase) * 0.004
    ));
  }
}

function smoothStep(t) {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

function drawStem(s) {
  const h = s.height;
  if (h < 2) return;

  const wobble = s.wobbleTarget * 3 * Math.sin(s.wobble);
  const glow = Math.min(s.glow * 0.35, 0.5);
  const bloom = Math.max(0.05, s.bloomLevel);

  ctx.save();
  ctx.translate(s.x, s.y);

  const tipX = wobble;
  const tipY = -h;
  const grad = ctx.createLinearGradient(0, 0, 0, tipY);
  grad.addColorStop(0, shadeColor(s.color, -25));
  grad.addColorStop(1, s.color);
  ctx.strokeStyle = grad;
  ctx.lineWidth = s.stemWidth * (0.5 + 0.5 * bloom);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  const topSize = 6 + 7 * bloom;

  if (s.type === 'flower') {
    const petalLen = topSize * 1.1;
    for (let i = 0; i < s.petalCount; i++) {
      const a = (i / s.petalCount) * Math.PI * 2 + s.wobble * 0.08;
      ctx.beginPath();
      ctx.ellipse(
        tipX + Math.cos(a) * petalLen * 0.55,
        tipY + Math.sin(a) * petalLen * 0.35,
        petalLen * 0.45, petalLen * 0.45,
        a, 0, Math.PI * 2
      );
      ctx.fillStyle = 'rgba(212, 197, 240, ' + (0.25 + bloom * 0.35) + ')';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(tipX, tipY, topSize * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 245, 230, ' + (0.35 + bloom * 0.45) + ')';
    ctx.fill();
  } else if (s.type === 'leaf') {
    for (let s2 = -1; s2 <= 1; s2 += 2) {
      ctx.beginPath();
      ctx.ellipse(
        tipX + s2 * topSize * 0.55,
        tipY - topSize * 0.25,
        topSize * 0.45, topSize * 0.25,
        s2 * 0.4, 0, Math.PI * 2
      );
      ctx.fillStyle = shadeColor(s.color, 10 + Math.round(glow * 20));
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(tipX - topSize * 0.2, tipY);
    ctx.lineTo(tipX, tipY - topSize * 1.2);
    ctx.lineTo(tipX + topSize * 0.2, tipY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(252, 217, 160, ' + (0.35 + bloom * 0.5) + ')';
    ctx.fill();
  }

  if (glow > 0.02) {
    const gr = ctx.createRadialGradient(tipX, tipY, 2, tipX, tipY, 18 * glow);
    gr.addColorStop(0, 'rgba(196, 132, 252, ' + (glow * 0.45) + ')');
    gr.addColorStop(1, 'rgba(196, 132, 252, 0)');
    ctx.beginPath();
    ctx.arc(tipX, tipY, 18 * glow, 0, Math.PI * 2);
    ctx.fillStyle = gr;
    ctx.fill();
  }

  ctx.restore();
}

function shadeColor(color, percent) {
  if (!color || color.charAt(0) !== '#') return color || '#fff';
  const num = parseInt(color.slice(1), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, Math.max(0, (num >> 16) + amt));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amt));
  const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
  return 'rgb(' + R + ',' + G + ',' + B + ')';
}

// ============================================================
// Ground plants
// ============================================================
function drawGround() {
  for (const g of groundPlants) {
    g.sway += 0.003;
    const sway = Math.sin(g.sway) * 2;
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(g.x + sway, g.y, g.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================
// Sparkles
// ============================================================
function spawnBloom(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 18 + Math.random() * 35;
    sparkles.push({
      x: x + (Math.random() - 0.5) * 5,
      y: y + (Math.random() - 0.5) * 5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 8,
      life: 1,
      decay: 0.018 + Math.random() * 0.018,
      size: 2 + Math.random() * 3,
      color: color,
    });
  }
  if (sparkles.length > MAX_SPARKLES) {
    sparkles.splice(0, sparkles.length - MAX_SPARKLES);
  }
}

function drawSparkles(dt) {
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const sp = sparkles[i];
    sp.x += sp.vx * dt;
    sp.y += sp.vy * dt;
    sp.vy += 35 * dt;
    sp.life -= sp.decay;

    if (sp.life <= 0) {
      sparkles.splice(i, 1);
      continue;
    }

    const alpha = sp.life * 0.55;
    const rgba = sp.color.replace('rgb', 'rgba').replace(')', ', ' + alpha + ')');
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.size * sp.life, 0, Math.PI * 2);
    ctx.fillStyle = rgba;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sp.x, sp.y, sp.size * 2 * sp.life, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(196, 132, 252, ' + (alpha * 0.12) + ')';
    ctx.fill();
  }
}

// ============================================================
// Fireflies
// ============================================================
const fireflies = [];
for (let i = 0; i < 18; i++) {
  fireflies.push({
    x: Math.random() * W,
    y: H * (0.3 + Math.random() * 0.55),
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.08,
    flicker: Math.random() * Math.PI * 2,
    flickerSpeed: 0.7 + Math.random() * 1.2,
    size: 2 + Math.random() * 2,
  });
}

function drawFireflies(dt) {
  for (const f of fireflies) {
    f.flicker += dt * f.flickerSpeed;
    f.x += f.vx * dt * 60;
    f.y += f.vy * dt * 60;

    if (f.x < -10) f.x = W + 10;
    if (f.x > W + 10) f.x = -10;
    if (f.y < H * 0.25) f.y = H * 0.7;
    if (f.y > H * 0.88) f.y = H * 0.35;

    const flicker = 0.5 + 0.5 * Math.sin(f.flicker);
    const alpha = 0.25 + 0.45 * flicker;

    ctx.beginPath();
    ctx.arc(f.x, f.y, f.size * (0.4 + 0.6 * flicker), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(212, 197, 240, ' + (alpha * 0.35) + ')';
    ctx.fill();

    if (alpha > 0.55) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.size * 2 * alpha, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(196, 132, 252, ' + (alpha * 0.08) + ')';
      ctx.fill();
    }
  }
}

// ============================================================
// Stars
// ============================================================
const stars = [];
for (let i = 0; i < 120; i++) {
  stars.push({
    x: Math.random() * W,
    y: Math.random() * H * 0.55,
    size: 0.5 + Math.random() * 1.2,
    twinkle: Math.random() * Math.PI * 2,
    twinkleSpeed: 0.4 + Math.random() * 1.5,
  });
}

function drawSky() {
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  grad.addColorStop(0, '#03030f');
  grad.addColorStop(0.5, '#0a0a20');
  grad.addColorStop(1, '#12122e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H * 0.55);
}

function drawStars() {
  for (const s of stars) {
    s.twinkle += 0.016 * s.twinkleSpeed;
    const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(s.twinkle));
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(212, 197, 240, ' + alpha + ')';
    ctx.fill();
  }
}

function drawMoon() {
  const R = 38;
  const mr = R * 3;

  // Ambient glow
  const glow = ctx.createRadialGradient(moonX, moonY, R * 0.3, moonX, moonY, mr);
  glow.addColorStop(0, 'rgba(212, 197, 240, 0.12)');
  glow.addColorStop(1, 'rgba(212, 197, 240, 0)');
  ctx.beginPath();
  ctx.arc(moonX, moonY, mr, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Moon disc
  ctx.beginPath();
  ctx.arc(moonX, moonY, R, 0, Math.PI * 2);
  ctx.fillStyle = '#d4c5f0';
  ctx.fill();

  // Phase shadow
  const shadowAngle = (moonPhase / 8) * Math.PI * 2;
  const sx = moonX + Math.cos(shadowAngle) * R * 0.55;
  const sy = moonY + Math.sin(shadowAngle) * R * 0.25;
  ctx.beginPath();
  ctx.arc(sx, sy, R * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(5, 5, 16, 0.55)';
  ctx.fill();

  // Stable craters
  for (const c of moonCraters) {
    ctx.beginPath();
    ctx.arc(moonX + c.cx, moonY + c.cy, c.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 190, 220, 0.15)';
    ctx.fill();
  }
}

// ============================================================
// Terrain
// ============================================================
function drawTerrain(groundY) {
  const grad = ctx.createLinearGradient(0, groundY, 0, H);
  grad.addColorStop(0, '#1a1a30');
  grad.addColorStop(0.3, '#161628');
  grad.addColorStop(1, '#0d0d1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, groundY, W, H - groundY);

  ctx.strokeStyle = 'rgba(30, 50, 40, 0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 3) {
    const grassH = 7 + Math.sin(x * 0.05 + moonTime * 0.00025) * 3;
    const y = groundY + grassH;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ============================================================
// Interaction
// ============================================================
function handleTap(x, y) {
  initAudio();
  resumeAudio();

  if (titleVisible) {
    titleVisible = false;
    gardenStarted = true;
    if (el.title) el.title.classList.add('hidden');
    for (let i = 0; i < 6; i++) {
      setTimeout(function () { spawnStem(); }, i * 280);
    }
    return;
  }

  let closest = null;
  let closestDist = Infinity;
  for (const s of stems) {
    if (s.grow < 0.5) continue;
    const dx = x - s.x;
    const dy = y - s.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < closestDist && d < 80) {
      closest = s;
      closestDist = d;
    }
  }

  if (closest) {
    closest.touched = true;
    closest.touchTime = 0;
    closest.bloomLevel = Math.min(closest.bloomLevel + 0.35, 1);
    closest.glow = 1;
    spawnBloom(closest.x, closest.y, 'rgba(196, 132, 252, 0.6)', 7);
    if (audioStarted) playBloomChime(closest.pitch, 0.55);
  } else {
    spawnStem(x, y);
    if (audioStarted && stems.length > 0) {
      playBloomChime(stems[stems.length - 1].pitch, 0.25);
    }
  }
}

canvas.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  handleTap(e.clientX, e.clientY);
});

canvas.addEventListener('touchstart', function (e) {
  e.preventDefault();
  for (const t of e.touches) {
    handleTap(t.clientX, t.clientY);
    break;
  }
}, { passive: false });

// ============================================================
// Main loop
// ============================================================
let lastTs = 0;

function frame(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  if (!lastTs) lastTs = ts;

  ctx.clearRect(0, 0, W, H);

  drawSky();
  drawStars();
  drawMoon();

  const groundY = H * 0.65;
  drawTerrain(groundY);
  drawGround();

  updateMoon(dt);
  updateStems(dt);

  const sorted = [...stems].sort(function (a, b) { return a.y - b.y; });
  for (const s of sorted) drawStem(s);

  drawFireflies(dt);
  drawSparkles(dt);

  if (gardenStarted && el.hintBar) {
    el.hintBar.style.opacity = '0';
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// ============================================================
// Accessibility
// ============================================================
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.style.setProperty('--reduce-motion', 'true');
}
