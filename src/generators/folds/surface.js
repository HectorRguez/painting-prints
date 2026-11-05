const TAU = Math.PI * 2;
const unit = a => { const d = Math.hypot(...a); return a.map(x => x / d); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => a.map((x, i) => x - b[i]);

export function foldSurface(p, u, v, relief = true) {
  u += p.endRound * (1 - 2 * u) * ((2 * v - 1) ** 2 - .5)
    * (Math.exp(-u / .12) + Math.exp(-(1 - u) / .12));
  const phase = p.pleats * (u + p.spacingVariation * Math.sin(TAU * u));
  const pleat = (.5 - .5 * Math.cos(TAU * phase)) ** p.pleatRoundness;
  const foldEdge = p.edgeLift + (1 - p.edgeLift) * Math.sin(Math.PI * v) ** p.edgeSoftness;
  const envelope = 1 - p.taper * Math.cos(Math.PI * (u - .5)) ** 2;
  let x, y, z;
  if (p.family === 'fan') {
    const theta = (u - .5) * p.aperture + p.twist * .5 * v * v;
    const inner = p.innerRadius * (1 + p.edgeWave * Math.sin(u * 3.8 + p.phase));
    const width = p.width * (1 + p.edgeWave * Math.sin(u * 4.3 - p.phase));
    const r = inner + width * v;
    x = Math.cos(theta) * r;
    y = Math.sin(theta) * r;
    z = p.arch * Math.sin(u * Math.PI) + (relief ? p.amplitude * pleat * foldEdge : 0)
      + p.twist * (u - .5) * width * v;
  } else {
    const bend = Math.min(p.bend, .9 * p.length ** 2 / (p.width * (1 + p.edgeWave) * (Math.PI * 1.6) ** 2));
    const center = [p.length * (u - .5), bend * Math.sin((u - .5) * Math.PI * 1.6 + p.phase * .25)];
    const dy = bend * Math.PI * 1.6 * Math.cos((u - .5) * Math.PI * 1.6 + p.phase * .25);
    const normal = unit([-dy, p.length]);
    const width = p.width * envelope * (1 + p.edgeWave * Math.sin(u * TAU + p.phase));
    x = center[0] + normal[0] * (v - .5) * width;
    y = center[1] + normal[1] * (v - .5) * width;
    z = p.arch * Math.sin(u * Math.PI) + (relief ? p.amplitude * pleat * foldEdge : 0)
      + p.twist * Math.sin(u * Math.PI - .5) * (v - .5) * width;
  }
  const co = Math.cos(p.rotation), si = Math.sin(p.rotation);
  return [(x * co - y * si) * p.aspect, (x * si + y * co) / p.aspect, z];
}

export function foldNormal(p, u, v, epsilon = 1e-5, relief = true) {
  const du = sub(foldSurface(p, u + epsilon, v, relief), foldSurface(p, u - epsilon, v, relief));
  const dv = sub(foldSurface(p, u, Math.min(1, v + epsilon), relief), foldSurface(p, u, Math.max(0, v - epsilon), relief));
  let normal = unit(cross(du, dv));
  if (normal[2] < 0) normal = normal.map(x => -x);
  return normal;
}

export function foldLighting(p, u, v) {
  const light = [Math.cos(p.lightAzimuth) * Math.cos(p.lightElevation),
    Math.sin(p.lightAzimuth) * Math.cos(p.lightElevation), Math.sin(p.lightElevation)];
  const normal = foldNormal(p, u, v);
  return .12 + .82 * Math.max(0, normal.reduce((sum, x, k) => sum + x * light[k], 0));
}

export function projectFold(p, u, v) {
  const [x, y, z] = foldSurface(p, u, v, false);
  const py = y * Math.cos(p.tilt) - z * Math.sin(p.tilt), co = Math.cos(p.cameraRoll), si = Math.sin(p.cameraRoll);
  return [x * co - py * si, x * si + py * co];
}

export function projectionJacobian(p, u, v, epsilon = 1e-5) {
  const a = projectFold(p, u + epsilon, v), b = projectFold(p, u - epsilon, v);
  const v0 = Math.max(0, v - epsilon), v1 = Math.min(1, v + epsilon);
  const c = projectFold(p, u, v1), d = projectFold(p, u, v0);
  return ((a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0])) / (2 * epsilon * (v1 - v0));
}

export function projectionBounds(p) {
  let min = Infinity, max = -Infinity;
  for (let j = 0; j <= 24; j++) for (let i = 0; i <= 48; i++) {
    const value = projectionJacobian(p, i / 48, j / 24);
    if (!Number.isFinite(value)) throw new RangeError('Nonfinite fold projection');
    min = Math.min(min, value); max = Math.max(max, value);
  }
  return { min, max };
}

export function validProjection({ min, max }) {
  return min * max > 0 && Math.min(Math.abs(min), Math.abs(max)) / Math.max(Math.abs(min), Math.abs(max)) >= .015;
}

// Choose a feasible seeded camera before exposing the default recipe. Explicit
// overrides never use this adjustment: the generator rejects unsafe requests.
export function fitDefaultProjection(parameters) {
  if (validProjection(projectionBounds(parameters))) return parameters;
  const flat = { ...parameters, tilt: 0 }, edge = { ...parameters, tilt: Math.PI / 2 };
  let slope = 0;
  // J(t) = A cos(t) - B sin(t). Bounding B/A gives a camera tilt with
  // at least half of the face-on Jacobian factor at every sampled point.
  for (let j = 0; j <= 24; j++) for (let i = 0; i <= 48; i++) {
    const a = projectionJacobian(flat, i / 48, j / 24), b = -projectionJacobian(edge, i / 48, j / 24);
    slope = Math.max(slope, b / a);
  }
  const fitted = { ...parameters, tilt: Math.min(parameters.tilt, Math.atan(.5 / slope)) };
  if (validProjection(projectionBounds(fitted))) return fitted;
  if (!validProjection(projectionBounds(flat))) throw new RangeError('Invalid default sheet geometry');
  return flat;
}

