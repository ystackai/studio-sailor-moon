# Technical System Design — Moon Prism Relay Rework (work-order-1781658166420-6-1)

## Core Loop (preserved)
- 3-lane infinite side-scroller (lanes -1,0,1). Player at fixed screen X, world scrolls left.
- Verbs: lane swap (lerp, "prism teleport" feel via ribbon swish), jump (gravity, counter ground shadows), dash (boost + low profile, counter air orbs), X/super when gauge full (5s invuln + ribbons + orbiting).
- Collect floating prism shards → score + combo + moonGauge fill + link recovery.
- Deflect (correct action on hazard) → small score/gauge + link recovery + slash/particle.
- Wrong action or passive hit → hitPlayer (invuln short, combo break, link drain or damage).
- Waves: every ~25-30s, spawn intervals tighten, new types unlock, speed ramps slightly.
- Scenery: parallax buildings + stars + optional skyline layer. All easing (lerp positions, life decays, sin bobs).

## New: Prism Link (the fail state + time pressure)
- New state var: prismLink (0-100, start 100), linkMax=100, linkDrainPerSec base 4-8 (tuned), linkRecoverCollect=18, linkRecoverDeflect=12, linkHitDrain=35.
- In update(playing): prismLink = clamp( prismLink - drain*dt + recoveries )
- If shard scrolls off left without collect: small drain (miss penalty, 5-8).
- Visual: new top-center or integrated HUD bar "PRISM LINK" with moon/crescent fill (gold to red when <30). When low: add red vignette/edge pulse on lanes, player sprite desaturate or extra shake, urgent low-tone pulse (file-backed if new asset).
- Loss: if prismLink <=0 at end of frame (or on hit while <=0), trigger linkBreak(): big shatter particles (gold+red), ribbon tear fx, play break sfx, state='gameover', "THE RELAY BREAKS" + final score.
- On hitPlayer: always drain link (heavy), if was <=0 or after drain <=0 then break instead of temp invuln only.
- Gauge (moonGauge) remains for super access (now more valuable as panic button: super also gives brief link freeze or boost? but keep simple: during super, drain is halved or paused).
- This gives "meaningful fail" (you can see it coming, recover with skill) + time pressure (can't just dodge forever).

## Escalation
- Spawn tuning: base intervals already wave-scaled; tighten further at wave>=3, add density (sometimes 2 shards or paired hazards).
- New hazard type (for "escalating hazards or enemies"): `shadow_chaser` (or "youma trace").
  - Spawns at wave>=2. Slowly lerps toward player's current lane over 1.5s.
  - Appears as darker silhouette with pulsing red (reuse/extend hazard sprite or new small asset).
  - Counter: must be in correct lane and jump or dash at right moment, or it "grabs" (heavy link drain + hit). Wrong lane action still hits.
  - Keeps existing verb set; adds "read the approach + pre-position" tension.
- Wave advance: on cross, + small link restore (relay surge gift), stronger wavePop, spawn burst of safe shards.
- Difficulty: scroll speed +0.8% per wave, spawn accel caps at reasonable (not bullet hell).

## First Screen Objective
- Start card copy updated to foreground the goal: title + "Keep the Prism Link alive." tagline "Skate. Chain shards. Deflect the dark. Do not let the relay break."
- Legend keys remain + add one line: "Link bar drains — collect/deflect to hold it."
- Demo ambience: during start state, spawn 1-2 slow shards + 1 hazard + show a slowly draining preview link bar (or static full with note) under the glass card so objective is visible without starting. Pre-start keys still do ribbon swishes for verb practice.
- On gameover: "Link shattered" instead of generic, "R / tap / space to relay again", show survived time or max wave as secondary score.

## Assets & Integration (contract v2)
- Existing 4 PNG + 4 WAV in assets/ stay; inlined as data: in the HTML.
- For rework, if new central element (chaser needs distinct silhouette or link "crystal" icon for HUD, or shatter sfx), author:
  - PNG via node/pngjs script (explicit pixels, house palette: moonlight silver, gold #f4d35e, rose #ec4899, navy, red threat #ef4444).
  - WAV via python/wave (additive musical chime or noise burst for break).
- All new assets go to games/92-moon-prism-relay/assets/<name>.png|wav
- New ASSET_ consts in HTML as base64 of the file content (read at build? but since single file, either manual or a small node inline step before commit).
- ASSET_MANIFEST.md (this WO's context dir) records inspection, generation, files, integration, verif, blocker notes. Same as prior.
- No change to "in-code only" for hero/shards/hazards — they remain file-backed.

## HUD / UI
- Retain bottom ✦ score + combo, top-right wave, moon GAUGE (pulse).
- Add centered or left-of-gauge "PRISM LINK" 120px bar (rounded rect fill, inner crescent or vertical lines for segments). Color: #f0abfc >30, lerp to #ef4444 <30. Small label "LINK" or "RELAY".
- Low state: gctx stroke or uctx overlay soft red radial at edges or lane lines glow red; player glow becomes warning orange.
- Score pops, deflect slashes, lane ribbons, super ribbons all kept + extended for link events (e.g. link recover pop is green-gold "LINK+").

## Audio
- All post-gesture.
- Reuse/extend play* for new: low link warning uses soft pulse (new or existing tone); break uses new shatter WAV + low whoosh.
- Theme stem continues low during play; perhaps duck or add tension layer but keep lightweight (no new loops unless small).

## Performance / Limits
- Same: dt cap 50ms, canvas 2d simple drawImage + paths, <200 entities, still target 50-60kB html post inline (new assets add ~10-20k base64 ok).
- No net, touch 58px, keyboard full, easing on new motion (lerp chaser, life fades).

## Verification points
- Every edit: node --check on extracted JS.
- Post meaningful: native chromium + virtual time 1.5s start + 7.5s+ ?autostart=1 + --run-all... + 820x620 screenshot + full log capture. Filter for game errors only.
- Adopt png + .log to this WO dir.
- Re-confirm 0 game errors, first screen live, link bar visible+draining in gameplay shot, a loss path exercised or clearly possible, new hazard if added.

## Open questions (resolved in slice)
- Exact drain vs recover tuning: playtest in verif harness + manual if possible; aim for ~45s average survival on first tries, 90s+ with good chains.
- Chaser counter window: generous early, tighten with wave.
- Keep moonGauge separate (for super as "clutch" tool that also pauses some drain).
