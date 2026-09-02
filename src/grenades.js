
import { scene, camera, shockwaves, frameNow } from './core.js';
import { S } from './state.js';
import { pointInCollider, supportHeight } from './world.js';
import { damageUgvSplash, damagePlayer } from './ugv.js';
import { explosion } from './audio.js';

const PVP_GRENADE_DMG = 40;

let fragProto = null;
const loader = new THREE.GLTFLoader();
loader.load('assets/models/frag.gltf', function(gltf) {
  fragProto = gltf.scene;
  fragProto.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  const bb = new THREE.Box3().setFromObject(fragProto);
  fragProto.userData.minY = bb.min.y;
});

export function throwGrenade() {
  if (!fragProto) return;
  if ((S.mapGrenades || 0) <= 0) return;
  S.mapGrenades--;
  const g = fragProto.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  g.position.copy(camera.position).addScaledVector(dir, 0.8);
  g.quaternion.copy(camera.quaternion);
  g.userData.vel = dir.multiplyScalar(16).add(new THREE.Vector3(0, 5, 0));
  g.userData.floorY = -fragProto.userData.minY;
  g.userData.life = 2 + Math.random();
  g.userData.spin = new THREE.Vector3(Math.random() * 5, Math.random() * 5, Math.random() * 5);
  g.traverse(function(c) { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  scene.add(g);
  grenades.push(g);
}

export function explodeAt(pos, playerDmg, noBroadcast) {

  damageUgvSplash(pos, 320);
  if (playerDmg) {

    const d = camera.position.distanceTo(pos);
    if (d < 6) damagePlayer(Math.round(playerDmg * (1 - d / 6)), pos);
  }
  if (S.pvp && S.pvpBoom && !noBroadcast) S.pvpBoom(pos, playerDmg || 0);
  boomVisual(pos);
}



export function boomVisual(pos) {
  explosion();
  const boom = new THREE.PointLight(0xffaa44, 6, 40);
  boom.position.copy(pos);
  scene.add(boom);
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.4 }));
  smoke.position.copy(pos);
  scene.add(smoke);
  explosions.push({ smoke: smoke, boom: boom, t: 0 });

  shockwaves.push({ pos: pos.clone(), t0: frameNow, dur: 0.25 });
}

const grenades = [];
const explosions = [];


export function updateGrenades(dt) {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.userData.vel.y -= 20 * dt;
    g.position.addScaledVector(g.userData.vel, dt);

    const floor = supportHeight(g.position.x, g.position.z, g.position.y) + g.userData.floorY;
    if (g.position.y < floor) { g.position.y = floor; g.userData.vel.y *= -0.4; g.userData.vel.x *= 0.7; g.userData.vel.z *= 0.7; }

    let blocked = pointInCollider(g.position.x, g.position.y, g.position.z);
    if (blocked) {

      g.position.x -= g.userData.vel.x * dt;
      g.position.y -= g.userData.vel.y * dt;
      g.position.z -= g.userData.vel.z * dt;
      g.userData.vel.x *= -0.4; g.userData.vel.z *= -0.4;
    }
    g.rotation.x += g.userData.spin.x * dt;
    g.rotation.z += g.userData.spin.z * dt;
    g.userData.life -= dt;
    if (g.userData.life <= 0) {
      scene.remove(g);
      grenades.splice(i, 1);
      explodeAt(g.position, S.pvp ? PVP_GRENADE_DMG : undefined);
    }
  }
  for (let i = explosions.length - 1; i >= 0; i--) {
    const x = explosions[i];
    x.t += dt;
    const k = x.t / 1.2;
    x.smoke.scale.setScalar(1 + k * 4);
    x.smoke.material.opacity = 0.4 * (1 - k);
    x.boom.intensity = 6 * (1 - k);
    if (k >= 1) {
      scene.remove(x.smoke); scene.remove(x.boom);
      explosions.splice(i, 1);
    }
  }
}
