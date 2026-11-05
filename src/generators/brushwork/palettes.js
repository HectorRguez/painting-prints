import { randomSource } from '../shared/port.js';

// Each pair is a dense primary ink and its optional counterstroke pigment.
// Density still varies per bristle, using the existing contact/pressure model.
export const brushPalettes = {
  graphite: { ink: [17, 23, 29], accent: [143, 52, 36] },
  indigo: { ink: [41, 46, 111], accent: [171, 113, 35] },
  cobalt: { ink: [35, 77, 161], accent: [174, 102, 39] },
  teal: { ink: [16, 108, 105], accent: [178, 119, 37] },
  forest: { ink: [36, 94, 58], accent: [160, 94, 55] },
  violet: { ink: [99, 58, 142], accent: [183, 97, 67] },
  magenta: { ink: [148, 42, 100], accent: [33, 102, 120] },
  ochre: { ink: [165, 104, 29], accent: [35, 88, 115] },
  terracotta: { ink: [169, 71, 42], accent: [32, 103, 126] },
  olive: { ink: [88, 105, 40], accent: [107, 64, 119] },
};

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => a + (b - a) * t;

export function brushColorParameters(seed) {
  // A separate stream keeps all trajectory and fiber draws unchanged when
  // palettes are added or color controls are overridden.
  const random = randomSource(`${seed}:brush-colors`);
  return { palette: Object.keys(brushPalettes)[Math.floor(random() * Object.keys(brushPalettes).length)],
    hueShift: mix(-7, 7, random()), saturation: mix(.9, 1.08, random()) };
}

export function tintColor(rgb, hueShift, saturation) {
  const color = rgb.map(c => c / 255), maximum = Math.max(...color), minimum = Math.min(...color);
  const delta = maximum - minimum, lightness = (maximum + minimum) / 2;
  if (delta < 1e-12) return rgb.slice();
  let hue = maximum === color[0] ? ((color[1] - color[2]) / delta) % 6
    : maximum === color[1] ? (color[2] - color[0]) / delta + 2 : (color[0] - color[1]) / delta + 4;
  hue = ((hue * 60 + hueShift) % 360 + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * clamp(delta / (1 - Math.abs(2 * lightness - 1)) * saturation);
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1)), m = lightness - chroma / 2;
  const channels = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0]
    : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return channels.map(c => clamp(c + m) * 255);
}

export function pigmentColor(parameters, pigment, accent, variation) {
  const palette = brushPalettes[parameters.palette];
  const base = tintColor(palette.ink, parameters.hueShift, parameters.saturation);
  const counter = tintColor(palette.accent, parameters.hueShift, parameters.saturation);
  const paper = [245, 242, 235], density = clamp(pigment * (1 - variation));
  return '#' + base.map((c, i) => Math.round(mix(paper[i], mix(c, counter[i], accent), density))
    .toString(16).padStart(2, '0')).join('');
}
