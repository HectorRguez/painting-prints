/**
 * Colours are carried as plain `{ h, s, l }` objects all the way to the
 * renderer and only serialised at emit time. Keeping them structured means
 * shading, tinting and palette variation are all just arithmetic — no
 * hex parsing in the hot path, and every derived shade stays in the same
 * hue family as its base.
 */

export const hsl = (h, s, l) => ({ h, s, l });

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Multiply lightness. Values >1 brighten, <1 darken. Saturation is nudged
 * the opposite way so highlights desaturate and shadows deepen, which reads
 * far more like painted light than a flat lightness ramp.
 */
export function shade(c, f) {
  const l = clamp(c.l * f, 2, 97);
  const sBoost = f < 1 ? 1 + (1 - f) * 0.45 : 1 - (f - 1) * 0.35;
  return { h: c.h, s: clamp(c.s * sBoost, 0, 100), l };
}

/** Shift hue and saturation, e.g. to cool a shadow or warm a highlight. */
export function tint(c, dh, ds = 0, dl = 0) {
  return {
    h: (c.h + dh + 360) % 360,
    s: clamp(c.s + ds, 0, 100),
    l: clamp(c.l + dl, 0, 100),
  };
}

/** Blend two colours in HSL, taking the short way around the hue circle. */
export function mix(a, b, t) {
  let dh = ((b.h - a.h + 540) % 360) - 180;
  return {
    h: (a.h + dh * t + 360) % 360,
    s: a.s + (b.s - a.s) * t,
    l: a.l + (b.l - a.l) * t,
  };
}

const HEX = '0123456789abcdef';
const byte = (v) => {
  const n = Math.max(0, Math.min(255, Math.round(v * 255)));
  return HEX[n >> 4] + HEX[n & 15];
};

/**
 * Serialise to hex, not `hsl(...)`.
 *
 * SVG 1.1 predates CSS Color 4, so the space-separated `hsl(h s% l%)` form
 * renders as black in most rasterisers and game-engine SVG loaders even though
 * browsers accept it. Hex works everywhere, which matters for output that is
 * meant to ship as a game asset.
 */
export function toCss(c) {
  const h = ((c.h % 360) + 360) % 360 / 360;
  const s = clamp(c.s, 0, 100) / 100;
  const l = clamp(c.l, 0, 100) / 100;
  if (s === 0) {
    const g = byte(l);
    return `#${g}${g}${g}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return `#${byte(ch(h + 1 / 3))}${byte(ch(h))}${byte(ch(h - 1 / 3))}`;
}

/** Stable string key for defs de-duplication. */
export function colorKey(c) {
  return `${Math.round(c.h)}_${Math.round(c.s)}_${Math.round(c.l)}`;
}

/**
 * Directional light. Faces get a base multiplier by orientation; the top is
 * the reference at 1.0. Shadowed sides are also cooled slightly (hue pushed
 * toward blue) which is what sells the "painterly" read.
 */
export const LIGHT = {
  top: 1.0,
  left: 0.80,   // +y face
  right: 0.60,  // +x face
  slopeLeft: 0.90,
  slopeRight: 0.68,
  // Far roof slopes, visible over the ridge on shallow pitches. They tilt away
  // from the light, so they sit below both near slopes.
  slopeBack: 0.62,
  ground: 0.55,
};

const COOL = { top: 0, left: 4, right: 9, slopeLeft: 2, slopeRight: 7, slopeBack: 10, ground: 12 };

/** Apply orientation lighting to a base colour. */
export function litFace(c, kind, extra = 1) {
  const f = (LIGHT[kind] ?? 1) * extra;
  const s = shade(c, f);
  const cool = COOL[kind] ?? 0;
  return cool ? tint(s, cool * 0.35, -cool * 0.25, 0) : s;
}
