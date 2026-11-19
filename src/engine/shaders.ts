/**
 * The whole wallpaper is one fragment shader:
 *
 *   1. Every pixel is mapped into "composition space" p (shorter side = 1 unit,
 *      origin at the center), so a phone wallpaper is a crop of the same field
 *      a desktop wallpaper shows.
 *   2. A wavy curve (sum of seeded sines + low-frequency noise) is the spine of
 *      the ribbon. d = signed distance to it (positive = above).
 *   3. Background color = smooth OKLab gradient indexed by d.
 *   4. Ribbon = glow / core / under bands composited on top, with width and
 *      glow varying along the ribbon.
 *   5. Vignette on lightness only, then OKLab → sRGB, film grain, dithering.
 *
 * Glass (COMPOSITE_FRAG): when the UI has glass panels on screen, the
 * wallpaper is rendered into a mipmapped texture first, then a second pass
 * copies it to the screen and, under each panel, samples it at a refracted
 * position (convex squircle rim, Snell's law), per channel (chromatic
 * aberration), blurred (mip taps), with a light-angle rim highlight. No glass on
 * screen → single pass straight to the canvas. Exports never use the second pass.
 *
 * Live mode only advances u_time: wave phases drift, the noise flows, glow
 * hotspots travel along the ribbon, glow + amplitude breathe. Every motion term
 * is zero at time 0, so static wallpapers are unaffected.
 */

export const VERT = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform vec2 u_origin;     // canvas px → target px: (fragCoord - origin) * scale
uniform float u_scale;
uniform vec2 u_target;     // target size in px

uniform vec4 u_seed;
uniform vec3 u_wFreq;
uniform vec3 u_wPhase;
uniform vec3 u_wAmp;
uniform vec3 u_wSpeed;     // phase drift, rad/s
uniform float u_tilt;
uniform float u_time;      // seconds

uniform vec2 u_pos;
uniform float u_amp;
uniform float u_freq;
uniform float u_width;
uniform float u_angle;
uniform float u_warp;
uniform float u_var;
uniform float u_vignette;
uniform float u_intensity;
uniform float u_grain;
uniform float u_grainSize;

uniform vec3 u_bg[6];      // OKLab, top → bottom
uniform float u_bgPos[6];  // descending distances
uniform vec3 u_glow;
uniform vec3 u_core;
uniform vec3 u_under;

uniform int u_debug;       // 1 = stripes instead of the wallpaper (?debug=stripes)

out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 grad(vec2 i) {
  float a = hash12(i) * 6.28318530718;
  return vec2(cos(a), sin(a));
}

// Gradient noise, roughly in [-1, 1].
float gnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad(i), f);
  float b = dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
  float c = dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
  float d = dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
  return 1.4 * mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Value noise in [-1, 1] — used for film grain.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
}

// The ribbon's spine. Returns y, writes dy/dx to slope.
// Zero at t = 0, then a slow oscillation: "breathing" that leaves static frames untouched.
float breathe(float rate, float phase) {
  return sin(u_time * rate + phase) - sin(phase);
}

float wave(float x, out float slope) {
  vec3 f = u_wFreq * u_freq;
  vec3 ph = x * f + u_wPhase + u_time * u_wSpeed;
  float y = dot(u_wAmp, sin(ph)) + u_tilt * x;
  slope = dot(u_wAmp * f, cos(ph)) + u_tilt;
  float nf = 1.1 * u_freq;
  vec2 drift = vec2(u_time * 0.045, u_time * 0.027);
  float n0 = gnoise(vec2(x * nf + u_seed.x, u_seed.y) + drift);
  float n1 = gnoise(vec2((x + 0.01) * nf + u_seed.x, u_seed.y) + drift);
  y += 0.07 * n0;
  slope += 0.07 * (n1 - n0) / 0.01;
  float amp = u_amp * (1.0 + 0.16 * breathe(0.13, u_seed.z));
  slope *= amp;
  return y * amp;
}

