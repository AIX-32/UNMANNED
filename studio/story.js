'use strict';




import { S } from './state.js';
import { scene, $, status, camera, orbit, euler, setStoryRebuild, markerSprite,
         sampleHeight, groundHit, dump, saveAutosave, addPinButton, isPinned } from './core.js';

export const storyGroup = new THREE.Group();
scene.add(storyGroup);


function fwin(title, x, y) {
  const win = document.createElement('div');
  win.className = 'fwin';
  win.style.left = x + 'px';
  win.style.top = y + 'px';
  win.innerHTML = '<div class="fwin-head"><span class="fwin-title">' + title +
    '</span><button class="fwin-close">×</button></div><div class="fwin-body"></div>';
  document.body.appendChild(win);
  const head = win.querySelector('.fwin-head'), body = win.querySelector('.fwin-body');
  let drag = null;
  head.addEventListener('mousedown', function(e) {
    drag = { dx: e.clientX - win.offsetLeft, dy: e.clientY - win.offsetTop };
    e.preventDefault();
  });
  addEventListener('mousemove', function(e) {
    if (!drag) return;
    win.style.left = (e.clientX - drag.dx) + 'px';
    win.style.top = (e.clientY - drag.dy) + 'px';
  });
  addEventListener('mouseup', function() { drag = null; });
  win.querySelector('.fwin-close').onclick = function() { win.style.display = 'none'; };
  return { win: win, body: body,
           show: function() { win.style.display = 'block'; },
           hide: function() { win.style.display = 'none'; } };
}
function rowLabel(txt) {
  const s = document.createElement('span');
  s.textContent = txt;
  return s;
}
function shint(txt) {
  const d = document.createElement('div');
  d.className = 'shint';
  d.textContent = txt;
  return d;
}
function dirty() { dump(); saveAutosave(); }
function ensureStory() {
  if (!S.map.story) S.map.story = { cam: [], sections: [], triggers: [], tut: [] };
  if (!S.map.story.tut) S.map.story.tut = [];
  if (!S.map.story.sections) S.map.story.sections = [];
  if (!S.map.story.cam) S.map.story.cam = [];
  if (!S.map.story.triggers) S.map.story.triggers = [];
}


const wSections = fwin('INTRO STORY SECTIONS', 330, 40);
wSections.win.id = 'storySectionsFwin';
addPinButton(wSections.win);
const secTA = document.createElement('textarea');
secTA.rows = 7;
secTA.placeholder = 'one section per line - each types out on the intro board';
secTA.addEventListener('input', function() {
  ensureStory();
  S.map.story.sections = secTA.value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  dirty();
});
wSections.body.appendChild(secTA);
wSections.body.appendChild(shint('an intro plays on spawn when sections (or a 2+ point camera path) exist'));

// ponytail: tutorial card — one big card with multiple lines, shown after cam + sections
const wTut = fwin('TUTORIAL CARD (after intro)', 700, 230);
wTut.win.id = 'storyTutFwin';
addPinButton(wTut.win);
const tutTA = document.createElement('textarea');
tutTA.rows = 6;
tutTA.placeholder = 'one line per row — shows as one big card after the intro.\ne.g.\nWASD to move\nSHIFT to sprint\nHold RMB to straf';
tutTA.addEventListener('input', function() {
  ensureStory();
  S.map.story.tut = tutTA.value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean);
  dirty();
});
wTut.body.appendChild(tutTA);
wTut.body.appendChild(shint('single big card shown after camera + typed sections. scroll to zoom when viewing.'));


const wCam = fwin('INTRO CUTSCENE CAMERA', 330, 230);
wCam.win.id = 'storyCamFwin';
wCam.win.style.width = '360px';
wCam.win.style.maxHeight = 'calc(100vh - 80px)';
wCam.win.style.display = 'none';
wCam.win.style.flexDirection = 'column';
addPinButton(wCam.win);
// make body scroll inside window instead of letting window grow off-screen
const _camBody = wCam.body;
_camBody.style.display = 'flex'; _camBody.style.flexDirection = 'column'; _camBody.style.gap = '8px';
_camBody.style.overflowY = 'auto'; _camBody.style.maxHeight = 'calc(100vh - 140px)';
_camBody.style.paddingBottom = '8px';
const camAdd = document.createElement('button');
camAdd.textContent = '＋ add point at camera';
const camPrev = document.createElement('button');
camPrev.textContent = '▶ preview';
const camBar = document.createElement('div');
camBar.style.display = 'flex'; camBar.style.gap = '6px'; camBar.style.flexShrink = '0';
camBar.appendChild(camAdd); camBar.appendChild(camPrev);
const camList = document.createElement('div');
camList.className = 'slist';
camList.style.gap = '10px'; camList.style.maxHeight = 'none'; camList.style.overflow = 'visible'; camList.style.paddingRight = '2px';
wCam.body.appendChild(camBar);
wCam.body.appendChild(camList);
wCam.body.appendChild(shint('fly somewhere → ＋ captures position + look. travel = time from previous point, hold = pause, text shows during hold.'));
export const preview = { active: false, t: 0 };

