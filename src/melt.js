import { scene, camera, postMat } from './core.js';
import { groundHeight, MAP_SPAWNS } from './world.js';

// ponytail: melt — sharp spot on closest point of each block/prop, not whole body
// orange at the point that faces the explosion, 4 yellow rings outward, hard step — visible line

const DURATION = 6.0;
// spot radii (local to closest point) — small so only spot, not whole mesh
const SPOT_R = [0.42, 0.72, 1.05, 1.45, 1.95];
const SPOT_COL = [
  [1.0, 0.30, 0.0],
  [1.0, 0.48, 0.0],
  [1.0, 0.70, 0.0],
  [1.0, 0.84, 0.29],
  [1.0, 0.96, 0.62],
];
const SPOT_OP = [1.0, 0.88, 0.74, 0.34, 0.18];

const melts = [];
const triggers = [];
let mapReady = false;

const meltUniforms = {
  uMeltPos: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uMeltProgress: { value: [0, 0, 0, 0] },
  uMeltCount: { value: 0 }
};

function makeMelt(x, z, y) {
  const gy = y != null ? y : (groundHeight(x, z) + 0.9);
  const pos = new THREE.Vector3(x, gy, z);
  const g = { pos, t0: performance.now() / 1000 };
  melts.push(g);
  return g;
}

export function setMeltMapReady() {
  mapReady = true;
  spawnMelts();
}

function clearMelts() {
  melts.length = 0;
  triggers.length = 0;
  meltUniforms.uMeltCount.value = 0;
  for (let i = 0; i < 4; i++) meltUniforms.uMeltProgress.value[i] = 0;
}

function spawnMelts() {
  if (!mapReady) return;
  clearMelts();
  const list = (MAP_SPAWNS.melts || []);
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const x = p.x != null ? p.x : (p[0] != null ? p[0] : 0);
    const z = p.z != null ? p.z : (p[1] != null ? p[1] : 0);
    triggers.push({ x, z, trig: p.trig || 'area', r: p.r != null ? p.r : 8 });
  }
  setTimeout(patchWorld, 80);
  setTimeout(patchWorld, 400);
  setTimeout(patchWorld, 900);
}

function aliveEnemies() {
  const out = [];
  const ugv = window.__gaultUgvs; if (ugv) for (let i = 0; i < ugv.length; i++) { const u = ugv[i]; if (u.model && !u.dead) out.push(u.model.position); }
  const tur = window.__gaultTurrets; if (tur) for (let i = 0; i < tur.length; i++) { const t = tur[i]; if (t.model && !t.dead) out.push(t.model.position); }
  const b = window.__gaultBoss; if (b && b.state) for (let i = 0; i < b.state.length; i++) { const bo = b.state[i]; if (bo.model && !bo.dead) out.push(bo.model.position); }
  return out;
}

export function addMelt(x, z, y) {
  const g = makeMelt(x, z, y);
  patchWorld();
  return g;
}

function collectTargets() {
  const out = [];
  scene.traverse(function(o) {
    if (!o.isMesh) return;
    if (o.userData && (o.userData.ground || o.userData.rain || o.userData.aim)) return;
    if (o.material && o.geometry) out.push(o);
  });
  return out;
}

function ensureBounding(m) {
  if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  let r = m.geometry.boundingSphere ? m.geometry.boundingSphere.radius : 1;
  // apply scale (max component)
  const s = m.scale;
  const ms = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z));
  r *= ms;
  // clamp very large ground-merged? but blocks stay small
  if (!isFinite(r) || r > 12) r = 1.6;
  if (r < 0.25) r = 0.6;
  m.userData._meltRadius = r;
}

