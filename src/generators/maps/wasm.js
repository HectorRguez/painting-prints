import { kernelMemory } from '../shared/wasm/memory.js';

export function createMapKernels(api) {
  const { base, ensure } = kernelMemory(api);
  return {
    terrainClipper(triangles) {
      const ranges=triangles.map(t=>[
        Math.floor(Math.min(t[0][0],t[1][0],t[2][0])/24),Math.floor(Math.min(t[0][1],t[1][1],t[2][1])/24),
        Math.floor(Math.max(t[0][0],t[1][0],t[2][0])/24),Math.floor(Math.max(t[0][1],t[1][1],t[2][1])/24)]);
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const r of ranges){minX=Math.min(minX,r[0]);minY=Math.min(minY,r[1]);maxX=Math.max(maxX,r[2]);maxY=Math.max(maxY,r[3]);}
      if(!triangles.length)return ()=>[[0,1]];
      const columns=maxX-minX+1,rows=maxY-minY+1;
      const cells=Array.from({length:columns*rows},()=>[]);
      for(let i=0;i<ranges.length;i++) {
        const [x0,y0,x1,y1]=ranges[i];
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)cells[(y-minY)*columns+x-minX].push(i);
      }
      const total=cells.reduce((n,c)=>n+c.length,0);
      const faces=base,grid=faces+triangles.length*80,indices=grid+cells.length*8,marks=indices+total*4;
      const output=Math.ceil((marks+triangles.length*4)/8)*8;
      ensure(output-base+(triangles.length+1)*16);
      const f64=new Float64Array(api.memory.buffer),i32=new Int32Array(api.memory.buffer);
      for(let i=0;i<triangles.length;i++) {
        const [a,b,c]=triangles[i],by=b[1]-c[1],bx=c[0]-b[0],cy=c[1]-a[1],cx=a[0]-c[0];
        f64.set([by,bx,cy,cx,c[0],c[1],by*(a[0]-c[0])+bx*(a[1]-c[1]),a[2],b[2],c[2]],faces/8+i*10);
      }
      let offset=0;
      for(let i=0;i<cells.length;i++) {
        i32[grid/4+i*2]=offset;
        i32.set(cells[i],indices/4+offset);offset+=cells[i].length;
        i32[grid/4+i*2+1]=offset;
      }
      i32.fill(0,marks/4,marks/4+triangles.length);
      let tag=0;
      // The returned views are consumed immediately, before the next call.
      return (a,b)=>{
        const count=api.visibleIntervals(...a,...b,faces,grid,indices,marks,++tag,columns,rows,minX,minY,output);
        const intervals=[];
        for(let i=0;i<count;i++)intervals.push([f64[output/8+i*2],f64[output/8+i*2+1]]);
        return intervals;
      };
    },
  };
}