function addCamPoint() {
  ensureStory();
  S.map.story.cam.push({
    x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2),
    yaw: +orbit.yaw.toFixed(3), pitch: +orbit.pitch.toFixed(3), d: 3, hold: 0, text: '', textDur: 0
  });
  renderCamList(); rebuildStoryViz(); dirty();
}
function camRow(i) {
  const p = S.map.story.cam[i];
  const card = document.createElement('div');
  card.style.display = 'flex'; card.style.flexDirection = 'column'; card.style.gap = '0';
  card.style.background = '#262626'; card.style.border = '1px solid #3a3a3a'; card.style.overflow = 'visible'; card.style.flexShrink = '0'; card.style.boxSizing = 'border-box';
  // header
  const head = document.createElement('div');
  head.style.display = 'flex'; head.style.alignItems = 'center'; head.style.justifyContent = 'space-between';
  head.style.padding = '6px 8px'; head.style.background = '#2d2d2d'; head.style.borderBottom = '1px solid #3a3a3a';
  const badge = document.createElement('span');
  badge.textContent = 'SHOT ' + (i + 1);
  badge.style.fontSize = '10px'; badge.style.fontWeight = '600'; badge.style.letterSpacing = '0.4px';
  badge.style.color = '#aac7f0'; badge.style.background = '#1e4b7a'; badge.style.padding = '2px 6px';
  head.appendChild(badge);
  const coords = document.createElement('span');
  coords.textContent = p.x.toFixed(0) + ', ' + p.y.toFixed(0) + ', ' + p.z.toFixed(0);
  coords.style.fontSize = '10px'; coords.style.color = '#6a6a6a'; coords.style.fontFamily = 'monospace';
  head.appendChild(coords);
  const del = document.createElement('button');
  del.textContent = '✕'; del.title = 'remove';
  del.style.padding = '1px 7px'; del.style.fontSize = '10px'; del.style.background = 'transparent'; del.style.border = '1px solid #3d3d3d'; del.style.color = '#8a8a8a';
  del.onmouseenter = function(){ del.style.background='#3a2a2a'; del.style.color='#ff9999'; del.style.borderColor='#6b2a2a'; };
  del.onmouseleave = function(){ del.style.background='transparent'; del.style.color='#8a8a8a'; del.style.borderColor='#3d3d3d'; };
  del.onclick = function() { S.map.story.cam.splice(i, 1); renderCamList(); rebuildStoryViz(); dirty(); };
  head.appendChild(del);
  card.appendChild(head);
  // body
  const body = document.createElement('div');
  body.style.display = 'flex'; body.style.flexDirection = 'column'; body.style.gap = '8px'; body.style.padding = '8px'; body.style.boxSizing = 'border-box';
  function field(labelText, input, hint) {
    const w = document.createElement('label');
    w.style.display = 'flex'; w.style.flexDirection = 'column'; w.style.gap = '3px';
    const lab = document.createElement('span');
    lab.textContent = labelText;
    lab.style.fontSize = '9px'; lab.style.fontWeight = '600'; lab.style.letterSpacing = '0.4px'; lab.style.textTransform = 'uppercase'; lab.style.color = '#9a9a9a';
    w.appendChild(lab);
    input.style.width = '100%';
    w.appendChild(input);
    if (hint) {
      const h = document.createElement('span');
      h.textContent = hint; h.style.fontSize = '9px'; h.style.color = '#5a5a5a'; h.style.fontStyle = 'italic';
      w.appendChild(h);
    }
    return w;
  }
  const hold = document.createElement('input');
  hold.type = 'number'; hold.step = '0.5'; hold.min = '0'; hold.value = p.hold != null ? p.hold : 0;
  hold.placeholder = '0';
  hold.addEventListener('input', function() { p.hold = Math.max(0, +hold.value || 0); dirty(); });
  if (i === 0) {
    body.appendChild(field('hold at start (s)', hold, 'pause on opening shot before moving on'));
  } else {
    const dur = document.createElement('input');
    dur.type = 'number'; dur.step = '0.5'; dur.min = '0.2'; dur.value = p.d != null ? p.d : 3;
    dur.title = 'seconds to travel to this point from previous';
    dur.addEventListener('input', function() { p.d = +dur.value || 0; dirty(); });
    body.appendChild(field('travel from previous (s)', dur));
    body.appendChild(field('hold here (s)', hold, 'pause on this shot before moving on'));
  }
  const txt = document.createElement('input');
  txt.type = 'text'; txt.value = p.text || ''; txt.placeholder = 'subtitle text — leave empty for none';
  txt.addEventListener('input', function() { p.text = txt.value; dirty(); });
  body.appendChild(field('subtitle', txt));
  const tdur = document.createElement('input');
  tdur.type = 'number'; tdur.step = '0.5'; tdur.min = '0'; tdur.value = p.textDur != null ? p.textDur : 0;
  tdur.placeholder = '0 = match hold';
  tdur.addEventListener('input', function() { p.textDur = Math.max(0, +tdur.value || 0); dirty(); });
  body.appendChild(field('subtitle duration (s)', tdur, '0 follows hold, otherwise exact time'));
  card.appendChild(body);
  return card;
}
function renderCamList() {
  camList.innerHTML = '';
  if (!S.map.story.cam.length) { camList.appendChild(shint('no points yet')); return; }
  S.map.story.cam.forEach(function(_, i) { camList.appendChild(camRow(i)); });
}
camAdd.onclick = addCamPoint;
camPrev.onclick = function() {
  if (preview.active) { preview.active = false; camPrev.textContent = '▶ preview'; return; }
  if (S.map.story.cam.length < 2) return status('need 2+ points to preview');
  preview.active = true; preview.t = 0;
  camPrev.textContent = '■ stop';
};


