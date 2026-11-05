import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { generateLeaf, leafGeometry } from '../src/generators/leaves/generate.js';

// Optional audit tooling, never bundled into the website. Set CANVAS_MODULE to
// an existing node-canvas installation, or install canvas locally for this run.
const { createCanvas, loadImage } = createRequire(import.meta.url)(process.env.CANVAS_MODULE || 'canvas');
const output = resolve(process.argv[2] || '/tmp/painting-art-review/leaves');
const count = Number(process.argv[3] || 48);
if (!Number.isInteger(count) || count < 1 || count > 256) throw new Error('Count must be 1–256');
await mkdir(output, { recursive: true });
const results = [], previews = [], hashes = new Set();
const saveSheet = async (name, canvas) => {
  await writeFile(`${output}/${name}.png`, canvas.toBuffer('image/png'));
  await writeFile(`${output}/leaves-${name}.jpg`, canvas.toBuffer('image/jpeg', { quality: .92, chromaSubsampling: false }));
};
for (let i = 0; i < count; i++) {
  const seed = `leaf-review-${String(i).padStart(3, '0')}`;
  const start = performance.now();
  const art = generateLeaf(seed);
  const generationMs = performance.now() - start;
  const digest = createHash('sha256').update(art.svg).digest('hex');
  if (hashes.has(digest)) throw new Error(`Duplicate drawing: ${seed}`);
  hashes.add(digest);
  const image = await loadImage(Buffer.from(art.svg));
  const canvas = createCanvas(1200, 1200), ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, 1200, 1200);
  // Raster containment checks the delivered SVG against the blade silhouette,
  // allowing two pixels for antialiasing/outline width and the attached petiole.
  const geometry = leafGeometry(seed);
  const mask = createCanvas(1200, 1200), m = mask.getContext('2d');
  m.scale(1.2, 1.2);
  const margins = geometry.paths.filter(path => path.role === 'margin');
  const outline = [...margins[0].points, ...margins[1].points.toReversed()];
  m.beginPath(); outline.forEach(([x, y], n) => n ? m.lineTo(x, y) : m.moveTo(x, y)); m.closePath(); m.fill();
  const petiole = geometry.paths.find(path => path.role === 'petiole');
  m.beginPath(); petiole.points.forEach(([x, y], n) => n ? m.lineTo(x, y) : m.moveTo(x, y));
  m.lineWidth = petiole.width + 3; m.lineCap = 'round'; m.stroke();
  const maskPixels = m.getImageData(0, 0, 1200, 1200).data;
  const pixels = ctx.getImageData(0, 0, 1200, 1200).data;
  let ink = 0, outsideInk = 0, xmin = 1200, ymin = 1200, xmax = 0, ymax = 0;
  for (let p = 3; p < pixels.length; p += 4) if (pixels[p] > 16) {
    const x = ((p - 3) / 4) % 1200, y = Math.floor((p - 3) / 4 / 1200);
    ink++; xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
    if (!maskPixels[p]) {
      let contained = false;
      for (let dy = -2; dy <= 2 && !contained; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (x + dx >= 0 && x + dx < 1200 && y + dy >= 0 && y + dy < 1200 && maskPixels[((y + dy) * 1200 + x + dx) * 4 + 3]) contained = true;
      }
      if (!contained) outsideInk++;
    }
  }
  if (!ink || xmin < 80 || ymin < 80 || xmax > 1120 || ymax > 1120) throw new Error(`Empty or cropped image: ${seed}`);
  if (outsideInk) throw new Error(`${seed}: ${outsideInk} vein pixels outside the leaf`);
  await writeFile(`${output}/${seed}.svg`, art.svg);
  await writeFile(`${output}/${seed}.png`, canvas.toBuffer('image/png'));
  previews.push(canvas);
  results.push({ seed, artRevision: art.artRevision, ...art.traits, generationMs: Math.round(generationMs * 100) / 100,
    svgBytes: Buffer.byteLength(art.svg), digest, inkPixels: ink, outsideInk, bounds: [xmin, ymin, xmax, ymax] });
}
for (let start = 0; start < count; start += 24) {
  const entries = results.slice(start, start + 24);
  const cols = 6, tile = 250, rowHeight = 284;
  const sheet = createCanvas(cols * tile, Math.ceil(entries.length / cols) * rowHeight);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#f5f2eb'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  entries.forEach((entry, n) => {
    const x = (n % cols) * tile, y = Math.floor(n / cols) * rowHeight;
    ctx.drawImage(previews[start + n], x, y, tile, tile);
    ctx.fillStyle = '#42483b'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${entry.seed} · ${entry.profile}`, x + tile / 2, y + 263);
  });
  await saveSheet(`contact-${Math.floor(start / 24) + 1}`, sheet);
}
await writeFile(`${output}/audit.json`, JSON.stringify({ count, unique: hashes.size, results }, null, 2));
for (const profile of [...new Set(results.map(result => result.profile))]) {
  const index = results.findIndex(result => result.profile === profile);
  const sheet = createCanvas(1600, 1000), ctx = sheet.getContext('2d');
  ctx.fillStyle = '#f5f2eb'; ctx.fillRect(0, 0, 1600, 1000);
  ctx.drawImage(previews[index], 0, 80, 800, 800);
  // A 1:1 crop keeps the individual areoles and branching veinlets inspectable.
  ctx.drawImage(previews[index], 250, 250, 700, 700, 850, 150, 700, 700);
  ctx.font = '22px sans-serif'; ctx.fillStyle = '#42483b'; ctx.textAlign = 'center';
  ctx.fillText(`${results[index].seed} · ${profile}`, 400, 940);
  ctx.fillText('Vein detail at 100%', 1200, 940);
  await saveSheet(`detail-${profile}`, sheet);
}

// Show the added families at a useful scale, separately from the 48-seed
// contacts. These JPEGs can be copied directly into docs/previews for review.
const newProfiles = ['cordate', 'spatulate', 'falcate'];
if (newProfiles.every(profile => results.some(result => result.profile === profile))) {
  const sheet = createCanvas(1800, 850), ctx = sheet.getContext('2d');
  ctx.fillStyle = '#f5f2eb'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  newProfiles.forEach((profile, n) => {
    const index = results.findIndex(result => result.profile === profile);
    ctx.drawImage(previews[index], n * 600, 60, 600, 600);
    ctx.fillStyle = '#42483b'; ctx.font = '26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText({ cordate: 'Heart-shaped · cordate', spatulate: 'Spoon-shaped · spatulate', falcate: 'Curved · falcate' }[profile], n * 600 + 300, 735);
    ctx.font = '18px sans-serif'; ctx.fillText(results[index].seed, n * 600 + 300, 775);
  });
  await saveSheet('detail-profiles', sheet);
}
const styles = ['serrate', 'dentate', 'crenate'];
const marginExamples = styles.map(style => results.map((result, index) => ({ ...result, index }))
  .filter(result => result.marginStyle === style && ['ovate', 'elliptic', 'obovate'].includes(result.profile))
  .sort((a, b) => b.marginStrength - a.marginStrength)[0]).filter(Boolean);
if (marginExamples.length) {
  const sheet = createCanvas(marginExamples.length * 500, 760), ctx = sheet.getContext('2d');
  ctx.fillStyle = '#f5f2eb'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  marginExamples.forEach((entry, n) => {
    const margin = leafGeometry(entry.seed).paths.filter(path => path.role === 'margin')[1].points;
    const [x, y] = margin[Math.floor(margin.length / 2)].map(value => value * 1.2);
    ctx.drawImage(previews[entry.index], x - 340, y - 260, 480, 520, n * 500 + 10, 120, 480, 520);
    ctx.fillStyle = '#42483b'; ctx.font = '26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${entry.marginStyle} margin`, n * 500 + 250, 70);
    ctx.font = '18px sans-serif'; ctx.fillText(entry.seed, n * 500 + 250, 700);
  });
  await saveSheet('detail-margin', sheet);
}
console.log(JSON.stringify({ output, count, unique: hashes.size,
  profiles: [...new Set(results.map(r => r.profile))],
  maxGenerationMs: Math.max(...results.map(r => r.generationMs)),
  maxSvgBytes: Math.max(...results.map(r => r.svgBytes)) }, null, 2));
