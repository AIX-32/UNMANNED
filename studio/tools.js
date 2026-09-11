'use strict';

import { S, HALF, SIZE } from './state.js';
import { $, scene, camera, raycaster, mouseNDC, groundMesh, paintMesh, sampleHeight,
         blockGroup, propGroup, markGroup, routeGroup, wallGroup, sectorGroup, brushRing,
         markerSprite, buildBlockMesh, buildPropMesh, buildEntityVisual,
         rebuildAll, rebuildRouteViz, rebuildWallViz, rebuildSectorViz, refreshOutlines, showSelInfo,
         loadProto, DEFAULT_SCALE, pushUndo, dump, saveAutosave, status,
         ensureGroundTex, groundTexCtx, groundTex, GROUND_TEX, texImg,
         markGroundDirty, syncSplat, paintBaseGrass, fbm, proceduralRock } from './core.js';
import { greeneryStamp } from './greenery.js';
import { gizmoRaycast, gizmoBegin, gizmoVisible } from './gizmo.js';


export function aimHit(includeMarks) {
  raycaster.setFromCamera(mouseNDC.set((S.mouseX / innerWidth) * 2 - 1, -(S.mouseY / innerHeight) * 2 + 1), camera);
  const objs = [groundMesh, blockGroup, propGroup];
  if (includeMarks) objs.push(markGroup, routeGroup, wallGroup, sectorGroup);
  const hits = raycaster.intersectObjects(objs, true);
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].object === S.ghost || hits[i].object === brushRing) continue;
    if (S.ghost && isDescendant(S.ghost, hits[i].object)) continue;
    return hits[i];
  }
  return null;
}
function isDescendant(root, o) { while (o) { if (o === root) return true; o = o.parent; } return false; }


export const SNAP_CYCLE = [0, 0.5, 1, 2];
export function snapVal(v) { return S.snapStep ? Math.round(v / S.snapStep) * S.snapStep : v; }


export function clearGhost() {
  S.ghostLoading = false;
  if (S.ghost) { scene.remove(S.ghost); disposeTree(S.ghost); S.ghost = null; S.ghostKind = null; }
}
export function disposeTree(o) {
  o.traverse(function(c) {
    if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
  });
}
export function makeGhost() {
  clearGhost();
  const k = $('placeKind').value;
  S.ghostKind = k;
  S.ghostLoading = true;
  if (k === 'prop') {
    const file = $('modelSel').value;
    const sc = parseFloat($('placeScale').value) * (DEFAULT_SCALE[file] || 1);
    loadProto(file, function(proto) {
      S.ghostLoading = false;
      if (S.tool !== 'place' || S.ghostKind !== k) return;
      const m = proto.clone();
      m.scale.setScalar(sc);
      m.traverse(function(c) {
        if (c.isMesh) {
          c.castShadow = false; c.receiveShadow = false;
          c.material = c.material.clone();
          c.material.transparent = true;
          c.material.opacity = 0.55;
        }
      });
      m.rotation.y = rotYRad();
      S.ghost = m;
      scene.add(S.ghost);
    });
  } else if (k === 'block') {
    const s = readBlockDef([0, 0, 0]);
    const m = buildBlockMesh(s);
    m.material = m.material.clone();
    m.material.transparent = true;
    m.material.opacity = s.glow ? 0.7 : 0.55;
    if(s.glow) m.material.emissiveIntensity = 1.1;
    m.castShadow = false;
    m.rotation.y = rotYRad();
    S.ghost = m;
    scene.add(S.ghost);
  } else {


    const et = $('entSel').value;
    const efile = et === 'tank' ? 'tank.gltf' : et === 'target' ? 'target.gltf' : et === 'turret' ? 'turret.gltf' : et === 'boss' ? 'TAT-10.gltf' : et === 'healthbox' ? 'HPB.gltf' : et === 'radio' ? 'radio.gltf' : null;
    if (efile) {
      const esc = et === 'tank' ? 2.55 : et === 'turret' ? 1.6 : et === 'boss' ? 1 : et === 'healthbox' ? 1.3 : et === 'radio' ? 1 : 1.5;
      loadProto(efile, function(proto) {
        S.ghostLoading = false;
        if (S.tool !== 'place' || S.ghostKind !== k) return;
        const m = proto.clone();
        m.scale.setScalar(esc);
        m.traverse(function(c) {
          if (c.isMesh) {
            c.castShadow = false; c.receiveShadow = false;
            c.material = c.material.clone();
            c.material.transparent = true;
            c.material.opacity = 0.55;
          }
        });
        m.rotation.y = rotYRad();
        m.userData.modelGhost = true;
        S.ghost = m;
        scene.add(S.ghost);
      });
      return;
    }
    const g = new THREE.Group();
    const team = parseInt($('teamSel') && $('teamSel').value || '1', 10);
    g.add(markerSprite(et === 'pvp' ? String(team) : '+', et === 'pvp' ? (team === 2 ? '#ff5a5a' : '#5ac8ff') : '#ffffff'));
    g.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1.4)]),
      new THREE.LineBasicMaterial({ color: 0xffffff })));
    g.rotation.y = rotYRad();
    S.ghost = g;
    scene.add(S.ghost);
  }
}
function rotYRad() { return THREE.MathUtils.degToRad(parseFloat($('placeRotY').value) || 0); }
function rotYDeg() { return (parseFloat($('placeRotY').value) || 0) % 360; }


