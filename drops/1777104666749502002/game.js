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
     let curr = new Float32Array(SIZE);
    let prev = new Float32Array(SIZE);
    let nextGrid = new Float32Array(SIZE);

    // --- Canvas setup ---
   const canvas = document.getElementById("canvas");
   const ctx = canvas.getContext("2d", { alpha: false });

   let imgData = null;
   let upCanvas = null;
   let upCtx = null;

   const upFullCanvas = document.createElement("canvas");
   const upFullCtx = upFullCanvas.getContext("2d");

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
     upFullCanvas.width = GRID;
     upFullCanvas.height = GRID;
    }
   window.addEventListener("resize", resize);
   resize();

    // --- Viewport offset and zoom state ---
   let zoom = 1;
   let targetZoom = 1;
   let panX = 0;
   let panY = 0;
   let targetPanX = 0;
   let targetPanY = 0;
   const ZOOM_MIN = 1;
   const ZOOM_MAX = 4;

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

   // Smoothed audio params (interpolated each frame)
   let smoothVelocity = 0;
   let smoothZoom = 1;
   const SMOOTH_ALPHA = 0.06;

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
     const baseFreqs = [130.81, 196.0, 164.81];
     baseFreqs.forEach((f) => {
       const o = audioCtx.createOscillator();
       o.type = "sine";
       o.frequency.value = f;
       const g = audioCtx.createGain();
       g.gain.value = 0.08;
       lfoGain.connect(g.gain);
       o.connect(g);
       g.connect(master);
       o.start();
       oscs.push({ o, g, baseFreq: f });
      });
     lfo.start();
    }

   function modAudio() {
     if (!audioCtx || !noiseFilter) return;
     const t = audioCtx.currentTime;

     // Velocity-driven: filter cutoff ±150Hz
     const v = Math.min(smoothVelocity * 0.05, 150);
     noiseFilter.frequency.setTargetAtTime(400 + v, t, 0.05);

     // LFO rate: velocity and zoom both influence
     const lfoRate = 0.15 + v * 0.004 + (smoothZoom - 1) * 0.05;
     lfo.frequency.setTargetAtTime(lfoRate, t, 0.1);

     // Oscillator pitch: zoom shifts to warmer lower registers
     const pitchShift = Math.pow(0.85, smoothZoom - 1);
     oscs.forEach((item) => {
       item.o.frequency.setTargetAtTime(item.baseFreq * pitchShift, t, 0.08);
       item.g.gain.setTargetAtTime(0.08 + v * 0.0003, t, 0.05);
      });
    }

    // --- Pointer state ---
   const pointers = new Map();
   let ptrVelocity = 0;

   function getPointerGridPos(clientX, clientY) {
     const nx = clientX / canvas.width;
     const ny = clientY / canvas.height;
     // Apply pan and zoom to map screen to grid coordinates
     const zoomedX = (nx - 0.5) * zoom + 0.5 + panX;
     const zoomedY = (ny - 0.5) * zoom + 0.5 + panY;
     return {
       gx: zoomedX * GRID,
       gy: zoomedY * GRID,
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

    // --- Wheel/Pinch zoom ---
   let wheelTimeout = null;
   canvas.addEventListener("wheel", (e) => {
     startAudio();
     const zoomDelta = -e.deltaY * 0.001;
     const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, targetZoom + zoomDelta));

     // Pan toward cursor during zoom for natural feel
     const cx = e.clientX / canvas.width - 0.5;
     const cy = e.clientY / canvas.height - 0.5;
     const zoomRatio = newZoom / targetZoom;
     targetPanX = targetPanX + cx * (1 - zoomRatio);
     targetPanY = targetPanY + cy * (1 - zoomRatio);

     targetZoom = newZoom;

     // Debounce rapid wheel events
     if (wheelTimeout) clearTimeout(wheelTimeout);
     wheelTimeout = setTimeout(() => {
       targetZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, targetZoom));
     }, 100);
    }, { passive: true });

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
     prev = curr;
     curr = nextGrid;
     nextGrid = tmp;
    }

    // --- Displacement field from pointers ---
   function applyPointers() {
     let totalSpeed = 0;
     let activeCount = 0;

     pointers.forEach((p) => {
       const radius = Math.floor((p.down ? 4 : 3) / zoom);
       const strength = (p.down ? 10 : 4) * zoom;
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

    // --- Render zoomed portion of grid ---
   function renderZoomedGrid() {
     const cw = canvas.width;
     const ch = canvas.height;

     // Calculate visible region of the grid based on zoom and pan
     const viewW = GRID / zoom;
     const viewH = GRID / zoom;
     const originX = Math.max(0, Math.min(GRID - viewW, (0.5 + panX) * GRID - viewW / 2));
     const originY = Math.max(0, Math.min(GRID - viewH, (0.5 + panY) * GRID - viewH / 2));

     // Draw the 64x64 rendered grid scaled to fill viewport with proper crop
     const srcX = Math.max(0, originX | 0);
     const srcY = Math.max(0, originY | 0);
     const srcW = Math.min(GRID - srcX, Math.ceil(viewW));
     const srcH = Math.min(GRID - srcY, Math.ceil(viewH));

     // First render to the upscaled canvas at full resolution
     upFullCtx.putImageData(imgData, 0, 0);

     // Then draw the cropped region scaled to fill screen
     ctx.drawImage(upFullCanvas, srcX, srcY, srcW, srcH, 0, 0, cw, ch);
    }

      // --- Rendering ---
    function render() {
      const pixels = imgData.data;
      const t = performance.now() * 0.0003;
      const cw = canvas.width;
      const ch = canvas.height;

        // Background gradient: deep indigo-to-lavender
      const bgGrad = ctx.createRadialGradient(
        cw * 0.5, ch * 0.35, 0,
        cw * 0.5, ch * 0.35, Math.max(cw, ch) * 0.75
       );
      bgGrad.addColorStop(0, "#3d2b56");
      bgGrad.addColorStop(0.4, "#2a1b3d");
      bgGrad.addColorStop(1, "#1a1025");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, cw, ch);

      for (let y = 0; y < GRID; y++) {
        const rowOffset = y * GRID;
        const cosRow = Math.cos(y * 0.12 + t * 1.7);

        for (let x = 0; x < GRID; x++) {
          const i = rowOffset + x;
          const h = curr[i];
          const p4 = i << 2;

            // Height to color mapping with smoother interpolation
          const clip = h > 2 ? 2 : h < -2 ? -2 : h;
          const tNorm = (clip + 2) / 4; // normalize to [0,1]

            // Triphasic color: deep shadow -> base pudding -> highlight
           let r, g, b;
          if (tNorm < 0.5) {
             // Shadow to base: #130c1e -> #2A1B3D
            const u = tNorm * 2;
            r = 19 + (42 - 19) * u;
            g = 12 + (27 - 12) * u;
            b = 30 + (61 - 30) * u;
            } else {
             // Base to highlight: #2A1B3D -> #D4B8E0
            const u = (tNorm - 0.5) * 2;
            r = 42 + (212 - 42) * u;
            g = 27 + (184 - 27) * u;
            b = 61 + (224 - 61) * u;
            }

            // Specular bloom on ripple peaks
          if (h > 1.2) {
            const spec = Math.min(1, (h - 1.2) * 0.5);
            r += 160 * spec;
            g += 140 * spec;
            b += 155 * spec;
            }

            // Moonlight caustics: two-layer Perlin-like interference
          const sinX = Math.sin(x * 0.15 + t * 2.1);
          const caustic1 = sinX * cosRow * 0.18;
          const caustic2 = Math.sin((x + y) * 0.08 + t * 0.9) * 0.12;
          const caustic3 = Math.sin(x * 0.05 - y * 0.07 + t * 1.3) * 0.08;
          const caustic = caustic1 + caustic2 + caustic3;

          const cr = caustic * 55;
          const cg = caustic * 48;
          const cb = caustic * 65;

          pixels[p4]      = cr >= 0 ? Math.min(255, r + cr) | 0 : Math.max(0, r + cr) | 0;
          pixels[p4 + 1] = cg >= 0 ? Math.min(255, g + cg) | 0 : Math.max(0, g + cg) | 0;
          pixels[p4 + 2] = cb >= 0 ? Math.min(255, b + cb) | 0 : Math.max(0, b + cb) | 0;
          pixels[p4 + 3] = 255;
          }
        }

        // Put pixel data into the 64x64 source canvas
      upFullCtx.putImageData(imgData, 0, 0);

        // Upscale with bilinear smoothing and zoom crop
      renderZoomedGrid();

         // Moon glow overlay
      const moonT = performance.now() * 0.00015;
      const moonPulse = Math.sin(moonT) * 0.03 + 0.05;
      const moonGlow = ctx.createRadialGradient(
        cw * 0.5, ch * 0.25, 0,
        cw * 0.5, ch * 0.25, cw * 0.15
         );
      moonGlow.addColorStop(0, `rgba(212,184,224,${(moonPulse * 1.5).toFixed(3)})`);
      moonGlow.addColorStop(0.5, `rgba(212,184,224,${(moonPulse * 0.3).toFixed(3)})`);
      moonGlow.addColorStop(1, "rgba(212,184,224,0)");
      ctx.fillStyle = moonGlow;
      ctx.fillRect(0, 0, cw, ch);

         // Vignette overlay for depth
      const vigGrad = ctx.createRadialGradient(
        cw * 0.5, ch * 0.5, cw * 0.25,
        cw * 0.5, ch * 0.5, cw * 0.75
        );
      vigGrad.addColorStop(0, "rgba(0,0,0,0)");
      vigGrad.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = vigGrad;
      ctx.fillRect(0, 0, cw, ch);

         // Star-dust particles with glow
      if (pAlive > 0) {
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < PoolSize; i++) {
          if (!pActive[i]) continue;
          const screenX = (pX[i] / GRID) * cw;
          const screenY = (pY[i] / GRID) * ch;
          const alpha = pLife[i] * 0.6;
          const radius = 1.2 + pLife[i] * 2;

            // Outer glow
          ctx.beginPath();
          ctx.arc(screenX, screenY, radius * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(212,184,224,${(alpha * 0.2).toFixed(3)})`;
          ctx.fill();

            // Core
          ctx.beginPath();
          ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(230,215,240,${alpha.toFixed(3)})`;
          ctx.fill();
          }
        ctx.globalCompositeOperation = "source-over";
        }
      }

    // --- Particle update ---
   function updateParticles(dt) {
     for (let i = 0; i < PoolSize; i++) {
       if (!pActive[i]) continue;
       pX[i] += pVX[i];
       pY[i] += pVY[i];
       pLife[i] -= dt * 1.5;
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

     // --- Smooth interpolation and state update ---
   function updateInterp() {
     // Smooth velocity: lerp toward raw pointer velocity
     smoothVelocity += (ptrVelocity - smoothVelocity) * SMOOTH_ALPHA;
     // Smooth zoom: lerp toward target zoom
     smoothZoom += (targetZoom - smoothZoom) * SMOOTH_ALPHA;
     // Smooth pan: lerp toward target pan
     zoom += (targetZoom - zoom) * SMOOTH_ALPHA;
     panX += (targetPanX - panX) * SMOOTH_ALPHA;
     panY += (targetPanY - panY) * SMOOTH_ALPHA;
    }

    // --- Static gradient for reduced motion ---
    function renderStatic() {
      const cw = canvas.width;
      const ch = canvas.height;

       // Background gradient
      const bg = ctx.createRadialGradient(
        cw * 0.5, ch * 0.35, 0,
        cw * 0.5, ch * 0.35, Math.max(cw, ch) * 0.75
        );
      bg.addColorStop(0, "#3d2b56");
      bg.addColorStop(0.4, "#2a1b3d");
      bg.addColorStop(1, "#1a1025");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, cw, ch);

        // Moon glow
      const t = performance.now() * 0.00015;
      const shimmer = Math.sin(t) * 0.025 + 0.04;
      const moonGlow = ctx.createRadialGradient(
        cw * 0.5, ch * 0.3, 0,
        cw * 0.5, ch * 0.3, cw * 0.12
        );
      moonGlow.addColorStop(0, `rgba(212,184,224,${(shimmer * 1.5).toFixed(3)})`);
      moonGlow.addColorStop(0.6, `rgba(212,184,224,${(shimmer * 0.4).toFixed(3)})`);
      moonGlow.addColorStop(1, "rgba(212,184,224,0)");
      ctx.fillStyle = moonGlow;
      ctx.fillRect(0, 0, cw, ch);

        // Vignette
      const vig = ctx.createRadialGradient(
        cw * 0.5, ch * 0.5, cw * 0.3,
        cw * 0.5, ch * 0.5, cw * 0.75
        );
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.4)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, cw, ch);
      }

    // --- Main animation loop ---
   let lastTime = 0;
   let running = true;
   let rafId = null;
   let frameDropped = 0;

   const TARGET_FRAME_TIME = 1000 / 60;

   function loop(timestamp) {
     if (!running) return;

     if (!lastTime) {
       lastTime = timestamp;
       rafId = requestAnimationFrame(loop);
       return;
      }

     const delta = timestamp - lastTime;

      // Ensure we don't run too fast; maintain 60fps target
     if (delta < TARGET_FRAME_TIME * 0.8) {
       rafId = requestAnimationFrame(loop);
       return;
      }

     const dt = Math.min(delta / 1000, 0.05);
     lastTime = timestamp;
     frameDropped++;

     // Update smooth interpolation first
     updateInterp();

     if (reducedMotion) {
        // Static gradient mode
       renderStatic();
      } else {
        // Full simulation
       applyPointers();

        // Sub-step physics for numerical stability
       const subSteps = 2;
       for (let s = 0; s < subSteps; s++) {
         stepPhysics();
        }

       updateParticles(dt);
       maybeSpawnParticles();
       render();
      }

      // Audio modulation: velocity + zoom
     modAudio();

     // Decay raw velocity for smooth return to rest
     ptrVelocity *= 0.92;

     rafId = requestAnimationFrame(loop);
    }

    // --- Telemetry (dev only, stripped in prod) ---
   if (false) {
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
    }

    // --- Cleanup on page hide ---
   document.addEventListener("visibilitychange", () => {
     if (document.hidden) {
       running = false;
       if (rafId) cancelAnimationFrame(rafId);
       lastTime = 0;
      } else {
       running = true;
       lastTime = 0;
       rafId = requestAnimationFrame(loop);
      }
    });

    // --- Launch ---
   rafId = requestAnimationFrame(loop);
})();
