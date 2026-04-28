precision highp float;

varying vec2 v_uv;

uniform float u_time;
uniform vec2 u_resolution;

#define PI 3.14159265359
#define NUM_STARS 200.0

// Consistent hash
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// 1D hash
float hash1(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / u_resolution.y;

  // Deep twilight indigo radial gradient
  vec2 center = vec2(0.5, 0.55);
  vec2 d = uv - center;
  d.x /= aspect;
  float dist = length(d);

  // Twilight gradient: deep indigo core, darker edges
  vec3 deepIndigo = vec3(0.04, 0.04, 0.15);
  vec3 twilightPurple = vec3(0.08, 0.06, 0.22);
  vec3 darkBlue = vec3(0.02, 0.02, 0.08);
  vec3 midnight = vec3(0.01, 0.0, 0.03);

  float t = smoothstep(0.0, 1.4, dist);
  vec3 bg = mix(twilightPurple, deepIndigo, smoothstep(0.0, 0.5, t));
  bg = mix(bg, darkBlue, smoothstep(0.4, 0.8, t));
  bg = mix(bg, midnight, smoothstep(0.7, 1.2, t));

  // Subtle warm glow in center (from the honey drop light)
  float glow = smoothstep(0.5, 0.0, dist);
  bg += vec3(0.06, 0.03, 0.01) * glow * glow;

  // Moonlight wash: soft pale gradient from top
  float moonlight = smoothstep(0.8, 0.2, uv.y);
  bg += vec3(0.02, 0.02, 0.05) * moonlight;

  // Starfield
  for (float i = 0.0; i < NUM_STARS; i++) {
    vec2 starSeed = vec2(hash(vec2(i, 0.0)), hash(vec2(i, 1.0)));
    float brightness = hash(vec2(i, 2.0));

    // Only render a subset of stars with good brightness
    if (brightness < 0.4) continue;

    // Position stars with some clustering
    vec2 starPos = starSeed;
    starPos.x = fract(starPos.x * 1.7 + starSeed.y * 0.3 - 0.2);

    // Distance from current fragment
    vec2 toStar = uv - starPos;
    float starDist = length(toStar);

    // Twinkle
    float twinkleFreq = hash(vec2(i, 3.0)) * 2.0 + 0.5;
    float twinkle = sin(u_time * twinkleFreq + hash(vec2(i, 4.0)) * PI * 2.0) * 0.5 + 0.5;

    // Star size: most are small dots, rare ones are brighter
    float baseSize = 0.001 + hash(vec2(i, 5.0)) * 0.004;
    float size = baseSize * (0.6 + twinkle * 0.4);

    float alpha = smoothstep(size, 0.0, starDist);
    float intensity = brightness * (0.5 + twinkle * 0.5);

    // Slightly warm color for some stars, cool for others
    float colorShift = hash(vec2(i, 6.0));
    vec3 starColor = mix(
      vec3(0.8, 0.85, 1.0),  // cool blue-white
      vec3(1.0, 0.95, 0.8),   // warm yellow-white
      colorShift
    );

    bg += starColor * alpha * intensity * 1.5;
  }

  gl_FragColor = vec4(bg, 1.0);
}
