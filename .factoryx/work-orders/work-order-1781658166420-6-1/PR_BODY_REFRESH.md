# PR Body Refresh for review (work-order-1781658166420-6-1)

Include this full FactoryX Work Order Context + the original prompt in the canonical PR description so reviewers can evaluate the diff against the requested scope.

## FactoryX Work Order Context
- Work Order: work-order-1781658166420-6-1
- factory_id: factory-sailor-moon
- project_id: sailor-moon
- role_id: coder-default
- runtime_profile: grok-build
- deliverable: moon-prism-relay (games/92-moon-prism-relay/index.html + assets/)
- Source decision: deliverable-decision-1781629237878-1
- Preview entrypoint: games/92-moon-prism-relay/index.html
- Expected artifacts: github_pr, preview_url_if_available, review_summary, screenshots, generated_assets (real file-backed + ASSET_MANIFEST.md)

(See the full Payload JSON and Description in the originating user_query / work order.)

## What was delivered (focused, no peripheral polish)
- Meaningful fail state: Prism Link (draining bar, time + miss + hit pressure, recover on collect/deflect, 0 = "THE RELAY BREAKS" gameover with shatter particles + new file-backed sfx).
- Escalating hazard: shadow_chaser (wave>=3, tracks lane slowly, requires pre-position + correct verb or heavy penalty).
- Score/time pressure + tuning: link drain 5.5/s (halved during super clutch), wave gifts, tuned recovers so skilled play sustains but errors lose.
- Clear first-screen: start card + legend now say "Keep the Prism Link alive. ... PRISM LINK drains — collect/deflect to hold it or the relay breaks".
- AV feedback: low-link red lane pulses + vignette + tones; link recover pops; break shatter + particles on loss.
- Real file-backed assets + provenance: shadow-chaser.png + relay-break-shatter.wav under game assets/ (pure local gen), + ASSET_MANIFEST.md in this WO dir.
- Browser verif: chromium harness runs (0 game errors, exercised start + post-gesture loop + loss paths + chaser), screenshots + logs in WO dir.
- All Game Feel 9 items + quality bar re-held.
- Memory updated, branch on factoryx/... , commit includes full prompt ref.

## Evidence in tree
- .factoryx/work-orders/work-order-1781658166420-6-1/{screenshot-*.png, review-*.log, ASSET_MANIFEST.md, PREVIEW.md, VERIFICATION.md, WORKLOG.md}

## PR instructions for human admin
Update this PR body to embed the *full original user_query* (the long FactoryX Work Order prompt) under a "FactoryX Work Order Context" heading so automation can attach events. The diff is the minimal product-shaped change addressing the operator feedback (too easy, no lose) while preserving the approved teleport/prism relay core.

(End refresh note — paste the originating <user_query> content into the live PR description.)