// Smooth (non-uniform cubic Hermite) gradient through the background stops.
vec3 bgRamp(float d) {
  if (d >= u_bgPos[0]) return u_bg[0];
  if (d <= u_bgPos[5]) return u_bg[5];
  int i = 0;
  for (int k = 0; k < 5; k++) {
    if (d < u_bgPos[k] && d >= u_bgPos[k + 1]) i = k;
  }
  int im = max(i - 1, 0);
  int ip = min(i + 2, 5);
  float x0 = u_bgPos[i];
  float x1 = u_bgPos[i + 1];
  float h = x0 - x1;
  float t = (x0 - d) / h;
  vec3 p0 = u_bg[i];
  vec3 p1 = u_bg[i + 1];
  vec3 m0 = (u_bg[i + 1] - u_bg[im]) / (u_bgPos[im] - u_bgPos[i + 1]);
  vec3 m1 = (u_bg[ip] - u_bg[i]) / (u_bgPos[i] - u_bgPos[ip]);
  float t2 = t * t;
  float t3 = t2 * t;
  return (2.0 * t3 - 3.0 * t2 + 1.0) * p0 + (t3 - 2.0 * t2 + t) * h * m0
       + (-2.0 * t3 + 3.0 * t2) * p1 + (t3 - t2) * h * m1;
}

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 linearToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// The wallpaper at target pixel px (y up), in sRGB with grain, before dithering.
vec3 wallpaper(vec2 px) {
  if (u_debug == 1) {
    // High-contrast stripes make refraction easy to judge (gradients hide it).
    float k = step(0.5, fract(dot(px / u_scale, vec2(0.57, 0.82)) / 28.0));
    return vec3(0.06 + 0.88 * k);
  }
  float m = min(u_target.x, u_target.y);
  vec2 p = (px - 0.5 * u_target) / m;                         // composition space

  float ca = cos(u_angle);
  float sa = sin(u_angle);
  vec2 q = mat2(ca, -sa, sa, ca) * p;
  vec2 wt = u_time * vec2(0.035, -0.025);
  q += u_warp * 0.16 * vec2(gnoise(p * 1.4 + u_seed.xy + wt), gnoise(p * 1.4 + u_seed.zw + 7.3 - wt));

  float baseY = (u_pos.y - 0.5) * (u_target.y / m) + 0.035 * breathe(0.17, u_seed.y);
  float x = q.x - u_pos.x;

  float slope;
  float c = baseY + wave(x, slope);
  float dPerp = (q.y - c) * inversesqrt(1.0 + slope * slope);
  // Far from the ribbon the background flattens out into calmer horizontal bands.
  float flatC = baseY + 0.3 * (c - baseY);
  float d = mix(dPerp, q.y - flatC, smoothstep(0.12, 0.7, abs(dPerp)));

  // Variation along the ribbon: thickness and glow strength.
  float nW = gnoise(vec2(x * 0.8 * u_freq + u_seed.z - u_time * 0.06, 5.3 + u_time * 0.02));
  float nG = gnoise(vec2(x * 0.6 * u_freq + u_seed.w + u_time * 0.09, 11.7)); // hotspots travel
  float width = 0.1 * u_width * (1.0 + 0.6 * u_var * nW);
  float glowMod = 1.0 - u_var * 0.5 * (0.5 + 0.5 * nG);

  vec3 col = bgRamp(d);

  float s = d / width;
  float strength = mix(0.4, 1.0, u_intensity) * (1.0 + 0.14 * breathe(0.31, u_seed.x));
  float su = s + 0.9;
  float underA = exp(-su * su / 0.9);
  float sg = s - 0.62;
  float glowA = exp(-sg * sg / (sg > 0.0 ? 0.26 : 0.16));
  float sc = s + 0.05;
  float coreA = exp(-sc * sc / (sc > 0.0 ? 0.42 : 0.14));

  col = mix(col, u_under, underA * 0.55 * strength);
  col = mix(col, u_glow, min(glowA * 1.1 * strength * glowMod, 1.0));
  col = mix(col, u_core, coreA * 0.95 * strength * mix(1.0, glowMod, 0.5));

  col.yz *= mix(0.72, 1.12, u_intensity);

  vec2 uv = px / u_target;
  float e = length((uv - 0.5) * 2.0) * 0.7071;
  col.x *= 1.0 - u_vignette * 0.55 * smoothstep(0.3, 1.05, e);

  vec3 rgb = linearToSrgb(oklabToLinear(col));

  if (u_grain > 0.0) {
    float cell = max(u_grainSize * u_target.y / 1600.0, 0.5);
    vec2 gp = px / cell;
    float n = vnoise(gp + u_seed.zw) * 0.7 + vnoise(gp * 2.13 + 17.17) * 0.3;
    float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    float amt = u_grain * 0.11 * (0.55 + 0.45 * (1.0 - min(abs(lum - 0.45) * 1.6, 1.0)));
    rgb += n * amt;
  }
  return rgb;
}

