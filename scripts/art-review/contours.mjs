import { reviewArt } from './review.mjs';
import { generateContours, contourFamilies } from '../../src/generators/contours/generate.js';
const extremes = process.argv.includes('--extremes');
const cases = contourFamilies.flatMap(family => [0, 1].map(t => ({ family,
  peakCount: t ? 12 : 3, spread: t ? .74 : .25, peakWidth: t ? .1 : .3,
  elongation: t ? 2.3 : 1, roughness: .3, warp: .13, frequency: 3, lacunarity: 2.2,
  hurst: .55, octaves: 4, levels: t ? 28 : 10, seaLevel: t ? .38 : .12, valleyDepth: .65 })));
if (extremes && !process.argv.includes('--count')) process.argv.push('--count', '8');
if (extremes && !process.argv.includes('--prefix')) process.argv.push('--prefix', 'contours-stress');
await reviewArt({ mode: 'contours',
  generate: seed => generateContours(seed, extremes ? cases[Number(seed.split('-').at(-1)) % cases.length] : {}),
  describe: art => `${art.metrics.family} · ${art.metrics.contours} contours`, examples: [0, 2, 4, 9] });
