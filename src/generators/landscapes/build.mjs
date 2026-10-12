import { copyFile, readFile, writeFile } from 'node:fs/promises';

export async function prepare(output) {
  const source = new URL('./', import.meta.url);
  for (const name of ['worker.js', 'generate.js']) await copyFile(new URL(name, source), new URL(name, output));
  await copyFile(new URL('upstream/LICENSE', source), new URL('LICENSE', output));
  // Extract drawing code without the original scrolling UI/download controls.
  const html = await readFile(new URL('upstream/index.html', source), 'utf8');
  const drawing = html.split('<script id="downloader">')[0];
  const scripts = [...drawing.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 6) throw new Error(`Unexpected landscape source: ${scripts.length} script blocks`);
  await writeFile(new URL('engine.js', output),
    '// Shan Shui, copyright (c) 2018 Lingdong Huang. MIT; see LICENSE\n'
    + scripts.map(match => match[1]).join('\n'));
}