export function getSelections() {
  if (S.multiSel && S.multiSel.length) return S.multiSel;
  if (S.selection) return [S.selection];
  return [];
}
export function clearSelection() { S.selection = null; S.multiSel = null; showSelInfo(); refreshOutlines(); }

export function onMouseDown(btn, ev) {
  if (btn !== 0) return;
  if (S.tool === 'select') {

    if (gizmoVisible()){
      raycaster.setFromCamera(mouseNDC.set((S.mouseX / innerWidth) * 2 - 1, -(S.mouseY / innerHeight) * 2 + 1), camera);
      const gMode=gizmoRaycast(raycaster);
      if(gMode){
        gizmoBegin(gMode);
        S.dragging=false;
        S.gizmoDrag=true;
        return;
      }
    }
    const hit = aimHit(true);
    const add = !!(ev && (ev.shiftKey || ev.ctrlKey || ev.metaKey));
    if (!hit) { S.selection = null; S.multiSel = null; showSelInfo(); refreshOutlines(); return; }
    const pick = pickSelectable(hit.object);
    if (!pick) { S.selection = null; S.multiSel = null; showSelInfo(); refreshOutlines(); return; }

    if (add) {
      let cur = S.multiSel ? S.multiSel.slice() : (S.selection ? [S.selection] : []);
      const idx = cur.findIndex(function(s) { return s.kind === pick.kind && s.i === pick.i; });
      if (idx >= 0) cur.splice(idx, 1);
      else cur.push(pick);
      if (cur.length <= 1) { S.selection = cur[0] || null; S.multiSel = null; }
      else { S.multiSel = cur; S.selection = cur[cur.length - 1]; }
    } else {
      S.selection = pick;
      S.multiSel = null;
    }
    showSelInfo();
    refreshOutlines();
    const sel = S.selection;
    if (sel && (sel.kind === 'prop' || sel.kind === 'block' || sel.kind === 'ent')) {
      S.dragging = true;
      S.dragBaseY = hit.point.y;

      const all = getSelections();
      S.dragStarts = all.map(function(s) {
        if (s.kind === 'prop') return { s: s, x: S.map.props[s.i].pos[0], z: S.map.props[s.i].pos[1] };
        if (s.kind === 'block') return { s: s, x: S.map.blocks[s.i].pos[0], z: S.map.blocks[s.i].pos[2] };
        if (s.kind === 'ent') return { s: s, x: S.map.entities[s.i].pos[0], z: S.map.entities[s.i].pos[1] };
        return null;
      });
      S.dragOrigin = { x: hit.point.x, z: hit.point.z };
      pushUndo();
    }
  } else if (S.tool === 'place') {
    placeAtGhost();
  } else if (S.tool === 'route') {
    const hit = aimHit(false);
    if (hit) {
      pushUndo();
      S.map.routes.ugv.push([snapVal(hit.point.x), snapVal(hit.point.z)]);
      rebuildRouteViz();
      dump();
      saveAutosave();
    }
  } else if (S.tool === 'wall') {
    const hit = aimHit(false);
    if (!hit) return;
    if (!S.wallDraft) S.wallDraft = [];
    S.wallDraft.push([snapVal(hit.point.x), snapVal(hit.point.z)]);
    rebuildWallViz();
    dump();
    saveAutosave();
  } else if (S.tool === 'sector') {
    const hit = aimHit(false);
    if (!hit) return;
    if (!S.map.sectors) S.map.sectors = [];
    if (!S.sectorDraft) S.sectorDraft = [];
    S.sectorDraft.push([snapVal(hit.point.x), snapVal(hit.point.z)]);
    rebuildSectorViz();
    dump();
    saveAutosave();
  } else if (S.tool === 'greenery') {
    const hit = aimHit(false);
    if (hit) greeneryStamp(hit.point.x, hit.point.z);
  }

}


