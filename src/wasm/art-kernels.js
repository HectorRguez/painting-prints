// Shared worker-local WASM instance. All buffers are bounded by the current
// job and released when its worker terminates. No cross-origin isolation needed.
export async function loadArtKernels(url) {
  const response=await fetch(url);
  if(!response.ok)throw new Error('Could not load the drawing engine');
  return createArtKernels(await response.arrayBuffer());
}
export async function createArtKernels(bytes) {
  const {instance}=await WebAssembly.instantiate(bytes);
  const api=instance.exports;
  const base=65536;
  function ensure(bytes) {
    const shortage=base+bytes-api.memory.buffer.byteLength;
    if(shortage>0)api.memory.grow(Math.ceil(shortage/65536));
  }
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
