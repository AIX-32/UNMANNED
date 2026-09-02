'use strict';




import { S } from './state.js';
import { scene, $, status, camera, orbit, euler, setStoryRebuild, markerSprite,
         sampleHeight, groundHit, dump, saveAutosave } from './core.js';

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
function ensureStory() { if (!S.map.story) S.map.story = { cam: [], sections: [], triggers: [] }; }


const wSections = fwin('INTRO STORY SECTIONS', 330, 40);
const secTA = document.createElement('textarea');
secTA.rows = 7;
secTA.placeholder = 'one section per line — each types out on the intro board';
secTA.addEventListener('input', function() {
  ensureStory();
  S.map.story.sections = secTA.value.split('\n').map(function(s) { return s.trim(); }).filter(Boolean);
  dirty();
});
wSections.body.appendChild(secTA);
wSections.body.appendChild(shint('an intro plays on spawn when sections (or a 2+ point camera path) exist'));


const wCam = fwin('INTRO CUTSCENE CAMERA', 330, 230);
const camAdd = document.createElement('button');
camAdd.textContent = '＋ add point at camera';
const camPrev = document.createElement('button');
camPrev.textContent = '▶ preview';
const camList = document.createElement('div');
camList.className = 'slist';
wCam.body.appendChild(camAdd);
wCam.body.appendChild(camPrev);
wCam.body.appendChild(camList);
wCam.body.appendChild(shint('fly somewhere → ＋. Each point stores position + look. d = seconds to reach it. First point = shot start.'));
export const preview = { active: false, t: 0 };

function addCamPoint() {
  ensureStory();
  S.map.story.cam.push({
    x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2),
    yaw: +orbit.yaw.toFixed(3), pitch: +orbit.pitch.toFixed(3), d: 3
  });
  renderCamList(); rebuildStoryViz(); dirty();
}
function camRow(i) {
  const p = S.map.story.cam[i];
  const row = document.createElement('div');
  row.className = 'srow';
  row.appendChild(rowLabel('P' + (i + 1) + '  ' + p.x.toFixed(0) + ',' + p.y.toFixed(0) + ',' + p.z.toFixed(0)));
  const dur = document.createElement('input');
  dur.type = 'number'; dur.step = '0.5'; dur.min = '0.2'; dur.value = p.d != null ? p.d : 3;
  dur.title = 'seconds to reach this point';
  dur.addEventListener('input', function() { p.d = +dur.value || 3; dirty(); });
  const del = document.createElement('button');
  del.textContent = '✕';
  del.onclick = function() { S.map.story.cam.splice(i, 1); renderCamList(); rebuildStoryViz(); dirty(); };
  row.appendChild(dur); row.appendChild(del);
  return row;
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
export function pathPose(pts, t) {
  if (!pts.length) return null;
  if (pts.length === 1) return pts[0];
  const segs = [0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) { acc += Math.max(0.2, pts[i].d != null ? pts[i].d : 3); segs.push(acc); }
  const tt = Math.min(t, acc);
  let i = 0;
  while (i < pts.length - 2 && tt > segs[i + 1]) i++;
  const t0 = segs[i], t1 = segs[i + 1];
  const f = t1 > t0 ? Math.min(1, (tt - t0) / (t1 - t0)) : 0;
  const e = f * f * (3 - 2 * f);
  const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[i + 1], d = pts[Math.min(pts.length - 1, i + 2)];
  const v = new THREE.Vector3();
  v.x = 0.5 * ((2 * b.x) + (-a.x + c.x) * e + (2 * a.x - 5 * b.x + 4 * c.x - d.x) * e * e + (-a.x + 3 * b.x - 3 * c.x + d.x) * e * e * e);
  v.y = 0.5 * ((2 * b.y) + (-a.y + c.y) * e + (2 * a.y - 5 * b.y + 4 * c.y - d.y) * e * e + (-a.y + 3 * b.y - 3 * c.y + d.y) * e * e * e);
  v.z = 0.5 * ((2 * b.z) + (-a.z + c.z) * e + (2 * a.z - 5 * b.z + 4 * c.z - d.z) * e * e + (-a.z + 3 * b.z - 3 * c.z + d.z) * e * e * e);
  return { x: v.x, y: v.y, z: v.z, yaw: lerpAng(b.yaw || 0, c.yaw != null ? c.yaw : 0, e), pitch: (b.pitch || 0) + ((c.pitch != null ? c.pitch : 0) - (b.pitch || 0)) * e };
}


export function updatePreview(dt) {
  if (S.tool !== 'story' || !preview.active) return false;
  preview.t += dt;
  const pts = S.map.story.cam;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.max(0.2, pts[i].d != null ? pts[i].d : 3);
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
  wSections.win.style.display = wCam.win.style.display = wTrig.win.style.display = on ? 'block' : 'none';
  if (on) {
    ensureStory();
    secTA.value = (S.map.story.sections || []).join('\n');
    renderCamList();
    renderTrigList();
    rebuildStoryViz();
  } else {
    preview.active = false;
  }
}


setStoryRebuild(rebuildStoryViz);
