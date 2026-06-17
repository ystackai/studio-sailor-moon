# Moon Prism Relay Rework — Preview (work-order-1781658166420-6-1)

## Preview URL / Entrypoint
`games/92-moon-prism-relay/index.html` (updated .factoryx/preview-entrypoint)

## Branch
`factoryx/factory-sailor-moon/work-order-1781658166420-6-1`

## Goal (from payload)
Add meaningful fail states, escalating hazards/enemies, score/time pressure, tuning, clear first-screen objective/feedback so the game has tension without becoming unfair. Preserve teleport/prism relay feel. Real file assets + ASSET_MANIFEST. Browser verif + screenshots. Reviewable PR.

## First Screen (Post-Rework Slice)
- Live moonlit 3 lanes + parallax skyline + idle hero (odango/fuku sprite) visible immediately under glass card.
- Explicit objective in card + legend: "Keep the Prism Link alive." "Collect shards. Deflect shadows. Hold the relay."
- New: PRISM LINK bar (draining) visible in demo or immediately on start; low-link warning (red pulses) when tested.
- "✦ Start Transform ✦" or Enter/Space/X starts (audio on gesture). Pre-start ←→ produce ribbon swishes (verb practice).

## How to Play (updated for challenge)
- ←→ / A D : switch lanes (prism teleport feel, ribbon trail)
- ↑ / W / Space : jump (ground shadows)
- ↓ / S : dash (air orbs, chasers)
- X / Shift : Moon Prism Power (when gauge full — clutch for invuln + ribbon ritual)
- Collect gold faceted prisms → score + link restore + gauge
- Correct jump/dash on hazards → deflect (slash + link/score restore)
- Miss shard offscreen or take hit → link drains (time + error pressure)
- Link reaches 0 → "THE RELAY BREAKS" — game over. Recover with chains before it drops.
- Waves escalate: faster/denser spawns, new chaser enemies that track your lane.

## Verification Evidence (will be appended with dates + shots)
- Real chromium runs (headless + virtual time + autostart) exercising start + 7.5s+ post-gesture loop.
- Screenshots: start-overlay (live scene + link bar), gameplay (link draining, score, hazards, possible loss or near-loss state).
- Logs: 0 game JS errors, 0 pageerror, 0 asset failures.
- Game Feel Checklist re-held after changes.
- ASSET_MANIFEST.md (this WO context) for any new authored assets.
- 2026-06-17 evidence (post-slice+escalation+assets): `screenshot-review-start.png`, `screenshot-review-gameplay.png`, `review-verif-gameplay.log` (0 game errors) + ASSET_MANIFEST.md (shadow-chaser.png + relay-break-shatter.wav provenance). See VERIFICATION.md for full table + notes on harness render timing. First screen card + legend now foreground "Prism Link" objective + drain rule. Loss ("THE RELAY BREAKS") + chaser + low red pulses + recover via collect/deflect all live and tense but recoverable with skill.

## FactoryX Work Order Context
- Work Order: work-order-1781658166420-6-1
- Source decision: deliverable-decision-1781629237878-1
- Payload kind: code, creative_game, planning_template browser-game-2d, review_required true, browser_runtime_verification true
- Preview entrypoint: games/92-moon-prism-relay/index.html

