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
- [x] Deflect + ribbon super — jump/dash clears sparkle + chime; super draws flowing living ribbons (house style ritual) + orbiting shards

## Screenshots
- `screenshot-start-overlay.png` — First screen with playable moonlit lanes visible under the start card (thematic high-contrast copy)
- `screenshot-gameplay-verified.png` — Active play after autostart (score ✦, gauge pulse gold, wave, hazards/shards, player; ribbons visible if super triggered in slice) — real chromium virtual-time
- `screenshot-polished-gameplay-fresh.png` — Post-ribbon/deflect/collect-sparkle polish verification render (42.8KB payload)

## FactoryX Work Order Context
- Work Order: work-order-1781501302993-7-1
- Branch: factoryx/factory-sailor-moon/work-order-1781501302993-7-1
- Preview entrypoint: games/92-moon-prism-relay/index.html (also written to .factoryx/preview-entrypoint)
## Latest Polish Evidence (Grok, post highscore + R key)
- Verification re-run at 09:42Z with improved chromium flags + autostart exercised the loop for ~6.5s virtual time: live score/gauge/wave/hazards/shards/player under controls; 0 runtime errors.
- New shots: screenshot-start-overlay-fresh.png (293k), screenshot-gameplay-verified-fresh.png (48k) — added to work order dir alongside prior.
- High score now actually persists (fix); restart with R key supported.
- Payload 42.9k self-contained. Preview entrypoint unchanged.
- PR body refresh prepared with full Work Order context + prompt.

