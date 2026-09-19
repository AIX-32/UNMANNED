import { S } from './state.js';
import { camera } from './core.js';
import { atExtract, radiosLeft, radiosPlaced } from './world.js';
import { ugvCount, allUgvsDead } from './ugv.js';
import { turretCount, allTurretsDead } from './turret.js';
import { bossCount, allBossesDead } from './boss.js';

// ponytail: linear phase list, one win predicate per phase. No graph, no branching.

const DIFFS = {
  easy:    { hp: 0.6, dmg: 0.6, label: 'EASY' },
  normal:  { hp: 1.0, dmg: 1.0, label: 'NORMAL' },
  hard:    { hp: 1.35, dmg: 1.35, label: 'HARD' },
  veteran: { hp: 1.7, dmg: 1.7, label: 'VETERAN' },
};

let cur = 0;
let active = false;
let data = null; // S.map.mission
let holdInside = 0; // seconds held inside zone
let phaseT0 = 0;
let checkpoint = null; // {idx,x,y,z,yaw,hp}
let audioEl = null;
let lastPhase = -1;

function diffKey(){ const k=(S.missionDiff||'normal').toLowerCase(); return DIFFS[k] ? k : 'normal'; }
export function getMissionDiff(){ return diffKey(); }
export function getDiffMult(){ return DIFFS[diffKey()]; }
export function setMissionDiff(k){
  k=(k||'normal').toLowerCase();
  if(!DIFFS[k]) k='normal';
  S.missionDiff=k;
  try{ localStorage.setItem('gault_difficulty',k);}catch(e){}
}
try{ const d=localStorage.getItem('gault_difficulty'); if(d&&DIFFS[d]) S.missionDiff=d; else S.missionDiff='normal'; }catch(e){ S.missionDiff='normal'; }

export function getCheckpoint(){ return checkpoint; }
export function clearCheckpoint(){ checkpoint=null; }

function saveCheckpoint(idx){
  const p = data && data.phases && data.phases[idx];
  if(!p) return;
  if(p.checkpoint===false) return; // opt-out per phase
  // ponytail: checkpoint = phase start pos/yaw/hp
  checkpoint = { idx: idx, x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: S.euler.y, hp: S.hp, maxHp: S.maxHp };
  try{ localStorage.setItem('gault_checkpoint_'+S.mapName, JSON.stringify(checkpoint)); }catch(e){}
  // subtle subtitle so player knows
  if(window.__gaultShowSubtitle) window.__gaultShowSubtitle('CHECKPOINT',1200);
}

function loadStoredCheckpoint(){
  try{ const s=localStorage.getItem('gault_checkpoint_'+S.mapName); if(s) checkpoint=JSON.parse(s);}catch(e){}
}

function stopAudio(){
  if(audioEl){ try{ audioEl.pause(); audioEl.src=''; }catch(e){} audioEl=null; }
}

function playPhaseAudio(p){
  stopAudio();
  const src = p && (p.audio || p.audioUrl);
  if(!src) return;
  try{
    audioEl = new Audio(src);
    audioEl.volume = 0.9;
    audioEl.play().catch(function(){});
    // expose for debugging
    window.__missionAudio = audioEl;
  }catch(e){}
}

function enterPhase(idx){
  if(!data || !data.phases[idx]) return;
  const p = data.phases[idx];
  lastPhase = idx;
  phaseT0 = performance.now()/1000;
  holdInside = 0;
  // subtitle + audio
  const title = p.title || ('PHASE '+(idx+1));
  const desc = p.desc ? ' — '+p.desc : '';
  const sub = p.sub || (title+desc);
  const dur = p.subDur ? p.subDur*1000 : undefined;
  if(window.__gaultShowSubtitle) window.__gaultShowSubtitle(sub, dur);
  playPhaseAudio(p);
  // spawn actions
  const spawns = p.spawn || p.spawns || [];
  spawns.forEach(function(s){ spawnOne(s); });
  // waves: [{at, kind, pos, n}]
  if(p.waves && p.waves.length){
    p._wavesDone = [];
  }
  saveCheckpoint(idx);
}

