precision highp float;

varying vec2 v_uv;
varying vec2 v_position;

uniform float u_time;
uniform float u_squeeze;
uniform vec2 u_dropCenter;
uniform float u_dropRadius;
uniform vec2 u_resolution;

#define PI 3.14159265359
#define TAU 6.28318530718

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
     for (int i = 0; i < 5; i++) {
         v += a * noise(p);
         p = p * 2.1 + vec2(0.13, 0.27);
         a *= 0.45;
     }
     return v;
}

// Radial gradient helper for glow
float radialGlow(vec2 uv, vec2 center, float radius) {
     vec2 d = uv - center;
     float aspect = u_resolution.x / u_resolution.y;
     d.x /= aspect;
     return smoothstep(radius, 0.0, length(d));
}

// Swirl distortion function
vec2 swirl(vec2 p, float amount, float time) {
     float r = length(p);
     float a = atan(p.y, p.x);
     float swirlAngle = a + amount * sin(r * 4.0 - time * 0.8) * r;
     return vec2(cos(swirlAngle), sin(swirlAngle)) * r;
}

void main() {
     vec2 center = u_dropCenter / u_resolution;
     float radius = u_dropRadius / min(u_resolution.x, u_resolution.y);

     float aspect = u_resolution.x / u_resolution.y;

     // Distance from center in normalized screen space
     vec2 uv = v_uv;
     vec2 delta = uv - center;
     delta.x /= aspect;
     float dist = length(delta);

     // === MELT DISTORTION ===
     // Organic squeeze distortion with viscous feel
     float distortAmt = u_squeeze * 0.35;
     float time = u_time;

     // Swirl distortion that intensifies with squeeze
     vec2 centeredDelta = delta;
     vec2 swirled = swirl(centeredDelta, distortAmt * 2.0, time);
     delta = center + swirled;
     delta.x /= aspect;
     dist = length(delta);

     // FBM-based organic wobble
     vec2 noiseOffset = vec2(
         fbm(uv * 4.0 + time * 0.12) - 0.5,
         fbm(uv * 4.0 + time * 0.10 + 100.0) - 0.5
     );
     noiseOffset *= distortAmt * radius * 0.2;

     // Stretch effect: radial expansion on squeeze
     float stretch = 1.0 + u_squeeze * 0.25;
     float radialDist = dist * stretch;
     radialDist += dot(noiseOffset, delta / (dist + 0.001)) * 0.15 * u_squeeze;

     // === MELT BLUR ===
     // Multi-sample blur for soft viscous look
     float meltIntensity = u_squeeze;
     float blurRadius = meltIntensity * radius * 0.15;
     vec3 meltColor = vec3(0.0);
     float totalWeight = 0.0;

     for (int i = 0; i < 8; i++) {
         float angle = float(i) * TAU / 8.0 + time * 0.3;
         vec2 offset = vec2(cos(angle), sin(angle)) * blurRadius;

         vec2 sampleDelta = delta + offset;
         sampleDelta.x /= aspect;
         float sampleDist = length(sampleDelta);

         float radial = sampleDist / (radius * stretch);
         float weight = 1.0 - smoothstep(0.0, 1.5, radial);

         // Color at sample point
         vec3 sampleColor;

         if (radial < 0.25) {
             // Gold core
             sampleColor = mix(vec3(0.98, 0.85, 0.35), vec3(0.95, 0.75, 0.22), radial / 0.25);
         } else if (radial < 0.6) {
             // Amber mid
             sampleColor = mix(vec3(0.95, 0.75, 0.22), vec3(0.72, 0.42, 0.12), (radial - 0.25) / 0.35);
         } else if (radial < 1.0) {
             // Deep amber edge with soft falloff
             float edge = (radial - 0.6) / 0.4;
             sampleColor = mix(vec3(0.72, 0.42, 0.12), vec3(0.15, 0.06, 0.01), smoothstep(0.0, 1.0, edge));
         } else {
             sampleColor = vec3(0.0);
         }

         meltColor += sampleColor * weight;
         totalWeight += weight;
     }

     if (totalWeight > 0.001) {
         meltColor /= totalWeight;
     }

     // === GLOSSY SPECULAR HIGHLIGHT ===
     // Wet-looking highlight that shifts with squeeze
     vec3 lightDir = normalize(vec3(0.35, 0.65, 1.0));
     float fresnel = pow(1.0 - (dist / (radius * stretch)), 3.5);
     vec3 highlight = vec3(1.0, 0.97, 0.88) * fresnel * (0.5 + u_squeeze * 0.15);

     // Secondary specular blob that moves with distortion
     vec2 highlightPos = vec2(0.35, 0.35) + noiseOffset * 0.5;
     highlightPos = center + delta * 0.25 * u_squeeze;
     float specDist = length((uv - highlightPos) * aspect);
     float secondarySpec = smoothstep(radius * 0.25, 0.0, specDist);
     highlight += vec3(1.0, 0.96, 0.9) * secondarySpec * 0.3;

     // === DEPTH SHADOWS ===
     // Squeeze creates a "pressed" look with subtle darkening
     float squeezeDepth = u_squeeze * 0.12 * (1.0 - dist / (radius * stretch));
     meltColor -= vec3(squeezeDepth * 0.4, squeezeDepth * 0.25, squeezeDepth * 0.08);

     // === EDGE GLOW ===
     // Warm amber glow that stretches outward during squeeze
     float edgeDist = dist / (radius * stretch);
     float edgeGlow = smoothstep(0.65, 1.1, edgeDist) * (1.0 - smoothstep(1.0, 1.5, edgeDist));
     meltColor += vec3(0.25, 0.15, 0.04) * edgeGlow * (0.4 + u_squeeze * 0.6);

     // === PARTICLE GLOW RINGS ===
     // Concentric particle rings that pulse during squeeze
     float particleIntensity = u_squeeze * 0.5;
     for (int i = 0; i < 4; i++) {
         float ringRadius = (float(i) * 0.18 + 0.1 + sin(time * 0.5 + float(i) * 1.3) * 0.05) * radius;
         float ringDist = abs(dist - ringRadius);
         float ring = smoothstep(0.008 * (1.0 + u_squeeze * 0.5), 0.0, ringDist);
         float ringAlpha = ring * particleIntensity * (0.3 + hash(vec2(float(i), time * 0.1)) * 0.3);
         meltColor += vec3(0.95, 0.78, 0.3) * ringAlpha * 0.15;
     }

     // === PULSING WARMTH ===
     // Gentle ambient pulse even at rest
     float pulse = sin(time * 1.2) * 0.025;
     meltColor += vec3(pulse * 0.5, pulse * 0.3, 0.0);

     // === ALPHA ===
     // Soft rounded edge with melt diffusion
     float alpha = 1.0 - smoothstep(radius * 0.7, radius * (1.0 + u_squeeze * 0.15), dist);
     alpha *= 0.95; // Slight transparency for natural depth
     alpha = max(alpha, 0.01);

     // Squeeze makes edges more translucent (melting effect)
     float edgeAlpha = smoothstep(0.7, 1.0, edgeDist);
     alpha *= 1.0 - edgeAlpha * u_squeeze * 0.3;

     gl_FragColor = vec4(meltColor + highlight, alpha);
}
