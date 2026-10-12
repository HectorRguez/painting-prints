/**
 * 2:1 dimetric projection ("game isometric").
 *
 * World space is right-handed in tile units:
 *   +x  east   -> screen right & down
 *   +y  north  -> screen left  & down
 *   +z  up     -> screen up
 *
 * The camera sits toward +x +y, so the visible faces of an axis-aligned box
 * are always its +x face (screen right), its +y face (screen left) and its
 * top. Everything else is back-face culled for free — no normals needed.
 *
 * One world unit = one tile. A unit cube renders as a 64x32 diamond top with
 * 32px-tall walls, which is the classic tileset ratio.
 */

export const TILE_W = 64;
export const TILE_H = 32;
export const UNIT_Z = 32;

const HW = TILE_W / 2;
const HH = TILE_H / 2;

/** [x, y, z] world -> [sx, sy] screen. */
export function project(p) {
  return [(p[0] - p[1]) * HW, (p[0] + p[1]) * HH - p[2] * UNIT_Z];
}

/** Project a list of world points. */
export function projectAll(pts) {
  const out = new Array(pts.length);
  for (let i = 0; i < pts.length; i++) out[i] = project(pts[i]);
  return out;
}

/**
 * Screen-space matrix that maps a face's local (u, v) space onto the projected
 * plane. Used as `patternTransform` so textures skew onto slanted planes
 * correctly instead of looking pasted on.
 *
 * `basis.u` and `basis.v` are *unit-length world vectors*, so one unit in
 * pattern space is always one world tile regardless of how big the face is.
 *
 * The translation is deliberately left at zero. `project` is a linear map, so
 * dropping the origin costs nothing but a phase shift — and it means every
 * face sharing an orientation shares one matrix. That collapses hundreds of
 * textured faces down to a handful of `<pattern>` defs, and coplanar faces
 * (a wall and the stone course at its foot) line their texture up for free.
 */
export function basisMatrix(basis) {
  const u = project(basis.u);
  const v = project(basis.v);
  return [u[0], u[1], v[0], v[1], 0, 0];
}

/**
 * Is the *far* side of a roof visible over its ridge?
 *
 * Vertical faces cull structurally — the camera is at +x +y, so a -x or -y
 * wall is never visible. Sloped faces do not. Solving `dot(normal, viewAxis)`
 * for a plane that rises by `rise` over a horizontal `run`, with the view axis
 * at (1, 1, 1), reduces to exactly `run > rise`: on any pitch shallower than
 * 45 degrees you look over the ridge and see the back slope.
 *
 * Steep medieval roofs hide it; shallow suburban and flat commercial ones do
 * not, so roof builders ask rather than assume.
 */
export const backSlopeVisible = (run, rise) => run > rise + 1e-9;

// --- small vector helpers, used everywhere -------------------------------

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Point at local offset (s, t) on a face basis. */
export const at = (basis, s, t) => [
  basis.o[0] + basis.u[0] * s + basis.v[0] * t,
  basis.o[1] + basis.u[1] * s + basis.v[1] * t,
  basis.o[2] + basis.u[2] * s + basis.v[2] * t,
];

/** Rectangle in face-local coords -> world polygon (clockwise on screen). */
export const localRect = (basis, s, t, w, h) => [
  at(basis, s, t),
  at(basis, s + w, t),
  at(basis, s + w, t + h),
  at(basis, s, t + h),
];

/** Polygon of local [s, t] pairs -> world points. */
export const localPoly = (basis, pts) => pts.map((p) => at(basis, p[0], p[1]));
