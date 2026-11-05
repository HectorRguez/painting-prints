// Optional review fixtures, never imported by the shipping worker.
export const ribbonExtremeCases = [
  { name: 'broad-sparse', overrides: { ribbon: { width: .11, spacing: .1, count: 48, taper: .45, taperPower: 2 } } },
  { name: 'fine-dense', overrides: { ribbon: { width: .015, spacing: .007, count: 48, maxLength: 8, minLength: .12, stripes: 7 } } },
  { name: 'rapid-field', overrides: { field: { anisotropy: 2, harmonics: [{ frequency: 5, amplitude: 1.5, angle: 1, phase: 2 }] }, ribbon: { minLength: .12 }, integration: { step: .04, tolerance: .0001 } } },
  { name: 'small-domain', overrides: { field: { anisotropy: .5 }, composition: { radii: [.45, .45], center: [.1, -.1], angle: 3, seedBias: 1.5 } } },
  { name: 'tight-integration', overrides: { integration: { step: .003, maxSteps: 200, tolerance: 1e-8, minStep: .00001 } } },
  { name: 'short-pointed', overrides: { ribbon: { count: 4, taper: .04, taperPower: .6, widthVariation: 0, maxLength: 1.2, minLength: .5, stripes: 0 } } },
  { name: 'four-vortices', overrides: { field: { drift: { speed: .02 }, harmonics: [], vortices: [-1, 1].flatMap(x => [-1, 1].map(y => ({ center: [x * .3, y * .3], radius: .1, circulation: x * y * 5 }))) } } },
  { name: 'outlined', overrides: { style: { palette: ['#191919'], outlineFraction: 1, lineWidth: 1.5 }, ribbon: { widthVariation: .6 } } },
  { name: 'solid', overrides: { style: { palette: ['#37687a'], outlineFraction: 0, lineWidth: .3 }, ribbon: { stripes: 0 } } },
  { name: 'low-frequency', overrides: { field: { drift: { speed: 2, angle: -6 }, harmonics: [{ frequency: .1, amplitude: 1.5, angle: 6, phase: -6 }], vortices: [{ center: [1.5, -1.5], radius: 1.3, circulation: -5 }] } } },
];
