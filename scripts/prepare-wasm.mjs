import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const root=new URL('../',import.meta.url);
execFileSync(process.execPath,[fileURLToPath(new URL('node_modules/assemblyscript/bin/asc.js',root)),
  'src/wasm/art-kernels.ts','--outFile','public/engines/art-kernels-v1.wasm','--optimizeLevel','3','--shrinkLevel','0',
  '--runtime','stub','--initialMemory','2'],{cwd:fileURLToPath(root),stdio:'inherit'});
await build({entryPoints:[fileURLToPath(new URL('src/wasm/art-kernels.js',root))],bundle:true,format:'iife',globalName:'ArtKernels',
  outfile:fileURLToPath(new URL('public/engines/art-kernels.js',root)),minify:true});
