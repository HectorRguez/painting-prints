import { copyFile, readFile, writeFile } from 'node:fs/promises';

export async function prepare(output) {
  const source = new URL('./', import.meta.url);
  for (const name of ['worker.js', 'generate.js']) await copyFile(new URL(name, source), new URL(name, output));
  await copyFile(new URL('upstream/LICENSE', source), new URL('LICENSE', output));
  await copyFile(new URL('upstream/main.js', source), new URL('upstream.js', output));
  // Expose the existing noise table without editing the original snapshot.
  const flowers = await readFile(new URL('upstream/main.js', source), 'utf8');
  const marker = '  var perlin;';
  if (flowers.split(marker).length !== 2) throw new Error('Unexpected flower noise source');
  await writeFile(new URL('engine.js', output), flowers.replace(marker,
    marker + '\n  this.perlinValues = function () { this.noise(0); return perlin; };'));
}
