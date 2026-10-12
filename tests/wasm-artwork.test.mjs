import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createArtKernels} from '../src/generators/shared/wasm/host.js';
const binary=await readFile(new URL('../public/generators/shared/kernels-v1.wasm',import.meta.url));

test('the accelerated fish preserves complete generated SVGs and random state',async()=>{
  const source=await readFile(new URL('../src/generators/fish/upstream/fishdraw.js',import.meta.url),'utf8');
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
