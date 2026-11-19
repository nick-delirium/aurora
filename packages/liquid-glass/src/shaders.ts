/**
 * Shaders for the glass compositor.
 *
 * COMPOSITE_FRAG copies a (mipmapped) background texture to the output and,
 * under each pane, samples it at a refracted position: the rim is a convex
 * "squircle" surface; vertical rays bend by Snell's law (glass IOR 1.5) and land
 * offset in proportion to the glass height there. R/G/B bend slightly
 * differently (chromatic aberration); the inside is blurred from the mip chain;
 * a light-angle rim highlight is screened on top.
 */

export const MAX_LENSES = 8;

/** Full-screen triangle, no buffers needed. */
export const VERT = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Draws an image/video/canvas texture with a uv transform (cover/contain/stretch). */
export const IMAGE_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform vec4 u_uv;   // scale.xy, offset.zw: output uv → image uv
uniform vec2 u_size; // output px
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_size;
  outColor = vec4(texture(u_image, uv * u_uv.xy + u_uv.zw).rgb, 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D u_frame;               // the wallpaper, mipmapped
uniform vec2 u_size;                     // canvas px

#define MAX_LENSES 8
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
