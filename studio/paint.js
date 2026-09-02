'use strict';

import { S, SIZE } from './state.js';
import { $, status, TEXTURES, texImg, brushRing, groundHit,
         stampGround, paintBaseGrass, ensureGroundTex,
         syncSplat, groundDirty, groundTexCanvas, markGroundDirty,
         pushUndo, dump, saveAutosave, groundMesh, groundMaterial, GROUND_TEX } from './core.js';
import * as idb from '../idb.js';

export function fillTextureSelect() {
  const sel = $('texSel');
  sel.innerHTML = '';
  const none = document.createElement('option');
  none.value = ''; none.textContent = '(color only)';
  sel.appendChild(none);
  TEXTURES.forEach(function(t) {
    const o = document.createElement('option');
    o.value = t.src; o.textContent = t.label;
    sel.appendChild(o);
  });

  const gs = $('groundSel');
  if (gs) {
    gs.innerHTML = '';
    const gnone = document.createElement('option');
    gnone.value = ''; gnone.textContent = 'default grass';
    gs.appendChild(gnone);
    TEXTURES.forEach(function(t) {
      const o = document.createElement('option');
      o.value = t.src; o.textContent = t.label;
      gs.appendChild(o);
    });
    if (S.map && S.map.ground && S.map.ground.tex) gs.value = S.map.ground.tex;
  }

  const mt = $('mtTex');
  if (mt) {
    mt.innerHTML = '';
    const prog = document.createElement('option');
    prog.value = ''; prog.textContent = 'procedural gray rock';
    mt.appendChild(prog);
    const seen = {};
    TEXTURES.forEach(function(t) {
      if (t.src.indexOf('grass') >= 0 || seen[t.src]) return;
      seen[t.src] = 1;
      const o = document.createElement('option');
      o.value = t.src; o.textContent = t.label;
      mt.appendChild(o);
    });
    (S.map && S.map.splat ? S.map.splat.layers : []).forEach(function(t, i) {
      if (!t || t.indexOf('grass') >= 0 || seen[t]) return;
      seen[t] = 1;
      const o = document.createElement('option');
      o.value = t; o.textContent = 'paint layer ' + (i + 1);
      mt.appendChild(o);
    });
  }
}

let activeLayer = 0, paintDown = false, paintStrokeUndone = false;
export function getActiveLayer() { return activeLayer; }
export function setActiveLayer(i) { activeLayer = i; }

let dbgEl = null;
function dbg() {
  if (!dbgEl) {
    dbgEl = document.createElement('div');
    dbgEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;background:rgba(0,0,0,.74);color:#7fff7f;font:12px/1.4 monospace;padding:6px 8px;white-space:pre;pointer-events:none;max-width:48ch';
    document.body.appendChild(dbgEl);
  }
  return dbgEl;
}
let lastDbg = 0;

export function applyPaint(dt) {
  const hit = groundHit();
  const r = parseFloat($('pbRadius').value);
  brushRing.visible = !!hit;
  if (!hit) return;
  brushRing.position.set(hit.point.x, hit.point.y + 0.06, hit.point.z);
  brushRing.scale.setScalar(r);
  if (performance.now() - lastDbg > 200) {
    lastDbg = performance.now();
    dbg().textContent = [
      'PAINT DEBUG',
      'tool=' + S.tool + '  mouseDown=' + ((S.mouseButtons & 1) !== 0) + '  paintDown=' + paintDown,
      'hit=' + (!!hit) + '  uv=' + (hit && hit.uv ? hit.uv.x.toFixed(2) + ',' + hit.uv.y.toFixed(2) : '-'),
      'active=' + activeLayer + '/' + S.map.splat.layers.length + '  layer=' + (S.map.splat.layers[activeLayer] || '?').slice(0, 22),
      'dirty=' + groundDirty
    ].join('\n');
  }
  if (!paintDown || !hit.uv) return;
  if (!paintStrokeUndone) { pushUndo(); paintStrokeUndone = true; }
  if (activeLayer >= (S.map.splat.layers || []).length) { brushRing.material.color.setHex(0xcc4444); return; }
  S.activeLayer = activeLayer;
  fitLayerTile(activeLayer);
  brushRing.material.color.setHex(0x7fbf4f);
  const opacity = parseFloat($('pbOpacity').value);
  const erase = $('pbErase').checked;
  stampGround(hit.uv.x, hit.uv.y, r, opacity, erase);
}
export function endPaintStroke() {
  if (!paintStrokeUndone) return;
  paintStrokeUndone = false;
  if (groundDirty && groundTexCanvas) {

    setTimeout(function() { S.map.groundTex = groundTexCanvas.toDataURL('image/png'); dump(); }, 60);
    return;
  }
  dump();
}
export function setPaintDown(v) { paintDown = v; }


