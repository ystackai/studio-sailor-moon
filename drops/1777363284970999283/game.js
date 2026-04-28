(function () {
    "use strict";

    var bgCanvas = document.getElementById("bg-canvas");
    var dropCanvas = document.getElementById("drop-canvas");
    var hintEl = document.getElementById("hint");
    var audioCtx = null;
    var audioStarted = false;

    // High-pass filter to protect phone speakers
    var hpFilter = null;
    var masterGain = null;

    // Ambient drone oscillators
    var droneOscs = [];
    var chimeGain = null;

    // Squeeze hum oscillator
    var humOsc = null;
    var humGain = null;

    // Decay envelope buffer (synthesized, 1.5s attack, 2.0s sustain, 1.0s release)
    var decayBuffer = null;
    var decaySource = null;
    var decayGain = null;

    // Release exhale buffer
    var exhaleBuffer = null;

    // Click transient buffer
    var clickBuffer = null;

    var bgGL = bgCanvas.getContext("webgl", { antialias: true, alpha: false });
    var dropGL = dropCanvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });

    if (!bgGL || !dropGL) {
        console.error("WebGL not supported");
        return;
    }

    // --- 32ms Fixed Timestep ---
    var FRAME_HOLD_MS = 32;
    var lastFrameTime = 0;
    var accumulator = 0;

    // --- State ---
    var squeeze = 0.0;
    var targetSqueeze = 0.0;
    var touching = false;
    var touchDuration = 0;
    var firstTouch = true;
    var startTime = 0;
    var dropCenterX = 0;
    var dropCenterY = 0;
    var dropRadius = 0;

    // Touch pressure/velocity tracking
    var touchStartPressure = 0;
    var lastTouchX = 0;
    var lastTouchY = 0;
    var touchVelocity = 0;
    var pressureHistory = [];

    // Haptic heartbeat
    var lastHeartbeat = 0;
    var heartbeatInterval = 120;
    var heartbeatPhase = 0;

    // --- Audio Engine ---
    function initAudio() {
        if (audioStarted) return;
        audioStarted = true;

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();

        // High-pass filter at 60Hz to protect phone speakers
        hpFilter = audioCtx.createBiquadFilter();
        hpFilter.type = "highpass";
        hpFilter.frequency.value = 60;
        hpFilter.Q.value = 1.0;

        // Master gain
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.6;

        // Connect: filter -> master -> destination
        hpFilter.connect(masterGain);
        masterGain.connect(audioCtx.destination);

        // --- Pre-rendered decay envelope ---
        // 4.5s total: 1.5s attack + 2.0s sustain + 1.0s release
        decayBuffer = createDecayEnvelope(4.5, audioCtx.sampleRate);

        // --- Click transient buffer (<50ms) ---
        clickBuffer = createClickTransient(0.04, audioCtx.sampleRate);

        // --- Exhale buffer (0.8s shhh) ---
        exhaleBuffer = createExhaleEnvelope(0.8, audioCtx.sampleRate);

        // --- Ambient drone ---
        startAmbientDrone();

        // --- Chimes gain node ---
        chimeGain = audioCtx.createGain();
        chimeGain.gain.value = 0.08;
        chimeGain.connect(hpFilter);

        // --- Hum oscillator for squeeze ---
        humOsc = audioCtx.createOscillator();
        humOsc.type = "sine";
        humOsc.frequency.value = 120;
        humGain = audioCtx.createGain();
        humGain.gain.value = 0;
        humOsc.connect(humGain);
        humGain.connect(hpFilter);
        humOsc.start();
    }

    function createDecayEnvelope(duration, sr) {
        var frames = Math.floor(duration * sr);
        var buf = audioCtx.createBuffer(1, frames, sr);
        var data = buf.getChannelData(0);

        var attackFrames = Math.floor(1.5 * sr);
        var sustainFrames = Math.floor(2.0 * sr);
        var releaseFrames = frames - attackFrames - sustainFrames;

        for (var i = 0; i < frames; i++) {
            var t = i / frames;
            var amp = 0;

            if (i < attackFrames) {
                // Smooth attack curve
                var at = i / attackFrames;
                amp = Math.pow(at, 0.7) * 0.4;
            } else if (i < attackFrames + sustainFrames) {
                // Sustained portion with gentle variation
                var st = (i - attackFrames) / sustainFrames;
                amp = 0.4 * (0.95 + 0.05 * Math.sin(st * Math.PI * 4));
            } else {
                // Release tail
                var rt = (i - attackFrames - sustainFrames) / releaseFrames;
                amp = 0.4 * (1.0 - rt) * (1.0 - rt);
            }

            // Layered tones for warmth
            data[i] = amp * (
                Math.sin(2 * Math.PI * 180 * t * duration + i / sr * 5) * 0.6 +
                Math.sin(2 * Math.PI * 270 * t * duration) * 0.25 +
                Math.sin(2 * Math.PI * 410 * t * duration) * 0.15
            );
        }
        return buf;
    }

    function createClickTransient(duration, sr) {
        var frames = Math.floor(duration * sr);
        var buf = audioCtx.createBuffer(1, frames, sr);
        var data = buf.getChannelData(0);

        for (var i = 0; i < frames; i++) {
            var t = i / sr;
            var env = Math.exp(-t * 80) * 0.5;
            data[i] = env * (
                Math.sin(2 * Math.PI * 800 * t) * 0.7 +
                Math.sin(2 * Math.PI * 1600 * t) * 0.3
            );
        }
        return buf;
    }

    function createExhaleEnvelope(duration, sr) {
        var frames = Math.floor(duration * sr);
        var buf = audioCtx.createBuffer(1, frames, sr);
        var data = buf.getChannelData(0);

        for (var i = 0; i < frames; i++) {
            var t = i / frames;
            // Noise-like exhale: filtered noise with exponential decay
            var env = Math.pow(1.0 - t, 1.5) * 0.3;
            // Generate pseudo-noise at audio rate via layered sine waves
            var noise = 0;
            for (var f = 0; f < 16; f++) {
                var freq = 2000 + f * 500;
                noise += Math.sin(2 * Math.PI * freq * i / sr + f * 1.7) / (f + 1);
            }
            noise /= 8;
            // High-pass the noise
            noise *= 0.5;
            data[i] = env * noise;
        }
        return buf;
    }

    function startAmbientDrone() {
        // Low frequency drone layers
        var droneFreqs = [55, 82.5, 110];
        var droneAmps = [0.06, 0.04, 0.02];

        for (var i = 0; i < droneFreqs.length; i++) {
            var osc = audioCtx.createOscillator();
            osc.type = "sine";
            osc.frequency.value = droneFreqs[i];

            var g = audioCtx.createGain();
            g.gain.value = droneAmps[i];
            osc.connect(g);
            g.connect(hpFilter);
            osc.start();
            droneOscs.push({ osc: osc, gain: g });
        }

        // Occasional high-frequency chimes (filtered <8kHz)
        scheduleChime();
    }

    function scheduleChime() {
        if (!audioCtx || !audioStarted) return;

        var delay = 2000 + Math.random() * 4000;
        setTimeout(function () {
            if (!audioCtx) return;

            var osc = audioCtx.createOscillator();
            osc.type = "sine";
            var freq = 2000 + Math.random() * 4000;
            osc.frequency.value = freq;

            var g = audioCtx.createGain();
            g.gain.value = 0;
            g.gain.setValueAtTime(0, audioCtx.currentTime);
            g.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.0);

            osc.connect(g);
            g.connect(chimeGain);
            osc.start();
            osc.stop(audioCtx.currentTime + 2.5);

            scheduleChime();
        }, delay);
    }

    function playDecay() {
        if (!audioCtx || !decayBuffer) return;
        if (decaySource) {
            try { decaySource.stop(); } catch (e) {}
        }
        decaySource = audioCtx.createBufferSource();
        decaySource.buffer = decayBuffer;
        decayGain = audioCtx.createGain();
        decayGain.gain.value = 0.5;
        decaySource.connect(decayGain);
        decayGain.connect(hpFilter);
        decaySource.start();
        decaySource.onended = function () {
            decaySource = null;
        };
    }

    function playClick() {
        if (!audioCtx || !clickBuffer) return;
        var src = audioCtx.createBufferSource();
        src.buffer = clickBuffer;
        var g = audioCtx.createGain();
        g.gain.value = 0.3;
        src.connect(g);
        g.connect(hpFilter);
        src.start();
    }

    function playExhale() {
        if (!audioCtx || !exhaleBuffer) return;
        var src = audioCtx.createBufferSource();
        src.buffer = exhaleBuffer;
        var g = audioCtx.createGain();
        g.gain.value = 0.4;
        src.connect(g);
        g.connect(hpFilter);
        src.start();
    }

    function updateHum(squeezeVal) {
        if (!humOsc || !humGain || !audioCtx) return;
        // Pitch rises slightly with pressure, up to ~20% from base 120Hz
        var freq = 120 + squeezeVal * 24;
        humOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.05);
        // Hum volume follows squeeze, peaked at 70% threshold
        var volume = Math.min(squeezeVal / 0.7, 1.0) * 0.2;
        humGain.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.05);
    }

    // --- Shader loading ---
    function loadShaderText(path) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", path, true);
            xhr.onload = function () {
                resolve(xhr.responseText);
            };
            xhr.onerror = reject;
            xhr.send();
        });
    }

    function compileShader(gl, src, type) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error("Shader compile error:", gl.getShaderInfoLog(s));
            gl.deleteShader(s);
            return null;
        }
        return s;
    }

    function createProgram(gl, vertSrc, fragSrc) {
        var vs = compileShader(gl, vertSrc, gl.VERTEX_SHADER);
        var fs = compileShader(gl, fragSrc, gl.FRAGMENT_SHADER);
        if (!vs || !fs) return null;
        var prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("Program link error:", gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    // --- Full-screen quad geometry ---
    function createQuadBuffer(gl) {
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1
        ]), gl.STATIC_DRAW);
        return buf;
    }

    // --- Resize handler ---
    function resize() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = window.innerWidth;
        var h = window.innerHeight;

        bgCanvas.width = w * dpr;
        bgCanvas.height = h * dpr;
        bgCanvas.style.width = w + "px";
        bgCanvas.style.height = h + "px";
        bgGL.viewport(0, 0, bgCanvas.width, bgCanvas.height);

        dropCanvas.width = w * dpr;
        dropCanvas.height = h * dpr;
        dropCanvas.style.width = w + "px";
        dropCanvas.style.height = h + "px";
        dropGL.viewport(0, 0, dropCanvas.width, dropCanvas.height);

        dropCenterX = dropCanvas.width * 0.5;
        dropCenterY = dropCanvas.height * 0.5;
        dropRadius = Math.min(w, h) * 0.2;
    }

    window.addEventListener("resize", resize);

    // --- Touch/mouse handlers with pressure & velocity mapping ---
    var touchId = null;

    function getTouchInfo(e) {
        if (e.touches && e.touches.length > 0) {
            var t = e.touches[0];
            return { x: t.clientX, y: t.clientY, pressure: t.force || 0 };
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            var t = e.changedTouches[0];
            return { x: t.clientX, y: t.clientY, pressure: t.force || 0 };
        }
        return { x: e.clientX || 0, y: e.clientY || 0, pressure: 0 };
    }

    function onDown(e) {
        e.preventDefault();
        initAudio();
        playClick();

        var info = getTouchInfo(e);
        touchId = e.touches ? e.touches[0].identifier : -1;
        touching = true;
        touchDuration = 0;
        touchStartPressure = info.pressure;
        lastTouchX = info.x;
        lastTouchY = info.y;
        touchVelocity = 0;
        pressureHistory = [];

        if (firstTouch) {
            firstTouch = false;
            hintEl.classList.add("hidden");
        }

        if (navigator.vibrate) {
            navigator.vibrate(15);
        }

        playDecay();

        // Mark heartbeat reset
        lastHeartbeat = 0;
        heartbeatPhase = 0;
    }

    function onMove(e) {
        e.preventDefault();
        if (!touching) return;

        var info = getTouchInfo(e);

        // Track velocity from finger movement
        if (touchId !== null && e.touches) {
            var found = false;
            for (var i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === touchId) {
                    info = { x: e.touches[i].clientX, y: e.touches[i].clientY, pressure: e.touches[i].force || 0 };
                    found = true;
                    break;
                }
            }
            if (!found) return;
        }

        var dx = info.x - lastTouchX;
        var dy = info.y - lastTouchY;
        var vel = Math.sqrt(dx * dx + dy * dy);
        touchVelocity = Math.min(touchVelocity * 0.9 + vel * 0.1, 1.0);

        // Track pressure history (window of 20 samples)
        pressureHistory.push(info.pressure);
        if (pressureHistory.length > 20) pressureHistory.shift();

        lastTouchX = info.x;
        lastTouchY = info.y;
    }

    function onUp(e) {
        e.preventDefault();
        if (!touching) return;

        var info = getTouchInfo(e);

        // Differentiate light press vs deep squeeze on release
        var wasDeepSqueeze = squeeze > 0.4;

        touching = false;
        targetSqueeze = 0;

        // Release exhale
        playExhale();

        // Gentle reset haptic
        if (navigator.vibrate) {
            if (wasDeepSqueeze) {
                // Deep squeeze release: soft double-tap
                navigator.vibrate([8, 50, 8]);
            } else {
                // Light press: single soft tap
                navigator.vibrate(10);
            }
        }

        touchId = null;
        pressureHistory = [];
    }

    // Normalized pressure: combines touch.force and velocity into 0..1
    function computeNormalizedPressure() {
        if (!touching) return 0;

        var rawPressure = 0;
        if (pressureHistory.length > 0) {
            var sum = 0;
            for (var i = 0; i < pressureHistory.length; i++) sum += pressureHistory[i];
            rawPressure = sum / pressureHistory.length;
        }

        // Normalize: touch force (0..1 on supported devices) blended with velocity component
        var pressureComponent = Math.min(rawPressure, 1.0);
        var velocityComponent = touchVelocity * 0.3;

        // Duration component: longer touch = higher pressure feel
        var durationFactor = Math.min(touchDuration / 3000, 1.0);

        // Final normalized pressure
        return Math.min(1.0, pressureComponent * 0.4 + velocityComponent + durationFactor * 0.6);
    }

    dropCanvas.addEventListener("touchstart", onDown, { passive: false });
    dropCanvas.addEventListener("touchmove", onMove, { passive: false });
    dropCanvas.addEventListener("touchend", onUp, { passive: false });
    dropCanvas.addEventListener("touchcancel", onUp, { passive: false });
    dropCanvas.addEventListener("mousedown", onDown);
    dropCanvas.addEventListener("mousemove", onMove);
    dropCanvas.addEventListener("mouseup", onUp);
    dropCanvas.addEventListener("mouseleave", onUp);

    // --- Init ---
    Promise.all([
        loadShaderText("assets/background.vert"),
        loadShaderText("assets/background.frag"),
        loadShaderText("assets/honey_drop.vert"),
        loadShaderText("assets/honey_drop.frag")
    ]).then(function (sources) {
        var bgProg = createProgram(bgGL, sources[0], sources[1]);
        var dropProg = createProgram(dropGL, sources[2], sources[3]);

        if (!bgProg || !dropProg) return;

        resize();
        startTime = performance.now();

        // Background quad + uniform
        var bgQuad = createQuadBuffer(bgGL);
        var bgPosLoc = bgGL.getAttribLocation(bgProg, "a_position");
        var bgTimeLoc = bgGL.getUniformLocation(bgProg, "u_time");
        var bgResLoc = bgGL.getUniformLocation(bgProg, "u_resolution");

        // Drop quad + uniforms
        var dropQuad = createQuadBuffer(dropGL);
        var dropPosLoc = dropGL.getAttribLocation(dropProg, "a_position");
        var dropTimeLoc = dropGL.getUniformLocation(dropProg, "u_time");
        var dropSqueezeLoc = dropGL.getUniformLocation(dropProg, "u_squeeze");
        var dropCenterLoc = dropGL.getUniformLocation(dropProg, "u_dropCenter");
        var dropRadiusLoc = dropGL.getUniformLocation(dropProg, "u_dropRadius");
        var dropResLoc = dropGL.getUniformLocation(dropProg, "u_resolution");

        dropGL.enable(dropGL.BLEND);
        dropGL.blendFunc(dropGL.SRC_ALPHA, dropGL.ONE_MINUS_SRC_ALPHA);

        // --- 32ms Fixed Timestep Render Loop ---
        var simTime = 0;

        function simulate(dt) {
            // dt is in seconds, fixed at 32ms
            if (!touching) {
                // Release: viscous return with ease-in-out cubic
                targetSqueeze = 0;
            } else {
                touchDuration += dt * 1000;

                // Normalized pressure from touch data
                var p = computeNormalizedPressure();

                // Easing: fast ramp to 0.7 at ~1.5s, then slow approach to 1.0
                // Blend with touch pressure for richer response
                var raw = Math.min(touchDuration / 2000, 1.0);
                var smoothRamp = raw * raw * (3.0 - 2.0 * raw);
                targetSqueeze = smoothRamp * 0.7 + p * 0.3;
                targetSqueeze = Math.min(1.0, targetSqueeze);
            }

            // Smooth interpolation toward target with viscous easing
            var easeSpeed = 0.08;
            squeeze += (targetSqueeze - squeeze) * easeSpeed;
            squeeze = Math.max(0, Math.min(1, squeeze));

            // Heartbeat haptics synced to audio amplitude peaks
            // Peak at 70% threshold: heartbeat is most active at squeeze ~0.7
            var heartbeatStrength = Math.max(0, 1.0 - Math.abs(squeeze - 0.7) * 2.5);
            if (heartbeatStrength > 0.3 && touching) {
                // Interval decreases with squeeze depth, base 120ms
                var interval = 120 - squeeze * 40;
                var now = performance.now();
                if (now - lastHeartbeat > interval && navigator.vibrate) {
                    var pulseDuration = Math.round(15 + heartbeatStrength * 15);
                    navigator.vibrate(pulseDuration);
                    lastHeartbeat = now;
                    heartbeatPhase = (heartbeatPhase + 1) % 2;

                    // Modulate hum on heartbeat peaks
                    if (humGain) {
                        var bump = 0.02 * heartbeatStrength;
                        humGain.gain.value = Math.min(0.25, humGain.gain.value + bump);
                    }
                }
            }

            // Update audio hum based on current squeeze
            updateHum(squeeze);
            simTime += dt;
        }

        function render(elapsed) {
            // --- Render Background ---
            bgGL.clearColor(0.01, 0.0, 0.03, 1.0);
            bgGL.clear(bgGL.COLOR_BUFFER_BIT);
            bgGL.useProgram(bgProg);
            bgGL.bindBuffer(bgGL.ARRAY_BUFFER, bgQuad);
            bgGL.enableVertexAttribArray(bgPosLoc);
            bgGL.vertexAttribPointer(bgPosLoc, 2, bgGL.FLOAT, false, 0, 0);
            bgGL.uniform1f(bgTimeLoc, elapsed);
            bgGL.uniform2f(bgResLoc, bgCanvas.width, bgCanvas.height);
            bgGL.drawArrays(bgGL.TRIANGLE_STRIP, 0, 4);

            // --- Render Honey Drop ---
            dropGL.clearColor(0, 0, 0, 0);
            dropGL.clear(dropGL.COLOR_BUFFER_BIT);
            dropGL.useProgram(dropProg);
            dropGL.bindBuffer(dropGL.ARRAY_BUFFER, dropQuad);
            dropGL.enableVertexAttribArray(dropPosLoc);
            dropGL.vertexAttribPointer(dropPosLoc, 2, dropGL.FLOAT, false, 0, 0);
            dropGL.uniform1f(dropTimeLoc, elapsed);
            dropGL.uniform1f(dropSqueezeLoc, squeeze);
            dropGL.uniform2f(dropCenterLoc, dropCenterX, dropCenterY);
            dropGL.uniform1f(dropRadiusLoc, dropRadius);
            dropGL.uniform2f(dropResLoc, dropCanvas.width, dropCanvas.height);
            dropGL.drawArrays(dropGL.TRIANGLE_STRIP, 0, 4);
        }

        function frame(now) {
            requestAnimationFrame(frame);

            if (!lastFrameTime) {
                lastFrameTime = now;
                startTime = now;
                return;
            }

            var frameDt = (now - lastFrameTime) / 1000;
            lastFrameTime = now;

            // Clamp to avoid huge jumps on tab switch
            if (frameDt > 0.1) frameDt = 0.1;

            accumulator += frameDt;

            // Fixed timestep simulation at 32ms intervals
            while (accumulator >= FRAME_HOLD_MS / 1000) {
                simulate(FRAME_HOLD_MS / 1000);
                accumulator -= FRAME_HOLD_MS / 1000;
            }

            var elapsed = (now - startTime) / 1000;
            render(elapsed);
        }

        requestAnimationFrame(frame);
    }).catch(function (err) {
        console.error("Failed to load shaders:", err);
    });
})();
