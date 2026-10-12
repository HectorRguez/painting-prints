import { copyFile } from 'node:fs/promises';

export async function prepare(output) {
  const source = new URL('./', import.meta.url);
  for (const name of ['worker.js', 'unframe.js']) await copyFile(new URL(name, source), new URL(name, output));
  await copyFile(new URL('upstream/LICENSE', source), new URL('LICENSE', output));
  await copyFile(new URL('upstream/fishdraw.js', source), new URL('engine.js', output));
}
