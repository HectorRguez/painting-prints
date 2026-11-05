# Ribbons

Deterministic flowing bands generated from an analytic vector field. The four
families—sweep, meander, eddy, and confluence—are parameter distributions, not
stored outlines. Every centerline, tapered boundary, and interior stripe is
computed from the seed and an explicit parameter object.

```js
import { ribbonParameters, buildRibbons, generateRibbons } from './generate.js';

const parameters = ribbonParameters('a-flow');
const geometry = buildRibbons('a-flow', {
  family: 'eddy',
  field: { anisotropy: 1.4 },
  ribbon: { width: .07, spacing: .03, count: 20 },
});
const painting = generateRibbons('a-flow', geometry.parameters);
```

`buildRibbons` returns normalized centerlines, widths, normals, polygons,
print-coordinate paths, resolved parameters, and acceptance diagnostics.
`generateRibbons` returns self-contained SVG plus parameters/metrics. Identical
seed, overrides, and artwork revision reproduce the geometry. The app's seed
URLs use the default parameter distribution; custom overrides are a JavaScript
API and are not serialized into URL controls.

The worker has no numerical kernel or added runtime dependency. Flat SVG paths
work with the existing line renderer and vector exports. Colors remain intact
with `whiteToAlpha: false`; the paper background is optional.

See [the research, equations, parameter ranges, review, and limitations](../../../docs/ribbons-review.md).