function patchMaterial(mat, center, radius, isInst) {
  if (!mat || mat.userData._meltPatched) return;
  mat.userData._meltPatched = true;
  const uCenter = { value: center.clone() };
  const uRadius = { value: radius };
  const uWorld = { value: isInst ? 1 : 0 };
  mat.userData._meltCenter = uCenter;
  mat.userData._meltRadius = uRadius;
  mat.userData._meltWorld = uWorld;
  const orig = mat.onBeforeCompile;
  mat.onBeforeCompile = function(shader) {
    if (orig) orig(shader);
    shader.uniforms.uMeltPos = meltUniforms.uMeltPos;
    shader.uniforms.uMeltProgress = meltUniforms.uMeltProgress;
    shader.uniforms.uMeltCount = meltUniforms.uMeltCount;
    shader.uniforms.uObjCenter = uCenter;
    shader.uniforms.uObjRadius = uRadius;
    shader.uniforms.uMeltWorld = uWorld;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vMeltWPos;'
    );
    if (shader.vertexShader.indexOf('#include <worldpos_vertex>') !== -1) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvMeltWPos = worldPosition.xyz;'
      );
    } else {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        'vMeltWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>'
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform vec3 uMeltPos[4]; uniform float uMeltProgress[4]; uniform int uMeltCount;\nuniform vec3 uObjCenter; uniform float uObjRadius; uniform float uMeltWorld;\nvarying vec3 vMeltWPos;\nvec3 _spotCol(int i){ if(i==0) return vec3(1.0,0.30,0.0); if(i==1) return vec3(1.0,0.50,0.0); if(i==2) return vec3(1.0,0.74,0.0); if(i==3) return vec3(1.0,0.88,0.32); return vec3(1.0,0.98,0.64); }\nfloat _spotOp(int i){ if(i==0) return 1.0; if(i==1) return 0.88; if(i==2) return 0.74; if(i==3) return 0.58; return 0.42; }\nfloat _spotR(int i){ if(i==0) return 0.42; if(i==1) return 0.72; if(i==2) return 1.05; if(i==3) return 1.45; return 1.95; }\nvec3 _meltGlow = vec3(0.0);'
    );
    // ponytail: tint diffuse before lighting — so Lambert/Standard show paint, not light
    if (shader.fragmentShader.indexOf('#include <color_fragment>') !== -1) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 _mTint = vec3(0.0);
          float _mMix = 0.0;
          for(int _mi=0; _mi<4; _mi++){
            if(_mi >= uMeltCount) break;
            vec3 _mp = uMeltPos[_mi];
            float _prog = uMeltProgress[_mi];
            float _e = _prog*_prog*(3.0-2.0*_prog);
            if(_e <= 0.001) continue;
            float _distObj = distance(uObjCenter, _mp);
            float _globalFade = (uMeltWorld > 0.5) ? 1.0 : step(_distObj, 26.0);
            if(_globalFade < 0.5) continue;
            vec3 _closest;
            if(uMeltWorld > 0.5){
              _closest = _mp;
            } else {
              vec3 _dir = normalize(uObjCenter - _mp);
              if(length(_dir) < 0.001) _dir = vec3(0.0,0.0,1.0);
              _closest = uObjCenter - _dir * min(uObjRadius, max(0.0,_distObj * 0.5));
            }
            vec2 _dXZ = vMeltWPos.xz - _closest.xz;
            float _ang = atan(_dXZ.y, _dXZ.x);
            float _wobb = 1.0 + 0.24*sin(_ang*3.0 + 1.7) + 0.13*sin(_ang*7.0 + 0.4);
            float _spotDist = (uMeltWorld > 0.5) ? length(vMeltWPos.xz - _mp.xz) : distance(vMeltWPos, _closest);
            float _edge = _spotR(4) * _e * _wobb;
            if(step(_spotDist, _edge * 1.02) < 0.5) continue;
            float _band = clamp(_spotDist / max(0.0001, _edge), 0.0, 1.0);
            vec3 _c = _spotCol(0);
            for(int _ri=1; _ri<5; _ri++){ if(_band > float(_ri)/5.0) _c = _spotCol(_ri); }
            float _fade = mix(1.0, 0.22, smoothstep(0.55, 0.95, _band));
            float _use = _fade * _globalFade;
            if(_use > _mMix){ _mMix = _use; _mTint = _c; }
          }
          if(_mMix > 0.001){ diffuseColor.rgb = _mTint; _meltGlow = _mTint * _mMix; }
        }`
      );
      // lit materials: add the melt as self-emitted light so it stays full-bright in shadows
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n  totalEmissiveRadiance += _meltGlow;'
      );
    } else {
      // fallback for materials without color_fragment (Basic without USE_COLOR)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `{
          vec3 _mTint = vec3(0.0); float _mMix = 0.0;
          for(int _mi=0; _mi<4; _mi++){ if(_mi>=uMeltCount) break; vec3 _mp=uMeltPos[_mi]; float _prog=uMeltProgress[_mi]; float _e=_prog*_prog*(3.0-2.0*_prog); if(_e<=0.001) continue; float _distObj=distance(uObjCenter,_mp); float _globalFade=(uMeltWorld>0.5)?1.0:step(_distObj,26.0); if(_globalFade<0.5) continue; vec3 _closest; if(uMeltWorld>0.5){_closest=_mp;}else{ vec3 _dir=normalize(uObjCenter-_mp); if(length(_dir)<0.001) _dir=vec3(0,0,1); _closest=uObjCenter - _dir * min(uObjRadius, max(0.0,_distObj*0.5)); } float _ang=atan(vMeltWPos.z-_closest.z, vMeltWPos.x-_closest.x); float _wobb=1.0+0.24*sin(_ang*3.0+1.7)+0.13*sin(_ang*7.0+0.4); float _spotDist=(uMeltWorld>0.5)?length(vMeltWPos.xz-_mp.xz):distance(vMeltWPos,_closest); float _edge=_spotR(4)*_e*_wobb; if(step(_spotDist,_edge*1.02)<0.5) continue; float _band=clamp(_spotDist/max(0.0001,_edge),0.0,1.0); vec3 _c=_spotCol(0); for(int _ri=1;_ri<5;_ri++){ if(_band>float(_ri)/5.0) _c=_spotCol(_ri); } float _fade=mix(1.0,0.22,smoothstep(0.55,0.95,_band)); float _use=_fade; if(_use>_mMix){_mMix=_use;_mTint=_c;}}
          if(_mMix>0.001) diffuseColor.rgb=_mTint;
        } #include <dithering_fragment>`
      );
    }
  };
  mat.needsUpdate = true;
}

