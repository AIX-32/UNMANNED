'use strict';
import { S } from './state.js';
import { $, scene, loadProto, sampleHeight, pushUndo, dump, saveAutosave, rebuildAll, status, showSelInfo, refreshOutlines, addPinButton } from './core.js';
import { rebuildOne } from './tools.js';

// stepnate workspace — trigger spots + what they do. ponytail: MOVE refs props[] by index
// (pick = click the prop, then drag it to its end spot + Enter; dropdown fallback), re-pick after deleting props.

const STY = 'background:#111;color:#ddd;border:1px solid #333;font:inherit';
const NIN = 'width:46px;' + STY;
const BIN = 'background:#222;color:#ddd;border:1px solid #444;padding:2px 8px;font:inherit;cursor:pointer';

let selIdx = -1; // entities index of the trigger being edited
let fw = null, btn = null;

export function initStepnate() {
  if (fw) return;
  fw = document.createElement('div');
  fw.id = 'stepnateFwin'; fw.className = 'fwin';
  fw.style.right = '8px'; fw.style.top = '44px'; fw.style.width = '330px'; fw.style.display = 'none';
  fw.innerHTML = `<div class="fwin-head"><span class="fwin-title">STEPNATE — triggers</span><button class="fwin-close" id="stepnateFwinClose">×</button></div>
  <div class="fwin-body">
    <div class="row"><button id="stgPlace">+ place new trigger</button><span style="color:#888;font-size:9px"> Place tool, entity preset</span></div>
    <div id="stgList" class="slist" style="max-height:110px"></div>
    <div id="stgEditor" style="border-top:1px solid #3a3a3a;margin-top:6px;padding-top:6px"></div>
    <div class="row" style="color:#888;font-size:9px">Fires once: walk-in or on enemy death in radius. Actions run top-to-bottom, each after its delay. MOVE: pick, click the prop, drag it to its END spot, press Enter.</div>
  </div>`;
  document.body.appendChild(fw);
  try { addPinButton(fw); } catch (e) {}
  const launchers = document.getElementById('wsLaunchers');
  if (launchers) {
    btn = document.createElement('button'); btn.id = 'wsStepnate'; btn.textContent = 'Stepnate'; btn.title = 'trigger spots: move props / spawn / say';
    btn.onclick = function() { const showing = fw.style.display !== 'none'; fw.style.display = showing ? 'none' : 'block'; btn.classList.toggle('on', !showing); render(); };
    launchers.appendChild(btn);
  }
  document.getElementById('stepnateFwinClose').addEventListener('click', function() { fw.style.display = 'none'; if (btn) btn.classList.remove('on'); });
  document.getElementById('stgPlace').onclick = function() {
    const tp = document.getElementById('toolPlace'); if (tp) tp.click();
    const pk = document.getElementById('placeKind'); pk.value = 'ent'; pk.dispatchEvent(new Event('change', { bubbles: true }));
    const es = document.getElementById('entSel'); es.value = 'trigger'; es.dispatchEvent(new Event('change', { bubbles: true }));
    status('stepnate: aim + click to stamp the trigger spot');
  };
  document.addEventListener('keydown', function(e) {
    const typing = /INPUT|TEXTAREA|SELECT/.test((document.activeElement && document.activeElement.tagName) || '');
    if (e.code === 'Escape') {
      if (S.stepnatePick) { cancelPick(); render(); }
      else if (S.stepnateSpot) { S.stepnateSpot = null; document.body.style.cursor = ''; status('stepnate: end spot cancelled'); render(); }
      else if (S.stepnateAim) { const m = S.stepnateAim; S.stepnateAim = null; restore(m); status('stepnate: aim cancelled — prop restored'); render(); }
    } else if (e.code === 'Enter' && S.stepnateAim && !typing) {
      confirmAim(); render();
    }
  });
  window.__renderStepnate = render;
  window.__stepnateAimRestore = function() { if (S.stepnateAim) { const m = S.stepnateAim; S.stepnateAim = null; restore(m); } };
  window.__stepnateSelect = function(i) {
    selIdx = i;
    if (fw.style.display === 'none') { fw.style.display = 'block'; if (btn) btn.classList.add('on'); }
    render();
  };
}

function cancelPick() {
  S.stepnatePick = null;
  document.body.style.cursor = '';
  status('stepnate: pick cancelled');
}

