// Minimal PNG decoder + pixel analysis of screenshots.
import fs from 'fs';
import zlib from 'zlib';

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a png');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error(`unsupported png: depth=${bitDepth} color=${colorType}`);
  const bpp = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const row = raw.subarray(rp, rp + stride);
    rp += stride;
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= bpp && prev ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      cur[x] = v;
    }
  }
  return { width, height, bpp, data: out };
}

function analyze(file) {
  const png = decodePNG(fs.readFileSync(file));
  const px = (x, y) => {
    const i = (y * png.width + x) * png.bpp;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  // region average
  const region = (x0, y0, x1, y1) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y += 3)
      for (let x = x0; x < x1; x += 3) {
        const p = px(x, y);
        r += p[0]; g += p[1]; b += p[2]; n++;
      }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  };
  const W = png.width, H = png.height;
  const top = region(W * 0.3, H * 0.02, W * 0.7, H * 0.15);
  const mid = region(W * 0.3, H * 0.4, W * 0.7, H * 0.6);
  const bottom = region(W * 0.3, H * 0.75, W * 0.7, H * 0.95);
  // variety: count distinct quantized colors in middle band (texture detail)
  const colors = new Set();
  for (let y = H * 0.3; y < H * 0.95; y += 4)
    for (let x = W * 0.1; x < W * 0.9; x += 4) {
      const p = px(x, y);
      colors.add(`${p[0] >> 4},${p[1] >> 4},${p[2] >> 4}`);
    }
  return {
    file,
    size: `${W}x${H}`,
    skyTop: top,
    midHorizon: mid,
    ground: bottom,
    distinctColorBuckets: colors.size,
    skyIsBlue: top[2] > top[0] && top[2] > 120,
    groundIsEarthtone: bottom[1] > bottom[0] * 0.7 || bottom[0] > 60,
    sceneVariety: colors.size > 15,
  };
}

for (const f of process.argv.slice(2)) {
  console.log(JSON.stringify(analyze(f), null, 2));
}