function spawnOne(s){
  if(!s || !s.kind) return;
  const kind=(s.kind||'').toLowerCase();
  const pos=s.pos || s.p || [0,0];
  const x=pos[0], z=pos[1];
  const rotY=s.rotY!=null?s.rotY: (s.yaw!=null?s.yaw:0);
  const sector=s.sector;
  try{
    if(kind==='ugv'){
      const m = window.__gaultSpawnUgv || window.__gaultUgvs;
      // prefer exported spawnMissionUgv if available
      if(window.__gaultSpawnMissionUgv) window.__gaultSpawnMissionUgv(x,z,sector);
      else if(window.__spawnMissionUgv) window.__spawnMissionUgv(x,z,sector);
      else {
        // fallback: push to MAP_SPAWNS and try to spawn via ugv module if loaded
        // dynamic import avoidance: use global hook set by ugv.js
        if(window.__missionSpawnUgv) window.__missionSpawnUgv(x,z,sector);
      }
    } else if(kind==='turret'){
      if(window.__missionSpawnTurret) window.__missionSpawnTurret(x,z,rotY);
    } else if(kind==='boss'){
      if(window.__missionSpawnBoss) window.__missionSpawnBoss(x,z,rotY);
    } else if(kind==='drone'){
      if(window.__missionSpawnDrone) window.__missionSpawnDrone(x,z);
    }
  }catch(e){ console.warn('[mission] spawn failed',e); }
}

export function setMissionMapReady(j){
  stopAudio();
  cur=0; active=false; data=null; holdInside=0; phaseT0=0; checkpoint=null; lastPhase=-1;
  if(!j || !j.mission || !j.mission.phases || !j.mission.phases.length) return;
  // sanitize phases
  const phases = j.mission.phases.filter(function(p){ return p && p.title; });
  if(!phases.length) return;
  data = { phases: phases, raw: j.mission };
  active = true;
  S.missionActive = true;
  loadStoredCheckpoint();
  // if checkpoint exists and user died then respawn will handle, but on fresh load start at 0
  // hook difficulty scaling is read via S.missionDiff in enemy modules
  enterPhase(0);
}

export function isMissionActive(){ return active; }
export function getMissionData(){ return data; }
export function getCurPhase(){ return active && data ? cur : -1; }
export function getCurPhaseObj(){ return active && data ? data.phases[cur] : null; }

