// ponytail: tiny worker pool — N = cores (cap 4), round-robin, fallback to null if file://
const HW = Math.min(typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4, 4);
let pool = [];
let rr = 0;
let seq = 0;
const inflight = new Map();

function makeWorker(){
  try{
    // ponytail: try import.meta.url first (ES module), fallback to page-relative path
    let w=null;
    try{ w = new Worker(new URL('./workers/game.worker.js', import.meta.url)); }
    catch(e){ w = new Worker('src/workers/game.worker.js'); }
    w.onmessage = e=>{
      const p = inflight.get(e.data.id);
      if(!p) return;
      inflight.delete(e.data.id);
      if(e.data.error) p.rej(new Error(e.data.error)); else p.res(e.data);
    };
    w.onerror = err=>{
      inflight.forEach((p, id)=>{ if(p.w===w){ inflight.delete(id); p.rej(new Error(err.message||'worker error')); }});
    };
    return w;
  }catch(e){ return null; }
}

export function getWorkers(){
  if(pool.length) return pool;
  // don't spawn on file:// where Workers are blocked
  if(typeof location!=='undefined' && location.protocol==='file:') return [];
  for(let i=0;i<HW;i++){ const w=makeWorker(); if(w) pool.push(w); }
  return pool;
}
export function hasWorkers(){ return getWorkers().length>0; }
export function workerCount(){ return getWorkers().length; }

// ponytail: run job on next worker, returns Promise<{id,result,...}> — transfers if given
export function runJob(type, payload, transfer){
  const ws = getWorkers();
  if(!ws.length) return Promise.reject(new Error('no workers'));
  const w = ws[rr++ % ws.length];
  return new Promise((res, rej)=>{
    const id = ++seq;
    inflight.set(id, {res, rej, w});
    try{ w.postMessage({id, type, payload}, transfer||[]); }
    catch(e){ inflight.delete(id); rej(e); }
    // safety timeout — don't hang frame forever
    setTimeout(()=>{ if(inflight.has(id)){ inflight.delete(id); rej(new Error('worker timeout '+type)); } }, 800);
  });
}
