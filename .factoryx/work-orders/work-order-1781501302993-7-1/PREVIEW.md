# Moon Prism Relay — Preview (Work Order 1781501302993-7-1)

**Canonical preview entrypoint:** `games/92-moon-prism-relay/index.html` (direct, self-contained; works for copied trees under /factoryx/previews/... and file://)

## What this pass delivers
- Addressed operator asset-guard blocking (17:25Z): full inspection of foundry/assets (none usable for hero/enemy/world/music), no generation tooling exposed → deliberate authored procedural SPASS system (detailed vector art for Sailor silhouette with odango/fuku/brooch/ribbons, rich prisms, cratered moon, lamped city with spires/ribbons, multi-voice generative score for lunar skate + henshin + surges). Documented in ASSET_MANIFEST.md.
- Addressed contact-sheet polish (15:32Z) + prior playtest (avatar/shards tiny, first-screen action, clarify collect/avoid, stronger feedback, reduce menu feel): lighter/more transparent glass card, minimal legend, larger player (58x76) + shards + pops(22px+)/slashes(26px+), 28+ spark particles on collect, more ambient gold prisms + eyed shadows visible on first paint under card (gold=collect, dark+red-eye=avoid), stronger reward visuals, music-led moments now scored not bleeps. Skyline/moon/hero mood 100% preserved.
- Still: single-file ~72kB, taste-gate slice (lane-run + collect/deflect + super ritual in one moonlit city), 60fps, gesture audio, responsive (keys/pointer/touch/swipe/R), easing, highscore, escalating waves + gift shards + power surges, live PB ★, restart affordances.
- House style: ribbons as living sacred tech, crescents/geometry, theatrical "✦ MOON PRISM POWER! ✦", sincere power.

## How to preview
1. Open `games/92-moon-prism-relay/index.html` (or deployed preview).
2. First screen: moonlit city (detailed lamps/spires/ribbons + crater moon) + larger idling Sailor silhouette + 3+ bright gold ambient prism shards (collect) + 1-2 dark eyed shadow echoes (deflect) already moving under the compact lighter glass card. ← → / A D on title produce living ribbon swish + lane preview (interactive playable slice before commit).
3. Tap/click "✦ Start Transform ✦" (or Enter/Space) — card fades, audio + music gate on, core loop live.
4. Play: swap (ribbons), jump ground shadows / dash orbs (crescent slash + blue pop + chime + gauge), collect gold prisms (big gold pop + sparkles + gauge + combo), build to full gauge → auto or X for 5s super (flowing ribbons + orbiting prisms + flash + classic call + transformation theme music).
5. Wave advance: "✦ WAVE N ✦" + gold lane surge + gift shards (escalation relay feel).
6. Gameover: large targets, R / tap / Space to restart. ★ Best shown live + on card when beaten.

## Evidence (this pass)
- Real chromium runs (see VERIFICATION.md): start overlay + 8s autostart gameplay exercising all verbs, new feedback, music, authored art, first-screen ambient.
- ASSET_MANIFEST.md with inspection + SPASS rationale.
- Updated WORKLOG + this PREVIEW + VERIFICATION with fresh screenshots/logs.
- Changes on canonical factoryx/factory-sailor-moon/work-order branch + PR #81.

The live preview opens the changed artifact directly. No links after closed HTML, no homepage mutation.

FactoryX Work Order Context
- Work Order: work-order-1781501302993-7-1
- Preview: games/92-moon-prism-relay/index.html
- Full prompt + asset/playtest feedback in payload; this addresses the final blocking notes before deadline.
