import { kernelMemory } from '../shared/wasm/memory.js';

export function createFishKernels(api) {
  const { base, ensure } = kernelMemory(api);
  return {
    polygonIntersections(x0,y0,x1,y1,polygon,ray=false) {
      const count=polygon.length,out=base+count*16;
      ensure(count*56);
      const view=new Float64Array(api.memory.buffer);
      for(let i=0;i<count;i++){view[base/8+i*2]=polygon[i][0];view[base/8+i*2+1]=polygon[i][1];}
      const n=api.polygonIntersections(x0,y0,x1,y1,base,count,out,Number(ray));
      const result=[];
      for(let i=0;i<n;i++){
        const p=out/8+i*5;
        result.push({t:view[p],s:view[p+1],side:view[p+2],other:null,xy:[view[p+3],view[p+4]]});
      }
      return result.sort((a,b)=>a.t-b.t);
    },
  };
}
