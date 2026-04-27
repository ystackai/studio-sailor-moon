(function () {
   "use strict";

   // ─── Device Detection ───────────────────────────────────────
   function detectPhoneSpeaker() {
      var ua = (navigator.userAgent || navigator.vendor || "");
      var isMobile = /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(ua);
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      var sr = 44100;
      if (AudioCtor) {
         try {
            var testCtx = new AudioCtor();
            sr = testCtx.sampleRate;
            testCtx.close();
          } catch (e) { }
       }
      return isMobile && sr <= 48000;
    }

   var IS_PHONE_SPEAKER = detectPhoneSpeaker();

   var FADE = {
      attack:  IS_PHONE_SPEAKER ? 0.18 : 0.10,
      decay:   IS_PHONE_SPEAKER ? 2.5  : 1.2,
      sustain: IS_PHONE_SPEAKER ? 0.35 : 0.25,
      release: IS_PHONE_SPEAKER ? 0.6  : 0.4,
    };

   var DECAY_TIME  = FADE.decay;
   var RELEASE_TIME = FADE.release;

    // ─── Audio Engine ───────────────────────────────────────────
   var audioCtx = null;
   var masterGain = null;
   var lpFilter = null;
   var analyser = null;
   var oscs = [];
   var noiseSrc = null;
   var noiseGainNode = null;
   var currentGain = 0;

   function createAudioGraph() {
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioCtor();

      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0;

      lpFilter = audioCtx.createBiquadFilter();
      lpFilter.type = "lowpass";
      lpFilter.frequency.value = IS_PHONE_SPEAKER ? 850 : 1350;
      lpFilter.Q.value = IS_PHONE_SPEAKER ? 1.4 : 1.0;

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.25;

      lpFilter.connect(masterGain);
      masterGain.connect(analyser);
      analyser.connect(audioCtx.destination);

       // Oscillators: warm fundamental + harmonic overtones
      var fund = 174.6; // G3 (approx)
      var specs = [
         { freq: fund * 1,     type: "sine", gain: 0.30 },
         { freq: fund * 1.5,   type: "sine", gain: 0.12 },
         { freq: fund * 2,     type: "triangle", gain: 0.06 },
         { freq: fund * 0.5,   type: "sine", gain: 0.18 },
       ];

      specs.forEach(function (s) {
         var o = audioCtx.createOscillator();
         o.type = s.type;
         o.frequency.value = s.freq;
         var g = audioCtx.createGain();
         g.gain.value = s.gain;
         o.connect(g);
         g.connect(lpFilter);
         o.start();
         oscs.push({ osc: o, gain: g });
       });

       // Brown noise for breath texture
      var bufSize = audioCtx.sampleRate * 2 | 0;
      var buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
      var ch = buf.getChannelData(0);
      var acc = 0;
      for (var n = 0; n < bufSize; n++) {
         var w = Math.random() * 2 - 1;
         acc = (acc + 0.025 * w) / 1.025;
         ch[n] = acc * 3;
       }
      noiseSrc = audioCtx.createBufferSource();
      noiseSrc.buffer = buf;
      noiseSrc.loop = true;
      noiseGainNode = audioCtx.createGain();
      noiseGainNode.gain.value = 0.04;
      noiseSrc.connect(noiseGainNode);
      noiseGainNode.connect(lpFilter);
      noiseSrc.start();
    }

   function ensureAudio() {
      if (!audioCtx) createAudioGraph();
      if (audioCtx.state === "suspended") audioCtx.resume();
    }

   function rampGain(target, dur) {
      if (!audioCtx) return;
      var t = audioCtx.currentTime;
      masterGain.gain.cancelScheduledValues(t);
      masterGain.gain.setValueAtTime(currentGain, t);
      masterGain.gain.exponentialRampToValueAtTime(
         Math.max(target, 0.0001),
         t + dur
       );
      currentGain = target;
    }

   function getEnergy() {
      if (!analyser) return 0;
      var d = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(d);
      var s = 0;
      for (var i = 0; i < d.length; i++) s += d[i];
      return s / d.length / 255;
    }

    // ─── Canvas ─────────────────────────────────────────────────
   var canvas = document.getElementById("canvas");
   var ctx2d = canvas.getContext("2d");
   var W = 0, H = 0, cx = 0, cy = 0;

   function onResize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = W * dpr | 0;
      canvas.height = H * dpr | 0;
      canvas.style.width  = W + "px";
      canvas.style.height = H + "px";
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2;
      cy = H / 2;
    }
   window.addEventListener("resize", onResize);
   onResize();

    // ─── Ripple System ──────────────────────────────────────────
   var ripples = [];
   var bloomIntensity = 0;
   var bloomTarget = 0;
   var rippleTimer = 0;

   function addRipple(x, y) {
      var R = Math.max(W, H);
      ripples.push({
         x: x, y: y,
         r: 0,
         maxR: R * 0.65,
         speed: R * 0.0035,
         life: 1,
         amp: 0,
       });
    }

   function updateRipples(dt) {
      rippleTimer += dt;

       // Auto-spawn while holding
      if (machine.state === State.HOLDING && rippleTimer > 0.45) {
         addRipple(
           cx + (Math.random() - 0.5) * 80,
           cy + (Math.random() - 0.5) * 80
         );
         rippleTimer = 0;
       }

      for (var i = ripples.length - 1; i >= 0; i--) {
         var rp = ripples[i];
         rp.r += rp.speed * dt * 60;
         rp.life = Math.max(0, 1 - rp.r / rp.maxR);

          // Amplitude follows a bell curve centered at 35% expansion
         var norm = rp.r / rp.maxR;
         rp.amp = Math.exp(-((norm - 0.35) * (norm - 0.35)) / 0.045);

         if (rp.life <= 0) {
            ripples.splice(i, 1);
          }
       }

       // Bloom target from strongest ripple
      var peak = 0;
      for (var j = 0; j < ripples.length; j++) {
         if (ripples[j].amp > peak) peak = ripples[j].amp;
       }
      var ae = getEnergy();
      bloomTarget = Math.max(0, (peak - 0.45) * 2.2) * (0.5 + ae * 0.5);
      bloomIntensity += (bloomTarget - bloomIntensity) * dt * 4;
    }

    // ─── Palettes ───────────────────────────────────────────────
   var CREAM  = [255, 250, 240];
   var AMBER  = [218, 165, 32];
   var HONEY  = [255, 190, 55];
   var GOLD   = [255, 218, 110];

   function rgba(r, g, b, a) {
      return "rgba(" + r + "," + g + "," + b + "," + a.toFixed(4) + ")";
    }

   function render() {
       // Warm cream background gradient
      var bg = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.85);
      bg.addColorStop(0,   rgba(255, 252, 242, 1));
      bg.addColorStop(0.6, rgba(255, 248, 238, 1));
      bg.addColorStop(1,   rgba(245, 238, 225, 1));
      ctx2d.fillStyle = bg;
      ctx2d.fillRect(0, 0, W, H);

       // Ripple rings
      for (var i = 0; i < ripples.length; i++) {
         var rp = ripples[i];
         var amp = rp.amp;

          // Main ring
         ctx2d.beginPath();
         ctx2d.arc(rp.x, rp.y, rp.r, 0, 6.2832);
         ctx2d.strokeStyle = rgba(
            AMBER[0], AMBER[1], AMBER[2],
            rp.life * 0.45 * (0.3 + amp * 0.7)
          );
         ctx2d.lineWidth = 1.5 + amp * 5;
         ctx2d.stroke();

          // Glow ring (near peak)
         if (amp > 0.25) {
            ctx2d.beginPath();
            ctx2d.arc(rp.x, rp.y, rp.r * 0.95, 0, 6.2832);
            ctx2d.strokeStyle = rgba(
               GOLD[0], GOLD[1], GOLD[2],
               rp.life * amp * 0.25
             );
            ctx2d.lineWidth = 8 + amp * 14;
            ctx2d.stroke();
          }

          // Center soft dot
         if (amp > 0.5) {
            var dotGrad = ctx2d.createRadialGradient(rp.x, rp.y, 0, rp.x, rp.y, rp.r * 0.2);
            dotGrad.addColorStop(0, rgba(GOLD[0], GOLD[1], GOLD[2], amp * rp.life * 0.4));
            dotGrad.addColorStop(1, rgba(GOLD[0], GOLD[1], GOLD[2], 0));
            ctx2d.fillStyle = dotGrad;
            ctx2d.beginPath();
            ctx2d.arc(rp.x, rp.y, rp.r * 0.2, 0, 6.2832);
            ctx2d.fill();
          }
       }

       // Bloom overlay
      if (bloomIntensity > 0.005) {
         ctx2d.globalCompositeOperation = "lighter";

          // Global bloom
         var bGrad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.55);
         bGrad.addColorStop(0, rgba(HONEY[0], HONEY[1], HONEY[2], bloomIntensity * 0.28));
         bGrad.addColorStop(0.4, rgba(HONEY[0], HONEY[1], HONEY[2], bloomIntensity * 0.12));
         bGrad.addColorStop(1, rgba(HONEY[0], HONEY[1], HONEY[2], 0));
         ctx2d.fillStyle = bGrad;
         ctx2d.fillRect(0, 0, W, H);

          // Per-ripple bloom
         for (var bi = 0; bi < ripples.length; bi++) {
            var b = ripples[bi];
            if (b.amp > 0.4) {
               var rGrad = ctx2d.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 0.45);
               rGrad.addColorStop(0, rgba(255, 235, 140, bloomIntensity * b.amp * 0.35));
               rGrad.addColorStop(0.5, rgba(255, 210, 90, bloomIntensity * b.amp * 0.12));
               rGrad.addColorStop(1, rgba(255, 200, 80, 0));
               ctx2d.fillStyle = rGrad;
               ctx2d.beginPath();
               ctx2d.arc(b.x, b.y, b.r * 0.45, 0, 6.2832);
               ctx2d.fill();
             }
          }

         ctx2d.globalCompositeOperation = "source-over";
       }

       // Frozen state warm overlay
      if (machine.frozen) {
         var fGrad = ctx2d.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.5);
         fGrad.addColorStop(0, rgba(255, 228, 135, 0.14));
         fGrad.addColorStop(1, rgba(255, 228, 135, 0));
         ctx2d.fillStyle = fGrad;
         ctx2d.fillRect(0, 0, W, H);
       }
    }

    // ─── State Machine (Non-Blocking) ──────────────────────────
   var State = { IDLE: 0, HOLDING: 1 };

   var machine = {
      state: State.IDLE,
      frozen: false,
      audioState: "off", // off | attack | sustain | decay | frozen
      holdStart: 0,
      frozenSnapshot: null,
      pending: null,
    };

   function scheduleTransition(newState, newFrozen, onApply) {
      machine.pending = { s: newState, f: newFrozen, cb: onApply };
    }

   function flushTransition() {
      if (!machine.pending) return;
      machine.state  = machine.pending.s;
      machine.frozen = machine.pending.f;
      if (machine.pending.cb) machine.pending.cb();
      machine.pending = null;
    }

    // ─── Input Handling ─────────────────────────────────────────
   function pointerDown(e) {
      e.preventDefault();
      var pt = getPoint(e);
      ensureAudio();

      if (machine.frozen) {
          // Resume from frozen state
         scheduleTransition(State.HOLDING, false, function () {
            machine.audioState = "attack";
            rampGain(FADE.sustain, FADE.attack);
            rippleTimer = -0.35;
            addRipple(pt.x, pt.y);
          });
       } else if (machine.state === State.IDLE) {
         machine.holdStart = performance.now();
         scheduleTransition(State.HOLDING, false, function () {
            machine.audioState = "attack";
            rampGain(FADE.sustain, FADE.attack);
            addRipple(pt.x, pt.y);
            rippleTimer = 0;
          });
       }
    }

   function pointerUp(e) {
      e.preventDefault();
      if (machine.state === State.HOLDING) {
          // Freeze-frame at current peak
         var snap = {
            t: performance.now(),
            bloom: bloomIntensity,
            ripplesLen: ripples.length,
          };
         machine.frozenSnapshot = snap;

         scheduleTransition(State.IDLE, true, function () {
            machine.audioState = "frozen";
             // Instant freeze — set gain to 0 immediately for zero-pop
            var t = audioCtx ? audioCtx.currentTime : 0;
            if (audioCtx && masterGain) {
               masterGain.gain.cancelScheduledValues(t);
               masterGain.gain.setValueAtTime(currentGain, t);
               masterGain.gain.linearRampToValueAtTime(0.0001, t + 0.02);
               currentGain = 0;
            }
          });
       }
    }

   function getPoint(e) {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }

   canvas.addEventListener("touchstart", pointerDown, { passive: false });
   canvas.addEventListener("touchend",   pointerUp,   { passive: false });
   canvas.addEventListener("touchcancel", pointerUp,   { passive: false });
   canvas.addEventListener("mousedown",  pointerDown);
   canvas.addEventListener("mouseup",    pointerUp);
   canvas.addEventListener("mouseleave", pointerUp);

    // ─── Decay loop ─────────────────────────────────────────────
   // After a ripple cycle, volume fades naturally
   var decayTimer = 0;
   function updateDecay(dt) {
      if (machine.audioState === "sustain" && machine.state === State.IDLE && !machine.frozen) {
         decayTimer += dt;
         if (decayTimer > FADE.decay * 0.3) {
            machine.audioState = "decay";
            rampGain(0.0001, FADE.release);
          }
       }
       // Transition to sustain after attack completes
      if (machine.audioState === "attack" && machine.state === State.HOLDING) {
         machine.audioState = "sustain";
       }
       // If holding, reset decay timer
      if (machine.state === State.HOLDING) {
         decayTimer = 0;
       }
    }

    // ─── Main Loop ──────────────────────────────────────────────
   var last = performance.now();
   var fpsFrames = 0;
   var fpsLast = performance.now();
   var consoleEl = document.createElement("div");
   consoleEl.style.cssText = "position:fixed;bottom:6px;right:8px;font:10px monospace;opacity:0.25;pointer-events:none;z-index:999;";
   document.body.appendChild(consoleEl);

   function loop(now) {
      var dt = Math.min((now - last) / 1000, 0.06);
      last = now;

       // FPS counter for debugging
      fpsFrames++;
      if (now - fpsLast > 1000) {
         var fps = fpsFrames * 1000 / (now - fpsLast);
         consoleEl.textContent = fps.toFixed(1) + "fps";
         fpsFrames = 0;
         fpsLast = now;
       }

      flushTransition();
      if (!machine.frozen) {
         updateRipples(dt);
         updateDecay(dt);
       }
      render();

      requestAnimationFrame(loop);
    }

   requestAnimationFrame(loop);
})();
