// ============================================================
// Honey Drop — WebGL Melt Shader + Drop Rendering
// Normalized 0‑1 pressure → haptic intensity + melt shader glow
// 70% threshold heartbeat pulse — pre‑rendered decay envelope
// ============================================================

const canvas = document.getElementById('canvas');

// --- WebGL context setup ---
let gl = null;
let mainProgram = null;
let particleProgram = null;
let mainVAO = null;
let particleVAO = null;
let particleBuffer = null;

// Uniform locations
let uTime = null, uPressure = null, uResolution = null, uDecayT = null;
let uPMatrix = null;
let uPColor = null;

// --- Canvas sizing (60fps target) ---
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  if (gl) {
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
}
window.addEventListener('resize', resize);

// ============================================================
// SHADER SOURCES
// ============================================================

// --- Main pass: background + drop shape ---
const MAIN_VS = `
attribute vec2 aPos;
varying vec2 vUV;
void main() {
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const MAIN_FS = `
precision highp float;

varying vec2 vUV;
uniform float uTime;
uniform float uPressure;
uniform vec2 uResolution;
uniform float uDecayT;

// --- Noise helpers ---
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.0 + vec2(0.13, 0.27);
    a *= 0.5;
  }
  return v;
}

// --- Drop SDF: teardrop shape ---
float dropSDF(vec2 p, float melt) {
  vec2 q = p;
  
  // Melt deformation: the top stretches downward, bottom sags
  float meltX = sin(q.y * 3.0 + uTime * 1.5) * melt * 0.15;
  float meltY = cos(q.x * 2.5 + uTime * 1.2) * melt * 0.1;
  q += vec2(meltX, meltY);
  
  // Wobble breathing
  float wobble = sin(uTime * 3.0) * uPressure * 0.03;
  q.x *= 1.0 + wobble;
  q.y *= 1.0 - wobble * 0.5;
  
  // Teardrop shape SDF
  float r = length(q);
  float angle = atan(q.y, q.x);
  // Elongate upward
  float elongation = 0.35;
  float topPull = max(0.0, cos(angle)) * elongation;
  float d = r - 1.0 - topPull;
  
  // Smooth edges
  return d;
}

// --- Color palette ---
// Soft amber: (1.0, 0.71, 0.2)
// Warm cream: (1.0, 0.88, 0.6)  
// Moonlit indigo: (0.1, 0.06, 0.16)
// Amber glow: (1.0, 0.7, 0.2)