// called from main playTick, returns true if mission just completed (caller should showWin)
export function updateMission(dt, now){
  if(!active || !data) return false;
  const p = data.phases[cur];
  if(!p) { active=false; return true; }
  // waves timed spawns
  if(p.waves){
    p.waves.forEach(function(w,i){
      if(p._wavesDone && p._wavesDone[i]) return;
      const at = w.at!=null?w.at:0;
      if(now - phaseT0 >= at){
        if(p._wavesDone) p._wavesDone[i]=true;
        const n = w.n || 1;
        for(let k=0;k<n;k++){
          const kind=w.kind||'ugv';
          const pos=w.pos || w.spawnPos || [camera.position.x + (Math.random()-0.5)*12, camera.position.z + (Math.random()-0.5)*12];
          spawnOne({kind:kind, pos:pos, rotY:w.rotY, sector:w.sector});
        }
        if(w.sub && window.__gaultShowSubtitle) window.__gaultShowSubtitle(w.sub);
        if(w.audio) { try{ new Audio(w.audio).play().catch(function(){});}catch(e){} }
      }
    });
  }
  // check win
  let won=false;
  const win = p.win || p.objective || {};
  // ponytail: one predicate wins phase, multiple keys = OR (reach OR kill etc). Hold is AND inside timer.
  if(win.reach){
    const r = win.reach;
    const rx=r.x!=null?r.x:0, rz=r.z!=null?r.z:0, rr=r.r!=null?r.r:8;
    if(Math.hypot(camera.position.x - rx, camera.position.z - rz) <= rr) won=true;
  }
  if(!won && win.kill){
    // ponytail: v1 only "clear all foes" — remain variant is YAGNI until a mission needs it
    won = allUgvsDead() && allTurretsDead() && allBossesDead();
  }
  // legacy: win.clear boolean
  if(!won && (win.clear===true)) won = allUgvsDead() && allTurretsDead() && allBossesDead();
  if(!won && win.hold){
    const h=win.hold;
    const hx=h.x||0, hz=h.z||0, hr=h.r||12, sec=h.sec||30;
    const inside = Math.hypot(camera.position.x - hx, camera.position.z - hz) <= hr;
    if(inside) holdInside += dt;
    if(holdInside >= sec) won=true;
  }
  if(!won && win.collect){
    if(radiosPlaced() && radiosLeft()===0) won=true;
    else if(!radiosPlaced()) won=true; // no radios => instant
  }
  if(!won && win.timer){
    const sec = typeof win.timer==='number'? win.timer : (win.timer.sec||30);
    if(now - phaseT0 >= sec) won=true;
  }
  if(!won && win.extract){
    if(atExtract()) won=true;
  }
  if(!won && win.time){
    const sec = win.time;
    if(now - phaseT0 >= sec) won=true;
  }
  // generic timeout as win (survive)
  if(!won && p.duration){
    if(now - phaseT0 >= p.duration) won=true;
  }

  if(won){
    cur++;
    if(cur >= data.phases.length){
      active=false;
      S.missionActive=false;
      stopAudio();
      try{ localStorage.removeItem('gault_checkpoint_'+S.mapName);}catch(e){}
      return true; // mission complete
    } else {
      enterPhase(cur);
    }
  }
  return false;
}

export function missionHudText(){
  if(!active || !data) return null;
  const p=data.phases[cur];
  if(!p) return null;
  const title=p.title||('PHASE '+(cur+1));
  const total=data.phases.length;
  let extra='';
  if(p.win && p.win.hold){
    const need=p.win.hold.sec||30;
    const remain=Math.max(0, Math.ceil(need - holdInside));
    extra=' — HOLD '+remain+'s';
  }
  return (cur+1)+'/'+total+' '+title+extra;
}

export function missionProgressFrac(){
  if(!active || !data) return 0;
  const p=data.phases[cur];
  if(p && p.win && p.win.hold){
    const need=p.win.hold.sec||30;
    return Math.min(1, holdInside/need);
  }
  return 0;
}
export function getHoldInfo(){
  if(!active || !data) return null;
  const p=data.phases[cur];
  if(!p || !p.win || !p.win.hold) return null;
  const need=p.win.hold.sec||30;
  return { frac: Math.min(1, holdInside/need), remain: Math.max(0, Math.ceil(need - holdInside)), total: need };
}

export function missionCheckpointPos(){
  return checkpoint;
}

export function resetMission(){
  stopAudio();
  cur=0; holdInside=0; active=false; data=null; checkpoint=null;
  S.missionActive=false;
}

export function respawnToCheckpoint(){
  if(!checkpoint) return null;
  cur = Math.max(0, Math.min(checkpoint.idx, (data?data.phases.length-1:0)));
  holdInside=0;
  phaseT0=performance.now()/1000;
  // re-enter to replay sub/audio
  // don't save new checkpoint immediately
  const p=data && data.phases[cur];
  if(p){
    const sub=p.title? ('CHECKPOINT — '+p.title):'CHECKPOINT';
    if(window.__gaultShowSubtitle) window.__gaultShowSubtitle(sub,1500);
    playPhaseAudio(p);
  }
  return checkpoint;
}

// allow main to query hold progress for UI
window.__gaultMission = { getCurPhase, getMissionData, getCheckpoint, missionHudText, getMissionDiff, setMissionDiff };
