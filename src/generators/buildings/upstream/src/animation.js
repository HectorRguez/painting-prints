/**
 * Motion: CSS animation baked into the SVG document.
 *
 * Three constraints shaped this:
 *
 *   Static renderers must be unaffected. Every animated property lives inside
 *   `@keyframes`, never in the class rule, so anything that understands CSS but
 *   not animation — and anything that ignores CSS entirely, like resvg — draws
 *   exactly the frame the geometry was authored at. Motion is a layer on top of
 *   a picture that already stands on its own.
 *
 *   Many buildings share a page. Keyframe and class names carry the same
 *   per-seed prefix as the gradient ids, so two inlined SVGs never overwrite
 *   each other's animations.
 *
 *   Motion is optional. `animate: false` drops the whole layer, and
 *   `prefers-reduced-motion` disables it at view time.
 *
 * Transforms are applied to a `<g>` wrapping a run of faces rather than to the
 * polygons themselves, so a swinging signboard keeps its faces glued together.
 *
 * Rotation and scale need a pivot, and that is done by translating the pivot to
 * the user-space origin and back around the animated group rather than with
 * `transform-origin`. It costs two wrapper elements, but the meaning of a
 * `translate` is not open to interpretation, whereas `transform-origin` lengths
 * depend on the renderer agreeing about where a `transform-box: view-box`
 * reference box starts — and this library emits assets, not pages.
 */

import { el, num } from './svg.js';

/**
 * Each entry returns the body of a `@keyframes` rule plus how to play it.
 * Amplitudes are in screen units (one world unit up is `UNIT_Z` px) or degrees.
 */
const KINDS = {
  /** Pendulum about a pivot: hanging signs, lanterns, baskets, pennants. */
  sway: ({ amp = 4 }) => ({
    frames: `from{transform:rotate(${num(-amp)}deg)}to{transform:rotate(${num(amp)}deg)}`,
    timing: 'ease-in-out',
    direction: 'alternate',
  }),

  /** Slow vertical float — anything hovering. */
  bob: ({ amp = 3 }) => ({
    frames: `from{transform:translate(0,${num(amp)}px)}to{transform:translate(0,${num(-amp)}px)}`,
    timing: 'ease-in-out',
    direction: 'alternate',
  }),

  /**
   * Screen-space rotation. Strictly this is only correct for a disc facing the
   * camera, but a fan or turbine is small enough that the stylisation reads as
   * spinning rather than as wrong.
   */
  spin: ({ reverse = false }) => ({
    frames: `from{transform:rotate(0deg)}to{transform:rotate(${reverse ? -360 : 360}deg)}`,
    timing: 'linear',
  }),

  /**
   * One handoff in a rising plume: travel `rise`/`side`, grow by `grow`, and
   * ramp opacity from `from` to `to`.
   *
   * The cycle is the interval between one puff and the next, not the life of
   * the whole column — see `plume()` in styles/common.js for why that is the
   * only period at which the loop is seamless.
   */
  drift: ({ rise = 24, side = 0, grow = 1.4, from = 1, to = 0 }) => ({
    frames:
      `from{opacity:${num(from)};transform:translate(0,0) scale(1)}` +
      `to{opacity:${num(to)};transform:translate(${num(side)}px,${num(-rise)}px) scale(${num(grow)})}`,
    timing: 'linear',
  }),

  /** Irregular guttering — candle and flame light. */
  flicker: ({ lo = 0.55 }) => {
    const at = (t, o) => `${t}%{opacity:${num(o)}}`;
    const span = 1 - lo;
    return {
      frames: [
        at(0, 1), at(9, lo + span * 0.1), at(15, 0.94), at(26, lo),
        at(34, 0.98), at(48, lo + span * 0.45), at(56, 1), at(68, lo + span * 0.2),
        at(77, 0.96), at(88, lo + span * 0.6), at(100, 1),
      ].join(''),
      timing: 'ease-in-out',
    };
  },

  /** Even breathing — neon, glows, anything meant to look powered. */
  pulse: ({ lo = 0.55, hi = 1 }) => ({
    frames: `from{opacity:${num(lo)}}to{opacity:${num(hi)}}`,
    timing: 'ease-in-out',
    direction: 'alternate',
  }),

  /** Mostly dark with a short flash: aircraft warning lamps, status LEDs. */
  blink: ({ lo = 0.12, on = 14 }) => ({
    frames: `0%,${num(on)}%{opacity:1}${num(on + 1)}%,100%{opacity:${num(lo)}}`,
    timing: 'steps(1,end)',
  }),

  /** Cloth in wind: a shear plus a little foreshortening. */
  wave: ({ amp = 5, squash = 0.94 }) => ({
    frames:
      `from{transform:skewY(${num(-amp)}deg) scaleX(1)}` +
      `to{transform:skewY(${num(amp)}deg) scaleX(${num(squash)})}`,
    timing: 'ease-in-out',
    direction: 'alternate',
  }),
};