export function finishWall() {
  if (!S.wallDraft || S.wallDraft.length < 2) { S.wallDraft = null; return status('need at least 2 points'); }
  pushUndo();
  S.map.walls.push(S.wallDraft);
  S.wallDraft = null;
  rebuildWallViz();
  dump();
  saveAutosave();
  status('wall committed - Enter/RMB to start another');
}
export function backspaceWall() {
  if (!S.wallDraft || !S.wallDraft.length) return;
  S.wallDraft.pop();
  rebuildWallViz();
  dump();
  saveAutosave();
}


function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function assignUgvsInPoly(si, pts) {
  let n = 0;
  S.map.entities.forEach(function(e) {
    if (e.kind !== 'ugv' || e.sector != null) return;
    if (pointInPoly(e.pos[0], e.pos[1], pts)) { e.sector = si; n++; }
  });
  return n;
}

export function autoFindUgvs() {
  let n = 0;
  (S.map.sectors || []).forEach(function(s, si) { n += assignUgvsInPoly(si, s.pts || []); });
  return n;
}


export function finishSector() {
  if (!S.sectorDraft || S.sectorDraft.length < 3) { S.sectorDraft = null; return status('need at least 3 points'); }
  pushUndo();
  S.map.sectors.push({ pts: S.sectorDraft });
  const n = assignUgvsInPoly(S.map.sectors.length - 1, S.sectorDraft);
  S.sectorDraft = null;
  rebuildSectorViz();
  dump();
  saveAutosave();
  status('sector committed - ' + n + ' UGV' + (n === 1 ? '' : 's') + ' auto-assigned to it' + (n ? '' : ' (none inside)') + ' - Enter/RMB to start another');
}
export function backspaceSector() {
  if (!S.sectorDraft || !S.sectorDraft.length) return;
  S.sectorDraft.pop();
  rebuildSectorViz();
  dump();
  saveAutosave();
}

export function deleteSector(si) {
  pushUndo();
  S.map.sectors.splice(si, 1);
  S.map.entities.forEach(function(e) {
    if (e.sector == null) return;
    if (e.sector === si) e.sector = undefined;
    else if (e.sector > si) e.sector--;
  });
  S.selection = null;
  rebuildAll();
  showSelInfo();
  dump();
  saveAutosave();
  status('sector deleted');
}

function pickSelectable(obj) {
  let o = obj;
  while (o) {
    if (o.parent === propGroup) return { kind: 'prop', i: propGroup.children.indexOf(o) };
    if (o.parent === blockGroup) return { kind: 'block', i: blockGroup.children.indexOf(o) };
    if (o.parent === routeGroup && o.geometry && o.geometry.type === 'SphereGeometry')
      return { kind: 'route', i: routeGroup.children.indexOf(o) };
    if (o.parent === markGroup && o.userData.ent != null) return { kind: 'ent', i: o.userData.ent };
    if (o.parent === wallGroup && o.userData.wall >= 0) return { kind: 'wall', i: o.userData.wall };
    if (o.parent === sectorGroup && o.userData.sector >= 0) return { kind: 'sector', i: o.userData.sector };
    o = o.parent;
  }
  return null;
}

export function readBlockDef(pos) {
  return { prim: $('primSel').value, pos: pos,
    size: [parseFloat($('szW').value), parseFloat($('szH').value), parseFloat($('szD').value)],
    color: $('blockColor').value, texture: $('texSel').value,
    repeat: [parseFloat($('repU').value) || 1, parseFloat($('repV').value) || 1],
    solid: $('blockSolid').checked, glow: !!($('blockGlow') && $('blockGlow').checked) };
}

