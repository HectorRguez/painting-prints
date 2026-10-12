import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {build} from 'esbuild';
import vm from 'node:vm';
import {createArtKernels} from '../src/wasm/art-kernels.js';
const binary=await readFile(new URL('../public/engines/art-kernels-v1.wasm',import.meta.url));

test('the accelerated map still matches the previously published cached SVG exactly',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'painting-wasm-'));
  try {
    const file=join(directory,'map.mjs');
    await build({entryPoints:[new URL('../src/engines/map-worker.ts',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',outfile:file});
    const {generateMap}=await import(pathToFileURL(file));
    const painting=JSON.parse(gunzipSync(await readFile(new URL('../public/cache/maps-v4/0.json.gz',import.meta.url))));
    let hash=2166136261;
    for(const char of painting.seed)hash=Math.imul(hash^char.charCodeAt(0),16777619);
    assert.equal(generateMap(hash>>>0||1,await createArtKernels(binary)),painting.svg);
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('the accelerated fish preserves complete generated SVGs and random state',async()=>{
  const source=await readFile(new URL('../public/upstream/fishdraw/fishdraw.js',import.meta.url),'utf8');
  for(const seed of ['profile-v1','flower-perf-1']) {
    const kernels=await createArtKernels(binary);
    const generate=accelerated=>{
      const context=vm.createContext({Math,kernels});
      vm.runInContext(source,context);
      if(accelerated)vm.runInContext('seg_isect_poly=kernels.polygonIntersections',context);
      return vm.runInContext(`jsr=str_to_seed(${JSON.stringify(seed)});const name=binomen();jsr=str_to_seed(name);const svg=draw_svg(cleanup(reframe(fish(generate_params()),20,'')));JSON.stringify({svg,jsr});`,context);
    };
    assert.equal(generate(true),generate(false));
  }
});
