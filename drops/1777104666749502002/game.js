(function () {
  "use strict";

  // --- Reduced motion check ---
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = reducedMotionQuery.matches;
  reducedMotionQuery.addEventListener("change", (e) => {
    reducedMotion = e.matches;
  });

  // --- Simulation grid ---
  const GRID = 64;
  const SIZE = GRID * GRID;
  const DAMPING = 0.96;
  const WAVE_SPEED = 0.8;
  const curr = new Float32Array(SIZE);
  const prev = new Float32Array(SIZE);
  const nextGrid = new Float32Array(SIZE);

  // --- Canvas setup ---
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  let imgData = null;
  let upCanvas = null;
  let upCtx = null;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    imgData = ctx.createImageData(GRID, GRID);

    if (!upCanvas) {
      upCanvas = document.createElement("canvas");
      upCtx = upCanvas.getContext("2d");
    }
    upCanvas.width = GRID;
    upCanvas.height = GRID;
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
  const oscs = [];
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
    if (audioStarted) {
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      return;
    }
    audioStarted = true;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    master = audioCtx.createGain();
    master.gain.value = Math.pow(10, -12 / 20);

    conv = audioCtx.createConvolver();
    conv.buffer = genImpulseIR();
    master.connect(conv);
    conv.connect(audioCtx.destination);
    master.connect(audioCtx.destination);

    // Pink noise layer
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

    // LFO tremolo
    lfo = audioCtx.createOscillator();
    lfo.frequency.value = 0.15;
    lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.12;
    lfo.connect(lfoGain);

    // Three layered sine oscillators: fundamental (C3), fifth (G3), octave (C4)
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
    oscs.forEach((item) => {
      item.g.gain.setTargetAtTime(0.08 + v * 0.0003, t, 0.05);
    });
  }

  // --- Pointer state ---
  const pointers = new Map();
  let ptrVelocity = 0;

  function getPointerGridPos(clientX, clientY) {
    return {
      gx: (clientX / canvas.width) * GRID,
      gy: (clientY / canvas.height) * GRID,
    };
  }

  canvas.addEventListener("pointerdown", (e) => {
    startAudio();
    const { gx, gy } = getPointerGridPos(e.clientX, e.clientY);
    pointers.set(e.pointerId, {
      cx: e.clientX,
      cy: e.clientY,
      gx: gx,
      gy: gy,
      px: e.clientX,
      py: e.clientY,
      vx: 0,
      vy: 0,
      speed: 0,
      down: true,
    });
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    startAudio();
    const p = pointers.get(e.pointerId);
    if (p) {
      p.vx = e.clientX - p.cx;
      p.vy = e.clientY - p.cy;
      p.speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      p.px = p.cx;
      p.py = p.cy;
      p.cx = e.clientX;
      p.cy = e.clientY;
      const { gx, gy } = getPointerGridPos(e.clientX, e.clientY);
      p.gx = gx;
      p.gy = gy;
    } else {
      // Hover mode: pointer not pressed
      const { gx, gy } = getPointerGridPos(e.clientX, e.clientY);
      pointers.set(e.pointerId, {
        cx: e.clientX,
        cy: e.clientY,
        gx: gx,
        gy: gy,
        px: e.clientX,
        py: e.clientY,
        vx: 0,
        vy: 0,
        speed: 0,
        down: false,
      });
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    const p = pointers.get(e.pointerId);
    if (p) p.down = false;
  });

  canvas.addEventListener("pointercancel", (e) => {
    pointers.delete(e.pointerId);
  });

  canvas.addEventListener("pointerleave", (e) => {
    pointers.delete(e.pointerId);
  });

  // --- Wave propagation ---
  function stepPhysics() {
    const ws2 = WAVE_SPEED * WAVE_SPEED;
    for (let y = 1; y < GRID - 1; y++) {
      const rowOffset = y * GRID;
      for (let x = 1; x < GRID - 1; x++) {
        const idx = rowOffset + x;
        const laplacian =
          curr[idx - 1] +
          curr[idx + 1] +
          curr[idx - GRID] +
          curr[idx + GRID] -
          4 * curr[idx];
        nextGrid[idx] =
          (2 * curr[idx] - prev[idx] + ws2 * laplacian) * DAMPING;
      }
    }

    // Swap buffers: prev <- curr <- nextGrid, reuse nextGrid as temp
    const tmp = prev;
    for (let i = 0; i < SIZE; i++) prev[i] = curr[i];
    for (let i = 0; i < SIZE; i++) curr[i] = nextGrid[i];
    nextGrid.set(tmp);
  }

  // --- Displacement field from pointers ---
  function applyPointers() {
    let totalSpeed = 0;
    let activeCount = 0;

    pointers.forEach((p) => {
      const radius = p.down ? 4 : 3;
      const strength = p.down ? 10 : 4;
      const gx = Math.round(p.gx);
      const gy = Math.round(p.gy);

      // Apply displacement to grid based on pointer velocity
      const velInfluence = p.speed * 0.15;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const px = gx + dx;
          const py = gy + dy;
          if (px < 1 || px >= GRID - 1 || py < 1 || py >= GRID - 1) continue;

          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > radius) continue;

          const falloff = 1 - dist / radius;
          const falloffSq = falloff * falloff;

          // Add displacement: stronger on press, gentle on hover
          const displacement = (strength + velInfluence) * falloffSq;
          curr[py * GRID + px] += displacement;

          // Directional velocity injection for drag/stir
          if (p.down && p.speed > 0.5) {
            const dirX = (p.vx / p.speed) * falloff * 2;
            const dirY = (p.vy / p.speed) * falloff * 2;
            if (px + 1 < GRID - 1) curr[py * GRID + px + 1] += dirX;
            if (py + 1 < GRID - 1) curr[(py + 1) * GRID + px] += dirY;
          }
        }
      }

      totalSpeed += p.speed;
      activeCount++;
    });

    ptrVelocity = activeCount > 0 ? totalSpeed / activeCount : ptrVelocity * 0.92;
  }

  // --- Rendering ---
  function render() {
    const pixels = imgData.data;

    // Precompute time for caustics
    const t = performance.now() * 0.0003;

    for (let y = 0; y < GRID; y++) {
      const rowOffset = y * GRID;
      // Caustic base row values (avoids recomputing cos per pixel)
      const cosRow = Math.cos(y * 0.12 + t * 1.7);

      for (let x = 0; x < GRID; x++) {
        const i = rowOffset + x;
        const h = curr[i];
        const p4 = i << 2;

        // Height to color mapping
        const clip = h > 1 ? 1 : h < -1 ? -1 : h;
        const tNorm = clip * 0.5;

        // Base color #2A1B3D -> rgb(42,27,61)
        // Highlight #D4B8E0 -> rgb(212,184,224)
        let r, g, b;
        if (tNorm > 0) {
          r = 42 + (212 - 42) * tNorm;
          g = 27 + (184 - 27) * tNorm;
          b = 61 + (224 - 61) * tNorm;
        } else {
          const u = -tNorm;
          r = 42 * (1 - u * 0.6);
          g = 27 * (1 - u * 0.6);
          b = 61 * (1 - u * 0.6);
        }

        // Specular bloom on ripple peaks
        if (h > 1.5) {
          const spec = Math.min(1, (h - 1.5) * 0.4);
          r += 143 * spec;
          g += 121 * spec;
          b += 131 * spec;
        }

        // Moonlight caustics overlay
        const sinX = Math.sin(x * 0.15 + t * 2.1);
        const caustic =
          sinX * cosRow * 0.15 +
          Math.sin((x + y) * 0.08 + t * 0.9) * 0.1;

        // Apply caustic as additive color overlay
        const cr = caustic * 60;
        const cg = caustic * 50;
        const cb = caustic * 70;

        pixels[p4] = cr > 0 ? Math.min(255, r + cr) : Math.max(0, r + cr);
        pixels[p4 + 1] = cg > 0 ? Math.min(255, g + cg) : Math.max(0, g + cg);
        pixels[p4 + 2] = cb > 0 ? Math.min(255, b + cb) : Math.max(0, b + cb);
        pixels[p4 + 3] = 255;
      }
    }

    // Bilinear upscale
    upCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(upCanvas, 0, 0, GRID, GRID, 0, 0, canvas.width, canvas.height);

    // Draw star-dust particles
    if (pAlive > 0) {
      for (let i = 0; i < PoolSize; i++) {
        if (!pActive[i]) continue;
        const screenX = (pX[i] / GRID) * canvas.width;
        const screenY = (pY[i] / GRID) * canvas.height;
        const alpha = pLife[i] * 0.5;
        const radius = 1.5 + pLife[i];

        ctx.beginPath();
        ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212,184,224,${alpha})`;
        ctx.fill();
      }
    }
  }

  // --- Particle update ---
  function updateParticles(dt) {
    for (let i = 0; i < PoolSize; i++) {
      if (!pActive[i]) continue;
      pX[i] += pVX[i];
      pY[i] += pVY[i];
      pLife[i] -= dt * 1.5; // speed-independent decay
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
      const rowOffset = y * GRID;
      for (let x = 2; x < GRID - 2 && count < 15; x += 3) {
        const idx = rowOffset + x;
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

  // --- Static gradient for reduced motion ---
  function renderStatic() {
    const grd = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      0,
      canvas.width / 2,
      canvas.height / 2,
      Math.max(canvas.width, canvas.height) * 0.7
    );
    grd.addColorStop(0, "#3d2b56");
    grd.addColorStop(0.5, "#2a1b3d");
    grd.addColorStop(1, "#1a1025");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle shimmer on static mode
    const t = performance.now() * 0.0002;
    const shimmer = Math.sin(t) * 0.03 + 0.03;
    ctx.fillStyle = `rgba(212,184,224,${shimmer})`;
    ctx.beginPath();
    ctx.arc(canvas.width * 0.5, canvas.height * 0.35, 60, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- Main animation loop ---
  let lastTime = 0;
  let running = true;
  let rafId = null;

  const TARGET_FRAME_TIME = 1000 / 60; // ~16.67ms for 60fps

  function loop(timestamp) {
    if (!running) return;

    if (!lastTime) {
      lastTime = timestamp;
      rafId = requestAnimationFrame(loop);
      return;
    }

    const delta = timestamp - lastTime;

    // Skip frames that arrive too early to respect 60fps budget
    if (delta < TARGET_FRAME_TIME * 0.8) {
      rafId = requestAnimationFrame(loop);
      return;
    }

    const dt = Math.min(delta / 1000, 0.033);
    lastTime = timestamp;

    if (reducedMotion) {
      // Static gradient mode
      renderStatic();
    } else {
      // Full simulation
      applyPointers();

      // Sub-step physics for numerical stability at high frame rates
      const subSteps = 2;
      for (let s = 0; s < subSteps; s++) {
        stepPhysics();
      }

      updateParticles(dt);
      maybeSpawnParticles();
      render();
    }

    // Audio modulation runs regardless of motion setting
    modAudio(ptrVelocity);
    ptrVelocity *= 0.92; // decay unused velocity

    rafId = requestAnimationFrame(loop);
  }

  // --- Telemetry (dev only, stripped in prod) ---
  if (false) {
    // Enable for debug: log fps and memory every 5 seconds
    let frameCount = 0;
    let t0 = performance.now();
    setInterval(() => {
      const fps = Math.round(frameCount * 1000 / (performance.now() - t0));
      frameCount = 0;
      t0 = performance.now();
      const mem = performance.memory;
      if (mem) {
        console.log(`[telemetry] fps: ${fps}, usedJSHeapSize: ${(mem.usedJSHeapSize / 1048576).toFixed(1)}MB`);
      }
    }, 5000);
    const origLoop = loop;
    // We instrument via the tick counter above
  }

  // --- Cleanup on page hide ---
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      lastTime = 0;
    } else {
      running = true;
      rafId = requestAnimationFrame(loop);
    }
  });

  // --- Launch ---
  rafId = requestAnimationFrame(loop);
})();
