'use strict';

import { S, HALF, freshMap } from './state.js';
import * as idb from '../idb.js';
import { $, status, canvas, renderer, scene, camera, orbit, updateCamera,
         rebuildAll, dump, refreshOutlines, brushRing, propGroup, blockGroup, markGroup,
         raycaster, mouseNDC, DEFAULT_SCALE, whenAsyncIdle,
         groundDirty, groundTexCanvas, groundTexCtx, saveAutosave } from './core.js';
import { onMouseDown, makeGhost, clearGhost, aimHit, snapVal, readBlockDef,
         applyBrush, endBrushStroke, finishWall, finishSector } from './tools.js';
import { fillModelSelect, handleKey, initUI, updateHint, renderSectorList } from './ui.js';
import { fillTextureSelect, loadCustomTextures, setPaintDown, applyPaint, endPaintStroke } from './paint.js';
import { updatePreview } from './story.js';
import { updateGreenery } from './greenery.js';
import { setGrassDown, applyGrass, endGrassStroke, finishGrassRegion, grassRegionActive } from './grass.js';




document.addEventListener('mousemove', function(e) {
  if (!orbit.drag || orbit.btn === 1) return;
  orbit.yaw -= e.movementX * 0.005;
  orbit.pitch = THREE.MathUtils.clamp(orbit.pitch - e.movementY * 0.005, -1.5, 1.5);
  orbit.moved = true;
});
canvas.addEventListener('contextmenu', function(e) { e.preventDefault(); });
canvas.addEventListener('mousedown', function(e) {
  if (e.button === 1) e.preventDefault();
  if (e.button !== 0) { orbit.drag = true; orbit.btn = e.button; orbit.moved = false; return; }
  onMouseDown(0);
});
addEventListener('mouseup', function() {
  orbit.drag = false;
  if (orbit.btn === 2 && !orbit.moved && S.tool === 'wall') finishWall();
  if (orbit.btn === 2 && !orbit.moved && S.tool === 'sector') { finishSector(); if (document.getElementById('sectorList')) renderSectorList(); }
  if (orbit.btn === 2 && !orbit.moved && S.tool === 'grass' && grassRegionActive()) finishGrassRegion();
  orbit.btn = 0;
  finishDrag();
});
addEventListener('wheel', function(e) {

  const d = camera.getWorldDirection(new THREE.Vector3());
  orbit.pos.addScaledVector(d, (e.deltaY > 0 ? -1 : 1) * 3);
  // ponytail: no limit - was HALF/60
}, { passive: true });

const keys = S.keys;
let wallPreview = null;
addEventListener('keydown', function(e) {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  keys[e.code] = true;
  handleKey(e);
});
addEventListener('keyup', function(e) { keys[e.code] = false; });


