# Artwork and upstream sources

Each artwork page links to its original author below the image.

- **Nonflowers** and **Shan Shui** — Lingdong Huang, MIT. Original source and licenses are in `public/upstream/`.
- **Fishdraw** — Lingdong Huang, MIT. Snapshot `a514372de1d05b4aa32a9e35aadec9a5299689a2`; original source and license in `public/upstream/fishdraw/`. Our worker supplies a seed and our presentation makes the paper optional.
- **Mapgen4**, including dual-mesh — Amit Patel / Red Blob Games, Apache-2.0. Snapshot `c1d8cb018a11a8b9e17d59233c36c176429d37eb`; unchanged source and licenses in `vendor/mapgen4/`. Our build extracts the constraint generator without its editor. The worker follows the upstream defaults: fixed mesh seed 12345, spacing 5.5 with the original point serialization, island 0.5, wind angle 0, tilt 0 and mountain height 50. It uses the original folded terrain mesh with a vector adaptation of the hybrid oblique projection in upstream `render.ts`. Rivers sample the original barycentric curve and flow-dependent widths, draped over the terrain; hatching follows the original light direction and slope lighting. It emits visible coastlines, mountain silhouettes, creases, rivers and slope hatching as SVG paths, using triangle-based hidden-line removal. This is a 3D line-art adaptation, not a pixel-identical reproduction of the original WebGL lighting and biome shaders.

The landscape's transparent version composites its white occlusion shapes before converting the finished grayscale image to ink opacity. This preserves hidden lines. Original flower paper is unchanged and available with Add background.

Interface controls use [Drawably](https://github.com/danielwh2/drawably) by Daniel Belyi, MIT, installed from npm.

## Original project dates shown in the caption

The caption uses the original repository date (creation and first commit agree on the day), except Mapgen4, whose author documents an earlier public project date. Verified 12 October 2026. This is a source record; the interface contains only one author/date caption.

| Project | Date | Evidence |
| --- | --- | --- |
| Nonflowers | 12 February 2018 | [Original commit](https://github.com/LingDong-/nonflowers/commit/7c54d974dbcaa415f2b9f406b86968b75226bfca) |
| Shan Shui | 30 January 2018 | [Original commit](https://github.com/LingDong-/shan-shui-inf/commit/9bbbbbd3353447ea1dbf4fbff0837948903ccada) |
| Fishdraw | 11 August 2021 | [Original commit](https://github.com/LingDong-/fishdraw/commit/2a5ef1dcc467883b424ad9276a4500162e12065d) |
| Mapgen4 | 20 July 2018 | [Author's project page: Created 20 Jul 2018](https://www.redblobgames.com/maps/mapgen4/) |

SVG ink measurement, landscape preview rasterization, and export rendering use [resvg-wasm](https://github.com/thx/resvg-js), MPL-2.0, unmodified from npm. These operations run inside Web Workers; cached sources and SVG exports retain the original geometry. Flowers and landscapes use the original generator code with OffscreenCanvas adapters in a dedicated worker.

Generation also uses our WebAssembly numeric kernels in `src/wasm/`, compiled
with AssemblyScript (Apache-2.0). Flower noise, paper texture, PRNG, filtering and
fish intersection formulas are adapted from the vendored MIT-licensed Nonflowers
and Fishdraw sources by Lingdong Huang. Map interval clipping is our vector
renderer implementation. The upstream source snapshots remain unchanged; only a
build-generated Nonflowers adapter exposes its existing noise table. See
[engine implementation and measurements](docs/generation-engine.md).
