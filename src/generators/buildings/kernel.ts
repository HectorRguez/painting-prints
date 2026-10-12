// Batch projection and painter ordering from iso-building-generator (MIT).
// A single boundary crossing for all faces, rather than one WASM call per point.
const points = new Float64Array(300000);
const boxes = new Float64Array(12000);
const order = new Int32Array(2000), degree = new Int32Array(2000), done = new Uint8Array(2000);
const edges = new Uint8Array(4000000);
export function pointsPointer(): usize { return points.dataStart; }
export function boxesPointer(): usize { return boxes.dataStart; }
export function orderPointer(): usize { return order.dataStart; }
export function project(count: i32): void {
  for (let i = 0; i < count; i++) {
    const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
    points[i * 3] = (x - y) * 32; points[i * 3 + 1] = (x + y) * 16 - z * 32;
  }
}
function behind(a: i32, b: i32): bool {
  return boxes[a * 6 + 3] <= boxes[b * 6] + 0.000001 || boxes[a * 6 + 4] <= boxes[b * 6 + 1] + 0.000001 || boxes[a * 6 + 5] <= boxes[b * 6 + 2] + 0.000001;
}
function key(i: i32): f64 { return boxes[i * 6] + boxes[i * 6 + 1] + boxes[i * 6 + 2]; }
export function sort(count: i32): void {
  degree.fill(0); done.fill(0);
  for (let a = 0; a < count; a++) for (let b = 0; b < count; b++) {
    const edge = a != b && behind(a, b) && !behind(b, a);
    edges[a * count + b] = edge ? 1 : 0;
    if (edge) degree[b]++;
  }
  for (let step = 0; step < count; step++) {
    let best = -1;
    for (let i = 0; i < count; i++) {
      if (done[i] || degree[i] > 0) continue;
      if (best < 0 || key(i) < key(best)) best = i;
    }
    if (best < 0) for (let i = 0; i < count; i++) {
      if (!done[i] && (best < 0 || key(i) < key(best))) best = i;
    }
    done[best] = 1; order[step] = best;
    for (let b = 0; b < count; b++) if (edges[best * count + b] && degree[b] > 0) degree[b]--;
  }
}
