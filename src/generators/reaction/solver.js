// Gray–Scott autocatalysis with a rotationally balanced nine-point stencil.
// The stencil sums to zero: 0.2/cardinal, 0.05/diagonal, -1/center.
export function advanceReaction(state, parameters, steps) {
  const { size } = state;
  const { diffusionU: du, diffusionV: dv, dt, feed, kill } = parameters;
  let u = state.u.slice(), v = state.v.slice();
  let nextU = new Float64Array(u.length), nextV = new Float64Array(v.length);
  const feedField = state.feedField;
  for (let step = 0; step < steps; step++) {
    for (let x = 0; x < size; x++) {
      nextU[x] = nextU[(size - 1) * size + x] = 1;
      nextV[x] = nextV[(size - 1) * size + x] = 0;
    }
    for (let y = 1; y < size - 1; y++) {
      const row = y * size;
      nextU[row] = nextU[row + size - 1] = 1;
      nextV[row] = nextV[row + size - 1] = 0;
      for (let x = 1; x < size - 1; x++) {
        const i = row + x, a = u[i], b = v[i];
        const lapU = .2 * (u[i - 1] + u[i + 1] + u[i - size] + u[i + size])
          + .05 * (u[i - size - 1] + u[i - size + 1] + u[i + size - 1] + u[i + size + 1]) - a;
        const lapV = .2 * (v[i - 1] + v[i + 1] + v[i - size] + v[i + size])
          + .05 * (v[i - size - 1] + v[i - size + 1] + v[i + size - 1] + v[i + size + 1]) - b;
        const f = feedField ? feedField[i] : feed, reaction = a * b * b;
        nextU[i] = a + dt * (du * lapU - reaction + f * (1 - a));
        nextV[i] = b + dt * (dv * lapV + reaction - (f + kill) * b);
      }
    }
    [u, nextU] = [nextU, u]; [v, nextV] = [nextV, v];
  }
  return { ...state, u, v, elapsed: (state.elapsed || 0) + steps * dt };
}

export function concentrationStatistics({ size, u, v }, threshold) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  let occupied = 0, boundaryActivity = 0, sumV = 0, sumV2 = 0;
  for (let i = 0; i < v.length; i++) {
    minU = Math.min(minU, u[i]); maxU = Math.max(maxU, u[i]);
    minV = Math.min(minV, v[i]); maxV = Math.max(maxV, v[i]);
    sumV += v[i]; sumV2 += v[i] ** 2; occupied += v[i] > threshold;
    const x = i % size, y = Math.floor(i / size);
    if (x < 12 || y < 12 || x >= size - 12 || y >= size - 12) boundaryActivity = Math.max(boundaryActivity, v[i]);
  }
  return { minU, maxU, minV, maxV, coverage: occupied / v.length,
    varianceV: sumV2 / v.length - (sumV / v.length) ** 2, boundaryActivity };
}
