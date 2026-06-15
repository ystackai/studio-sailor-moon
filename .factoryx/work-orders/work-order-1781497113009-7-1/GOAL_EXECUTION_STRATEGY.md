# GOAL EXECUTION STRATEGY — Moon Prism Relay

**Work Order:** `work-order-1781497113009-7-1`  
**Archetype:** `creative_game`  
**Preview Entry Point:** `games/88-moon-prism-relay/index.html`  
**Variant:** `sailor-moon`  
**Experiment:** `overnight-seven-games-20260615`  
**Strategy Status:** DRAFT (pre-implementation)  
**Date:** 2026-06-15

---

## 1. Vision and Player Fantasy

### Player Fantasy

The player is Sailor Moon herself — or rather, the *prism energy* she channels. They are not watching a character run; they *are* the prism burst, the arc of silver light cutting through darkness. Every tap, keypress, or drag releases a wave of moonlight. Star sprites — lost fragments of the Silver Millennium — scatter across a scrolling night sky. The player must time prism bursts to rescue them before they fade, chaining transformations into a growing combo of light.

**One-sentence pitch:** You *are* moonlight — time your bursts to rescue fading star sprites, chain transformations into dazzling combos, and hold back the encroaching darkness.

### Emotional Target

- **Primary:** The euphoric rush of a well-timed combo — a streak of prism bursts that feel like conducting a celestial symphony.
- **Secondary:** Gentle urgency — stars are *fading*, and the player feels responsible for saving them, not just "killing" enemies. This aligns with Sailor Moon's core philosophy that power is about connection and protection, not destruction.
- **Tertiary:** The satisfaction of visible progression — each run leaves the sky slightly brighter, combos feel more fluid, and the player's own skill is reflected in the purity of light they produce.

### References and Inspirations

| Reference | What We Steal | What We Avoid |
|-----------|---------------|----------------|
| *Crazy Taxi* (arcade sense of speed) | Momentum, timing-based scoring | Car physics, urban setting |
| *Doodle Jump* / *Flappy Bird* (timing) | Simple one-button core loop, rhythm | Repetition fatigue, no depth |
| *Katamari Damacy* (absorbing) | Collecting stars, growing combo multiplier | Physical rolling, humor tone |
| Sailor Moon henshin sequences | Silver/gold palette, sacred geometry, fabric/ribbon motion | Full transformation animation (out of scope) |
| *Geometry Wars* (particle feedback) | Satisfying burst feedback on hit | Violence/gore aesthetic |

---

## 2. Mood, World, and Aesthetic Direction

### Visual Identity

- **Background:** Deep cosmic blues (`#0a0e2a`, `#141833`) with a parallax-scrolling starfield. Stars should be small but numerous, creating a sense of infinite depth.
- **Player Prism Burst:** A radiant silver-white burst (`#ffffff` with `#c0d8ff` glow) expanding outward from the tap/click point. Multiple layers: inner core (bright white), mid-ring (silver with alpha), outer aura (pale blue glow).
- **Star Sprites:** Small golden crescent stars (`#ffd700`, `#fff8dc`) with a gentle pulsing animation. When rescued, they dissolve into silver light particles.
- **Obstacles/Darkness:** Dark purple/black shapes (`#1a0a2e`, `#2a1040`) — floating shadow fragments that drift toward the player's burst area. Hitting one reduces score or ends the combo.
- **UI:** Minimal HUD at the top — score, combo multiplier, lives. All rendered in silver/white with Moon sigil accents. No cluttered panels.

### Art Style Principles

- **Sacred geometry:** Crescent shapes, circular bursts, ribbon-like trails.
- **Silver-and-gold palette:** Never pure white without a blue/silver tint; never pure black without a deep blue undertone.
- **Fabric motion in particles:** Burst particles should have a slight ribbon/trail quality, not just straight-line sparks.
- **No external IP:** All visuals are canvas-drawn procedural shapes. No imported artwork.

### Audio Identity

- **Synthesized SFX only** (Web Audio API):
  - Prism burst: A soft "shimmer" — high-frequency sine sweep with quick decay.
  - Star rescue: A warm, ascending chime (two-note motif in golden ratio intervals).
  - Combo chain: Each successive chain tier adds a harmonic overtone — the combo *sounds* richer.
  - Darkness hit: A dull, low-frequency thud with a slight distortion.
  - Game over: A descending silver bell tone.
- **No background music** in v1 — the game's rhythm *is* the music. This keeps the payload small and avoids needing a soundtrack.
- **Audio starts only after first user gesture** — no autoplay.

---

## 3. Core Interaction Loop and Progression

### The Core Loop (understandable in 10 seconds, fun in 60)

```
1. STAR appears on the scrolling night sky
2. PLAYER taps/clicks/presses space to fire a prism burst
3. BURST expands — if it overlaps a star, the star is RESCUED (score + combo)
4. If a star reaches the left edge without being rescued, it FADES (combo reset, lives -1)
5. DARKNESS fragments occasionally drift in — touching them ends the current combo
6. The game continues until all lives are lost
7. GAME OVER screen shows final score, best combo, and an instant RETRY button
```

