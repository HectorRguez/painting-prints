/**
 * Scene graph + painter's-algorithm renderer.
 *
 * The unit of depth sorting is the *item*, not the face. An item is a cluster
 * of faces that belong to one solid — a volume with its walls, facade detail
 * and roof, or a single prop. Faces inside an item are drawn in insertion
 * order, which is correct because the visible faces of a convex box never
 * overlap each other on screen.
 *
 * Between items we sort by separating axis: if item A lies entirely at lower
 * x, lower y or lower z than B, then A is farther from the camera and must be
 * drawn first. That gives a partial order, which we resolve with a topological
 * sort. Cycles (possible when two solids interlock) fall back to a depth key.
 */

import { project, projectAll, basisMatrix } from './projection.js';
import { el, pointsAttr, num } from './svg.js';
import { litFace, shade, toCss, colorKey } from './color.js';
import { buildPattern } from './patterns.js';
import { Defs } from './svg.js';
import { Anim } from './animation.js';

const EPS = 1e-6;

export class Item {
  constructor(cls, sortBox) {
    this.cls = cls;
    this.sortBox = sortBox || null;
    this.faces = [];
  }

  /**
   * @param {object} f
   * @param {number[][]} f.pts     world-space polygon, screen-clockwise
   * @param {string}     f.kind    lighting class: top|left|right|slopeLeft|slopeRight|ground
   * @param {object}     f.color   {h,s,l} base colour before lighting
   * @param {object}    [f.basis]  {u,v} unit world vectors, required for texture
   * @param {object}    [f.texture] {type, ...opts}
   * @param {number}    [f.lit]    extra brightness multiplier (default 1)
   * @param {number}    [f.ao]     gradient depth, 0 = flat (default 0.16)
   * @param {string}    [f.cls]    semantic class for CSS targeting
   * @param {number}    [f.opacity]
   * @param {object}    [f.stroke] {color, width}
   * @param {object}    [f.anim]   `{type, dur, delay, pivot, ...}`; consecutive
   *                               faces given the *same object* animate as one
   *                               group, which is how a swinging sign keeps its
   *                               faces together
   */
  face(f) {
    this.faces.push(f);
    return this;
  }

  bounds() {
    if (this.sortBox) return this.sortBox;
    const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const f of this.faces) {
      for (const p of f.pts) {
        for (let i = 0; i < 3; i++) {
          if (p[i] < b[i]) b[i] = p[i];
          if (p[i] > b[i + 3]) b[i + 3] = p[i];
        }
      }
    }
    this.sortBox = b;
    return b;
  }
}

export class Scene {
  constructor() {
    this.items = [];
  }

  /** `sortBox` is [minX,minY,minZ,maxX,maxY,maxZ]; omit to derive from faces. */
  item(cls, sortBox) {
    const it = new Item(cls, sortBox);
    this.items.push(it);
    return it;
  }

  sorted() {
    return depthSort(this.items);
  }
}

/** True if A is entirely behind B along some axis (camera looks from +x+y+z). */
function isBehind(A, B) {
  return A[3] <= B[0] + EPS || A[4] <= B[1] + EPS || A[5] <= B[2] + EPS;
}

export function depthSort(items) {
  const n = items.length;
  const boxes = items.map((i) => i.bounds());
  const key = boxes.map((b) => b[0] + b[1] + b[2]);

  const edges = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);

  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const ab = isBehind(boxes[a], boxes[b]);
      // A contradiction means the solids interlock; no reliable order exists,
      // so emit no constraint and let the depth key decide.
      if (ab && !isBehind(boxes[b], boxes[a])) {
        edges[a].push(b);
        indeg[b]++;
      }
    }
  }

  // Kahn's algorithm, always taking the farthest available node so ties break
  // deterministically and cycles resolve sensibly.
  const out = [];
  const done = new Uint8Array(n);
  for (let step = 0; step < n; step++) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (done[i] || indeg[i] > 0) continue;
      if (best < 0 || key[i] < key[best]) best = i;
    }
    if (best < 0) {
      // Cycle: force the farthest remaining node.
      for (let i = 0; i < n; i++) {
        if (done[i]) continue;
        if (best < 0 || key[i] < key[best]) best = i;
      }
    }
    done[best] = 1;
    indeg[best] = -1;
    for (const b of edges[best]) if (indeg[b] > 0) indeg[b]--;
    out.push(items[best]);
  }
  return out;
}