addEventListener('blur', function() { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', function() { if (document.hidden) for (const k in keys) keys[k] = false; });

addEventListener('mousedown', function(e) { if (e.target === canvas) S.mouseButtons |= (1 << e.button); });
addEventListener('mouseup', function(e) {
  S.mouseButtons &= ~(1 << e.button);
  if (e.button === 0) { endBrushStroke(); endPaintStroke(); endGrassStroke(); }
});
addEventListener('mousemove', function(e) { S.mouseX = e.clientX; S.mouseY = e.clientY; });


function entSprite(i) {
  for (let k = 0; k < markGroup.children.length; k++)
    if (markGroup.children[k].isSprite && markGroup.children[k].userData.ent === i) return markGroup.children[k];
  return null;
}

function finishDrag() {
  if (!S.dragging) return;
  S.dragging = false;
  if (!S.selection) return;
  if (S.selection.kind === 'prop') {
    const m = propGroup.children[S.selection.i], p = S.map.props[S.selection.i];
    if (m && p) {
      p.pos = [+m.position.x.toFixed(2), +m.position.z.toFixed(2)];
      p.y = +m.position.y.toFixed(2);
      p.rotY = Math.round(THREE.MathUtils.radToDeg(m.rotation.y));
    }
  } else if (S.selection.kind === 'block') {
    const m = blockGroup.children[S.selection.i], b = S.map.blocks[S.selection.i];
    if (m && b) {
      b.pos = [+m.position.x.toFixed(2), +m.position.y.toFixed(2), +m.position.z.toFixed(2)];
      b.rotY = Math.round(THREE.MathUtils.radToDeg(m.rotation.y));
    }
  } else if (S.selection.kind === 'ent') {
    const e = S.map.entities[S.selection.i];
    const m = entSprite(S.selection.i);
    if (m && e) e.pos = [+m.position.x.toFixed(2), +m.position.z.toFixed(2)];

    markGroup.children.forEach(function(c) {
      if (c !== m && c.isGroup && c.userData.ent === S.selection.i) {
        c.position.x = m.position.x;
        c.position.z = m.position.z;
      }
    });
  }
  dump(); saveAutosave(); refreshOutlines();
}


(async function boot() {
  const t0 = performance.now();
  const loaderEl = document.getElementById('loader');
  const loaderMsg = document.getElementById('loaderMsg');
  await idb.load(['gault_studio_autosave']);
  let restored = idb.get('gault_studio_autosave');
  if (restored) {
    try {
      S.map = JSON.parse(restored);
      if (!S.map.routes) S.map.routes = { ugv: [] };
      status('restored autosave - "New" for a blank field');
    } catch (e) { S.map = null; }
  }
  if (!S.map) S.map = freshMap('map01');
  if (loaderMsg) loaderMsg.textContent = 'loading ' + (S.map.name || 'map') + '…';
  $('mapName').value = S.map.name;
  fillModelSelect();
  await loadCustomTextures();
  fillTextureSelect();
  initUI();
  rebuildAll();
  dump();
  updateHint();
  whenAsyncIdle(function() {
    if (!loaderEl) return;
    const wait = Math.max(0, 600 - (performance.now() - t0));
    setTimeout(function() {
      loaderEl.classList.add('hide');
      setTimeout(function() { loaderEl.style.display = 'none'; }, 400);
    }, wait);
  });
})();


let last = performance.now();
function tick(now) {
  requestAnimationFrame(tick);

  window.__studio = function() {
    let splatState = null;
    try {
      splatState = {
        layers: S.map.splat.layers.length,
        groundDirty: groundDirty,
        groundPixel: groundTexCanvas ? Array.from(groundTexCtx.getImageData(8, 8, 1, 1).data) : null
      };
    } catch (e) { splatState = 'err:' + e.message; }
    return { map: S.map, tool: S.tool, selection: S.selection, splatState: splatState };
  };
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (!updatePreview(dt)) updateCamera(dt);


  if (S.tool === 'place') {
    if (!S.ghost && !S.ghostLoading) makeGhost();
    if (S.ghost) {
      const hit = aimHit(false);
      if (hit) {
        S.ghost.visible = true;
        const kind = $('placeKind').value;
        if (kind === 'prop' || S.ghost.userData.modelGhost) {
          const sc = parseFloat($('placeScale').value) * (DEFAULT_SCALE[$('modelSel').value] || 1);
          S.ghost.scale.setScalar(sc);
          S.ghost.position.set(hit.point.x, 0, hit.point.z);
          S.ghost.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(S.ghost);
          S.ghost.position.y = hit.point.y - bb.min.y;
          S.ghost.position.x = snapVal(hit.point.x);
          S.ghost.position.z = snapVal(hit.point.z);
        } else if (kind === 'block') {
          const s = readBlockDef([0, 0, 0]);
          S.ghost.scale.set(1, 1, 1);
          const half = s.prim === 'plane' ? s.size[1] / 2 : (s.prim === 'cyl' ? s.size[1] / 2 : s.size[1] / 2);
          S.ghost.position.set(snapVal(hit.point.x), snapVal(hit.point.y + half), snapVal(hit.point.z));
        } else {
          S.ghost.position.set(snapVal(hit.point.x), hit.point.y + 2.2, snapVal(hit.point.z));
        }
      } else S.ghost.visible = false;
    }
  } else if (S.ghost && S.tool !== 'place') {
    clearGhost();
  }

  if (S.tool === 'terrain') {
    S.brushDown = (S.mouseButtons & 1) !== 0;
    applyBrush(dt);
  } else if (S.tool === 'paint') {
    setPaintDown((S.mouseButtons & 1) !== 0);
    applyPaint(dt);
  } else if (S.tool === 'greenery') {
    updateGreenery();
  } else if (S.tool === 'grass') {
    setGrassDown((S.mouseButtons & 1) !== 0);
    applyGrass(dt);
  } else {
    brushRing.visible = false;
  }


  (function previewWall() {
    const hit = S.tool === 'wall' || S.tool === 'sector' ? aimHit(false) : null;
    const draft = S.tool === 'wall' ? S.wallDraft : S.sectorDraft;
    if (draft && draft.length && hit) {
      if (!wallPreview) {
        wallPreview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe066 }));
        scene.add(wallPreview);
      }
      const last = draft[draft.length - 1];
      wallPreview.geometry.setFromPoints([
        new THREE.Vector3(last[0], hit.point.y + 0.5, last[1]),
        new THREE.Vector3(hit.point.x, hit.point.y + 0.5, hit.point.z)]);
    } else if (wallPreview) { scene.remove(wallPreview); wallPreview = null; }
  })();


  if (S.dragging && S.selection) {
    raycaster.setFromCamera(mouseNDC.set((S.mouseX / innerWidth) * 2 - 1, -(S.mouseY / innerHeight) * 2 + 1), camera);
    const planeY = S.dragBaseY;
    const dir = raycaster.ray.direction, org = raycaster.ray.origin;
    if (Math.abs(dir.y) > 1e-4) {
      const t = (planeY - org.y) / dir.y;
      if (t > 0) {
        const px = snapVal(org.x + dir.x * t), pz = snapVal(org.z + dir.z * t);
        const m = S.selection.kind === 'prop' ? propGroup.children[S.selection.i]
          : S.selection.kind === 'block' ? blockGroup.children[S.selection.i]
          : entSprite(S.selection.i);
        if (m) {
          m.position.x = px;
          m.position.z = pz;
        }
        refreshOutlines();
      }
    }
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(tick);
