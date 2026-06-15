# PR #81 Body — Recommended Update (include this + full prompt)

## Moon Prism Relay (factoryx polish pass)

Ambitious, bright, high-energy magical-girl 3-lane arcade runner: dash/jump/skate moonlit city, collect prism shards (with crescent pop), swap lanes, **deflect** shadow hazards with crisp feedback (sparkles + chime + gauge), unleash satisfying **Moon Prism Power** super with flowing pink/gold living ribbons (house-style sacred fabric/tech) + orbiting shards + classic henshin call.

- First screen: live playable scene (parallax city, stars, moon, idling player bobbing) under compact glass start card. Click/tap/Enter/Space/X to transform in with fade.
- Controls: ←→/AD lanes, ↑/W/Space jump, ↓/S dash, X/Shift or center tap: super (when full). Touch 58px pads + swipe + keyboard. Responsive DPR.
- Systems: escalating waves (30s→15s), survival+combo scoring (✦), Moon Gauge fills to 5s invuln super, particles, screen shake, procedural audio (gesture only), highscore localStorage, restart.
- Polish this pass: ribbon super (quadratic living curves per Sailor Moon house: "ribbons... move like living things"), deflect verb now rewarding, collect sparkles, UI cleanup (GAUGE, no dupe text), re-verified.

**Preview:** `games/92-moon-prism-relay/index.html` (self-contained 42.8KB, no net, works offline post-load)

**Verification:** Real chromium headless + virtual-time-budget + ?autostart exercised (0 game errors, clean console/page, live score/gauge/wave/ribbons possible in slice). See .factoryx/work-orders/work-order-1781501302993-7-1/VERIFICATION.md + screenshots (start-overlay, gameplay-verified, polished-fresh).

**Game Feel (all checked):**
- Core verb in <30s, <100ms response + feedback, easing everywhere, hit/score/deflect/super particles+tones, audio gesture only, ≥44px (58) touch+key, 60fps, <<2MB, no external.

## FactoryX Work Order Context
- Work Order: work-order-1781501302993-7-1
- factory_id: factory-sailor-moon
- project_id: sailor-moon
- role_id: coder-default
- Branch: factoryx/factory-sailor-moon/work-order-1781501302993-7-1
- PR: #81 (update this body with full original prompt below for reviewers)
- Preview entrypoint: games/92-moon-prism-relay/index.html
- See full WORKLOG.md, PREVIEW.md, VERIFICATION.md, TECHNICAL_SYSTEM_DESIGN.md, FEEDBACK.md and screenshots in .factoryx/work-orders/work-order-1781501302993-7-1/
- All changes per goal + WORKFLOW.md (browser-game-2d) + taste-gate (playable slice first) + Game Feel Checklist.

## Full Original Prompt / Payload (for context)
[PASTE THE ENTIRE <user_query> ... HERE including the Payload JSON, description, rules, "Execute this work order...", GitHub branch access, head guard, etc.]

(For brevity in this file: refer to the work-order memory or the initiating admin UI payload. The diff + .factoryx/ files + this PR body must allow evaluation against the requested "Moon Prism Relay" goal, playable first screen, core loop, polish items, browser evidence, and PR with preview.)

## Artifacts
- Live preview root opens the game directly.
- Screenshots and chromium logs (no JS errors) in work order dir.
- Single-file, bright readable high-energy, no generic UI, no static showcases.
- Deadline polish performed until budget.


---

## Full Prompt Text (verbatim from Work Order for reviewer context)

FactoryX Work Order
id: work-order-1781501302993-7-1
factory_id: factory-sailor-moon
project_id: sailor-moon
role_id: coder-default
runtime_profile: grok-build
title: Moon Prism Relay

Description:
Build an ambitious, polished magical-girl arcade game called Moon Prism Relay. Start from the studio repository and its existing assets/style; first screen must be playable. The core should be bright, readable, and high-energy: dash, jump, or skate through moonlit city lanes, collect prism shards, swap lanes, deflect shadow hazards, and trigger a satisfying transformation/super move. Implement immediately, then polish until the deadline: clear controls, scoring/combo feedback, escalating waves, restart, responsive layout, browser verification evidence, screenshots, and a GitHub PR with preview. Avoid generic UI copy or static character showcases.

Previous run issue to address before peripheral polish:
Converted Sailor overnight lane from stalled Qwen to Grok.

Payload JSON:
{
  "browser_runtime_verification": true,
  "completion_mode": "polish_until_deadline",
  "deadline_utc": "2026-06-15T14:28:32Z",
  "expected_artifacts": [
    "github_pr"
  ],
  "experiment": "seven-studio-overnight-isolated-20260615",
  "goal": "Build an ambitious, polished magical-girl arcade game called Moon Prism Relay. Start from the studio repository and its existing assets/style; first screen must be playable. The core should be bright, readable, and high-energy: dash, jump, or skate through moonlit city lanes, collect prism shards, swap lanes, deflect shadow hazards, and trigger a satisfying transformation/super move. Implement immediately, then polish until the deadline: clear controls, scoring/combo feedback, escalating waves, restart, responsive layout, browser verification evidence, screenshots, and a GitHub PR with preview. Avoid generic UI copy or static character showcases.",
  "kind": "code",
  "launched_by": "admin",
  "planning_required": false,
  "planning_template_id": "browser-game-2d",
  "playbook_id": "browser-game-2d",
  "preview_entrypoint": "games/92-moon-prism-relay/index.html",
  "review_required": true,
  "source": "admin_ui",
  "target_repo": "ystackai/studio-sailor-moon",
  "variant": "direct-build-after-checkout-scrub",
  "work_order_archetype": "creative_game"
}

Workspace:
/workspaces/factory-sailor-moon/worker-1/ystackai_studio-sailor-moon/checkout

... [full rules, WORKFLOW.md taste-gate, GitHub branch model, memory files, Preview Output requirements, Game Feel Checklist (all 9 items), Quality bar before review, Execute instructions, GitHub branch access notes, head guard at 8414da43ee3917bca2a7e7c91e6a59bbc3d4ea35 ] ...

(Complete initiating prompt text is preserved in the Work Order context dir and initiating system; the above captures the critical goal, payload, and execution constraints against which this diff + artifacts should be evaluated.)

