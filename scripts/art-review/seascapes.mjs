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
const stress = args.includes('--stress');
const stressCases = [
  { regime: 'calm', roughness: .15, steepness: .1, boatCount: 0 },
  { regime: 'wind sea', roughness: 2, steepness: .62, direction: .9, horizon: 240, boatCount: 4, boatScale: 1.2 },
  { regime: 'rolling swell', roughness: 1.9, direction: -.9, horizon: 370, wind: -1, boatCount: 1 },
  { regime: 'breakers', direction: .9, breaker: { curl: 1, crestPosition: -.18, overhang: .34, lipDrop: .55,
    hollow: .38, shoulderLift: .4, foamScale: 1.3, foamClusters: 11, flowBundles: 11, sprayCount: 60 } },
  { regime: 'breakers', breaker: { curl: .18, crestPosition: -.035, overhang: .18, lipDrop: .24,
    hollow: .2, shoulderLift: .05, foamScale: .65, foamClusters: 4, flowBundles: 5, sprayCount: 0 } },
  { regime: 'breakers', boatCount: 0, wind: -1, horizon: 240, roughness: 2, steepness: .62,
    breaker: { flowSpread: 1.2, foamScale: 1.3 } },
  { regime: 'rolling swell', boatCount: 4, boatScale: .6, wind: 1, roughness: 1.4, horizon: 370 },
  { regime: 'breakers', boatCount: 2, boatScale: .6, wind: 1,
    breaker: { curl: .6, foamClusters: 11, foamScale: 1.3, flowBundles: 11, flowSpread: .7 } },
];
const selected = option('--seeds', '').split(',').filter(Boolean).map(Number);
if (selected.some(value => !Number.isInteger(value) || value < 0)) throw new Error('Invalid --seeds list');
const count = stress ? stressCases.length : selected.length || Number(option('--count', 48));
if (!Number.isInteger(count) || count < 1 || count > 512) throw new Error('--count must be 1–512');
const output = resolve(option('--out', 'art-review/seascapes'));
const raster = args.includes('--raster');
const overrides = JSON.parse(option('--overrides', '{}'));
const prefix = option('--prefix', stress ? 'seascape-stress' : 'seascape-review');
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
  const number = selected[i] ?? i;
  const seed = `${prefix}-${String(number).padStart(2, '0')}`;
  const start = performance.now();
  const currentOverrides = stress ? stressCases[i] : overrides;
  const painting = generateSeascape(seed, currentOverrides);
  const generationMs = performance.now() - start;
  const scene = buildSeascape(seed, currentOverrides);
  const svg = artworkSvg(painting, true);
  const hash = createHash('sha256').update(painting.svg).digest('hex');
  const filename = `${seed}.svg`;
  await writeFile(resolve(output, filename), svg);
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const x = (i % cols) * cellWidth, y = Math.floor(i / cols) * cellHeight;
  const label = `${scene.sea.regime} · ${scene.boats.length} boats · ${scene.arrangement}`;
  panels.push(`<image x="${x}" y="${y}" width="${cellWidth}" height="300" href="${uri}"/><text x="${x + 12}" y="${y + 315}" font-family="sans-serif" font-size="12" fill="#333">${seed}</text><text x="${x + 12}" y="${y + 333}" font-family="sans-serif" font-size="12" fill="#555">${label}</text>`);
  let pngHash, pixels;
  if (raster) {
    const { preview } = await renderLinePreview(painting, { width: 1414, measure: false, background: '#f5f2eb' });
    const bytes = Buffer.from(await preview.arrayBuffer());
    pngHash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(resolve(output, `${seed}.png`), bytes);
    const image = await canvasTools.loadImage(bytes);
    const specimen = canvasTools.createCanvas(image.width, image.height), sc = specimen.getContext('2d');
    sc.drawImage(image, 0, 0);
    const data = sc.getImageData(0, 0, image.width, image.height).data;
    let ink = 0, edgeInk = 0, left = image.width, right = 0, top = image.height, bottom = 0;
    for (let k = 0; k < data.length; k += 4) {
      if (Math.abs(data[k] - 245) + Math.abs(data[k + 1] - 242) + Math.abs(data[k + 2] - 235) < 35) continue;
      const px = k / 4 % image.width, py = Math.floor(k / 4 / image.width);
      ink++; left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
      if (px < 2 || py < 2 || px >= image.width - 2 || py >= image.height - 2) edgeInk++;
    }
    pixels = { inkFraction: ink / (image.width * image.height), edgeInk, bounds: { left, top, right, bottom } };
    if (edgeInk || pixels.inkFraction < .0001 || pixels.inkFraction > .7) throw Error(seed + ': blank, clipped or saturated raster');
    context.drawImage(image, x, y, cellWidth, cellWidth / 1.414);
    context.fillStyle = '#333'; context.font = '13px sans-serif';
    context.fillText(seed, x + 12, y + 315); context.fillText(label, x + 12, y + 333);
    // Stable examples let README previews be refreshed with exactly this run.
    const example = { 1: 'calm', 33: 'large-wave', 43: 'fleet' }[number];
    if (example) {
      const detail = canvasTools.createCanvas(1414, 1000);
      detail.getContext('2d').drawImage(image, 0, 0);
      await writeFile(resolve(output, `seascapes-${example}.jpg`), detail.toBuffer('image/jpeg', { quality: 0.94 }));
    }
  }
  records.push({ seed, filename, overrides: currentOverrides, sha256: hash, ...(pngHash ? { pngSha256: pngHash, ...pixels } : {}), generationMs: Number(generationMs.toFixed(2)),
    svgBytes: Buffer.byteLength(painting.svg), paths: scene.paths.length,
    regime: scene.sea.regime, roughness: scene.sea.roughness, parameters: scene.sea, arrangement: scene.arrangement,
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
const report = { artRevision: 4, count, unique,
  ...(raster ? { uniquePngs: new Set(records.map(record => record.pngSha256)).size } : {}),
  meanBoats: records.reduce((sum, record) => sum + record.boats.length, 0) / count,
  meanGenerationMs: records.reduce((sum, record) => sum + record.generationMs, 0) / count,
  maximumGenerationMs: Math.max(...records.map(record => record.generationMs)),
  regimes: frequency(records.map(record => record.regime)),
  boatCounts: frequency(records.map(record => record.boats.length)),
  boatFamilies: frequency(records.flatMap(record => record.boats.map(boat => boat.kind))),
  arrangements: frequency(records.map(record => record.arrangement)),
  maximumWaveHeight: Math.max(...records.map(record => record.maximumWaveHeight)), records };
if (raster && report.uniquePngs !== count) throw Error('Duplicate raster specimens');
await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, ...report, records: undefined }, null, 2));
