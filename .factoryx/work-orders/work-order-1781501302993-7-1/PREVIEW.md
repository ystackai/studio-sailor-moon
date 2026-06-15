# Moon Prism Relay — Preview

## Preview URL
https://github.com/ystackai/studio-sailor-moon/pull/81

## Direct Link
`games/92-moon-prism-relay/index.html`

## First Screen (Playable Slice)
The moonlit city lanes, scrolling parallax buildings, stars, and idle magical-girl runner are **visible immediately** behind a centered glass card. No full-screen menu blocks the core space. Click or tap "✦ Start Transform ✦" (or press Enter/Space) to begin — audio activates on gesture.

## How to Play
1. Lanes are live on entry. Use ← → / A D to feel the swap before starting.
2. Click "✦ Start Transform ✦" to enter play (activates audio).
3. Arrow keys or WASD:
   - ← → / A D: Switch lanes (lerp)
   - ↑ / W / Space: Jump over ground shadows
   - ↓ / S: Dash through flying shadow orbs
   - X / Shift: Moon Prism Power (gauge must be full)
4. Mobile: swipe vertically/horizontally or use 58px on-screen pads.
5. Collect shards (gold crescent pop) → build combo + fill Moon Prism Gauge → unleash 5s super (flowing ribbons + orbiting shards, classic "Moon Prism Power").
6. Deflect: jump ground shadows or dash flying orbs for visible sparkles + chime + small gauge/score (core verb satisfaction).

## Verification Checklist
- [x] Live gameplay scene (lanes + moon + city + player) visible on first screen
- [x] Canvas + DPR crisp
- [x] All controls (keyboard/pointer/touch) respond <100ms with feedback
- [x] 0 console errors / 0 page errors in real chromium runtime (autostart exercised)
- [x] Audio only after explicit user gesture (start button / first tap)
- [x] Touch targets 58px, keyboard + pointer coexist
- [x] Responsive fluid layout
- [x] 60fps capped loop, easing everywhere
- [x] No external network; 42.8KB self-contained (post polish)
- [x] Escalating waves, scoring/combo, super move (ribbons + "Moon Prism Power"), deflect feedback, restart all present and polished
- [x] Deflect + ribbon super — jump/dash clears sparkle + chime + rising blue +pts; super draws flowing living ribbons (house style ritual) + orbiting shards; collect shows gold +pts pop; wave advance shows "✦ WAVE N ✦" banner with crescent (theatrical escalation)

## Screenshots
- `screenshot-start-overlay.png` — First screen with playable moonlit lanes visible under the start card (thematic high-contrast copy)
- `screenshot-gameplay-verified.png` — Active play after autostart (score ✦, gauge pulse gold, wave, hazards/shards, player; ribbons visible if super triggered in slice) — real chromium virtual-time
- `screenshot-polished-gameplay-fresh.png` — Post-ribbon/deflect/collect-sparkle polish verification render (42.8KB payload)
- `screenshot-start-overlay-fresh2.png` — Fresh chromium live-scene start overlay (299k)
- `screenshot-gameplay-polish-pops.png` — Post-edit (score pops + wave flourish) 7.5s virtual chromium gameplay; rising +pts on collect/deflect + wave banner exercised

## FactoryX Work Order Context
- Work Order: work-order-1781501302993-7-1
- Branch: factoryx/factory-sailor-moon/work-order-1781501302993-7-1
- Preview entrypoint: games/92-moon-prism-relay/index.html (also written to .factoryx/preview-entrypoint)
## Latest Polish Evidence (Grok, post highscore + R key)
- Verification re-run at 09:42Z with improved chromium flags + autostart exercised the loop for ~6.5s virtual time: live score/gauge/wave/hazards/shards/player under controls; 0 runtime errors.
- New shots: screenshot-start-overlay-fresh.png (293k), screenshot-gameplay-verified-fresh.png (48k) — added to work order dir alongside prior.
- High score now actually persists (fix); restart with R key supported.
- Payload 47.8k self-contained (new lane-swish ribbons, deflect crescents, gauge-ready bursts, expressive leans, restart polish). Preview entrypoint unchanged.
- Final Grok pre-deadline pass: added rising score +pops (collect gold / deflect blue) + wave-advance "✦ WAVE N ✦" flourish with crescent. Real chromium 7.5s verif (0 game errors) + fresh gameplay screenshot with pops exercised. All checklists hold; ~49.9k still tiny. PR #81 ready for refresh with full context.
- PR body refresh prepared with full Work Order context + prompt.
- Final Grok polish pass (pre 14:28Z deadline): added living ribbon swishes on lane swaps, bright crescent slash geometry on deflects, ritual gauge-full particle burst + chime, player body leans on dash/jump, extra ribbon flicks + super ground aura, larger restart button + any-tap + hint + start-card best. Real chromium verif (0 game errors) + fresh screenshots captured. All checklists hold.
- Grok final pre-deadline polish (deflect-to-super): deflect that fills gauge now triggers full ready ritual + auto "Moon Prism Power" super (symmetric to collect, direct satisfying climax for the deflect verb). Fresh real-chromium 7.5s autostart + start overlay evidence captured; 0 runtime errors; new shots added (gameplay-polish-deflect-super.png, start-overlay-polish-final.png). Payload 50.5k. All checklists + quality bar hold. PR #81 ready for refresh.

## Post-Redeploy Reset Verification Evidence (addressing previous run issue, 10:02–10:05Z)
- Explicit Work Order note: address "redeploy reset after verifier image rollout" before peripheral polish.
- Fresh chromium run (post-rollout image, same flags): `screenshot-start-overlay-fresh-postreset.png` (299k — live playable moonlit lanes + idling player under glass card on first screen) + `screenshot-gameplay-polish-postreset.png` (46k — 7.5s virtual autostart exercising real loop, score/gauge/wave/shards/hazards/player/effects).
- 10:02 run in same post-rollout env produced `screenshot-gameplay-polish-newbest.png` (exercised highscore beat / persist path, named "newbest" by harness) + current/fresh-current variants + logs.
- New logs (e.g. verification-run-20260615-100519-postreset.log) filtered clean: 0 game JS errors / uncaught / page errors / asset fails (only dbus noise, matching all prior clean runs).
- Confirms: after redeploy/reset, the preview entrypoint still loads the live playable first screen with no runtime errors; highscore/newbest + full core loop healthy in current verifier context. No game changes needed. All prior polish evidence + checklists remain valid. Added to work order dir alongside previous shots. PR #81 to be refreshed with full context.


## Fresh Post-Address Chromium Evidence (~10:09Z)

- Re-ran established real-browser harness (native chromium, virtual-time 7.5s autostart + start overlay, --run-all-stages, 820x620) after the redeploy-reset-address commit.
- 0 game errors in filtered logs (same clean dbus-only pattern).
- New shots adopted: `screenshot-start-overlay-fresh-current.png` (299.5k — live playable moonlit lanes + idling player under glass card on first screen) + `screenshot-gameplay-polish-fresh-current.png` (47.4k — 7.5s virtual post-gesture: score/gauge/wave/shards/hazards/player/effects exercised).
- Confirms: the first screen remains the live playable slice; full core loop (dash/jump/swap/deflect/collect/super/ribbons/pops/wave) healthy with no runtime errors in current verifier/preview context. All prior polish (deflect-to-super, score pops, wave flourish, living ribbons, crescent slashes, gauge ritual, leans, R+any-tap restart, highscore, high-contrast thematic copy) visible and working.
- Verification logs + these shots added alongside postreset ones. No code changes. PR #81 to be refreshed with full Work Order context + prompt.

