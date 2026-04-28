precision highp float;

varying vec2 v_uv;
varying vec2 v_position;

uniform float u_time;
uniform float u_squeeze;
uniform vec2 u_dropCenter;
uniform float u_dropRadius;
uniform vec2 u_resolution;

#define PI 3.14159265359

// Hash for pseudo-random values
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Layered noise for organic distortion
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.0 + vec2(0.13, 0.27);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 center = u_dropCenter / u_resolution;
  float radius = u_dropRadius / min(u_resolution.x, u_resolution.y);

  // Distance from center in normalized screen space
  vec2 uv = v_uv;
  vec2 delta = uv - center;

  // Compensate for aspect ratio
  float aspect = u_resolution.x / u_resolution.y;
  delta.x /= aspect;

  float dist = length(delta);

  // Organic distortion based on squeeze
  float distortAmt = u_squeeze * 0.4;
  vec2 distortion = vec2(
    fbm(uv * 3.0 + u_time * 0.15),
    fbm(uv * 3.0 + u_time * 0.12 + 50.0)
  ) - 0.5;
  distortion *= distortAmt * radius * 0.3;

  vec2 distortedUV = uv + distortion;
  delta = distortedUV - center;
  delta.x /= aspect;
  dist = length(delta);

  // Base color: amber-to-gold gradient
  float t = smoothstep(0.0, radius, dist);

  // Amber core
  vec3 amberCore = vec3(0.92, 0.65, 0.15);
  // Gold mid
  vec3 goldMid = vec3(0.95, 0.78, 0.25);
  // Deep amber edge
  vec3 amberEdge = vec3(0.65, 0.35, 0.08);

  float radial = dist / radius;

  // Blend gradient: core -> mid -> edge
  vec3 color;
  if (radial < 0.3) {
    color = mix(goldMid, amberCore, radial / 0.3);
  } else if (radial < 0.7) {
    color = mix(amberCore, amberEdge, (radial - 0.3) / 0.4);
  } else {
    // Soft falloff at edges
    float edge = (radial - 0.7) / 0.3;
    color = mix(amberEdge, vec3(0.0), smoothstep(0.0, 1.0, edge));
  }

  // Glossy highlight: specular dot for a wet look
  vec3 lightDir = normalize(vec3(0.3, 0.6, 1.0));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  float fresnel = pow(1.0 - (radial * radial), 3.0);
  vec3 highlight = vec3(1.0, 0.96, 0.85) * fresnel * 0.6;

  // Squeeze darkens the squeeze zone slightly, creating depth
  float squeezeShadow = u_squeeze * 0.15 * (1.0 - radial);
  color -= vec3(squeezeShadow * 0.5, squeezeShadow * 0.3, squeezeShadow * 0.1);

  // Viscous melt: blur softening proportional to squeeze
  float meltBlur = u_squeeze * 0.6;
  float blur = smoothstep(0.6, 1.0, radial + meltBlur);
  color = mix(color, amberEdge * 0.5, blur * 0.3);

  // Edge glow (warm glow as it stretches)
  float edgeGlow = smoothstep(0.5, 1.0, radial);
  color += vec3(0.3, 0.18, 0.05) * edgeGlow * (0.3 + u_squeeze * 0.5);

  // Alpha: soft rounded edge
  float alpha = 1.0 - smoothstep(radius * 0.75, radius, dist);
  alpha = max(alpha, 0.01);

  // Pulsing warmth
  float pulse = sin(u_time * 1.5) * 0.03;
  color += vec3(pulse * 0.5, pulse * 0.3, 0.0);

  gl_FragColor = vec4(color + highlight, alpha);
}