### Scoring System

| Action | Score | Combo |
|--------|-------|-------|
| Rescue a star | 100 × tier | Combo count +1 |
| Chain 5+ consecutive rescues | Bonus 500 | Combo multiplier ×1.5 |
| Chain 10+ consecutive rescues | Bonus 1500 | Combo multiplier ×2.0 |
| Chain 20+ consecutive rescues | Bonus 5000 | Combo multiplier ×3.0 |
| Darkness fragment hit | — | Combo resets to 0, lives -1 |
| Star fades at screen edge | — | Combo resets to 0, lives -1 |

### Progression / Difficulty Curve

- **Phase 1 (0–30s):** Stars spawn slowly, darkness fragments rare. Player learns timing.
- **Phase 2 (30–90s):** Spawn rate increases, darkness fragments appear more frequently. Player enters flow state.
- **Phase 3 (90s+):** Stars spawn rapidly, darkness fragments are aggressive. High-score chase mode.
- **Combo system** provides the real progression: the player gets better at chaining, not at "leveling up" a character.

### Controls

| Input | Desktop | Mobile |
|-------|---------|--------|
| Fire prism burst | Spacebar / Enter | Tap anywhere on canvas |
| Pause | P key | Double-tap pause button (≥44px) |
| Restart (on Game Over) | Enter / Space | Tap RETRY button (≥44px) |

- Pointer events (touch + mouse) all supported. No keyboard-only requirement.
- The entire canvas is the play surface; tap anywhere to burst.

---

## 4. Art / Audio / Interaction Direction

### Visual Asset Plan (All Canvas-Drawn, No External Files)

| Asset | Description | Render Method |
|-------|-------------|---------------|
| Player prism burst | 3-layer expanding ring + glow | `canvas.arc()` with radial gradients, alpha falloff |
| Star sprites | Golden crescent with pulse glow | `canvas.arc()` + arc path for crescent, `globalAlpha` pulse |
| Darkness fragments | Jagged dark shapes | Custom `Path2D` with slight wobble animation |
| Particle trails | Ribbon-like sparkles on burst | `canvas.lineTo()` with trailing alpha |
| Background starfield | Parallax layers of small dots | Pre-generated dot arrays, scroll at different speeds |
| Moon sigil HUD accents | Crescent moon icon next to score | Simple arc path |
| Combo text | Glowing text with shimmer effect | `fillText` + glow `shadowBlur` animation |

### Audio Asset Plan (All Web Audio API Synthesized)

| SFX | Description | Implementation |
|-----|-------------|----------------|
| Burst shimmer | High sweep sine, quick decay | `oscillator.frequency.exponentialRampToValueAtTime()` |
| Star rescue | Two-note ascending chime | Two oscillators, minor third apart |
| Combo tier-up | Harmonic overtone layer | Add oscillator at combo-tier frequency |
| Darkness hit | Low thud with distortion | Noise burst + low sine, waveshaper |
| Game over | Descending bell | Oscillator with long decay, pitch bend down |

### Interaction Feedback Checklist

- [x] Every burst produces visible expanding ring + particle trail
- [x] Every star rescue produces a golden sparkle dissolution + chime
- [x] Every darkness hit produces a screen-shake + low thud
- [x] Every combo milestone produces a brief golden flash + text pop
- [x] Every fade produces a dimming + desaturation effect
- [x] All motion uses easing (no linear position changes)

---

## 5. Engine and Technical Architecture

### Rendering Approach

- **Single HTML file**, all inline CSS + JS + Web Audio.
- **Canvas 2D** for all rendering — no SVG, no DOM-based sprites.
- **Fixed logical resolution** (800×600) with CSS `width: 100vw; height: 100vh; object-fit: contain;` for responsive scaling. This ensures dimensional stability.
- **Game loop:** `requestAnimationFrame` with delta-time accumulation for consistent speed across refresh rates.
- **State machine:** `LOBBY → PLAYING → PAUSED → GAME_OVER`. Transitions are instant but screen effects (fade, flash) use eased animations.

### Architecture Overview

```
index.html
├── <canvas id="game"> (full viewport, responsive)
├── <style> (all game CSS)
├── <script> (all game JS)
│   ├── AudioEngine (Web Audio API, gesture-gated)
│   ├── InputManager (keyboard + pointer events)
│   ├── GameEngine (main loop, state machine)
│   ├── EntityManager (stars, darkness, particles)
│   ├── ScrollingBackground (parallax starfield)
│   ├── ScoreManager (score, combo, tiers)
│   └── UIOverlay (HUD, start screen, game over)
```

### Key Technical Decisions

