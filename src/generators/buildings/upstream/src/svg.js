/**
 * Minimal SVG emitter. Builds a string directly rather than a DOM so the same
 * code path works in Node and the browser, and so output is byte-stable for a
 * given seed (important if you check generated assets into a repo).
 */

const NUM = (n) => {
  // Two decimals is well below one screen pixel at default scale and keeps
  // file size sane; strip trailing zeros so output diffs stay readable.
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

export const num = NUM;

export function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** `[[x,y], ...]` -> `"x,y x,y"`. */
export function pointsAttr(pts) {
  let out = '';
  for (let i = 0; i < pts.length; i++) {
    if (i) out += ' ';
    out += NUM(pts[i][0]) + ',' + NUM(pts[i][1]);
  }
  return out;
}

export function el(tag, attrs = {}, children = '') {
  let s = '<' + tag;
  for (const k in attrs) {
    const v = attrs[k];
    if (v === undefined || v === null || v === false) continue;
    s += ` ${k}="${typeof v === 'number' ? NUM(v) : escapeAttr(v)}"`;
  }
  const body = Array.isArray(children) ? children.join('') : children;
  return body ? `${s}>${body}</${tag}>` : `${s}/>`;
}

/**
 * Registry for `<defs>` content. Everything is keyed by a caller-supplied
 * string so identical gradients and patterns collapse to one definition —
 * a building with 200 shingled faces still emits a single shingle pattern.
 */
export class Defs {
  constructor(prefix = 'b') {
    this.prefix = prefix;
    this.map = new Map();
    this.order = [];
  }

  /** Returns an id, calling `build(id)` only the first time a key is seen. */
  add(key, build) {
    const hit = this.map.get(key);
    if (hit) return hit;
    const id = `${this.prefix}${this.map.size.toString(36)}`;
    this.map.set(key, id);
    this.order.push(build(id));
    return id;
  }

  render() {
    return this.order.length ? el('defs', {}, this.order) : '';
  }
}
