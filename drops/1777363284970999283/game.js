(function () {
  "use strict";

  var bgCanvas = document.getElementById("bg-canvas");
  var dropCanvas = document.getElementById("drop-canvas");
  var hintEl = document.getElementById("hint");

  var bgGL = bgCanvas.getContext("webgl", { antialias: true, alpha: false });
  var dropGL = dropCanvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });

  if (!bgGL || !dropGL) {
    console.error("WebGL not supported");
    return;
  }

  // --- State ---
  var squeeze = 0.0;         // 0..1, current squeeze intensity
  var targetSqueeze = 0.0;   // target for easing
  var touching = false;
  var touchDuration = 0;
  var firstTouch = true;
  var startTime = 0;
  var dropCenterX = 0;
  var dropCenterY = 0;
  var dropRadius = 0;

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

  // --- Touch/mouse handlers ---
  function onDown(e) {
    e.preventDefault();
    touching = true;
    touchDuration = 0;
    if (firstTouch) {
      firstTouch = false;
      hintEl.classList.add("hidden");
    }
    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
  }

  function onMove(e) {
    e.preventDefault();
  }

  function onUp(e) {
    e.preventDefault();
    touching = false;
    targetSqueeze = 0;
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
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

    // --- Render loop ---
    var lastHeartbeat = 0;
    var heartbeatInterval = 120;

    function frame() {
      var now = performance.now();
      var elapsed = (now - startTime) / 1000;

      // Squeeze update: while touching, squeeze grows over time
      if (touching) {
        touchDuration += 16;
        // Easing: fast ramp to 0.7 at ~1.5s, then slow approach to 1.0
        var raw = Math.min(touchDuration / 2000, 1.0);
        targetSqueeze = raw * raw * (3.0 - 2.0 * raw); // smoothstep
      } else {
        targetSqueeze = 0;
      }

      // Smooth interpolation toward target with viscous ease-in-out cubic
      var easeSpeed = 0.04;
      squeeze += (targetSqueeze - squeeze) * easeSpeed;
      squeeze = Math.max(0, Math.min(1, squeeze));

      // Haptic heartbeat
      if (touching && squeeze > 0.1) {
        var interval = heartbeatInterval - squeeze * 30; // speeds up with deeper squeeze
        if (now - lastHeartbeat > interval && navigator.vibrate) {
          navigator.vibrate(20);
          lastHeartbeat = now;
        }
      }

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

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }).catch(function (err) {
    console.error("Failed to load shaders:", err);
  });
})();
