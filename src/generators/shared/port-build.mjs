import { build } from 'esbuild';
import { copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Each port ships only its own worker and numeric kernel, loaded on demand.
export async function preparePort(source, output, licenses = ['LICENSE']) {
  const root = new URL('../../../', source);
  execFileSync(process.execPath, [fileURLToPath(new URL('node_modules/assemblyscript/bin/asc.js', root)),
    fileURLToPath(new URL('kernel.ts', source)), '-o', fileURLToPath(new URL('engine.wasm', output)),
    '--optimizeLevel', '3', '--runtime', 'stub', '--initialMemory', '8'], { stdio: 'inherit' });
  await build({ entryPoints: [fileURLToPath(new URL('worker.js', source))], bundle: true,
    format: 'iife', minify: true, outfile: fileURLToPath(new URL('worker.js', output)),
  });
  for (const name of licenses) await copyFile(new URL(`upstream/${name}`, source), new URL(name, output));
}
