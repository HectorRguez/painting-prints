import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { generateLeaf, leafGeometry } from '../src/generators/leaves/generate.js';
import { artworkSvg } from '../src/artwork-svg.js';
import { cacheEntry, createPaintingCache } from '../src/painting-cache.js';

test('leaf seeds reproduce the complete drawing, including Unicode seeds', () => {
  for (const seed of ['herbarium-1', 'leaf 雪 & / 3', '']) {
    assert.deepEqual(generateLeaf(seed), generateLeaf(seed));
    assert.equal(generateLeaf(seed).artRevision, 2);
  }
});

test('48 leaf seeds have distinct geometry, varied silhouettes, and uncropped finite paths', () => {
  const hashes = new Set(), profiles = new Set(), margins = new Set();
  for (let i = 0; i < 48; i++) {
    const seed = `leaf-review-${String(i).padStart(3, '0')}`;
    const { paths, traits } = leafGeometry(seed);
    profiles.add(traits.profile);
    margins.add(traits.marginStyle);
    // Hash coordinates independently of metadata/seed so renaming the same
    // drawing cannot satisfy uniqueness.
    hashes.add(createHash('sha256').update(JSON.stringify(paths.map(path => path.points))).digest('hex'));
    assert.ok(paths.length > 200 && paths.length < 6000, `${seed}: bounded complexity`);
    for (const path of paths) {
      assert.ok(path.width > 0 && path.width < 4, `${seed}: valid stroke`);
      for (const point of path.points) for (const value of point) {
        assert.ok(Number.isFinite(value) && value >= 87.999 && value <= 912.001, `${seed}: print margin`);
      }
    }
    const roles = new Set(paths.map(path => path.role));
    for (const role of ['primary', 'secondary', 'minor', 'veinlet', 'margin', 'petiole']) assert.ok(roles.has(role));
    const average = role => paths.filter(p => p.role === role).reduce((sum, p, _, list) => sum + p.width / list.length, 0);
    assert.ok(average('primary') > average('secondary') && average('secondary') > average('minor'), `${seed}: vein hierarchy`);

    // Check visible anatomy, independently of the profile labels or random
    // parameters. All distances are relative to the midrib's base–apex axis.
    const midrib = paths.filter(path => path.role === 'primary').flatMap(path => path.points);
    const [base, tip] = [midrib[0], midrib.at(-1)];
    const [dx, dy] = [tip[0] - base[0], tip[1] - base[1]], length = Math.hypot(dx, dy);
    const along = point => ((point[0] - base[0]) * dx + (point[1] - base[1]) * dy) / length ** 2;
    const across = point => ((point[0] - base[0]) * -dy + (point[1] - base[1]) * dx) / length;
    const outline = paths.filter(path => path.role === 'margin');
    const points = outline.flatMap(path => path.points);
    const widest = points.reduce((a, b) => Math.abs(across(a)) > Math.abs(across(b)) ? a : b);
    if (traits.profile === 'spatulate') assert.ok(along(widest) > .68, `${seed}: spoon must broaden toward the apex`);
    if (traits.profile === 'falcate') assert.ok(Math.max(...midrib.map(p => Math.abs(across(p)))) / length > .20, `${seed}: sickle must visibly curve`);
    if (traits.profile === 'cordate') {
      const basal = points.reduce((a, b) => along(a) < along(b) ? a : b);
      assert.ok(along(basal) < -.08, `${seed}: heart must have basal lobes behind insertion`);
      assert.ok(Math.abs(across(basal) / across(widest)) < .86, `${seed}: round basal lobes, not pointed outer wings`);
    }
    let turning = 0;
    for (const path of outline) {
      const unique = path.points.filter((p, i, all) => !i || Math.hypot(p[0] - all[i - 1][0], p[1] - all[i - 1][1]) > 1e-5);
      for (let i = 1; i < unique.length - 1; i++) {
        const a = [unique[i][0] - unique[i - 1][0], unique[i][1] - unique[i - 1][1]];
        const b = [unique[i + 1][0] - unique[i][0], unique[i + 1][1] - unique[i][1]];
        turning += Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]));
      }
    }
    assert.ok(turning > 25, `${seed}: margin needs visible repeated notches rather than a smooth ellipse`);
  }
  assert.equal(hashes.size, 48);
  assert.deepEqual([...profiles].sort(), ['cordate', 'elliptic', 'falcate', 'lanceolate', 'lobed', 'obovate', 'ovate', 'spatulate']);
  assert.deepEqual([...margins].sort(), ['crenate', 'dentate', 'serrate']);
});

