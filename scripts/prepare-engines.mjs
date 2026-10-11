import { readFile, writeFile } from 'node:fs/promises';

// Keep the upstream snapshot intact. Extract the drawing code, leaving its
// original scrolling interface and download controls out of the new page.
const root = new URL('../', import.meta.url);
const html = await readFile(new URL('public/upstream/shan-shui-inf/index.html', root), 'utf8');
const drawingSection = html.split('<script id="downloader">')[0];
const scripts = [...drawingSection.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 6) throw new Error(`Unexpected landscape source: ${scripts.length} script blocks`);
await writeFile(new URL('public/engines/landscape-engine.js', root),
  '// Shan Shui, copyright (c) 2018 Lingdong Huang. MIT; see ../upstream/shan-shui-inf/LICENSE\n'
  + scripts.map(match => match[1]).join('\n'));
