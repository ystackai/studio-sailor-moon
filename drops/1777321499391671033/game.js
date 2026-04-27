// ─── Device Detection ──────────────────────────────────────────
function detectAudioDevice() {
  // Heuristic: if navigator has gamepad API or multiple audio outputs, likely headphones/desktop
  const isLikelyHeadphones = !navigator.connection ||
    (navigator.connection && navigator.connection.effectiveType !== '2g' && navigator.connection.effectiveType !== '3g');
  // Touch-only devices with small viewports = phone speakers
  const isTouchDevice = 'ontouchstart' in window;
  const isSmallScreen = window.innerWidth < 500;
  return isTouchDevice && isSmallScreen ? 'speaker' : 'headphone';
}

const deviceType = detectAudioDevice();

// ─── Audio Engine (Web Audio API) ──────────────────────────────
let audioCtx = null;
let masterGain = null;
let ambientPad = null;
let humGain = null;
let inhaleNoise = null;

function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = deviceType === 'speaker' ? 0.3 : 0.7;
  masterGain.connect(audioCtx.destination);

  // Ambient slow-tempo pad (60-70 BPM feel, deep warm texture)
  createAmbientPad();

  // Harmonic hum gain for freeze state
  humGain = audioCtx.createGain();
  humGain.gain.value = 0;
  humGain.connect(masterGain);
  createHarmonicHum();
}

// Ambient pad: 3 layered detuned oscillators for a warm honeyed texture
function createAmbientPad() {
  const padGain = audioCtx.createGain();
  padGain.gain.value = 0.12;
  padGain.connect(masterGain);

  const freqs = [55, 55.3, 82.5]; // A1 detuned + E2
  freqs.forEach(f => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.connect(padGain);
    osc.start();
  });

  // Subtle warmth: soft triangle layered in
  const warmOsc = audioCtx.createOscillator();
  warmOsc.type = 'triangle';
  warmOsc.frequency.value = 440 * 0.25; // A2, muted
  const warmGain = audioCtx.createGain();
  warmGain.gain.value = 0.04;
  warmOsc.connect(warmGain);
  warmGain.connect(padGain);
  warmOsc.start();
}

// Harmonic hum: warm metallic resonance at freeze
function createHarmonicHum() {
  // Primary hum: low warm tone
  const hum1 = audioCtx.createOscillator();
  hum1.type = 'sine';
  hum1.frequency.value = 110; // A2
  hum1.connect(humGain);
  hum1.start();

  // Metallic overtone
  const hum2 = audioCtx.createOscillator();
  hum2.type = 'sine';
  hum2.frequency.value = 330; // A3, subtle metallic shimmer
  const hum2Gain = audioCtx.createGain();
  hum2Gain.gain.value = 0.15;
  hum2.connect(hum2Gain);
  hum2Gain.connect(humGain);
  hum2.start();

  // Amber resonance: 5th harmonic
  const hum3 = audioCtx.createOscillator();
  hum3.type = 'triangle';
  hum3.frequency.value = 165; // E3
  const hum3Gain = audioCtx.createGain();
  hum3Gain.gain.value = 0.08;
  hum3.connect(hum3Gain);
  hum3Gain.connect(humGain);
  hum3.start();
}

// Breath inhale: filtered noise burst
function playBreathInhale() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  // White noise through bandpass for breath texture
  const bufferSize = audioCtx.sampleRate * 0.8;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 800;
  bp.Q.value = 0.7;

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(0, now);
  noiseGain.gain.linearRampToValueAtTime(deviceType === 'speaker' ? 0.25 : 0.4, now + 0.15);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

  noise.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + 1.2);
}

// Release exhale: softer noise fade
function playExhaleRelease() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  const bufferSize = audioCtx.sampleRate * 1.0;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.4;
  }

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1200, now);
  lp.frequency.exponentialRampToValueAtTime(200, now + 1.0);
  lp.Q.value = 0.5;

  const noiseGain = audioCtx.createGain();
  noiseGain.gain.setValueAtTime(deviceType === 'speaker' ? 0.2 : 0.3, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

  noise.connect(lp);
  lp.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(now);
  noise.stop(now + 1.0);
}

// Adaptive fade curve
function applyFadeCurve(targetGain, targetValue, duration, rising) {
  const now = audioCtx.currentTime;
  if (rising) {
    // Easing in: slow start, full value at end
    targetGain.gain.setValueAtTime(targetGain.gain.value, now);
    if (deviceType === 'speaker') {
      // Rolled-off curve for phone speakers: preserve transients, less aggressive ramp
      targetGain.gain.setTargetAtTime(targetValue, now, duration * 0.4);
    } else {
      // Full-spectrum for headphones
      targetGain.gain.setTargetAtTime(targetValue, now, duration * 0.25);
    }
  } else {
    targetGain.gain.setValueAtTime(targetGain.gain.value, now);
    targetGain.gain.exponentialRampToValueAtTime(
      Math.max(targetValue, 0.0001),
      now + duration
    );
  }
}

