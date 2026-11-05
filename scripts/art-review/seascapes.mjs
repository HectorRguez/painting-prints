import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { buildSeascape, generateSeascape } from '../../src/generators/seascapes/generate.js';
import { artworkSvg } from '../../src/artwork-svg.js';

// The SVG audit has no dependencies. Optional raster review uses the same
// line renderer as the app, with native Canvas only as its browser shim.
const args = process.argv.slice(2);
const option = (key, fallback) => {
  const index = args.indexOf(key);
  return index < 0 ? fallback : args[index + 1];
};
const count = Number(option('--count', 48));
if (!Number.isInteger(count) || count < 1 || count > 512) throw new Error('--count must be 1–512');
const output = resolve(option('--out', 'art-review/seascapes'));
const raster = args.includes('--raster');
await mkdir(output, { recursive: true });
const records = [], panels = [];
const cols = 6, cellWidth = 424, cellHeight = 344;
const height = Math.ceil(count / cols) * cellHeight;
let canvasTools, renderLinePreview, grid, context;
if (raster) {
  try {
    canvasTools = await import('canvas');
    const { applyPath2DToCanvasRenderingContext, Path2D } = await import('path2d');
    applyPath2DToCanvasRenderingContext(canvasTools.CanvasRenderingContext2D);
    globalThis.Path2D = Path2D;
    globalThis.OffscreenCanvas = class {
      constructor(width, height) {
        const canvas = canvasTools.createCanvas(width, height);
        canvas.convertToBlob = async () => new Blob([canvas.toBuffer('image/png')], { type: 'image/png' });
        return canvas;
      }
    };
    ({ renderLinePreview } = await import('../../src/generators/shared/line-preview.js'));
    grid = canvasTools.createCanvas(cols * cellWidth, height);
    context = grid.getContext('2d');
    context.fillStyle = '#f5f2eb'; context.fillRect(0, 0, grid.width, grid.height);
  } catch (error) {
    throw new Error('--raster needs optional local review dependencies: npm install --no-save --package-lock=false canvas path2d', { cause: error });
  }
}
const frequency = values => values.reduce((counts, value) => ({ ...counts, [value]: (counts[value] || 0) + 1 }), {});
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
  const label = `${scene.sea.regime} · ${scene.boats.length} boats · ${scene.arrangement}`;
  panels.push(`<image x="${x}" y="${y}" width="${cellWidth}" height="300" href="${uri}"/><text x="${x + 12}" y="${y + 315}" font-family="sans-serif" font-size="12" fill="#333">${seed}</text><text x="${x + 12}" y="${y + 333}" font-family="sans-serif" font-size="12" fill="#555">${label}</text>`);
  let pngHash;
  if (raster) {
    const { preview } = await renderLinePreview(painting, { width: 1414, measure: false, background: '#f5f2eb' });
    const bytes = Buffer.from(await preview.arrayBuffer());
    pngHash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(resolve(output, `${seed}.png`), bytes);
    const image = await canvasTools.loadImage(bytes);
    context.drawImage(image, x, y, cellWidth, cellWidth / 1.414);
    context.fillStyle = '#333'; context.font = '13px sans-serif';
    context.fillText(seed, x + 12, y + 315); context.fillText(label, x + 12, y + 333);
    // Stable examples let README previews be refreshed with exactly this run.
    const example = { 1: 'calm', 33: 'large-wave', 43: 'fleet' }[i];
    if (example) {
      const detail = canvasTools.createCanvas(1414, 1000);
      detail.getContext('2d').drawImage(image, 0, 0);
      await writeFile(resolve(output, `seascapes-${example}.jpg`), detail.toBuffer('image/jpeg', { quality: 0.94 }));
    }
  }
  records.push({ seed, filename, sha256: hash, ...(pngHash ? { pngSha256: pngHash } : {}), generationMs: Number(generationMs.toFixed(2)),
    svgBytes: Buffer.byteLength(painting.svg), paths: scene.paths.length,
    regime: scene.sea.regime, roughness: scene.sea.roughness, arrangement: scene.arrangement,
    requestedBoats: scene.requestedCount, maximumWaveHeight: Math.max(...scene.crests.map(crest => crest.amplitude)),
    waveShapes: frequency(scene.crests.map(crest => crest.shape)),
    breakingWaves: scene.crests.filter(crest => crest.breaking).map(crest => ({
      shape: crest.shape, length: crest.length, amplitude: crest.amplitude, phase: crest.phase,
      parameters: crest.breaking.parameters,
    })),
    boats: scene.boats.map(({ kind, x, y, angle, length, depth }) => ({ kind, x, y, angle, length, depth })) });
}
const unique = new Set(records.map(record => record.sha256)).size;
if (unique !== count) throw new Error(`Only ${unique}/${count} unique drawings`);
await writeFile(resolve(output, 'contact-sheet.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth * cols}" height="${height}" viewBox="0 0 ${cellWidth * cols} ${height}"><rect width="100%" height="100%" fill="#f5f2eb"/>${panels.join('')}</svg>`);
if (raster) {
  await writeFile(resolve(output, 'contact-sheet.png'), grid.toBuffer('image/png'));
  await writeFile(resolve(output, 'seascapes-contact.jpg'), grid.toBuffer('image/jpeg', { quality: 0.92 }));
}
const report = { artRevision: 3, count, unique,
  ...(raster ? { uniquePngs: new Set(records.map(record => record.pngSha256)).size } : {}),
  maximumGenerationMs: Math.max(...records.map(record => record.generationMs)),
  regimes: frequency(records.map(record => record.regime)),
  boatCounts: frequency(records.map(record => record.boats.length)),
  boatFamilies: frequency(records.flatMap(record => record.boats.map(boat => boat.kind))),
  arrangements: frequency(records.map(record => record.arrangement)),
  maximumWaveHeight: Math.max(...records.map(record => record.maximumWaveHeight)), records };
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report, records: undefined }, null, 2));
