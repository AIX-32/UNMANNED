'use strict';
import { S, freshMission, freshPhase } from './state.js';
import { dump, saveAutosave, pushUndo } from './core.js';
import { status } from './core.js';

let selIdx = 0;

function ensureMission(){
  if(!S.map.mission) S.map.mission = freshMission();
  if(!S.map.mission.phases) S.map.mission.phases = [];
}

function render(){
  const list = document.getElementById('missionList');
  const ed = document.getElementById('missionEditor');
  const raw = document.getElementById('missionRaw');
  const en = document.getElementById('missionEnable');
  if(!list) return;
  const has = !!S.map.mission;
  en.checked = has;
  list.innerHTML = '';
  raw.value = has ? JSON.stringify(S.map.mission, null, 2) : '';
  if(!has){
    ed.style.display='none';
    list.innerHTML='<div style="color:#888;font-size:10px;padding:6px">Enable mission to add COD-style linear phases. Each phase = one objective. Win one → next. Use checkpoint per phase + subs/audio.</div>';
    return;
  }
  ed.style.display='';
  const phases = S.map.mission.phases;
  phases.forEach(function(p,i){
    const row=document.createElement('div'); row.className='srow';
    const lab=document.createElement('span'); lab.textContent=(i+1)+'. '+(p.title||'untitled')+' ['+(p.win?Object.keys(p.win)[0]:'clear')+']';
    lab.style.cursor='pointer';
    lab.onclick=function(){ selIdx=i; renderEditor(); render(); };
    row.appendChild(lab);
    const up=document.createElement('button'); up.textContent='▲'; up.onclick=function(){ if(i>0){ pushUndo(); const t=phases[i]; phases[i]=phases[i-1]; phases[i-1]=t; selIdx=i-1; dump(); saveAutosave(); render(); }};
    const dn=document.createElement('button'); dn.textContent='▼'; dn.onclick=function(){ if(i<phases.length-1){ pushUndo(); const t=phases[i]; phases[i]=phases[i+1]; phases[i+1]=t; selIdx=i+1; dump(); saveAutosave(); render(); }};
    const del=document.createElement('button'); del.textContent='✕'; del.className='danger'; del.onclick=function(){ pushUndo(); phases.splice(i,1); selIdx=Math.min(selIdx, phases.length-1); dump(); saveAutosave(); render(); };
    row.appendChild(up); row.appendChild(dn); row.appendChild(del);
    if(i===selIdx) row.style.borderColor='#3a7abd';
    list.appendChild(row);
  });
  renderEditor();
}

