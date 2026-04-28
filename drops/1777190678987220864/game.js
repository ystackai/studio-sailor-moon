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

                // Position-dependent base gradient (warmer top-right, deeper bottom-left)
                const nx = (x - 1) / Math.max(1, offW - 1);
                const ny = (y - 1) / Math.max(1, offH - 1);
                const posWarm = 0.7 + 0.3 * (nx * 0.6 + ny * 0.4);

                // Gradient for pseudo-specular highlights
                const gradX = (current[i + 1] - current[i - 1]) * SPEED * 40;
                const gradY = (current[yRowDn + x] - current[yRowUp + x]) * SPEED * 40;
                const gradMag = Math.sqrt(gradX * gradX + gradY * gradY);

                const idx = ((y - 1) * offW + (x - 1)) * 4;

                // Warm honey-gold palette with position-dependent gradient mesh
                // Base colors shift across the canvas for organic warmth
                const baseR = (175 + 35 * nx) * posWarm;
                const baseG = (115 + 25 * ny) * posWarm;
                const baseB = (12 + 18 * (1 - nx)) * posWarm;

                // Specular highlight: strong where gradient faces "view"
                const specHighlight = Math.pow(Math.max(0, gradMag / 80), 1.8) * 90;

                // Final pixel with layered contributions
                let r = baseR + v * 55 + gradX * 6 + gradMag * 20 + specHighlight;
                let g = baseG + v * 32 + gradX * 3 + gradMag * 10 + specHighlight * 0.6;
                let b = baseB + v * 12 + gradMag * 5 + specHighlight * 0.15;

                // Vignette: darker at edges for depth
                const vig = 0.55 + 0.45 * Math.min(1, 2 * (1 - Math.sqrt((nx - 0.5) * (nx - 0.5) * 1.3 + (ny - 0.5) * (ny - 0.5))));

                px[idx]       = Math.max(0, Math.min(255, r * vig));
                px[idx + 1] = Math.max(0, Math.min(255, g * vig));
                px[idx + 2] = Math.max(0, Math.min(255, b * vig));
                px[idx + 3] = 255;
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
        compNode.threshold.value = -3;
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
    let duckDepth = 0;

    function duckDrone() {
        if (!audioCtx || !sidechainGainNode) return;
        const t = audioCtx.currentTime;
        const depth = sidechainActive ? (0.15 + currentInputAmp * 0.5) : 1.0;
        sidechainGainNode.gain.setTargetAtTime(Math.max(0.08, depth), t, 0.012);
        duckDepth = depth;
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
        W = Number.isFinite(W) && W > 0 ? W : window.innerWidth;
        H = Number.isFinite(H) && H > 0 ? H : window.innerHeight;
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
    <radialGradient id="fillingGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FF4466"/>
      <stop offset="100%" stop-color="#CC2244"/>
    </radialGradient>
    <linearGradient id="leafGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4CAF50"/>
      <stop offset="100%" stop-color="#2D7B3E"/>
    </linearGradient>
    <radialGradient id="shadowGrad" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(0,0,0,0.25)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
      <feOffset dx="1" dy="2"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.2"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="benchGlow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
</defs>

<!-- Park bench -->
<g id="bench-group" opacity="0.75" filter="url(#benchGlow)">
   <!-- Bench shadow on ground -->
   <ellipse cx="${ox + benchW / 2}" cy="${oy + 62}" rx="${benchW * 0.32}" ry="8" fill="url(#shadowGrad)"/>
   <!-- Top backrest rail -->
    <rect x="${ox}" y="${oy - 65}" width="${benchW}" height="5" rx="2.5" fill="url(#backGrad)"/>
   <!-- Backrest middle rail -->
    <rect x="${ox}" y="${oy - 50}" width="${benchW}" height="6" rx="3" fill="url(#backGrad)"/>
   <!-- Backrest bottom rail -->
    <rect x="${ox}" y="${oy - 36}" width="${benchW}" height="5" rx="2.5" fill="url(#backGrad)"/>
   <!-- Back posts -->
    <rect x="${ox + 22}" y="${oy - 68}" width="6" height="72" rx="2" fill="url(#backGrad)"/>
    <rect x="${ox + benchW - 28}" y="${oy - 68}" width="6" height="72" rx="2" fill="url(#backGrad)"/>
    <!-- Arm rests -->
    <rect x="${ox - 3}" y="${oy - 28}" width="6" height="32" rx="2.5" fill="url(#benchGrad)"/>
    <rect x="${ox + benchW - 3}" y="${oy - 28}" width="6" height="32" rx="2.5" fill="url(#benchGrad)"/>
    <!-- Arm rest tops -->
    <rect x="${ox - 6}" y="${oy - 31}" width="12" height="4" rx="2" fill="url(#benchGrad)"/>
    <rect x="${ox + benchW - 6}" y="${oy - 31}" width="12" height="4" rx="2" fill="url(#benchGrad)"/>
    <!-- Seat planks -->
    <rect x="${ox - 5}" y="${oy - 2}" width="${benchW + 10}" height="6" rx="2" fill="url(#benchGrad)"/>
    <rect x="${ox - 5}" y="${oy + 5}" width="${benchW + 10}" height="6" rx="2" fill="url(#benchGrad)" opacity="0.85"/>
   <!-- Seat highlight -->
    <rect x="${ox - 4}" y="${oy - 1}" width="${benchW + 8}" height="1.5" rx="0.5" fill="rgba(255,220,160,0.15)"/>
    <!-- Legs -->
    <rect x="${ox + 15}" y="${oy + 11}" width="7" height="48" rx="2" fill="url(#benchGrad)" opacity="0.85"/>
    <rect x="${ox + benchW - 21}" y="${oy + 11}" width="7" height="48" rx="2" fill="url(#benchGrad)" opacity="0.85"/>
   <!-- Leg foot pads -->
    <ellipse cx="${ox + 18.5}" cy="${oy + 60}" rx="6" ry="3" fill="url(#benchGrad)" opacity="0.6"/>
    <ellipse cx="${ox + benchW - 17.5}" cy="${oy + 60}" rx="6" ry="3" fill="url(#benchGrad)" opacity="0.6"/>
    <!-- Leg crossbar -->
    <rect x="${ox + 14}" y="${oy + 40}" width="${benchW - 24}" height="3.5" rx="1.5" fill="url(#benchGrad)" opacity="0.5"/>
</g>

<!-- Strawberry mochi (half-eaten) -->
<g id="mochi-group" filter="url(#softShadow)">
   <!-- Mochi shadow on bench -->
    <ellipse cx="${mochiCx}" cy="${mochiCy + 26}" rx="20" ry="4" fill="rgba(0,0,0,0.15)"/>
   <!-- Mochi body (soft rice exterior) -->
    <ellipse cx="${mochiCx}" cy="${mochiCy}" rx="30" ry="24" fill="url(#mochiGrad)"/>
   <!-- Mochi inner highlight for soft texture -->
    <ellipse cx="${mochiCx - 6}" cy="${mochiCy - 6}" rx="18" ry="14" fill="rgba(255,240,235,0.2)"/>
   <!-- Bite mark (eaten portion - uses dark to cut into mochi) -->
   <path d="M${mochiCx + 18},${mochiCy - 18} C${mochiCx + 30},${mochiCy - 8} ${mochiCx + 26},${mochiCy + 12} ${mochiCx + 16},${mochiCy + 16} Z" fill="#2a1a0a" opacity="0.8"/>
   <!-- Exposed strawberry filling (visible through bite) -->
   <ellipse cx="${mochiCx + 14}" cy="${mochiCy - 2}" rx="12" ry="10" fill="url(#fillingGrad)"/>
   <!-- Filling highlight/juice -->
    <ellipse cx="${mochiCx + 11}" cy="${mochiCy - 5}" rx="5" ry="4" fill="rgba(255,150,180,0.35)"/>
   <!-- Berry seeds scattered on exposed filling -->
    <ellipse cx="${mochiCx + 9}" cy="${mochiCy - 7}" rx="1.2" ry="1.8" fill="#FFDD66" opacity="0.8"/>
    <ellipse cx="${mochiCx + 16}" cy="${mochiCy - 4}" rx="1.2" ry="1.8" fill="#FFDD66" opacity="0.8"/>
    <ellipse cx="${mochiCx + 11}" cy="${mochiCy + 1}" rx="1.2" ry="1.8" fill="#FFDD66" opacity="0.8"/>
    <ellipse cx="${mochiCx + 18}" cy="${mochiCy - 1}" rx="1.2" ry="1.8" fill="#FFDD66" opacity="0.7"/>
    <ellipse cx="${mochiCx + 14}" cy="${mochiCy + 4}" rx="1.2" ry="1.8" fill="#FFDD66" opacity="0.7"/>
   <!-- Berry calyx (leafy top) -->
   <path d="M${mochiCx + 14},${mochiCy - 12} Q${mochiCx + 6},${mochiCy - 20} ${mochiCx},${mochiCy - 14} Q${mochiCx + 4},${mochiCy - 10} ${mochiCx + 14},${mochiCy - 12}" fill="url(#leafGrad)" opacity="0.85"/>
   <path d="M${mochiCx + 12},${mochiCy - 13} Q${mochiCx + 16},${mochiCy - 20} ${mochiCx + 22},${mochiCy - 15}" fill="none" stroke="url(#leafGrad)" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
    <path d="M${mochiCx + 13},${mochiCy - 12} Q${mochiCx + 10},${mochiCy - 18} ${mochiCx + 4},${mochiCy - 16}" fill="none" stroke="url(#leafGrad)" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
   <!-- Mochi glossy highlight (wet, soft look) -->
    <ellipse cx="${mochiCx - 12}" cy="${mochiCy - 14}" rx="10" ry="6" fill="rgba(255,255,255,0.3)"/>
    <ellipse cx="${mochiCx - 14}" cy="${mochiCy - 15}" rx="4" ry="2.5" fill="rgba(255,255,255,0.5)"/>
   <!-- Honey drip from mochi onto bench -->
    <path d="M${mochiCx - 8},${mochiCy + 20} Q${mochiCx - 12},${mochiCy + 35} ${mochiCx - 10},${mochiCy + 44} Q${mochiCx - 9},${mochiCy + 46} ${mochiCx - 7},${mochiCy + 44}" fill="rgba(255,180,60,0.55)" stroke="none"/>
    <ellipse cx="${mochiCx - 8}" cy="${mochiCy + 46}" rx="4" ry="5" fill="rgba(255,180,60,0.45)"/>
   <!-- Small drip pool on bench -->
    <ellipse cx="${mochiCx - 6}" cy="${mochiCy + 50}" rx="8" ry="3" fill="rgba(255,170,50,0.2)"/>
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

            // Subtle input-driven warmth boost during interaction
            const inputWarmth = currentInputAmp * 0.03;

            const benchGroup = overlay.querySelector('#bench-group');
            const mochiGroup = overlay.querySelector('#mochi-group');

            // Audio-driven sway (always, not just when interacting)
            const swX = Math.sin(now / 2000) * envValue * 8 + currentInputAmp * 2;
            const swY = Math.cos(now / 2800) * envValue * 4;
            const swR = Math.sin(now / 3200) * envValue * 2.5;

            if (benchGroup) {
                benchGroup.setAttribute('transform', `translate(${swX * 0.3}, ${swY * 0.2})`);
              }
            if (mochiGroup) {
                const benchOrigX = W * 0.12 + Math.max(280, W * 0.35) * 0.35;
                const benchOrigY = H * 0.72 - 50;
                mochiGroup.setAttribute('transform',
                      `translate(${swX}, ${swY}) rotate(${swR}, ${benchOrigX}, ${benchOrigY}) scale(${1 + envValue * 0.04 + inputWarmth})`);
              }

            // Live overlay visibility in non-frozen state for ambient prop
            if (!frozen) {
                overlay.style.display = 'block';
                overlay.style.opacity = String(0.25 + smoothAmp * 0.55 + inputWarmth * 2);
              }
          }
    }

    requestAnimationFrame(loop);

     // Window resize handler
    window.addEventListener('resize', resize);
    resize();
})();