export const ANIMATIONS = Object.keys(KINDS);

/** Kinds that rotate or scale, and so need a pivot to do it about. */
const PIVOTED = new Set(['sway', 'spin', 'wave', 'drift']);

/**
 * Registry for the animation layer. Mirrors `Defs`: identical specs collapse to
 * one class, so a hundred flickering windows cost one rule.
 */
export class Anim {
  constructor(prefix = 'b', enabled = true, classPrefix = 'bg-') {
    this.prefix = prefix;
    this.enabled = enabled;
    this.classPrefix = classPrefix;
    this.map = new Map();
    this.rules = [];
  }

  /**
   * Wrap already-rendered markup in the group that animates it. Returns the
   * markup untouched if the spec is empty, unknown, or motion is off.
   *
   * @param {object} spec     `{ type, dur, delay, ...params }`
   * @param {string} inner     rendered faces
   * @param {number[]} [pivot] screen-space point to rotate or scale about
   */
  wrap(spec, inner, pivot) {
    const attrs = this.attrs(spec);
    if (!attrs) return inner;
    if (!pivot || !PIVOTED.has(spec.type)) return el('g', attrs, inner);

    const [px, py] = pivot;
    return el('g', { transform: `translate(${num(px)} ${num(py)})` },
      el('g', attrs,
        el('g', { transform: `translate(${num(-px)} ${num(-py)})` }, inner)));
  }

  /** The class and per-instance style for one spec, or null if it animates nothing. */
  attrs(spec) {
    if (!this.enabled || !spec) return null;
    const make = KINDS[spec.type];
    if (!make) return null;

    const { type, dur = 3, delay = 0, pivot, ...params } = spec;
    const key = `${type}|${num(dur)}|${JSON.stringify(params)}`;
    let cls = this.map.get(key);
    if (!cls) {
      const tag = this.map.size.toString(36);
      cls = `${this.prefix}a${tag}`;
      const { frames, timing = 'ease-in-out', direction = 'normal' } = make(params);
      this.rules.push(
        `@keyframes ${this.prefix}k${tag}{${frames}}` +
        `.${cls}{animation:${this.prefix}k${tag} ${num(dur)}s ${timing} ${direction} infinite}`
      );
      this.map.set(key, cls);
    }

    // Only the delay varies per instance, so it stays inline rather than
    // forking the rule. A negative delay starts the cycle already in progress,
    // which is what keeps a row of identical lamps from blinking in unison.
    return {
      class: `${this.classPrefix}anim ${cls}`,
      style: delay ? `animation-delay:${num(delay)}s` : null,
    };
  }

  css() {
    if (!this.rules.length) return '';
    return this.rules.join('') +
      `@media(prefers-reduced-motion:reduce){.${this.classPrefix}anim{animation:none}}`;
  }
}