function renderEditor(){
  const ed=document.getElementById('missionEditor');
  const phases = S.map.mission ? S.map.mission.phases : [];
  const p = phases[selIdx];
  if(!p){ ed.innerHTML=''; return; }
  ed.innerHTML='';
  const mkRow = function(label, el){
    const r=document.createElement('div'); r.className='row';
    const l=document.createElement('label'); l.textContent=label; r.appendChild(l);
    r.appendChild(el);
    return r;
  };
  const mkInput = function(val, ph, cb){
    const i=document.createElement('input'); i.type='text'; i.value=val||''; i.placeholder=ph||''; i.onchange=function(){ pushUndo(); cb(this.value); dump(); saveAutosave(); };
    return i;
  };
  // title
  ed.appendChild(mkRow('title', mkInput(p.title,'INFILTRATE', function(v){ p.title=v; render(); })));
  // desc
  ed.appendChild(mkRow('desc', mkInput(p.desc||'','optional', function(v){ p.desc=v; })));
  // sub
  ed.appendChild(mkRow('sub', mkInput(p.sub||'','subtitle (or title+desc)', function(v){ p.sub=v; })));
  // audio
  const audioRow=document.createElement('div'); audioRow.className='row';
  const al=document.createElement('label'); al.textContent='audio'; audioRow.appendChild(al);
  const af=document.createElement('input'); af.type='file'; af.accept='audio/*';
  af.onchange=function(e){
    const f=e.target.files[0]; if(!f) return;
    if(f.size> 800000){ status('audio too big (>800KB) — use smaller'); return; }
    const rd=new FileReader();
    rd.onload=function(){ pushUndo(); p.audio=rd.result; dump(); saveAutosave(); status('audio loaded '+Math.round(f.size/1024)+'KB'); renderEditor(); };
    rd.readAsDataURL(f);
  };
  audioRow.appendChild(af);
  const ac=document.createElement('button'); ac.textContent=p.audio?'clear':'—';
  ac.onclick=function(){ if(p.audio){ pushUndo(); p.audio=''; dump(); saveAutosave(); renderEditor(); }};
  audioRow.appendChild(ac);
  if(p.audio) { const tag=document.createElement('span'); tag.textContent='✓ '+Math.round(p.audio.length/1024)+'KB'; tag.style.color='#7fbf4f'; tag.style.fontSize='9px'; audioRow.appendChild(tag); }
  ed.appendChild(audioRow);
  // checkpoint
  const ckRow=document.createElement('div'); ckRow.className='row';
  const ckL=document.createElement('label'); ckL.textContent='checkpoint'; ckRow.appendChild(ckL);
  const ck=document.createElement('input'); ck.type='checkbox'; ck.checked=p.checkpoint!==false;
  ck.onchange=function(){ pushUndo(); p.checkpoint=ck.checked; dump(); saveAutosave(); };
  ckRow.appendChild(ck); ckRow.appendChild(document.createTextNode(' save at phase start'));
  ed.appendChild(ckRow);
  // win type
  const winSel=document.createElement('select');
  [['clear','kill all'],['reach','reach zone'],['hold','hold zone'],['collect','collect radios'],['timer','timer (survive)'],['extract','extract']].forEach(function(o){
    const op=document.createElement('option'); op.value=o[0]; op.textContent=o[1]; winSel.appendChild(op);
  });
  const curWin = p.win ? Object.keys(p.win)[0] : 'clear';
  winSel.value=curWin;
  winSel.onchange=function(){
    pushUndo();
    const v=this.value;
    if(v==='clear') p.win={ clear:true };
    else if(v==='reach') p.win={ reach:{ x:0, z:0, r:8 } };
    else if(v==='hold') p.win={ hold:{ x:0, z:0, r:12, sec:30 } };
    else if(v==='collect') p.win={ collect:true };
    else if(v==='timer') p.win={ timer:30 };
    else if(v==='extract') p.win={ extract:true };
    dump(); saveAutosave(); renderEditor();
  };
  ed.appendChild(mkRow('win', winSel));
  // win params
  const wp=document.createElement('div'); wp.id='winParams';
  if(p.win && p.win.reach){
    ['x','z','r'].forEach(function(k){
      const inp=document.createElement('input'); inp.type='number'; inp.step='0.5'; inp.value=p.win.reach[k]; inp.style.width='64px';
      inp.onchange=function(){ pushUndo(); p.win.reach[k]=parseFloat(this.value)||0; dump(); saveAutosave(); };
      wp.appendChild(document.createTextNode(k+' ')); wp.appendChild(inp); wp.appendChild(document.createTextNode(' '));
    });
  } else if(p.win && p.win.hold){
    ['x','z','r','sec'].forEach(function(k){
      const inp=document.createElement('input'); inp.type='number'; inp.step=k==='sec'?'1':'0.5'; inp.value=p.win.hold[k]; inp.style.width='64px';
      inp.onchange=function(){ pushUndo(); p.win.hold[k]=parseFloat(this.value)||0; dump(); saveAutosave(); };
      wp.appendChild(document.createTextNode(k+' ')); wp.appendChild(inp); wp.appendChild(document.createTextNode(' '));
    });
  } else if(p.win && p.win.timer){
    const inp=document.createElement('input'); inp.type='number'; inp.value=typeof p.win.timer==='number'?p.win.timer:p.win.timer.sec||30;
    inp.onchange=function(){ pushUndo(); p.win.timer=parseFloat(this.value)||30; dump(); saveAutosave(); };
    wp.appendChild(document.createTextNode('sec ')); wp.appendChild(inp);
  }
  if(wp.children.length) ed.appendChild(wp);
  // spawn list
  const spTitle=document.createElement('div'); spTitle.textContent='spawns on enter ('+( (p.spawn||[]).length)+')'; spTitle.style.color='#aac7f0'; spTitle.style.fontSize='10px'; spTitle.style.marginTop='6px'; ed.appendChild(spTitle);
  const spList=document.createElement('div'); spList.className='slist'; spList.style.maxHeight='90px';
  (p.spawn||[]).forEach(function(s,i){
    const r=document.createElement('div'); r.className='srow';
    const lab2=document.createElement('span'); lab2.textContent=s.kind+' '+(s.pos? s.pos[0]+','+s.pos[1]:'');
    r.appendChild(lab2);
    const del2=document.createElement('button'); del2.textContent='✕'; del2.onclick=function(){ pushUndo(); p.spawn.splice(i,1); dump(); saveAutosave(); render(); };
    r.appendChild(del2); spList.appendChild(r);
  });
  ed.appendChild(spList);
  const spAdd=document.createElement('div'); spAdd.className='row';
  const kindSel=document.createElement('select'); ['ugv','turret','boss','drone'].forEach(function(k){ const o=document.createElement('option'); o.value=k; o.textContent=k; kindSel.appendChild(o); });
  const px=document.createElement('input'); px.type='number'; px.placeholder='x'; px.style.width='56px';
  const pz=document.createElement('input'); pz.type='number'; pz.placeholder='z'; pz.style.width='56px';
  const addBtn=document.createElement('button'); addBtn.textContent='+ spawn';
  addBtn.onclick=function(){
    const k=kindSel.value; const x=parseFloat(px.value)||0; const z=parseFloat(pz.value)||0;
    pushUndo();
    if(!p.spawn) p.spawn=[];
    p.spawn.push({ kind:k, pos:[x,z] });
    dump(); saveAutosave(); render();
  };
  spAdd.appendChild(kindSel); spAdd.appendChild(px); spAdd.appendChild(pz); spAdd.appendChild(addBtn);
  ed.appendChild(spAdd);
  // waves
  const wTitle=document.createElement('div'); wTitle.textContent='waves ('+((p.waves||[]).length)+')'; wTitle.style.color='#aac7f0'; wTitle.style.fontSize='10px'; ed.appendChild(wTitle);
  const wList=document.createElement('div'); wList.className='slist'; wList.style.maxHeight='90px';
  (p.waves||[]).forEach(function(w,i){
    const r=document.createElement('div'); r.className='srow';
    const lab2=document.createElement('span'); lab2.textContent='@'+w.at+'s '+w.kind+' x'+(w.n||1);
    r.appendChild(lab2);
    const del2=document.createElement('button'); del2.textContent='✕'; del2.onclick=function(){ pushUndo(); p.waves.splice(i,1); dump(); saveAutosave(); render(); };
    r.appendChild(del2); wList.appendChild(r);
  });
  ed.appendChild(wList);
  const wAdd=document.createElement('div'); wAdd.className='row';
  const wk=document.createElement('select'); ['ugv','turret','boss','drone'].forEach(function(k){ const o=document.createElement('option'); o.value=k; o.textContent=k; wk.appendChild(o); });
  const wa=document.createElement('input'); wa.type='number'; wa.placeholder='at sec'; wa.style.width='56px'; wa.value='10';
  const wn=document.createElement('input'); wn.type='number'; wn.placeholder='n'; wn.style.width='36px'; wn.value='1';
  const wBtn=document.createElement('button'); wBtn.textContent='+ wave';
  wBtn.onclick=function(){
    pushUndo();
    if(!p.waves) p.waves=[];
    p.waves.push({ at:parseFloat(wa.value)||0, kind:wk.value, n:parseInt(wn.value)||1 });
    dump(); saveAutosave(); render();
  };
  wAdd.appendChild(wk); wAdd.appendChild(wa); wAdd.appendChild(wn); wAdd.appendChild(wBtn);
  ed.appendChild(wAdd);
}

