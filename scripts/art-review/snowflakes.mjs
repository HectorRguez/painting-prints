import { reviewArt } from './review.mjs';
import { generateSnowflake } from '../../src/generators/snowflakes/generate.js';
if (!process.argv.includes('--prefix')) process.argv.push('--prefix', 'snowflake-review');
if (!process.argv.includes('--digits')) process.argv.push('--digits', '3');
await reviewArt({ mode: 'snowflakes', generate: generateSnowflake,
  describe: painting => painting.snowflake.habit, examples: [0, 6, 9, 17] });