// ─── State Machine (non-blocking) ─────────────────────────────
const STATES = {
  IDLE: 'idle',
  EXPANDING: 'expanding',
  FROZEN: 'frozen',
  EXHALING: 'exhaling',
};

let state = STATES.IDLE;
let rippleAmplitude = 0;
let animFrameId = null;
let holdStartTime = 0;
let expansionStart = 0;
const EXPANSION_DURATION = 1200; // 1.2s
const HOLD_CAP = 2500; // 2.5s max hold

// DOM refs
const rippleNode = document.getElementById('ripple-node');
const rippleGlow = document.getElementById('ripple-glow');
const rings = [
  document.getElementById('ring-1'),
  document.getElementById('ring-2'),
  document.getElementById('ring-3'),
];
const freezeOverlay = document.getElementById('freeze-overlay');
const progressRing = document.getElementById('progress-ring');
const progressArc = document.getElementById('progress-arc');
const ARC_CIRCUMFERENCE = 352; // 2 * PI * 56

// Inverse ease-out cubic for organic expansion
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Inverse ease-in for exhale
function easeInSine(t) {
  return Math.sin(Math.PI * 0.5 * t);
}

// Main render loop
let lastTimestamp = 0;
function render(timestamp) {
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  switch (state) {
    case STATES.EXPANDING: {
      const elapsed = timestamp - expansionStart;
      const t = Math.min(elapsed / EXPANSION_DURATION, 1);
      rippleAmplitude = easeOutCubic(t);

      // Visual updates
      updateRippleVisuals(rippleAmplitude);

      if (t >= 1) {
        // Peak reached, auto-trigger freeze
        state = STATES.FROZEN;
        holdStartTime = timestamp;
        onFreeze();
      }
      break;
    }

    case STATES.FROZEN: {
      const holdElapsed = timestamp - holdStartTime;
      const holdProgress = Math.min(holdElapsed / HOLD_CAP, 1);

      // Update progress ring
      progressArc.style.strokeDashoffset = (ARC_CIRCUMFERENCE * (1 - holdProgress)).toFixed(2);
      progressRing.style.opacity = '1';

      // Pulsing glow at freeze
      const pulse = 0.85 + 0.15 * Math.sin(timestamp * 0.004);
      updateRippleVisuals(rippleAmplitude);
      rippleGlow.style.filter = `blur(${6 * pulse}px)`;

      if (holdElapsed >= HOLD_CAP) {
        // Auto-release after 2.5s cap
        state = STATES.EXHALING;
        onRelease();
      }
      break;
    }

    case STATES.EXHALING: {
      const exhaleStart = holdStartTime + HOLD_CAP;
      const elapsed = timestamp - exhaleStart;
      const exhaleDuration = 1500;
      const t = Math.min(elapsed / exhaleDuration, 1);
      rippleAmplitude = 1 - easeInSine(t);

      updateRippleVisuals(rippleAmplitude);
      progressRing.style.opacity = String(1 - t);
      freezeOverlay.style.opacity = String(0.6 * (1 - t));

      if (t >= 1) {
        state = STATES.IDLE;
        rippleAmplitude = 0;
        progressRing.style.opacity = '0';
        freezeOverlay.style.opacity = '0';
        progressArc.style.strokeDashoffset = String(ARC_CIRCUMFERENCE);
        if (humGain) humGain.gain.setValueAtTime(0, audioCtx ? audioCtx.currentTime : 0);
        updateRippleVisuals(0);
      }
      break;
    }

    case STATES.IDLE: {
      // Subtle idle breathing
      const breathe = 0.92 + 0.08 * Math.sin(timestamp * 0.002);
      rippleGlow.style.transform = `scale(${breathe})`;
      rippleGlow.style.filter = 'blur(3px)';
      break;
    }
  }

  animFrameId = requestAnimationFrame(render);
}

function updateRippleVisuals(amplitude) {
  // Scale the ripple node based on amplitude
  const scale = 1 + amplitude * 1.8;
  rippleNode.style.transform = `scale(${scale})`;

  // Glow intensity and color shift: amber → lunar blue
  const amberR = Math.round(255 - amplitude * 55);
  const amberG = Math.round(200 - amplitude * 40);
  const amberB = Math.round(100 + amplitude * 120);
  const glowOpacity = 0.3 + amplitude * 0.7;
  rippleGlow.style.background = `radial-gradient(circle, rgba(${amberR},${amberG},${amberB},${glowOpacity}) 0%, rgba(${Math.round(120 + amplitude * 80)},${Math.round(160 + amplitude * 40)},${Math.round(220 + amplitude * 35)},${glowOpacity * 0.4}) 60%, transparent 100%)`;
  rippleGlow.style.filter = `blur(${3 + amplitude * 8}px)`;

  // Ripple rings expand with staggered delay
  rings.forEach((ring, i) => {
    const delay = i * 0.3;
    const ringAmp = Math.max(0, amplitude - delay);
    const ringT = Math.min(ringAmp / 0.7, 1);
    const ringScale = 1 + ringT * 2.5;
    const ringOpacity = ringT > 0 ? 0.6 * (1 - ringT * 0.5) : 0;
    ring.style.width = '40px';
    ring.style.height = '40px';
    ring.style.transform = `scale(${ringScale})`;
    ring.style.opacity = String(ringOpacity);
    ring.style.borderColor = `rgba(${Math.round(200 + amplitude * 55)}, ${Math.round(220 + amplitude * 35)}, 255, ${ringOpacity})`;
  });
}

