'use strict';
// Web Worker - grass blade generation runs here (scatter + terrain sampling) so
// big "fill unpainted" / "place all" jobs never freeze the studio main thread.
// Mirrors the sampling math in core.js sampleHeight and the quad emitter in
// grass.js addQuad (non-indexed, 6 verts/quad), so the main thread can append
// the returned positions verbatim and derive uvs/normals by pattern.

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// grid bilinear height sampler - same as core.js sampleHeight
function mkSample(terrain) {
  const segs = terrain.segs, size = terrain.size, W = segs + 1;
  const step = size / segs, half = size / 2, H = terrain.heights;
  return function(x, z) {
    const fx = clamp((x + half) / step, 0, segs - 1e-4);
    const fz = clamp((z + half) / step, 0, segs - 1e-4);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const h00 = H[iz * W + ix], h10 = H[iz * W + ix + 1], h01 = H[(iz + 1) * W + ix], h11 = H[(iz + 1) * W + ix + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };
}

// scatter one grass point into the position accumulator (crossed billboard pair)
function scatter(pt, cfg, sample, out) {
  const n = Math.max(2, Math.min(6, cfg.pairs || 3));
  const rad = cfg.radius || 0.6;
  const perPoint = Math.max(n, Math.round(n * (rad * rad) / 0.36));
  const minGap = 0.5 * (cfg.size || 0.7);
  const square = !!cfg.square;
  const placed = [];
  let tries = 0;
  while (placed.length < perPoint && tries < perPoint * 40) {
    tries++;
    let x, z;
    if (square) {
      x = pt[0] + (Math.random() * 2 - 1) * rad;
      z = pt[1] + (Math.random() * 2 - 1) * rad;
    } else {
      const ang = Math.random() * Math.PI * 2;
      const d = rad * Math.sqrt(Math.random());
      x = pt[0] + Math.cos(ang) * d;
      z = pt[1] + Math.sin(ang) * d;
    }
    let tooClose = false;
    for (let j = 0; j < placed.length; j++) {
      const dx = x - placed[j][0], dz = z - placed[j][1];
      if (dx * dx + dz * dz < minGap * minGap) { tooClose = true; break; }
    }
    if (tooClose) continue;
    placed.push([x, z]);
    const y = sample(x, z);
    const a0 = Math.random() * Math.PI * 2;
    const s = 0.85 + Math.random() * 0.3;
    const w = (cfg.size || 0.7) * s, h = (cfg.height || 1.3) * (0.85 + Math.random() * 0.3);
    quad(out, x, y, z, w, h, a0);
    quad(out, x, y, z, w, h, a0 + Math.PI / 2);
  }
}

// one billboard quad as 6 non-indexed verts (order mirrors grass.js addQuad)
function quad(out, x, y0, z, w, h, a) {
  const hx = Math.cos(a) * w / 2, hz = Math.sin(a) * w / 2;
  const X0 = x + hx, X1 = x - hx, Z0 = z + hz, Z1 = z - hz, Y1 = y0 + h;
  out.push(X0, y0, Z0,  X0, Y1, Z0,  X1, y0, Z1,  X0, Y1, Z0,  X1, Y1, Z1,  X1, y0, Z1);
}

// generate "fill unpainted" candidate points (mirrors grass.js fill spacing)
function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const c2 = vx * vx + vz * vz, c1 = vx * wx + vz * wz;
  if (c2 === 0 || c1 <= 0) return Math.hypot(px - ax, pz - az);
  if (c1 >= c2) return Math.hypot(px - bx, pz - bz);
  const t = c1 / c2;
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}
function edgeDist(x, z, poly) {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = segDist(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]);
    if (d < best) best = d;
  }
  return best;
}

