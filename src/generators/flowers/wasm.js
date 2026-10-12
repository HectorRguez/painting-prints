import { kernelMemory } from '../shared/wasm/memory.js';

function axes(length,frequency,resolution) {
  const axis=new Float64Array(length*8);
  for(let p=0;p<length;p++) {
    const position=p/resolution*frequency;
    let integer=Math.floor(position),fraction=position-integer;
    for(let octave=0;octave<4;octave++) {
      const offset=p*8+octave*2;
      axis[offset]=integer;axis[offset+1]=.5*(1-Math.cos(fraction*Math.PI));
      integer<<=1;fraction*=2;
      if(fraction>=1){integer++;fraction--;}
    }
  }
  return axis;
}

export function createFlowerKernels(api) {
  const { base, ensure } = kernelMemory(api);
  return {
    flowerPaper(table,seed,{col=[.98,.91,.74],tex=20,spr=1}={}) {
      const pixels=base,tableOffset=pixels+512*512*4,axis=tableOffset+32768,speckles=axis+257*64;
      ensure(speckles+257*64-base);
      const buffer=api.memory.buffer;
      new Float64Array(buffer,tableOffset,4096).set(table);
      new Float64Array(buffer,axis,257*8).set(axes(257,.1,1));
      new Float64Array(buffer,speckles,257*8).set(axes(257,.04,1));
      const state=api.flowerPaper(pixels,tableOffset,axis,speckles,seed,...col,tex,spr);
      return {pixels:new Uint8ClampedArray(buffer,pixels,512*512*4).slice(),state};
    },
    filterFlower(image, table, wispy, resolution) {
      const {width,height,data}=image;
      const pixelBytes=data.length,tableOffset=Math.ceil((base+pixelBytes)/8)*8;
      const x=tableOffset+32768,y=x+width*64,x2=y+height*64,y2=x2+width*64;
      ensure(y2+height*64-base);
      const memory=new Uint8Array(api.memory.buffer);
      memory.set(data,base);
      new Float64Array(api.memory.buffer,tableOffset,4096).set(table);
      const writeAxis=(offset,length,frequency)=>new Float64Array(api.memory.buffer,offset,length*8).set(axes(length,frequency,resolution));
      writeAxis(x,width,wispy?.2:.01);writeAxis(y,height,wispy?.2:.01);
      if(wispy){writeAxis(x2,width,.5);writeAxis(y2,height,.5);}
      api.flowerFilter(base,width,height,tableOffset,x,y,x2,y2,Number(wispy));
      data.set(memory.subarray(base,base+pixelBytes));
    },
  };
}