export function lerpAng(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
// ponytail: hold-aware — timeline is hold0 + sum(d_i + hold_i); holds freeze the camera at P_i
export function camTotal(pts) {
  if (!pts.length) return 0;
  let tot = Math.max(0, pts[0].hold || 0);
  for (let i = 1; i < pts.length; i++) tot += Math.max(0.2, pts[i].d != null ? pts[i].d : 3) + Math.max(0, pts[i].hold || 0);
  return tot;
}
export function pathPose(pts, t) {
  if (!pts.length) return null;
  if (pts.length === 1) return pts[0];
  let tt = t;
  const h0 = Math.max(0, pts[0].hold || 0);
  if (tt < h0) return pts[0];
  tt -= h0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.max(0.2, pts[i].d != null ? pts[i].d : 3);
    const hold = Math.max(0, pts[i].hold || 0);
    if (tt < d) {
      const f = Math.min(1, tt / d);
      const e = f * f * (3 - 2 * f);
      const a = pts[Math.max(0, i - 1)], b = pts[i - 1], c = pts[i], dd = pts[Math.min(pts.length - 1, i + 1)];
      const v = new THREE.Vector3();
      v.x = 0.5 * ((2 * b.x) + (-a.x + c.x) * e + (2 * a.x - 5 * b.x + 4 * c.x - dd.x) * e * e + (-a.x + 3 * b.x - 3 * c.x + dd.x) * e * e * e);
      v.y = 0.5 * ((2 * b.y) + (-a.y + c.y) * e + (2 * a.y - 5 * b.y + 4 * c.y - dd.y) * e * e + (-a.y + 3 * b.y - 3 * c.y + dd.y) * e * e * e);
      v.z = 0.5 * ((2 * b.z) + (-a.z + c.z) * e + (2 * a.z - 5 * b.z + 4 * c.z - dd.z) * e * e + (-a.z + 3 * b.z - 3 * c.z + dd.z) * e * e * e);
      return { x: v.x, y: v.y, z: v.z, yaw: lerpAng(b.yaw || 0, c.yaw != null ? c.yaw : 0, e), pitch: (b.pitch || 0) + ((c.pitch != null ? c.pitch : 0) - (b.pitch || 0)) * e };
    }
    tt -= d;
    if (tt < hold) return pts[i];
    tt -= hold;
  }
  return pts[pts.length - 1];
}


export function updatePreview(dt) {
  if (S.tool !== 'story' || !preview.active) return false;
  preview.t += dt;
  const pts = S.map.story.cam;
  const total = camTotal(pts);
  const P = pathPose(pts, preview.t);
  if (!P) { preview.active = false; return false; }
  camera.position.set(P.x, P.y, P.z);
  euler.set(P.pitch, P.yaw, 0, 'YXZ');
  camera.quaternion.setFromEuler(euler);
  orbit.pos.copy(camera.position);
  orbit.yaw = P.yaw; orbit.pitch = P.pitch;
  if (preview.t >= total) { preview.active = false; camPrev.textContent = '▶ preview'; }
  return true;
}