void main() {
  vec2 uv = vUV;
  
  // Aspect correction for drop center
  float aspect = uResolution.x / uResolution.y;
  vec2 normUV = (uv - 0.5) * vec2(aspect, 1.0);
  
  // Background: moonlit indigo gradient
  vec3 bgTop = vec3(0.04, 0.04, 0.1);   // deep indigo
  vec3 bgBot = vec3(0.09, 0.09, 0.19);   // lighter indigo
  vec3 bg = mix(bgBot, bgTop, pow(uv.y, 0.8));
  
  // Drop center in screen space
  vec2 dropCenter = vec2(0.0); // center
  vec2 toDrop = normUV - dropCenter;
  
  // Scale drop to screen
  float dropRadius = 0.18 * aspect; // relative to shorter dimension
  
  // Breathing scale
  float scale = 1.0;
  if (uPressure >= 0.7 || uDecayT > 0.0) {
    float beatPhase = sin(uTime * 2.0 / 0.3 * 3.14159 * 2.0);
    float beatStrength = uDecayT > 0.0 ? exp(-uDecayT * 3.0) : 0.25;
    scale = 1.0 + beatPhase * beatStrength * 0.08;
  }
  
  vec2 dropUV = toDrop / (dropRadius * scale);
  
  // Melt intensity = pressure
  float melt = uPressure;
  float d = dropSDF(dropUV, melt);
  
  // Inside/outside of drop
  float inside = smoothstep(0.05, -0.05, d);
  float edge = smoothstep(0.02, -0.02, d) - smoothstep(0.08, 0.02, d);
  
  // --- Drop body color ---
  // Radial gradient inside the drop
  float radialDist = length(dropUV);
  
  // Warm cream to amber gradient
  vec3 creamColor = vec3(1.0, 0.95, 0.84);   // soft cream highlight
  vec3 amberColor = vec3(1.0, 0.71, 0.2);     // soft amber
  vec3 deepAmber = vec3(0.77, 0.47, 0.1);      // deep amber
  vec3 indigoShadow = vec3(0.1, 0.06, 0.16);   // moonlit indigo
  
  // Offset highlight for 3D effect
  vec2 highlightUV = dropUV + vec2(-0.15, -0.2);
  float highlightDist = length(highlightUV);
  
  // Body gradient: cream center -> amber mid -> indigo edge
  vec3 bodyColor;
  if (radialDist < 0.3) {
    bodyColor = mix(amberColor, creamColor, 1.0 - radialDist / 0.3);
  } else if (radialDist < 0.75) {
    bodyColor = mix(amberColor, deepAmber, (radialDist - 0.3) / 0.45);
  } else {
    bodyColor = mix(deepAmber, indigoShadow, (radialDist - 0.75) / 0.25);
  }
  
  // Viscous melt texture
  float meltNoise = fbm(dropUV * 4.0 + uTime * 0.3 * (1.0 + melt));
  float meltStream = smoothstep(0.35, 0.7, meltNoise);
  bodyColor += vec3(0.1, 0.05, 0.0) * meltStream * melt * 0.3;
  
  // Highlight
  float highlight = smoothstep(0.5, 0.0, highlightDist);
  highlight = pow(highlight, 2.0) * 0.5;
  bodyColor += vec3(1.0, 0.94, 0.78) * highlight * inside;
  
  // --- Edge glow + shadow ---
  // Amber glow ring outside the drop, scales with pressure
  float glowDist = max(0.0, d);
  float glowWidth = 0.3 + melt * 0.5;
  float glowIntensity = melt * 0.35;
  vec3 glowColor = vec3(1.0, 0.7, 0.2);
  
  // Glow falloff (cap bloom to ~3 equivalent for 60fps)
  float glow = glowIntensity * exp(-glowDist / (glowWidth * 0.4));
  vec3 glowContrib = glowColor * glow;
  
  // Second glow layer for warmth
  float glow2 = glowIntensity * 0.5 * exp(-glowDist / (glowWidth * 0.7));
  glowContrib += vec3(0.9, 0.55, 0.15) * glow2;
  
  // Indigo shadow beneath drop
  float shadowDist = length(vec2(0.0, 0.1) + toDrop) / dropRadius;
  float shadow = smoothstep(1.4, 0.5, shadowDist) * 0.3;
  vec3 shadowColor = vec3(0.05, 0.03, 0.1) * shadow;
  
  // Heartbeat glow peak (at threshold)
  float heartbeatGlow = 0.0;
  if (uPressure >= 0.7 || uDecayT > 0.0) {
    float beatPhase = sin(uTime * (6.0 / 0.3) * 3.14159);
    float beatStr = uDecayT > 0.0 ? exp(-uDecayT * 3.0) : 0.5;
    heartbeatGlow = max(0.0, beatPhase) * beatStr * 0.3;
    glowContrib += vec3(1.0, 0.6, 0.15) * heartbeatGlow * smoothstep(0.2, 0.0, abs(d));
  }
  
  // --- Composite ---
  vec3 finalColor = bg - shadowColor;
  
  // Add drop body
  finalColor = mix(finalColor, bodyColor, inside);
  
  // Add edge crispness
  finalColor = mix(finalColor, bodyColor * 0.9, edge * 0.5);
  
  // Add glow (additive)
  finalColor += glowContrib * (1.0 - inside * 0.5);
  
  // Vignette
  float vignette = 1.0 - 0.3 * length(uv - 0.5);
  finalColor *= vignette;
  
  // Tone mapping
  finalColor = finalColor / (1.0 + finalColor);
  finalColor = pow(finalColor, vec3(0.95));
  
  gl_FragColor = vec4(finalColor, 1.0);
}`;

// --- Particle pass: honey droplets ---
const PARTICLE_VS = `
attribute vec3 aParticle; // xy=position, z=life
uniform mat4 uPMatrix;
uniform float uTime;
uniform vec2 uResolution;

varying float vLife;
varying vec2 vPos;