// feathered region fill: sample a jittered grid inside the outline poly, keeping
// each cell with probability = distance-from-edge / feather (so grass is full in
// the middle and fades to none at the border). Each surviving point scatters a
// blade tuft, so edge density drops off naturally.
function regionPoints(poly, cfg, terrain, size, sample) {
  if (poly.length < 3) return [];
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, per = 0, ar = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]);
    minz = Math.min(minz, p[1]); maxz = Math.max(maxz, p[1]);
    per += Math.hypot(q[0] - p[0], q[1] - p[1]);
    ar += p[0] * q[1] - q[0] * p[1];
  }
  ar = Math.abs(ar) / 2;
  if (per <= 0 || ar <= 0) return [];
  // hydraulic radius ~ half the region's thinnest dimension -> feather edge width
  const feather = Math.max(0.5, 0.8 * (2 * ar / per));

  let step = Math.max(0.2, (cfg.radius || 0.6) * 0.8);
  const budget = 12000;
  const cells0 = Math.max(1, Math.ceil((maxx - minx) / step) * Math.ceil((maxz - minz) / step));
  if (cells0 > budget) step *= Math.sqrt(cells0 / budget);

  const out = [];
  for (let x = minx + step / 2; x <= maxx; x += step) {
    for (let z = minz + step / 2; z <= maxz; z += step) {
      const jx = x + (Math.random() * 2 - 1) * step * 0.35;
      const jz = z + (Math.random() * 2 - 1) * step * 0.35;
      if (!pointInPoly(jx, jz, poly)) continue;
      const d = edgeDist(jx, jz, poly);
      if (Math.random() > clamp(d / feather, 0, 1)) continue; // sparse near edge
      const h = sample(jx, jz);
      if (h < -2 || h > 12) continue;
      out.push([+jx.toFixed(2), +jz.toFixed(2)]);
    }
  }
  return out;
}

function fillPoints(cfg, terrain, size, existing, sample) {
  const rad = Math.max(0.05, cfg.radius || 0.6);
  const gap = rad * 1.9, gap2 = gap * gap;
  const span = size * 0.96;
  const need = Math.max(120, Math.min(4000, Math.round(span * span / gap2)));
  const out = [];
  let tries = 0;
  while (out.length < need && tries < need * 30) {
    tries++;
    const x = (Math.random() * 2 - 1) * span, z = (Math.random() * 2 - 1) * span;
    const h = sample(x, z);
    if (h < -2 || h > 12) continue;
    let near = false;
    for (let i = 0; i < existing.length; i++) {
      const dx = x - existing[i][0], dz = z - existing[i][1];
      if (dx * dx + dz * dz < gap2) { near = true; break; }
    }
    if (near) continue;
    for (let i = 0; i < out.length; i++) {
      const dx = x - out[i][0], dz = z - out[i][1];
      if (dx * dx + dz * dz < gap2) { near = true; break; }
    }
    if (near) continue;
    out.push([+x.toFixed(2), +z.toFixed(2)]);
  }
  return out;
}

self.onmessage = function(ev) {
  const msg = ev.data;
  const terrain = msg.terrain, sample = mkSample(terrain), cfg = msg.cfg;
  let points = msg.points || [];
  let scatterThem = msg.scatter !== false;
  try {
    if (msg.mode === 'fill') {
      points = fillPoints(cfg, terrain, msg.size, msg.existing || [], sample);
      if (!points.length) { self.postMessage({ id: msg.id, points: [] }); return; }
    } else if (msg.mode === 'region') {
      points = regionPoints(msg.poly || [], cfg, terrain, msg.size, sample);
      if (!points.length) { self.postMessage({ id: msg.id, points: [] }); return; }
    }
    if (!scatterThem) { self.postMessage({ id: msg.id, points: points }); return; }
    const pos = [];
    for (let i = 0; i < points.length; i++) scatter(points[i], cfg, sample, pos);
    const positions = new Float32Array(pos);
    self.postMessage({ id: msg.id, points: points, positions: positions }, [positions.buffer]);
  } catch (e) {
    self.postMessage({ id: msg.id, error: String(e) });
  }
};
