import { reviewArt } from './review.mjs';
import { generateDunes } from '../../src/generators/dunes/generate.js';
import { resolveParameters } from '../../src/generators/dunes/model.js';

const index = process.argv.indexOf('--overrides');
const overrides = index < 0 ? {} : JSON.parse(process.argv[index + 1]);
const stress = process.argv.includes('--stress');
const cases = [
  { crestHeight: 22, relief: .55, density: .4, spacing: 430, cameraElevation: .22, travelerCount: 0, camelCount: 0 },
  { crestHeight: 95, relief: 1.55, density: 1.2, spacing: 175, ridgeBands: 16, rippleDensity: 1, lineWeight: 1.6,
    travelerCount: 8, camelCount: 6, figureScale: 1.6, caravanSpacing: 18, figureHeading: 0 },
  { travelerCount: 8, camelCount: 6, figureScale: .6, caravanSpacing: 70, figureHeading: Math.PI / 2 },
  { rippleDensity: 0, ridgeBands: 0, travelerCount: 0, camelCount: 4, figureScale: 1.6, figureHeading: Math.PI },
  { morphology: 'barchan', horns: .85, asymmetry: -.4, crestLength: 520, crestHeight: 95, curvature: .28 },
  { crestLength: 170, density: 1.2, curvature: .28, windAzimuth: -Math.PI, spacing: 430 },
  { camelLoad: 0, travelerCount: 8, camelCount: 0, figureHeading: 1.3, figureScale: 1.4, caravanSpacing: 18 },
  { palette: 'ochre', travelerCount: 1, camelCount: 2, crestHeight: 50, relief: .9, cameraElevation: .5 },
];
if (stress && !process.argv.includes('--count')) process.argv.push('--count', '8');
if (stress && !process.argv.includes('--prefix')) process.argv.push('--prefix', 'dunes-stress');
const controls = seed => ({ ...(stress ? cases[Number(seed.split('-').at(-1)) % cases.length] : {}), ...overrides });
await reviewArt({ mode: 'dunes', generate: seed => generateDunes(seed, controls(seed)),
  parameters: seed => resolveParameters(seed, controls(seed)),
  describe: painting => `${painting.parameters.morphology} · ${painting.metrics.travelers} travelers · ${painting.metrics.camels} camels`, examples: [0, 1, 6, 9, 33] });
