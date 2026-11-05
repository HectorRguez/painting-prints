import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
export async function prepare(output) {
  await build({ entryPoints: [fileURLToPath(new URL('./worker.js', import.meta.url))],
    bundle: true, format: 'iife', minify: true,
    outfile: fileURLToPath(new URL('worker.js', output)) });
}
