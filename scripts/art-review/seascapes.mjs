import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildSeascape, generateSeascape } from '../../src/generators/seascapes/generate.js';
import { artworkSvg } from '../../src/artwork-svg.js';

// A dependency-free visual audit: SVG specimens, a browser-viewable contact
// sheet, and JSON metrics. Render the same files in any standards-based viewer.
const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf(key);
  return index < 0 ? fallback : args[index + 1];
};
const count = Number(option('--count', 48));
if (!Number.isInteger(count) || count < 1 || count > 512) throw new Error('--count must be 1–512');
const output = resolve(option('--out', 'art-review/seascapes'));
await mkdir(output, { recursive: true });
const records = [], panels = [];
const cols = 6, cellWidth = 424, cellHeight = 324;
for (let i = 0; i < count; i++) {
  const seed = `seascape-review-${String(i).padStart(2, '0')}`;
  const start = performance.now();
  const painting = generateSeascape(seed);
  const generationMs = performance.now() - start;
  const scene = buildSeascape(seed);
  const svg = artworkSvg(painting, true);
  const hash = createHash('sha256').update(painting.svg).digest('hex');
  const filename = `${seed}.svg`;
  await writeFile(resolve(output, filename), svg);
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const x = (i % cols) * cellWidth, y = Math.floor(i / cols) * cellHeight;
  panels.push(`<image x="${x}" y="${y}" width="${cellWidth}" height="300" href="${uri}"/><text x="${x + 12}" y="${y + 315}" font-family="sans-serif" font-size="12" fill="#333">${seed}</text>`);
  records.push({ seed, filename, sha256: hash, generationMs: Number(generationMs.toFixed(2)),
    svgBytes: Buffer.byteLength(painting.svg), paths: scene.paths.length,
    roughness: scene.sea.roughness, boats: scene.boats.map(({ kind, x, y, angle, length, depth }) => ({ kind, x, y, angle, length, depth })) });
}
const unique = new Set(records.map(record => record.sha256)).size;
if (unique !== count) throw new Error(`Only ${unique}/${count} unique drawings`);
const height = Math.ceil(count / cols) * cellHeight;
await writeFile(resolve(output, 'contact-sheet.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth * cols}" height="${height}" viewBox="0 0 ${cellWidth * cols} ${height}"><rect width="100%" height="100%" fill="#f5f2eb"/>${panels.join('')}</svg>`);
const report = { count, unique, maximumGenerationMs: Math.max(...records.map(record => record.generationMs)), records };
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, count, unique, maximumGenerationMs: report.maximumGenerationMs }));
