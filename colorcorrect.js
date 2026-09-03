




export function calcStats(px) {
  const m = [0, 0, 0], v = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    n++;
    for (let c = 0; c < 3; c++) {
      const d = px[i + c] - m[c];
      m[c] += d / n;
      v[c] += d * (px[i + c] - m[c]);
    }
  }
  return {
    mean: m,
    std: [0, 1, 2].map(function(c) { return Math.sqrt(n > 1 ? v[c] / (n - 1) : 0); }),
    n: n,
  };
}

export function applyTransfer(px, src, dst) {
  const out = new Uint8ClampedArray(px.length);
  const k = [0, 1, 2].map(function(c) { return src.std[c] < 1 ? 0 : dst.std[c] / src.std[c]; });
  for (let i = 0; i < px.length; i += 4) {
    out[i + 3] = px[i + 3];
    if (!px[i + 3]) continue;
    for (let c = 0; c < 3; c++) out[i + c] = (px[i + c] - src.mean[c]) * k[c] + dst.mean[c];
  }
  return out;
}

export function loadImage(src) {
  return new Promise(function(res, rej) {
    const im = new Image();
    im.onload = function() { res(im); };
    im.onerror = rej;
    im.src = src;
  });
}

function drawOf(im) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth || im.width || 1;
  c.height = im.naturalHeight || im.height || 1;
  c.getContext('2d').drawImage(im, 0, 0);
  return c;
}

export function imageStats(im) {
  const c = drawOf(im);
  return calcStats(c.getContext('2d').getImageData(0, 0, c.width, c.height).data);
}


export function matchImage(im, dstStats) {
  const c = drawOf(im);
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, c.width, c.height);
  ctx.putImageData(new ImageData(applyTransfer(id.data, calcStats(id.data), dstStats), c.width, c.height), 0, 0);
  return c;
}
