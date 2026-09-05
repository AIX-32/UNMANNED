'use strict';

import { S, HALF, SIZE, freshMap, formulaGrid, segsForSize, bilinearResample } from './state.js';
import * as idb from '../idb.js';
import { $, status, show, hide, TEXTURES, MODELS, workLight, toggleNight, setNight, setFogHidden, isFogHidden, setFogSlider, getFogSlider, undo, camera,
         pushUndo, dump, dumpNow, saveAutosave, rebuildAll, brushRing, euler, orbit,
         setPvpRebuild, addPinButton, isPinned } from './core.js';
import { clearGhost, makeGhost, deleteSelection, duplicateSelection, rotateSelection,
         scaleSelection, nudgeSelection, setBrushMode, finishWall, backspaceWall,
         finishSector, backspaceSector, deleteSector, autoFindUgvs,
         generateMountains, bakeStone } from './tools.js';
import { renderLayers, addLayer, clearGroundPaint, refreshGroundMaterial, addCustomTexture } from './paint.js';
import { setStoryMode } from './story.js';
import { setGreeneryMode } from './greenery.js';
import { setGrassMode, finishGrassRegion, backspaceGrassRegion, grassRegionActive } from './grass.js';


document.querySelectorAll('.modal').forEach(function(m) {
  m.addEventListener('mousedown', function(e) { if (e.target === m) hide(m); });
  const close = m.querySelector('[data-close]');
  if (close) close.onclick = function() { hide(m); };
  document.addEventListener('keydown', function(e) { if (e.code === 'Escape') hide(m); });
});


function initFwin(id, closeId) {
  const win = $(id);
  if (!win || win._dragInit) return;
  win._dragInit = true;
  const head = win.querySelector('.fwin-head');
  let drag = null;
  head.addEventListener('mousedown', function(e) {
    if (e.target.closest('.fwin-close') || e.target.closest('.fwin-pin')) return;
    drag = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
    e.preventDefault();
  });
  addEventListener('mousemove', function(e) {
    if (!drag) return;
    win.style.left = (e.clientX - drag.dx) + 'px';
    win.style.top = (e.clientY - drag.dy) + 'px';
  });
  addEventListener('mouseup', function() { drag = null; });
  const close = $(closeId);
  if (close) close.onclick = function() { win.style.display = 'none'; };
}
function initPlaceFwin() { initFwin('placeFwin','placeFwinClose'); }
function initTerrainFwin() { initFwin('terrainBrushFwin','terrainBrushClose'); initFwin('terrainMountainsFwin','terrainMountainsClose'); }
[
  ['mapFwin','mapFwinClose'], ['pvpFwin','pvpFwinClose'], ['groundFwin','groundFwinClose'],
  ['viewFwin','viewFwinClose'], ['wallOpts','wallOptsClose'], ['sectorOpts','sectorOptsClose'],
  ['paintOpts','paintOptsClose'], ['selFwin','selFwinClose']
].forEach(function(p) { initFwin(p[0], p[1]); });
function showWs(btnId, fwinId, on) {
  const fw = $(fwinId);
  if (!fw) return;
  fw.style.display = on ? 'block' : 'none';
  const b = $(btnId);
  if (b) b.classList.toggle('on', !!on);
}
document.querySelectorAll('.fwin').forEach(addPinButton);

