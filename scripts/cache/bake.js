import { gzipSync, zipSync, strToU8 } from '../../node_modules/fflate/esm/browser.js';
const base = new URL('../../public/', import.meta.url);
const files = {}, manifest = {};
let frame;
function generate(mode, seed) {
  return new Promise((resolve, reject) => {
    frame = document.createElement('iframe'); frame.hidden = true;
    const page = ['flowers', 'landscapes'].includes(mode) ? mode : 'vector';
    frame.src = new URL(`engines/${page}.html?mode=${mode}&seed=${seed}`, base);
    const timer = setTimeout(() => finish(new Error('Generation timed out')), 180000);
    function finish(error, painting) {
      clearTimeout(timer); removeEventListener('message', receive); frame.remove();
      error ? reject(error) : resolve(painting);
    }
    function receive(event) {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
      if (event.data?.type === 'painting-ready') finish(null, event.data);
      else if (event.data?.type === 'painting-error') finish(new Error(event.data.message || 'Generation failed'));
    }
    addEventListener('message', receive); document.body.append(frame);
  });
}
document.querySelector('#start').onclick=async () => {
  document.querySelector('#start').disabled=true;
  try {
    for(const mode of ['flowers','landscapes','fish','maps']) {
      manifest[mode]=[];
      for(let i=0;i<10;i++) {
        document.querySelector('#progress').textContent=`Preparing ${mode} ${i+1}/10`;
        const seed=`painting-stock-v1-${mode}-${i}`;
        const painting=await generate(mode,seed);
        const stem=`${mode}${mode==="maps"?"-v3":["fish","landscapes"].includes(mode)?"-v2":""}/${i}`;
        files[`${stem}.json.gz`]=gzipSync(strToU8(JSON.stringify(painting)),{level:6});
        manifest[mode].push({artRevision:painting.artRevision||1,mode,seed:painting.seed,width:painting.width,height:painting.height,previewWidth:painting.previewWidth,asset:`${stem}.json.gz`});
      }
    }
    files['manifest.json']=strToU8(JSON.stringify(manifest));
    document.querySelector('#progress').textContent=`Ready: 40 paintings, ${Math.round(Object.values(files).reduce((sum,v)=>sum+v.length,0)/1048576)} MB`;
    document.querySelector('#save').disabled=false;
  } catch(error) {document.querySelector('#progress').textContent=String(error);console.error(error);}
};
document.querySelector('#save').onclick=()=>{
  const url=URL.createObjectURL(new Blob([zipSync(files,{level:0})],{type:'application/zip'}));
  const a=document.createElement('a');a.href=url;a.download='painting-stock-v1.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
};
