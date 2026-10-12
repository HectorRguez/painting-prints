import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createArtKernels} from '../src/generators/shared/wasm/host.js';
const binary=await readFile(new URL('../public/generators/shared/kernels-v1.wasm',import.meta.url));
let state=12345;
const random=()=>((state=Math.imul(state,1664525)+1013904223>>>0)/4294967296);

function flowerContext(source) {
  const canvas=()=>{
    const image={width:0,height:0,pixels:new Uint8ClampedArray(512*512*4)};
    const context={canvas:image,fillStyle:'',fillRect(x,y){
      if(x>=image.width||y>=image.height)return;
      const channels=this.fillStyle.slice(5,-1).split(',').map(Number);
      image.pixels.set([channels[0],channels[1],channels[2],255],(y*image.width+x)*4);
    }};
    image.getContext=()=>context;
    return image;
  };
  const sandbox={Math:Object.create(Math),console:{log(){}},btoa:s=>Buffer.from(s).toString('base64'),document:{createElement:canvas},location:{href:'http://localhost/?seed=wasm-parity'}};
  sandbox.window=sandbox;
  const context=vm.createContext(sandbox);
  vm.runInContext(source.replace('  var perlin;','  var perlin; this.perlinValues=function(){this.noise(0);return perlin;};'),context);
  return context;
}
const flowerSource=await readFile(new URL('../src/generators/flowers/upstream/main.js',import.meta.url),'utf8');

test('WASM flower filters preserve every channel and alpha byte',async()=>{
  const kernels=await createArtKernels(binary),flowers=flowerContext(flowerSource);
  const table=flowers.Noise.perlinValues();
  for(const wispy of [true,false])for(const resolution of [1,3]) {
    const width=47,height=39,data=Uint8ClampedArray.from({length:width*height*4},()=>random()*255);
    const expected=data.slice(),filter=wispy?flowers.Filter.wispy:flowers.Filter.fade;
    for(let i=0;i<expected.length;i+=4){if(expected[i+3]===0)continue;const x=(i/4)%width/resolution,y=Math.floor(i/4/width)/resolution;expected.set(filter(x,y,...expected.slice(i,i+4)),i);}
    kernels.filterFlower({width,height,data},table,wispy,resolution);
    assert.deepEqual(data,expected);
  }
});

test('WASM paper preserves the original background pixels and subsequent random state',async()=>{
  const kernels=await createArtKernels(binary),flowers=flowerContext(flowerSource);
  const table=flowers.Noise.perlinValues();
  for(const options of [{col:[1,.99,.9],tex:10,spr:0},{col:[.98,.91,.74]},{tex:35,spr:2}]){
    const seed=flowers.Prng.s;
    const expected=flowers.paper(options);
    const actual=kernels.flowerPaper(table,seed,options);
    assert.equal(actual.state,flowers.Prng.s);
    assert.deepEqual(actual.pixels,expected.pixels);
  }
});