export function renderLayers() {
  const el = $('layerList');
  el.innerHTML = '';
  if (!S.map.splat.layers.length) {
    el.innerHTML = '<div class="row" style="color:#888">no layers — add one, pick a texture, paint</div>';
    return;
  }
  S.map.splat.layers.forEach(function(tex, i) {
    const row = document.createElement('div');
    row.className = 'row';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'activeLayer'; radio.checked = i === activeLayer;
    radio.title = 'paint this layer';
    radio.onchange = function() { if (radio.checked) { activeLayer = i; S.activeLayer = i; } };
    const sel = document.createElement('select');
    TEXTURES.forEach(function(t) {
      const o = document.createElement('option'); o.value = t.src; o.textContent = t.label;
      sel.appendChild(o);
    });
    sel.value = tex;
    sel.style.flex = '1';
    const rep = document.createElement('input');
    rep.type = 'number'; rep.value = (S.map.splat.tileM ? (S.map.splat.tileM[i] || 2) : 2); rep.min = 0.5; rep.max = 200; rep.step = 0.5; rep.title = 'tile size (m) — bigger = texture covers more ground';
    rep.style.width = '58px';
    rep.onchange = function() {
      S.map.splat.tileM = S.map.splat.tileM || [];
      S.map.splat.tileM[i] = Math.max(0.5, parseFloat(rep.value) || 2);
      rep.value = S.map.splat.tileM[i];
      refreshGroundMaterial(); dump(); saveAutosave();
    };
    const del = document.createElement('button');
    del.textContent = '×'; del.className = 'danger'; del.title = 'remove layer';
    del.onclick = function() {
      pushUndo();
      S.map.splat.layers.splice(i, 1); S.map.splat.repeats.splice(i, 1);
      if (S.map.splat.tileM) S.map.splat.tileM.splice(i, 1);
      if (activeLayer >= S.map.splat.layers.length) { activeLayer = Math.max(0, S.map.splat.layers.length - 1); S.activeLayer = activeLayer; }
      renderLayers(); refreshGroundMaterial(); dump(); saveAutosave();
    };
    row.appendChild(radio); row.appendChild(sel); row.appendChild(rep); row.appendChild(del);
    const prev = document.createElement('canvas');
    prev.width = prev.height = 48;
    prev.title = 'texture preview';
    prev.style.cssText = 'border:1px solid #444;border-radius:3px;flex:none';
    const pc = prev.getContext('2d');
    let img = texImg(tex);
    const drawPrev = function() {
      pc.clearRect(0, 0, 48, 48);
      if (!img.complete || !img.width) return;
      const s = Math.max(48 / img.width, 48 / img.height);
      pc.drawImage(img, 0, 0, img.width, img.height, (48 - img.width * s) / 2, (48 - img.height * s) / 2, img.width * s, img.height * s);
    };
    const redrawPrev = function() {
      img = texImg(S.map.splat.layers[i]);
      if (img.complete) drawPrev(); else img.onload = drawPrev;
    };
    if (img.complete) drawPrev(); else img.onload = drawPrev;
    row.appendChild(prev);
    sel.onchange = function() { S.map.splat.layers[i] = sel.value; redrawPrev(); fitLayerTile(i); refreshGroundMaterial(); syncSplat(); dump(); saveAutosave(); };
    el.appendChild(row);
  });
}
export function addLayer() {
  if (S.map.splat.layers.length >= 3) return status('shader blends max 3 layers');
  pushUndo();
  const def = TEXTURES.find(function(t) { return t.src.indexOf('grass') < 0; }) || TEXTURES[0];
  S.map.splat.layers.push(def.src);
  S.map.splat.repeats.push(SIZE / 4);
  S.map.splat.tileM = S.map.splat.tileM || [];
  S.map.splat.tileM.push(2);
  activeLayer = S.map.splat.layers.length - 1;
  S.activeLayer = activeLayer;
  fitLayerTile(activeLayer);
  renderLayers();
  refreshGroundMaterial();
}




export function fitLayerTile(i) {
  if (!S.map.splat.layers[i] || (S.map.splat.tileM && S.map.splat.tileM[i] && S.map.splat.tileM[i] !== 2)) return;
  const im = texImg(S.map.splat.layers[i]);
  const fit = function() {
    if (!im.width || !S.map.splat.layers[i]) return;
    const m = Math.max(2, Math.min(SIZE, Math.round(im.width * (SIZE / GROUND_TEX))));
    if (m > 2) { S.map.splat.tileM = S.map.splat.tileM || []; S.map.splat.tileM[i] = m; }
  };
  if (im.complete && im.width) { fit(); return; }
  if (im._fitPending) return;
  im._fitPending = true;
  const prev = im.onload;
  im.onload = function() { if (typeof prev === 'function') prev(); fit(); };
}
export function clearGroundPaint() {
  if (!groundTexCanvas) ensureGroundTex();
  paintBaseGrass();
  markGroundDirty();
  if (S.map) S.map.groundTex = null;
  dump(); saveAutosave();
  status('paint cleared — ground is pure grass again');
}
export function refreshGroundMaterial() {
  if (!groundMesh) return;
  groundMesh.material.dispose();
  groundMesh.material = groundMaterial();
}