export function setTool(t) {
  initPlaceFwin(); initTerrainFwin();
  S.tool = t;
  ['Select', 'Place', 'Terrain', 'Route', 'Paint', 'Wall', 'Story', 'Greenery', 'Sector', 'Grass'].forEach(function(n) {
    $('tool' + n).classList.toggle('on', t === n.toLowerCase());
  });
  const pf = $('placeFwin');
  if (pf) pf.style.display = (t === 'place' || isPinned('placeFwin')) ? 'block' : 'none';
  const tbf = $('terrainBrushFwin'), tmf = $('terrainMountainsFwin');
  if (tbf) tbf.style.display = (t === 'terrain' || isPinned('terrainBrushFwin')) ? 'block' : 'none';
  if (tmf) tmf.style.display = (t === 'terrain' || isPinned('terrainMountainsFwin')) ? 'block' : 'none';
  if ($('paintOpts')) $('paintOpts').style.display = (t === 'paint' || isPinned('paintOpts')) ? 'block' : 'none';
  if ($('wallOpts')) $('wallOpts').style.display = (t === 'wall' || isPinned('wallOpts')) ? 'block' : 'none';
  if ($('sectorOpts')) $('sectorOpts').style.display = (t === 'sector' || isPinned('sectorOpts')) ? 'block' : 'none';
  if (t === 'select') { const sw = $('selFwin'); if (sw) sw.style.display = 'block'; }
  if (t === 'paint') {

    const nonGrass = TEXTURES.find(function(x) { return x.src.indexOf('grass') < 0; });
    if (!S.map.splat.layers.some(function(l) { return l && l.indexOf('grass') < 0; })) {
      if (S.map.splat.layers.length < 3 && nonGrass) addLayer();
      else if (nonGrass) { S.map.splat.layers[0] = nonGrass.src; refreshGroundMaterial(); }
    }
    renderLayers();
  }
  clearGhost();
  brushRing.visible = false;
  brushRing.material.color.setHex(t === 'paint' ? 0x7fbf4f : 0xe8a04c);
  orbit.pos.copy(camera.position);
  setStoryMode(t === 'story');
  setGreeneryMode(t === 'greenery');
  setGrassMode(t === 'grass');
  if (t === 'sector') renderSectorList();
  updateHint();
}

export function cycleSnap() {
  S.snapStep = [0, 0.5, 1, 2][([0, 0.5, 1, 2].indexOf(S.snapStep) + 1) % 4];
  $('snapBtn').textContent = 'snap: ' + (S.snapStep ? S.snapStep + 'm' : 'OFF') + ' (G)';
}

export function updateHint() {
  const h = $('hint');
  let t = 'RMB drag = look around · wheel = zoom / fly-dolly · WASD fly (R/F up/down) · arrows look · Shift fast · L = work light · N = night\n';
  if (S.tool === 'select') t += 'click = pick · drag = move · ←↑↓→ slide · PgUp/Dn lift · [ ] rotate · -/+ scale · V dup · X del';
  if (S.tool === 'place') t += 'aim + click = stamp (keeps going) · rotY in panel spins the ghost · 1/2/3/4 tools · G snap';
  if (S.tool === 'terrain') t += 'hold click = sculpt · raise/lower/smooth/flatten in panel · ⛰ generate mountains = ridged ring around the map + stone above the height line';
  if (S.tool === 'paint') t += 'hold click = paint active layer · Alt = erase to grass · layers in panel';
  if (S.tool === 'route') t += 'click = add UGV waypoint · X on a dot deletes it';
  if (S.tool === 'wall') t += 'fly around · click = place a vertex (segments connect) · Enter/RMB-click = finish wall · Backspace = drop last vertex · X = delete selected wall';
  if (S.tool === 'sector') t += 'fly around · click = place a vertex (closes to a filled area) · Enter/RMB-click = finish sector · Backspace = drop last vertex · check UGVs in the panel to confine them to this area';
  if (S.tool === 'story') t += 'fly + ＋add cutscene camera points · ▶ preview the path · aim at ground + ＋add text zones · sections type on the intro board';
  if (S.tool === 'greenery') t += 'hold nothing - left-click stamps trees/bushes in the brush circle · options in the floating window (kind, counts, radius, sizes) · click again = another stamp';
  if (S.tool === 'grass') t += 'hold LMB + draw to paint billboard grass · or tick "fill region" in the panel, click to outline an area, then Enter/RMB fills it (dense middle, fades to none at edges) · Backspace drops the last vertex · upload a sprite in the floating window · 0 = grass tool';
  h.textContent = t;
}

