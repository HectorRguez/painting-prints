# Painting

A minimal procedural-art gallery with Flowers, Landscapes, Cityscapes,
Houses, and Leaf Skeletons. Create a drawing, explore it, and download it for print.

**Live:** https://hectorrguez.github.io/painting-prints/

## Credits

| Contribution | Author | Original project |
| --- | --- | --- |
| Flowers | Lingdong Huang | [nonflowers](https://github.com/LingDong-/nonflowers) |
| Landscapes | Lingdong Huang | [shan-shui-inf](https://github.com/LingDong-/shan-shui-inf) |
| Cityscapes | Michael Fogleman | [ln](https://github.com/fogleman/ln) |
| Houses | Matthias Schermann (N3R01N) | [iso-building-generator](https://github.com/N3R01N/iso-building-generator) |
| Leaf Skeletons | Painting | [Original generator and botanical references](src/generators/leaves/README.md) |
| Interface controls, icons and typography | Daniel Belyi | [Drawably](https://github.com/danielwh2/drawably) |

Original source snapshots and licenses are retained in each generator's
`upstream/` directory; Drawably's license ships with its dependency.

## Sharing and rendering

Every displayed artwork writes its seed to the URL, for example
`buildings/?seed=painting-stock-v1-buildings-0`. Sharing or reopening that URL loads that
exact cached painting or regenerates it from the same seed.

Leaf Skeletons generates five families of botanical outlines with connected
vein networks. Its first drawing is generated on demand, then cached in the
browser; SVG exports preserve the full vein geometry.
