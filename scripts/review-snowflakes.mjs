import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { generateSnowflake } from '../src/generators/snowflakes/generate.js';
import { artworkSvg } from '../src/artwork-svg.js';

const directory = resolve(process.argv[2] || '/tmp/painting-art-review/snowflakes');
const count = Number(process.argv[3] || 48);
if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('Use a review count from 1 to 1000');
await mkdir(directory, { recursive: true });
const results = [], hashes = new Set();
for (let i = 0; i < count; i++) {
  const seed = `snowflake-review-${String(i).padStart(3, '0')}`;
  const start = performance.now();
  const painting = generateSnowflake(seed);
  const elapsedMs = Math.round(performance.now() - start);
  const hash = createHash('sha256').update(painting.svg).digest('hex');
  if (hashes.has(hash)) throw new Error(`Duplicate snowflake: ${seed}`);
  hashes.add(hash);
  const name = `${String(i).padStart(3, '0')}.svg`;
  await writeFile(`${directory}/${name}`, artworkSvg(painting, true));
  await writeFile(`${directory}/${String(i).padStart(3, '0')}-transparent.svg`, artworkSvg(painting));
  results.push({ seed, file: name, hash, elapsedMs, ...painting.snowflake });
  console.log(`${seed}: ${painting.snowflake.habit}; ${elapsedMs}ms; ${painting.snowflake.steps} steps`);
}
await writeFile(`${directory}/manifest.json`, JSON.stringify(results, null, 2));
await writeFile(`${directory}/index.html`, `<!doctype html><meta charset="utf-8"><title>Snowflake review</title>
<style>body{background:#e4e1da;color:#252525;font:15px system-ui;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}figure{margin:0;background:#f5f2eb}img{display:block;width:100%}figcaption{padding:0 12px 14px}small{color:#646464}</style>
<h1>${count} seeded snow crystals</h1><p>Open an image to inspect its vector detail. Adjacent seeds intentionally share no hand-drawn template.</p><main>${results.map(result => `<figure><a href="${result.file}"><img src="${result.file}" alt="${result.habit}" loading="lazy"></a><figcaption>${result.seed}<br><small>${result.habit} · ${result.elapsedMs}ms</small></figcaption></figure>`).join('')}</main>`);
console.log(`Saved ${count} unique SVGs and the review gallery to ${directory}`);