export function placeAtGhost() {
  if (!S.ghost || !S.ghost.visible) return;
  pushUndo();
  const kind = $('placeKind').value;
  const sc = parseFloat($('placeScale').value) * (DEFAULT_SCALE[$('modelSel').value] || 1);
  const gp = S.ghost.position;
  if (kind === 'prop') {
    const p = { model: $('modelSel').value,
                pos: [snapVal(gp.x), snapVal(gp.z)], rotY: rotYDeg(),
                scale: +(sc).toFixed(2), y: +gp.y.toFixed(2), solid: true };
    S.map.props.push(p);
    buildPropMesh(p);
  } else if (kind === 'block') {
    const b = readBlockDef([snapVal(gp.x), snapVal(gp.y), snapVal(gp.z)]);
    b.rotY = rotYDeg();
    S.map.blocks.push(b);
    buildBlockMesh(b);
  } else {
    const e = { kind: $('entSel').value, pos: [snapVal(gp.x), snapVal(gp.z)], rotY: rotYDeg() };
    if (e.kind === 'pvp') e.team = parseInt($('teamSel').value, 10) || 1;
    S.map.entities.push(e);
    buildEntityVisual(e, S.map.entities.length - 1);
  }
  dump();
  saveAutosave();
  status('placed');
}

export function deleteSelection() {
  const all = getSelections();
  if (!all.length) return;
  if (all.length === 1 && all[0].kind === 'sector') { const si = all[0].i; S.selection = null; S.multiSel = null; deleteSector(si); return; }
  pushUndo();

  const byKind = {};
  all.forEach(function(s) { (byKind[s.kind] = byKind[s.kind] || []).push(s.i); });
  Object.keys(byKind).forEach(function(k) { byKind[k].sort(function(a, b) { return b - a; }); });
  (byKind.prop || []).forEach(function(i) { S.map.props.splice(i, 1); });
  (byKind.block || []).forEach(function(i) { S.map.blocks.splice(i, 1); });
  (byKind.ent || []).forEach(function(i) { S.map.entities.splice(i, 1); });
  (byKind.route || []).forEach(function(i) { S.map.routes.ugv.splice(i, 1); });
  (byKind.wall || []).forEach(function(i) { S.map.walls.splice(i, 1); });
  S.selection = null; S.multiSel = null;
  rebuildAll();
  showSelInfo();
  dump();
  saveAutosave();
}

export function duplicateSelection() {
  const all = getSelections();
  if (!all.length) return;
  pushUndo();
  const news = [];
  all.forEach(function(sel) {
    if (sel.kind === 'prop') {
      const p = JSON.parse(JSON.stringify(S.map.props[sel.i]));
      p.pos = [p.pos[0] + 2, p.pos[1] + 2];
      S.map.props.push(p);
      news.push({ kind: 'prop', i: S.map.props.length - 1 });
      buildPropMesh(p);
    } else if (sel.kind === 'block') {
      const b = JSON.parse(JSON.stringify(S.map.blocks[sel.i]));
      b.pos[0] += b.size[0] + 0.5;
      S.map.blocks.push(b);
      news.push({ kind: 'block', i: S.map.blocks.length - 1 });
      buildBlockMesh(b);
    } else if (sel.kind === 'ent') {
      const e = JSON.parse(JSON.stringify(S.map.entities[sel.i]));
      e.pos = [e.pos[0] + 3, e.pos[1] + 3];
      S.map.entities.push(e);
      buildEntityVisual(e, S.map.entities.length - 1);
      news.push({ kind: 'ent', i: S.map.entities.length - 1 });
    }
  });
  if (news.length === 1) { S.selection = news[0]; S.multiSel = null; }
  else if (news.length > 1) { S.multiSel = news; S.selection = news[news.length - 1]; }
  refreshOutlines();
  showSelInfo();
  dump();
  saveAutosave();
}


