// Seeded gradient noise. No host callbacks or per-sample allocations.
let salt: u32 = 1;
export function seedNoise(seed: u32): void { salt = seed; }
function hash(x: i32, y: i32): u32 {
  let h = salt ^ (<u32>x * 374761393) ^ (<u32>y * 668265263);
  h = (h ^ (h >> 13)) * 1274126177;
  return h ^ (h >> 16);
}
function grad(x: i32, y: i32, dx: f64, dy: f64): f64 {
  const h = hash(x, y) & 7;
  const a = h < 4 ? dx : dy, b = h < 4 ? dy : dx;
  return ((h & 1) == 0 ? a : -a) + ((h & 2) == 0 ? b : -b);
}
export function noise(x: f64, y: f64): f64 {
  const ix = <i32>Math.floor(x), iy = <i32>Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = grad(ix, iy, fx, fy), b = grad(ix + 1, iy, fx - 1, fy);
  const c = grad(ix, iy + 1, fx, fy - 1), d = grad(ix + 1, iy + 1, fx - 1, fy - 1);
  return a + (b - a) * u + (c + (d - c) * u - a - (b - a) * u) * v;
}