export function initMissionEditor(){
  // create fwin if not exists
  if(document.getElementById('missionFwin')) return;
  const fw=document.createElement('div'); fw.id='missionFwin'; fw.className='fwin'; fw.style.right='8px'; fw.style.top='44px'; fw.style.width='340px'; fw.style.display='none';
  fw.innerHTML=`<div class="fwin-head"><span class="fwin-title">MISSION — COD phases</span><button class="fwin-close" id="missionFwinClose">×</button></div>
  <div class="fwin-body">
    <div class="row"><label><input type="checkbox" id="missionEnable"> Enable mission (linear phases)</label></div>
    <div id="missionList" class="slist" style="max-height:120px"></div>
    <div class="row"><button id="missionAddPhase">+ add phase</button><button id="missionRawToggle">raw JSON</button></div>
    <div id="missionEditor" style="border-top:1px solid #3a3a3a;margin-top:6px;padding-top:6px"></div>
    <textarea id="missionRaw" style="height:90px;display:none;margin-top:6px" placeholder="mission JSON"></textarea>
    <div class="row" id="missionRawRow" style="display:none"><button id="missionRawApply">apply raw</button><span style="color:#888;font-size:9px">paste mission JSON, then apply</span></div>
    <div class="row" style="color:#888;font-size:9px">Win: reach/hold use x,z,r(+sec). Spawn/waves: ugv/turret/boss/drone at pos. Audio: <800KB (stored as dataURL). Checkpoint saved per phase. Difficulty chosen by player in hub/paused.</div>
  </div>`;
  document.body.appendChild(fw);
  // launcher button
  const launchers=document.getElementById('wsLaunchers');
  if(launchers){
    const b=document.createElement('button'); b.id='wsMission'; b.textContent='Mission'; b.title='COD mission phases';
    b.onclick=function(){ const showing=fw.style.display!=='none'; fw.style.display=showing?'none':'block'; b.classList.toggle('on', !showing); };
    launchers.appendChild(b);
  }
  document.getElementById('missionFwinClose').onclick=function(){ fw.style.display='none'; const b=document.getElementById('wsMission'); if(b) b.classList.remove('on'); };
  // enable
  document.getElementById('missionEnable').onchange=function(){
    pushUndo();
    if(this.checked){ S.map.mission=freshMission(); selIdx=0; S.map.mission.phases.push(freshPhase()); }
    else S.map.mission=null;
    dump(); saveAutosave(); render();
  };
  document.getElementById('missionAddPhase').onclick=function(){
    ensureMission();
    pushUndo();
    S.map.mission.phases.push(freshPhase());
    selIdx=S.map.mission.phases.length-1;
    dump(); saveAutosave(); render();
  };
  document.getElementById('missionRawToggle').onclick=function(){
    const r=document.getElementById('missionRaw'); const rr=document.getElementById('missionRawRow');
    const show=r.style.display==='none';
    r.style.display=show?'block':'none'; rr.style.display=show?'flex':'none';
    if(show) r.value = S.map.mission? JSON.stringify(S.map.mission,null,2):'';
  };
  document.getElementById('missionRawApply').onclick=function(){
    try{
      const v=document.getElementById('missionRaw').value.trim();
      pushUndo();
      if(!v) S.map.mission=null;
      else S.map.mission=JSON.parse(v);
      dump(); saveAutosave(); render(); status('mission raw applied');
    }catch(e){ status('raw JSON error: '+e.message); }
  };
  // expose render for external calls (rebuild)
  window.__renderMission = render;
  render();
}

export function refreshMissionEditor(){ render(); }
