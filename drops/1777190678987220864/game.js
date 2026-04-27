(function () {
    'use strict';

    // -- Canvas Setup --
    const canvas = document.getElementById('sim');
    const ctx = canvas.getContext('2d');
    const overlay = document.getElementById('overlay');
    const freeBtn = document.getElementById('free-btn');
    const ui = document.getElementById('ui');

    let W, H;
    let frozen = false;
    let screenshotMode = false;

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
        initGrid();
        buildOverlay();
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

    function dropRipple(cx, cy, amplitude, decay) {
        const r = Math.max(3, Math.floor(16 / RES));
        const gx = Math.floor(cx / RES);
        const gy = Math.floor(cy / RES);
        const effectiveAmp = amplitude * (decay ? decay : 1);

        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > r) continue;
                const px = gx + dx;
                const py = gy + dy;
                if (px < 1 || px >= cols - 1 || py < 1 || py >= rows - 1) continue;
                const falloff = 1 - dist / r;
                current[py * cols + px] += effectiveAmp * falloff * falloff;
            }
        }
    }

    // -- Optimized Rendering: Offscreen scaled canvas --
    const offCanvas = document.createElement('canvas');
    const offCtx = offCanvas.getContext('2d');
    let offWidth, offHeight;

    function resizeOffscreen() {
        offWidth = Math.ceil(W / RES);
        offHeight = Math.ceil(H / RES);
        offCanvas.width = offWidth;
        offCanvas.height = offHeight;
    }
    resizeOffscreen();
    window.addEventListener('resize', resizeOffscreen);

    function render() {
        const imgData = offCtx.createImageData(offWidth, offHeight);
        const pixels = imgData.data;

        for (let y = 0; y < rows - 1; y++) {
            for (let x = 0; x < cols - 1; x++) {
                const val = previous[y * cols + x];
                const gradient = (previous[y * cols + x + 1] - previous[y * cols + x - 1]) * SPEED * 50;

                const idx = (y * offWidth + x) * 4;

                const baseR = 200 + val * 40 + gradient * 8;
                const baseG = 140 + val * 25 + gradient * 4;
                const baseB = 20 + val * 10;

                pixels[idx]     = Math.max(0, Math.min(255, baseR));
                pixels[idx + 1] = Math.max(0, Math.min(255, baseG));
                pixels[idx + 2] = Math.max(0, Math.min(255, baseB));
                pixels[idx + 3] = 255;
            }
        }

        offCtx.putImageData(imgData, 0, 0);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(offCanvas, 0, 0, W, H);
    }

    // -- Audio Engine --
    let audioCtx = null;
    let droneGain = null;
    let compNode = null;
    let masterGain = null;
    let lpfNode = null;
    let analyserNode = null;
    let audioStarted = false;

    // Honey-melt envelope state
    let envPhase = 'idle'; // idle | attack | sustain | release
    let envValue = 0;
    const ENV_ATTACK = 0.4;    // slow attack (0.4s)
    const ENV_SUSTAIN_LEVEL = 0.6;
    const ENV_RELEASE = 0.8;    // exponential release (0.8s)
    let envGainNode = null;
    let sidechainGainNode = null;

    function initAudio() {
        if (audioStarted) return;
        audioStarted = true;

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // 24dB/octave high-pass at 80Hz: cascade two 2nd-order (12dB/oct each) BiquadFilters
        const hp1 = audioCtx.createBiquadFilter();
        hp1.type = 'highpass';
        hp1.frequency.value = 80;
        hp1.Q.value = 0.707;

        const hp2 = audioCtx.createBiquadFilter();
        hp2.type = 'highpass';
        hp2.frequency.value = 80;
        hp2.Q.value = 0.707;

        lpfNode = hp1; // keep reference for compatibility

        // Compressor: soft-knee at -3dB threshold, -3dBFS guard
        compNode = audioCtx.createDynamicsCompressor();
        compNode.threshold = -3;
        compNode.knee = 10;
        compNode.ratio = 12;
        compNode.attack = 0.003;
        compNode.release = 0.15;

        // Analyser for amplitude tracking and sidechain
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 256;
        analyserNode.smoothingTimeConstant = 0.7;

        // Drone gain (oscillator mix volume)
        droneGain = audioCtx.createGain();
        droneGain.gain.value = 0.12;

        // Envelope gain node for honey-melt attack/sustain/release
        envGainNode = audioCtx.createGain();
        envGainNode.gain.value = 1;

        // Sidechain ducking gain – reduces drone when input is active
        sidechainGainNode = audioCtx.createGain();
        sidechainGainNode.gain.value = 1;

        // Master gain (final output control)
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.8;

        // Oscillator 1: Base drone at 55Hz (A1)
        const osc1 = audioCtx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 55;

        // Oscillator 2: Slight detune for warmth at 55.5Hz
        const osc2 = audioCtx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 55.5;

        // Oscillator 3: Harmonic at 110Hz (A2)
        const osc3 = audioCtx.createOscillator();
        osc3.type = 'triangle';
        osc3.frequency.value = 110;

        // Oscillator 4: Subtle 5th harmonic for depth
        const osc4 = audioCtx.createOscillator();
        osc4.type = 'sine';
        osc4.frequency.value = 82.5;

        const g3 = audioCtx.createGain();
        g3.gain.value = 0.3;

        const g4 = audioCtx.createGain();
        g4.gain.value = 0.15;

        // Signal chain:
        // oscillators -> droneGain -> hp1(12dB) -> hp2(12dB) -> compNode -> sidechainGain -> envGain -> analyserNode -> masterGain -> destination
        osc1.connect(droneGain);
        osc2.connect(droneGain);
        osc3.connect(g3);
        g3.connect(droneGain);
        osc4.connect(g4);
        g4.connect(droneGain);

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
        osc4.start();

        // Start envelope fade-in on first audio init
        const now = audioCtx.currentTime;
        envGainNode.gain.setValueAtTime(0.001, now);
        envGainNode.gain.exponentialRampToValueAtTime(ENV_SUSTAIN_LEVEL, now + ENV_ATTACK);
        envPhase = 'sustain';
    }

    function triggerEnvelope() {
        if (!audioCtx || !envGainNode) return;
        const now = audioCtx.currentTime;
        envGainNode.gain.cancelScheduledValues(now);
        envGainNode.gain.setValueAtTime(envValue || 0.001, now);
        envGainNode.gain.exponentialRampToValueAtTime(0.9, now + ENV_ATTACK);
        envPhase = 'attack';
    }

    function releaseEnvelope() {
        if (!audioCtx || !envGainNode) return;
        const now = audioCtx.currentTime;
        envGainNode.gain.cancelScheduledValues(now);
        envGainNode.gain.setValueAtTime(envGainNode.gain.value, now);
        envGainNode.gain.exponentialRampToValueAtTime(ENV_SUSTAIN_LEVEL, now + ENV_RELEASE);
        envPhase = 'release';
    }

    let sidechainActive = false;
    let sidechainStart = 0;
    let currentInputAmplitude = 0;
    let targetInputAmplitude = 0;

    function duckDrone() {
        if (!audioCtx || !sidechainGainNode) return;
        const now = audioCtx.currentTime;
        const target = sidechainActive ? 0.15 : 1.0;
        sidechainGainNode.gain.setTargetAtTime(target, now, 0.015);
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

    // -- Input Handling: Touch/Click with Pressure Mapping --
    let pointerDown = false;
    let inputX = 0, inputY = 0;
    let inputPressure = 0;
    let inputStartTime = 0;
    let lastInputTime = 0;
    let pressDuration = 0;

    function handlePointer(x, y, isDown, pressure) {
        initAudio();
        inputX = x;
        inputY = y;
        pointerDown = isDown;
        inputPressure = pressure || 0.5;
        const now = performance.now();

        if (isDown) {
            inputStartTime = now;
            pressDuration = 0;
            triggerEnvelope();
          } else {
            pressDuration = now - inputStartTime;
            releaseEnvelope();
          }

          // Pressure maps to amplitude: higher pressure = larger ripple
        const pressureFactor = Math.max(0.3, Math.min(1.5, inputPressure));
        const durationFactor = Math.max(0.5, Math.min(2, 1 + pressDuration / 500));

        const amplitude = isDown
             ? 80 * pressureFactor * durationFactor
             : -30 * pressureFactor;
        const decay = isDown ? (0.5 + inputPressure * 0.5) : (1.5 - inputPressure * 0.5);

        dropRipple(x, y, amplitude, decay);

         // Update input amplitude for sidechain
        targetInputAmplitude = isDown ? inputPressure : 0;

        if (isDown) {
            if (!sidechainActive) {
                sidechainActive = true;
                sidechainStart = now;
            }
        } else {
            sidechainActive = false;
        }
        duckDrone();
        lastInputTime = now;
      }

    // High-performance pointer events with <20ms latency
    canvas.addEventListener('pointerdown', e => {
        e.preventDefault();
        handlePointer(e.clientX, e.clientY, true, e.pressure);
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

    // -- Freeze Frame: Pause simulation, show overlay, hide UI --
    freeBtn.addEventListener('click', e => {
        e.stopPropagation();
        initAudio(); // Ensure audio is started for amplitude tracking
        frozen = !frozen;
        freeBtn.classList.toggle('active', frozen);
        document.body.classList.toggle('frozen', frozen);

        if (frozen) {
            screenshotMode = true;
            overlay.style.display = 'block';
            ui.style.display = 'none';
        } else {
            screenshotMode = false;
            overlay.style.display = 'none';
            ui.style.display = 'block';
        }
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
    let audioAmplitude = 0;

    function loop(now) {
        requestAnimationFrame(loop);

         // Smooth input amplitude for audio-driven effects
        currentInputAmplitude += (targetInputAmplitude - currentInputAmplitude) * 0.1;

        if (!frozen) {
            simulate();
            ambientDrip(now);
         }

        render();

        if (audioStarted) {
            audioAmplitude = getAudioAmplitude();

             // Smooth envelope value from audio node
            envValue = envGainNode ? envGainNode.gain.value : 0;

            const benchGroup = overlay.querySelector('#bench-group');
            const mochiGroup = overlay.querySelector('#mochi-group');

             // Audio amplitude envelope drives sway with organic feel
            const swayX = Math.sin(now / 2000) * envValue * 8;
            const swayY = Math.cos(now / 2800) * envValue * 4;
            const swayRot = Math.sin(now / 3200) * envValue * 2;

            if (benchGroup) {
                benchGroup.setAttribute('transform', `translate(${swayX * 0.3}, ${swayY * 0.2})`);
              }
            if (mochiGroup) {
                mochiGroup.setAttribute('transform',
                    `translate(${swayX}, ${swayY}) rotate(${swayRot}, ${W * 0.15 + 100}, ${H * 0.65 - 45}) scale(${1 + envValue * 0.04})`);
              }
         }

        const delta = now - lastTime;
        lastTime = now;
      }

    requestAnimationFrame(loop);
})();
