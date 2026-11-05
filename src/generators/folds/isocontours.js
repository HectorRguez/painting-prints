// Marching squares with shared edge identities and a bilinear saddle decider.
// The returned coordinates are in grid units; callers perform their own affine
// projection. Boundary traces stay open. Exact ties use a consistent positive
// perturbation, so the graph never has an arbitrary four-way vertex.
export function traceContours(values, columns, rows, level) {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 2 || rows < 2
    || values.length !== columns * rows || !Number.isFinite(level)) throw new RangeError('Invalid contour grid');
  for (const value of values) if (!Number.isFinite(value)) throw new RangeError('Contour samples must be finite');
  const nodes = new Map(), segments = [];
  const signed = value => value === level ? 1e-12 : value - level;
  function node(key, a, b, va, vb) {
    if (!nodes.has(key)) {
      const t = va / (va - vb);
      nodes.set(key, { point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], edges: [] });
    }
    return key;
  }
  const join = (a, b) => {
    const index = segments.length;
    segments.push({ a, b, used: false }); nodes.get(a).edges.push(index); nodes.get(b).edges.push(index);
  };
  for (let y = 0; y < rows - 1; y++) for (let x = 0; x < columns - 1; x++) {
    const a = signed(values[y * columns + x]), b = signed(values[y * columns + x + 1]);
    const c = signed(values[(y + 1) * columns + x + 1]), d = signed(values[(y + 1) * columns + x]);
    const edges = [];
    if ((a > 0) !== (b > 0)) edges[0] = node(`h${y * columns + x}`, [x, y], [x + 1, y], a, b);
    if ((b > 0) !== (c > 0)) edges[1] = node(`v${y * columns + x + 1}`, [x + 1, y], [x + 1, y + 1], b, c);
    if ((d > 0) !== (c > 0)) edges[2] = node(`h${(y + 1) * columns + x}`, [x, y + 1], [x + 1, y + 1], d, c);
    if ((a > 0) !== (d > 0)) edges[3] = node(`v${y * columns + x}`, [x, y], [x, y + 1], a, d);
    const active = edges.filter(Boolean);
    if (active.length === 2) join(...active);
    else if (active.length === 4) {
      // Sign of the bilinear determinant chooses connectivity at the saddle,
      // unlike averaging the four corners (which can choose the wrong lobes).
      if (a * c - b * d >= 0) { join(edges[0], edges[1]); join(edges[2], edges[3]); }
      else { join(edges[3], edges[0]); join(edges[1], edges[2]); }
    }
  }
  const result = [];
  const walk = (start, first) => {
    const points = [nodes.get(start).point];
    let key = start, index = first, closed = false;
    while (index !== undefined) {
      const edge = segments[index];
      if (edge.used) break;
      edge.used = true; key = edge.a === key ? edge.b : edge.a;
      if (key === start) { closed = true; break; }
      points.push(nodes.get(key).point);
      index = nodes.get(key).edges.find(i => !segments[i].used);
    }
    if (points.length >= (closed ? 3 : 2)) result.push({ points, closed });
  };
  for (const [key, node] of nodes) if (node.edges.length === 1 && !segments[node.edges[0]].used) walk(key, node.edges[0]);
  segments.forEach((edge, i) => { if (!edge.used) walk(edge.a, i); });
  return result;
}

export function signedArea(points) {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) area += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  return area / 2;
}