export function nudgeSelection(dx, dy, dz) {
  const all = getSelections();
  if (!all.length) return;
  const s = S.snapStep || 0.25;
  let needEnt = false;
  all.forEach(function(sel) {
    if (sel.kind === 'prop') {
      const p = S.map.props[sel.i];
      p.pos[0] += dx * s; p.pos[1] += dz * s;
      p.y = +(Math.max(0, (p.y != null ? p.y : sampleHeight(p.pos[0], p.pos[1])) + dy * s)).toFixed(2);
      rebuildOne('prop', sel.i);
    } else if (sel.kind === 'block') {
      const b = S.map.blocks[sel.i];
      b.pos[0] += dx * s; b.pos[1] += dy * s; b.pos[2] += dz * s;
      rebuildOne('block', sel.i);
    } else if (sel.kind === 'ent') {
      const e = S.map.entities[sel.i];
      e.pos[0] += dx * s; e.pos[1] += dz * s;
      needEnt = true;
    } else if (sel.kind === 'route') {
      const p = S.map.routes.ugv[sel.i];
      p[0] += dx * s; p[1] += dz * s;
    }
  });
  if (needEnt) rebuildOne('entall');
  if (all.some(function(x) { return x.kind === 'route'; })) rebuildRouteViz();
  dump(); saveAutosave(); refreshOutlines();
}
export function rotateSelection(deg) {
  const all = getSelections();
  if (!all.length) return;
  let needEnt = false;
  all.forEach(function(sel) {
    if (sel.kind === 'prop') { S.map.props[sel.i].rotY = (Math.round(S.map.props[sel.i].rotY || 0) + deg) % 360; rebuildOne('prop', sel.i); }
    else if (sel.kind === 'block') { S.map.blocks[sel.i].rotY = ((S.map.blocks[sel.i].rotY || 0) + deg) % 360; rebuildOne('block', sel.i); }
    else if (sel.kind === 'ent') { S.map.entities[sel.i].rotY = ((S.map.entities[sel.i].rotY || 0) + deg) % 360; needEnt = true; }
  });
  if (needEnt) rebuildOne('entall');
  dump(); saveAutosave(); refreshOutlines();
}
export function scaleSelection(k) {
  const all = getSelections();
  if (!all.length) return;
  all.forEach(function(sel) {
    if (sel.kind === 'prop') {
      const p = S.map.props[sel.i];
      p.scale = +Math.max(0.1, (p.scale || 1) * k).toFixed(2);
      rebuildOne('prop', sel.i);
    } else if (sel.kind === 'block') {
      const b = S.map.blocks[sel.i];
      b.size = b.size.map(function(v) { return +Math.max(0.1, v * k).toFixed(2); });
      rebuildOne('block', sel.i);
    }
  });
  dump(); saveAutosave(); refreshOutlines();
}

export function scaleSelectionAxis(axis, delta) {
  const all = getSelections().filter(function(s){ return s.kind==='block'; });
  if (!all.length) return;
  all.forEach(function(sel){
    const b = S.map.blocks[sel.i];
    const cur = b.size[axis];
    const next = Math.max(0.2, cur + delta);
    b.size[axis] = +next.toFixed(2);
  });
  all.forEach(function(sel){ rebuildOne('block', sel.i); });
  dump(); saveAutosave(); refreshOutlines();
}

export function bulkBoxEdit(opts) {
  const all = getSelections().filter(function(s) { return s.kind === 'block'; });
  if (!all.length) return 0;
  pushUndo();
  all.forEach(function(sel) {
    const b = S.map.blocks[sel.i];
    if (opts.color) b.color = opts.color;
    if (opts.texture !== undefined) b.texture = opts.texture || '';
    if (opts.repeat) b.repeat = opts.repeat.slice();
    if (opts.solid !== undefined) b.solid = !!opts.solid;
    if (opts.glow !== undefined) b.glow = !!opts.glow;
  });
  all.forEach(function(sel) { rebuildOne('block', sel.i); });
  dump(); saveAutosave(); refreshOutlines();
  return all.length;
}
export function rebuildOne(kind, i) {
  if (kind === 'prop') {
    const old = propGroup.children[i];
    if (old) { propGroup.remove(old); disposeTree(old); }
    buildPropMesh(S.map.props[i]);
  } else if (kind === 'block') {
    const old = blockGroup.children[i];
    if (old) { blockGroup.remove(old); disposeTree(old); }
    buildBlockMesh(S.map.blocks[i]);
  } else if (kind === 'entall') {
    while (markGroup.children.length) markGroup.remove(markGroup.children[0]);
    S.map.entities.forEach(function(e, i) { buildEntityVisual(e, i); });
  }
}


export let brushMode = 'raise';
export function setBrushMode(m) { brushMode = m; }
let brushStrokeUndone = false;
let lastNorm = 0;

