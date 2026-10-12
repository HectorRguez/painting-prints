export function seedNumber(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0 || 1;
}

export function randomSource(seed) {
  let state = seedNumber(seed);
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export async function loadKernel() {
  const response = await fetch(new URL('engine.wasm', self.location.href));
  if (!response.ok) throw new Error('Could not load generator');
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), {
    env: { abort() { throw new Error('Generator exceeded its bounds'); } },
  });
  return instance.exports;
}

export const number = n => Math.round(n * 1000) / 1000;
export const line = (points, close = false) => points.map((p, i) => `${i ? 'L' : 'M'}${number(p[0])},${number(p[1])}`).join('') + (close ? 'Z' : '');

export function drawing(paths, { width = 1000, height = 1000, whiteToAlpha = false } = {}) {
  return { width, height, whiteToAlpha, paperColor: '#f5f2eb',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.map(p => `<path d="${p.d}" fill="${p.fill || 'none'}" stroke="${p.stroke || '#252525'}" stroke-width="${p.width ?? 0.8}"/>`).join('')}</svg>` };
}

export function fitLines(lines, width = 1000, height = 1000, padding = 65) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const points of lines) for (const [x, y] of points) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) throw new Error('Empty drawing');
  const scale = Math.min((width - padding * 2) / (x1 - x0 || 1), (height - padding * 2) / (y1 - y0 || 1));
  return lines.map(points => points.map(([x, y]) => [width / 2 + (x - (x0 + x1) / 2) * scale, height / 2 + (y - (y0 + y1) / 2) * scale]));
}

export function serve(generate) {
  self.onmessage = async ({ data: { seed } }) => {
    try {
      const start = performance.now();
      const art = await generate(seed);
      self.postMessage({ type: 'painting-ready', artRevision: 1, ...art, generationMs: performance.now() - start });
    } catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
  };
}