// --- rendering -----------------------------------------------------------

function gradientId(defs, color, ao, dir) {
  const key = `g|${colorKey(color)}|${ao.toFixed(2)}|${dir}`;
  return defs.add(key, (id) => {
    const coords =
      dir === 'h' ? { x1: 0, y1: 0, x2: 1, y2: 0 } : { x1: 0, y1: 0, x2: 0, y2: 1 };
    const stops =
      el('stop', { offset: 0, 'stop-color': toCss(shade(color, 1 + ao * 0.4)) }) +
      el('stop', { offset: 0.42, 'stop-color': toCss(color) }) +
      el('stop', { offset: 1, 'stop-color': toCss(shade(color, 1 - ao)) });
    return el('linearGradient', { id, ...coords }, stops);
  });
}

/** Linear ramp from `color` at opacity o0 to fully transparent. Eave shadows,
 *  ground contact darkening, grime — anything that must fade out. */
function fadeId(defs, color, o0, o1, dir) {
  const key = `f|${colorKey(color)}|${o0}|${o1}|${dir}`;
  return defs.add(key, (id) => {
    const coords =
      dir === 'up' ? { x1: 0, y1: 1, x2: 0, y2: 0 } : { x1: 0, y1: 0, x2: 0, y2: 1 };
    const c = toCss(color);
    return el(
      'linearGradient',
      { id, ...coords },
      el('stop', { offset: 0, 'stop-color': c, 'stop-opacity': o0 }) +
        el('stop', { offset: 1, 'stop-color': c, 'stop-opacity': o1 })
    );
  });
}

/** Radial falloff — ground shadows and smoke puffs. */
function softId(defs, color, o0) {
  const key = `r|${colorKey(color)}|${o0}`;
  return defs.add(key, (id) => {
    const c = toCss(color);
    return el(
      'radialGradient',
      { id },
      el('stop', { offset: 0, 'stop-color': c, 'stop-opacity': o0 }) +
        el('stop', { offset: 0.55, 'stop-color': c, 'stop-opacity': o0 * 0.55 }) +
        el('stop', { offset: 1, 'stop-color': c, 'stop-opacity': 0 })
    );
  });
}

function patternId(defs, spec, color, basis) {
  const built = buildPattern(spec, color);
  if (!built) return null;
  const m = basisMatrix(basis).map((v) => num(v));
  const key = `p|${JSON.stringify(spec)}|${colorKey(color)}|${m.join(',')}`;
  return defs.add(key, (id) =>
    el(
      'pattern',
      {
        id,
        width: built.w,
        height: built.h,
        patternUnits: 'userSpaceOnUse',
        patternContentUnits: 'userSpaceOnUse',
        patternTransform: `matrix(${m.join(' ')})`,
      },
      built.content
    )
  );
}

function renderFace(f, defs, cp = 'bg-', textures = true) {
  const color = litFace(f.color, f.kind || 'top', f.lit ?? 1);
  const pts = pointsAttr(projectAll(f.pts));
  const ao = f.ao ?? 0.16;
  const cls = f.cls ? `${cp}${f.cls}` : null;

  let fill;
  if (f.soft) fill = `url(#${softId(defs, color, f.softOpacity ?? 0.34)})`;
  else if (f.fade) fill = `url(#${fadeId(defs, color, f.fade[0], f.fade[1], f.fadeDir || 'down')})`;
  else if (ao > 0) fill = `url(#${gradientId(defs, color, ao, f.gradDir || 'v')})`;
  else fill = toCss(color);

  let out = el('polygon', {
    points: pts,
    fill,
    class: cls,
    opacity: f.opacity,
    stroke: f.stroke ? toCss(f.stroke.color) : null,
    'stroke-width': f.stroke ? f.stroke.width : null,
    'stroke-linejoin': f.stroke ? 'round' : null,
  });

  if (textures && f.texture && f.basis) {
    const pid = patternId(defs, f.texture, color, f.basis);
    if (pid) {
      out += el('polygon', {
        points: pts,
        fill: `url(#${pid})`,
        class: cls ? `${cls} ${cp}tex` : `${cp}tex`,
        opacity: f.texture.opacity ?? 1,
      });
    }
  }
  return out;
}

