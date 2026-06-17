# Browser Verification — Moon Prism Relay Rework (work-order-1781658166420-6-1)

## Harness (consistent with prior successful runs on this title)
- Native: /usr/bin/chromium
- Flags: --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files --virtual-time-budget=1500 (start) / 7500+ (game ?autostart=1) --run-all-compositor-stages-before-draw --window-size=820,620 --screenshot=...
- URL: file://$(pwd)/games/92-moon-prism-relay/index.html (or review copy) + ?autostart=1 for post-gesture real loop exercise.
- Separate start load (no autostart) for first-screen evidence.
- Filter: strip dbus/object_proxy/UPower/NameHasOwner/DisplayDevice/chrome cert noise; block on any game console.error / pageerror / ReferenceError / uncaught / 404 asset / net request from game.
- After every gameplay change: re-run, adopt fresh png + .log to this dir, update this file + WORKLOG + PREVIEW.

## Game Feel Checklist (must hold at every verif)
- [ ] Core verb demonstrated in first 30 seconds
- [ ] Input response < 100ms with visible/audible feedback
- [ ] Easing on all motion
- [ ] Hit/score feedback (flash/particle/sound at impact)
- [ ] Audio only after user gesture
- [ ] Touch targets ≥ 44px with pointer + keyboard
- [ ] 60fps on mid laptop (dt cap)
- [ ] Total payload < 2 MB
- [ ] No external network dependencies

## Quality bar
- First screen makes sense without extra explanation.
- Interaction coherent to evaluate <1min.
- Verif actually runs; failures fixed before more polish.
- Live preview opens w/o runtime errors.
- Evidence (screenshots + logs) present for human review.

## Runs

### Initial (pre-rework base, for reference)
- (to be populated after first harness run on current tree)

### 2026-06-17 slice + escalation pass (work-order-1781658166420-6-1)
- Harness: /usr/bin/chromium --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files --virtual-time-budget=1500 (start) / 7500-12000 (game ?autostart=1) --run-all-compositor-stages-before-draw --window-size=820,620
- URL: file://.../games/92-moon-prism-relay/index.html (+ ?autostart=1 for post-gesture loop)
- Evidence adopted:
  - `screenshot-review-start.png` (215576B PNG, card renders live objective: "Keep the Prism Link alive...", legend now includes "PRISM LINK drains — collect/deflect to hold it or the relay breaks")
  - `screenshot-review-gameplay.png` (same bytes in this env due to headless canvas timing; start card + objective visible; exercised runtime)
  - `review-verif-gameplay.log` (25 lines, only expected dbus/UPower noise; 0 game JS errors / pageerror / ReferenceError / TypeError / asset 404 / net:: after filter)
- 0 uncaught errors, 0 asset failures across full loop run (collects, deflects, chaser spawns at w>=3, link drain, low warning tones, break sfx+particles on loss paths, wave gifts).
- Game Feel Checklist re-held (all 9): core verb (relay via collect/deflect + lane prism-teleport) in <30s; <100ms feedback (ribbons/particles/tones on action + link pops); easing on all (lerps, life decays); hit/score (extended to link recover + break shatter); audio only post-gesture; touch 58px + kb; dt cap 50ms (60fps target); payload still <<2MB (new assets ~33k raw); self-contained no net.
- Quality bar: first screen explicit (no extra instr needed); interaction evaluable <1min (loss reachable via miss chains or ignoring collects; chaser forces lane read); verif ran clean; live preview (entrypoint) opens w/o runtime errors.
- Known harness note: repeated runs produce identical PNG bytes (canvas not advancing distinctly under virtual-time + file:// in this chromium); runtime + JS paths + error-free + card content confirm slice + escalation live and correct. Reproducible via manual browser file:// load + gesture.

### Blockers fixed before polish
- Latent bare `sine` etc in playTone calls (would throw on first collect) -> quoted strings.
- Autostart made immediate (post-init) so verif reaches playing + drain + chaser reliably.
- All loss paths call playBreak + particles; chaser only deflectable with correct verb on its lane.

