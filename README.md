# Painting

A minimal procedural-art gallery with Flowers, Landscapes, Cityscapes,
and Houses. Create a drawing, explore it, and download it for print.

**Live:** https://hectorrguez.github.io/painting-prints/

## Credits

The gallery brings together work by these authors. Each artwork also links to its
original repository beneath the image.

| Contribution | Author | Original project |
| --- | --- | --- |
| Flowers | Lingdong Huang | [nonflowers](https://github.com/LingDong-/nonflowers) |
| Landscapes | Lingdong Huang | [shan-shui-inf](https://github.com/LingDong-/shan-shui-inf) |
| Cityscapes | Michael Fogleman | [ln](https://github.com/fogleman/ln) |
| Houses | Matthias Schermann (N3R01N) | [iso-building-generator](https://github.com/N3R01N/iso-building-generator) |
| Interface controls, icons and typography | Daniel Belyi | [Drawably](https://github.com/danielwh2/drawably) |

Original source snapshots and licenses are retained in each generator's
`upstream/` directory; Drawably's license ships with its dependency.

## Sharing and rendering

Every displayed artwork writes its seed to the URL, for example
`buildings/?seed=painting-stock-v1-buildings-0`. Sharing or reopening that URL loads that
exact cached painting or regenerates it from the same seed.

Every generator lives in `src/generators/<style>/`, with its source snapshot,
license, adapter and build. Cityscapes compiles Fogleman's Go engine;
The Houses generator combines original JavaScript with WASM kernels. These are curated
adaptations, not pixel-identical ports of every original demo. Both render
directly to canvas in workers and preserve SVG export sources. Every gallery
style has ten cached first-load previews; Create always generates a new seed.

## Development

Development requires Node 22+ and Go 1.27.2 (or set `PAINTING_GO` to its binary).
Run `npm ci`, then `npm run dev`. `npm test` rebuilds the workers and checks their
output; `npm run build` creates the GitHub Pages subpages. The build downloads no
upstream generators. See each generator's README for its port and license details.
