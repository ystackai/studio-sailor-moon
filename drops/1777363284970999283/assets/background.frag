precision highp float;

varying vec2 v_uv;

uniform float u_time;
uniform vec2 u_resolution;

#define PI 3.14159265359
#define TAU 6.28318530718
#define NUM_STARS 150.0
#define NUM_DUST 50.0

// Consistent hash
float hash(vec2 p) {
     return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 1D hash
float hash1(float p) {
     return fract(sin(p * 12.9898) * 43758.5453);
}

// Smooth 2D noise
float noise2d(vec2 p) {
     vec2 i = floor(p);
     vec2 f = fract(p);
     f = f * f * (3.0 - 2.0 * f);

     float a = hash(i);
     float b = hash(i + vec2(1.0, 0.0));
     float c = hash(i + vec2(0.0, 1.0));
     float d = hash(i + vec2(1.0, 1.0));

     return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// FBM for nebula clouds
float fbm(vec2 p) {
     float v = 0.0;
     float a = 0.5;
     for (int i = 0; i < 4; i++) {
         v += a * noise2d(p);
         p = p * 2.0 + vec2(0.13, 0.27);
         a *= 0.5;
      }
     return v;
}

void main() {
     vec2 uv = v_uv;
     float aspect = u_resolution.x / u_resolution.y;
     float time = u_time;

      // === TWILIGHT GRADIENT ===
      // Multi-layered indigo twilight with soft transitions
     vec2 center = vec2(0.5, 0.5);
     vec2 d = uv - center;
     d.x /= aspect;
     float dist = length(d);

     // Base color palette
     vec3 deepIndigo    = vec3(0.03, 0.025, 0.12);
     vec3 twilightPurple = vec3(0.07, 0.05, 0.20);
     vec3 warmIndigo     = vec3(0.08, 0.04, 0.16);
     vec3 darkBlue       = vec3(0.015, 0.01, 0.06);
     vec3 midnight       = vec3(0.008, 0.0, 0.025);

      // Core-to-edge gradient with smoothstep layering
     float t = smoothstep(0.0, 1.2, dist);
     vec3 bg = mix(twilightPurple, deepIndigo, smoothstep(0.0, 0.45, t));
     bg = mix(bg, darkBlue, smoothstep(0.35, 0.75, t));
     bg = mix(bg, midnight, smoothstep(0.65, 1.1, t));

      // === HONEY DROP WARM GLOW ===
      // Soft amber glow near center from the honey drop
     float glowRadius = 0.45;
     float glow = pow(1.0 - smoothstep(0.0, glowRadius, dist), 2.0);
     bg += vec3(0.05, 0.025, 0.008) * glow * glow;

      // === NEBULA CLOUDS ===
      // Subtle atmospheric haze
     vec2 nebulaUV = uv * 2.5;
     float nebula = fbm(nebulaUV + time * 0.008);
     nebula = nebula * (0.5 + 0.5 * sin(time * 0.15 + uv.x * 3.0));
     nebula = smoothstep(0.3, 0.8, nebula);
     bg += vec3(0.015, 0.01, 0.03) * nebula;

      // === MOONLIGHT WASH ===
      // Soft cool gradient from upper area
     float moonY = smoothstep(0.95, 0.15, uv.y);
     bg += vec3(0.015, 0.015, 0.04) * moonY * moonY;

      // Secondary warm wash from honey drop influence
     float warmWash = pow(glow, 1.5) * 0.3;
     bg += vec3(0.02, 0.01, 0.003) * warmWash;

      // === STARFIELD ===
     for (float i = 0.0; i < NUM_STARS; i++) {
         vec2 starSeed = vec2(hash(vec2(i, 0.0)), hash(vec2(i, 1.0)));
         float brightness = hash(vec2(i, 2.0));

         // Skip most dim stars per fragment
         if (brightness < 0.3) continue;

         // Position with slight clustering for natural distribution
         vec2 starPos = starSeed;
         starPos.x = fract(starPos.x * 1.7 + starSeed.y * 0.3 - 0.15);
         starPos.y = fract(starPos.y * 1.3 + starSeed.x * 0.2 - 0.1);

         vec2 toStar = uv - starPos;
         float starDist = length(toStar);

         // Twinkle with per-star frequency and phase
         float twinkleFreq = hash(vec2(i, 3.0)) * 2.5 + 0.3;
         float twinklePhase = hash(vec2(i, 4.0)) * TAU;
         float twinkle = sin(time * twinkleFreq + twinklePhase);
         twinkle = smoothstep(-1.0, 1.0, twinkle) * 0.6 + 0.4;

         // Occasional bright star flare
         float isBright = step(0.92, hash(vec2(i, 5.0)));
         float baseSize = 0.0012 + hash(vec2(i, 5.5)) * 0.003 + isBright * 0.002;
         float size = baseSize * (0.5 + twinkle * 0.5);

         float alpha = smoothstep(size, 0.0, starDist);
         float intensity = brightness * (0.4 + twinkle * 0.6);

          // Color variation: cool to warm
         float colorShift = hash(vec2(i, 6.0));
         vec3 starColor = mix(
              vec3(0.78, 0.82, 1.0),
              vec3(1.0, 0.93, 0.82),
              colorShift
          );

          // Bright stars get a subtle glow halo
         if (isBright > 0.5) {
             float halo = smoothstep(size * 5.0, 0.0, starDist);
             bg += starColor * alpha * intensity * 1.2;
             bg += starColor * halo * intensity * 0.15;
          } else {
             bg += starColor * alpha * intensity * 1.0;
          }
      }

      // === ATMOSPHERIC DUST PARTICLES ===
      // Subtle floating particles that drift slowly
     for (float i = 0.0; i < NUM_DUST; i++) {
         float phase = hash(vec2(i, 20.0)) * TAU;
         float speed = hash(vec2(i, 21.0)) * 0.05 + 0.01;

          // Drifting motion
         vec2 dustPos = vec2(
              hash(vec2(i, 0.0)) + sin(time * speed + phase) * 0.08,
              hash(vec2(i, 1.0)) - time * speed * 0.15 + cos(time * speed * 0.7 + phase) * 0.05
          );
         dustPos = fract(dustPos);

         vec2 toDust = uv - dustPos;
         float dustDist = length(toDust);

         float dustSize = 0.0005 + hash(vec2(i, 22.0)) * 0.001;
         float dustAlpha = smoothstep(dustSize, 0.0, dustDist);

          // Twinkle
         float dustTwinkle = sin(time * (1.0 + hash(vec2(i, 23.0))) + phase);
         dustAlpha *= 0.3 + dustTwinkle * 0.2;

         vec3 dustColor = vec3(0.6, 0.55, 0.5);
         bg += dustColor * dustAlpha * 0.08;
      }

     gl_FragColor = vec4(bg, 1.0);
}