function startPick(a) {
  S.stepnateSpot = null;
  S.stepnatePick = { a: a };
  document.body.style.cursor = 'crosshair';
  status('STEPNATE: click the prop — then drag it to its end spot and press Enter');
}

function startSpot(a) {
  S.stepnatePick = null;
  S.stepnateSpot = { a: a };
  document.body.style.cursor = 'crosshair';
  status('STEPNATE: click where the prop should end up — Esc cancels');
}

// ghost preview: translucent clone of each moved prop at its end position (hidden while that action is aimed — the displaced prop is the live preview)
let ghostGroup = null;
function disposeGhost(o) {
  o.traverse(function(c) {
    if (c.isMesh && c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(function(m) { m.dispose(); });
  });
}
function updateGhosts(e) {
  if (!ghostGroup) { ghostGroup = new THREE.Group(); scene.add(ghostGroup); }
  while (ghostGroup.children.length) disposeGhost(ghostGroup.children.pop());
  if (!e || !e.actions) return;
  e.actions.forEach(function(a) {
    if (a.act !== 'move') return;
    if (S.stepnateAim && S.stepnateAim.a === a) return;
    if (!a.dx && !a.dy && !a.dz) return;
    const p = (S.map.props || [])[a.prop];
    if (!p || p.model === 'tree.gltf' || p.model === 'bush.gltf') return;
    loadProto(p.model, function(proto) {
      const m = proto.clone();
      m.scale.setScalar(p.scale || 1);
      m.position.set(p.pos[0] + (a.dx || 0), (p.y != null ? p.y : sampleHeight(p.pos[0], p.pos[1])) + (a.dy || 0), p.pos[1] + (a.dz || 0));
      m.rotation.y = THREE.MathUtils.degToRad(p.rotY || 0);
      m.traverse(function(c) {
        if (c.isMesh) {
          c.castShadow = false; c.receiveShadow = false;
          c.material = Array.isArray(c.material) ? c.material.map(function(x) { const n = x.clone(); n.transparent = true; n.opacity = 0.4; return n; })
            : (function() { const n = c.material.clone(); n.transparent = true; n.opacity = 0.4; return n; })();
        }
      });
      ghostGroup.add(m);
    });
  });
}

// aim: the picked prop is temporarily displaced with the normal drag/nudge controls;
// confirm stores the offset into the action and snaps the prop back to its map position
function restore(m) {
  const p = (S.map.props || [])[m.i];
  if (p) {
    p.pos[0] = m.x; p.pos[1] = m.z;
    if (m.yNum) p.y = m.y; else delete p.y;
    rebuildOne('prop', m.i);
  }
  dump(); saveAutosave();
}

function confirmAim() {
  const m = S.stepnateAim; if (!m) return;
  S.stepnateAim = null;
  const p = (S.map.props || [])[m.i];
  if (p) {
    pushUndo();
    m.a.dx = +(p.pos[0] - m.x).toFixed(2);
    m.a.dz = +(p.pos[1] - m.z).toFixed(2);
    if (m.yNum && typeof p.y === 'number') m.a.dy = +(p.y - m.y).toFixed(2);
    status('stepnate: target set — Δ(' + m.a.dx + ', ' + (m.a.dy || 0) + ', ' + m.a.dz + ')');
  }
  restore(m);
}

function render() {
  const ents = S.map.entities || [];
  if (selIdx >= ents.length || !ents[selIdx] || ents[selIdx].kind !== 'trigger') selIdx = -1;
  updateGhosts(selIdx >= 0 ? ents[selIdx] : null);
  const list = document.getElementById('stgList'); list.innerHTML = '';
  let any = false;
  ents.forEach(function(e, i) {
    if (e.kind !== 'trigger') return;
    any = true;
    const row = document.createElement('div');
    row.className = 'srow';
    if (i === selIdx) row.style.background = '#2a2a15';
    const lab = document.createElement('span');
    const n = (e.actions || []).length;
    lab.textContent = '↯ #' + i + ' — ' + (e.trig === 'kill' ? 'on enemy death' : 'walk-in') + ' r' + (e.r != null ? e.r : 8) + ' · ' + n + ' action' + (n === 1 ? '' : 's');
    lab.style.cssText = 'cursor:pointer;font-size:10px';
    lab.onclick = function() {
      selIdx = i; S.selection = { kind: 'ent', i: i }; S.multiSel = null;
      showSelInfo(); refreshOutlines(); render();
    };
    const del = document.createElement('button'); del.textContent = '✕';
    del.onclick = function() {
      pushUndo(); ents.splice(i, 1);
      if (selIdx === i) selIdx = -1; else if (selIdx > i) selIdx--;
      S.selection = null;
      rebuildAll(); dump(); saveAutosave(); showSelInfo(); refreshOutlines();
    };
    row.appendChild(lab); row.appendChild(del);
    list.appendChild(row);
  });
  if (!any) list.innerHTML = '<div style="color:#888;font-size:10px">no triggers yet — place one above, or Place → entity → trigger (stepnate)</div>';
  const ed = document.getElementById('stgEditor');
  let banner = '';
  if (S.stepnateAim) {
    const m = S.stepnateAim, p = (S.map.props || [])[m.i];
    let pend = '';
    if (p) {
      const dy = (m.yNum && typeof p.y === 'number') ? (p.y - m.y).toFixed(1) : '0';
      pend = ' — Δ now (' + (p.pos[0] - m.x).toFixed(1) + ', ' + dy + ', ' + (p.pos[1] - m.z).toFixed(1) + ')';
    }
    banner = '<div style="background:#3a3015;border:1px solid #665522;padding:5px;margin-bottom:5px;font-size:10px">AIMING prop #' + m.i + pend +
      '<br>drag / arrows / PageUp-Down it to its END spot, then ' +
      '<button id="stgAimOk" style="' + BIN + '">✓ done (Enter)</button> <button id="stgAimNo" style="' + BIN + '">✕ cancel (Esc)</button></div>';
  }
  if (selIdx < 0) { ed.innerHTML = banner + '<div style="color:#888;font-size:10px">select a trigger above, or click one in the world</div>'; return; }
  renderEd(ents[selIdx], selIdx, banner);
}

function renderEd(e, idx, banner) {
  if (e.trig == null) e.trig = 'area';
  if (e.r == null) e.r = 8;
  if (!e.actions) e.actions = [];
  const ed = document.getElementById('stgEditor');
  ed.innerHTML = banner + '<div style="margin-bottom:4px"><b>TRIGGER #' + idx + '</b> — ' +
    '<select id="stgTrig" style="' + STY + '"><option value="area">walk into spot</option><option value="kill">on enemy death</option></select>' +
    ' <input id="stgRad" type="number" min="1" max="60" step="1" value="' + e.r + '" style="width:52px;' + STY + '"> m</div>' +
    '<div style="color:#888;font-size:10px;margin-top:2px">on fire, in order:</div>' +
    '<div id="stgActs"></div>' +
    '<div style="margin-top:4px">' +
    '<button data-add="move" style="' + BIN + '">+ move prop</button> ' +
    '<button data-add="spawn" style="' + BIN + '">+ spawn</button> ' +
    '<button data-add="say" style="' + BIN + '">+ say line</button></div>';
  const ok = ed.querySelector('#stgAimOk'); if (ok) ok.onclick = function() { confirmAim(); render(); };
  const no = ed.querySelector('#stgAimNo'); if (no) no.onclick = function() { const m = S.stepnateAim; S.stepnateAim = null; restore(m); status('stepnate: aim cancelled — prop restored'); render(); };
  const stg = function() { pushUndo(); dump(); saveAutosave(); };
  const trig = ed.querySelector('#stgTrig'); trig.value = e.trig;
  trig.addEventListener('change', function() { e.trig = trig.value; stg(); rebuildAll(); });
  const rad = ed.querySelector('#stgRad');
  rad.addEventListener('change', function() { e.r = Math.max(1, Math.min(60, parseFloat(rad.value) || 8)); stg(); rebuildAll(); });
  ed.querySelectorAll('button[data-add]').forEach(function(b) {
    b.addEventListener('click', function() {
      const k = b.dataset.add;
      if (k === 'move') e.actions.push({ act: 'move', prop: 0, dx: 0, dy: 0, dz: 0, dur: 2, delay: 0 });
      else if (k === 'spawn') e.actions.push({ act: 'spawn', kind: 'ugv', delay: 0 });
      else e.actions.push({ act: 'say', text: '', delay: 0 });
      stg(); render();
    });
  });
  renderActs(e, stg);
}

function renderActs(e, stg) {
  const ed = document.getElementById('stgEditor');
  const w = ed.querySelector('#stgActs'); w.innerHTML = '';
  if (!e.actions.length) { w.innerHTML = '<div style="color:#888;font-size:10px;margin-top:3px">nothing yet — firing does nothing</div>'; return; }
  e.actions.forEach(function(a, ai) {
    const d = document.createElement('div');
    d.style.cssText = 'border:1px solid #333;background:#141414;padding:4px;margin-top:4px';
    let head = '<b>' + (a.act === 'move' ? 'MOVE PROP' : a.act === 'spawn' ? 'SPAWN' : 'SAY') + '</b>';
    let body = '';
    if (a.act === 'move') {
      const p = (S.map.props || [])[a.prop];
      const aiming = S.stepnateAim && S.stepnateAim.a === a;
      const picking = S.stepnatePick && S.stepnatePick.a === a;
      const spotting = S.stepnateSpot && S.stepnateSpot.a === a;
      head += ' <button data-pick="1" style="' + BIN + '">' + (aiming ? 'aiming…' : picking ? 'picking…' : 'pick') + '</button>' +
        ' <button data-spot="1" style="' + BIN + '">' + (spotting ? 'click spot…' : 'end spot') + '</button>';
      const opts = (S.map.props || []).map(function(pp, i) {
        const fixed = pp.model === 'tree.gltf' || pp.model === 'bush.gltf';
        return '<option value="' + i + '">#' + i + ' ' + pp.model + (fixed ? ' (unmovable)' : '') + '</option>';
      }).join('');
      body = '<select data-k="prop" style="' + STY + ';max-width:120px">' + (opts || '<option value="">— no props in map —</option>') + '</select> <span style="color:#888">' + (p ? p.model : '') + '</span>' +
        '<div style="margin-top:3px">Δx <input data-k="dx" type="number" step="0.5" style="' + NIN + '"> Δy <input data-k="dy" type="number" step="0.5" style="' + NIN + '"> Δz <input data-k="dz" type="number" step="0.5" style="' + NIN + '"> <span style="color:#777">or use pick / end spot</span></div>' +
        '<div style="margin-top:3px">over <input data-k="dur" type="number" min="0" step="0.5" style="' + NIN + '"> s · delay <input data-k="delay" type="number" min="0" step="0.5" style="' + NIN + '"> s</div>';
    } else if (a.act === 'spawn') {
      body = 'kind <select data-k="kind" style="' + STY + '"><option value="ugv">ugv</option><option value="turret">turret</option><option value="boss">boss</option><option value="drone">drone</option></select>' +
        '<div style="margin-top:3px">x <input data-k="x" type="number" step="1" placeholder="auto" style="' + NIN + '"> z <input data-k="z" type="number" step="1" placeholder="auto" style="' + NIN + '"> rotY <input data-k="rotY" type="number" step="15" style="' + NIN + '">°</div>' +
        '<div style="margin-top:3px">delay <input data-k="delay" type="number" min="0" step="0.5" style="' + NIN + '"> s <span style="color:#777">(empty x/z = at the trigger)</span></div>';
    } else {
      body = 'text <input data-k="text" style="width:170px;' + STY + '">' +
        '<div style="margin-top:3px">delay <input data-k="delay" type="number" min="0" step="0.5" style="' + NIN + '"> s</div>';
    }
    d.innerHTML = head + ' <button data-x="1" style="float:right;' + BIN + '">✕</button><div style="margin-top:3px;font-size:10px">' + body + '</div>';
    d.querySelector('button[data-x]').addEventListener('click', function() { e.actions.splice(ai, 1); stg(); render(); });
    const pk = d.querySelector('button[data-pick]');
    if (pk) pk.addEventListener('click', function() { startPick(a); render(); });
    const sp = d.querySelector('button[data-spot]');
    if (sp) sp.addEventListener('click', function() { startSpot(a); render(); });
    d.querySelectorAll('[data-k]').forEach(function(inp) {
      const k = inp.dataset.k;
      if (a[k] != null) inp.value = a[k];
      inp.addEventListener('change', function() {
        if (k === 'text') a.text = inp.value;
        else if (k === 'kind') a.kind = inp.value;
        else if (k === 'prop') a.prop = parseInt(inp.value, 10) || 0;
        else if (k === 'x' || k === 'z') { const v = parseFloat(inp.value); if (isNaN(v)) delete a[k]; else a[k] = v; }
        else { const v = parseFloat(inp.value); a[k] = isNaN(v) ? 0 : v; }
        stg();
      });
    });
    w.appendChild(d);
  });
}
