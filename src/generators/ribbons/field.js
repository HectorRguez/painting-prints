// An analytic scalar streamfunction: rotated/anisotropic Fourier modes,
// regularized logarithmic vortices, and drift. Differentiating the complete
// potential gives a C-infinity divergence-free field, including its transform.
export function ribbonField(parameters) {
  const p = parameters.field ?? parameters;
  const c = Math.cos(p.angle), s = Math.sin(p.angle), a = p.anisotropy;
  // q = A*x, det(A)=1. The gradient is transformed by A^T, not A.
  const matrix = [a * c, a * s, -s / a, c / a];
  const drift = [p.drift.speed * Math.cos(p.drift.angle), p.drift.speed * Math.sin(p.drift.angle)];
  const harmonics = p.harmonics.map(h => ({ ...h, kx: Math.PI * h.frequency * Math.cos(h.angle), ky: Math.PI * h.frequency * Math.sin(h.angle), k: Math.PI * h.frequency }));
  const evaluate = (point, potentialOnly) => {
    const x = matrix[0] * point[0] + matrix[1] * point[1], y = matrix[2] * point[0] + matrix[3] * point[1];
    let potential = drift[0] * y - drift[1] * x, gx = -drift[1], gy = drift[0];
    for (const h of harmonics) {
      const phase = h.kx * x + h.ky * y + h.phase;
      potential += h.amplitude / h.k * Math.sin(phase);
      const derivative = h.amplitude / h.k * Math.cos(phase);
      gx += derivative * h.kx; gy += derivative * h.ky;
    }
    for (const vortex of p.vortices) {
      const dx = x - vortex.center[0], dy = y - vortex.center[1], r2 = vortex.radius ** 2;
      const q = (dx * dx + dy * dy) / r2;
      potential -= .5 * vortex.circulation * r2 * Math.log1p(q);
      const derivative = -vortex.circulation / (1 + q);
      gx += derivative * dx; gy += derivative * dy;
    }
    if (potentialOnly) return potential;
    return [matrix[1] * gx + matrix[3] * gy, -(matrix[0] * gx + matrix[2] * gy)];
  };
  return { velocity: point => evaluate(point, false), potential: point => evaluate(point, true) };
}

export function rk4Step(velocity, point, step) {
  const shift = (v, scale) => [point[0] + v[0] * scale, point[1] + v[1] * scale];
  const a = velocity(point), b = velocity(shift(a, step / 2)), c = velocity(shift(b, step / 2)), d = velocity(shift(c, step));
  return [point[0] + step * (a[0] + 2 * b[0] + 2 * c[0] + d[0]) / 6,
    point[1] + step * (a[1] + 2 * b[1] + 2 * c[1] + d[1]) / 6];
}

// Step-doubling estimates the local RK4 error. Return the two-half-step state
// only after it meets tolerance; a minimum-step failure is never accepted.
export function adaptiveStep(velocity, point, requested, { tolerance, minStep }) {
  let step = requested;
  for (let trial = 0; trial < 16; trial++) {
    const full = rk4Step(velocity, point, step);
    const half = rk4Step(velocity, rk4Step(velocity, point, step / 2), step / 2);
    const error = Math.hypot(full[0] - half[0], full[1] - half[1]) / 15;
    if (!Number.isFinite(error)) return null;
    if (error <= tolerance) return { point: half, step, error };
    if (step <= minStep) return null;
    step = Math.max(minStep, step * Math.max(.2, Math.min(.8, .9 * (tolerance / error) ** .2)));
  }
  return null;
}
