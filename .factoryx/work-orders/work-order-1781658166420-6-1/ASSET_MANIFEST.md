# ASSET_MANIFEST — Moon Prism Relay Rework (work-order-1781658166420-6-1)

**Contract v2 compliance note**: All material art + music changes use real file-backed assets committed under `games/92-moon-prism-relay/assets/`. In-code-only procedural is not used for these. ASSET_MANIFEST.md lives in this Work Order context dir (alongside prior WO's for the base).

## New assets for this rework (challenge + loss state)
- `shadow-chaser.png` (717 bytes) — distinct robed silhouette + red threat eye / trace cape. Used for new escalating "shadow_chaser" hazard (wave >=3). Palette: house navy/purple fill, #ef4444 red accent, silver/gold highlights. Generated to be legible at game scale (taller profile vs ground `shadow-hazard.png`).
- `relay-break-shatter.wav` (31,796 bytes) — 0.72s 22.05kHz 16-bit mono dramatic shatter: low ominous whoosh (relay failing) + crystalline high noise burst + bright ritual chime tail. Played on Prism Link <=0 loss ("THE RELAY BREAKS"). Not a generic blip.

## Generation (local authored, no external foundry/pipeline)
- Tooling in this env: python3 stdlib only (`zlib`+`struct` for PNG; `wave`+`struct`+`math`+`random` for WAV). No ImageMagick/pillow/pngjs installed or used.
- Scripts (ephemeral in /tmp for this run, reproducible):
  - `/tmp/gen_chaser_png.py` — 40x56 RGB, explicit pixel math for robe/hood/eye/trace/cape/rim using house colors + threat red. Deterministic.
  - `/tmp/gen_break_wav.py` — 0.72s mix: freq-swept sine whoosh + bounded noise*env for shatter + two high sine chimes for tail. Seeded for repro.
- Run dates: 2026-06-17 (per this workspace).
- Post-gen inspection (manual + script):
  - File sizes + sha256 recorded above + in gen stdout.
  - PNG: valid signature, IHDR 40x56 RGB 8bpc, IDAT present, IEND; decodes without error in browser Image.
  - WAV: valid RIFF/WAVE, 1ch 16b 22050, duration ~0.72s, audible dramatic break (low+shatter+chime) when played post-gesture.
- Inlining: base64 data: URLs added as `ASSET_CHASE`, `ASSET_BREAK` (self-contained single-file preserved). Loaded via `new Image()` / `new Audio()` alongside prior 4 PNG + 4 WAV.
- No change to prior authored assets (hero, shard, hazard, skyline, collect/deflect/power/theme) — they remain the source of truth for core verbs.

## Integration + usage
- `shadow-chaser.png` drawn in `drawObstacles()` for `type==='shadow_chaser'` (with pulse red accent overlay for low-link tension tie-in). Fallback vector if img not ready (keeps playable).
- `relay-break-shatter.wav` played via `playBreak()` on any Prism Link loss path (time drain, miss, or hit while <=0). Extra red+gold shatter particles + "THE RELAY BREAKS" gameover text for clear fail feedback.
- Chaser behavior (in update/draw/collision): spawns wave>=3, lerps slowly toward player lane (readable), deflectable only if same lane + jump/dash action (else heavy link drain + hit). Uses existing verbs; adds "read + pre-position" escalation without new inputs.
- All audio post-gesture only; assets <2MB total payload target held (new ~33k raw + base64 overhead << prior theme stem).

## Verification evidence (this WO)
- Chromium runs (see VERIFICATION.md + screenshots): 0 game JS errors, 0 pageerror, 0 asset 404s, no net. Start card renders updated objective + PRISM LINK legend. Gameplay loop exercised post-autostart (spawns, updates, link drain, chaser at wave 3+, loss paths reachable).
- Game Feel re-checked: hit/score feedback extended to link recover + break; easing preserved; input <100ms; touch+keys; etc.
- Blockers addressed before more polish: latent bare `sine`/`sawtooth` refs in play* (would throw on collect) fixed to strings; autostart made immediate for harness to reach playing state reliably.

## Provenance / audit
- All material changes for "add challenge and loss state" are file-backed + this manifest (satisfies payload "generated_assets" + "ASSET_MANIFEST.md provenance").
- Prior base assets from commit 51285599226609aba7314ee8e1a9abff97ade2d3 (asset contract v2 landing) left unchanged.
- If re-gen needed: re-run the two /tmp gens (or equiv) and re-inline; update shas here.

(End of manifest for this Work Order.)
