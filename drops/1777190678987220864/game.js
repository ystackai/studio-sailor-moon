(function () {
    'use strict';

    // -- Canvas Setup --
    const canvas = document.getElementById('sim');
    const ctx = canvas.getContext('2d');
    const overlay = document.getElementById('overlay');
    const freeBtn = document.getElementById('free-btn');
    const dlBtn = document.getElementById('dl-btn');
    const downloadUi = document.getElementById('download-ui');
    const ui = document.getElementById('ui');
    const hintText = document.getElementById('hint-text');

    let W, H;
    let frozen = false;
    let screenshotMode = false;
    let audioInitiated = false;
    let hintOpacity = 1;

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
        initGrid();
        buildOverlay();
        initOffscreen();
    }

    // -- Fluid Simulation: Damped Wave Equation --
    const RES = 4;
    let cols, rows;
    let current, prev;
    let simTemp;

    function initGrid() {
        cols = Math.ceil(W / RES) + 2;
        rows = Math.ceil(H / RES) + 2;
        current = new Float32Array(cols * rows);
        prev = new Float32Array(cols * rows);
        if (!simTemp) simTemp = new Float32Array(cols * rows);
        else simTemp = new Float32Array(Math.max(simTemp.length, cols * rows));
    }

    const VISCOSITY = 0.962;
    const SPEED = 0.25;

    function simulate() {
        const n = cols * rows;
        for (let y = 1; y < rows - 1; y++) {
            const rowOff = y * cols;
            const rowUp = (y - 1) * cols;
            const rowDn = (y + 1) * cols;
            for (let x = 1; x < cols - 1; x++) {
                const i = rowOff + x;
                simTemp[i] = (
                    current[i - 1] +
                    current[i + 1] +
                    current[rowUp + x] +
                    current[rowDn + x]
                ) * 0.5 - prev[i];
                simTemp[i] *= VISCOSITY;
            }
        }
        const t = prev;
        prev = current;
        current = simTemp;
        simTemp = t;
    }

    function dropRipple(cx, cy, amplitude) {
        const r = Math.max(3, Math.floor(18 / RES));
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

    // -- Offscreen Rendering (scaled down for performance) --
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: false });
    let offW, offH;

    function initOffscreen() {
        offW = Math.ceil(W / RES);
        offH = Math.ceil(H / RES);
        offCanvas.width = offW;
        offCanvas.height = offH;
    }
    initOffscreen();

    // Pre-warm with initial gentle ripples
    let initRipples = 0;

    function render(time) {
        if (initRipples < 5) {
            dropRipple(
                Math.random() * W,
                Math.random() * H * 0.4,
                25 * (1 + initRipples * 0.3)
            );
            initRipples++;
        }

        const imgData = offCtx.createImageData(offW, offH);
        const px = imgData.data;

        for (let y = 1; y < rows - 1; y++) {
            const yRow = y * cols;
            const yRowUp = (y - 1) * cols;
            const yRowDn = (y + 1) * cols;
            for (let x = 1; x < cols - 1; x++) {
                const i = yRow + x;
                const v = current[i];

                // Gradient for pseudo-specular highlights
                const gradX = (current[i + 1] - current[i - 1]) * SPEED * 40;
                const gradY = (current[yRowDn + x] - current[yRowUp + x]) * SPEED * 40;
                const gradMag = Math.sqrt(gradX * gradX + gradY * gradY);

                const idx = ((y - 1) * offW + (x - 1)) * 4;

                // Warm honey-gold palette with gradient-based specular
                const r = 185 + v * 55 + gradX * 6 + gradMag * 20;
                const g = 125 + v * 32 + gradX * 3 + gradMag * 10;
                const b = 18 + v * 12 + gradMag * 5;

                // Vignette: darker at edges
                const nx = (x - 1) / (offW - 1);
                const ny = (y - 1) / (offH - 1);
                const vig = 0.65 + 0.35 * Math.min(1, 2 * (1 - Math.sqrt((nx - 0.5) * (nx - 0.5) + (ny - 0.5) * (ny - 0.5))));

                px[idx]      = Math.max(0, Math.min(255, r * vig));
                px[idx + 1] = Math.max(0, Math.min(255, g * vig));
                px[idx + 2] = Math.max(0, Math.min(255, b * vig));
                px[idx + 3] = 255;
              }
          }
        }

        offCtx.putImageData(imgData, 0, 0);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(offCanvas, 0, 0, W, H);

        // Subtle glow overlay for warmth
        if (audioAmplitude > 0.02) {
            ctx.save();
            ctx.globalAlpha = audioAmplitude * 0.08;
            ctx.globalCompositeOperation = 'screen';
            const glow = ctx.createRadialGradient(W * 0.5, H * 0.4, 0, W * 0.5, H * 0.4, W * 0.6);
            glow.addColorStop(0, 'rgba(255, 200, 100, 1)');
            glow.addColorStop(1, 'rgba(255, 150, 50, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
    }

    // -- Audio Engine: Full procedural chain --
    let audioCtx = null;
    let droneGain = null;
    let compNode = null;
    let masterGain = null;
    let analyserNode = null;
    let audioStarted = false;
    let envGainNode = null;
    let sidechainGainNode = null;

    // Honey-melt envelope
    let envPhase = 'idle';
    let envValue = 0;
    const ENV_ATTACK = 0.4;
    const ENV_SUSTAIN = 0.55;
    const ENV_RELEASE = 0.8;

    function initAudio() {
        if (audioStarted) return;
        audioStarted = true;

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        // 24dB/octave high-pass at 80Hz: cascade two 2nd-order BiquadFilters
        const hp1 = audioCtx.createBiquadFilter();
        hp1.type = 'highpass';
        hp1.frequency.value = 80;
        hp1.Q.value = 0.707;

        const hp2 = audioCtx.createBiquadFilter();
        hp2.type = 'highpass';
        hp2.frequency.value = 80;
        hp2.Q.value = 0.707;

        // Soft-knee compressor at -3dB threshold
        compNode = audioCtx.createDynamicsCompressor();
        compNode.threshold = -3;
        compNode.knee = 10;
        compNode.ratio = 12;
        compNode.attack = 0.003;
        compNode.release = 0.15;

        // Analyser for amplitude tracking
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 256;
        analyserNode.smoothingTimeConstant = 0.7;

        // Drone mix gain
        droneGain = audioCtx.createGain();
        droneGain.gain.value = 0.1;

        // Envelope gain (honey-melt: slow attack, exponential release)
        envGainNode = audioCtx.createGain();
        envGainNode.gain.value = ENV_SUSTAIN;

        // Sidechain ducking gain
        sidechainGainNode = audioCtx.createGain();
        sidechainGainNode.gain.value = 1;

        // Master gain
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.75;

        // 3 oscillators: base (55Hz sine), warmth (55.4Hz sine), harmonic (110Hz triangle)
        const osc1 = audioCtx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 55;

        const osc2 = audioCtx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 55.4;

        const osc3 = audioCtx.createOscillator();
        osc3.type = 'triangle';
        osc3.frequency.value = 110;

        const g3 = audioCtx.createGain();
        g3.gain.value = 0.25;

        // Signal chain:
        // [osc1, osc2] -> droneGain -> [osc3 -> g3] -> droneGain
        // droneGain -> hp1 -> hp2 -> compNode -> sidechainGain -> envGain -> analyser -> master -> dest
        osc1.connect(droneGain);
        osc2.connect(droneGain);
        osc3.connect(g3);
        g3.connect(droneGain);

        droneGain.connect(hp1);
        hp1.connect(hp2);
        hp2.connect(compNode);
        compNode.connect(sidechainGainNode);
        sidechainGainNode.connect(envGainNode);
        envGainNode.connect(analyserNode);
        analyserNode.connect(masterGain);
        masterGain.connect(audioCtx.destination);

        osc1.start();
        osc2.start();
        osc3.start();

        // Gentle fade-in
        const t = audioCtx.currentTime;
        envGainNode.gain.setValueAtTime(0.001, t);
        envGainNode.gain.exponentialRampToValueAtTime(ENV_SUSTAIN, t + ENV_ATTACK + 0.3);
        envPhase = 'sustain';

        // Hide hint on first audio init
        if (hintText) {
            hintOpacity = 0;
            hintText.style.opacity = '0';
        }
    }

    function triggerEnvelope() {
        if (!audioCtx || !envGainNode) return;
        const t = audioCtx.currentTime;
        envGainNode.gain.cancelScheduledValues(t);
        envGainNode.gain.setValueAtTime(Math.max(envValue, 0.001), t);
        envGainNode.gain.exponentialRampToValueAtTime(0.85, t + ENV_ATTACK);
        envPhase = 'attack';
    }

    function releaseEnvelope() {
        if (!audioCtx || !envGainNode) return;
        const t = audioCtx.currentTime;
        envGainNode.gain.cancelScheduledValues(t);
        envGainNode.gain.setValueAtTime(envGainNode.gain.value, t);
        envGainNode.gain.exponentialRampToValueAtTime(ENV_SUSTAIN, t + ENV_RELEASE);
        envPhase = 'release';
    }

    let sidechainActive = false;
    let currentInputAmp = 0;
    let targetInputAmp = 0;

    function duckDrone() {
        if (!audioCtx || !sidechainGainNode) return;
        const t = audioCtx.currentTime;
        const target = sidechainActive ? 0.18 : 1.0;
        sidechainGainNode.gain.setTargetAtTime(target, t, 0.015);
    }

    function getAudioAmplitude() {
        if (!analyserNode) return 0;
        const data = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        return sum / data.length / 255;
    }

    // -- SVG Overlay: Detailed Park Bench + Strawberry Mochi --
    function buildOverlay() {
        overlay.setAttribute('viewBox', `0 0 ${W} ${H}`);
        const ox = W * 0.12;
        const oy = H * 0.72;
        const benchW = Math.max(280, W * 0.35);
        const mochiCx = ox + benchW * 0.35;
        const mochiCy = oy - 50;

        overlay.innerHTML = `
<defs>
  <linearGradient id="benchGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#9B7040"/>
    <stop offset="100%" stop-color="#5C3A1E"/>
  </linearGradient>
  <linearGradient id="backGrad" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#7A6038"/>
    <stop offset="100%" stop-color="#4A2E15"/>
  </linearGradient>
  <radialGradient id="mochiGrad" cx="45%" cy="35%" r="55%">
    <stop offset="0%" stop-color="#FFF5F2"/>
    <stop offset="60%" stop-color="#FFB6C1"/>
    <stop offset="100%" stop-color="#FF9AAF"/>
  </radialGradient>
  <radialGradient id="berryGrad" cx="48%" cy="38%" r="52%">
    <stop offset="0%" stop-color="#FF5577"/>
    <stop offset="80%" stop-color="#DD2255"/>
    <stop offset="100%" stop-color="#AA1144"/>
  </radialGradient>
  <linearGradient id="leafGrad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#4CAF50"/>
    <stop offset="100%" stop-color="#2D7B3E"/>
  </linearGradient>
  <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
    <feOffset dx="1" dy="2"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.2"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>

<!-- Park bench -->
<g id="bench-group" opacity="0.7">
  <!-- Backrest -->
  <rect x="${ox}" y="${oy - 55}" width="${benchW}" height="7" rx="3" fill="url(#backGrad)"/>
  <rect x="${ox + 25}" y="${oy - 62}" width="7" height="62" rx="2" fill="url(#backGrad)"/>
  <rect x="${ox + benchW - 32}" y="${oy - 62}" width="7" height="62" rx="2" fill="url(#backGrad)"/>
  <!-- Seat -->
  <rect x="${ox - 5}" y="${oy}" width="${benchW + 10}" height="9" rx="3" fill="url(#benchGrad)"/>
  <!-- Legs -->
  <rect x="${ox + 12}" y="${oy + 9}" width="8" height="50" rx="2" fill="url(#benchGrad)" opacity="0.8"/>
  <rect x="${ox + benchW - 18}" y="${oy + 9}" width="8" height="50" rx="2" fill="url(#benchGrad)" opacity="0.8"/>
  <!-- Leg crossbar -->
  <rect x="${ox + 12}" y="${oy + 42}" width="${benchW - 22}" height="4" rx="1.5" fill="url(#benchGrad)" opacity="0.5"/>
</g>

<!-- Strawberry mochi (half-eaten) -->
<g id="mochi-group" filter="url(#softShadow)">
  <!-- Mochi body -->
  <ellipse cx="${mochiCx}" cy="${mochiCy}" rx="28" ry="22" fill="url(#mochiGrad)"/>
  <!-- Bite mark (eaten portion) -->
  <ellipse cx="${mochiCx + 22}" cy="${mochiCy - 6}" rx="14" ry="16" fill="#1a1008" opacity="0.85"/>
  <!-- Exposed strawberry filling -->
  <ellipse cx="${mochiCx + 10}" cy="${mochiCy - 2}" rx="15" ry="12" fill="url(#berryGrad)"/>
  <!-- Berry seeds -->
  <ellipse cx="${mochiCx + 5}" cy="${mochiCy - 6}" rx="1.5" ry="2" fill="#FFCC44" opacity="0.7"/>
  <ellipse cx="${mochiCx + 13}" cy="${mochiCy - 2}" rx="1.5" ry="2" fill="#FFCC44" opacity="0.7"/>
  <ellipse cx="${mochiCx + 8}" cy="${mochiCy + 3}" rx="1.5" ry="2" fill="#FFCC44" opacity="0.7"/>
  <ellipse cx="${mochiCx + 16}" cy="${mochiCy + 1}" rx="1.5" ry="2" fill="#FFCC44" opacity="0.7"/>
  <!-- Berry leaf -->
  <path d="M${mochiCx + 10},${mochiCy - 14} Q${mochiCx + 3},${mochiCy - 22} ${mochiCx - 2},${mochiCy - 16} Q${mochiCx + 2},${mochiCy - 13} ${mochiCx + 10},${mochiCy - 14}" fill="url(#leafGrad)" opacity="0.8"/>
  <path d="M${mochiCx + 8},${mochiCy - 15} Q${mochiCx + 14},${mochiCy - 20} ${mochiCx + 18},${mochiCy - 14}" fill="none" stroke="url(#leafGrad)" stroke-width="1.5" opacity="0.6"/>
  <!-- Mochi gloss highlight -->
  <ellipse cx="${mochiCx - 10}" cy="${mochiCy - 12}" rx="8" ry="5" fill="rgba(255,255,255,0.25)"/>
  <!-- Honey drip from mochi -->
  <path d="M${mochiCx - 5},${mochiCy + 18} Q${mochiCx - 8},${mochiCy + 30} ${mochiCx - 6},${mochiCy + 38}" fill="none" stroke="rgba(255,180,60,0.5)" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="${mochiCx - 6}" cy="${mochiCy + 39}" rx="3" ry="4" fill="rgba(255,180,60,0.4)"/>
</g>
`;
    }
    buildOverlay();

    // -- Input Handling --
    let pointerDown = false;
    let inputX = 0, inputY = 0;
    let inputPressure = 0;
    let inputStartTime = 0;
    let pressDuration = 0;

    function handlePointer(x, y, isDown, pressure) {
        if (frozen) return;
        initAudio();
        inputX = x;
        inputY = y;
        inputPressure = pressure || 0.5;

        if (isDown) {
            inputStartTime = performance.now();
            pressDuration = 0;
            triggerEnvelope();
        } else {
            pressDuration = performance.now() - inputStartTime;
            releaseEnvelope();
        }

        const pressFactor = Math.max(0.3, Math.min(1.5, inputPressure));
        const durFactor = Math.max(0.5, Math.min(2, 1 + pressDuration / 500));

        const amplitude = isDown
            ? 80 * pressFactor * durFactor
            : -30 * pressFactor;

        dropRipple(x, y, amplitude);

        targetInputAmp = isDown ? inputPressure : 0;

        if (isDown && !sidechainActive) {
            sidechainActive = true;
        } else if (!isDown) {
            sidechainActive = false;
        }
        duckDrone();
    }

    canvas.addEventListener('pointerdown', e => {
        e.preventDefault();
        handlePointer(e.clientX, e.clientY, true, e.pressure);
        pointerDown = true;
    }, { passive: false });

    canvas.addEventListener('pointermove', e => {
        e.preventDefault();
        if (pointerDown) {
            pressDuration = performance.now() - inputStartTime;
            handlePointer(e.clientX, e.clientY, true, e.pressure);
        }
    }, { passive: false });

    canvas.addEventListener('pointerup', e => {
        e.preventDefault();
        if (pointerDown) {
            handlePointer(e.clientX, e.clientY, false, e.pressure);
        }
        pointerDown = false;
        pressDuration = 0;
    }, { passive: false });

    canvas.addEventListener('pointercancel', () => {
        pointerDown = false;
        sidechainActive = false;
        pressDuration = 0;
        duckDrone();
    }, { passive: false });

    // -- Keyboard shortcuts --
    document.addEventListener('keydown', e => {
        if (e.key === 'f' || e.key === 'F') {
            e.preventDefault();
            toggleFreeze();
        } else if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            if (frozen) captureScreenshot();
        }
    });

    // -- Freeze / Unfreeze --
    function toggleFreeze() {
        initAudio();
        frozen = !frozen;
        freeBtn.classList.toggle('active', frozen);
        document.body.classList.toggle('frozen', frozen);

        if (frozen) {
            screenshotMode = true;
            overlay.style.display = 'block';
            ui.style.display = 'none';
            downloadUi.style.display = 'block';
        } else {
            screenshotMode = false;
            overlay.style.display = 'none';
            downloadUi.style.display = 'none';
            ui.style.display = 'block';
        }
    }

    freeBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleFreeze();
    });

      // -- Screenshot Capture --
    function captureScreenshot() {
         // Composite canvas + overlay onto a temp canvas (no UI elements)
        const snap = document.createElement('canvas');
        snap.width = W;
        snap.height = H;
        const sCtx = snap.getContext('2d');

         // Draw the fluid sim
        sCtx.drawImage(canvas, 0, 0);

         // Draw the SVG overlay by serializing to SVG blob
        const svgStr = '<?xml version="1.0" encoding="UTF-8"?>' +
             `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${overlay.innerHTML}</svg>`;
        const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
            sCtx.drawImage(img, 0, 0, W, H);
            URL.revokeObjectURL(url);
            snap.toBlob(blob => {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'honey-melt-' + Date.now() + '.png';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(a.href);
                 }, 150);
             }, 'image/png');
         };
        img.src = url;
    }

    if (dlBtn) {
        dlBtn.addEventListener('click', e => {
            e.stopPropagation();
            captureScreenshot();
        });
    }

    // -- Ambient Drip (layered ripples) --
    let lastDrip = 0;

    function ambientDrip(now) {
        if (frozen) return;
        const interval = 3500;
        if (now - lastDrip > interval) {
            lastDrip = now;
            const count = 1 + Math.floor(Math.random() * 2);
            for (let i = 0; i < count; i++) {
                dropRipple(
                    Math.random() * W * 0.8 + W * 0.1,
                    Math.random() * H * 0.5 + H * 0.05,
                    12 + Math.random() * 18
                );
            }
        }
    }

    // -- Main Loop --
    let audioAmplitude = 0;
    let smoothAmp = 0;

    function loop(now) {
        requestAnimationFrame(loop);

         // Smooth input amplitude
        currentInputAmp += (targetInputAmp - currentInputAmp) * 0.1;

         // Fade hint text smoothly
        if (hintOpacity > 0 && !audioStarted) {
            hintOpacity = Math.max(0, hintOpacity - 0.005);
            hintText.style.opacity = String(hintOpacity);
        }
        if (hintOpacity <= 0 && hintText) {
            hintText.style.opacity = '0';
        }

        if (!frozen) {
            simulate();
            ambientDrip(now);
         }

        render(now);

        if (audioStarted) {
            audioAmplitude = getAudioAmplitude();
            smoothAmp += (audioAmplitude - smoothAmp) * 0.08;

             // Update env value from audio node
            envValue = envGainNode ? envGainNode.gain.value : 0;

            const benchGroup = overlay.querySelector('#bench-group');
            const mochiGroup = overlay.querySelector('#mochi-group');

             // Audio-driven sway (always, not just when interacting)
            const swX = Math.sin(now / 2000) * envValue * 8;
            const swY = Math.cos(now / 2800) * envValue * 4;
            const swR = Math.sin(now / 3200) * envValue * 2;

            if (benchGroup) {
                benchGroup.setAttribute('transform', `translate(${swX * 0.3}, ${swY * 0.2})`);
             }
            if (mochiGroup) {
                const benchOrigX = W * 0.12 + Math.max(280, W * 0.35) * 0.35;
                const benchOrigY = H * 0.72 - 50;
                mochiGroup.setAttribute('transform',
                     `translate(${swX}, ${swY}) rotate(${swR}, ${benchOrigX}, ${benchOrigY}) scale(${1 + envValue * 0.04})`);
             }

             // Live overlay visibility in non-frozen state for ambient prop
            if (!frozen) {
                overlay.style.display = 'block';
                overlay.style.opacity = String(0.3 + smoothAmp * 0.5);
            }
        }
    }

    requestAnimationFrame(loop);

     // Window resize handler
    window.addEventListener('resize', resize);
    resize();
})();
