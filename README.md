# Painting

A single, minimal page for generating and downloading flower and landscape paintings.

**Live:** https://hectorrguez.github.io/painting-prints/

The interface follows the warm background, monospace text, serif title and simple outlined controls of [Hector's homepage](https://numbda.cs.tsinghua.edu.cn/~hector/).

Choose **Flowers** or **Landscapes**, then **Regenerate** or **Download**.

- Flowers download directly as a one-page portrait A4 PDF: a 180 mm square centered on white paper. The plant is rendered at 1800 × 1800 pixels throughout its layers, without the upstream rounded mask.
- Landscapes offer A4 or A3 only when downloading. Both use landscape orientation, at least 10 mm margins, and the same complete composition. The preview remains SVG; the PDF is rendered at 300 dpi with the original paper texture and multiply blending.
- Each type retains its last painting when switching. Regenerating replaces only the current type.
- All generation and PDF creation run locally in the browser. There is no backend, tracking, upload, account, or API key.

Print the downloaded PDF at **actual size / 100%** to retain the intended placement.

## Local development

Requires Node.js 22.12+ (or 20.19+) and npm.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

GitHub Pages is published from `main` by `.github/workflows/pages.yml`. The Pages source must be **GitHub Actions**. Relative asset paths allow hosting under `/painting-prints/` or another repository path.

## Upstream artwork and attribution

The procedural artwork is by **Lingdong Huang**, copyright 2018, used under the MIT license.

| Project | Vendored revision | Original source |
| --- | --- | --- |
| [Nonflowers](https://github.com/LingDong-/nonflowers) | `03b653d220f16c6bed7ea9c7edc852f7e91846cb` | `public/upstream/nonflowers/main.js` |
| [Shan Shui](https://github.com/LingDong-/shan-shui-inf) | `9f754d2b2e73495db7883d4d4055a7b0903b0454` | `public/upstream/shan-shui-inf/index.html` |

Both original snapshots and their licenses are preserved intact. `scripts/prepare-engines.mjs` extracts Shan Shui's drawing scripts, omitting its old scrolling interface. The adapters in `public/engines/` provide print framing and higher-resolution flower layers. They run in separate hidden frames because the upstream generators replace `Math.random` and extend built-in prototypes.

PDF generation uses [jsPDF](https://github.com/parallax/jsPDF), under the MIT license. Its license is served at `licenses/jspdf.txt`.

The wrapper and adapters are also MIT licensed; see `LICENSE`.