export function applyBrush(dt) {
  const hit = aimHit(false);
  const r = parseFloat($('tbRadius').value);
  const str = parseFloat($('tbStrength').value);
  brushRing.visible = !!hit;
  if (!hit) return;
  brushRing.position.set(hit.point.x, hit.point.y + 0.06, hit.point.z);
  brushRing.scale.setScalar(r);
  if (!S.brushDown) return;
  if (!brushStrokeUndone) { pushUndo(); brushStrokeUndone = true; }
  const H = S.map.terrain.heights, n = S.map.terrain.segs, step = S.map.terrain.size / n, w = n + 1;
  const cr = Math.round(r / step);
  const ci = Math.round((hit.point.x + HALF) / step), cj = Math.round((hit.point.z + HALF) / step);
  const flatY = hit.point.y;
  for (let j = Math.max(0, cj - cr); j <= Math.min(n, cj + cr); j++) {
    for (let i = Math.max(0, ci - cr); i <= Math.min(n, ci + cr); i++) {
      const wx = -HALF + i * step, wz = -HALF + j * step;
      const d = Math.hypot(wx - hit.point.x, wz - hit.point.z);
      if (d > r) continue;
      const f = Math.cos(d / r * Math.PI) * 0.5 + 0.5;
      const idx = j * w + i;
      if (brushMode === 'raise') H[idx] += str * f * dt;
      else if (brushMode === 'lower') H[idx] -= str * f * dt;
      else if (brushMode === 'smooth') {
        let sum = 0, cnt = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const jj = j + dj, ii = i + di;
          if (jj < 0 || ii < 0 || jj > n || ii > n) continue;
          sum += H[jj * w + ii]; cnt++;
        }
        H[idx] += ((sum / cnt) - H[idx]) * Math.min(1, dt * 10) * f;
      } else if (brushMode === 'flatten') {
        H[idx] += (flatY - H[idx]) * Math.min(1, dt * 6) * f;
      }
    }
  }

  const pos = groundMesh.geometry.attributes.position;
  for (let v = 0; v < pos.count; v++) {
    const wx = pos.getX(v), wz = -pos.getY(v);
    const di = wx - hit.point.x, dz = wz - hit.point.z;
    if (di * di + dz * dz > r * r) continue;
    pos.setZ(v, sampleHeight(wx, wz));
  }
  pos.needsUpdate = true;
  if (paintMesh) {

    const ppos = paintMesh.geometry.attributes.position;
    for (let v = 0; v < ppos.count; v++) {
      const wx = ppos.getX(v), wz = -ppos.getY(v);
      const di = wx - hit.point.x, dz = wz - hit.point.z;
      if (di * di + dz * dz > r * r) continue;
      ppos.setZ(v, sampleHeight(wx, wz));
    }
    ppos.needsUpdate = true;
  }
  if (performance.now() - lastNorm > 150) {
    lastNorm = performance.now();
    groundMesh.geometry.computeVertexNormals();
    if (paintMesh) paintMesh.geometry.computeVertexNormals();
  }
}
export function endBrushStroke() { brushStrokeUndone = false; dump(); }





export function generateMountains() {
  const peak = parseFloat($('mtPeak').value) || 15;
  const above = parseFloat($('mtAbove').value) || 6;
  pushUndo();
  const H = S.map.terrain.heights, n = S.map.terrain.segs, step = S.map.terrain.size / n, w = n + 1;
  const seed = Math.random() * 1000;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const wx = -HALF + i * step, wz = -HALF + j * step;
    const d = Math.hypot(wx, wz) / HALF;
    const ring = THREE.MathUtils.clamp((d - 0.4) / 0.6, 0, 1);
    const nv = fbm(wx * 0.045 + seed, wz * 0.045 + 9.1, 5);
    const ridge = Math.pow(1 - Math.abs(2 * nv - 1), 2.2);
    const carve = 0.75 + 0.25 * fbm(wx * 0.02 + 42, wz * 0.02 + 7, 3);
    H[j * w + i] = ridge * ring * peak * carve;
  }

  for (let p = 0; p < 3; p++) {
    for (let j = 1; j < n; j++) for (let i = 1; i < n; i++) {
      const k = j * w + i, lim = 2 * step;
      const avg = (H[k - 1] + H[k + 1] + H[k - w] + H[k + w]) / 4;
      if (H[k] > avg + lim) H[k] = avg + lim;
      else if (H[k] < avg - lim) H[k] = avg - lim;
    }
  }
  rebuildAll();
  ensureGroundTex();
  paintBaseGrass();
  S.map.groundTex = null;
  bakeStone(above);
  dump(); saveAutosave();
  status('mountains generated (' + peak + 'm peaks) - stone above ' + above + 'm');
}