/** Screen-space bounding box of a run of faces, as [minX, minY, maxX, maxY]. */
function screenBox(faces) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of faces) {
    for (const p of f.pts) {
      const s = project(p);
      if (s[0] < x0) x0 = s[0];
      if (s[0] > x1) x1 = s[0];
      if (s[1] < y0) y0 = s[1];
      if (s[1] > y1) y1 = s[1];
    }
  }
  return [x0, y0, x1, y1];
}

/** Split an item's faces into runs sharing one animation spec (by identity). */
function animGroups(faces) {
  const out = [];
  for (const f of faces) {
    const last = out[out.length - 1];
    if (last && last.anim === f.anim) last.faces.push(f);
    else out.push({ anim: f.anim, faces: [f] });
  }
  return out;
}

/**
 * Render a scene to a full SVG document.
 *
 * @returns {{svg:string, viewBox:number[], width:number, height:number,
 *            anchor:number[]}} `anchor` is where world (0,0,0) sits inside the
 * SVG, so a game can align the sprite to a tile without re-deriving the maths.
 */
export function render(scene, opts = {}) {
  const {
    scale = 1,
    padding = 8,
    background = null,
    idPrefix = 'b',
    classPrefix = 'bg-',
    css = true,
    animate = true,
    textures = true,
    title = null,
  } = opts;

  const items = scene.sorted();
  const defs = new Defs(idPrefix);
  const anim = new Anim(idPrefix, animate && css, classPrefix);

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const body = [];

  for (const it of items) {
    let chunk = '';
    for (const g of animGroups(it.faces)) {
      let inner = '';
      for (const f of g.faces) {
        for (const p of f.pts) {
          const s = project(p);
          if (s[0] < minX) minX = s[0];
          if (s[0] > maxX) maxX = s[0];
          if (s[1] < minY) minY = s[1];
          if (s[1] > maxY) maxY = s[1];
        }
        inner += renderFace(f, defs, classPrefix, textures);
      }
      // Hinged things name their pivot; anything else turns about its own
      // centre, which is what a growing smoke puff or a spinning fan wants.
      if (g.anim) {
        const b = screenBox(g.faces);
        const pivot = g.anim.pivot ? project(g.anim.pivot) : [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
        inner = anim.wrap(g.anim, inner, pivot);
      }
      chunk += inner;
    }
    body.push(el('g', { class: it.cls ? `${classPrefix}${it.cls}` : null }, chunk));
  }

  const vx = minX - padding;
  const vy = minY - padding;
  const vw = maxX - minX + padding * 2;
  const vh = maxY - minY + padding * 2;

  const styleTag = css
    ? el('style', {}, `.${classPrefix}tex{pointer-events:none}` + anim.css())
    : '';
  const bg = background
    ? el('rect', { x: vx, y: vy, width: vw, height: vh, fill: toCss(background) })
    : '';

  const svg = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `${num(vx)} ${num(vy)} ${num(vw)} ${num(vh)}`,
      width: num(vw * scale),
      height: num(vh * scale),
      'shape-rendering': 'geometricPrecision',
    },
    (title ? el('title', {}, title) : '') + styleTag + defs.render() + bg + body.join('')
  );

  const origin = project([0, 0, 0]);
  return {
    svg,
    viewBox: [vx, vy, vw, vh],
    width: vw * scale,
    height: vh * scale,
    anchor: [origin[0] - vx, origin[1] - vy],
  };
}