void main() {
  vLife = aParticle.z;
  vec2 pos = aParticle.xy;
  
  // Subtle drift
  pos += vec2(sin(uTime * 0.5 + pos.y * 3.0), cos(uTime * 0.3 + pos.x * 2.0)) * 0.01;
  
  vPos = pos;
  vec4 screenPos = uPMatrix * vec4(pos * vec2(uResolution.x / uResolution.y, 1.0), 0.0, 1.0);
  gl_Position = screenPos;
  gl_PointSize = (2.0 + vLife * 4.0) * min(uResolution.x, uResolution.y) / 500.0;
}`;

const PARTICLE_FS = `
precision highp float;
varying float vLife;
varying vec2 vPos;
uniform vec3 uPColor;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float alpha = smoothstep(0.5, 0.1, d) * vLife * 0.6;
  if (alpha < 0.01) discard;
  
  // Warm amber/cream color with slight variation
  vec3 color = uPColor + vec3(0.05, -0.03, -0.02) * vLife;
  // Add soft glow center
  float glow = exp(-d * 4.0) * 0.3;
  color += vec3(1.0, 0.9, 0.6) * glow;
  
  gl_FragColor = vec4(color, alpha);
}`;

// ============================================================
// WebGL compilation helpers
// ============================================================
function compileShader(src, type) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(s));
    return null;
  }
  return s;
}

function createProgram(vs, fs, attribs) {
  const v = compileShader(vs, gl.VERTEX_SHADER);
  const f = compileShader(fs, gl.FRAGMENT_SHADER);
  const p = gl.createProgram();
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  if (attribs) {
    const idx = [];
    for (let i = attribs.length - 1; i >= 0; i--) {
      idx.push(i);
      gl.bindAttribLocation(p, i, attribs[i]);
    }
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

// ============================================================
// Initialize WebGL
// ============================================================
function initWebGL() {
  gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance'
  });
  
  if (!gl) {
    console.warn('WebGL not available, using fallback');
    return false;
  }
  
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  
  // --- Main program ---
  mainProgram = createProgram(MAIN_VS, MAIN_FS, ['aPos']);
  
  // Fullscreen quad
  const quadVerts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
  const buf = gl.createBuffer();
  mainVAO = buf; // store buffer reference
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  
  // Get uniform locations
  uTime     = gl.getUniformLocation(mainProgram, 'uTime');
  uPressure  = gl.getUniformLocation(mainProgram, 'uPressure');
  uResolution = gl.getUniformLocation(mainProgram, 'uResolution');
  uDecayT    = gl.getUniformLocation(mainProgram, 'uDecayT');
  
  // --- Particle program ---
  particleProgram = createProgram(PARTICLE_VS, PARTICLE_FS, ['aParticle']);
  
  uPMatrix  = gl.getUniformLocation(particleProgram, 'uPMatrix');
  uPColor   = gl.getUniformLocation(particleProgram, 'uPColor');
  
  // Particles attribute locations
  const pTimeLoc = gl.getAttribLocation(particleProgram, 'uTime');
  const pResLoc  = gl.getAttribLocation(particleProgram, 'uResolution');
  
  // Particle buffer
  particleBuffer = gl.createBuffer();
  
  // Store extra uniform locations on the program object
  particleProgram._uTimeLoc = gl.getUniformLocation(particleProgram, 'uTime');
  particleProgram._uResLoc = gl.getUniformLocation(particleProgram, 'uResolution');
  
  return true;
}

// ============================================================
// Matrix math
// ============================================================
function orthoMatrix(left, right, bottom, top, near, far) {
  const w = right - left, h = top - bottom, d = far - near;
  return new Float32Array([
    2/w, 0, 0, 0,
    0, 2/h, 0, 0,
    0, 0, -2/d, 0,
    -(left+right)/w, -(bottom+top)/h, -(near+far)/d, 1
  ]);
}

// ============================================================
// Normalized pressure state (0‑1 API, raw coordinates rejected)
// ============================================================
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

function createToneBuffer(freq, dur) {
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
  heartbeatBuffer = createToneBuffer(120, 0.4);
  clickBuffer    = createClickBuffer();
  dripBuffer     = createDripBuffer();
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

// ============================================================
// Particle system (positions stored as NDC coordinates)
// ============================================================
function dropNDCRadius() {
  const aspect = W / H;
  return 0.18 * (aspect > 1 ? 1 : aspect);
}

function spawnParticle(p) {
  if (particles.length >= MAX_PARTICLES) return;
  const r = dropNDCRadius() * (1 + p * 0.3);
  const angle = Math.random() * Math.PI * 2;
  const dist = r * (0.6 + Math.random() * 0.6);
  particles.push({
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 0.03 * p,
    vy: (Math.random() - 0.5) * 0.02 + 0.015,
    vyAccel: 0.012,
    life: 1,
    decay: 0.6,
  });
}

function updateParticles(p, dt) {
  if (p > 0.2 && Math.random() < p * 0.15) {
    spawnParticle(p);
  }
  
  for (let i = particles.length - 1; i >= 0; i--) {
    const pt = particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += pt.vyAccel * dt;
    pt.life -= dt * (inDecay ? pt.decay + 0.4 : pt.decay);
    if (pt.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function renderParticles(time) {
  if (particles.length === 0) return;
  
  gl.useProgram(particleProgram);
  
  // Orthographic matrix for NDC space
  const aspect = W / H;
  const proj = orthoMatrix(-aspect, aspect, -1, 1, -1, 1);
  gl.uniformMatrix4fv(uPMatrix, false, proj);
  gl.uniform1f(particleProgram._uTimeLoc, time);
  gl.uniform2f(particleProgram._uResLoc, W, H);
  
  // Particle color: warm amber with variation
  gl.uniform3f(uPColor, 1.0, 0.75, 0.35);
  
  // Build particle data: xy position + life
  const data = new Float32Array(particles.length * 3);
  for (let i = 0; i < particles.length; i++) {
    data[i * 3 + 0] = particles[i].x;
    data[i * 3 + 1] = particles[i].y;
    data[i * 3 + 2] = particles[i].life;
  }
  
  gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  
  const loc = gl.getAttribLocation(particleProgram, 'aParticle');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
  
  gl.drawArrays(gl.POINTS, 0, particles.length);
  gl.disableVertexAttribArray(loc);
}

// ============================================================
// Touch / Mouse handlers with normalized 0‑1 pressure
// ============================================================
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
  playSource(clickBuffer);
  triggerHaptic(15);
}

function handleMove(e) {
  if (!active) return;
  e.preventDefault();
  const p = getPressure(e);
  pressure = p;
  if (p >= THRESHOLD && !heartbeatFired) {
    heartbeatFired = true;
    onHeartbeat();
  }
}

function handleEnd(e) {
  if (!active) return;
  active = false;
  startDecay();
}

function onHeartbeat() {
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
  playSource(dripBuffer);
  triggerHaptic(80);
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
canvas.addEventListener('touchmove',  handleMove,   { passive: false });
canvas.addEventListener('touchend',   handleEnd,    { passive: false });
canvas.addEventListener('touchcancel', handleEnd, { passive: false });

// ============================================================
// Main render loop (WebGL, 60fps target)
// ============================================================
let lastTs = 0;

function frame(ts) {
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  
  if (!gl) {
    requestAnimationFrame(frame);
    return;
  }
  
  // Update pressure during decay
  if (inDecay) {
    decayT += dt;
    const progress = decayT / DECAY_DURATION;
    if (progress >= 1) {
      pressure = 0.005;
      inDecay = false;
    } else {
      pressure = Math.exp(-progress * 4) + 0.001;
    }
  }
  
  // Update particles
  updateParticles(pressure, dt);
  
  // --- Pass 1: Main drop shader ---
  gl.clearColor(0.04, 0.04, 0.1, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  
  gl.useProgram(mainProgram);
  
  gl.uniform1f(uTime, ts / 1000);
  gl.uniform1f(uPressure, pressure);
  gl.uniform2f(uResolution, W, H);
  gl.uniform1f(uDecayT, inDecay ? decayT : 0.0);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, mainVAO);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.disableVertexAttribArray(0);
  
  // --- Pass 2: Particles (additive blend) ---
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  renderParticles(ts / 1000);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  
  requestAnimationFrame(frame);
}

// --- Boot ---
resize();
const webglOK = initWebGL();
if (!webglOK) {
  console.warn('WebGL init failed, app will not render.');
}
requestAnimationFrame(frame);
