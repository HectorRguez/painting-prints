import { copyFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const source = new URL('./', import.meta.url);
// Extract the original constraint generator in memory. Never write patched
// upstream source or temporary TypeScript files into the repository.
export function buildMap(options) {
  return build({
    entryPoints: [fileURLToPath(new URL('generate.ts', source))],
    bundle: true,
    ...options,
    plugins: [{
      name: 'mapgen-constraints',
      setup(builder) {
        builder.onResolve({ filter: /^mapgen-constraints$/ }, () => ({
          path: fileURLToPath(new URL('upstream/painting.ts', source)), namespace: 'constraints',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'constraints' }, async ({ path }) => {
          const contents = await readFile(path, 'utf8');
          const marker = 'let heightMap = new Generator();';
          if (contents.split(marker).length !== 2) throw new Error('Unexpected map constraint source');
          return { contents: contents.split(marker)[0] + '\nexport { Generator };\n', loader: 'ts', resolveDir: dirname(path) };
        });
      },
    }],
  });
}

export async function prepare(output) {
  await buildMap({
    entryPoints: [fileURLToPath(new URL('worker.ts', source))],
    outfile: fileURLToPath(new URL('worker.js', output)),
    format: 'iife', minify: true, legalComments: 'eof',
  });
  await copyFile(new URL('upstream/LICENSE', source), new URL('LICENSE', output));
  await copyFile(new URL('upstream/dual-mesh/LICENSE', source), new URL('dual-mesh-LICENSE', output));
}
