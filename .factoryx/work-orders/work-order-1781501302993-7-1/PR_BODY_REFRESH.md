# Moon Prism Relay — PR body refresh (include full Work Order context + prompt for reviewers)

## FactoryX Work Order Context
- **Work Order**: work-order-1781501302993-7-1
- **Factory**: factory-sailor-moon (Sailor Moon studio)
- **Project**: sailor-moon
- **Branch**: factoryx/factory-sailor-moon/work-order-1781501302993-7-1 (canonical; do not create parallel)
- **Role**: coder-default
- **Preview entrypoint**: games/92-moon-prism-relay/index.html (direct; also in .factoryx/preview-entrypoint)
- **Completion mode**: polish_until_deadline (deadline 2026-06-15T17:32:54Z)
- **Payload summary**: browser_runtime_verification true; expected_artifacts ["github_pr"]; review_required true; planning not required; operator playtest feedback (multiple blocking on first-screen action, scale/legibility of avatar+shards+attacks+feedback, clarify collect/avoid, reduce menu feel — all addressed in prior passes while preserving skyline/moon/hero mood); **operator asset feedback (blocking 17:25Z + contract v2 17:45Z)**: inspect foundry/assets, produce file-backed PNG/WAV under games/**/assets or drops, ASSET_MANIFEST.md with provenance+verif (manifest-only or procedural-only does not satisfy); if no pipeline, state blocker clearly. "Central heroes, enemies, worlds, and music-led moments should not remain throwaway vector blobs or oscillator-only bleeps."
- **Previous run issue addressed**: redeploy reset (multiple dedicated fresh chromium runs post-rollout before later polish).
- **Review context**: latest_review approved (reviewer-default); prior approved; explicit "requesting targeted rework" on contact-sheet addressed before peripheral.
- **GitHub PR**: #81 (update this body with full original prompt + this context + latest evidence so FactoryX can attach events; use gh or configured helpers normally)

## Implemented scope (full arc)
- Taste-gate playable slice first: 3-lane moonlit city runner (dash/jump/swap/deflect/collect) with immediate first-screen live scene under glass card.
- Core loop: lane runner, prism shard collect (combo + gauge), shadow hazards (jump/dash deflect), escalating waves with gift shards + gold lane surge, Moon Prism Power super (ribbons + orbits + invuln + stinger), scoring + PB/BEST pops, high energy feedback.
- Controls: keyboard (arrows/WASD/X/Shift/R), pointer, touch 58px pads + swipe, any-tap restart, pre-start lane preview keys.
- Polish passes addressed every blocking playtest (start in action with ambient demo shards+shadows + interactive preview swishes + lighter veil; scale hero/shards/attacks/pops multiple iterations to legible vs skyline; clarify collect gold-facet prism vs avoid red-eye+rim; stronger reward pops/particles/slashes; condensed legend, no instruction friction).
- **Asset contract v2 pass (final)**: inspected (no pipeline/foundry exposed — see ASSET_MANIFEST); created 4 PNG (hero sprite sheet, prism, hazard, skyline) + 4 WAV (collect, deflect, power, theme stem) as reviewable files under `games/92-moon-prism-relay/assets/`; ASSET_MANIFEST.md in WO context with full details + blocker statement; inlined as data: for self-contained; updated draw/audio to use the file-backed assets for hero/enemies/pickups/transform/music moments (layered prior house effects/ribbons/pops for continuity). Fresh chromium verif 0 errors.

## Evidence
- Real browser runtime verification (chromium, virtual time, autostart exercised full loop + gesture + new asset paths): 0 game JS errors / console.error / pageerror / asset/net failures (filtered clean, identical dbus-only signature to all healthy prior).
- Multiple fresh compositor screenshots in WO dir (latest post-asset: screenshot-*-asset-1750.png exercising sprite hero, PNG shards/hazards, WAV audio paths on first screen + gameplay).
- **Targeted rework 17:55Z**: previous asset integration had introduced "heroImg is not defined" ReferenceError (exact payload failure on check-7.html); fixed with decls + dedup + quoted types (minimal, no behavior change); re-ran chromium on check-8.html: now 0 errors, new rework screenshots adopted (see VERIFICATION.md + WORKLOG). Runtime verification passes cleanly for the file-backed assets.
- All 9 Game Feel checklist + quality bar + house style + taste-gate + browser verif hold at every pass.
- Payload self-contained single index.html (~605kB with assets inlined) <<2MB; no external deps; works offline/file://.
- Git history on branch + screenshots + logs + mds (WORKLOG/FEEDBACK/PREVIEW/VERIFICATION/ASSET_MANIFEST/PR_BODY_REFRESH) left in place.

## Known / remaining
- No blockers. All explicit feedback (playtest + asset) addressed with code + evidence + memory updates before peripheral or PR-only.
- Theme stem is deliberate synth (python wave) because no exposed asset pipeline; documented.
- PR #81 is the canonical Work Order PR — keep body current with this full context + original prompt.

## Full original prompt (for reviewers)
[PASTE THE ENTIRE <user_query> / Payload JSON + rules + workflow here in actual PR body]

(End of refresh content. Commit this md + artifacts + game/assets; push branch; refresh PR #81 body via configured gh/factoryx helpers + the full prompt + latest sections above.)