export function fillModelSelect() {
  const sel = $('modelSel');
  MODELS.forEach(function(m) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m.replace('.gltf', '');
    sel.appendChild(o);
  });
  sel.addEventListener('change', makeGhost);
}

export function handleKey(e) {
  switch (e.code) {
    case 'KeyZ': if (e.ctrlKey || e.metaKey) { e.preventDefault(); undo(); } break;
    case 'Digit1': setTool('select'); break;
    case 'Digit2': setTool('place'); makeGhost(); break;
    case 'Digit3': setTool('terrain'); break;
    case 'Digit4': setTool('route'); break;
    case 'Digit5': setTool('paint'); break;
    case 'Digit6': setTool('wall'); break;
    case 'Digit7': setTool('story'); break;
    case 'Digit8': setTool('greenery'); break;
    case 'Digit9': setTool('sector'); break;
    case 'Digit0': setTool('grass'); break;
    case 'Enter':
      if (S.tool === 'wall') { e.preventDefault(); finishWall(); }
      else if (S.tool === 'sector') { e.preventDefault(); finishSector(); renderSectorList(); }
      else if (S.tool === 'grass' && grassRegionActive()) { e.preventDefault(); finishGrassRegion(); }
      break;
    case 'Backspace':
      if (S.tool === 'wall') { e.preventDefault(); backspaceWall(); }
      else if (S.tool === 'sector') { e.preventDefault(); backspaceSector(); }
      else if (S.tool === 'grass' && grassRegionActive()) { e.preventDefault(); backspaceGrassRegion(); }
      break;
    case 'KeyG': cycleSnap(); break;
    case 'KeyX': deleteSelection(); break;
    case 'KeyV': duplicateSelection(); break;
    case 'BracketLeft': rotateSelection(e.shiftKey ? -5 : -15); break;
    case 'BracketRight': rotateSelection(e.shiftKey ? 5 : 15); break;
    case 'Minus': scaleSelection(0.9); break;
    case 'Equal': scaleSelection(1.1); break;
    case 'KeyL': workLight.visible = !workLight.visible; status('work light ' + (workLight.visible ? 'ON' : 'off')); break;
    case 'KeyN': status('night preview ' + (toggleNight() ? 'ON' : 'off')); break;
    default:

      const yaw = euler.y;
      const f = [Math.sin(yaw) * -1, Math.cos(yaw) * -1];
      const r = [-f[1], f[0]];
      if (e.code === 'ArrowUp') nudgeSelection(f[0], 0, f[1]);
      if (e.code === 'ArrowDown') nudgeSelection(-f[0], 0, -f[1]);
      if (e.code === 'ArrowRight') nudgeSelection(r[0], 0, r[1]);
      if (e.code === 'ArrowLeft') nudgeSelection(-r[0], 0, -r[1]);
      if (e.code === 'PageUp') nudgeSelection(0, 1, 0);
      if (e.code === 'PageDown') nudgeSelection(0, -1, 0);
  }
}

