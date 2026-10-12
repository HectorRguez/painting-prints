import { mkdir, rm } from 'node:fs/promises';
import { pageModes } from '../src/projects.js';

// This whole directory is disposable build output, never hand-edited source.
const output = new URL('../public/generators/', import.meta.url);
await rm(output, { recursive: true, force: true });
for (const style of ['shared', ...pageModes]) {
  const directory = new URL(`${style}/`, output);
  await mkdir(directory, { recursive: true });
  const { prepare } = await import(`../src/generators/${style}/build.mjs`);
  await prepare(directory);
}