const wTrig = fwin('STORY TEXT ZONES', 700, 40);
wTrig.win.id = 'storyTrigFwin';
addPinButton(wTrig.win);
const trigAdd = document.createElement('button');
trigAdd.textContent = '＋ add zone at cursor';
const trigList = document.createElement('div');
trigList.className = 'slist';
wTrig.body.appendChild(trigAdd);
wTrig.body.appendChild(trigList);
wTrig.body.appendChild(shint('aim at the ground → ＋. Walk into the ring in-game → its text subtitles.'));
function addTrigger() {
  ensureStory();
  const hit = groundHit();
  if (!hit) return status('aim at the ground first');
  S.map.story.triggers.push({ x: +hit.point.x.toFixed(2), z: +hit.point.z.toFixed(2), r: 8, text: '' });
  renderTrigList(); rebuildStoryViz(); dirty();
}
function trigRow(i) {
  const t = S.map.story.triggers[i];
  const row = document.createElement('div');
  row.className = 'srow trigrow';
  const r = document.createElement('input');
  r.type = 'number'; r.step = '1'; r.min = '1'; r.value = t.r != null ? t.r : 8;
  r.title = 'radius m';
  r.addEventListener('input', function() { t.r = +r.value || 8; rebuildStoryViz(); dirty(); });
  const txt = document.createElement('input');
  txt.type = 'text'; txt.value = t.text || '';
  txt.placeholder = 'text shown on entry';
  txt.addEventListener('input', function() { t.text = txt.value; dirty(); });
  const del = document.createElement('button');
  del.textContent = '✕';
  del.onclick = function() { S.map.story.triggers.splice(i, 1); renderTrigList(); rebuildStoryViz(); dirty(); };
  row.appendChild(r); row.appendChild(txt); row.appendChild(del);
  return row;
}
function renderTrigList() {
  trigList.innerHTML = '';
  if (!S.map.story.triggers.length) { trigList.appendChild(shint('no zones yet')); return; }
  S.map.story.triggers.forEach(function(_, i) { trigList.appendChild(trigRow(i)); });
}
trigAdd.onclick = addTrigger;


export function rebuildStoryViz() {
  while (storyGroup.children.length) storyGroup.remove(storyGroup.children[0]);
  ensureStory();
  const st = S.map.story;
  (st.cam || []).forEach(function(p, i) {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x5ab4ff }));
    dot.position.set(p.x, p.y, p.z);
    storyGroup.add(dot);
    const m = markerSprite(String(i + 1), '#5ab4ff');
    m.position.set(p.x, p.y + 1.1, p.z);
    storyGroup.add(m);
  });
  if (st.cam.length > 1) {
    const g = new THREE.BufferGeometry().setFromPoints(st.cam.map(function(p) {
      return new THREE.Vector3(p.x, p.y, p.z); }));
    storyGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x5ab4ff })));
  }
  (st.triggers || []).forEach(function(t, i) {
    const gy = sampleHeight(t.x, t.z);
    const ring = [];
    for (let a = 0; a < 32; a++) {
      const ang = a / 32 * Math.PI * 2;
      ring.push(new THREE.Vector3(t.x + Math.cos(ang) * t.r, gy + 0.35, t.z + Math.sin(ang) * t.r));
    }
    const g = new THREE.BufferGeometry().setFromPoints(ring);
    storyGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffb84c })));
    const m = markerSprite('T' + (i + 1), '#ffb84c');
    m.position.set(t.x, gy + 0.9, t.z);
    storyGroup.add(m);
  });
}


export function setStoryMode(on) {
  wSections.win.style.display = (on || isPinned('storySectionsFwin')) ? 'block' : 'none';
  wCam.win.style.display = (on || isPinned('storyCamFwin')) ? 'flex' : 'none';
  wTrig.win.style.display = (on || isPinned('storyTrigFwin')) ? 'block' : 'none';
  wTut.win.style.display = (on || isPinned('storyTutFwin')) ? 'block' : 'none';
  if (on) {
    ensureStory();
    secTA.value = (S.map.story.sections || []).join('\n');
    tutTA.value = (S.map.story.tut || []).join('\n');
    renderCamList();
    renderTrigList();
    rebuildStoryViz();
  } else {
    preview.active = false;
  }
}


setStoryRebuild(rebuildStoryViz);