1. **Parallax starfield:** 3 layers (far=slow=small, mid=medium, near=fast=large). Pre-generated random positions, recycled when they scroll off-screen.
2. **Entity pooling:** Stars and darkness fragments are pooled and reused rather than created/destroyed each frame to avoid GC pauses.
3. **Particle system:** Burst particles use a simple velocity + fade-out model. Ribbon trails use a linked-list of positions with trailing opacity.
4. **Delta-time movement:** All entity movement uses `dt` so the game runs at the same speed on 30fps and 120fps displays.
5. **No external dependencies:** Zero imports, zero CDN calls. Everything is vanilla JS in one file.

---

## 6. What NOT to Build (Out of Scope)

| Item | Reason |
|------|--------|
| Character sprites / animations | This is a *prism burst* game, not a platformer or RPG. Sailor Moon herself is not a sprite on screen; the player *is* the light. |
| Multiple levels or worlds | Keep it to one scrolling night-sky course. Progression is score/combo-based, not level-based. |
| Save/load or persistence | No localStorage, no high-score saving. Each session is a single run. |
| Inventory or power-ups | No items to collect beyond rescuing stars. Simplicity is part of the design. |
| Procedural level generation (complex) | The course is a simple left-to-right scroll. Difficulty increases via spawn rate, not level design. |
| Multiplayer / social features | Out of scope for a single-play browser game. |
| Soundtrack | No background music in v1. The game's rhythm *is* the audio. |
| Settings menus | Single mute toggle (icon, top-right corner). No sliders, no complexity. |
| Tutorial screen | The game must be immediately playable. Controls are self-evident: tap = burst. |
| SVG or external assets | Everything drawn on canvas; no image files, no fonts to load. |

---

## 7. Implementation Plan

### Phase 1: Playable Slice (Priority 1)
Build the absolute minimum to judge fun:
- Canvas setup with parallax starfield
- Tap-to-burst with visual feedback (expanding ring + particles)
- Star sprites that scroll left and fade at the edge
- Basic collision detection between burst and star
- Score counter and combo display
- Game over screen with score and RETRY button
- **Goal:** A 30-second playable experience where the core verb (burst → rescue stars) is clear.

### Phase 2: Polish and Feel (Priority 2)
- Add darkness fragments as obstacles
- Add SFX (all synthesized)
- Add screen shake on hits
- Add combo multiplier tiers with visual flair
- Add pause functionality
- Refine easing on all motion
- Polish particle effects (ribbon trails, sparkle dissolution)

### Phase 3: Responsiveness and Quality (Priority 3)
- Mobile touch target verification (all interactive elements ≥44px)
- Viewport scaling on various screen sizes
- Performance profiling (target: stable 60fps on mid laptop)
- Console error sweep
- Payload size check (target: <2MB; should be <200KB as single HTML)

### Phase 4: Verification and Documentation (Priority 4)
- Browser runtime verification: play the full loop, capture state transitions
- Screenshot evidence: start screen, in-game (with combo), game over
- Verify no `console.error` during play
- Write `.factoryx/preview-entrypoint`
- Update `PREVIEW.md` and `VERIFICATION.md`

---

## 8. Quality Gates Before Review

| Gate | Pass Criteria |
|------|---------------|
| Core verb in first 30s | A new player can burst and rescue a star without reading any text |
| Input response <100ms | Visual burst feedback starts within one frame of user action |
| Easing on all motion | No linear position/scale/opacity changes; all use cubic or ease-out curves |
| Hit/score feedback | Burst-rescue produces visible + audible burst; darkness hit produces screen shake + sound |
| Audio gesture-gated | No audio plays before first user interaction |
| Touch targets ≥44px | RETRY button, pause button, mute button all meet minimum tap target size |
| 60fps stable | No frame drops during normal play (verified via performance monitoring) |
| Payload <2MB | Single HTML file, no external assets (target <200KB) |
| No external network calls | All assets self-contained; works fully offline |
| No console errors | Browser dev tools show zero errors during a full play session |
| Responsive layout | Works on 320px-wide mobile through 1920px+ desktop, no text overlap |

---

## 9. Progress Updates

Progress updates for this Work Order will be logged in `WORKLOG.md` and include:
- Screenshot evidence at each phase completion
- Notes on design decisions (e.g., "shifted star spawn rate curve after testing combo feel")
- Performance metrics (fps, payload size)
- Known limitations or deferred polish

---

## 10. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Canvas performance on mobile | Game runs at <30fps, feels sluggish | Limit particle count; use `will-change: transform`; profile early |
| Audio context autoplay policy | Browser blocks audio before gesture | Gate all audio on first user interaction (click/tap/keydown) |
| Touch vs keyboard balance | Mobile players can't burst | Canvas-wide tap = burst; entire play surface is the trigger zone |
| Combo system too complex | Players confused by multiplier tiers | Keep tiers visible; use color (silver→gold→diamond) for intuitive reading |
| Single-file file size | HTML becomes unwieldy | Split `<script>` into logical sections with clear comments; target <200KB |

---

*This strategy is a pre-implementation plan. Implementation will begin after this document is reviewed and the work order branch is ready.*

*In the name of the Moon, we will punish the darkness — with prism bursts and starlight.*
