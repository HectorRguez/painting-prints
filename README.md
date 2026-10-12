# Painting

A minimal procedural-art gallery with Flowers, Landscapes, Fish, and Maps.

**Live:** https://hectorrguez.github.io/painting-prints/

The interface uses Drawably controls and a transparent hand-drawn favicon. Each style keeps its latest image. First visits use a bundled collection of ten paintings per style; Regenerate always creates a fresh image.

Every displayed artwork writes its seed to the URL, for example `fish/?seed=painting-stock-v1-fish-0`. Sharing or reopening that URL loads that exact cached painting or regenerates it from the same seed. Regenerate creates a new URL, and browser Back/Forward restores prior seeds. Artwork framing adapts to the device; zoom and pan are not part of the link.

Generation, SVG preparation, centering, and export rendering run in Web Workers. Landscapes use a 4096-pixel-wide raster preview for smooth zooming; their cached source and SVG downloads remain vector. Other previews use SVG (flowers preserve their original raster artwork inside SVG). Landscapes display a panorama while exports crop the central composition. Downloads support SVG, PNG, and PDF, with A4/A3 settings and optional paper backgrounds; supported phones can share files directly.

Phones and narrow layouts show only the landscape's central export crop as a 2048-pixel-wide image. Desktop keeps the panorama and can zoom out to fit its full width. The download control always uses the same Download label and icon, including when the phone opens its native file sheet.

## Local development

Run `npm ci`, then `npm run dev`. Use `npm test` for checks and `npm run build` for the GitHub Pages output. Pushing to `main` runs the build/test/publish workflow.

See [cache instructions](scripts/cache/README.md) to rebuild the starter artwork.

## Artwork and attribution

Flowers, landscapes, and fish are based on work by **Lingdong Huang**. Maps are adapted from **Amit Patel / Red Blob Games**. Every page links to the original repository below its drawing. See [THIRD_PARTY.md](THIRD_PARTY.md) for source snapshots, licenses, modifications, and interface dependencies.
