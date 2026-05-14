# Moonbeam Collector — Review Checklist

## Game Mechanics
- [x] Catch falling moonbeams by moving basket (touch drag / arrow keys)
- [x] Score increments per catch
- [x] Streak counter resets on miss, displays flavor messages at 5/10/15/20
- [x] Game over after 20 misses
- [x] Title screen → tap/key to start
- [x] Game over screen with score, flavor moon name, restart button
- [ ] `roundRect` polyfill bug: `closeTo` → `closePath` (tracked)

## Accessibility
- [x] `prefers-reduced-motion` media query
- [x] `prefers-color-scheme: light` alternative background
- [x] `user-scalable=no`, `touch-action=none` for touch devices
- [x] Keyboard arrow-key control
- [x] Semantic HTML structure

## Responsive/Mobile
- [x] Canvas resizes on window/device changes
- [x] devicePixelRatio capped at 2 for performance
- [x] Touch and pointer event handling
- [x] Clamp bucket within screen bounds on resize

## Audio
- [x] catch tone (triangle, 660→880Hz)
- [x] miss tone (sawtooth, 180Hz)
- [x] game over melody (440→554→660Hz)
- [x] AudioContext deferred to first user interaction

## Visual Polish (tracked for Sparkle Designer)
- [ ] roundRect polyfill fix
- [ ] Ambient star particles during gameplay
- [ ] Bucket glow trail on catch
- [ ] Multi-color sparkle burst
- [ ] Caught beam fade animation
- [ ] HUD design polish
- [ ] Title screen moon icon

## Performance
- [x] Canvas alpha: false
- [x] dt clamped to 0.05s
- [x] devicePixelRatio capped at 2
- [x] Reduced motion option