const pixCanvas = document.getElementById('pixprev');
let pixResult = null, pixName = 'pixel';
document.getElementById('pixFile').addEventListener('change', function(e) {
  const f = e.target.files[0];
  if (!f) return;
  pixName = f.name.replace(/\.[^.]*$/, '');
  const img = new Image();
  img.onload = function() {
    if (!img.width || !img.height) { status('couldn\'t read "' + f.name + '" as an image'); return; }
    crunchImage(img);
  };
  img.onerror = function() {
    status('couldn\'t decode "' + f.name + '" — the browser can\'t read this image format');
    pixResult = null;
    document.getElementById('pixUse').disabled = true;
    document.getElementById('pixDl').disabled = true;
  };


  img.src = URL.createObjectURL(f);
});
function crunchImage(img) {
  if (document.getElementById('pixNoCrunch').checked) {


    const cap = 512;
    const scale = Math.min(1, cap / Math.max(img.width, img.height));
    const c = pixCanvas.getContext('2d');
    pixCanvas.width = Math.max(1, Math.round(img.width * scale));
    pixCanvas.height = Math.max(1, Math.round(img.height * scale));
    c.imageSmoothingEnabled = true;
    c.drawImage(img, 0, 0, pixCanvas.width, pixCanvas.height);
    pixResult = pixCanvas.toDataURL('image/png');
    document.getElementById('pixUse').disabled = false;
    document.getElementById('pixDl').disabled = false;
    status('kept "' + pixName + '"' + (scale < 1 ? ' (downscaled to ' + pixCanvas.width + 'px)' : '') + ' — Use as texture adds it to the texture list');
    return;
  }
  const size = parseInt(document.getElementById('pixSize').value, 10);
  const levels = parseInt(document.getElementById('pixLevels').value, 10);
  const dither = document.getElementById('pixDither').checked;

  const small = document.createElement('canvas'); small.width = small.height = size;
  const sctx = small.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(img, 0, 0, size, size);
  const sd = sctx.getImageData(0, 0, size, size);
  const px = sd.data;

  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const q = 255 / (levels - 1);
  for (let i = 0; i < px.length; i += 4) {
    const pi = (i >> 2);
    const b = dither ? ((BAYER[pi & 3][pi >> 2 & 3] / 16 - 0.5) * q * 0.75) : 0;
    px[i]     = Math.round((px[i] + b) / q) * q;
    px[i + 1] = Math.round((px[i + 1] + b) / q) * q;
    px[i + 2] = Math.round((px[i + 2] + b) / q) * q;
  }
  sctx.putImageData(sd, 0, 0);

  const c = pixCanvas.getContext('2d');
  pixCanvas.width = size; pixCanvas.height = size;
  c.imageSmoothingEnabled = false;
  c.drawImage(small, 0, 0);
  pixResult = small.toDataURL('image/png');
  document.getElementById('pixUse').disabled = false;
  document.getElementById('pixDl').disabled = false;
  status('pixelized "' + pixName + '" — Use as texture adds it to the texture list');
}
document.getElementById('pixUse').addEventListener('click', function() {
  if (!pixResult) return;
  addCustomTexture('pixel:' + pixName, pixResult);
  document.getElementById('texSel').value = pixResult;
  status('texture added — selected on new blocks');
});
document.getElementById('pixDl').addEventListener('click', function() {
  if (!pixResult) return;
  const a = document.createElement('a');
  a.href = pixResult;
  a.download = pixName + '_pixel.png';
  a.click();
});
const CUSTOM_TEX_KEY = 'gault_studio_custom_textures';
let customTextures = [];
function saveCustomTextures() {
  idb.set(CUSTOM_TEX_KEY, JSON.stringify(customTextures));
}
export function addCustomTexture(label, src) {
  if (customTextures.some(function(t) { return t.src === src; })) return;
  const t = { label: label, src: src };
  customTextures.push(t);
  TEXTURES.push(t);
  fillTextureSelect();
  saveCustomTextures();
}
export async function loadCustomTextures() {
  await idb.load([CUSTOM_TEX_KEY]);
  try { customTextures = JSON.parse(idb.get(CUSTOM_TEX_KEY)) || []; } catch (e) { customTextures = []; }
  customTextures.forEach(function(t) {
    if (!TEXTURES.some(function(x) { return x.src === t.src; })) TEXTURES.push(t);
  });
  fillTextureSelect();
}
