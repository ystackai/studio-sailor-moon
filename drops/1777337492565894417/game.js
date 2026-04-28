// Warm Honey Breath — Game Engine
// Onboarding hint + minimal state scaffolding

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// --- Onboarding ---

const onboardingOverlay = document.getElementById('onboarding-overlay');
let onboardingDismissed = false;

// Load onboarding copy from the hint file
const ONBOARDING_COPY = {
   tagline: 'Breathe in. Catch the peak. Let it melt.',
   inhale: 'Hold the circle to inhale.',
   freeze: 'Release at the ripple\'s peak to freeze.',
   exhale: 'Watch the glow melt away and begin again.',
   dismiss: 'Tap anywhere to begin',
};

// Populate onboarding elements with copy
document.getElementById('onboarding-tagline').textContent = ONBOARDING_COPY.tagline;
document.getElementById('onboarding-step-inhale').textContent = ONBOARDING_COPY.inhale;
document.getElementById('onboarding-step-freeze').textContent = ONBOARDING_COPY.freeze;
document.getElementById('onboarding-step-exhale').textContent = ONBOARDING_COPY.exhale;
document.getElementById('onboarding-hint-dismiss').textContent = ONBOARDING_COPY.dismiss;

onboardingOverlay.addEventListener('click', dismissOnboarding);

function dismissOnboarding() {
   if (onboardingDismissed) return;
   onboardingDismissed = true;
   onboardingOverlay.classList.add('hidden');
}

// --- State Machine ---

const STATES = {
   IDLE: 'IDLE',
   CHARGING: 'CHARGING',
   FROZEN: 'FROZEN',
   MELTING: 'MELTING',
};

let state = STATES.IDLE;
const HOLD_DURATION_CAP = 2500; // 2.5s max hold

// --- Canvas Setup ---

function resizeCanvas() {
   canvas.width = window.innerWidth;
   canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Render Loop ---

const CENTER = { x: 0, y: 0 };
let rippleRadius = 0;
let opacity = 0.6;
let intensity = 0;

function updateCenter() {
   CENTER.x = canvas.width / 2;
   CENTER.y = canvas.height / 2;
}

function render(timestamp) {
   ctx.clearRect(0, 0, canvas.width, canvas.height);
   updateCenter();

   // Background radial glow
   const bgGrad = ctx.createRadialGradient(CENTER.x, CENTER.y, 0, CENTER.x, CENTER.y, Math.max(canvas.width, canvas.height) * 0.7);
   bgGrad.addColorStop(0, `rgba(240, 194, 94, ${0.06 + intensity * 0.08})`);
   bgGrad.addColorStop(1, 'rgba(30, 22, 40, 0)');
   ctx.fillStyle = bgGrad;
   ctx.fillRect(0, 0, canvas.width, canvas.height);

   // Core circle
   const baseRadius = Math.min(canvas.width, canvas.height) * 0.12;
   const coreGrad = ctx.createRadialGradient(CENTER.x, CENTER.y, 0, CENTER.x, CENTER.y, baseRadius);

   switch (state) {
      case STATES.IDLE:
         coreGrad.addColorStop(0, 'rgba(196, 166, 217, 0.5)');
         coreGrad.addColorStop(0.6, 'rgba(240, 194, 94, 0.2)');
         coreGrad.addColorStop(1, 'rgba(30, 22, 40, 0)');
         opacity = 0.6 + Math.sin(timestamp * 0.001) * 0.1;
         break;

      case STATES.CHARGING:
         coreGrad.addColorStop(0, 'rgba(240, 194, 94, 0.85)');
         coreGrad.addColorStop(0.5, 'rgba(247, 169, 72, 0.5)');
         coreGrad.addColorStop(1, 'rgba(30, 22, 40, 0)');
         intensity = Math.min(1, intensity + 0.02);
         rippleRadius += 2.5;
         break;

      case STATES.FROZEN:
         coreGrad.addColorStop(0, 'rgba(255, 235, 150, 1)');
         coreGrad.addColorStop(0.4, 'rgba(240, 194, 94, 0.7)');
         coreGrad.addColorStop(1, 'rgba(30, 22, 40, 0)');
         break;

      case STATES.MELTING:
         coreGrad.addColorStop(0, 'rgba(240, 194, 94, ' + opacity + ')');
         coreGrad.addColorStop(0.6, 'rgba(196, 166, 217, ' + (opacity * 0.4) + ')');
         coreGrad.addColorStop(1, 'rgba(30, 22, 40, 0)');
         opacity *= 0.985;
         if (opacity < 0.05) {
            opacity = 0;
            intensity = 0;
            state = STATES.IDLE;
         }
         break;
   }

   // Draw core
   ctx.beginPath();
   ctx.arc(CENTER.x, CENTER.y, baseRadius * (1 + intensity * 0.15), 0, Math.PI * 2);
   ctx.fillStyle = coreGrad;
   ctx.globalAlpha = (state === STATES.FROZEN) ? 1 : Math.max(opacity, 0.3);
   ctx.fill();
   ctx.globalAlpha = 1;

   // Ripple ring
   if (rippleRadius > 10) {
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, rippleRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(240, 194, 94, ${0.12 + intensity * 0.15})`;
      ctx.lineWidth = 2 + intensity * 3;
      ctx.stroke();
   }

   requestAnimationFrame(render);
}
requestAnimationFrame(render);

// --- Input Handling ---

let holdStartTime = 0;
let isHolding = false;
let freezeTimeout = null;

function onPointerDown() {
   if (state === STATES.IDLE) {
      state = STATES.CHARGING;
      holdStartTime = performance.now();
      isHolding = true;
      rippleRadius = 0;
   }
}

function onPointerUp() {
   if (!isHolding) return;
   isHolding = false;

   const holdDuration = performance.now() - holdStartTime;

   if (state === STATES.CHARGING) {
      if (holdDuration <= HOLD_DURATION_CAP) {
         // Release at peak → freeze
         state = STATES.FROZEN;
         freezeTimeout = setTimeout(() => {
            state = STATES.MELTING;
         }, 800); // brief freeze before melt
      } else {
         // Over cap → melt immediately
         state = STATES.MELTING;
      }
   }
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointerleave', onPointerUp);
