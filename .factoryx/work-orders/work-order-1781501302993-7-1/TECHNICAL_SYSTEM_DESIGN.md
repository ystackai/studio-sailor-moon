# Moon Prism Relay — Technical System Design

## Architecture

Single-file HTML game with inline CSS and JavaScript. No external dependencies.

### Canvas Layering
- **gameCanvas** (z-index 1): Background, scenery, game objects
- **uiCanvas** (z-index 2): HUD elements (score, combo, gauge, wave)

### Core Systems

#### 1. Game Loop
- `requestAnimationFrame` based
- Delta-time capped at 50ms to prevent spiral
- Separated `update()` (logic) and `draw()` (rendering)

#### 2. Lane System
- 3 lanes positioned at equal intervals across 66% of screen width
- Smooth interpolation (lerp at 12× rate) for lane switching
- Lane width scales with viewport

#### 3. Physics
- Jump: initial velocity (-520) + gravity (1200/s²)
- Dash: 0.4s duration, 2.5× speed boost
- Ground plane at 78% of viewport height

#### 4. Scoring
- Survival score: 10 × difficulty × dt per frame
- Collection score: 10 × combo multiplier per shard
- Combo resets after 2.5s without collection

#### 5. Wave System
- Duration: starts at 30s, decreases by 2s per wave (min 15s)
- Difficulty multiplier: 1 + (wave-1) × 0.3
- Spawn rates increase with difficulty

#### 6. Super Move
- Moon Gauge fills from shard collection (3 + combo × 0.5 per shard)
- At 100%: 5s invincibility, orbiting prism shards, screen flash
- Consumed on activation

#### 7. Rendering
- DPR-aware canvas scaling (capped at 2×)
- Moon with glow effect (shadowBlur)
- Parallax cityscape (2 layers, different scroll speeds)
- Particle system for effects (collection, hit, trail, super)
- Game character drawn with quadratic curves for flowing hair

#### 8. Audio
- Web Audio API (oscillators + gain nodes)
- 6 sound types: collect, hit, jump, dash, power-up, combo
- All sounds procedurally generated, no audio files needed
- High-pass filter at 60Hz for phone speaker safety

## File Structure
```
games/92-moon-prism-relay/index.html  (single file, ~36KB)
```
