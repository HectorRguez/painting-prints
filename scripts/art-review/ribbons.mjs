import { reviewArt } from './review.mjs';
import { generateRibbons } from '../../src/generators/ribbons/generate.js';
import { ribbonExtremeCases } from '../../src/generators/ribbons/review-cases.js';
const extremes = process.argv.includes('--extremes');
const specimen = seed => ribbonExtremeCases[Number(seed.split('-').at(-1)) % ribbonExtremeCases.length];
await reviewArt({ mode: 'ribbons', generate: seed => generateRibbons(seed, extremes ? specimen(seed).overrides : {}),
  describe: (painting, seed) => `${extremes ? specimen(seed).name : painting.traits.family} · ${painting.traits.ribbons} ribbons`,
  examples: extremes ? [0, 2, 6] : [0, 3, 4, 16] });
