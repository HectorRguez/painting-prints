// Vector sampling of Mapgen4's frag_river shader (render.ts, Apache-2.0).
// Each river is the dist=0.5 arc in barycentric coordinates, connecting side
// midpoints. The width interpolates the original flow-derived endpoint widths.
export function riverSegments(buffer) {
  const segments = [];
  for (let i = 0; i < buffer.length; i += 12) {
    const a = [buffer[i], buffer[i+1]], b = [buffer[i+4], buffer[i+5]], c = [buffer[i+8], buffer[i+9]];
    const determinant = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if (Math.abs(determinant) < 1e-9) continue;
    const gradR = [(b[1]-c[1])/determinant, (c[0]-b[0])/determinant];
    const gradB = [(a[1]-b[1])/determinant, (b[0]-a[0])/determinant];
    const steps = Math.max(4, Math.ceil(Math.hypot(a[0]-c[0], a[1]-c[1])));
    function sample(t) {
      const radius = .5 / Math.sqrt(t*t+(1-t)*(1-t)+t*(1-t));
      const r = t*radius, blue = (1-t)*radius, g = 1-r-blue;
      const gradient = Math.hypot(...gradR.map((v, j) => (2*r+blue)*v+(2*blue+r)*gradB[j]));
      const width = .7 * (buffer[i+2]*(1-t)+buffer[i+3]*t) / gradient;
      return { point: [r*a[0]+g*b[0]+blue*c[0], r*a[1]+g*b[1]+blue*c[1], 0], width };
    }
    let previous = sample(0);
    for (let step = 1; step <= steps; step++) {
      const next = sample(step/steps);
      segments.push({ a: previous.point, b: next.point, width: (previous.width+next.width)/2 });
      previous = next;
    }
  }
  return segments;
}
