import { copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

export async function prepare(output) {
  const source = new URL('./', import.meta.url);
  const root = new URL('../../../', source);
  await copyFile(new URL('canvas.js', source), new URL('canvas.js', output));
  execFileSync(process.execPath, [fileURLToPath(new URL('node_modules/assemblyscript/bin/asc.js', root)),
    fileURLToPath(new URL('wasm/kernels.ts', source)), '--outFile', fileURLToPath(new URL('kernels-v1.wasm', output)),
    '--optimizeLevel', '3', '--shrinkLevel', '0', '--runtime', 'stub', '--initialMemory', '2',
  ], { stdio: 'inherit' });
  await build({ entryPoints: [fileURLToPath(new URL('wasm/host.js', source))], bundle: true,
    format: 'iife', globalName: 'ArtKernels', minify: true, outfile: fileURLToPath(new URL('wasm.js', output)) });
}
