(function () {
  "use strict";

  // --- Simulation grid ---
  const GRID = 64;
  const SIZE = GRID * GRID;
  const damp = 0.96;
  const waveSpeed = 0.8;
  const curr = new Float32Array(SIZE);
  const prev = new Float32Array(SIZE);
  const nextGrid = new Float32Array(SIZE);

  // --- Canvas setup ---
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const imgData = ctx.createImageData(GRID, GRID);
  const pixels = imgData.data;

  // --- Bilinear upsample buffer ---
  let upCanvas, upCtx;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    upCanvas = document.createElement("canvas");
    upCanvas.width = GRID;
    upCanvas.height = GRID;
    upCtx = upCanvas.getContext("2d");
    upCtx.putImageData(imgData, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // --- Object pool for particles ---
  const PoolSize = 512;
  const pX = new Float32Array(PoolSize);
  const pY = new Float32Array(PoolSize);
  const pVX = new Float32Array(PoolSize);
  const pVY = new Float32Array(PoolSize);
  const pLife = new Float32Array(PoolSize);
  const pActive = new Uint8Array(PoolSize);
  let pHead = 0;
  let pAlive = 0;

  function spawnParticle(x, y) {
    const i = pHead;
    pHead = (pHead + 1) % PoolSize;
    if (pAlive < PoolSize) pAlive++;
    pX[i] = x * GRID;
    pY[i] = y * GRID;
    pVX[i] = (Math.random() - 0.5) * 0.3;
    pVY[i] = -0.5 - Math.random() * 0.3;
    pLife[i] = 1.0;
    pActive[i] = 1;
  }

  // --- Audio ---
  let audioCtx = null;
  let master = null;
  let noiseNode = null;
  let noiseFilter = null;
  let oscs = [];
  let lfo = null;
  let lfoGain = null;
  let conv = null;
  let audioStarted = false;

  function genImpulseIR() {
    const len = audioCtx.sampleRate * 2;
    const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
      }
    }
    return buf;
  }

  function startAudio() {
    if (audioStarted) return;
    audioStarted = true;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = audioCtx.createGain();
    master.gain.value = Math.pow(10, -12 / 20);
    conv = audioCtx.createConvolver();
    conv.buffer = genImpulseIR();
    master.connect(conv);
    conv.connect(audioCtx.destination);
    master.connect(audioCtx.destination);

    noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.value = 400;
    noiseFilter.Q.value = 0.7;
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      d[i] = (last + 0.02 * white) / 1.02;
      last = d[i];
      d[i] *= 3.5;
    }
    noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buf;
    noiseNode.loop = true;
    noiseNode.connect(noiseFilter);
    noiseFilter.connect(master);
    noiseNode.start();

    lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.15;
    lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);
    const freqs = [130.81, 196.0, 164.81];
    freqs.forEach((f) => {
      const o = audioCtx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = audioCtx.createGain();
      g.gain.value = 0.08;
      lfoGain.connect(g.gain);
      o.connect(g);
      g.connect(master);
      o.start();
      oscs.push({ o, g });
    });
    lfo.start();
  }

  function modAudio(velocity) {
    if (!audioCtx || !noiseFilter) return;
    const v = Math.min(velocity * 0.05, 150);
    const t = audioCtx.currentTime;
    noiseFilter.frequency.setTargetAtTime(400 + v, t, 0.05);
    if (lfo) lfo.frequency.setTargetAtTime(0.15 + v * 0.004, t, 0.1);
    oscs.forEach((item, i) => {
      item.g.gain.setTargetAtTime(0.08 + v * 0.0003, t, 0.05);
    });
  }

  // --- Reduced motion ---
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Pointer state ---
  const pointers = [];
  let ptrVelocity = 0;
  const ptrHist = [];
  const HIST_LEN = 8;

  function ptrPos(e) {
    return { cx: e.clientX, cy: e.clientY };
  }

  canvas.addEventListener("pointerdown", (e) => {
    startAudio();
    pointers.push({
      ...ptrPos(e),
      px: e.clientX,
      py: e.clientY,
      id: e.pointerId,
    });
  });

  canvas.addEventListener("pointermove", (e) => {
    startAudio();
    const p = pointers.find((pp) => pp.id === e.pointerId);
    if (p) {
      p.px = p.cx;
      p.py = p.cy;
      p.cx = e.clientX;
      p.cy = e.clientY;
    } else {
      pointers.push({
        ...ptrPos(e),
        px: e.clientX,
        py: e.clientY,
        id: e.pointerId,
      });
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    const i = pointers.findIndex((p) => p.id === e.pointerId);
    if (i >= 0) pointers.splice(i, 1);
  });

  canvas.addEventListener("pointercancel", (e) => {
    const i = pointers.findIndex((p) => p.id === e.pointerId);
    if (i >= 0) pointers.splice(i, 1);
  });

  canvas.addEventListener("pointerleave", () => {
    pointers.length = 0;
  });

  // --- Physics ---
  function stepPhysics(dt) {
    for (let y = 1; y < GRID - 1; y++) {
      for (let x = 1; x < GRID - 1; x++) {
        const idx = y * GRID + x;
        const laplacian =
          curr[idx - 1] +
          curr[idx + 1] +
          curr[idx - GRID] +
          curr[idx + GRID] -
          4 * curr[idx];
        nextGrid[idx] =
          2 * curr[idx] -
          prev[idx] +
          waveSpeed * waveSpeed * laplacian;
        nextGrid[idx] *= damp;
      }
    }
    const tmp = prev;
    for (let i = 0; i < SIZE; i++) prev[i] = curr[i];
    for (let i = 0; i < SIZE; i++) curr[i] = nextGrid[i];
    for (let i = 0; i < SIZE; i++) nextGrid[i] = tmp[i];
  }

  // --- Displacement field ---
  function applyPointers() {
    let totalV = 0;
    pointers.forEach((p) => {
      const gx = p.cx / canvas.width * GRID;
      const gy = p.cy / canvas.height * GRID;
      const r = 4;
      const strength = 8;
      const dx = p.cx - p.px;
      const dy = p.cy - p.py;
      const v = Math.sqrt(dx * dx + dy * dy);
      totalV += v;

      for (let dy2 = -r; dy2 <= r; dy2++) {
        for (let dx2 = -r; dx2 <= r; dx2++) {
          const px = Math.round(gx + dx2);
          const py = Math.round(gy + dy2);
          if (px < 1 || px >= GRID - 1 || py < 1 || py >= GRID - 1) continue;
          const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          if (dist > r) continue;
          const falloff = 1 - dist / r;
          curr[py * GRID + px] += strength * falloff * falloff;
        }
      }
    });
    ptrVelocity = totalV;
  }

  // --- Rendering ---
  function render() {
    for (let i = 0; i < SIZE; i++) {
      const h = curr[i];
      const p4 = i << 2;

      // Base color #2A1B3D -> rgb(42,27,61)
      // Highlight #D4B8E0 -> rgb(212,184,224)
      const t = Math.max(-1, Math.min(1, h * 0.5));

      let r, g, b;
      if (t > 0) {
        r = 42 + (212 - 42) * t;
        g = 27 + (184 - 27) * t;
        b = 61 + (224 - 61) * t;
      } else {
        const u = -t;
        r = 42 - 42 * u * 0.6;
        g = 27 - 27 * u * 0.6;
        b = 61 - 61 * u * 0.6;
      }

      // Specular bloom on peaks
      if (h > 1.5) {
        const spec = Math.min(1, (h - 1.5) * 0.4);
        r += 143 * spec;
        g += 121 * spec;
        b += 131 * spec;
      }

      pixels[p4] = r;
      pixels[p4 + 1] = g;
      pixels[p4 + 2] = b;
      pixels[p4 + 3] = 255;
    }

    // Moonlight caustics overlay (simple sinusoidal)
    const t = performance.now() * 0.0003;
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const i = y * GRID + x;
        const p4 = i << 2;
        const caustic =
          (Math.sin(x * 0.15 + t * 2.1) *
            Math.cos(y * 0.12 + t * 1.7) *
            0.15) +
          Math.sin((x + y) * 0.08 + t * 0.9) * 0.1;
        pixels[p4] = Math.max(0, Math.min(255, pixels[p4] + caustic * 60));
        pixels[p4 + 1] = Math.max(0, Math.min(255, pixels[p4 + 1] + caustic * 50));
        pixels[p4 + 2] = Math.max(0, Math.min(255, pixels[p4 + 2] + caustic * 70));
      }
    }

    // Put to low-res and upscale with bilinear
    imgData.data.set(pixels);
    upCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(upCanvas, 0, 0, GRID, GRID, 0, 0, canvas.width, canvas.height);

    // Draw particles
    if (pAlive > 0) {
      for (let i = 0; i < PoolSize; i++) {
        if (!pActive[i]) continue;
        const screenX = (pX[i] / GRID) * canvas.width;
        const screenY = (pY[i] / GRID) * canvas.height;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 2 * pLife[i], 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212,184,224,${pLife[i] * 0.5})`;
        ctx.fill();
      }
    }
  }

  // --- Particle update ---
  function updateParticles() {
    for (let i = 0; i < PoolSize; i++) {
      if (!pActive[i]) continue;
      pX[i] += pVX[i];
      pY[i] += pVY[i];
      pLife[i] -= 0.008;
      if (pLife[i] <= 0) {
        pActive[i] = 0;
        pAlive--;
      }
    }
  }

  // --- Particle spawn at ripple intersections ---
  let spawnFrame = 0;
  function maybeSpawnParticles() {
    spawnFrame++;
    if (spawnFrame % 3 !== 0) return;

    let count = 0;
    for (let y = 2; y < GRID - 2 && count < 15; y += 3) {
      for (let x = 2; x < GRID - 2 && count < 15; x += 3) {
        const idx = y * GRID + x;
        const center = Math.abs(curr[idx]);
        const neighbors =
          Math.abs(curr[idx - 1]) +
          Math.abs(curr[idx + 1]) +
          Math.abs(curr[idx - GRID]) +
          Math.abs(curr[idx + GRID]);
        if (center > 0.8 && neighbors > 2.5) {
          spawnParticle(x / GRID, y / GRID);
          count++;
        }
      }
    }
  }

  // --- Main loop ---
  let lastTime = 0;
  let frameCount = 0;

  function loop(timestamp) {
    requestAnimationFrame(loop);

    if (!lastTime) {
      lastTime = timestamp;
      return;
    }

    const dt = Math.min((timestamp - lastTime) / 1000, 0.033);
    lastTime = timestamp;
    frameCount++;

    if (!reducedMotion) {
      applyPointers();

      // Sub-step physics for stability
      const subSteps = 2;
      for (let s = 0; s < subSteps; s++) {
        stepPhysics(dt * waveSpeed);
      }

      updateParticles();
      maybeSpawnParticles();
    }

    modAudio(ptrVelocity);
    ptrVelocity *= 0.9;

    if (reducedMotion) {
      // Static gradient fill for reduced motion
      const grd = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        0,
        canvas.width / 2,
        canvas.height / 2,
        Math.max(canvas.width, canvas.height) * 0.7
      );
      grd.addColorStop(0, "#3d2b56");
      grd.addColorStop(1, "#1a1025");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      render();
    }
  }

  requestAnimationFrame(loop);
})();