test('minor vein networks form connected loops that cover each sector without holes', () => {
  const pointKey = point => point.map(value => Math.round(value * 1e6)).join(',');
  for (let i = 0; i < 48; i++) {
    const seed = `leaf-review-${String(i).padStart(3, '0')}`;
    const { regions } = leafGeometry(seed);
    for (const region of regions) {
      let area = 0;
      for (const cell of region.cells) {
        assert.ok(cell.length >= 3);
        for (const [x, y] of cell) assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1);
        let signed = 0;
        cell.forEach((point, i) => {
          const next = cell[(i + 1) % cell.length];
          signed += point[0] * next[1] - next[0] * point[1];
        });
        assert.ok(signed > 0, 'Cells must not fold or have zero area');
        area += signed / 2;
      }
      assert.ok(Math.abs(area - 1) < 1e-6, `${seed}: incomplete or overlapping blade sector`);
      const graph = new Map();
      for (const [a, b] of region.edges) {
        const ka = pointKey(a), kb = pointKey(b);
        if (ka === kb) continue;
        for (const [node, other] of [[ka, kb], [kb, ka]]) {
          if (!graph.has(node)) graph.set(node, new Set());
          graph.get(node).add(other);
        }
      }
      const reached = new Set(), pending = [graph.keys().next().value];
      while (pending.length) {
        const current = pending.pop();
        if (reached.has(current)) continue;
        reached.add(current);
        pending.push(...graph.get(current));
      }
      assert.equal(reached.size, graph.size, `${seed}: isolated vein network`);
      assert.ok([...graph.values()].every(neighbors => neighbors.size >= 2), `${seed}: broken loop`);
    }
  }
});

test('shipping leaf worker reproduces its source generator without a numeric kernel', async () => {
  const code = await readFile(new URL('../public/generators/leaves/worker.js', import.meta.url), 'utf8');
  let result;
  const context = vm.createContext({ performance, postMessage: value => { result = value; } });
  context.self = context;
  vm.runInContext(code, context);
  await context.onmessage({ data: { seed: 'worker-leaf' } });
  assert.equal(result.type, 'painting-ready');
  assert.equal(result.mode, 'leaves');
  assert.equal(result.seed, 'worker-leaf');
  assert.equal(result.svg, generateLeaf('worker-leaf').svg);
  assert.ok(Number.isFinite(result.generationMs));
});

test('generated leaves survive cache reloads and retain complete vector exports', async () => {
  const storageData = new Map();
  const storage = { get: async key => storageData.get(key), put: async (key, value) => storageData.set(key, value) };
  const options = { storage, fetcher: async () => ({ ok: true, json: async () => ({}) }) };
  const base = new URL('https://example.test/painting/');
  const painting = generateLeaf('remember-this-leaf');
  const first = createPaintingCache(base, options);
  assert.equal(await first.next('leaves'), null);
  await first.remember(await cacheEntry(painting));
  const reloaded = createPaintingCache(base, options);
  const restored = await reloaded.resolve(await reloaded.find('leaves', painting.seed));
  assert.deepEqual(restored, painting);
  for (const background of [false, true]) {
    const exported = artworkSvg(restored, background);
    assert.ok(exported.includes('<path'));
    assert.ok(!exported.includes('<image'));
    assert.ok(exported.includes('Seed remember-this-leaf'));
    assert.equal(exported.includes('<rect'), background);
  }
});
