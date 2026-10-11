# Artwork and upstream sources

Each artwork page links to its original author above the image.

- **Nonflowers** and **Shan Shui** — Lingdong Huang, MIT. Original source and licenses are in `public/upstream/`.
- **Fishdraw** — Lingdong Huang, MIT. Snapshot `a514372de1d05b4aa32a9e35aadec9a5299689a2`; original source and license in `public/upstream/fishdraw/`. Our worker supplies a seed and our presentation makes the paper optional.
- **A View on Galiano Island** — Lingdong Huang. The upstream repository has no license file. Its source is not redistributed here; the browser fetches the original `main.js` from the author's GitHub repository at `b35a8c905a0312e1721c0cd4fad8e8c8110ca061`. This page requires access to raw.githubusercontent.com. Our adapter captures its SVG output and varies its random seed. The original title and signature remain in the drawing.
- **Mapgen4**, including dual-mesh — Amit Patel / Red Blob Games, Apache-2.0. Snapshot `c1d8cb018a11a8b9e17d59233c36c176429d37eb`; unchanged source and licenses in `vendor/mapgen4/`. Our build extracts the constraint generator without its editor, and our worker renders the original terrain and river results as SVG contours. This is a line-art adaptation, not the original Mapgen4 renderer.

The landscape's transparent version composites its white occlusion shapes before converting the finished grayscale image to ink opacity. This preserves hidden lines. Original flower paper is unchanged and available with Add background.