export function bakeStone(above) {
  ensureGroundTex();
  const sel = $('mtTex');
  const tex = sel && sel.value ? sel.value : proceduralRock();
  const img = texImg(tex);
  const run = function() {
    if (!img.complete || !img.width) return;
    const mask = document.createElement('canvas');
    mask.width = mask.height = GROUND_TEX;
    const mctx = mask.getContext('2d');
    const id = mctx.createImageData(GROUND_TEX, GROUND_TEX);
    const step = SIZE / GROUND_TEX;
    for (let py = 0; py < GROUND_TEX; py++) {
      const wz = -HALF + py * step;
      for (let px = 0; px < GROUND_TEX; px++) {
        const o = (py * GROUND_TEX + px) * 4;
        id.data[o + 3] = sampleHeight(-HALF + px * step, wz) >= above ? 255 : 0;
      }
    }
    mctx.putImageData(id, 0, 0);
    const rock = document.createElement('canvas');
    rock.width = rock.height = GROUND_TEX;
    const rctx = rock.getContext('2d');
    const tilePx = Math.max(8, GROUND_TEX / (SIZE / 2));
    const th = Math.max(4, Math.round(tilePx * img.height / img.width));
    for (let ty = 0; ty < GROUND_TEX; ty += th)
      for (let tx = 0; tx < GROUND_TEX; tx += tilePx)
        rctx.drawImage(img, tx, ty, tilePx, th);
    rctx.globalCompositeOperation = 'destination-in';
    rctx.drawImage(mask, 0, 0);
    groundTexCtx.drawImage(rock, 0, 0);
    groundTex.needsUpdate = true;
    markGroundDirty();
    syncSplat();
    dump(); saveAutosave();
  };
  if (img.complete && img.width) run(); else img.onload = run;
}

