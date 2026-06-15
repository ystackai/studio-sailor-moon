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
5. Collect shards → build combo + fill Moon Prism Gage → unleash 5s super (invincible orbiting shards).

## Verification Checklist
- [x] Live gameplay scene (lanes + moon + city + player) visible on first screen
- [x] Canvas + DPR crisp
- [x] All controls (keyboard/pointer/touch) respond <100ms with feedback
- [x] 0 console errors / 0 page errors in real chromium runtime (autostart exercised)
- [x] Audio only after explicit user gesture (start button / first tap)
- [x] Touch targets 58px, keyboard + pointer coexist
- [x] Responsive fluid layout
- [x] 60fps capped loop, easing everywhere
- [x] No external network; 40KB self-contained
- [x] Escalating waves, scoring/combo, super move, restart all present and polished

## Screenshots
- `screenshot-start-overlay.png` — First screen with playable moonlit lanes visible under the start card (thematic high-contrast copy)
- `screenshot-gameplay-verified.png` — Active play after autostart (score, gauge pulse, hazards, shards, wave) — captured via real browser runtime with virtual time

## FactoryX Work Order Context
- Work Order: work-order-1781501302993-7-1
- Branch: factoryx/factory-sailor-moon/work-order-1781501302993-7-1
- Preview entrypoint: games/92-moon-prism-relay/index.html (also written to .factoryx/preview-entrypoint)