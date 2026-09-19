# UNMANNED — Map & Codebase Reference

A retro-looking FPS combining retro graphics with realistic mechanics. Old three.js (2021, r132-ish, no color management — hence `fixGun`'s LinearEncoding hack).

> **Current:** code is at `2c7fe9b` + tankv2 + fog 18→858m + FPS toggle + inGrass 16m hash + **mission phases** (linear COD campaign, difficulty, checkpoints, subs+audio) + **melt emitter** (studio trigger spots — walk-in / on-enemy-death — hot-paint shader disc + screen heat tint) + **stepnate triggers** (`trigger` entity: spot + flat action list — move prop / spawn foe / say line, per-action delay). `map.md` refreshed 2026-09-20 for mission.

## Boot Flow

- Entry point: `index.html` → `vendor/three.min.js`, `vendor/GLTFLoader.js` (globals), then ES module `src/main.js`.
- A plain-HTML `#loader` overlay (index.html) covers the screen until the world is applied and its props loaded, then asks to `CLICK TO LOCK MOUSE` — that click locks the pointer and hides the loader.
- Then:
  - **hub** map → intro swoop
  - **Opening creds (Ardebin)** → story intro (cam fly + lore types out section by section, centered, then TUTORIAL card + PROCEED) + **opening_credits.mp3** (44s, 0.85 vol, `new Audio`) fires on first `pointerlockchange` after `#loader` hides (`menu.js:maybePlayOpening`, checks `S.mapName`/`URL`/`GAULT_MAP_URL` for `Ardebin`/`Opening creds`/`TScreen` legacy); fades 2.8s (`fadeOpening`) when tut card closed (`endStory` `wasTut`)
  - **Yazd** (lvl-play) → story intro (lore types out section by section, centered, then PROCEED)
  - any other map → straight into the game
- On PROCEED (or Space-skip), `endStory()` returns the camera to the map spawn (`S.spawn`, recorded by `applyMap`) — the intro cutscene's last camera point no longer becomes the spawn.
- Map selection (`?map=` script):
  - `?map=NAME` → fetches `maps/NAME.umm`
  - `?map=__draft` → plays the studio's `localStorage.gault_draft`
  - `?map=__custom` → plays a saved custom-library map (`localStorage.gault_playing`)
  - nothing set → **`maps/hub.umm`** (main-world hub menu), falling back to `maps/Yazd.umm` (then the classic hardcoded field in `buildDefaultLayout()`) if the file can't load.
- Multiplayer deep-link (opened by the UM-server GUI, `signalling.js`): host `?host=1&create=<CODE>&ws=<url>&name=<YOURNAME>[&pw=...]`, guest `?ws=<url>&join=<CODE>&name=<YOURNAME>[&pw=...]` — auto-joins a room as host or guest by name; else you pick a server from the in-game ONLINE list. ONLINE rides a server-forwarded relay (no WebRTC/NAT), LAN is copy/paste WebRTC.

## Layout

```
index.html            boot page: font, prompt div, `#info` (`UNMANNED v0.9.7` + optional `· 60 FPS`), boot loader overlay (#loader/#loaderText), map-boot script, script tags (title: UNMANNED)
src/                  game modules (ES modules, import from './core.js' etc.) — incl. `mission.js` (linear phase controller), `trigger.js` (stepnate)
studio/               MAP STUDIO: ES-module 3D editor → exports map JSON (see below) — incl. `mission.js` (Mission fwin)
assets/
  models/             .gltf (base64-embedded, no sidecars) — except tree.gltf, which pairs with tree.bin (Sketchfab "Low Poly Tree 1", scale 0.95 default). incl: drone.gltf, turret.gltf (stationary MG emplacement, alpha-masked single baseColorTexture), TAT-10.gltf (boss ~5.5m×2.9m at scale 1; gun barrel at model -Z, missile launchers at ±1.5 y=2.4 z=-0.4), missle.gltf (boss missile: nose=-Z, base=+Z, no rotation), HPB.gltf (health-box held-item viewmodel, Blockbench cube), buggy.gltf (Blockbench buggy with 4 cylinder wheels under `wheels` group, see car.js), rc.gltf (Blockbench toy RC car — box body/wheels, shop item, see rc.js), **tankv2.gltf** (driveable tank — single file, hull 3 meshes + `turret` group with `rotatespot` locator + turret mesh, see tank.js)
  audio/              sten.m4a, reload.mp3, shotgun_shot.mp3, shotgun_reload.mp3, drone_flight.mp3, buggy_engine.mp3 (bus loop 92K, pitch/volume by RPM), car_horn.mp3 (floraphonic 33K, horn via Space in car), opening_credits.mp3 (1.7M, 44s PCM 48k) + opening_credits.wav (8.1M) — first campaign map intro (see menu.js)
  textures/           grass.webp (ground), flash.png (muzzle sprite), buggy_ao.png (512 AO for old buggy fallback)
  fonts/              Undak-KVA3y.otf + Montserrat.ttf (legacy, now UNUSED) — all text uses Google Fonts "Tomorrow" (100–900)
maps/                 exported maps for ?map=NAME (see below)
vendor/               three.min.js, GLTFLoader.js (classic scripts, THREE global)
flash_editor.html     muzzle-flash sprite tuner (writes FLASH coords for src/weapons.js)
boss_editor.html      TAT-10 boss editor (writes BOSS_FLASH/BOSS_MISSILES for src/boss.js)
player_editor.html    player/entity editor
firstlevel_map.html   level map editor
```

### Maps (`maps/`)

| File | Role |
|---|---|
| `hub.umm` | main-world menu map (rebuilt as a copy of SilenceVale.umm — same terrain/props/grass/paint, enemies stripped, internal name kept "hub" so it boots as the front door) |
| `Yazd.umm` | lvl-play test map (replaced old map01.json, which is deleted; not campaign) |
| `Ardebin.umm` | first campaign level — **display “Opening creds”** (`CAMPAIGN[0].title`, internal `name: "Opening creds"`; file stays `Ardebin.umm`, preview `Ardebin.png`; opening_credits.mp3 plays on first lock, fades on tut close) |
| `Gulled.umm` | second campaign level |
| `Takkera.umm` | third campaign level |
| `Jimp.umm` | fourth campaign level (single church/scene.gltf prop stripped — model removed from repo) |
| `SilenceVale.umm` | fifth campaign level |
| `Drift.umm` | sixth campaign level |
| `Haywire.umm` | seventh campaign level (night map — boss-centric) |
| `Yank.umm` | eighth campaign level (radio-collect) |
| `Jampo.umm` | ninth campaign level (600m, 1986 props, 20k grass pts — radio-collect, story stripped for perf) |
| `Loner.umm` | tenth campaign level (200m, 537 props, 8 UGVs) |
| `Arena.umm` | PvP 1v1 arena (pvp-flagged: flat field, numbered team-1/team-2 spawns, cover crates, ring of trees — only playable in MULTIPLAYER) |
| `NFlat.umm` | default PvP map (pvp-flagged, custom ground `unlit:true`) — the default pvp-mode map alongside Arena |

The default pvp mode is **NOLINE** (`PVP_MODE` in pvp.js), shown in the lobby and match HUD.

> **Jampo note:** imported `Downloads/Jampo(1).umm` cleared its broken `story` (`cam` 97m high → frozen cutscene, `sections` → stuck `S.story`) to `{"cam":[],"sections":[],"triggers":[]}`; radio win now `radioTotal-radioGot` (was `pickups.length` → instant win before async `loadProto`); added to `src/menu.js` `CAMPAIGN` as 9th.

## Game Modules (`src/`)

### core.js
Scene, camera, renderer (`antialias:false powerPreference:high-performance pixelRatio≤1.5 PCFShadowMap autoUpdate:false info.autoReset:false`), low-res rt + `postMat` post pass, `gunScene` (with world-matching lights), resize, `renderFrame(now)` (`renderer.compile` once), **`shockwaves` + `frameNow`**, **fog slider**.
- Three-pass frame: world → viewmodel (depth cleared) → post upsample.
- **Explosion shockwaves** live in the post pass (`uShock[4]`): each is a screen-space expanding distortion ring that warps the frame (no color). `explodeAt` pushes `{pos, t0, dur:0.25}`; `renderFrame` decays them, projects the world pos to screen and fills the uniform (0 = inactive).
- `frameNow` = last frame's clock seconds, so FX spawned outside main.js use the same clock.
- **Fog**: `FogExp2(0x1a1512, 0.012)` default `r=18+v*8.4 → d=1.7/r` where `fogSlider` 0–100 (`0:18m` really close, `50:438m`, `100:858m`). Was `0.020 - v*0.00018` (`85m→850m` never felt close). `setFogSlider(v)` persists `gault_fogSlider`, `getFogSlider()`, `fogCullR2()` for culling. Map fog `j.fog` (0–100) overrides on `applyMap`.

### state.js
Shared mutable bag `S` (keys, euler, lock flags, straf/ads/prone, aimErr(+T), recoil(+T), kickZ, shakeX/Y, fovPunch, caKick, zoomCur, wallProx, **`hp`/`maxHp`** (default 40/40 — health boxes overhealth above `maxHp`), settings, `hub`, `mapName`, `won`, `story`, `paused`, `worldReady`, `pendingLoads`, `spawn`, `mapCC`, `mapBoxes`, **`mapGrenades`** (default 4 — frag allowance per map), **`pvp`/`pvpTeam`/`killLimit`/`kills`/`pvpThem`/`pvpPeerName`**, **`pvpQuit`/`pvpBoom` bridges**, **`killerPos`/`killerYaw`**, **`killCam` bridge**, **`carDriving`**/`**tankDriving**` bools + `tankDriving` index, **`missionDiff`/`missionActive`** (difficulty & active flag, see `mission.js`), GUN_POS/GUN_ROT/GUN_SCALE/STOCK_Z, ADS_POS/ADS_ROT, `recoilPivot`, `inGun()`).

- Rule of thumb: anything written by >1 module lives in S; module-private state stays local.
- `worldReady`/`pendingLoads` drive the boot loader (kept in S to dodge a world⇄menu import cycle).
- `settings` = `{ strafLock, laptop, aimAssist:1.12, brain:false, showFps:false }` (persisted: gault_laptop, gault_aimassist, gault_brainassist, gault_showfps). `brain` = tank-style aim assist while straf; `showFps` = FPS counter beside `#info` version.
- `missionDiff` = `easy|normal|hard|veteran` (persisted `gault_difficulty`, default `normal`); `missionActive` bool set by `mission.js:setMissionMapReady`.

### audio.js
One AudioContext, `decode(url)` helper, `play(buf,vol,dur)`, stenShot/shutShot/stenTail, `reloadSound(i)`, `getDroneBuffer()`, **radar sonar** (`sonarPlay()/sonarStop()/sonarPos()`).

- sten shots cut to SHOT_DURATION=0.13s; releasing trigger replays full sample ("uncut tail"); shotgun reload clip pitch-matches its 4.15s duration.
- drone clip looped per-drone, gain = distance fade only — **capped at 0.35** with the fade stretched to ~120m (audible from afar, quiet); pitch rises with climb rate (`0.9 + max(0,velY)*0.08`).
- `turretShot()` reuses the sten buffer for the turret's quiet machine-gun chatter.
- `sonar.mp3` (49.776s, `SONAR_DUR`) loops while the radar is on; its playback clock drives the radar scan line.

### world.js
Lights (moon `1024` `castShadow` + `receiveShadow:false` on grass/rain, `precision mediump`, `matrixAutoUpdate:false` statics, merged walls `LineSegments` + block groups, `inGrass` memo, `resolveCollisions` squared dist, `groundHeight` `mn=-size/2`), terrain + `groundHeight(x,z)`, static props via `placeProp/placeTarget` (tankv2 driveable via `tank.js`), blocks (`addBlock` + `mergeBlocks` groups), `applyMap(json)`, `MAP_SPAWNS`, **`inGrass(x,z)`**, colliders[] + collision core, **fog from map**, **chunked foliage + radio fix**, **rain volume**.

- **Chunked foliage (perf for 600m/20k-grass maps like Jampo):** trees (`TREE_CHUNK=80`) and bushes (`BUSH_CHUNK=80`) built as `InstancedMesh` per chunk (Map `floor((x+1000)/80)`) → `frustumCulled:false` (per-instance bounds too small, would pop clusters) + `DynamicDrawUsage` with `origs[]` stored for one-by-one fog cull (now removed for trees/bushes — only grass culls by fog). Grass (`GRASS_CHUNK=64`) split into per-chunk `Mesh`es (1 mat clone/chunk, `computeBoundingSphere`), async `setTimeout` per chunk when `pts>4000` to avoid `applyMap` hitch, plus `updateGrassCull()` hides grass chunks >`min(140m, fogR)` (`fogCullR2 1.7/d`, `18m at 0→858m at 100`) and tree shadows disabled >100m. `inGrass` now `16m` fine hash (`grassGrid` `16×16`) → `~34µs` vs `8k` linear `~2.6ms` (`39ms/frame` → `0.5ms`).
- **Radio win fix:** `radioGot` counter + `radiosLeft()=radioTotal-radioGot` (was `pickups.length` → 0 at boot before async `loadProto` → instant win on Jampo's 5 radios); `radioGot` reset on `applyMap`.

- **`applyNight(on, mid)`** sets night/midnight lighting for the world **and the gunScene viewmodel lights** (blue `0x6a8ac0` key, dark ambient/hemi on night; warm day setup otherwise) — so the gun no longer keeps an orange day tint on night maps. Also hides the spinning `sun.gltf` mesh on any night/midnight map.
- **Ground paint overlay** (`groundTex`, the brush painting) is `MeshBasicMaterial` (unlit — true brush colors) in **day** mode, but `MeshLambertMaterial` (lit, world-tinted) in **night** mode — so painting shows its true colors by day and gets the night tint at night.
- **Brush grass lighting** (`buildGrass`): `grass.unlit` 0..1 sets the true-color (unlit) fraction — `unlit:0` is `MeshLambertMaterial` (gets the real scene tint like the ground; warm orange by day, blue at night), `unlit:1` is flat `MeshBasicMaterial` (always full brush color), between blends via `emissive`/`color`. Every blade's normals are forced up `(0,1,0)` **and each quad also emits its reverse-winding (CW) indices**, so with `FrontSide` each side renders as its own lit front face — no dark far side (Lambert's Gouraud backface shading otherwise flips the normal down and kills the sun). Result: both sides shade identically to a flat ground patch. Vertex count is unchanged (only indices double).
- `applyMap` records `S.mapName`/`S.hub`/`S.pvp`, `fog` via `setFogSlider(j.fog)`, seats the player at eye height (recording `S.spawn`), then calls `setMissionMapReady(j)` + `syncHub()` and sets `S.worldReady = true` (mission `S.missionActive` set there).
- `loadProto` counts async model loads in `S.pendingLoads` (the boot loader waits for it to drain).
- Default boot is `maps/hub.umm`; `loadDefaultMap()` falls back to `maps/Yazd.umm`, hardcoded `buildDefaultLayout()` only if the file is missing.
- `resolveCollisions` takes optional `radius` + `segsAlwaysBlock` + `ignoreTankIdx` (UGV passes its own radius and forces invisible walls to always block; tanks pass `1.9` + own idx to skip self) and also checks `window.__gaultTanks` cyls directly (no grid churn for moving tanks) — makes tanks solid for player.
- Ground meshes tagged `userData.ground` so shots raycast the terrain analytically instead of the 16k-tri plane.
- `MAP_SPAWNS` = `{ player, ugvs, drones, turrets, bosses, ugvRoute, extract, sectors, pvp, cars, tanks, melts, triggers }` (`tanks` = driveable `tankv2` spawns, see `tank.js`; `melts` = emitter trigger spots, see `melt.js`; `triggers` = stepnate spots, see `trigger.js`); `MAP_SPAWNS.tanks`/`MAP_SPAWNS.melts`/`MAP_SPAWNS.triggers` fed by `kind:"tank"`/`kind:"melt"`/`kind:"trigger"` entities.
- On a `S.pvp` map every AI/healthbox entity is skipped — only `pvp` spawns count.
- `setTerrain` now supports 50–1000m `size` (was 400 cap); `groundHeight` uses `mn=-size/2`. Note collider grid still `GRID_MIN -100 8m 25×25 = 200m` — terrain past ±100 shows but walls/blocks outside aren't queried.
- **Rain** (`setRain`/`updateRain` + `main.js` tick incl. hub/won/story cut): single `LineSegments` cylinder following `camera` (`R=65`, `TOP=30`, `2100` streaks, `v` 14-22 + `len` 0.9-1.7 stretched, per-drop `dx/dz` drift, wind `sin*0.85+sin*1.7`, polar disc spawn + triangular `y = cy-5+(rand+rand)/2*(TOP+12)` so no top sheet on load, respawns at `cy+TOP` disc). Material `0xc9d7f0` `0.38` (`0x96a8c8`/`0.28` night) fogged.
- Every object a map builds is fully torn down on each `applyMap` (see Map Notes below).

### weapons.js
Viewmodel mount (`mountGun`), `WEAPONS[]` pool defs, fire/reload (`updateFiring`), `shoot()` (pooled holes 128 ring + `_bashFwd` scratch, `for` loops, squared `BASH_RANGE`, `getOwned` cache, `three-mesh-bvh` hook), recoil + FLASH, worldFlash.

- **Gun pool + loadout**: 4 base guns (Sten/PS8/NB-1/Eagle) owned from the start; Golden Eagle (double-dmg, dmg 130) and AK-47 bought in the hub shop (persisted `gault_owned`). A 4-slot loadout (persisted `gault_loadout`) picks which owned guns Digit1-4 map to.
- **Health box (slot 5)**: a shop-bought consumable (persisted `gault_hpboxes`); holding LMB runs a 6s use, heals +30 overhealth, spent on landing.
- Bullets exit the tuned FLASH spot along the barrel axis (`barrelDir` mirrors the viewmodel pose). Y toggles persistent red per-bullet traces.

### car.js
Buggy vehicle — `F` near 3.2m to enter, camera rides `py+(1.55-baseY)` in middle, `F` to exit beside `+cos(yaw)*1.9`. Block `setFiring(true)` while `isDriving()` (input.js), `gunScene` hidden in `main.js`.

- Model `buggy.gltf` Blockbench (38 nodes, `wheels` group cylinders 27-30, `getObjectByName('wheels')` → `wheels[]`, `baseY` from AABB). Old fallback AO `buggy_ao.png` if no map.
- **Semi-sim engine** (blueprint): `torqueAt(rpm)` CURVE `[0:0,500:22,800:58,1500:110,2500:165,3500:195,4500:185,5500:160,6000:120,7000:60]`, `IDLE 800 REDLINE 5800 INERTIA 0.22 FINAL 3.72 GEARS [3.82,2.21,1.52,1.08,0.82] WHEEL_R 0.33 MASS 820`, turbo `boost+=(throttle-boost)*dt*2` then `engineTq=maxTq*throttle*(1+boost*0.5)`, load `wheelResist(aero 0.36*v²+rolling 14+3.2*v+hill MASS*9.81*sin(slope)*0.015)*WHEEL_R/(gear*final)`, clutch at <1 m/s, rev limiter >REDLINE, auto shift `5200/1800` + loosely linked `target=wheelRpm*gear*final`.
- **Audio**: `buggy_engine.mp3` looped `BufferSource` + `Gain`, `pitch=0.55+(rpm/IDLE)*0.42` + `vol=0.08+throttle*0.32+load*0.28+rpm/REDLINE*0.22` (quiet idle 0.08), `actx.resume()` on demand; killed instantly on `S.dead`.
- **Driving**: `W` throttle, `S` brake, `A/D` steer via `yawVel` inertia `grip=clamp(1-|speed|*0.045,0.32,1)` → `steerTarget=steer*1.8*grip*(airborne?0.22:1)`, `yawVel+=(target-yawVel)*dt*5.5`, `yawVel*=0.35^dt`, low-speed pivot `+0.45*dt`; `driveForce=outTq/WHEEL_R`, `accel=driveForce/MASS*3.2 - drag - brake`, `speed clamp -9..22`.
- **Physics**: `resolveCollisions` with `radius 1.55`, terrain pitch/roll `atan2(hF-hB,2*hl)` with `k=dt*9` + wheel-corner clearance `wheelNeed=max(corners)+baseY+0.06` → `gh2=max(center+baseY,wheelNeed)`, vertical `py/vy/airborne` gravity 20 for ramp flight (`speed>7 && vy>0.2 && gh2<py-0.06` launches), impact shake/fov.
- **Wheels**: `rotateY(-ang)` where `ang=speed*dt/WHEEL_R` (local Y axle after -90Z), 4 cylinders.
- **Horn**: `Space` while driving → `car_horn.mp3` 650ms cooldown + `heardShot()` (RUSH_RANGE 45) + `showSubtitle('HONK!')`.
- **Bail/coast/crash**: empty cars coast `drag 0.52+|v|*0.11`, speed*0.5 on hard hit; exit `|speed|>5` → `damagePlayer min(20,(sp-5)*2.4)`; ram `|speed|>2.5 & dist<3.1` → `damageUgv min(250,|sp|*14)` + `damagePlayer min(20,|sp|*0.9)` cooldown 0.65s, `speed*=0.42`.
- **HUD**: `syncHudPositions()` snap each driving frame so world-mesh HUD doesn't trail (was 50ms interval).
- `S.carDriving` set on enter/exit, `window.__gaultCars`.

### tank.js
Driveable tank `tankv2.gltf` (single file, `F` near 3.8m, 3rd-person). `tankv2`: hull 3 meshes + `turret` group at `y=1.125` with `rotatespot` locator `0,0,0.1875` + turret head/cannon mesh `0,-0.0625,0.1875`; code re-parents turret origin to `rotatespot` so yaw rotates on that pivot (not mesh center) — hides locators, scale `1.5`, `baseY` from AABB, `S.tankDriving`/`S.carDriving` block infantry fire, `window.__gaultTanks`.

- **Physics (heavy)**: `MASS 8000`, `MAX 9 / -4.5`, `ACCEL 14`, `BRAKE 36`, `FRICTION 3.2*(1+absSp*0.08)` (short roll), brake-then-reverse: `S` while `speed>0.05` brakes `−BRAKE*dt` to `0`, holds `0.42s` then `−BRAKE*0.55*dt` reverse (symmetric `W` while reversing). Hill: `prePitch=atan2(hF-hB,3.4)`, `uphill=prePitch*moveDir`, `hillDrag=sin(uphill)*9.81*0.32` subtract, caps `>0.50→2.2 >0.62→0.9 >0.74→0.15+slide1.2 >0.86→0+slide2.8`, `|prePitch|>0.88→*0.88`; terrain `pitch/roll` `k=dt*6`, `resolveCollisions` radius `1.9`.
- **Steer U-turn heavy**: `STATIONARY 0.58 / MOVING 0.46`, `YAW_ACCEL 1.9 / DAMP 0.42`, `targetYawRate=steer*rate*grip*(speedDir)*(0.55-1)*(1-1.45)`, `yawVel+=(target-yawVel)*dt*1.9`, `yawVel*=0.42^dt`, `yaw+=yawVel*dt`; turret follows hull `dYaw` added to `turretYaw`.
- **Lean & shake**: `accelDelta=(speed-prev)/dt`, `targetLean=clamp(-accelDelta*0.0055, -0.10,0.08)`, spring `*10, 0.35^dt`; coasting nudge `0.0006`. Shake: movement `shakeAmp=min(0.02+absSp*0.003,0.05)* (accel?1:0.18)`, idle `0.007+absSp*0.0012)*(accel?1:0.35)`, yaw `rAmp=min(0.014+yaw*0.022,0.038)*(throttle?1:0.55)`.
- **Turret**: yaw `rel=clamp(world-hull, ±2.0 rad)` mouse `*0.0022`, pitch `−0.32..+0.28 rad` mouse `Y*0.0016` (no mesh anim), dir via `_tankEuler.set(pitch,yaw,0,'YXZ')` `0,0,-1` `applyEuler`. `F` enter puts `turretYaw=yaw`, `F` exit at `+cos(yaw)*3.0`, `+3.5` on destroy.
- **Combat**: `tankShoot()` muzzle `0,0.18,-1.75` `applyMatrix4(turretMesh)` + pitch/yaw dir, ray `180m` `Raycaster` filter `!tank/rain/ground` + ground march fallback, `PointLight 8/30 90ms` + `flash.png` sprite `1.2→3.0` additive, tracer `ffcc66 120ms`, `explodeAt(pos,40)` + `damageUgv` splash; recoil `shake 0.06/FOV6/CA4`, `pitchLean−0.12`, cooldown `1.4s`. HP `400/400`, `damageTank(dmg)` shows `TANK hp/400`, on `≤0` `explodeAt(pos,0)`, `TANK DESTROYED`, eject, `hideAim()`, `killTankAudio`.
- **Aim pointer**: circular crosshair sprite (canvas 256, 3 rings `88/62/38`, cross + diagonal ticks, center dot `5` + `10` ring, `#eaffff` `CanvasTexture`, `SpriteMaterial` `depthTest:false` `renderOrder 999`, distance-scaled `d*0.028` `0.85-3.2`, `+0.12` toward cam, `filter !tank/rain/ground/aim`), updates each driving frame, `hideAim()` on `!driving/dead/exit`, opacity `0.92+sin*0.08` `*0.55` on cooldown.
- **Polishing**: `buggy_engine.mp3` loop `Gain`, lerp `pitch 0.62+|speed|/9*0.42+|yawVel|*0.10+throttle*0.22`, `vol 0.09+throttle*0.34+|speed|/9*0.24+|yawVel|*0.09` (`0-0.78`), fade on idle/exit; dust pooled spheres `0.22` at rear `−fx*1.4` `0.32` opacity `0.85s`; cam clipped via `Raycaster lookAt→targetCam` `−0.45` + ground `+0.7`, `lerp 6` / `slerp 5`.
- **Solid**: tank is solid cyl `r 1.9` `h 2.6` (`tankY0/Y1` from `groundHeight`, direct `world.js pointInCollider`/`resolveCollisions` loop over `window.__gaultTanks`, self skipped via `ignoreTankIdx`) — player cannot walk through.

### mission.js
Linear COD-style phase controller (`S.map.mission`). One mission = ordered `phases[]`; each phase = one objective, win → next, last win → `showWin()`. Back-compat: maps without `mission` use legacy `allUgvsDead+extract/collect` win.

- **Data model** `mission: { phases:[{ title, desc, sub, audio, checkpoint:true, win:{reach|hold|clear|kill|collect|timer|extract}, spawn:[{kind,pos,rotY,sector}], waves:[{at,kind,n,sub,audio}] }] }` — `reach {x,z,r}` / `hold {x,z,r,sec}` / `clear|kill` (all foes) / `timer sec` / `extract`. `spawn` runs on phase enter, `waves` are timed (`now-phaseT0 >= at`).
- **Runtime** `setMissionMapReady(j)` (called from `world.applyMap`), `updateMission(dt,now)` (called from `main:playTick` before legacy win, owns `showWin`), `getHoldInfo()` → `{frac,remain}` for `boxBar`, `missionHudText()` → `i/N TITLE — HOLD ns`, `getMissionDiff()/setMissionDiff()` + `DIFFS` table.
- **Difficulty** `easy 0.6 / normal 1 / hard 1.35 / veteran 1.7` (`S.missionDiff`, persisted `gault_difficulty`). Chosen separately in hub `CAMPAIGN` header (`menu.js`) and pause `SETTINGS` (`ui.js:diff` stepper); scales `HP` at spawn (`newUgv/Turret/Boss/Drone hp*diff.hp`) and `dmg` on hit (`ugvShoot/turretShoot/bossFire/missile boom/drone ram` `*diff.dmg`). `window.__gaultMission` debug hook.
- **Checkpoints** per-phase `checkpoint!==false` saves `{idx,x,y,z,yaw,hp}` on `enterPhase` to `localStorage gault_checkpoint_<map>` + `CHECKPOINT` subtitle; `respawnToCheckpoint()` (called from `main` on `S.respawnRequested` when `isMissionActive()`) restores `cur`/`holdInside`/`phaseT0` + places `camera` at checkpoint; cleared on mission complete.
- **Subs + audio** per-phase `sub` (subtitle text) + `audio`/`audioUrl` (dataURL or path, <800KB) played via `new Audio` on `enterPhase` (stopped on phase advance / mission end); wave `sub`/`audio` also; existing `showSubtitle` drives the line.
- Spawns reuse `spawnMissionUgv/Turret/Boss/Drone` (`ugv.js:184`, `turret.js`, `boss.js`, `drone.js`) exposed as `window.__missionSpawn*`.

### melt.js
Melt emitter ("hot paint" scorch): a shader disc painted onto nearby surfaces around a melt point, plus a camera-proximity heat tint in the post pass. Map entity `kind:"melt"` (see Map Format) → `MAP_SPAWNS.melts`; spawns only when its trigger fires.

- **Shader patch** (`patchWorld`/`patchMaterial` via `onBeforeCompile`): every world mesh gets a cloned material with melt uniforms (`uMeltPos[4]`, `uMeltProgress[4]`, per-mesh `uObjCenter`/`uObjRadius`, `uMeltWorld`) — a filled wobble-edged disc (angular `sin` distortion on the outer edge, orange core → pale-yellow rim bands) drawn by fully replacing `diffuseColor` (opaque paint, not a tint). Lit materials also get `_meltGlow` added to `totalEmissiveRadiance` (`emissivemap_fragment` injection) so the disc stays full-bright in shadows; Basic materials fall back to a `dithering_fragment` injection. Max 4 active melts (`uMeltCount`); each eases in over `DURATION` 6s, then stays permanently.
- **Instanced foliage** (trees/bushes, `uMeltWorld=1`): use planar XZ distance to the melt point so the whole trunk/canopy column within range glows; `vMeltWPos` comes from three's `worldPosition` (bakes `instanceMatrix`). A coverage gate (`step(_spotDist, _edge*1.02)`) keeps textures intact everywhere outside the disc (no white wash).
- **Triggers**: melts boot into `triggers[]` (pending, invisible) — `area` fires when the player camera (XZ) enters `r` meters of the marker; `kill` fires when the count of live UGVs/turrets/bosses within `r` drops (any enemy death near the marker; reads `__gaultUgvs`/`__gaultTurrets`/`__gaultBoss`). One shot per marker per map load; `addMelt(x,z)` bypasses (immediate, used by debug/RC-style callers).
- **Screen heat tint**: `updateMelt` (called from `main:playTick`) writes `postMat.uniforms.uHeat`/`uHeatCol` — `exp(-dist/12)` camera falloff, eased in over the melt's first seconds, then persists (no age cutoff; only distance fades it) — the post pass tints the whole frame toward hot orange (`mix(c, uHeatCol, heat*0.35)` + red up / blue down). Resets to 0 when no melts are live.
- Debug: `window.__gaultMelt` (`addMelt`, `updateMelt`, `melts`, `triggers`, `patchWorld`, `meltUniforms`).

### trigger.js
**Stepnate** — versatile trigger spots (`kind:"trigger"`): place a spot in the studio, wire a flat action list that fires once (walk-in / enemy-death, same semantics as melt). Fires → actions run in order, each after its own `delay` seconds.

- **Actions** (`e.actions[]`): `{act:"move", prop:<props index>, dx,dy,dz, dur, delay}` smoothstep-moves a prop by an offset over `dur` s (0 = snap); `{act:"spawn", kind:"ugv|turret|boss|drone", x?, z?, rotY?, delay}` reuses `window.__missionSpawn*` (x/z empty = at the trigger); `{act:"say", text, delay}` → subtitle.
- **Prop registry**: `world.js` `propMeshes[]` is index-aligned with map `props` (null for tree/bush, `{mesh}` filled when the async gltf lands; move actions retry ~100ms until the mesh exists, drop if the index is gone). ponytail ceiling: MOVE refs `props[]` by index (re-pick after deleting props) and a moved prop keeps its original collider — place movers with `solid:false`.
- Runtime: `setTriggerMapReady()` (from `applyMap`) arms the spots; `updateTriggerSpots()` (from `main:playTick`, next to melt) fires + advances delays/moves. `window.__gaultTrigger` debug hook. Skipped on pvp maps (entities are).

### rc.js
Shop-bought RC car (once, `gault_rc`), a remote place-and-drive bomb with `USES_PER_MAP`(2) deployments per map.

- **Item**: buy in the hub SHOP (450 CC). Press **6** to arm (shows `RC CAR ×n [RMB PLACE]`), **RMB** drops it ~2.1m ahead with a look-down put-down anim; WASD drives it remotely on a chase cam (player stays frozen where they stood), **Space** detonates it.
- **Explosion**: reuses grenades `explodeAt` — splash kills UGVs within ~8m, light/smoke + post-pass shockwave. Camera then returns to the standing spot (`rc.startEye`). Consumes one use.
- Uses reset per map via `setRcMapReady()` (called from `world.applyMap`); active RC is aborted on map load or death. Drives like a fast arcade buggy (`resolveCollisions` radius 0.45), `buggy_engine.mp3` loop for sound.

### ugv.js
Multiple UGV instances: one model/wreck clone + state per UGV (`ugvs[]`), shared nav grid (2m cells over 200m, clearance 1.35), A* + string-pull waypoints, differential drive, suspension pitch/roll, stuck watchdog, damage/death/wreck-swap/respawn(25s), route-following patrol.

- **Sector confinement**: a UGV with a `sector` plans against a per-sector mask of cells outside the polygon, wanders inside it, clamps its investigate target and every post-collision position back to the boundary.
- **Attacks the player**: forward view cone (16m, ±0.9 rad) + 3D LOS (`playerLOS`); arcs toward you, stops at 9m, fires a hitscan tracer every 2.6s for **10 dmg** (`diffMult().dmg` via `S.missionDiff`).
- **Prone-in-grass concealment**: cert build-up ×0.5 prone, ×0.1 more in a grass stamp (ground enemies only).
- **Mission + difficulty**: `HP` at spawn `Math.round(250*diff.hp)`, `spawnMissionUgv(x,z,sector)` (`window.__missionSpawnUgv`) for phase `spawn`/`waves`.
- `ugvIdent(obj)` exports `{group,maxHp,hpFn}` for the hit-identifier box.

### grenades.js
Frag loader, `throwGrenade()` (G), flight+bounce, `explodeAt` pooled smoke/light ring 16 + shockwave, `updateGrenades(dt)` (`performance.now` wind).

- Fuse **2-3s** (`2+Math.random()`); bounces off heightfield floor and 3D colliders.
- Splash **320→0 dmg over 8m vs UGVs** (a close one kills a 250hp UGV); optional playerDmg → 0 over 6m, drones pass 20.
- **4 frags per map** (`S.mapGrenades`) with a `G: x` top-right HUD.
- **PvP**: a frag becomes a real kill tool — `explodeAt(pos, 40)`; the `S.pvpBoom` bridge forwards the blast to the peer (keeps the graph acyclic).

### ident.js
Pure-white target identifiers (world objects, choppy snap) + hp bar; label canvas reused, `updateIdent` no-throttle stub (30Hz comment).

- `identTarget(group,maxHp,hpFn)`, `identLanding(pt)`, `setLandingVisible(v)`, `updateIdent(dt,now)`, `identRadar(list)`.
- Enemy box fits the target's AABB + offsets; NB-1 landing box marks the last straf impact.
- Radar highlights: a pool of up to 8 extra rigs mirroring the damage box + hp bar, with certainty% in a small canvas label (red ≥90 overdrive, white ≥20, blue <20).
- DepthTest-off + renderOrder 999 → reads like a HUD overlay; enemy box holds 6s after last hit.
- `visibleBox` measures meshes only (invisible proxies don't inflate the outline); `clampToVisible` pulls the NB-1 marker onto the hit body.

### radar.js
Handheld scanner **V** (`DRAIN 15/s` `REGEN 6/s`, `batteryMax` cached 1s, sweep precompute comment) — cone ±0.9 60m → ident boxes.

- **Scanned enemies stay highlighted 20s** after the last ping (`SCAN_HOLD`), even after leaving the cone or turning the radar off.
- Battery recharges 6/s when off; max battery starts 100, **upgradeable in the hub shop** (+25 per 300-CC purchase, persisted `gault_battery`).
- Radar-highlighted kills give **+50% CC** on kill (UGV +50, drone +25).
- **Sonar + scan line**: `sonarPlay()/sonarStop()` loop `sonar.mp3`; the vertical scan line is a camera-anchored world-mesh canvas plane (`renderOrder 995`, additive), ping-ponging left→right once every 8 beats (`SWEEP_BEATS`), synced to the real AudioContext clock.
- Certainty label on each box is distance-scaled (`dist*0.1`) so it holds constant screen size.

### drone.js
FPV drone: smooth air wanderer → climb+dive-bomb on proximity → ram = boom. HP 25×`diff.hp`, shootable, respawns 12s after dying. Ram `20×diff.dmg`.

- Accel-limited steering; audible to ~120m (quiet fade).
- **Only spawns where the map pinned launch points** (`MAP_SPAWNS.drones`, gated by `setDroneMapReady()`); killed drones fall to ground and tumble (no explosion — only a ram detonates). `spawnMissionDrone(x,z)` for mission waves.
- **Vision certainty** (`d.cert`): <20 ignores you, 20-90 spots+dives, ≥90 **overdrive** (dive speed ×1.6, accel ×1.5).
- **Hunt lock**: after `HUNT_LOCK` (30s) without spotting the player (SPOT_DIST 18m), the drone locks on and hunts at any range; gets a persistent small lock-on outline (`identLock`).
- Strafe-kill awards +50 CC, +25 more if radar-highlighted within 4s.

### boss.js
TAT-10 boss (map entity `kind:"boss"`): a heavy stationary walker (turret-like yaw tracking) with a UGV-style gun + two shoulder missile launchers. HP 600×`diff.hp`, model `TAT-10.gltf` at scale 1.

- **Gun**: UGV-style cone detect (DETECT_RANGE 30, CONE_HALF 1.1 rad) + 3D LOS, fires a hitscan tracer every 2.2s for 10 dmg×`diff.dmg`.
- **Missiles**: both shoulder launchers fire a `missle.gltf` (scale 0.9) in staggered volleys (`MSL_COOLDOWN` 8s); each climbs to eye+40m, then dives at 70 m/s onto the player's head; `explodeAt(pos, 32×diff.dmg)` on impact/ground/lifetime (14s). In-flight missiles are shootable. `spawnMissionBoss` for mission.
- Win condition includes bosses (`allBossesDead`); boss death = explosion + all in-flight missiles vanish.
- Exports `BOSS_NAME`, `BOSS_HP`, `BOSS_FLASH`, `BOSS_MISSILES`; `window.__gaultBoss` debug hook.

### turret.js
Stationary machine-gun turret (map entity `kind:"turret"`): sits at spawn, swivels to track you, hoses the area with low dmg (1×`diff.dmg`) at high rate (~500 RPM, 0.12s), 20m vision / 25m fire range. Strictly forward view cone (`CONE_HALF` 1.0 rad) — flanking it is a real option. **Dead stays dead — no respawn.** HP 110×`diff.hp`, `spawnMissionTurret` for mission.

- Needs `fixGun` or the textured model renders near-black; reuses ugv's `playerLOS`; HP 110; stream drifts with `SPREAD=0.025` rad.
- **Part of the win condition**: mission complete requires ALL UGVs AND turrets destroyed (empty groups count as cleared).

### colorcorrect.js
Shared root module (like `idb.js`, importable from studio and game): RGB mean/std palette transfer. `imageStats(img)` samples a palette, `matchImage(sprite, stats)` repaints a sprite into it (alpha preserved, original kept by caller).

- Grass brush uses it when `grass.cc` is on: sprite is repainted into the map's ground-tile palette (original kept in `grass.texRaw`, restored when unticked).

### ui.js
HUD/UI world-mesh canvases (single-combine comment, `66ms` snap, dirty `text!==` checks, `OffscreenCanvas` hook).

- Ammo + HP HUD, **CC HUD** (top-left), **TAT-10 boss bar** (fixed top-center), **health-box progress bar** (green-fill, dead-center under crosshair) — also reused for **hold timer** (`mission.js:getHoldInfo()` → `updateBoxBar`), **mission HUD** (`1/N TITLE — HOLD ns`, `0.52×0.095`, `renderOrder 960`, `S.missionActive`-gated, updated from `main:playTick`), **pause menu + death screen** (2.2×1.1m world boards), **PvP score HUD** (`YOU n — m NAME · FIRST TO k`), **FPS counter** (`#info` `UNMANNED v0.9.7 · 60 FPS`, `400ms` `requestAnimationFrame` sampler, toggled by `FPS COUNTER` checkbox in `SETTINGS` → `gault_showfps`).
- Death buttons: RESPAWN (-100 CC) on top + KILL CAM (cyan, left) / FULL RESTART (right) below. In a pvp match: free RESPAWN + KILL CAM + QUIT MATCH. With mission, RESPAWN jumps to last `gault_checkpoint_<map>` phase (see `mission.js`/`main.js`).
- **Board pop animation**: shared pop system (`boardShow`/`boardReopen`/`boardHide` + one `boardTick`) — every board scales up from ~0 with smoothstep + a subtle mid-rise wobble.
- `showSubtitle(text)` (world-mesh canvas, `subMesh` at `camera+up -0.45 + fwd 0.9`, 2.5s+`len*55`ms) — used for car `[F] DRIVE`, `HONK!`, `CRASH`, `BAIL DAMAGE` + mission phase `sub` + `CHECKPOINT`.
- `syncHudPositions()` — snap all HUD/boss/mission/subtitle meshes each frame (car/tank call it to kill 50ms lag).
- **Settings** (`SETTINGS` 6 rows `132/180/228/276/324/372/422/464`): `ALWAYS-ON STRAF`/`LAPTOP`/`BRAIN ASSIST`/`FPS COUNTER` + `DIFFICULTY` stepper (`easy/normal/hard/veteran`, `S.missionDiff` via `mission.js`, persisted `gault_difficulty`) + `AIM ASSIST` stepper.

### menu.js
Boot loader + hub UI + MISSION COMPLETE overlay.

- The boot loader is the plain-HTML `#loader` overlay; flips to `CLICK TO LOCK MOUSE`, pointer-lock hides it. On the **first campaign map** (`Ardebin` file, display “Opening creds”) `maybePlayOpening()` plays `assets/audio/opening_credits.mp3` (HTMLAudioElement, vol 0.85, `window.__openingAudio`, once per session) right after the loader hides; `fadeOpening(2800)` ramps to 0 and pauses when the tut card is closed (`endStory` `wasTut` check, also covers Space-skip while tut open). `CAMPAIGN[0]` carries `title:"Opening creds"` for display while `map:"Ardebin"` stays the file key (preview/label use `title||map`, logic/locks stay on `map`).
- **Hub intro**: on lock the camera holds on the "YOU CAN ZOOM IN WITH SCROLLING" text ~1.4s, then eases out over 3.4s to spawn pose.
- **Hub board**: a map named "hub" is a menu — no movement/enemies/gun. Menu board is parked fixed in the world; switching sub-menus re-pops the board.
- Hub layout: title "UNMANNED" top-right; buttons CAMPAIGN / MULTIPLAYER / LVL PLAY / CUSTOM / SHOP / LOADOUT. **CAMPAIGN view shows a `DIFFICULTY: EASY/NORMAL/HARD/VETERAN < >` header** (`getMissionDiff()/setMissionDiff()` from `mission.js`, persisted `gault_difficulty`, `< >` are `panelBtn` at `512±`).
- `MULTIPLAYER` → **connection chooser**: `ONLINE` (join a host from the public server list — see `signalling.js`) or `LAN` (copy/paste). Once connected either way it becomes the PvP lobby.

### input.js
Mouse/wheel/key listeners.

- `F` near 3.8m toggles tank `tryEnterTank`/`exitTank` (prefer tank over car) else `3.2m` car `tryEnterCar`/`exitCar` (driving blocks its own handling), `Space` while car honks instead of braking/jumping; `C` prone blocked while `anyDriving()`; `G` grenade blocked while `anyDriving()`; `setFiring` blocked while `anyDriving()` (mousedown + laptop `KeyE`); tank `mousedown` left → `tankShoot()` + turret yaw/pitch `mousemove` `*0.0022/*0.0016` clamped `±2.0/ -0.32..+0.28`; **V** toggles radar; Digit5 = health box slot; **P** toggles pause, ESC opens it when unlocked.
- Mouse-pull eats accumulated recoil first; straf sensitivity cranked when strafLock on; laptop mode remaps Q=RMB, E=LMB; Y toggles bullet traces.
- Clicks gated in hub/won/dead and when the pause board is up.

### net.js
Multiplayer transport + in-world host/join board. Instance-based `Peer` class and a `RelayPeer` class, session singleton `netState`.

- **Two transports over one session API** (`send/onStatus/onMessage/peerName/endSession`), so pvp.js and the lobby are agnostic to which is live:
  - **WebRTC `Peer`** — LAN mode: zero-dep P2P, **manual SDP copy-paste signaling** (Google STUN), via `host()/join()/applyAnswer()`. Kept for same-network / reachable-directly play.
  - **Relay `Peer`** — ONLINE mode: no ICE/STUN/NAT at all. A server-forwarded session created by `relaySession(role, io)`; `send` ships each game payload to the relay's WS (`{type:'data'}`) and `recv(obj)` feeds a relayed payload back into the normal message funnel. `open()` (fired when the server reports the peer present) flips status to `connected`.
- **Name**: `myName()/setName()/randomName()/pasteName()` persist to `IDB gault_name` (defaulted from `src/names.json` — a callsign pool, `pick(names) + '-' + 3-char code`, no confusable 0/O/1/I). A `&name=` URL param overrides it at boot. `adoptPeerName(name)` lets relay mode learn the peer's name straight from the server (ordering-independent; WebRTC still learns it via the `hello` handshake).
- No text inputs (mouse lock makes typing impossible) — every text field is a COPY/PASTE button (+ `legacyCopy` fallback) in LAN; ONLINE has none.
- On connect each side re-announces its hello every 500ms until it learns the peer's name (idempotent, self-healing) — relay mode relies on this less since the server names the peer.
- **SDP sanitation** (`sanitizeSdp`, UA-sniffed, LAN only): rewrites Firefox's `a=max-message-size` to 262144, strips `a=sctp-port:`/`a=setup:`, re-terminates lines with `\r\n`.

### signalling.js
Automated **ONLINE** multiplayer transport — a **server-forwarded relay**, not WebRTC P2P. Each player keeps one WebSocket to the room server for the whole session; the server forwards every game message between host and guest verbatim (`{type:'data', payload}` → `_on_data`). No NAT hole-punching, no STUN/TURN, no port-forward: ONLINE connects any two players who can both reach the server, at the cost of one extra internet hop. Deep-links, roles and the lobby are otherwise unchanged; LAN copy/paste (`net.js`) still uses direct WebRTC.

- **Single join-by-name model**: everyone connects to a room with a player name; the server assigns the **host** role to the first player using the room's reserved host name, everyone else is a guest. No separate "host" flow.
- When **both** players are present the server pings *each* of them with `{type:'peer', role, name}` (host on guest-join, guest on host-arrival); on receiving it the browser opens its relay session → net reports `connected` with the correct role → the lobby/match start.
- **Online server list**: `onlineList()` fetches a public gist (`ONLINE_LIST_URL`, CORS-open, pruned client-side by `updated+ttl`) — the roster the in-game ONLINE menu shows.
- **join paths** (both call `onlineJoin(ws, room, pw, name, onErr)`):
  - in-game ONLINE menu → join a listed server (menu.js `pickOnlineServer`);
  - deep-link boot `?host=1&create=<CODE>&ws=<url>&name=<YOURNAME>[&pw=...]` (host) / `?join=<CODE>&ws=<url>&name=...` (guest) → the UM-server GUI opens these.
- Exports `window.__gaultSig`. A `guest_left` closes the host's relay back to "waiting" (room/WS stay up for a rejoin); `closed` ends the session.

### pvp.js
Remote shootable mesh; `POS_RATE 1/10` + circular buffer 4 + `DataView` encode stub + `__gaultDebug` gated logs.

- **Peer-authoritative 1v1 first-to-N**: each client owns its `S.hp` + collision resolution; only the map, ~15Hz movement snapshots, damage verdicts, explosions, and score/death cross the wire.
- **Remote body**: a primitive capsule + canvas name-tag sprite; parts tagged `userData.remote` so raycasts hit it. `remoteBodySetModel(proto)` is the gltf swap point.
- **Movement sync**: broadcast `{type:'pos',...}` at ~15Hz; peer buffers snapshots and lerps, snapping on any >8m jump.
- **Kill credit**: the killer is whatever the dying client's `lastHitter` says; suicides score nobody.
- **End conditions**: first to the limit broadcasts `pvpEnd`; both show YOU WIN / YOU LOSE + REMATCH / QUIT.

### main.js
Clock + frame orchestration: `updatePlayer` (support-based floor, STEP_UP auto-climb, sprint-jump keeps momentum), `updateCameraRig`, `updateViewmodel`, then turret/UGV/grenades/ident updates, CA uniform, `renderFrame`, `updateGrassCull()` + `updateRain()` per-frame (also in hub/won/paused/story cut branches so rain falls in camera story mode). `updateCars` always runs (even when driving, it drives; otherwise it coasts parked cars). `mission.js` tick runs inside `playTick`.

- **hub branch**: `S.hub` → `updateHubIntro(dt)` then camera free-looks, nothing else runs.
- **won branch**: `S.won` → world frozen behind the MISSION COMPLETE board.
- **paused/dead branch**: `S.dead || (S.paused && !S.pvp) || ...` = world frozen — in a pvp match pause/unlock never freezes the world. Driving → `isDriving() && S.dead` forces `exitCar()` then death cam; `respawnRequested` also exits car.
- Driving → `updatePlayer` skipped, `gunScene.visible=false`, `S.airborne` not set; `isDriving() && S.dead` forces exit.
- **Mission win** (`main:playTick`): if `isMissionActive()` then `updateMission(dt,now)` owns the win — handles `reach/hold/clear/collect/timer/extract` plus `spawn`/`waves` + `hold` → `updateBoxBar` + `missionHudText()` → `updateMissionHud`, last phase win → `showWin()`; else legacy `(ugvCount()+turretCount()+bossCount())>0 && allDead → showWin()`. Mission checkpoint `getCheckpoint()/respawnToCheckpoint()` is consumed on `S.respawnRequested` (places `camera` at `checkpoint.{x,y,z,yaw}`, restores `cur`/`holdInside`, lower `cert`). `animate()` also `placeMissionHud()` each frame.
- Update order: `updateTurret` (tank head) → `updateUgv` → (mission win) → `updateTurrets` (MG) → `updateDrone` → `updateBoss`, then `updateGrenades`/`updateCml`, and in a pvp match `updatePvp`.
- **Death cam**: camera drops to the ground and tumbles sideways (~1.8s) inside the frozen `S.dead` branch, then `showDeathScreen()`.

## Map Format (`maps/*.umm`, produced by studio/index.html)

```json
{
  "name": "...",
  "terrain": { "segs": 64, "size": 200, "heights": [65x65] },   // or omitted, size 50–1000
  "pvp": true,                                                 // or omitted (see below)
  "night": true,                                               // or omitted — dark blue night lighting
  "midnight": true,                                            // or omitted — almost blind (implies night)
  "rain": true,                                                // or omitted — LineSegments rain volume (see world.js)
  "fog": 50,                                                   // or omitted — 0 (dense near) ..100 (far) maps to FogExp2 0.020→0.002, studio VIEW slider + game applyMap
  "props":   [ { "model": "tree.gltf", "pos": [x,z], "rotY":, "scale":, "y"?:, "solid": } ],
  "blocks":  [ { "prim": "box|plane|cyl", "pos": [x,y,z], "size": [w,h,d], "rotY":,
                 "color":, "texture":, "repeat": [u,v], "solid": } ],
  "entities":[ { "kind": "player|pvp|drone|ugv|turret|tank|target|extract|boss|healthbox|car|melt|trigger",
                 "pos": [x,z], "rotY"?:, "sector"?:, "team"?:1|2, "trig"?:"area|kill", "r"?:meters,
                 "actions"?: [ { "act":"move", "prop":i, "dx":0,"dy":0,"dz":0, "dur":2, "delay":0 }      // stepnate: move props[i] by offset over dur s
                             | { "act":"spawn", "kind":"ugv|turret|boss|drone", "x"?:, "z"?:, "rotY"?:, "delay":0 }
                             | { "act":"say", "text":"", "delay":0 } ] } ],
  "routes":  { "ugv": [[x,z],...] },
  "walls":   [ [[x,z],...], ... ],        // invisible-wall polylines
  "sectors": [ { "pts": [[x,z],...] } ],  // drawn areas that confine assigned UGVs
  "splat":   { "layers":[url x<=3], "repeats":[n...], "tileM":[m...] },   // or omitted
  "groundTex": "PNG-dataURL (transparent overlay)",                        // or omitted
  "ground":  { "tex": url-or-dataURL, "tile": m, "unlit"?: 0..1 },         // or omitted
  "grass":   { "tex": "PNG-dataURL", "pairs": 2-6, "size":, "height":,
               "radius"?:, "pts": [[x,z]...], "unlit"?: 0..1, "cc"?: bool },  // or omitted
  "mission": { "phases":[ { "title":"INFILTRATE", "desc":"", "sub":"", "audio":"data:audio/... (<800KB)", "checkpoint":true,
                           "win": { "reach":{ "x":0,"z":0,"r":8 } } | { "hold":{ "x":0,"z":0,"r":12,"sec":30 } } | { "clear":true } | { "kill":{} } | { "collect":true } | { "timer":30 } | { "extract":true },
                           "spawn":[ { "kind":"ugv|turret|boss|drone", "pos":[x,z], "rotY":0, "sector":0 } ],
                           "waves":[ { "at":10, "kind":"ugv", "n":1, "sub":"", "audio":"" } ] } ] } // or omitted — linear COD phases (see mission.js)
}
```

- `pvp: true` → numbered team spawns (see below), no AI (the game skips every drone/ugv/turret/boss/tank/target/healthbox entity), playable from MULTIPLAYER only.
- `rain: true` → camera-following `LineSegments` rain volume (2100 streaks, polar disc `R=65` + triangular `y`, per-drop `v`/`len`/`drift`, `LineBasicMaterial` `0xc9d7f0`/`0.38` fogged, night dim; `world.js` `setRain`/`updateRain` + `studio/core.js` preview; `applyMap`/`rebuildAll` migrate via `j.rain`; studio File toggle `rainToggle` in `state.js` `freshMap`).
- `fog` 0–100 slider (`VIEW` card) — `18m→858m` (`r=18+v*8.4 → d=1.7/r`, was `85m→850m` `d=0.020 - v*0.00018`), default 50 (`438m`). Saved to map (`S.map.fog`) and to `localStorage gault_fogSlider`; `fogCullR2()` culls grass (game) / props/blocks/entities (studio) behind fog when `0` is really close; studio `Hide fog` toggle (`gault_hidefog`) is studio-only preview (density 0 when on, disables cull). Game `applyMap` calls `setFogSlider(j.fog)`.
- `ground` overrides the base ground tile (default grass.webp) across the whole field; `unlit` uses MeshBasicMaterial so the tile shows true colors.
- **Blocks** → meshes + colliders at load (`addBlock`); rotated boxes get enclosing-AABB colliders (known ceiling). `prim:plane` uses `polygonOffset` (`-1,-1`) + `DoubleSide` so a flush wall decal no longer z-fights its box face (migrates old maps without moving data; fix in `studio/core.js` `buildBlockMesh` + `src/world.js` `blockMaterial`).
- `y:'drop'` seats a prop/tree on the terrain surface (`groundHeight(x,z) − lowest vertex`), not the old flat y=0; an explicit `y` sets an absolute base height.
- Every object a map builds (ground, grass/paint overlay, props, trees, blocks, targets, tanks, **cars**) is **fully torn down on each `applyMap`** — an in-place rebuild drops the whole previous world instead of stacking it.
- **Trees** collide with a trunk cylinder (r 0.85×scale, up to 2.2×scale); current tree model ~6.7 units tall at scale 1, so map trees default to ~0.95 scale.
- `splat.layers` lists paint textures; `tileM` is per-layer world tile size in meters (big uploads auto-fit via `fitLayerTile`).
- Painting writes a **transparent overlay** canvas (`groundTex`): rendered as a raised (`y+0.05`) transparent **unlit** mesh over base grass. `groundTex` stays null until you paint; Clear Paint resets it. Overlay canvas is 1024² (bake res 2048² blew the localStorage quota).
- A `healthbox` entity spawns a free map-local health box pickup (HPB model, marker `H`): run over it → `S.mapBoxes` +1; usable via slot 5, stays in the map (resets every `applyMap`), never in the persistent vault. Pickups are one-time per map load.
- A `car` entity (`kind:"car"`, pos[x,z], rotY) spawns `buggy.gltf` (`MAP_SPAWNS.cars`): `F` within 3.2m → `tryEnterCar()` puts camera `py+(1.55-baseY)` in middle, `F` again exits `+cos(yaw)*1.9`; `Space` honks `car_horn.mp3` + `heardShot()`; ram `>2.5m/s` damages UGV `min(250,sp*14)` and you `min(20,sp*0.9)`; bail `>5m/s` damages you `min(20,(sp-5)*2.4)`; empty cars coast `drag 0.52+|v|*0.11`.
- A `melt` entity (`kind:"melt"`, pos[x,z], `trig:"area"|"kill"` default `area`, `r` meters default 8) places a melt emitter marker (`MAP_SPAWNS.melts`, frag.gltf ghost + colored radius ring in the studio — orange walk-in / red kill): `area` fires the hot-paint melt when the player walks into the radius, `kill` fires when any UGV/turret/boss dies within it (one shot per map load). Studio: select the marker → SELECTION panel edits trigger + radius. Shader disc + screen heat tint, see `melt.js`.
- A `trigger` entity (**stepnate**, `kind:"trigger"`, same `trig`/`r` semantics as melt) is a versatile event spot: on fire it runs `actions` in order, each after its own `delay` — `move` (smoothstep a prop by dx/dy/dz offset over `dur` s), `spawn` (ugv/turret/boss/drone via the mission spawn helpers, empty x/z = at the trigger), `say` (subtitle). One shot per map load; yellow ring in studio (red when kill). **Studio: the STEPNATE workspace (launcher `Stepnate`)** lists all triggers, has `+ place new trigger` (presets the Place tool), and per-trigger editing — MOVE props are chosen by clicking **pick** then the prop in the viewport — the same click selects it, you drag/nudge it to its end spot, **Enter** captures the offset (prop snaps back; Esc restores); **end spot** instead just clicks the world position the prop should end at (Δ computed, vertical from terrain) (dropdown + Δ fields fallback; trees/bushes unmovable). See `trigger.js` / `studio/stepnate.js`.
- `mission` (opt, `S.missionActive`): linear COD phases (`mission.js`). When absent, win is legacy `radios+extract/clear`. When present, `setMissionMapReady` takes over — per-phase `reach` (enter `r`m zone), `hold` (stay `r`m for `sec`, progress on `boxBar`), `clear`/`kill` (all foes dead), `timer`/`duration` (survive), `collect` (all radios), `extract`. `spawn`/`waves` use `spawnMissionUgv/Turret/Boss/Drone` (difficulty-scaled `HP/dmg`). `sub`+`audio` (HTMLAudio dataURL <800KB) play on phase enter; `checkpoint` (default true) saves `gault_checkpoint_<map>` + `CHECKPOINT` sub; respawn there via `main:respawnToCheckpoint`. Difficulty `S.missionDiff` (`easy 0.6 / normal 1 / hard 1.35 / veteran 1.7`, persisted `gault_difficulty`, chooser in hub `menu.js` + pause `ui.js`) scales `HP` at spawn and `dmg` on hit.

### PvP spawns
Entity kind `pvp` (the studio's "pvp spawn"): `{kind:"pvp", pos:[x,z], rotY, team:1|2}`. In-game it lands in `MAP_SPAWNS.pvp` as `{x, z, rotY, team}`; the match seats host on team 1, guest on team 2. A pvp map must carry **at least one spawn per team** (the studio blocks Export/▶ Play otherwise). Marker = team-colored disk (`1`/`2`, cyan/red) + an eye-level facing arrow.

### Invisible walls (`walls`)
Each entry is a polyline of `[x,z]` points drawn with the Wall tool (6). Each segment becomes a `seg` collider (world.js `addWall`): a thin (0.12m) strip from just under the terrain up to ~2.6m above it — blocks the player **and** UGVs (nav grid + LOS) but is never a walkable floor. Segments are placed with their own midpoint's ground height.

### Sectors (`sectors`, the Sector tool — 9)
Drawn like walls, but each polyline **closes into a filled area** (cyan fill + boundary, yellow while a draft). Each sector row lists a checkbox per placed UGV; checking one stores `sector: <index>` on that UGV. **Auto-find** assigns every unassigned UGV inside the polygon on finish/⟳ — manual picks are never clobbered.

In-game (ugv.js) a sector-confined UGV:
- has its nav cells **outside the polygon blocked** (a per-sector mask OR'd over the shared wall grid), so A* and route/wander targets never leave it (a pinned `routes.ugv` patrol is ignored in favor of wandering inside);
- clamps its **position back to the boundary** after every collision step (including the direct-to-player attack drive) and clamps a heard-shot investigate target to the nearest boundary point;
- can still spot/engage the player across the boundary (it fights from inside).

`pointInPoly`/`clampToPoly` (ray-cast + nearest-edge with a vertex-bisector interior fallback) are the geometry core, self-checked by `sector_test.js`.

### The hub map
A map whose `name` is `hub` (file `maps/hub.umm`) is the main-world menu. While open you can't move, fight, or see the viewmodel — the camera just free-looks at the parked menu board. On the first lock it plays a short intro. Build it in the studio like any other map; keep the name "hub" and it boots as the front door. A hub.umm with any other name loads as a normal level.

## Studio (`studio/` dir — ES modules)

Serves from `studio/index.html` (needs an http server — ES modules won't load over file://). No pointer lock: RMB drag = orbit, MMB drag = pan, wheel = zoom, WASD/R/F truck the rig (Shift fast). Asset paths are repo-root relative (`../assets/...`).

```
studio/index.html     shell (CSS + topbar + floating `fwin` panels + modals) → loads main.js
studio/state.js       constants (SEGS/SIZE/HALF/W), formulaHeight/freshMap/freshSplat/freshMission/freshPhase, shared S bag, SIZE now 50–1000, rain:false, mission:null
studio/core.js        three setup, textures/models (loadProto, fixModel), world build, ground-paint, VIEW fog hide/slider, rain preview (setRain/updateRain polar+triangular)
                     canvas primitives, undo/persist, camera rig (orbit.pos unlimited for far zoom), picking, brushRing, showSelInfo (also opens the SELECTION fwin) + melt trigger editor (walk-in/on-death + radius ring)
studio/tools.js       aimHit/ghost/snap, place/delete/dup/nudge/rotate/scale, terrain brush (extreme toggle),
                     wall tool (vertices/draft/finish), wall select+delete, multi-select (S.multiSel, getSelections, bulkBoxEdit)
studio/paint.js       ground paint tool, layer-list UI, pixelizer + custom textures
studio/ui.js          setTool/tool buttons, modals, file ops (new/play/export/import/slots), handleKey/hint, fog UI, fwin drag/close + workspace launcher toggles, rain toggle + bulk-box UI
studio/main.js        input listeners, drag-move (multi), boot, tick loop (updateRain even in preview), __studio (wheel/ orbit no clamp)
studio/grass.js       Grass tool (0): billboard-vegetation brush (worker-backed, incremental buffers, see below)
studio/grass.worker.js  Web Worker: off-main-thread grass fill/scatter (fills, plan place-all)
studio/mission.js     Mission tool (linear COD phases): Mission fwin (enable, phase list ▲▼✕, per-phase title/desc/sub/audio<800KB dataURL/checkpoint/win{reach/hold/clear/collect/timer/extract}/spawn/waves, raw JSON toggle), wsMission launcher, window.__renderMission hook
studio/stepnate.js    STEPNATE workspace (wsStepnate launcher): trigger list + editor — walk-in/enemy-death + radius, flat action list (move prop w/ pick-then-drag aiming, end-spot click, spawn, say line) + per-action delay; pick mode via S.stepnatePick intercepted in tools.onMouseDown (falls through so the same click selects+drags), aim mode via S.stepnateAim — drag/arrows/PageUp-Down the prop to its end spot, Enter/✓ captures Δ and snaps the prop back (Esc/✕ restores), translucent ghost clones preview each move's end position; window.__renderStepnate/__stepnateSelect/__stepnateAimRestore hooks
```

- **Boot loader**: `studio/index.html` shows a full-screen **loading overlay** (`UM.STUDIO / loading world / <map name>…`) until the autosaved world has actually appeared. core.js exports `whenAsyncIdle(fn)`, a counter of in-flight async loads (gltf props + entity models via `loadProto`, ground/splat/block textures via `makeTex`, restored `groundTex` paint image); `boot()` (main.js) calls it after `rebuildAll()` so the overlay hides once every queued load drains (held ~600ms so quick loads don't flash). A second **`#busy` overlay** is shown during bulk grass operations (fill unpainted / place all) so the viewport never looks frozen.

### Grass tool — worker + growable buffers (`studio/grass.js`, `studio/grass.worker.js`)
- Brush strokes are **incremental**: each painted point scatters its blades **once** straight into growable GPU buffers (non-indexed quads, 6 verts each, capacity doubling). While dragging, only the newly-appended tail is uploaded each ~120ms tick (`attribute.updateRange` partial + `setDrawRange` + recomputed bounding sphere) — cost is O(new blades), independent of how much grass the map already holds. Full re-scatters happen only on settings/sprite/fill changes.
- **Bulk ops run on a Web Worker** (`grass.worker.js`) so big jobs never freeze the studio: it mirrors the terrain height sampler (`sampleHeight`) and quad emitter, and for a job either scatters a known point list ("place all") or both generates the candidates and scatters them ("fill unpainted"). `#busy` shows meanwhile; results (points + a zero-copy `Float32Array` of positions) come back and are appended to the live buffers via `_appendBulk` (uvs/normals derived by the fixed 6-vert quad pattern), then flushed once.
- **fill unpainted is radius-aware**: it pitches points at `radius × 1.9` (scatter disks just touch → an even meadow, no isolated clumps, no bald gaps) instead of an arbitrary fixed 2.2m; point budget = field area ÷ footprint, floored at 120 and capped at 4000 so the single fill never hangs a huge (up-to-1000m) map.

No right-hand sidebar anymore — every control lives in a draggable **workspace floating window** (`.fwin`). The top toolbar is full-width and is the launcher: the build-tool buttons (Select..Grass) set the tool AND open their matching panel (Select opens SELECTION, Place→PLACE, Terrain→two TERRAIN windows, Paint/Wall/Sector open their panel), while the **File · Match · Ground · View · Sel · Mission · Stepnate** buttons toggle the always-available global workspaces (`mission.js` adds `Mission`). Picking anything opens SELECTION automatically (core.js `showSelInfo`). Every window header has a **pin** (`core.js` `addPinButton`/`isPinned`): pinned windows stay open even when you switch to another tool/workspace (the tool-window hide logic and the grass/greenery/story mode togglers all consult `isPinned`).

Dep graph is acyclic: `state ← core ← tools ← paint ← ui ← mission ← main` (`ui ← stepnate` too — stepnate imports state+core only) (mission reads/persists via `S.map.mission`, `window.__renderMission` hook; game `src/` has `state←mission` + `world→mission` runtime-only cycle like `world↔ugv`).

### Tools (the numbered row on top = the **workspaces**)
| # | Tool | Notes |
|---|---|---|
| 0 | Grass | billboard-vegetation brush: upload a transparent sprite, paint points, each spawns 2-6 crossed billboard pairs; all blades merge into ONE geometry + material (`map.grass`). Incremental growable buffers while painting; `fill unpainted` (radius-aware) + plan `place all` run on a Web Worker with a busy overlay |
| 1 | Select | pick/drag/nudge/arrows/[ ]/-+/V/X · **Shift+drag lifts vertically** (`dragStartMouseY`, props+blocks, `finishDrag` persists y) · multi: `Shift/Ctrl+click` toggles box multi (`S.multiSel`, gold `BoxHelper`s), `bulkBoxEdit` color/texture in Selection `bulkBoxRow`, drag/nudge/rotate/scale/duplicate/delete on all |
| 2 | Place | **floating `fwin`** `placeFwin` (330,40 300px draggable, × close): **text-only chips + searchable 2-col grids** (no dropdowns, wheel `stopPropagation` so scroll doesn't zoom): `kind` chips `PROP/BLOCK/ENTITY`, `model` grid 2-col + filter `modelSearch`, `prim` chips `BOX/PLANE/CYL`, `entity` grid 2-col + filter `entSearch` (text-only, pvp/player hidden per `pvpToggle`), `team` chips `1/2`; ghost preview + grid snap (G: 0.5/1/2m), scale/rotY; entity now includes `tank (T, tankv2 1.5)` + `car (C)` |
| 3 | Terrain | **two floating `fwin`** `terrainBrushFwin` (330,40) and `terrainMountainsFwin` (330,190) + **extreme** checkbox (radius 30→120, strength 17→80) — raise/lower/smooth/flatten brush with radius+strength (writes heights live) |
| 4 | UGV route | click waypoints |
| 5 | Paint | brush ground textures onto a transparent overlay (`groundTex`) |
| 6 | Wall | draw invisible-wall polylines: click = vertex, Enter/RMB = finish, Backspace = drop last |
| 8 | Greenery | forest brush: pick trees/bushes/both, radius, size ranges; left-click stamps random groupings — `greenery.js` now syncs `sel.value=G.mode`, integer counts (`floor`), `HALF`-aware bounds (`abs(x)>HALF-0.5`) for 600m maps, `tries 30→50`, distinct `set count` vs `no room` status |
| 9 | Sector | draw areas like walls but each closes into a **filled** cyan region (see Sectors above) |

- Entity types: player, drone, ugv, turret, **tank (driveable tankv2, 400 HP, absorbs damage, marker `T` cyan `8fb8ff`)**, target, extract, **boss** (TAT-10, marker `B`), **healthbox** (HPB, marker `H`), **car** (buggy, marker `C`), **trigger** (stepnate, marker `↯` yellow — STEPNATE workspace edits trigger/radius/actions), **pvp spawn** (only when pvp-flagged — team select).
- **Mission workspace** (`missionFwin`, launcher **Mission** — `studio/mission.js`): `Enable mission` creates `map.mission {phases:[]}`; phase list `▲▼✕` + `+ add phase` (uses `freshPhase`); per-phase editor: `title`/`desc`/`sub`/`audio` file→dataURL (<800KB, stored inline, cleared via `clear` button, shows `✓ KB` badge)/`checkpoint` checkbox/`win` select (`clear/reach/hold/collect/timer/extract` + `x/z/r/sec` params)/`spawn` list (`kind ugv|turret|boss|drone + pos x/z + + spawn`)/`waves` list (`at sec + kind + n + + wave`) + `raw JSON` toggle (`missionRaw` textarea → `apply raw`). Updates via `pushUndo(); dump(); saveAutosave(); window.__renderMission()`. `rebuildAll` calls `window.__renderMission()` to stay in sync.
- **Match workspace** (`pvpFwin`, launcher **Match**): the `pvpToggle` checkbox sets `map.pvp`; ON hides the single-player spawn and reveals pvp spawn + team select. Export/▶ Play validate pvp maps (block unless there's a team-1 and a team-2 spawn).
- **View workspace** (`viewFwin`, launcher **View**): `Hide fog (studio only)` (`gault_hidefog`, `localStorage`, studio preview density 0) + `fog distance` slider 0–100 (`gault_fogSlider` + `S.map.fog`, `18m→858m` via `r=18+v*8.4 → d=1.7/r`, was `85m→850m` `d=0.020 - v*0.00018`). `fogCullR2()` hides `prop/block/mark` behind fog (`studio/main.js` tick) to save draw; studio core `sliderToDensity` + `rebuildAll` syncs checkbox/slider from map.
- **Ground workspace** (`groundFwin`, launcher **Ground**): sets `map.ground` (base-tile texture + tile size) to replace default grass.
- **File workspace** (`mapFwin`, launcher **File**, open at boot): map name/size, night/midnight/rain (`rainToggle` → `map.rain` + `setRain` preview), New/Play/Save/Load slot, status line. `S.map.mission` round-trips via `dump()` (JSON) like the rest of the map.
- Paint tool: per-layer tile-size (m) control, **opacity** slider that does not stack, "messy blob" checkbox for a randomized 7-point brush shape, erase-to-grass.
- **Texture pixelizer**: image → downscale + posterize + Bayer dither → usable as block texture or PNG download. **"keep original" is checked by default** — uploads re-encoded to PNG (capped at 512px); uncheck to pixelize. Content-sniffed so any decodable image works.
- Terrain `SIZE` 50–1000 (was 400 cap), `groundHeight` now `mn=-size/2`, `#mapSize` input live-rescales existing map (`S.map.terrain.size=v` + `rebuildAll`) not only `New`; `FILE` size input now `max 1000`; `orbit.pos` clamp removed on wheel (`main.js`) and WASD (`core.js` `updateCamera` `zoomFactor=1+max(0,y)*0.06+max(0,len-40)*0.015`) so movement speeds up when zoomed out and zoom is unlimited for big maps.
- Ctrl+Z undo (JSON snapshots), localStorage autosave/slots, Export/Import JSON, ▶ Play writes `gault_draft` and opens `../index.html?map=__draft`.
- Debug: `window.__studio()` returns `{map, tool, selection, splatState}`; paint debug via `dbg()`.

## Cross-module cycles (fine: runtime-only calls)
- `world` ⇄ `ugv` (loaders call buildUgvGrid; ugv imports colliders/groundHeight/resolveCollisions)
- `ugv` ⇄ `grenades` (damageUgvSplash ↔ explodeAt splash/death boom)
- `weapons` → `drone` (shoot hits `inDrone`/`damageDrone`; drone doesn't import weapons)
- `world` ⇄ `turret` / `world` ⇄ `drone` / `world` ⇄ `boss` (world gates spawn via setXMapReady; entity imports groundHeight/MAP_SPAWNS/fixGun)
- `boss` ⇄ `ui` (boss imports addCc/drawBossHud; ui imports bossInfo/applyAimAssist/BOSS_NAME)
- `boss` → `radar` (boss imports radarBonus; radar imports bossList)
- `boss` → `ugv` (boss imports damagePlayer/playerLOS/buildUgvGrid)
- `turret` → `ugv` (`damagePlayer` + `playerLOS`), → `grenades` (`explodeAt` on death), → `ui` (`addCc`), → `radar` (`radarBonus`); `ui` ⇄ `turret` (`applyAimAssist`)
- `pvp` → `grenades` (`explodeAt` for the received `boom`) — `grenades` → `pvp` avoided via the `S.pvpBoom` bridge (a plain `grenades → net` edge would close a cycle and blow up module init)
- `pvp` → `net`, `weapons` → `pvp` (`inRemote`/`damageRemote`), `menu` → `pvp` (lobby) — pvp imports ugv/ui/world/ident/grenades/net
- `ui` ⇄ `pvp` avoided via the `S.pvpQuit` bridge; `pvp` → `ui` (boardShow/boardHide/showSubtitle/requestGameLock) is one-way
- `world` ⇄ `car` (`setCarMapReady` ↔ `groundHeight`/`MAP_SPAWNS`/`resolveCollisions`/`showSubtitle`), `car` → `ugv` (`damageUgv`/`damagePlayer`/`heardShot`/`ugvList`), `car` → `weapons` (`setFiring`) — all runtime-only
- `car` → `ui` (`showSubtitle`/`syncHudPositions`) one-way
- `world` ⇄ `tank` (`setTankMapReady` ↔ `groundHeight`/`MAP_SPAWNS`/`resolveCollisions`), `tank` → `ugv` (`damagePlayer` via `window.__gaultDamageTank` 400 HP, absorbs damage while `S.tankDriving`), `tank` → `grenades` (`explodeAt` 40), `tank` → `ui`/`audio` (`showSubtitle`/`actx` loop) — runtime-only
- `world` ⇄ `mission` (`setMissionMapReady` ↔ `atExtract`/`radiosPlaced`/`ugvCount`/`turretCount`/`bossCount`), `mission` → `ugv`/`turret`/`boss`/`drone` (`spawnMission*` + `diffMult` via `S.missionDiff`), `mission` → `ui` avoided — `main` bridges `missionHudText`/`getHoldInfo` → `updateMissionHud`/`updateBoxBar` + `showSubtitle` via `window.__gaultShowSubtitle`; `ui` → `mission` (`getMissionDiff/setMissionDiff` for difficulty stepper) one-way for settings, `menu` → `mission` same — runtime-only
- `main` ⇄ `mission` (playTick `isMissionActive/updateMission/missionHudText/getHoldInfo/respawnToCheckpoint`; animate respawn) — main owns win branching

## Collisions — 3D now
- Colliders carry Y extents: `box {minX,maxX,minY,maxY,minZ,maxZ}`, `cyl {x,z,r,y0,y1}`, `seg {x1,z1,x2,z2,r,y0,y1}` (invisible walls).
- `resolveCollisions(x,z,vel,footY,headY,radius?,segsAlwaysBlock?)`:
  - skips colliders whose top ≤ footY + `STEP_UP`(0.55) → low walls are stepped onto;
  - skips colliders starting ≥ headY → walk-under bridges/overhangs;
  - `seg` colliders block but never support.
  - **The UGV passes radius 1.35 + `segsAlwaysBlock=true`**: pushed out of every collider, and invisible walls are always full barriers for it. **The buggy passes radius 1.55**, **the tank `1.9`**.
- `supportHeight(x,z,fromY)`: terrain + any collider top within step-up → the floor you stand on (player gravity and grenade bounces both use it); `seg` walls skipped.
- `pointInCollider(x,y,z)` is Y-aware (grenades sail over low walls); `seg` uses distance to the line segment.
- UGV nav grid only marks cells blocked when the collider's span intersects `[terrain+0.4, terrain+2]` at that cell — **except `seg` walls, which block at any terrain height**; UGV 3D LOS adds `segHitsSegWall`.

## Aim system — the bodycam feel
- Free-aim deadzone (DEADZONE=0.16 rad): barrel lags camera via `S.aimErr`; **bullets follow the barrel**, not screen center.
- Straf (hold RMB): camera keeps a small slice of recoil; mouse steers barrel (AIM_RANGE_X/Y); wheel slides whole gun (`S.aimShift`) for blind-fire; barrel holds its deadzone offset (no recenter).
- True ADS (X): face pose, sights centered (kills aimErr/aimShift), FOV −20.
- Wall proximity: forward raycast <1.3m → gun retracts 0.55, tilts 0.6 rad (`S.wallProx`).
- Sensor FX per shot: fovPunch, shakeX/Y jitter, caKick spike — fast decays.
- **Aim assist** (UGV, drone, turret): invisible hitbox grown by `S.settings.aimAssist` (default 1.12 = 12% bigger; 0 = off, up to 10×), tunable in pause settings. The NB-1 marker is pulled onto the visible body (`clampToVisible`).

## Weapons

| # | Name | Behavior |
|---|---|---|
| 1 | Sten | full-auto 550 RPM, 30 rd, reload 1.512s (empty-mag model swap) |
| 2 | PS8 | pump 55 RPM, 8 rd, 6 pellets spread 0.1, reload 4.15s |
| 3 | NB-1 | bolt 40 RPM, 5 rd, dmg 150, heavy recoil, reload 1.123s — close-range damage ramp (23% at arm's length, full by 20m) |

- **Bullet drop** (`w.drop`): every round falls quadratically with range — `drop` = meters of fall at the 150m raycast far, `dropAt(t)=drop·(t/150)²`. The analytic ground march bends with it, so long-range shots (Eagle 1.8m, AK 0.6m, NB-1 0.5m) land low unless you aim above. Still hitscan, just bent.
- **T bash** (`tryBash`): heavy melee — the gun draws back, slides to center, then **slams outward**. A forward cone sweep (~72°, up to 2.2m) hits every enemy in front. Damage scales with gun weight (`w.bash`): WGS-25 20, Sten 25, Eagle/Golden/AK 40, PS8 55, NB-1 70. 0.7s swing + 0.9s cooldown.
- Recoil ramps to ~3.5x after ~1.4s sustained (`fireHeld`); pump blocked while trigger held.
- **Prone steadies the shot**: recoil ×0.55 vertical / ×0.2 horizontal while prone.
- Weapon switch (1/2/3): 0.4s dip-and-rise (`switchK` triangle envelope); state switches instantly so you can fire/reload mid-animation.
- **Bullets** emit exactly from the flash sprite (true barrel). The muzzle sits ~3.6m ahead of the eye; if it lands inside geometry it retries once from the eye. **Y toggles persistent red traces** (debug).
- **Recoil split**: hip → camera 100%. Straf → camera 30% + gun 70% (total matches hip fire); shake stays on the gun.
- **Drone is shootable**: HP 25, per-pellet `damageDrone`, respawns 12s later.
- **No shooting while driving car** — `input.js` `mousedown`/`KeyE` blocked when `anyDriving()` (car), `car.js` `enter()` calls `setFiring(false)`, `main.js` hides `gunScene`; **tank can shoot** `LMB` → `tankShoot()` `1.4s` `explodeAt 40` via turret pitch/yaw dir, `S.tankDriving` absorbs `damagePlayer` → `damageTank 400 HP`.
- **Respawn economy**: CC earned lands in a per-map pool `S.mapCC` (not the vault), shown in the CC HUD; banks to the vault only on mission complete (`bankMapCc()`). Dying costs 100 CC from the pool (RESPAWN greyed out when it can't cover it). On respawn enemies reset vision certainty to **40%** (`lowerCert()`).

## Online multiplayer server (`~/Code/UM-server/`)
A companion Python app that hosts ONLINE rooms + the public lobby list. It is a **relay**: once both players are in a room, every game message the two browsers send rides this server verbatim between them (see `signalling.js`). It is **not** a game server (no simulation/authority) — just a forwarding hub. The browser game no longer does WebRTC in ONLINE mode, so there is no SDP/ICE/NAT to traverse; connect == can reach this WS.

- `ws.py` — stdlib RFC6455 WebSocket server (hand-rolled codec + threaded server).
- `signalling.py` — rooms: `precreate(code, server_name, mode, password, map, mapdata, host_name)` reserves a room; join assigns the **host** seat to the first player whose name == `host_name`, others are guests (guests may wait before the host arrives). Wire ops: `signal` (legacy SDP relay, unused by ONLINE now), **`data` → forwarded verbatim to the other player** (the relay), `map`/`getmap` (stream the preloaded map), passwords, teardown on host leave. Pings **both** peers with `peer` once a room is full.
- `registry.py` — the **public server list** = a GitHub gist (account AIX-32, id `a1c272...`), read/written via `gh api` (no stored token); the raw gist URL is CORS-open so the browser ONLINE list fetches it directly.
- `app.py` — Tkinter **Host** tab (server name + **your player name** + map + mode + port + password; Start boots signalling, registers the room, and opens *your* game as the join with your name → you become host) and **Join** tab (your name + pick a listed server → opens the game joined).

### ONLINE flow
Game menu `MULTIPLAYER → ONLINE` lists servers from the gist; JOIN sends your name to that room's ws. Hosting = run `app.py` Host tab. Because ONLINE is server-forwarded, the only reachability requirement is that **both players can reach the host's relay WS** — same LAN/VPN now, tunnel for WAN (port-forward/cloud so friends off-LAN can reach it). LAN copy/paste (`net.js`) stays as the zero-server WebRTC fallback for mutually-reachable machines.

## PvP — first-to-N kills over the net channel
The MULTIPLAYER menu becomes a 1v1 match once the net session connects. Host picks a pvp-flagged map, sets the kill limit (5–30, default 10), both sides load the map in-place. The transport is either the direct WebRTC LAN session or the ONLINE relayed session — pvp.js sees the same `net` API either way.
- **Peer-authoritative**: each client owns its `S.hp` + collision resolution; only the map, ~15Hz movement snapshots, damage verdicts, explosions, and score/death cross the wire. No lag compensation — the shooter's raycast is the verdict.
- **Remote body**: primitive capsule + name-tag sprite, interpolated from the peer's pose and snapped on teleports; a normal shootable mesh (`inRemote`).
- **Kill credit**: the killer is whatever the dying client's `lastHitter` says; suicides score nobody. Kill cam still works. Respawns free, instant, at your team's spawn.
- **Combat deltas vs single-player**: grenades hurt players (40 → 0 over 6m, thrown by either side); CC/health boxes/AI are inert; CML-2 has no radar lock target. Pause/ESC never freezes the world in a match.
- **End conditions**: first to the limit broadcasts `pvpEnd`; both show YOU WIN / YOU LOSE + REMATCH / QUIT. A simultaneous double-kill can crown both — accepted v1.

## Rendering pipeline
1. World → low-res `rt` (PIXEL_SCALE=4 `// 5/6 saves 40% fill`, nearest, shadows `1024 PCF` `autoUpdate:false` `mediump` statics `matrixAutoUpdate:false`, merged walls/blocks, walls `LineSegments`).
2. gunScene on top, depth cleared.
3. Post: CA `uCA` + desat/posterize/grain + shockwaves `uShock[4]`; `renderer.compile` once, `info.autoReset:false`.

## Conventions gotchas
- glTF maps decoded as LinearEncoding (`fixGun`) — old renderer renders sRGB maps ~2.2x dark otherwise.
- All `.gltf` are fully embedded and safe to move freely — **except `tree.gltf`, which references an external `tree.bin`** (keep the pair together).
- Old three.js API: no `subScaledVector` (grenade rewind does manual component math), `LinearEncoding` exists, `outputEncoding` unused.
