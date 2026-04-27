(function () {
   "use strict";

   // ── Device Detection ──────────────────────────────────────────
   function detectDeviceProfile() {
     var ua = navigator.userAgent || "";
     var isMobile = /Mobi|Android|iPhone|iPad|iPod/.test(ua);
     return {
       isMobile: isMobile,
       profile: isMobile ? "mobileSpeaker" : "headphone"
     };
   }

   // ── Audio Engine ──────────────────────────────────────────────
   var audioCtx = null;
   var masterGain = null;
   var devProfile = null;
   var activeNodes = [];
   var sustainGain = null;

   function initAudio() {
     if (audioCtx) return;
     devProfile = detectDeviceProfile();
     audioCtx = new (window.AudioContext || window.webkitAudioContext)();

     masterGain = audioCtx.createGain();
     masterGain.gain.value = 0.6;

     var compressor = audioCtx.createDynamicsCompressor();
     compressor.threshold.value = -24;
     compressor.knee.value = 30;
     compressor.ratio.value = 12;
     compressor.attack.value = 0.003;
     compressor.release.value = 0.25;

     masterGain.connect(compressor);
     compressor.connect(audioCtx.destination);
   }

   function isMobileSpeaker() {
     return devProfile && devProfile.profile === "mobileSpeaker";
   }

   function startBreathSound() {
     if (!audioCtx) initAudio();
     if (audioCtx.state === "suspended") audioCtx.resume();

     clearActiveNodes();

     var now = audioCtx.currentTime;
     var attackTime = isMobileSpeaker() ? 0.08 : 0.06;
     var sustainLevel = isMobileSpeaker() ? 0.45 : 0.35;

     sustainGain = audioCtx.createGain();
     sustainGain.gain.setValueAtTime(0, now);
     sustainGain.gain.linearRampToValueAtTime(sustainLevel, now + attackTime);
     sustainGain.connect(masterGain);

     var baseFreq = 120;
     var detune = isMobileSpeaker() ? 3 : 0;

     // Osc 1: base sine
     var osc1 = audioCtx.createOscillator();
     osc1.type = "sine";
     osc1.frequency.value = baseFreq;
     osc1.detune.value = detune;
     osc1.connect(sustainGain);
     osc1.start(now);
     activeNodes.push(osc1);

     // Osc 2: fifth harmonic
     var osc2 = audioCtx.createOscillator();
     osc2.type = "sine";
     osc2.frequency.value = baseFreq * 1.5;
     osc2.detune.value = -detune;
     var osc2Gain = audioCtx.createGain();
     osc2Gain.gain.value = 0.2;
     osc2.connect(osc2Gain);
     osc2Gain.connect(sustainGain);
     osc2.start(now);
     activeNodes.push(osc2);

     // Osc 3: octave triangle
     var osc3 = audioCtx.createOscillator();
     osc3.type = "triangle";
     osc3.frequency.value = baseFreq * 2.01;
     var osc3Gain = audioCtx.createGain();
     osc3Gain.gain.value = 0.08;
     osc3.connect(osc3Gain);
     osc3Gain.connect(sustainGain);
     osc3.start(now);
     activeNodes.push(osc3);

     // Noise-based breath component
     var bufferSize = audioCtx.sampleRate * 3;
     var noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
     var data = noiseBuffer.getChannelData(0);
     for (var i = 0; i < bufferSize; i++) {
       data[i] = (Math.random() * 2 - 1) * 0.5;
     }
     var noise = audioCtx.createBufferSource();
     noise.buffer = noiseBuffer;
     noise.loop = true;

     var noiseFilter = audioCtx.createBiquadFilter();
     noiseFilter.type = "bandpass";
     noiseFilter.frequency.value = isMobileSpeaker() ? 800 : 600;
     noiseFilter.Q.value = 0.5;

     var noiseGain = audioCtx.createGain();
     noiseGain.gain.value = isMobileSpeaker() ? 0.12 : 0.06;

     noise.connect(noiseFilter);
     noiseFilter.connect(noiseGain);
     noiseGain.connect(sustainGain);
     noise.start(now);
     activeNodes.push(noise);

     // LFO for breathy amplitude modulation
     var lfo = audioCtx.createOscillator();
     lfo.frequency.value = 4.2;
     var lfoGain = audioCtx.createGain();
     lfoGain.gain.value = 0.08;
     lfo.connect(lfoGain);
     lfoGain.connect(sustainGain.gain);
     lfo.start(now);
     activeNodes.push(lfo);
   }

   function stopBreathSound(decayMs) {
     if (!audioCtx || !sustainGain) return;
     var now = audioCtx.currentTime;
     var decayTime = decayMs !== undefined ? decayMs / 1000 : (isMobileSpeaker() ? 0.6 : 0.4);

     sustainGain.gain.cancelScheduledValues(now);
     sustainGain.gain.setValueAtTime(Math.max(sustainGain.gain.value, 0.01), now);
     sustainGain.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);

     setTimeout(function () {
       clearActiveNodes();
     }, (decayTime + 0.15) * 1000);
   }

   function clearActiveNodes() {
     for (var i = 0; i < activeNodes.length; i++) {
       try {
         var n = activeNodes[i];
         if (n.stop) n.stop();
         n.disconnect();
       } catch (e) { /* ignore */ }
     }
     activeNodes = [];
   }

   function resetAudio() {
     clearActiveNodes();
     sustainGain = null;
   }

   // ── Visual Ripple System ──────────────────────────────────────
   var canvas = document.getElementById("canvas");
   var ctx = canvas.getContext("2d");
   var ripples = [];
   var dpr = Math.min(window.devicePixelRatio || 1, 2);
   var frozenShimmerT = 0;

   function resizeCanvas() {
     canvas.width = window.innerWidth * dpr;
     canvas.height = window.innerHeight * dpr;
     canvas.style.width = window.innerWidth + "px";
     canvas.style.height = window.innerHeight + "px";
     ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
   }

   window.addEventListener("resize", resizeCanvas);
   resizeCanvas();

   function addRipple(cx, cy) {
     ripples.push({
       cx: cx,
       cy: cy,
       radius: 0,
       maxRadius: Math.max(window.innerWidth, window.innerHeight) * 0.7,
       age: 0,
       born: performance.now(),
       frozen: false,
       peakRadius: 0,
       peakGlow: 0
     });
   }

   function freezeRipples() {
     for (var i = 0; i < ripples.length; i++) {
       var r = ripples[i];
       if (!r.frozen) {
         r.frozen = true;
         r.peakRadius = r.radius;
         r.peakGlow = getGlowForRipple(r);
       }
     }
   }

   function clearRipples() {
     ripples = [];
     frozenShimmerT = 0;
   }

   function getGlowForRipple(r) {
     var progress = Math.min(r.age / 2.5, 1);
     return progress < 0.5 ? progress * 2 : 2 - progress * 2;
   }

   function drawRipple(r, glowT) {
     if (r.frozen) {
       drawFrozenRipple(r);
       return;
     }

     var progress = Math.min(r.age / 2.5, 1);
     var eased = easeOutCubic(progress);
     r.radius = eased * r.maxRadius;

     var progress2 = Math.min(r.age / 2.5, 1);
     var alpha = Math.max(0, 1 - progress2 * 0.6);
     var glowIntensity = progress2 < 0.5 ? progress2 * 2 : 2 - progress2 * 2;

     // Outer glow
     var gradient = ctx.createRadialGradient(r.cx, r.cy, 0, r.cx, r.cy, r.radius * 1.2);
     gradient.addColorStop(0, "rgba(245, 214, 160, " + (alpha * 0.3 * glowIntensity) + ")");
     gradient.addColorStop(0.4, "rgba(232, 169, 48, " + (alpha * 0.15 * glowIntensity) + ")");
     gradient.addColorStop(0.7, "rgba(212, 136, 10, " + (alpha * 0.06 * glowIntensity) + ")");
     gradient.addColorStop(1, "rgba(26, 22, 18, 0)");

     ctx.beginPath();
     ctx.arc(r.cx, r.cy, r.radius * 1.2, 0, Math.PI * 2);
     ctx.fillStyle = gradient;
     ctx.fill();

     // Ripple ring
     if (r.radius > 20) {
       var ringWidth = r.radius * 0.2;
       var ringGrad = ctx.createRadialGradient(
         r.cx, r.cy, r.radius - ringWidth,
         r.cx, r.cy, r.radius + ringWidth
       );
       ringGrad.addColorStop(0, "rgba(245, 214, 160, 0)");
       ringGrad.addColorStop(0.5, "rgba(245, 214, 160, " + (alpha * 0.5) + ")");
       ringGrad.addColorStop(1, "rgba(232, 169, 48, 0)");

       ctx.beginPath();
       ctx.arc(r.cx, r.cy, r.radius + ringWidth, 0, Math.PI * 2);
       ctx.arc(r.cx, r.cy, r.radius - ringWidth, 0, Math.PI * 2, true);
       ctx.fillStyle = ringGrad;
       ctx.fill();
     }

     // Inner warm core
     if (progress < 0.9) {
       var coreAlpha = (1 - progress) * 0.4;
       var coreR = 40 * glowIntensity;
       var coreGrad = ctx.createRadialGradient(r.cx, r.cy, 0, r.cx, r.cy, coreR);
       coreGrad.addColorStop(0, "rgba(255, 240, 210, " + coreAlpha + ")");
       coreGrad.addColorStop(1, "rgba(245, 214, 160, 0)");

       ctx.beginPath();
       ctx.arc(r.cx, r.cy, coreR, 0, Math.PI * 2);
       ctx.fillStyle = coreGrad;
       ctx.fill();
     }
   }

   function drawFrozenRipple(r) {
     var radius = r.peakRadius || 50;
     var glow = r.peakGlow || 1;
     var shimmer = (Math.sin(frozenShimmerT * 3) * 0.5 + 0.5) * 0.12;

     // Honey amber frozen glow - pill/ellipse shape
     var w = radius * 1.3;
     var h = radius * 0.75;

     var grad = ctx.createRadialGradient(r.cx, r.cy, 0, r.cx, r.cy, w * 0.5);
     grad.addColorStop(0, "rgba(245, 214, 160, " + (0.4 + shimmer) + ")");
     grad.addColorStop(0.3, "rgba(232, 169, 48, " + (0.25 + shimmer * 0.5) + ")");
     grad.addColorStop(0.7, "rgba(212, 136, 10, " + (0.08 + shimmer * 0.3) + ")");
     grad.addColorStop(1, "rgba(26, 22, 18, 0)");

     // Pill-like ellipse
     ctx.beginPath();
     ctx.ellipse(r.cx, r.cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
     ctx.fillStyle = grad;
     ctx.fill();

     // Frozen shimmer overlay - inner bright core
     var shimmerAlpha = 0.12 + shimmer;
     var shimmerGrad = ctx.createRadialGradient(r.cx, r.cy, 0, r.cx, r.cy, w * 0.3);
     shimmerGrad.addColorStop(0, "rgba(255, 248, 230, " + shimmerAlpha + ")");
     shimmerGrad.addColorStop(0.6, "rgba(250, 230, 190, " + (shimmerAlpha * 0.4) + ")");
     shimmerGrad.addColorStop(1, "rgba(250, 230, 190, 0)");

     ctx.beginPath();
     ctx.ellipse(r.cx, r.cy, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
     ctx.fillStyle = shimmerGrad;
     ctx.fill();

     // Subtle frozen ring at peak radius
     var ringW = Math.max(r.radius * 0.05, 3);
     var frozenRingGrad = ctx.createRadialGradient(
       r.cx, r.cy, r.peakRadius - ringW,
       r.cx, r.cy, r.peakRadius + ringW
     );
     frozenRingGrad.addColorStop(0, "rgba(245, 214, 160, 0)");
     frozenRingGrad.addColorStop(0.5, "rgba(245, 214, 160, " + (0.2 + shimmer * 0.5) + ")");
     frozenRingGrad.addColorStop(1, "rgba(245, 214, 160, 0)");

     ctx.beginPath();
     ctx.ellipse(r.cx, r.cy, (r.peakRadius + ringW) * 1.3, (r.peakRadius + ringW) * 0.75, 0, 0, Math.PI * 2);
     ctx.ellipse(r.cx, r.cy, (r.peakRadius - ringW) * 1.3, (r.peakRadius - ringW) * 0.75, 0, 0, Math.PI * 2, true);
     ctx.fillStyle = frozenRingGrad;
     ctx.fill();
   }

   function easeOutCubic(t) {
     return 1 - Math.pow(1 - t, 3);
   }

   function easeInOutSine(t) {
     return -(Math.cos(Math.PI * t) - 1) / 2;
   }

   // ── State Machine ─────────────────────────────────────────────
   var STATE = {
     IDLE: "idle",
     SUSTAIN: "sustain",
     FROZEN: "frozen"
   };

   var currentState = STATE.IDLE;
   var holdStartTime = 0;
   var isHolding = false;
   var hardCapMs = 2500;
   var rafId = null;
   var hintEl = document.getElementById("hint");
   var hintFrozenEl = document.getElementById("hint-frozen");
   var grainEl = document.getElementById("grain");

    // Tap detection: track press duration to distinguish tap from hold
   var pressStart = 0;

   function updateBodyClass() {
     document.body.classList.remove("state-sustain", "state-frozen");
     if (currentState === STATE.SUSTAIN) {
       document.body.classList.add("state-sustain");
      } else if (currentState === STATE.FROZEN) {
       document.body.classList.add("state-frozen");
      }
    }

   function setState(newState) {
     if (currentState === newState) return;
     var prev = currentState;
     currentState = newState;
     updateBodyClass();

     if (prev === STATE.IDLE && newState === STATE.SUSTAIN) {
        // ripple + audio spawned in enterSustain before setState
      } else if (prev === STATE.SUSTAIN && newState === STATE.FROZEN) {
       freezeRipples();
       stopBreathSound(isMobileSpeaker() ? 600 : 400);
       grainEl.classList.add("active");
       hintEl.classList.add("hidden");
       setTimeout(function () {
         hintFrozenEl.classList.add("visible");
        }, 200);
      } else if (newState === STATE.IDLE) {
       resetAudio();
       clearRipples();
       grainEl.classList.remove("active");
       hintFrozenEl.classList.remove("visible");
      }
    }

   function enterSustain(x, y) {
     if (currentState !== STATE.IDLE) return;

     var cx = x || window.innerWidth / 2;
     var cy = y || window.innerHeight / 2;

     addRipple(cx, cy);
     startBreathSound();
     holdStartTime = performance.now();
     hintEl.classList.add("hidden");
     setState(STATE.SUSTAIN);
   }

   function triggerFreeze() {
     if (currentState === STATE.SUSTAIN) {
       setState(STATE.FROZEN);
     }
   }

   function resetToIdle() {
     if (currentState === STATE.FROZEN) {
       setState(STATE.IDLE);
       setTimeout(function () {
         hintEl.classList.remove("hidden");
        }, 500);
      }
    }

   function checkHardCap() {
     if (currentState === STATE.SUSTAIN && performance.now() - holdStartTime >= hardCapMs) {
       triggerFreeze();
     }
   }

   // ── RAF Render Loop ───────────────────────────────────────────
   function renderLoop(timestamp) {
     rafId = requestAnimationFrame(renderLoop);

     var w = window.innerWidth;
     var h = window.innerHeight;

     ctx.clearRect(0, 0, w, h);

     // Background gradient
     var bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
     bgGrad.addColorStop(0, "#2a2218");
     bgGrad.addColorStop(1, "#1a1612");
     ctx.fillStyle = bgGrad;
     ctx.fillRect(0, 0, w, h);

     // State updates
     if (currentState === STATE.SUSTAIN) {
       checkHardCap();
     }
     if (currentState === STATE.FROZEN) {
       frozenShimmerT += 0.016;
     }

     // Update ripple ages and draw
     var now = performance.now();
     for (var i = 0; i < ripples.length; i++) {
       var r = ripples[i];
       if (!r.frozen) {
         r.age = (now - r.born) / 1000;
       }
       drawRipple(r, now);
     }
   }

   // Start render loop once
   rafId = requestAnimationFrame(renderLoop);

   // ── Input Handlers ────────────────────────────────────────────
   // Strategy: mousedown/touchstart → enterSustain if idle
   //           mouseup/touchend → if was sustaining, triggerFreeze
   //           click → only fires if it's a tap (short press). In frozen state, tap resets.
   //
   // To avoid click/mouseup race: we use a 'handledByClick' flag.
   // mouseup always triggers freeze. We prevent click from firing via mousedown → click suppression.

   var clickSuppressed = false;

   function getTouchPos(e) {
     if (e.changedTouches && e.changedTouches.length > 0) {
       var t = e.changedTouches[0];
       return { x: t.clientX, y: t.clientY };
     }
     if (e.touches && e.touches.length > 0) {
       var t2 = e.touches[0];
       return { x: t2.clientX, y: t2.clientY };
     }
     return { x: e.clientX, y: e.clientY };
   }

    canvas.addEventListener("mousedown", function (e) {
      isHolding = true;
      pressStart = performance.now();
      var pos = getTouchPos(e);
      enterSustain(pos.x, pos.y);
     });

    canvas.addEventListener("mouseup", function (e) {
      isHolding = false;

      if (currentState === STATE.SUSTAIN) {
       triggerFreeze();
        // Suppress click that follows this mouseup so reset requires a separate tap
        clickSuppressed = true;
        setTimeout(function () { clickSuppressed = false; }, 500);
       }
     });

   canvas.addEventListener("mouseleave", function () {
     if (isHolding && currentState === STATE.SUSTAIN) {
       isHolding = false;
       triggerFreeze();
     }
   });

   // Click handler: only acts on quick taps during FROZEN state
    canvas.addEventListener("click", function (e) {
      if (clickSuppressed) return;
      if (currentState === STATE.FROZEN) {
        resetToIdle();
        }
      });

   // Touch events
    canvas.addEventListener("touchstart", function (e) {
      e.preventDefault();
      isHolding = true;
      pressStart = performance.now();
      var pos = getTouchPos(e);
      enterSustain(pos.x, pos.y);
     }, { passive: false });

    canvas.addEventListener("touchend", function (e) {
      e.preventDefault();
      isHolding = false;
      if (currentState === STATE.SUSTAIN) {
        triggerFreeze();
        clickSuppressed = true;
        setTimeout(function () { clickSuppressed = false; }, 500);
       }
     }, { passive: false });

   canvas.addEventListener("touchcancel", function () {
     if (isHolding && currentState === STATE.SUSTAIN) {
       isHolding = false;
       triggerFreeze();
     }
   });

   // Prevent context menu on long press
   canvas.addEventListener("contextmenu", function (e) {
     e.preventDefault();
   });

   // ── Keyboard accessibility ─────────────────────────────────────
   var keyHeld = false;

   document.addEventListener("keydown", function (e) {
     if (e.code === "Space" || e.code === "Enter") {
       e.preventDefault();
       if (keyHeld) return; // debounce repeat
       keyHeld = true;

       if (currentState === STATE.IDLE) {
         enterSustain();
       } else if (currentState === STATE.FROZEN) {
         resetToIdle();
       } else if (currentState === STATE.SUSTAIN) {
         triggerFreeze();
       }
     }
   });

   document.addEventListener("keyup", function (e) {
     if (e.code === "Space" || e.code === "Enter") {
       keyHeld = false;
       if (currentState === STATE.SUSTAIN) {
         triggerFreeze();
       }
     }
   });

   // ── Log device profile ────────────────────────────────────────
   console.log("[Warm Honey Breath] Device profile:", detectDeviceProfile().profile);
})();
