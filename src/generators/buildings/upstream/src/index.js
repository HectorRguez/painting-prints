/**
 * Public API.
 *
 *   import { generateBuilding } from 'iso-building-generator';
 *   const { svg, meta, params } = generateBuilding('oakhurst-14');
 *
 * The same seed always yields the same building, in Node and in the browser,
 * for the life of a major version — see `version.js` for the stability contract.
 *
 * Generation and rendering are separable. `generateBuilding` is the one-call
 * path and what most callers want; `buildBuilding` + `renderSVG` exist for when
 * one building is emitted more than once (several scales, with and without
 * motion) and re-running the generator for each would be waste.
 *
 * To write your own style pack, import from `iso-building-generator/kit`.
 */

import { Rng } from './rng.js';
import { Scene, render } from './scene.js';
import { project, TILE_W, TILE_H, UNIT_Z } from './projection.js';
import { GENERATOR_NAME, GENERATOR_VERSION } from './version.js';
import { resolveDetail } from './detail.js';
import * as medieval from './styles/medieval.js';
import * as cozy from './styles/cozy.js';
import * as modern from './styles/modern.js';
import * as scifi from './styles/scifi.js';

export const STYLES = { medieval, cozy, modern, scifi };

export { Rng, Scene, render };
export { GENERATOR_NAME, GENERATOR_VERSION } from './version.js';
export { DETAIL_LEVELS } from './detail.js';
export { svgToDataURI } from './uri.js';
// Re-exports project(), the tile constants and the vector/face helpers, for
// callers that want to place sprites or build their own geometry.
export * from './projection.js';

/** Every registered style name, built-in and custom. */
export function listStyles() {
  return Object.keys(STYLES).sort();
}

/**
 * Register a style pack so it can be used as `opts.style`.
 *
 * Validation is deliberately loud and up-front: a pack that is missing `build`
 * would otherwise fail deep inside the renderer, on a different call, with an
 * error that says nothing about which style is at fault.
 *
 * @param {string} name
 * @param {{build: Function}} pack  a module or object exporting `build(scene, rng, opts)`
 */
export function registerStyle(name, pack) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('registerStyle: name must be a non-empty string');
  }
  if (Object.hasOwn(STYLES, name)) {
    throw new Error(`registerStyle: "${name}" is already registered`);
  }
  if (!pack || typeof pack.build !== 'function') {
    throw new TypeError(`registerStyle: "${name}" must export build(scene, rng, opts)`);
  }
  STYLES[name] = pack;
  return pack;
}

/**
 * Generate a building's geometry without emitting any markup.
 *
 * @param {string|number} seed
 * @param {object} [opts]
 * @param {string}  [opts.style='medieval']
 * @param {string}  [opts.detail='high']   'high' | 'medium' | 'low'
 * @param {object}  [opts.palette]         partial override of the rolled palette
 * @param {number}  [opts.floors]          force storey count
 * @param {number}  [opts.width]           force footprint width in tiles
 * @param {number}  [opts.depth]           force footprint depth in tiles
 * @returns {{scene: Scene, params: object, meta: object}}
 */
export function buildBuilding(seed, opts = {}) {
  const {
    style = 'medieval',
    detail = 'high',
    // Render-time options are accepted here so a single options object can be
    // passed to either function, but they are not forwarded to the pack.
    scale, padding, background, animate, textures, idPrefix, classPrefix, title,
    ...styleOpts
  } = opts;

  const impl = STYLES[style];
  if (!impl) {
    throw new Error(`Unknown style "${style}". Available: ${listStyles().join(', ')}`);
  }

  const det = resolveDetail(detail);
  const rng = new Rng(String(seed));
  const scene = new Scene();
  const params = impl.build(scene, rng, { ...styleOpts, detail: det });

  if (!params || !params.footprint) {
    throw new Error(`Style "${style}" returned no footprint — build() must return its resolved params`);
  }
  const fp = params.footprint;

  return {
    scene,
    params,
    meta: {
      seed: String(seed),
      style,
      detail: det.name,
      generator: { name: GENERATOR_NAME, version: GENERATOR_VERSION },
      tile: { w: TILE_W, h: TILE_H, z: UNIT_Z },
      footprint: {
        w: Math.ceil(fp.w - 1e-9),
        d: Math.ceil(fp.d - 1e-9),
        exact: { w: fp.w, d: fp.d },
      },
    },
  };
}

/**
 * Emit an SVG document from a built building. Safe to call more than once on
 * the same input — rendering only reads the scene.
 *
 * @param {{scene: Scene, params: object, meta: object}} built
 * @param {object} [opts]
 * @param {number}  [opts.scale=1]        multiplies width/height; the viewBox is
 *                                        unchanged, so output stays crisp
 * @param {number}  [opts.padding=10]     blank margin in user units
 * @param {object}  [opts.background]     {h,s,l} fill behind the building
 * @param {boolean} [opts.animate]        emit the CSS motion layer
 * @param {boolean} [opts.textures]       emit <pattern> texture fills
 * @param {string}  [opts.idPrefix]       namespaces def ids and animation names
 * @param {string}  [opts.classPrefix='bg-']
 * @param {string}  [opts.title]
 */
export function renderSVG(built, opts = {}) {
  const { scene, params, meta } = built ?? {};
  if (!scene || !meta) {
    throw new TypeError('renderSVG: expected the result of buildBuilding()');
  }

  const det = resolveDetail(opts.detail ?? meta.detail);
  const {
    scale = 1,
    padding = 10,
    background = null,
    animate = det.animate,
    textures = det.textures,
    classPrefix,
    idPrefix,
    title,
  } = opts;

  const out = render(scene, {
    scale,
    padding,
    background,
    animate,
    textures,
    classPrefix,
    // Namespacing def ids by seed keeps many buildings inlined on one page
    // from colliding on gradient, pattern or keyframe names.
    idPrefix: idPrefix ?? `s${shortHash(meta.seed)}`,
    title: title ?? `${meta.style} building (seed ${meta.seed})`,
  });

  const fp = params.footprint;
  const gc = project([(fp.x0 + fp.x1) / 2, (fp.y0 + fp.y1) / 2, 0]);

  return {
    svg: out.svg,
    width: out.width,
    height: out.height,
    viewBox: out.viewBox,
    meta: {
      ...meta,
      anchor: out.anchor,
      groundCenter: [gc[0] - out.viewBox[0], gc[1] - out.viewBox[1]],
    },
    params,
  };
}

/**
 * Generate and render in one call — the path most callers want.
 *
 * `meta.anchor` is where world (0,0,0) lands inside the SVG and
 * `meta.groundCenter` is the centre of the footprint at ground level; use
 * either to place the sprite on a tile grid without re-deriving the projection.
 *
 * @param {string|number} seed  anything stringifiable
 * @param {object} [opts]  build and render options combined
 * @returns {{svg: string, width: number, height: number, viewBox: number[],
 *            meta: object, params: object}}
 */
export function generateBuilding(seed, opts = {}) {
  return renderSVG(buildBuilding(seed, opts), opts);
}

/** Convenience: N buildings from one base seed, deterministically. */
export function generateRow(baseSeed, count, opts = {}) {
  return Array.from({ length: count }, (_, i) => generateBuilding(`${baseSeed}#${i}`, opts));
}

function shortHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 4);
}