export function initUI() {

  $('placeKind').addEventListener('change', function() {
    $('rowModel').style.display = this.value === 'prop' ? '' : 'none';
    $('blockOpts').style.display = this.value === 'block' ? '' : 'none';
    $('rowEntKind').style.display = this.value === 'ent' ? '' : 'none';
    makeGhost();
  });
  $('entSel').addEventListener('change', function() {
    $('rowEntTeam').style.display = this.value === 'pvp' ? '' : 'none';
    makeGhost();
  });
  $('teamSel').addEventListener('change', makeGhost);


  function syncPvpUi() {
    const on = !!S.map.pvp;
    $('pvpToggle').checked = on;
    $('nightToggle').checked = !!S.map.night;
    $('midnightToggle').checked = !!S.map.midnight;
    Array.prototype.forEach.call($('entSel').options, function(o) {
      if (o.value === 'pvp') o.hidden = !on;
      if (o.value === 'player') o.hidden = on;
    });
    if (on && $('entSel').value === 'player') $('entSel').value = 'pvp';
    if (!on && $('entSel').value === 'pvp') $('entSel').value = 'player';
    $('rowEntTeam').style.display = $('entSel').value === 'pvp' ? '' : 'none';
  }
  $('pvpToggle').addEventListener('change', function() {
    S.map.pvp = this.checked;
    syncPvpUi();
    rebuildAll();
    dump(); saveAutosave();
    status(this.checked ? 'pvp map - place team-1 and team-2 spawns' : 'pvp mode off');
  });
  $('nightToggle').addEventListener('change', function() {
    S.map.night = this.checked;
    setNight(this.checked, S.map.midnight);
    syncPvpUi();
    dump(); saveAutosave();
    status(this.checked ? 'night map - saved' : 'night off');
  });
  $('midnightToggle').addEventListener('change', function() {
    S.map.midnight = this.checked;
    setNight(S.map.night, this.checked);
    syncPvpUi();
    dump(); saveAutosave();
    status(this.checked ? 'midnight - almost blind' : 'midnight off');
  });
  $('fogToggle').checked = isFogHidden();
  $('fogToggle').addEventListener('change', function() {
    setFogHidden(this.checked);
    status(this.checked ? 'fog hidden - far view' : 'fog on');
  });
  const fd=$('fogDensity'), fdv=$('fogDensityV');
  fd.value = String(S.map.fog != null ? S.map.fog : getFogSlider());
  fdv.textContent = fd.value + '%';
  setFogSlider(fd.value);
  fd.addEventListener('input', function(){
    fdv.textContent = this.value + '%';
    setFogSlider(this.value);
    dump(); saveAutosave();
  });

  function pvpSpawnCheck() {
    if (!S.map.pvp) return true;
    const teams = S.map.entities.filter(function(e) { return e.kind === 'pvp'; });
    if (!teams.some(function(e) { return e.team === 1; }) || !teams.some(function(e) { return e.team === 2; })) {
      status('PvP map needs at least one team-1 and one team-2 pvp spawn');
      return false;
    }
    return true;
  }
  $('primSel').addEventListener('change', makeGhost);
  $('blockColor').addEventListener('change', makeGhost);
  $('texSel').addEventListener('change', makeGhost);
  $('placeScale').addEventListener('input', function() {
    $('placeScaleV').textContent = parseFloat(this.value).toFixed(2);
    makeGhost();
  });
  $('placeRotY').addEventListener('input', function() {
    $('placeRotYV').textContent = this.value + '°';
    if (S.ghost) S.ghost.rotation.y = THREE.MathUtils.degToRad(parseFloat(this.value) || 0);
  });


  [['tbRaise', 'raise'], ['tbLower', 'lower'], ['tbSmooth', 'smooth'], ['tbFlatten', 'flatten']].forEach(function(pair) {
    $(pair[0]).addEventListener('click', function() {
      setBrushMode(pair[1]);
      ['tbRaise', 'tbLower', 'tbSmooth', 'tbFlatten'].forEach(function(id) { $(id).classList.remove('on'); });
      this.classList.add('on');
    });
  });
  $('tbReset').addEventListener('click', function() {
    pushUndo();
    S.map.terrain.heights = formulaGrid(S.map.terrain.segs, S.map.terrain.size);
    rebuildAll();
    dump(); saveAutosave();
    status('terrain reset');
  });
  $('tbRadius').addEventListener('input', function() { $('tbRadiusV').textContent = this.value + 'm'; });
  $('tbStrength').addEventListener('input', function() { $('tbStrengthV').textContent = parseFloat(this.value).toFixed(1); });
  $('tbExtreme').addEventListener('change', function() {
    const on = this.checked;
    $('tbRadius').max = on ? 120 : 30;
    $('tbStrength').max = on ? 80 : 17;
    status(on ? 'extreme brush - radius 120m / strength 80' : 'brush normal');
  });
  $('tbMountains').addEventListener('click', generateMountains);
  $('tbBakeStone').addEventListener('click', function() {
    bakeStone(parseFloat($('mtAbove').value) || 6);
    status('stone re-baked above ' + $('mtAbove').value + 'm');
  });
  $('mtPeak').addEventListener('input', function() { $('mtPeakV').textContent = this.value + 'm'; });
  $('mtAbove').addEventListener('input', function() { $('mtAboveV').textContent = this.value + 'm'; });
  $('pixSize').addEventListener('input', function() { $('pixSizeV').textContent = this.value; });
  $('pixLevels').addEventListener('input', function() { $('pixLevelsV').textContent = this.value; });


  $('toolSelect').onclick = function() { setTool('select'); };
  $('toolPlace').onclick = function() { setTool('place'); makeGhost(); };
  $('toolTerrain').onclick = function() { setTool('terrain'); };
  $('toolRoute').onclick = function() { setTool('route'); };
  $('toolPaint').onclick = function() { setTool('paint'); };
  $('toolWall').onclick = function() { setTool('wall'); };
  $('toolStory').onclick = function() { setTool('story'); };
  $('toolGreenery').onclick = function() { setTool('greenery'); };
  $('toolSector').onclick = function() { setTool('sector'); };
  $('toolGrass').onclick = function() { setTool('grass'); };

  [['wsFile', 'mapFwin'], ['wsPvp', 'pvpFwin'], ['wsGround', 'groundFwin'],
   ['wsView', 'viewFwin'], ['wsSel', 'selFwin']].forEach(function(p) {
    $(p[0]).onclick = function() {
      const fw = $(p[1]);
      const showing = fw.style.display !== 'none';
      showWs(p[0], p[1], !showing);
    };
  });
  showWs('wsFile', 'mapFwin', true);
  $('wFinish').onclick = finishWall;
  $('wBackspace').onclick = backspaceWall;
  $('wClearAll').onclick = function() {
    if (!(S.map.walls || []).length) return;
    pushUndo();
    S.map.walls = [];
    S.wallDraft = null;
    rebuildAll();
    dump(); saveAutosave();
    status('all walls cleared');
  };


  $('sFinish').onclick = function() { finishSector(); renderSectorList(); };
  $('sAutoFind').onclick = function() {
    pushUndo();
    const n = autoFindUgvs();
    renderSectorList();
    dump(); saveAutosave();
    status('auto-find: ' + n + ' UGV' + (n === 1 ? '' : 's') + ' assigned to their areas');
  };
  $('sBackspace').onclick = backspaceSector;
  $('sClearAll').onclick = function() {
    if (!(S.map.sectors || []).length) return;
    pushUndo();
    S.map.sectors = [];
    S.map.entities.forEach(function(e) { e.sector = undefined; });
    S.sectorDraft = null;
    rebuildAll();
    renderSectorList();
    dump(); saveAutosave();
    status('all sectors cleared');
  };

  $('bDup').onclick = duplicateSelection;
  $('bDel').onclick = deleteSelection;
  $('snapBtn').onclick = cycleSnap;


  $('bAddLayer').addEventListener('click', addLayer);
  $('bClearPaint').addEventListener('click', clearGroundPaint);
  $('pbRadius').addEventListener('input', function() { $('pbRadiusV').textContent = this.value + 'm'; });
  $('pbOpacity').addEventListener('input', function() { $('pbOpacityV').textContent = parseFloat(this.value).toFixed(2); });


  function applyGround() {
    const gs = $('groundSel');
    const gt = $('groundTile');
    const gu = Math.max(0, Math.min(100, +$('groundUnlit').value || 0)) / 100;
    $('groundUnlitV').textContent = Math.round(gu * 100) + '%';
    const tile = Math.max(0.5, parseFloat(gt.value) || 4);
    gt.value = tile;
    S.map.ground = gs.value ? { tex: gs.value, tile: tile, unlit: gu } : null;
    refreshGroundMaterial();
    dump(); saveAutosave();
    status(S.map.ground ? 'base ground tile set' : 'base ground = default grass');
  }
  const groundSel = $('groundSel');
  groundSel.addEventListener('change', applyGround);
  $('groundTile').addEventListener('input', applyGround);
  $('groundUnlit').addEventListener('input', applyGround);
  $('groundReset').onclick = function() {
    groundSel.value = '';
    $('groundTile').value = 4;
    $('groundUnlit').value = 0;
    applyGround();
  };
  $('groundUpload').onclick = function() { $('groundFile').click(); };
  $('groundFile').addEventListener('change', function(e) {
    const f = e.target.files[0];
    if (!f) return;
    const img = new Image();
    img.onload = function() {
      const cap = 512;
      const sc = Math.min(1, cap / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * sc));
      cv.height = Math.max(1, Math.round(img.height * sc));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const tex = cv.toDataURL('image/png');
      addCustomTexture(f.name.replace(/\.[^.]*$/, ''), tex);
      groundSel.value = tex;
      applyGround();
    };
    img.onerror = function() { status("couldn't decode \"" + f.name + '" as an image'); };
    img.src = URL.createObjectURL(f);
  });
  if (S.map.ground && S.map.ground.tex) {
    groundSel.value = S.map.ground.tex;
    $('groundTile').value = S.map.ground.tile || 4;
    const gu0 = Math.round((+(S.map.ground.unlit ?? 0) || 0) * 100);
    $('groundUnlit').value = gu0;
    $('groundUnlitV').textContent = gu0 + '%';
  }


  $('mapName').addEventListener('input', function() { S.map.name = this.value; });
  function applySizeFromInput() {
    const v = Math.max(50, Math.min(1000, parseFloat($('mapSize').value) || 200));
    $('mapSize').value = v;
    if (!S.map.terrain) S.map.terrain = { segs: segsForSize(v), size: v, heights: formulaGrid(segsForSize(v), v) };
    if (Math.abs((parseFloat(S.map.terrain.size) || 0) - v) < 0.01) return;
    pushUndo();
    const oldN = S.map.terrain.segs, newN = segsForSize(v);
    S.map.terrain.size = v;
    S.map.terrain.segs = newN;
    if (oldN !== newN) S.map.terrain.heights = bilinearResample(S.map.terrain.heights, oldN, newN);
    rebuildAll(); dump(); saveAutosave();
    status('terrain ' + v + 'm - resampled to ' + newN + 'x' + newN + ' grid (heights stretched)');
  }
  $('mapSize').addEventListener('change', applySizeFromInput);
  $('mapSize').addEventListener('input', function(){ /* live preview without undo flood */ });
  $('bNew').onclick = function() {
    pushUndo();
    S.map = freshMap($('mapName').value || 'map01', parseFloat($('mapSize').value) || 200);
    rebuildAll(); dump(); saveAutosave();
    syncPvpUi();
    status('fresh ' + SIZE + 'm map (formula terrain)');
  };
  $('bPlay').onclick = async function() {
    if (!pvpSpawnCheck()) return;
    try {
      await idb.set('gault_draft', JSON.stringify(S.map));
      window.open('../index.html?map=__draft', '_blank');
    } catch (e) { status('play failed: ' + e.message); }
  };
  $('bExport').onclick = function() {
    if (!pvpSpawnCheck()) return;
    dumpNow();
    show($('exportModal'));
    status('export - drop the file into maps/ and run index.html?map=<name>');
  };
  $('bDownloadJson').onclick = function() {
    const blob = new Blob([JSON.stringify(S.map, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ($('mapName').value || 'map') + '.umm';
    a.click();
  };
  $('bCopyJson').onclick = function() {
    const t = $('outJson').value;
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function() { status('copied JSON'); }, function() {});
    else status('copy not supported');
  };
  $('bPixelize').onclick = function() { show($('pixelizerModal')); };
  $('bHelp').onclick = function() { show($('helpModal')); };
  $('bImport').onclick = function() { $('importFile').click(); };
  $('importFile').addEventListener('change', function(e) {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = function() {
      try {
        pushUndo();
        S.map = JSON.parse(r.result);
        if (!S.map.routes) S.map.routes = { ugv: [] };
        $('mapName').value = S.map.name || 'imported';
        rebuildAll(); dump(); saveAutosave();
        syncPvpUi();
        status('imported ' + f.name);
      } catch (err) { status('import failed: ' + err.message); }
    };
    r.readAsText(f);
  });
  $('bSaveSlot').onclick = async function() {
    const n = prompt('slot name:', $('mapName').value || 'map01');
    if (!n) return;
    try {
      await idb.set('gault_slot_' + n, JSON.stringify(S.map));
      status('saved slot "' + n + '"');
    } catch (e) { status('save failed (too big?): ' + e.message); }
  };
  $('bLoadSlot').onclick = async function() {
    const slotKeys = await idb.keys('gault_slot_');
    const names = slotKeys.map(function(k) { return k.slice(11); });
    if (!names.length) return status('no slots saved yet');
    const n = prompt('slots:\n- ' + names.join('\n- ') + '\n\nload which?', names[0]);
    if (!n) return;
    const j = await idb.get('gault_slot_' + n);
    if (!j) return status('no such slot');
    pushUndo();
    S.map = JSON.parse(j);
    if (!S.map.routes) S.map.routes = { ugv: [] };
    $('mapName').value = S.map.name || n;
    rebuildAll(); dump(); saveAutosave();
    syncPvpUi();
    status('loaded "' + n + '"');
  };
  syncPvpUi();
  setPvpRebuild(syncPvpUi);
}





export function renderSectorList() {
  const el = $('sectorList');
  el.innerHTML = '';
  const sectors = S.map.sectors || [];
  const ugvs = [];
  S.map.entities.forEach(function(e, i) { if (e.kind === 'ugv') ugvs.push(i); });
  sectors.forEach(function(s, si) {
    const row = document.createElement('div');
    row.className = 'srow';
    const label = document.createElement('span');
    label.textContent = 'Sector ' + si + '  (' + (s.pts || []).length + ' pts)';
    row.appendChild(label);
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'delete sector (fixes up UGV assignments)';
    del.onclick = function() { deleteSector(si); renderSectorList(); };
    row.appendChild(del);
    el.appendChild(row);
    if (!ugvs.length) {
      const hint = document.createElement('div');
      hint.className = 'shint';
      hint.textContent = 'no UGVs placed yet - Place tool → entity → UGV';
      el.appendChild(hint);
    } else {
      const boxRow = document.createElement('div');
      boxRow.className = 'row';
      ugvs.forEach(function(ui) {
        const l = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = S.map.entities[ui].sector === si;
        cb.title = 'UGV at ' + S.map.entities[ui].pos[0] + ',' + S.map.entities[ui].pos[1];
        cb.onchange = function() {
          pushUndo();
          S.map.entities[ui].sector = cb.checked ? si : undefined;
          dump(); saveAutosave();
        };
        l.appendChild(cb);
        l.appendChild(document.createTextNode('U' + ui));
        boxRow.appendChild(l);
      });
      el.appendChild(boxRow);
    }
  });
  if (!sectors.length) {
    const hint = document.createElement('div');
    hint.className = 'shint';
    hint.textContent = 'draw a closed area with the sector tool (9) - UGVs you check here stay inside it';
    el.appendChild(hint);
  }
}
