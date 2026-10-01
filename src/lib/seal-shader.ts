/**
 * The light on the wax.
 *
 * One pass, WebGL1, drawn as a single triangle covering the element. Everything about the
 * shape comes from seal-geometry, interpolated in as GLSL constants, so there is no second
 * copy of the numbers to drift from the first.
 *
 * The one structural decision worth stating: the shape is split by frequency. The pool,
 * the meniscus, the squeezed lip and the struck field are evaluated here in floating point
 * from those constants, and only the device and the legend arrive as a texture. A height
 * map holding all of it would have to carry a nine unit dome in 256 levels, and the
 * contour bands that produces are plainly visible once a specular highlight runs across
 * them. Analytic where it is smooth, sampled where it is sharp.
 */
import { glslConstants } from './seal-geometry';

export const VERT = `
attribute vec2 aPos;          // clip space, one covering triangle
uniform vec2 uBox;            // viewBox units across the element, normally 400
varying vec2 vP;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
  // Clip space is y up and the viewBox is y down, so the y term is subtracted.
  vP = vec2((aPos.x * 0.5 + 0.5) * uBox.x, (0.5 - aPos.y * 0.5) * uBox.y);
}`;

export function frag(): string {
  return `
precision highp float;

varying vec2 vP;

uniform sampler2D uRelief;   // L: relief height 0..1   A: the same, blurred wide, for AO
uniform float uTexU;         // viewBox units per relief texel
uniform float uUPP;          // viewBox units per device pixel
uniform vec3  uL;            // light direction, element frame, normalised
uniform vec2  uShadowOff;    // offset of the cast shadow, element frame, viewBox units
uniform vec3  uWax, uWaxDeep, uWaxEdge, uPaper, uShadowInk;   // linear RGB
uniform float uShadowA;      // the page's shadow strength token
uniform float uStrike;       // 0 unstruck, 1 struck. The entrance.
uniform vec2  uTilt;         // radians the disc is turned about x and y, element frame

${glslConstants()}

/* The outline, evaluated without atan.
   Each harmonic is a dot product with a complex power of the direction, which is both
   faster than an angle and, more importantly, continuous: an atan based version has a
   branch cut at pi and leaves a visible crease down the left edge of the wax. */
float edgeR(vec2 u) {
  float r = R0;
  vec2 z = u;
  z = vec2(z.x * u.x - z.y * u.y, z.x * u.y + z.y * u.x);   // z^2
  r += dot(z, H2);
  z = vec2(z.x * u.x - z.y * u.y, z.x * u.y + z.y * u.x);   // z^3
  r += dot(z, H3);
  z = vec2(z.x * u.x - z.y * u.y, z.x * u.y + z.y * u.x);
  r += dot(z, H4);
  z = vec2(z.x * u.x - z.y * u.y, z.x * u.y + z.y * u.x);
  r += dot(z, H5);
  z = vec2(z.x * u.x - z.y * u.y, z.x * u.y + z.y * u.x);
  r += dot(z, H6);
  z = vec2(z.x * u.x - z.y * u.y, z.x * u.y + z.y * u.x);
  r += dot(z, H7);
  r += LOBE0.z * exp(LOBE_KAPPA * (dot(u, LOBE0.xy) - 1.0));
  r += LOBE1.z * exp(LOBE_KAPPA * (dot(u, LOBE1.xy) - 1.0));
  r += LOBE2.z * exp(LOBE_KAPPA * (dot(u, LOBE2.xy) - 1.0));
  return r;
}

float sdWax(vec2 p) {
  vec2 d = p - P;
  float len = max(length(d), 1e-4);
  return edgeR(d / len) - len;
}

/* Value noise, for the faint orange-peel a cooling pour keeps. Two octaves is enough:
   this is texture at the threshold of visibility, not a feature. */
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

/** Everything smooth: pool, meniscus, lip, struck field. */
float hBase(vec2 p) {
  float sd = sdWax(p);
  // The meniscus. A cubic ease gives a contact angle near sixty degrees at the paper,
  // which is what a drop of wax actually does, rather than the wall a linear ramp makes.
  float s = clamp(sd / W_EDGE, 0.0, 1.0);
  float t = 1.0 - s;
  float h = H_POOL * (1.0 - t * t * t);

  vec2 q = p - FIELD_C;
  float rf = length(q);
  vec2 uq = q / max(rf, 1e-4);

  // The squeeze, uneven because the wax under the die had somewhere different to go on
  // each side. Gaussian ring at the lip crest, faded out inside the field.
  float wob = 1.0 + dot(uq, LIPW1)
            + dot(vec2(uq.x * uq.x - uq.y * uq.y, 2.0 * uq.x * uq.y), LIPW2)
            + dot(uq, LIPW3) * 0.5;
  float g = (rf - R_LIP) / LIP_SIGMA;
  h += H_LIP * wob * exp(-g * g) * uStrike;

  // The strike itself: inside the field the surface drops to the die floor, which is not
  // quite level because the die was not held quite flat.
  float strike = smoothstep(R_FIELD, R_FIELD - FIELD_WALL, rf);
  float fl = H_FLOOR + dot(q, FIELD_TILT);
  h = mix(h, min(h, fl), strike * uStrike);

  // Orange peel on the wax, almost nothing on the die face, which was polished.
  float micro = (vnoise(p * 0.0714) - 0.5) * 2.0;
  h += micro * mix(0.25, 0.05, strike) * step(0.0, sd);
  return h;
}

vec2 reliefUV(vec2 p) { return (p - FIELD_C + RELIEF_HALF) / (2.0 * RELIEF_HALF); }

void main() {
  /* The tilt.
     The disc turns toward the pointer, and turning a solid is done here by looking at it
     from the new angle rather than by rotating the element: the sample point is projected
     back onto the tilted plane, so the silhouette foreshortens, the lip comes round, and
     every normal is recomputed for the new orientation. Rotating the canvas in CSS would
     turn a picture of a seal; this turns the seal.
     The projection is the small-angle one, which is exact enough at the eight degrees
     this ever reaches and costs two multiplies. */
  vec2 d0 = vP - P;
  float persp = 1.0 + (d0.x * uTilt.y - d0.y * uTilt.x) / 420.0;
  vec2 pos = P + vec2(d0.x / max(cos(uTilt.y), 0.6), d0.y / max(cos(uTilt.x), 0.6)) * persp;

  /* The press.
     Wax does not arrive already struck: it is a blob, and then a die comes down and the
     blob spreads. So the disc is a little narrower before the strike and widens as the
     metal displaces it outwards, which is a scale about the centre of the sample point,
     not of the element. Sampling a smaller circle draws a larger disc, hence the divide. */
  pos = P + (pos - P) / mix(0.93, 1.0, uStrike);

  // Nothing outside the wax and its shadow needs shading, and most of the element is
  // outside it. This is the single biggest saving in the pass.
  if (length(pos - P) > R_MAX + 26.0) { gl_FragColor = vec4(0.0); return; }

  float e = max(uUPP, 0.5);
  float h0 = hBase(pos);
  float hx = hBase(pos + vec2(e, 0.0)) - hBase(pos - vec2(e, 0.0));
  float hy = hBase(pos + vec2(0.0, e)) - hBase(pos - vec2(0.0, e));
  vec2 grad = vec2(hx, hy) / (2.0 * e);

  // The sharp part: device and legend, as four taps around the sample.
  vec2 uv = reliefUV(pos);
  float inBox = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float du = uTexU / (2.0 * RELIEF_HALF);
  vec4 c = texture2D(uRelief, uv);
  float rl = c.r * inBox;
  float rx = (texture2D(uRelief, uv + vec2(du, 0.0)).r - texture2D(uRelief, uv - vec2(du, 0.0)).r) * inBox;
  float ry = (texture2D(uRelief, uv + vec2(0.0, du)).r - texture2D(uRelief, uv - vec2(0.0, du)).r) * inBox;
  float strike = smoothstep(R_FIELD, R_FIELD - FIELD_WALL, length(pos - FIELD_C));
  /* The lettering rises last. The field is already sinking while the die is still
     travelling, but nothing is impressed into the wax until the face reaches it, so the
     relief waits for the back third of the press. */
  float relief = smoothstep(0.34, 1.0, uStrike);
  grad += vec2(rx, ry) * (H_RELIEF * relief * strike) / (2.0 * uTexU);
  float h = h0 + H_RELIEF * relief * strike * rl;

  vec3 N = normalize(vec3(-grad + vec2(uTilt.y, -uTilt.x) * 1.6, 1.0));
  vec3 L = normalize(uL);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float ndl = dot(N, L);

  // Wax scatters, so the terminator is soft and light carries past ninety degrees.
  float wrap = clamp((ndl + 0.45) / 1.45, 0.0, 1.0);

  // Thin wax passes light and reads lighter and warmer; thick wax goes to the deep tone.
  float thin = exp(-h / 5.0);
  vec3 albedo = mix(uWaxDeep, uWax, clamp(0.55 + 0.45 * thin, 0.0, 1.0));
  vec3 sss = uWaxEdge * thin * 0.30 * clamp(0.6 - ndl, 0.0, 1.0);

  // Ambient, plus what the paper throws back up at the edges. On a dark page the paper is
  // dark, so this falls away on its own without a second rule.
  vec3 amb = albedo * (0.20 + 0.10 * N.z) + uPaper * 0.08 * (1.0 - N.z) * albedo;

  // Ambient occlusion: the wall of the recess, and the crevice around every raised letter.
  float rf = length(pos - FIELD_C);
  float wallAO = 1.0 - 0.35 * exp(-(R_FIELD - rf) / 5.0) * step(rf, R_FIELD);
  float letterAO = 1.0 - 0.30 * clamp((c.a - c.r) * inBox, 0.0, 1.0);
  float ao = wallAO * letterAO;

  float ndh = max(dot(N, H), 0.0);
  // Two lobes: the tight gloss of a wax meniscus, and a broad sheen over the whole body.
  float spec = 0.42 * pow(ndh, 110.0) + 0.06 * pow(ndh, 9.0);
  vec3 lightCol = vec3(1.0, 0.97, 0.92);

  vec3 col = albedo * wrap * ao * lightCol + sss + amb * ao + lightCol * spec * sqrt(ao) * step(0.0, ndl);

  // Coverage, one pixel wide, which is the only antialiasing this needs.
  float sd = sdWax(pos);
  float cov = clamp(sd / uUPP + 0.5, 0.0, 1.0) * clamp(uStrike * 4.0, 0.0, 1.0);

  // The shadow is analytic: the same outline, offset away from the light, plus a darker
  // contact line hugging the wax where no light reaches at all.
  float soft = 3.0 + 0.5 * length(uShadowOff);
  float ds = sdWax(pos - uShadowOff);
  float sh = max(0.28 * smoothstep(-soft, soft, ds), 0.35 * exp(min(sd, 0.0) / 1.6));
  sh = min(sh * uShadowA, 0.55) * (1.0 - cov);

  // Back to sRGB, with a half-bit of dither: the shadow is a wide, shallow ramp and banded
  // visibly without it.
  vec3 srgb = pow(max(col, 0.0), vec3(1.0 / 2.2));
  vec3 shadowSrgb = pow(max(uShadowInk, 0.0), vec3(1.0 / 2.2));
  float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  vec3 outRgb = srgb * cov + shadowSrgb * sh + dither;
  float outA = cov + sh;
  gl_FragColor = vec4(outRgb, outA);
}`;
}
