(function () {
  'use strict';

  // -- Canvas Setup --
  const canvas = document.getElementById('sim');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('overlay');
  const freeBtn = document.getElementById('free-btn');

  let W, H;
  let frozen = false;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // -- Fluid Simulation: Damped Wave Equation --
  const RES = 4;
  let cols, rows;
  let current, previous, temp;

  function initGrid() {
    cols = Math.ceil(W / RES) + 2;
    rows = Math.ceil(H / RES) + 2;
    current = new Float32Array(cols * rows);
    previous = new Float32Array(cols * rows);
  }
  initGrid();
  window.addEventListener('resize', initGrid);

  const VISCOSITY = 0.96;
  const SPEED = 0.25;

  function simulate() {
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x;
        current[i] = (
          current[i - 1] +
          current[i + 1] +
          current[i - cols] +
          current[i + cols]
        ) * 0.5 - previous[i];
        current[i] *= VISCOSITY;
      }
    }
    temp = previous;
    previous = current;
    current = temp;
  }

  function dropRipple(cx, cy, amplitude) {
    const r = Math.max(3, Math.floor(16 / RES));
    const gx = Math.floor(cx / RES);
    const gy = Math.floor(cy / RES);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r) continue;
        const px = gx + dx;
        const py = gy + dy;
        if (px < 1 || px >= cols - 1 || py < 1 || py >= rows - 1) continue;
        const falloff = 1 - dist / r;
        current[py * cols + px] += amplitude * falloff * falloff;
      }
    }
  }

  // -- Rendering --
  const imageData = ctx.createImageData(W, H);
  const pixels = imageData.data;

  function render() {
    for (let y = 0; y < rows - 1; y++) {
      for (let x = 0; x < cols - 1; x++) {
        const val = previous[y * cols + x];
        const gradient = (previous[y * cols + x + 1] - previous[y * cols + x - 1]) * SPEED * 50;

        const px = x * RES;
        const py = y * RES;

        for (let dy = 0; dy < RES && py + dy < H; dy++) {
          for (let dx = 0; dx < RES && px + dx < W; dx++) {
            const si = ((py + dy) * W + (px + dx)) * 4;

            const baseR = 200 + val * 40 + gradient * 8;
            const baseG = 140 + val * 25 + gradient * 4;
            const baseB = 20 + val * 10;

            pixels[si]     = Math.max(0, Math.min(255, baseR));
            pixels[si + 1] = Math.max(0, Math.min(255, baseG));
            pixels[si + 2] = Math.max(0, Math.min(255, baseB));
            pixels[si + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // -- Audio Engine --
  let audioCtx = null;
  let droneGain = null;
  let compNode = null;
  let masterGain = null;
  let lpfNode = null;
  let analyserNode = null;
  let audioStarted = false;

  function initAudio() {
    if (audioStarted) return;
    audioStarted = true;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    lpfNode = audioCtx.createBiquadFilter();
    lpfNode.type = 'lowpass';
    lpfNode.frequency.value = 80;
    lpfNode.Q.value = 0.71;

    compNode = audioCtx.createDynamicsCompressor();
    compNode.threshold = -3;
    compNode.knee = 10;
    compNode.ratio = 12;
    compNode.attack = 0.003;
    compNode.release = 0.15;

    droneGain = audioCtx.createGain();
    droneGain.gain.value = 0.12;

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 1;

    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.7;

    const osc1 = audioCtx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 55;

    const osc2 = audioCtx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 55.5;

    const osc3 = audioCtx.createOscillator();
    osc3.type = 'triangle';
    osc3.frequency.value = 110;

    const g3 = audioCtx.createGain();
    g3.gain.value = 0.3;

    osc1.connect(droneGain);
    osc2.connect(droneGain);
    osc3.connect(g3);
    g3.connect(droneGain);

    droneGain.connect(lpfNode);
    lpfNode.connect(compNode);
    compNode.connect(masterGain);
    masterGain.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);

    osc1.start();
    osc2.start();
    osc3.start();
  }

  let sidechainActive = false;
  let sidechainStart = 0;

  function duckDrone() {
    if (!audioCtx || !droneGain) return;
    const now = audioCtx.currentTime;
    const target = sidechainActive ? 0.03 : 0.12;
    droneGain.gain.setTargetAtTime(target, now, 0.02);
  }

  function getAudioAmplitude() {
    if (!analyserNode) return 0;
    const data = new Uint8Array(analyserNode.frequencyBinCount);
    analyserNode.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / data.length / 255;
  }

  // -- SVG Overlay: Park Bench + Strawberry Mochi --
  function buildOverlay() {
    const ox = W * 0.15;
    const oy = H * 0.65;

    overlay.innerHTML = `
<defs>
  <linearGradient id="benchGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#8B5E3C" />
    <stop offset="100%" stop-color="#5C3A1E" />
  </linearGradient>
  <radialGradient id="mochiGrad" cx="50%" cy="40%" r="50%">
    <stop offset="0%" stop-color="#FFE4E1" />
    <stop offset="70%" stop-color="#FFB6C1" />
    <stop offset="100%" stop-color="#FF8FAA" />
  </radialGradient>
  <radialGradient id="berryGrad" cx="50%" cy="40%" r="50%">
    <stop offset="0%" stop-color="#FF6B8A" />
    <stop offset="100%" stop-color="#CC3366" />
  </radialGradient>
</defs>

<g id="bench-group">
  <rect x="${ox}" y="${oy}" width="320" height="10" rx="3" fill="url(#benchGrad)" opacity="0.7"/>
  <rect x="${ox + 20}" y="${oy + 10}" width="10" height="60" rx="2" fill="url(#benchGrad)" opacity="0.6"/>
  <rect x="${ox + 290}" y="${oy + 10}" width="10" height="60" rx="2" fill="url(#benchGrad)" opacity="0.6"/>
  <rect x="${ox}" y="${oy - 40}" width="320" height="8" rx="2" fill="url(#benchGrad)" opacity="0.5"/>
  <rect x="${ox + 30}" y="${oy - 40}" width="8" height="50" rx="2" fill="url(#benchGrad)" opacity="0.4"/>
  <rect x="${ox + 282}" y="${oy - 40}" width="8" height="50" rx="2" fill="url(#benchGrad)" opacity="0.4"/>
</g>

<g id="mochi-group">
  <ellipse cx="${ox + 100}" cy="${oy - 45}" rx="30" ry="22" fill="url(#mochiGrad)" opacity="0.8"/>
  <ellipse cx="${ox + 100}" cy="${oy - 52}" rx="18" ry="14" fill="url(#berryGrad)" opacity="0.7"/>
  <ellipse cx="${ox + 100}" cy="${oy - 52}" rx="8" ry="6" fill="#2D8B4E" opacity="0.6"/>
  <ellipse cx="${ox + 75}" cy="${oy - 45}" rx="12" ry="10" fill="url(#berryGrad)" opacity="0.5"/>
  <path d="M${ox + 85},${oy - 50} Q${ox + 100},${oy - 60} ${ox + 115},${oy - 50}" fill="none" stroke="#FFE4E1" stroke-width="2" opacity="0.6"/>
</g>
`;
  }
  buildOverlay();
  window.addEventListener('resize', buildOverlay);

  // -- Input Handling --
  let pointerDown = false;
  let inputX = 0, inputY = 0;

  function handlePointer(x, y, isDown) {
    initAudio();
    inputX = x;
    inputY = y;
    pointerDown = isDown;

    const amplitude = isDown ? 80 : -30;
    dropRipple(x, y, amplitude);

    if (isDown) {
      if (!sidechainActive) {
        sidechainActive = true;
        sidechainStart = performance.now();
      }
    } else {
      sidechainActive = false;
    }
    duckDrone();
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    handlePointer(e.clientX, e.clientY, true);
  });

  canvas.addEventListener('pointermove', e => {
    e.preventDefault();
    if (pointerDown) {
      handlePointer(e.clientX, e.clientY, true);
    }
  });

  canvas.addEventListener('pointerup', e => {
    e.preventDefault();
    if (pointerDown) {
      handlePointer(e.clientX, e.clientY, false);
    }
    pointerDown = false;
  });

  canvas.addEventListener('pointercancel', () => {
    pointerDown = false;
    sidechainActive = false;
    duckDrone();
  });

  // -- Freeze Frame --
  freeBtn.addEventListener('click', e => {
    e.stopPropagation();
    frozen = !frozen;
    freeBtn.classList.toggle('active', frozen);
    document.body.classList.toggle('frozen', frozen);
  });

  // -- Ambient Drip --
  let lastDrip = 0;

  function ambientDrip(now) {
    if (frozen) return;
    const interval = 4000;
    if (now - lastDrip > interval) {
      lastDrip = now;
      const rx = Math.random() * W;
      const ry = Math.random() * H * 0.5;
      dropRipple(rx, ry, 20 + Math.random() * 20);
    }
  }

  // -- Main Loop --
  let lastTime = 0;

  function loop(now) {
    requestAnimationFrame(loop);

    if (!frozen) {
      simulate();
      ambientDrip(now);
    }

    render();

    if (!frozen && audioStarted) {
      const amp = getAudioAmplitude();

      const benchGroup = overlay.querySelector('#bench-group');
      const mochiGroup = overlay.querySelector('#mochi-group');

      const swayX = Math.sin(now / 2000) * amp * 6;
      const swayY = Math.cos(now / 2500) * amp * 3;

      if (benchGroup) {
        benchGroup.setAttribute('transform', `translate(${swayX * 0.5}, ${swayY * 0.3})`);
      }
      if (mochiGroup) {
        mochiGroup.setAttribute('transform', `translate(${swayX}, ${swayY}) scale(${1 + amp * 0.03})`);
      }
    }

    const delta = now - lastTime;
    lastTime = now;
  }

  requestAnimationFrame(loop);
})();
