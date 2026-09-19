import { camera } from './core.js';
import { MAP_SPAWNS, propMeshes } from './world.js';

// stepnate — trigger spots that make something happen when fired:
// move a prop (gate/lift), spawn a foe, or say a line. One shot per map load.
// ponytail: MOVE refs props[] by index (same ceiling as sectors↔UGV — re-pick in studio after deleting props);
// a moved prop keeps its original collider — place movers with solid:false

const armed = [];  // triggers waiting to fire
const timed = [];  // fired actions waiting out their delay
const movers = []; // props in motion

export function setTriggerMapReady() {
  armed.length = 0; timed.length = 0; movers.length = 0;
  const list = MAP_SPAWNS.triggers || [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    armed.push({ x: p.x, z: p.z, trig: p.trig || 'area', r: p.r != null ? p.r : 8, actions: p.actions || [] });
  }
}

function aliveEnemies() {
  const out = [];
  const ugv = window.__gaultUgvs; if (ugv) for (let i = 0; i < ugv.length; i++) { const u = ugv[i]; if (u.model && !u.dead) out.push(u.model.position); }
  const tur = window.__gaultTurrets; if (tur) for (let i = 0; i < tur.length; i++) { const t = tur[i]; if (t.model && !t.dead) out.push(t.model.position); }
  const b = window.__gaultBoss; if (b && b.state) for (let i = 0; i < b.state.length; i++) { const bo = b.state[i]; if (bo.model && !bo.dead) out.push(bo.model.position); }
  return out;
}

function fire(t, now) {
  for (let i = 0; i < t.actions.length; i++) {
    const a = t.actions[i];
    if (a && a.act) timed.push({ a: a, t: t, at: now + (a.delay || 0) });
  }
}

function runAction(a, t, now) {
  if (a.act === 'say') {
    if (a.text && window.__gaultShowSubtitle) window.__gaultShowSubtitle(a.text);
    return true;
  }
  if (a.act === 'spawn') {
    const x = a.x != null ? a.x : t.x;
    const z = a.z != null ? a.z : t.z;
    if (a.kind === 'turret') { if (window.__missionSpawnTurret) window.__missionSpawnTurret(x, z, a.rotY || 0); }
    else if (a.kind === 'boss') { if (window.__missionSpawnBoss) window.__missionSpawnBoss(x, z, a.rotY || 0); }
    else if (a.kind === 'drone') { if (window.__missionSpawnDrone) window.__missionSpawnDrone(x, z); }
    else if (window.__missionSpawnUgv) window.__missionSpawnUgv(x, z, a.sector);
    return true;
  }
  if (a.act === 'move') {
    if (a.prop == null || a.prop >= propMeshes.length) return true; // prop gone (map edited) — drop
    const rec = propMeshes[a.prop];
    if (!rec) return true; // tree/bush slot — instanced, not movable
    if (!rec.mesh) return false; // gltf still loading — retry shortly
    const m = rec.mesh;
    const dur = a.dur != null && a.dur > 0 ? a.dur : 0;
    movers.push({ m: m, fx: m.position.x, fy: m.position.y, fz: m.position.z,
      tx: m.position.x + (a.dx || 0), ty: m.position.y + (a.dy || 0), tz: m.position.z + (a.dz || 0),
      t0: now, dur: dur });
    return true;
  }
  return true;
}

export function updateTriggerSpots() {
  const now = performance.now() / 1000;
  for (let i = armed.length - 1; i >= 0; i--) {
    const t = armed[i];
    let hit = false;
    if (t.trig === 'kill') {
      const en = aliveEnemies();
      let cnt = 0; const rr = t.r * t.r;
      for (let k = 0; k < en.length; k++) { const dx = en[k].x - t.x, dz = en[k].z - t.z; if (dx * dx + dz * dz <= rr) cnt++; }
      if (t._live === undefined) t._live = cnt;
      else if (cnt < t._live) hit = true;
      t._live = cnt;
    } else {
      const dx = camera.position.x - t.x, dz = camera.position.z - t.z;
      if (dx * dx + dz * dz <= t.r * t.r) hit = true;
    }
    if (hit) { fire(t, now); armed.splice(i, 1); }
  }
  for (let i = timed.length - 1; i >= 0; i--) {
    const w = timed[i];
    if (now < w.at) continue;
    if (runAction(w.a, w.t, now)) timed.splice(i, 1);
    else w.at = now + 0.1;
  }
  for (let i = movers.length - 1; i >= 0; i--) {
    const v = movers[i];
    const k = v.dur > 0 ? Math.min(1, (now - v.t0) / v.dur) : 1;
    const e = k * k * (3 - 2 * k);
    v.m.position.set(v.fx + (v.tx - v.fx) * e, v.fy + (v.ty - v.fy) * e, v.fz + (v.tz - v.fz) * e);
    if (k >= 1) movers.splice(i, 1);
  }
}

try { window.__gaultTrigger = { armed: armed, movers: movers, setTriggerMapReady: setTriggerMapReady, updateTriggerSpots: updateTriggerSpots }; } catch (e) {}
