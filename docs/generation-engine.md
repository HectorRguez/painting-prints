# Generation engine

The gallery uses a hybrid JavaScript/WebAssembly engine. The procedural rules,
seed handling, canvas drawing, SVG assembly and interface remain JavaScript.
The intensive numeric loops run in a 3.7 KB WebAssembly module compiled from
AssemblyScript, inside the existing cancellable workers.

- **Flowers:** batched paper texture generation and full-resolution fade/wispy
  filters. Paper colors, speckles, per-pixel rounding and PRNG state are preserved.
  Cosine tables use the browser's original `Math.cos` to preserve exact pixels.
- **Fish:** line/polygon intersection loops. The original topology, stable
  intersection ordering, drawing rules and random sequence are unchanged.
- **Maps:** spatial lookup and hidden-line interval subtraction. Original terrain
  generation, river draping and SVG coordinates are preserved.
- **Landscapes:** generation remains JavaScript; preview rendering and exports
  already run through resvg WebAssembly. In the baseline sample, preview
  rasterization (5.49 s) took longer than generation (1.47 s), so porting the
  generator alone would not address most of that wait.

No server, GPU, SharedArrayBuffer, isolation headers, or extra browser permissions
are required. Cached previews open directly without loading this engine. Fresh
workers load it only for Flowers, Fish and Maps. Cache/artwork revisions are
unchanged because the output remains identical.

## Measurements

Local Chromium browser, 12 October 2026. Means of three paired seeds, alternating
which engine runs first, with a fresh worker each time. Times include worker
startup and engine loading but exclude preview preparation and downloads.

| Style | JavaScript | WebAssembly hybrid | Less generation time |
| --- | ---: | ---: | ---: |
| Flowers | 11.805 s | 9.507 s | 19% |
| Maps | 2.676 s | 2.043 s | 24% |
| Fish | 0.463 s | 0.313 s | 32% |

All nine pairs produced identical SHA-256 hashes of their complete output,
including both flower PNGs. [Raw timings and hashes](engine-benchmark.json).
These are small local samples, not universal speed guarantees: timings varied
substantially, and one fish run was slower with WASM due to startup variability.
The flower filter alone produced little benefit; batching paper generation made
its larger improvement. Canvas drawing and PNG encoding still take time.

## Reproduce and maintain

1. Run `npm ci`, then `npm run prepare-engines`.
2. Serve the repository with a local HTTP server.
3. Open `scripts/benchmark-engines.html` and run the paired comparison while other
   CPU-heavy tasks are idle. The tool explicitly requests the JavaScript reference
   path through a worker message; the normal app always selects WASM.
4. Run `npm test` and `npm run build`. Both build the WASM binary from source; no
   external Rust/C++ toolchain or downloaded prebuilt runtime is needed.

The tests cover byte-for-byte flower filters and paper (including subsequent
random state), full fish SVG equivalence, map equivalence against an existing
published SVG, polygon edge cases, terrain depth clipping, and memory growth.

Source: `src/wasm/art-kernels.ts`; host bridge: `src/wasm/art-kernels.js`.
The original upstream files remain untouched. The build exposes Nonflowers'
existing noise table in a generated adapter only.

References: [WebAssembly architecture](https://webassembly.org/docs/faq/),
[AssemblyScript compiler](https://www.assemblyscript.org/compiler.html).
