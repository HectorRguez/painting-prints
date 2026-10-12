/**
 * Detail levels.
 *
 * A game draws the building it is standing next to and the two hundred behind
 * it with the same generator, so there has to be a cheaper version. The rule
 * that makes it useful rather than merely smaller:
 *
 *   **Detail never changes the silhouette.** Massing, roofs, dormers, chimneys
 *   and colour are identical at every level. What goes is dressing (moss, wear,
 *   ivy, flower boxes), ground props, surface textures and motion — so a distant
 *   building is recognisably the *same* building as the one up close, just
 *   plainer.
 *
 * Which constrains how packs may use this: gates must sit at *fork boundaries*.
 * `rng.fork(tag)` derives from seed and tag, so dropping a whole subsystem
 * leaves every other subsystem's stream untouched. Skipping a roll in the middle
 * of a shared stream would shift everything after it and change the shape of the
 * building between levels, which is exactly the bug this design prevents.
 *
 * The two halves are resolved at different times: `props`, `dressing` and
 * `glazing` affect what gets generated, `textures` and `animate` only affect
 * what gets emitted, so the latter can be overridden at render time without
 * regenerating.
 */

const TABLE = {
  high: { props: 1, dressing: true, glow: true, glazing: 'full', textures: true, animate: true },
  medium: { props: 0.6, dressing: false, glow: true, glazing: 'full', textures: true, animate: true },
  // `glow: false` drops the soft halo behind every emissive element and keeps
  // only its hot core — roughly halves the polygon count of a sci-fi facade,
  // where every lit window is two polygons.
  low: { props: 0, dressing: false, glow: false, glazing: 'simple', textures: false, animate: false },
};

export const DETAIL_LEVELS = Object.keys(TABLE);

/** Accepts a level name, or an already-resolved object (idempotent). */
export function resolveDetail(level = 'high') {
  if (level && typeof level === 'object' && typeof level.name === 'string') return level;
  const t = TABLE[level];
  if (!t) {
    throw new Error(`Unknown detail "${level}". Available: ${DETAIL_LEVELS.join(', ')}`);
  }
  return { name: level, ...t };
}

/**
 * Downgrade expensive glazing.
 *
 * Leaded came is the single heaviest thing a medieval building draws — a wall
 * of diagonal lead strips is roughly a third of its polygons — and a colonial
 * grid is the same idea at smaller scale. Both collapse to a cross at low
 * detail, which reads identically past a few tiles away.
 */
export function glazingFor(detail, bars) {
  if (detail.glazing !== 'simple') return bars;
  return bars === 'leaded' || bars === 'grid' ? 'cross' : bars;
}

/**
 * Scale a prop count or `[min, max]` range by the detail budget.
 * At full detail this is the identity, so high-detail output is untouched.
 */
export function scaleCount(detail, count) {
  const p = detail.props;
  if (p === 1) return count;
  return Array.isArray(count)
    ? [Math.round(count[0] * p), Math.round(count[1] * p)]
    : Math.round(count * p);
}
