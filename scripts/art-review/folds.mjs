import { reviewArt } from './review.mjs';
import { generateFolds } from '../../src/generators/folds/generate.js';
import { foldStudies } from '../../src/generators/folds/review-cases.js';
const studies = process.argv.includes('--studies');
if (studies && !process.argv.includes('--count')) process.argv.push('--count', String(foldStudies.length));
const study = seed => foldStudies[Number(seed.match(/(\d+)$/)[1]) % foldStudies.length];
await reviewArt({ mode: 'folds', generate: seed => generateFolds(seed, studies ? study(seed).controls : {}),
  describe: (painting, seed) => studies ? study(seed).name
    : `${painting.parameters.composition} ${painting.parameters.family} · ${painting.parameters.palette} · ${painting.parameters.pleats} pleats`,
  examples: [0, 7, 8, 13, 17] });
