(function () {
  'use strict';

  var NODE_COUNT = 50;
  var HUSH_DURATION = 280;
  var SCROLL_THRESHOLD = 0.5;
  var BLUR_MAX = 2;
  var SCALE_SETTLE = 1.05;
  var FADE_DISTANCE = 0.65;

  var audioCtx = null;
  var masterGain = null;
  var lowpassFilter = null;
  var audioStarted = false;

  var lastScrollY = window.pageYOffset;
  var currentVelocity = 0;
  var hushTimer = null;
  var nodeData = [];
  var rafId = null;
  var observer = null;

  var svgTemplates = {};

  function initSVG() {
    svgTemplates[0] = '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="18" fill="#334155"/></svg>';
    svgTemplates[1] = '<svg viewBox="0 0 64 64"><path d="M32 14 A18 18 0 0 0 32 50 A12 18 0 0 1 32 14 z" fill="#94a3b8"/></svg>';
    svgTemplates[2] = '<svg viewBox="0 0 64 64"><path d="M32 14 A18 18 0 0 0 32 50 L32 14 z" fill="#94a3b8"/></svg>';
    svgTemplates[3] = '<svg viewBox="0 0 64 64"><path d="M32 14 A18 18 0 0 0 32 50 A6 18 0 0 0 32 14 z" fill="#94a3b8"/></svg>';
    svgTemplates[4] = '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="18" fill="#94a3b8"/></svg>';
    svgTemplates[5] = '<svg viewBox="0 0 64 64"><path d="M32 14 A18 18 0 0 1 32 50 A6 18 0 0 1 32 14 z" fill="#94a3b8"/></svg>';
    svgTemplates[6] = '<svg viewBox="0 0 64 64"><path d="M32 14 A18 18 0 0 1 32 50 L32 14 z" fill="#94a3b8"/></svg>';
    svgTemplates[7] = '<svg viewBox="0 0 64 64"><path d="M32 14 A18 18 0 0 1 32 50 A12 18 0 0 0 32 14 z" fill="#94a3b8"/></svg>';
    svgTemplates[8] = '<svg viewBox="0 0 64 64"><polygon points="32,8 36,24 52,24 39,34 44,50 32,40 20,50 25,34 12,24 28,24" fill="#94a3b8"/></svg>';
    svgTemplates[9] = '<svg viewBox="0 0 64 64"><polygon points="32,12 35,26 48,26 37,34 40,48 32,40 24,48 27,34 16,26 29,26" fill="#64748b"/></svg>';
    svgTemplates[10] = '<svg viewBox="0 0 64 64"><polygon points="32,6 36,24 54,24 40,36 46,54 32,42 18,54 24,36 10,24 28,24" fill="#cbd5e1"/></svg>';
    svgTemplates[11] = '<svg viewBox="0 0 64 64"><path d="M16 32 C16 28 20 24 32 24 C44 24 48 28 48 32 L48 40 C48 44 44 48 32 48 C20 48 16 44 16 40 Z M48 30 L52 28 C54 27 55 29 54 31 L52 38" fill="none" stroke="#94a3b8" stroke-width="2"/><path d="M26 16 Q28 10 32 16 Q30 12 32 8" fill="none" stroke="#64748b" stroke-width="1.5"/></svg>';
    svgTemplates[12] = '<svg viewBox="0 0 64 64"><ellipse cx="30" cy="36" rx="14" ry="12" fill="none" stroke="#94a3b8" stroke-width="2"/><path d="M44 32 L52 28 C54 27 54 33 52 34 Z" fill="none" stroke="#94a3b8" stroke-width="2"/><path d="M16 30 L12 34 C10 36 12 38 16 36" fill="none" stroke="#94a3b8" stroke-width="2"/><ellipse cx="24" cy="24" rx="6" ry="3" fill="none" stroke="#94a3b8" stroke-width="2"/></svg>';
    svgTemplates[13] = '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="18" fill="none" stroke="#64748b" stroke-width="1.5"/><path d="M38 16 A18 18 0 0 1 38 48 A14 18 0 0 0 38 16 z" fill="#94a3b8"/></svg>';
    svgTemplates[14] = '<svg viewBox="0 0 64 64"><path d="M28 24 Q32 12 36 24 Q32 20 32 28 Z" fill="#94a3b8"/><circle cx="32" cy="40" r="10" fill="none" stroke="#94a3b8" stroke-width="1.5"/><line x1="26" y1="48" x2="38" y2="48" stroke="#64748b" stroke-width="1"/></svg>';

    var labels = [
      'waxing', 'solace', 'ember', 'whisper', 'glow',
      'drift', 'hush', 'tide', 'dusk', 'mist',
      'bloom', 'flicker', 'rest', 'sigh', 'veil',
      'steam', 'calm', 'phase', 'solace', 'ember'
    ];

    var container = document.getElementById('scroll-container');
    var frag = document.createDocumentFragment();

    for (var i = 0; i < NODE_COUNT; i++) {
      var el = document.createElement('div');
      el.className = 'node';

      var aura = document.createElement('div');
      aura.className = 'aura';

      var svgWrap = document.createElement('span');
      svgWrap.innerHTML = svgTemplates[i % 15];
      var svgEl = svgWrap.firstChild;

      var label = document.createElement('div');
      label.className = 'label';
      label.textContent = labels[i % labels.length];

      el.appendChild(aura);
      el.appendChild(svgEl);
      el.appendChild(label);
      frag.appendChild(el);

      nodeData.push({
        el: el,
        svg: svgEl,
        aura: aura,
        label: label,
        visible: true,
        scale: 1,
        blur: 0,
        opacity: 1,
        parallax: 0,
      });
    }

    container.appendChild(frag);
  }

  function setupIntersectionObserver() {
    observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        var idx = parseInt(entry.target.getAttribute('data-idx'), 10);
        if (!isNaN(idx)) {
          nodeData[idx].visible = entry.isIntersecting;
         }
       }
    }, { rootMargin: '200px' });

    for (var i = 0; i < NODE_COUNT; i++) {
      nodeData[i].el.setAttribute('data-idx', i);
      observer.observe(nodeData[i].el);
     }
   }

  function startAudio() {
    if (audioStarted) return;
    audioStarted = true;

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(audioCtx.destination);

    lowpassFilter = audioCtx.createBiquadFilter();
    lowpassFilter.type = 'lowpass';
    lowpassFilter.frequency.value = 200;
    lowpassFilter.Q.value = 0.7;
    lowpassFilter.connect(masterGain);

    var freqs = [55, 82.41, 110, 164.81];
    var types = ['sine', 'sine', 'triangle', 'sine'];
    var vols =  [0.04, 0.035, 0.015, 0.025];

    for (var i = 0; i < freqs.length; i++) {
      var osc = audioCtx.createOscillator();
      osc.type = types[i];
      osc.frequency.value = freqs[i];

      var gn = audioCtx.createGain();
      gn.gain.value = vols[i];

      osc.connect(gn);
      gn.connect(lowpassFilter);
      osc.start();
     }

    var lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.3;
    var lfoG = audioCtx.createGain();
    lfoG.gain.value = 20;
    lfo.connect(lfoG);
    lfoG.connect(lowpassFilter.frequency);
    lfo.start();
   }

  function updateAudio(velocity, hushPhase) {
    if (!audioCtx) return;
    var t = audioCtx.currentTime;

    var targetVol = Math.min(0.12, 0.03 + velocity * 0.006);
    if (hushPhase) targetVol *= 0.25;
    masterGain.gain.setTargetAtTime(targetVol, t, hushPhase ? 0.28 : 0.08);

    var cutoff = 200 + Math.min(1200, velocity * 60);
    if (hushPhase) cutoff = Math.max(180, cutoff * 0.35);
    lowpassFilter.frequency.setTargetAtTime(cutoff, t, hushPhase ? 0.28 : 0.12);
   }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
   }

  var lastTime = performance.now();
  var scrollYHist = window.pageYOffset;
  var state = 'settled';
  var hushStart = 0;
  var hushFromVel = 0;

  function tick(now) {
    rafId = requestAnimationFrame(tick);

    var dt = Math.min(now - lastTime, 66);
    lastTime = now;
    var scrollY = window.pageYOffset;
    var delta = Math.abs(scrollY - scrollYHist);
    scrollYHist = scrollY;

    if (delta > 0.1) {
      currentVelocity = currentVelocity * 0.5 + (delta / dt * 16) * 0.5;
      if (state === 'fading') state = 'flow';
     } else {
      currentVelocity *= Math.pow(0.88, dt / 16);
     }

    var isFlow = currentVelocity > SCROLL_THRESHOLD;

    if (state === 'settled' && !isFlow && currentVelocity < 0.2) {
      for (var i = 0; i < nodeData.length; i++) {
        setSettled(nodeData[i], now);
       }
     } else if (state === 'fading') {
      var elapsed = now - hushStart;
      var tPct = Math.min(1, elapsed / HUSH_DURATION);
      var eased = easeOutCubic(tPct);

      for (var i = 0; i < nodeData.length; i++) {
        animateHush(nodeData[i], eased, hushFromVel);
       }

      updateAudio(0, true);
      if (tPct >= 1) state = 'settled';
     } else if (isFlow) {
      for (var i = 0; i < nodeData.length; i++) {
        animateFlow(nodeData[i]);
       }
      updateAudio(currentVelocity, false);
     } else {
      state = 'transitioning';
      for (var i = 0; i < nodeData.length; i++) {
        animateDecay(nodeData[i]);
       }
      updateAudio(0, false);
     }

    if (state !== 'flow' && currentVelocity < SCROLL_THRESHOLD * 0.3) {
      triggerHush(now);
     }
   }

  function triggerHush(now) {
    if (state === 'fading') return;
    state = 'fading';
    hushFromVel = Math.max(currentVelocity, 1);
    hushStart = now || performance.now();
   }

  function getDistFromCenter(el) {
    var vh = window.innerHeight;
    return Math.abs(el.offsetTop + 60 - (window.pageYOffset + vh / 2));
   }

  function setSettled(n, now) {
    if (!n.visible) return;
    var dist = getDistFromCenter(n.el);
    var fade = Math.max(0, 1 - dist / (window.innerHeight * FADE_DISTANCE));

    n.scale += ((scaleSettle) - n.scale) * 0.08;
    n.blur *= 0.82;
    n.opacity += ((0.2 + 0.8 * fade) - n.opacity) * 0.1;
    n.parallax *= 0.88;

    flushNode(n);
   }

  function animateHush(n, eased, fromVel) {
    if (!n.visible) return;
    var dist = getDistFromCenter(n.el);
    var fade = Math.max(0, 1 - dist / (window.innerHeight * FADE_DISTANCE));

    n.scale = SCALE_SETTLE * eased + 1 * (1 - eased);
    n.blur = fromVel > SCROLL_THRESHOLD ? BLUR_MAX * (1 - eased) : 0;
    n.opacity = 0.25 + 0.75 * fade;
    n.parallax *= (0.95 - eased * 0.15);

    flushNode(n);
   }

  function animateFlow(n) {
    if (!n.visible) return;
    var dist = getDistFromCenter(n.el);
    var fade = Math.max(0, 1 - dist / (window.innerHeight * 0.6));

    n.scale = 1;
    n.blur = Math.min(BLUR_MAX, currentVelocity * 0.025) * fade;
    n.opacity = 0.3 + 0.7 * fade;

    var parallaxTarget = -currentVelocity * 0.015 * (1 - fade) * (dist > window.innerHeight / 4 ? 1 : -1);
    n.parallax += (parallaxTarget - n.parallax) * 0.12;

    flushNode(n);
   }

  function animateDecay(n) {
    if (!n.visible) return;
    var dist = getDistFromCenter(n.el);
    var fade = Math.max(0, 1 - dist / (window.innerHeight * FADE_DISTANCE));

    n.scale += (SCALE_SETTLE - n.scale) * 0.12;
    n.blur *= 0.84;
    n.opacity += ((0.25 + 0.75 * fade) - n.opacity) * 0.14;
    n.parallax *= 0.9;

    flushNode(n);
   }

  function flushNode(n) {
    var blurCSS = n.blur > 0.15 ? 'blur(' + n.blur.toFixed(2) + 'px)' : '';
    n.el.style.transform =
       'translate3d(' + n.parallax.toFixed(2) + 'px,0,0) scale(' + n.scale.toFixed(4) + ')';
    n.el.style.opacity = n.opacity.toFixed(3);

    var filterParts = ['drop-shadow(0 0 6px rgba(148,163,184,0.25))'];
    if (blurCSS) filterParts.push(blurCSS);
    n.svg.style.filter = filterParts.join(' ');

    n.label.style.opacity = (n.blur < 0.4 ? (0.5 - n.opacity * 0.3) : 0).toFixed(3);

    var auraIntensity = Math.max(0, (n.scale - 1) * 8 + 0.15);
    n.aura.style.background =
       'radial-gradient(circle, rgba(148,163,184,' + auraIntensity.toFixed(3) + ') 0%, transparent 70%)';
   }

  function onScroll() {
    if (hushTimer) clearTimeout(hushTimer);

    hushTimer = setTimeout(function () {
      // Hush will be triggered naturally in tick when velocity drops
     }, 100);
   }

  function setupOverlay() {
    var overlay = document.getElementById('overlay');
    if (!overlay) return;

    function activate(e) {
      e && e.preventDefault();
      startAudio();
      overlay.classList.add('hidden');
     }

    overlay.addEventListener('click', activate);
    overlay.addEventListener('touchstart', activate, { passive: false });
   }

  function init() {
    initSVG();
    setupIntersectionObserver();
    window.addEventListener('scroll', onScroll, { passive: true });
    setupOverlay();

    for (var i = 0; i < nodeData.length; i++) {
      var n = nodeData[i];
      n.scale = SCALE_SETTLE;
      n.opacity = 1;
      flushNode(n);
     }

    rafId = requestAnimationFrame(tick);
   }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
   } else {
    init();
   }
})();