void main() {
  vec3 rgb = wallpaper((gl_FragCoord.xy - u_origin) * u_scale);

  // Triangular dither: kills 8-bit banding in the smooth gradients.
  vec2 dc = gl_FragCoord.xy - u_origin;
  float dn = hash12(dc) + hash12(dc + 71.37) - 1.0;
  rgb += dn / 255.0;

  outColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_frame;               // the wallpaper, mipmapped
uniform vec2 u_size;                     // canvas px

#define MAX_LENSES 6
uniform int u_lensCount;
uniform vec4 u_lensRect[MAX_LENSES];     // canvas px, GL origin: x, y, w, h
uniform vec4 u_lensShape[MAX_LENSES];    // radius, bezel, thickness (canvas px), strength 0..1
uniform vec4 u_lensLight[MAX_LENSES];    // aberration, specular, light dir x, y (GL, y up)
uniform float u_lensBlur[MAX_LENSES];    // blur radius, canvas px

out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float squircle(float x) {
  float a = 1.0 - x;
  return pow(1.0 - a * a * a * a, 0.25);
}

float squircleSlope(float x) {
  float a = 1.0 - x;
  return a * a * a * pow(max(1.0 - a * a * a * a, 1e-6), -0.75);
}

struct Hit {
  bool inside;
  vec2 offset;     // where to look instead, canvas px
  float spec;      // rim highlight
  float aberration;
  float blur;
};

Hit lensAt(vec2 fc) {
  Hit h = Hit(false, vec2(0.0), 0.0, 0.0, 0.0);
  for (int i = 0; i < MAX_LENSES; i++) {
    if (i >= u_lensCount) break;
    vec4 r = u_lensRect[i];
    vec4 sh = u_lensShape[i];
    vec2 hs = r.zw * 0.5;
    vec2 p = fc - (r.xy + hs);
    float rad = min(sh.x, min(hs.x, hs.y));
    vec2 q = abs(p) - (hs - rad);
    float sdf;
    vec2 n; // outward normal of the border
    if (q.x > 0.0 && q.y > 0.0) {
      float l = length(q);
      sdf = l - rad;
      n = (q / l) * sign(p);
    } else if (q.x > q.y) {
      sdf = q.x - rad;
      n = vec2(sign(p.x), 0.0);
    } else {
      sdf = q.y - rad;
      n = vec2(0.0, sign(p.y));
    }
    if (sdf > 0.0) continue;
    h.inside = true;
    h.blur = u_lensBlur[i] * sh.w;
    float inward = -sdf;
    float bezel = max(1.0, min(sh.y, min(hs.x, hs.y)));
    if (inward >= bezel) return h; // flat middle: no bend
    float t = inward / bezel;
    float x = max(t, 1e-3);
    // Vertical ray through a convex rim; Snell's law with glass IOR 1.5.
    float t1 = atan(squircleSlope(x) * sh.z / bezel);
    float t2 = asin(sin(t1) / 1.5);
    h.offset = -n * sh.z * squircle(x) * tan(t1 - t2) * sh.w;
    vec4 lt = u_lensLight[i];
    float facing = dot(n, lt.zw);
    float k = facing > 0.0 ? facing : -facing * 0.4;
    float rim = 1.0 - t;
    h.spec = (rim * rim * rim * rim * pow(k, 1.8) + pow(rim, 8.0) * 0.05) * lt.y;
    h.spec *= smoothstep(0.0, 1.5, inward) * sh.w; // anti-alias the outer edge
    h.aberration = lt.x;
    return h;
  }
  return h;
}

const vec2 TAPS[8] = vec2[8](
  vec2(1.0, 0.0), vec2(0.707, 0.707), vec2(0.0, 1.0), vec2(-0.707, 0.707),
  vec2(-1.0, 0.0), vec2(-0.707, -0.707), vec2(0.0, -1.0), vec2(0.707, -0.707)
);

// Soft blur from the mip chain: 9 taps on a ring, each from a pre-filtered level.
vec3 sampleBlurred(vec2 fc, float radius) {
  if (radius < 0.5) return texture(u_frame, fc / u_size).rgb;
  float lod = max(0.0, log2(radius) - 0.5);
  vec3 acc = textureLod(u_frame, fc / u_size, lod).rgb * 2.0;
  for (int i = 0; i < 8; i++) {
    acc += textureLod(u_frame, (fc + TAPS[i] * radius * 0.75) / u_size, lod).rgb;
  }
  return acc / 10.0;
}

void main() {
  vec2 fc = gl_FragCoord.xy;
  Hit h = lensAt(fc);
  if (!h.inside) {
    outColor = texelFetch(u_frame, ivec2(fc), 0);
    return;
  }
  vec3 rgb;
  if (h.aberration > 0.0 && dot(h.offset, h.offset) > 0.25) {
    // Each channel bends a little differently: chromatic aberration at the rim.
    rgb = vec3(
      sampleBlurred(fc + h.offset, h.blur).r,
      sampleBlurred(fc + h.offset * (1.0 - h.aberration), h.blur).g,
      sampleBlurred(fc + h.offset * (1.0 - 2.0 * h.aberration), h.blur).b
    );
  } else {
    rgb = sampleBlurred(fc + h.offset, h.blur);
  }
  rgb = 1.0 - (1.0 - rgb) * (1.0 - clamp(h.spec, 0.0, 1.0)); // screen the highlight on
  rgb += (hash12(fc) + hash12(fc + 19.19) - 1.0) / 255.0;     // re-dither the blurred area
  outColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}
`;
