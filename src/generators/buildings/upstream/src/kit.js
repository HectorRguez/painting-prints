/**
 * The style-author toolkit — everything below the style packs.
 *
 *   import { Scene, gableRoof, windowOpening, solid } from 'iso-building-generator/kit';
 *
 * The four built-in packs are written against exactly this surface and nothing
 * else, which is the point: a pack you write outside the repo has the same
 * capabilities as `medieval.js`. See docs/styles.md.
 *
 * Stability: this is a supported entry point, so anything re-exported here is
 * covered by the same major-version promise as the main API. Modules *not*
 * listed here (`svg.js`, the packs themselves) are internal and may change.
 */

// Projection, vectors and face-local coordinates.
export * from './projection.js';

// Solids: boxes, the five roof builders, and shapes drawn on a face.
export * from './geometry.js';

// Colour model and directional lighting.
export * from './color.js';

// Facade grammar: bays, windows, doors, beams, shadow gradients.
export * from './facade.js';

// Surface textures, in world-unit space.
export * from './patterns.js';

// Motion primitives.
export * from './animation.js';

// Scene graph, depth sort and the SVG renderer.
export * from './scene.js';

// Seeded, forkable randomness.
export * from './rng.js';

// Detail levels: `resolveDetail` for packs called directly, and the two helpers
// a pack needs to honour `opts.detail` — `scaleCount` for prop counts,
// `glazingFor` to downgrade expensive glazing.
export * from './detail.js';

// Cross-genre helpers: footprints, contact shadows, prop scattering, whole-box
// and railing drawing, plumes and lamp glows.
export * from './styles/common.js';
