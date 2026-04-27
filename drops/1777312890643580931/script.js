(function () {
  "use strict";

  // ── Device Detection ──────────────────────────────────────────
  function detectDeviceProfile() {
    var ua = navigator.userAgent || "";
    var isMobile = /Mobi|Android|iPhone|iPad|iPod/.test(ua);
    var isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
    var speakerCount = 1;
    if (!!window.navigator && window.navigator.maxTouchPoints >= 4) {
      speakerCount = 1;
    }
    return {
      isMobile: isMobile,
      isSafari: isSafari,
      profile: isMobile ? "mobileSpeaker" : "headphone",
    };
  }

  // ── Audio Engine ──────────────────────────────────────────────
  var audioCtx = null;
  var masterGain = null;
  var profile = null;
  var activeNodes = [];
  var sustainGain = null;
  var decayGain = null;

  function initAudio() {
    if (audioCtx) return;
    profile = detectDeviceProfile();
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

  function startBreathSound() {
    if (!audioCtx) initAudio();
    if (audioCtx.state === "suspended") audioCtx.resume();

    clearActiveNodes();

    var now = audioCtx.currentTime;
    var attackTime = 0.06;
    var sustainLevel = 0.35;
    var sustainLength = 2.5;

    if (profile && profile.profile === "mobileSpeaker") {
      attackTime = 0.08;
      sustainLevel = 0.45;
    }

    sustainGain = audioCtx.createGain();
    sustainGain.gain.setValueAtTime(0, now);
    sustainGain.gain.linearRampToValueAtTime(sustainLevel, now + attackTime);
    sustainGain.connect(masterGain);

    decayGain = audioCtx.createGain();
    decayGain.gain.value = 0;
    decayGain.connect(masterGain);

    var baseFreq = 120;
    var detune = profile && profile.profile === "mobileSpeaker" ? 3 : 0;

    var osc1 = audioCtx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = baseFreq;
    osc1.detune.value = detune;
    osc1.connect(sustainGain);
    osc1.start(now);
    activeNodes.push(osc1);

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
    noiseFilter.frequency.value = profile && profile.profile === "mobileSpeaker" ? 800 : 600;
    noiseFilter.Q.value = 0.5;

    var noiseGain = audioCtx.createGain();
    noiseGain.gain.value = profile && profile.profile === "mobileSpeaker" ? 0.12 : 0.06;

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(sustainGain);
    noise.start(now);
    activeNodes.push(noise);

    // Amplitude modulation for breathy feel
    var lfo = audioCtx.createOscillator();
    lfo.frequency.value = 4.2;
    var lfoGain = audioCtx.createGain();
    lfoGain.gain.value = 0.08;
    lfo.connect(lfoGain);
    lfoGain.connect(sustainGain.gain);
    lfo.start(now);
    activeNodes.push(lfo);
  }

  function stopBreathSound() {
    if (!audioCtx || !sustainGain) return;
    var now = audioCtx.currentTime;
    var decayTime = profile && profile.profile === "mobileSpeaker" ? 0.6 : 0.4;

    sustainGain.gain.cancelScheduledValues(now);
    sustainGain.gain.setValueAtTime(sustainGain.gain.value, now);
    sustainGain.gain.exponentialRampToValueAtTime(0.0001, now + decayTime);

    setTimeout(function () {
      clearActiveNodes();
    }, (decayTime + 0.1) * 1000);
  }

  function clearActiveNodes() {
    for (var i = 0; i < activeNodes.length; i++) {
      try {
        var n = activeNodes[i];
        if (n.stop) n.stop();
        if (n.disconnect) n.disconnect();
      } catch (e) { /* ignore */ }
    }
    activeNodes = [];
  }

  function resetAudio() {
    clearActiveNodes();
    sustainGain = null;
    decayGain = null;
  }

  // ── Visual Ripple System ──────────────────────────────────────
  var canvas = document.getElementById("canvas");
  var ctx = canvas.getContext("2d");
  var ripples = [];
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

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
    });

    var grain = document.getElementById("grain");
    grain.classList.add("active");
  }

  function freezeRipples() {
    for (var i = 0; i < ripples.length; i++) {
      ripples[i].frozen = true;
      ripples[i].peakRadius = ripples[i].radius;
    }
  }

  function clearRipples() {
    ripples = [];
    document.getElementById("grain").classList.remove("active");
  }

  function drawRipple(r, now) {
    if (r.frozen) {
      drawFrozenRipple(r);
      return;
    }

    var progress = r.age / 2.5;
    var eased = easeOutCubic(progress);
    r.radius = eased * r.maxRadius;

    var alpha = Math.max(0, 1 - progress * 0.6);
    var glowIntensity = progress < 0.5 ? progress * 2 : 2 - progress * 2;

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
      var ringGradient = ctx.createRadialGradient(
        r.cx, r.cy, r.radius * 0.85,
        r.cx, r.cy, r.radius * 1.05
      );
      ringGradient.addColorStop(0, "rgba(245, 214, 160, 0)");
      ringGradient.addColorStop(0.5, "rgba(245, 214, 160, " + (alpha * 0.4) + ")");
      ringGradient.addColorStop(1, "rgba(232, 169, 48, 0)");

      ctx.beginPath();
      ctx.arc(r.cx, r.cy, r.radius * 1.05, 0, Math.PI * 2);
      ctx.arc(r.cx, r.cy, r.radius * 0.85, 0, Math.PI * 2, true);
      ctx.fillStyle = ringGradient;
      ctx.fill();
    }

    // Inner warm core
    if (progress < 0.8) {
      var coreAlpha = (1 - progress) * 0.3;
      var coreGrad = ctx.createRadialGradient(r.cx, r.cy, 0, r.cx, r.cy, 60 * glowIntensity);
      coreGrad.addColorStop(0, "rgba(245, 214, 160, " + coreAlpha + ")");
      coreGrad.addColorStop(1, "rgba(245, 214, 160, 0)");

      ctx.beginPath();
      ctx.arc(r.cx, r.cy, 60 * glowIntensity, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();
    }
  }

  function drawFrozenRipple(r) {
    var radius = r.peakRadius || r.radius;
    var frozenAlpha = 0.5;

    // Honey amber frozen glow - pill shape
    var w = radius * 1.4;
    var h = radius * 0.9;
    var rx = w / 2;

    var grad = ctx.createRadialGradient(r.cx, r.cy, 0, r.cx, r.cy, w * 0.5);
    grad.addColorStop(0, "rgba(245, 214, 160, " + frozenAlpha + ")");
    grad.addColorStop(0.3, "rgba(232, 169, 48, " + (frozenAlpha * 0.7) + ")");
    grad.addColorStop(0.7, "rgba(212, 136, 10, " + (frozenAlpha * 0.3) + ")");
    grad.addColorStop(1, "rgba(26, 22, 18, 0)");

    // Draw as rounded ellipse (pill-like)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(r.cx, r.cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();

    // Frozen shimmer overlay
    var shimmerGrad = ctx.createRadialGradient(r.cx, r.cy, 0, r.cx, r.cy, w * 0.35);
    shimmerGrad.addColorStop(0, "rgba(255, 240, 210, 0.15)");
    shimmerGrad.addColorStop(1, "rgba(255, 240, 210, 0)");

    ctx.beginPath();
    ctx.ellipse(r.cx, r.cy, w * 0.35, h * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = shimmerGrad;
    ctx.fill();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  // ── State Machine ─────────────────────────────────────────────
  var STATE = {
    IDLE: "idle",
    SUSTAIN: "sustain",
    FROZEN: "frozen",
  };

  var currentState = STATE.IDLE;
  var holdStartTime = 0;
  var isHolding = false;
  var hardCapMs = 2500;
  var rafId = null;
  var lastFrameTime = 0;
  var hintEl = document.getElementById("hint");

  function setState(newState) {
    if (currentState === newState) return;
    var prev = currentState;
    currentState = newState;

    if (prev === STATE.IDLE && newState === STATE.SUSTAIN) {
      var cx = window.innerWidth / 2;
      var cy = window.innerHeight / 2;
      addRipple(cx, cy);
      startBreathSound();
      holdStartTime = performance.now();
      hintEl.classList.add("hidden");
    } else if ((prev === STATE.SUSTAIN) && newState === STATE.FROZEN) {
      freezeRipples();
      stopBreathSound();
    } else if (newState === STATE.IDLE) {
      resetAudio();
      clearRipples();
    }
  }

  function enterSustain(x, y) {
    if (currentState === STATE.IDLE) {
      if (x && y) {
        addRipple(x, y);
      } else {
        addRipple(window.innerWidth / 2, window.innerHeight / 2);
      }
      startBreathSound();
      holdStartTime = performance.now();
      hintEl.classList.add("hidden");
      setState(STATE.SUSTAIN);
    }
  }

  function triggerFreeze() {
    if (currentState === STATE.SUSTAIN) {
      setState(STATE.FROZEN);
    }
  }

  function resetState() {
    if (currentState === STATE.FROZEN) {
      setState(STATE.IDLE);
      setTimeout(function () {
        hintEl.classList.remove("hidden");
      }, 600);
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

    if (!lastFrameTime) lastFrameTime = timestamp;
    var dt = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    // Clamp delta to avoid spiral of death
    if (dt > 0.1) dt = 0.1;

    var w = window.innerWidth;
    var h = window.innerHeight;

    ctx.clearRect(0, 0, w, h);

    // Background gradient
    var bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    bgGrad.addColorStop(0, "#2a2218");
    bgGrad.addColorStop(1, "#1a1612");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Update ripple ages and draw
    if (currentState === STATE.SUSTAIN) {
      checkHardCap();
    }

    var now = performance.now();
    for (var i = 0; i < ripples.length; i++) {
      var r = ripples[i];
      if (!r.frozen) {
        r.age = (now - r.born) / 1000;
      }
      drawRipple(r, now);
    }
  }

  rafId = requestAnimationFrame(renderLoop);

  // ── Input Handlers ────────────────────────────────────────────
  var touchStartX = 0;
  var touchStartY = 0;

  function getInputPos(e) {
    if (e.touches && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  canvas.addEventListener("mousedown", function (e) {
    var pos = getInputPos(e);
    isHolding = true;
    touchStartX = pos.x;
    touchStartY = pos.y;
    enterSustain(pos.x, pos.y);
  });

  canvas.addEventListener("mouseup", function () {
    if (isHolding) {
      isHolding = false;
      triggerFreeze();
    }
  });

  canvas.addEventListener("mouseleave", function () {
    if (isHolding) {
      isHolding = false;
      triggerFreeze();
    }
  });

  canvas.addEventListener("touchstart", function (e) {
    e.preventDefault();
    var pos = getInputPos(e);
    isHolding = true;
    touchStartX = pos.x;
    touchStartY = pos.y;
    enterSustain(pos.x, pos.y);
  }, { passive: false });

  canvas.addEventListener("touchend", function (e) {
    e.preventDefault();
    if (isHolding) {
      isHolding = false;
      triggerFreeze();
    }
  }, { passive: false });

  canvas.addEventListener("touchcancel", function () {
    if (isHolding) {
      isHolding = false;
      triggerFreeze();
    }
  });

  // Reset on tap when frozen
  canvas.addEventListener("click", function (e) {
    if (currentState === STATE.FROZEN) {
      resetState();
    }
  });

  // Prevent context menu on long press
  canvas.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  // ── Keyboard accessibility ─────────────────────────────────────
  document.addEventListener("keydown", function (e) {
    if (e.code === "Space" || e.code === "Enter") {
      e.preventDefault();
      if (currentState === STATE.IDLE) {
        enterSustain();
      } else if (currentState === STATE.FROZEN) {
        resetState();
      } else if (currentState === STATE.SUSTAIN) {
        triggerFreeze();
      }
    }
  });

  document.addEventListener("keyup", function (e) {
    if (e.code === "Space" || e.code === "Enter") {
      if (currentState === STATE.SUSTAIN) {
        triggerFreeze();
      }
    }
  });

  // ── Log device profile for debugging ──────────────────────────
  console.log("[Warm Honey Breath] Device profile:", detectDeviceProfile().profile);
})();