export function generateAutoTerrain() {
  const peak = parseFloat($('autoPeak') && $('autoPeak').value || 22);
  const above = parseFloat($('autoAbove') && $('autoAbove').value || 7);
  const feather = parseFloat($('autoFeather') && $('autoFeather').value || 4);
  const doGrass = !$('autoGrass') || $('autoGrass').checked;
  const doTrees = !$('autoTrees') || $('autoTrees').checked;
  const doStone = !$('autoStone') || $('autoStone').checked;
  pushUndo();
  const H = S.map.terrain.heights, n = S.map.terrain.segs, step = S.map.terrain.size / n, w = n + 1;
  const seed = Math.random()*1000, seed2 = seed*1.37;

  for (let j=0;j<=n;j++) for (let i=0;i<=n;i++) {
    const wx = -HALF + i*step, wz = -HALF + j*step;

    const m0 = fbm(wx*0.006+seed, wz*0.006+seed2, 3);
    const mask = m0*m0*(3-2*m0);
    const m = THREE.MathUtils.smoothstep(m0, 0.52, 0.78);

    const flat = fbm(wx*0.018+seed, wz*0.018+seed2, 2)*0.55 + fbm(wx*0.045, wz*0.045, 2)*0.18;

    const nv = fbm(wx*0.030+seed, wz*0.030+9.1, 4);
    const ridge = Math.pow(1-Math.abs(2*nv-1), 2.3);
    const mtn = ridge * peak * m * (0.70 + 0.30*fbm(wx*0.008+42, wz*0.008+7, 2));
    H[j*w+i] = flat*(1-m*0.65) + mtn;
  }

  for(let pass=0; pass<1; pass++){
    const G=[1,2,1,2,4,2,1,2,1];
    const T=H.slice();
    for(let j=1;j<n;j++) for(let i=1;i<n;i++){
      const k=j*w+i;
      let acc=0, idx=0;
      for(let dj=-1;dj<=1;dj++) for(let di=-1;di<=1;di++) acc+=T[(j+dj)*w+(i+di)]*G[idx++];
      const h0=T[k];

      const m0=THREE.MathUtils.smoothstep(fbm((-HALF+i*step)*0.006+seed, (-HALF+j*step)*0.006+seed2,3),0.52,0.78);
      H[k]= h0*(m0*0.45+0.20) + (acc/16)*(0.80 - m0*0.45);
    }
  }
  for (let p=0;p<2;p++) for (let j=1;j<n;j++) for (let i=1;i<n;i++) {
    const k=j*w+i, lim=1.7*step;
    const avg=(H[k-1]+H[k+1]+H[k-w]+H[k+w])/4;
    if (H[k]>avg+lim) H[k]=avg+lim; else if (H[k]<avg-lim) H[k]=avg-lim;
  }
  rebuildAll();

  if (doGrass) {
    if (!S.map.grass) S.map.grass = { tex:null, pairs:3, size:0.7, height:1.3, pts:[], unlit:false, radius:0.6 };
    S.map.grass.pts = [];
    const need = Math.round(90 + SIZE*0.14);
    let tries=0;
    while (S.map.grass.pts.length < need && tries < need*40) {
      tries++;
      const x = THREE.MathUtils.randFloatSpread(SIZE*0.92), z = THREE.MathUtils.randFloatSpread(SIZE*0.92);
      const h = sampleHeight(x,z);
      if (h < 0.18 || h > 1.45) continue;

      const hx = sampleHeight(x+1,z)-sampleHeight(x-1,z), hz = sampleHeight(x,z+1)-sampleHeight(x,z-1);
      if (Math.hypot(hx,hz) > 0.38) continue;
      S.map.grass.pts.push([+x.toFixed(2),+z.toFixed(2)]);
    }
  }

  if (doTrees) {
    const count = Math.round(22 + SIZE*0.09);
    for (let t=0; t<count; t++) {
      const x = THREE.MathUtils.randFloatSpread(SIZE*0.92), z = THREE.MathUtils.randFloatSpread(SIZE*0.92);
      const h = sampleHeight(x,z);
      if (h < 0.9 || h > peak*0.75) continue;
      const roll = Math.random();
      const kind = roll < 0.45 ? 'tree' : roll < 0.82 ? 'bush' : 'tree';
      const model = kind==='tree' ? 'tree.gltf' : 'bush.gltf';
      const sc = kind==='tree' ? THREE.MathUtils.randFloat(0.85,1.45) : THREE.MathUtils.randFloat(1.1,2.1);
      S.map.props.push({ model, pos:[+x.toFixed(2),+z.toFixed(2)], rotY:Math.round(Math.random()*360), scale:+sc.toFixed(2), y:'drop', solid:true });
    }
  }
  rebuildAll();

  if (doStone) {
    ensureGroundTex(); paintBaseGrass();
    const sel=$('mtTex'); const tex = sel && sel.value ? sel.value : proceduralRock();
    const img=texImg(tex);
    const run=function(){
      if (!img.complete || !img.width) return;
      const mask=document.createElement('canvas'); mask.width=mask.height=GROUND_TEX;
      const mctx=mask.getContext('2d'); const id=mctx.createImageData(GROUND_TEX,GROUND_TEX);
      const step2=SIZE/GROUND_TEX;
      for (let py=0; py<GROUND_TEX; py++) {
        const wz=-HALF+py*step2;
        for (let px=0; px<GROUND_TEX; px++) {
          const wx2=-HALF+px*step2;
          const h=sampleHeight(wx2,wz);
          const n=fbm(wx2*0.04+seed, wz*0.04+seed2, 2)*feather*0.55;
          const t=(h - (above + n) + feather)/ (feather*2);
          const a=THREE.MathUtils.clamp(t,0,1);
          const smooth=a*a*(3-2*a);
          id.data[(py*GROUND_TEX+px)*4+3]=Math.round(smooth*255);
        }
      }
      mctx.putImageData(id,0,0);
      const rock=document.createElement('canvas'); rock.width=rock.height=GROUND_TEX; const rctx=rock.getContext('2d');
      const tilePx=Math.max(8, GROUND_TEX/(SIZE/2)); const th=Math.max(4, Math.round(tilePx*img.height/img.width));
      for (let ty=0; ty<GROUND_TEX; ty+=th) for (let tx=0; tx<GROUND_TEX; tx+=tilePx) rctx.drawImage(img,tx,ty,tilePx,th);
      rctx.globalCompositeOperation='destination-in'; rctx.drawImage(mask,0,0);
      groundTexCtx.drawImage(rock,0,0); groundTex.needsUpdate=true; markGroundDirty(); syncSplat();
      dump(); saveAutosave();
    };
    if (img.complete && img.width) run(); else img.onload=run;
  } else { dump(); saveAutosave(); }
  status('auto terrain - '+peak+'m peaks, '+ (S.map.grass && S.map.grass.pts ? S.map.grass.pts.length : 0)+' grass fields, '+S.map.props.length+' props · feather '+feather+'m');
}