function onFreeze() {
  // Activate harmonic hum
  if (humGain && audioCtx) {
    humming = true;
    if (deviceType === 'speaker') {
      humGain.gain.setTargetAtTime(0.35, audioCtx.currentTime, 0.3);
    } else {
      humGain.gain.setTargetAtTime(0.6, audioCtx.currentTime, 0.2);
    }
  }

  // Freeze overlay: breath-on-glass effect
  freezeOverlay.style.opacity = '0.6';
  freezeOverlay.style.backdropFilter = 'blur(2px)';
  freezeOverlay.style.webkitBackdropFilter = 'blur(2px)';
}

let humming = false;

function onRelease() {
  if (humGain && audioCtx) {
    if (deviceType === 'speaker') {
      humGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.5);
    } else {
      humGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.3);
    }
    humming = false;
  }
  playExhaleRelease();
}

// ─── Interaction Handlers ───────────────────────────────────────
function onTapStart(e) {
  e.preventDefault();
  initAudio();

  if (state === STATES.IDLE) {
    state = STATES.EXPANDING;
    expansionStart = performance.now();
    holdStartTime = expansionStart;
    playBreathInhale();
  }
}

function onTapEnd(e) {
  e.preventDefault();
  if (state === STATES.EXPANDING) {
    // User released before peak: continue expanding (auto-freeze at peak)
    // This is already handled by the render loop
  } else if (state === STATES.FROZEN) {
    // Early release during hold window
    if (humGain && audioCtx) {
      humGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.4);
      humming = false;
    }
    state = STATES.EXHALING;
    holdStartTime = performance.now() - (performance.now() - holdStartTime);
    onRelease();
  }
}

rippleNode.addEventListener('pointerdown', onTapStart);
rippleNode.addEventListener('pointerup', onTapEnd);
rippleNode.addEventListener('pointerleave', onTapEnd);
rippleNode.addEventListener('touchstart', onTapStart, { passive: false });
rippleNode.addEventListener('touchend', onTapEnd, { passive: false });

// ─── Stress Test (for verification) ─────────────────────────────
let stressCount = 0;
function stressTest(cycles) {
  for (let i = 0; i < cycles; i++) {
    stressCount++;
    // Simulate rapid tap-expand-freeze-release cycle
    state = STATES.EXPANDING;
    expansionStart = performance.now();
    playBreathInhale();

    setTimeout(() => {
      if (state === STATES.EXPANDING) {
        state = STATES.FROZEN;
        holdStartTime = performance.now();
        onFreeze();
      }
    }, EXPANSION_DURATION + 10);

    setTimeout(() => {
      if (state === STATES.FROZEN) {
        state = STATES.EXHALING;
        onRelease();
      }
    }, EXPANSION_DURATION + HOLD_CAP + 10);
  }
  console.log(`[Stress Test] ${cycles} rapid cycles initiated. Count: ${stressCount}`);
}

// Expose for manual testing
window.stressTest = stressTest;

// ─── Boot ──────────────────────────────────────────────────────
// Insert SVG gradient definition for progress arc
(function injectArcGradient() {
  const svg = document.getElementById('progress-ring');
  const ns = 'http://www.w3.org/2000/svg';
  const defs = document.createElementNS(ns, 'defs');
  const grad = document.createElementNS(ns, 'linearGradient');
  grad.setAttribute('id', 'arcGradient');
  grad.setAttribute('x1', '0%');
  grad.setAttribute('y1', '0%');
  grad.setAttribute('x2', '100%');
  grad.setAttribute('y2', '100%');
  const stop1 = document.createElementNS(ns, 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', 'rgba(255, 200, 100, 0.9)');
  const stop2 = document.createElementNS(ns, 'stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', 'rgba(140, 180, 240, 0.7)');
  grad.appendChild(stop1);
  grad.appendChild(stop2);
  defs.appendChild(grad);
  svg.insertBefore(defs, svg.firstChild);
})();

// Start render loop
animFrameId = requestAnimationFrame(render);

// Log device type for verification
console.log(`[Sailor Moon] Audio device: ${deviceType}. Volume: ${deviceType === 'speaker' ? '30% (rolled-off)' : '70% (full-spectrum)'}`);