function patchWorld() {
  const targets = collectTargets();
  for (let i = 0; i < targets.length; i++) {
    const m = targets[i];
    // ensure each mesh has unique material instance so per-mesh uniforms don't collide
    if (!m.userData._meltMeshPatched) {
      // clone material(s) so each mesh owns its center/radius
      if (Array.isArray(m.material)) {
        const arr = [];
        for (let j = 0; j < m.material.length; j++) {
          const orig = m.material[j];
          const cl = orig.clone();
          // copy userData flag fresh
          cl.userData = Object.assign({}, orig.userData);
          cl.userData._meltPatched = false;
          arr.push(cl);
        }
        m.material = arr;
      } else {
        const cl = m.material.clone();
        cl.userData = Object.assign({}, m.material.userData);
        cl.userData._meltPatched = false;
        m.material = cl;
      }
      m.userData._meltMeshPatched = true;
    }
    const isInst = !!m.isInstancedMesh;
    let center = new THREE.Vector3();
    let radius = 1.2;
    if (!isInst) {
      ensureBounding(m);
      // ensure world matrix is current
      try { m.updateWorldMatrix(true, false); } catch(e) {}
      try { m.getWorldPosition(center); } catch(e) { center.copy(m.position); }
      if (center.length() === 0 && m.position) center.copy(m.position);
    }
    radius = m.userData._meltRadius || 1.2;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (let j = 0; j < mats.length; j++) {
      // each mat gets its own center copy
      if (mats[j].userData._meltCenter) {
        mats[j].userData._meltCenter.value.copy(center);
        mats[j].userData._meltRadius.value = radius;
        if (mats[j].userData._meltWorld) mats[j].userData._meltWorld.value = isInst ? 1 : 0;
      } else {
        patchMaterial(mats[j], center, radius, isInst);
      }
    }
  }
}

export function updateMelt(dt, now) {
  const tNow = performance.now() / 1000;
  // pending triggers: fire on walk-in (area) or on an enemy death nearby (kill)
  for (let i = triggers.length - 1; i >= 0; i--) {
    const t = triggers[i];
    let fire = false;
    if (t.trig === 'kill') {
      const en = aliveEnemies();
      let cnt = 0; const rr = t.r * t.r;
      for (let k = 0; k < en.length; k++) { const dx = en[k].x - t.x, dz = en[k].z - t.z; if (dx * dx + dz * dz <= rr) cnt++; }
      if (t._live === undefined) t._live = cnt;
      else if (cnt < t._live) fire = true;
      t._live = cnt;
    } else {
      const dx = camera.position.x - t.x, dz = camera.position.z - t.z;
      if (dx * dx + dz * dz <= t.r * t.r) fire = true;
    }
    if (fire) { makeMelt(t.x, t.z, null); triggers.splice(i, 1); patchWorld(); }
  }
  if (!melts.length) { postMat.uniforms.uHeat.value = 0; return; }
  let cnt = Math.min(melts.length, 4);
  meltUniforms.uMeltCount.value = cnt;
  // camera heat tint: stronger & warmer the closer you are to a live melt
  // ponytail: melt disc is permanent once fired — tint persists, fades with distance only
  let heat = 0;
  for (let i = 0; i < melts.length; i++) {
    const g = melts[i];
    const k = (tNow - g.t0) / DURATION;
    if (k <= 0) continue;
    const e = Math.min(1, k * k * (3 - 2 * k));
    const d = camera.position.distanceTo(g.pos);
    const h = Math.exp(-d / 12) * e;
    if (h > heat) heat = h;
  }
  postMat.uniforms.uHeat.value = heat;
  postMat.uniforms.uHeatCol.value.set(1.0, 0.4, 0.05);
  for (let i = 0; i < 4; i++) {
    if (i < melts.length) {
      const g = melts[i];
      const k = Math.max(0, Math.min(1, (tNow - g.t0) / DURATION));
      meltUniforms.uMeltProgress.value[i] = k;
      meltUniforms.uMeltPos.value[i].copy(g.pos);
    } else {
      meltUniforms.uMeltProgress.value[i] = 0;
    }
  }
  // patch aggressively first 2s, then throttle
  const age = melts.length ? (tNow - melts[0].t0) : 999;
  if (age < 2.2) patchWorld();
  else if ((tNow * 10 | 0) % 10 === 0) patchWorld();
}

export function meltCount() { return melts.length; }
export function resetMelt() { clearMelts(); }

try { window.__gaultMelt = { addMelt, updateMelt, meltCount, melts, triggers, patchWorld, meltUniforms }; } catch (e) {}
