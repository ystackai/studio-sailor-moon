# Goal Execution Strategy — Work Order 1781658166420-6-1 (Moon Prism Relay Rework)

## Source
- Operator feedback via deliverable-decision-1781629237878-1: "approved the teleporting mechanic as fun but noted there does not seem to be a way to lose and the game is too easy."
- Goal: focused follow-on for games/92-moon-prism-relay preserving teleporting/prism relay feel + adding meaningful fail states, escalating hazards/enemies, score/time pressure, tuning, clear first-screen objective/feedback. Tension without unfair. Improve AV feedback. Real file-backed assets + ASSET_MANIFEST. Browser verif + screenshots. Update preview-entrypoint. Reviewable GitHub PR.

## Constraints & Non-Goals (from WORKFLOW + payload)
- Taste-gate first: 30-60s playable slice of **one verb in one space** before broad systems. Here the core verb is "prism relay traversal + timing collect/deflect in lanes" (the teleport/swap + action counters). Start with minimal addition to that verb/space.
- No save/load, inventory, multiple levels, procedural gen, broad settings, achievements unless requested.
- Single self-contained index.html (preview root).
- All material art/music: file-backed under assets/ + manifest provenance (no in-code-only for central elements).
- Browser runtime verif (real chromium, pageerror/console/request capture, in-game state post interaction).
- Game Feel 9 items + Quality bar before review.
- Work only on canonical branch; push via specified command; one canonical PR; include full WO context in PR body.
- Use memory files in this FACTORYX_WORK_ORDER_CONTEXT_DIR.

## Phasing (size steps by risk/ambiguity)
1. **Taste-gate slice (high priority, low risk)**: Add the core fail state + pressure mechanic (draining Link bar) as a minimal diff on the existing playable first screen. One new HUD element + one loss path + one visual warning. Verify playable + tense in browser immediately. Pivot if slice not interesting.
2. **Escalation & tuning (medium)**: After slice evidence, add 1 new counterable hazard type (escalating), spawn tuning, miss penalties, wave pressure. Keep numbers such that skilled play (chain collects + timely deflects) can recover link and survive 45-90s+ for high score.
3. **First-screen clarity + feedback**: Make objective obvious on load (no extra instruction needed). Add low-link AV (flash, particles, optional new sfx asset).
4. **Assets**: Any new central visual (e.g. link glyph or new enemy sprite) or music moment (shatter/break sfx) authored to files + manifest. Re-inline for self-contained.
5. **Verification loop**: After every material change, run browser harness, capture evidence, fix blockers (0 game errors) before more polish. Adopt screenshots/logs to this dir.
6. **Memory & PR**: Continuous updates to WORKLOG/PREVIEW/VERIFICATION/FEEDBACK. Final push + PR body refresh with full prompt.

## Risk decisions
- Drain rate / recover amounts: start conservative (playable 30s+ for average, 60s+ skilled), then tune with verif runs. Risk of "unfair" mitigated by visible telegraphing + generous early recovery.
- New hazard: keep same lane physics, add simple AI (slow lane follow) so counter with existing jump/dash/swap verbs — no new verbs.
- Assets: reuse prior pipeline (node pngjs for sprite, python wave for sfx) since no foundry exposed; document in manifest as before.
- If slice feels bad after honest play: simplify drain to "surge timer per wave" or "X misses = break" instead of continuous drain.

## Success criteria (concrete)
- First 10s: player sees live lanes + hero + moving shards/hazards + explicit "PRISM LINK" bar (draining) + legend that says collect/avoid to hold the relay.
- Within 30s play: can lose (link hits 0) if ignoring collects or eating hits; can also recover and keep going with good timing.
- No gameover on first or second mistake if link >0; clear tension at low link (red flash, faster drain warning).
- 0 runtime errors in chromium verif post-interaction.
- Payload still <2MB; 60fps; all 9 feel items; house style (ribbons/crescents/ritual sincerity, moonlight as power).
- Evidence in this WO dir + PR updated.

## References
- Payload JSON in query.
- Prior WO 1781501302993-7-1 memory (the base game + asset contract v2).
- .factoryx/work-orders/work-order-1781546294070-7-14 (review notes).
- WORKFLOW.md, Game Feel Checklist, house style in FACTORY_CONTEXT.md.
