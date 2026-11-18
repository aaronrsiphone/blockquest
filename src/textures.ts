// Programmatic 16x16 pixel-art textures baked into a texture atlas.
import * as THREE from 'three';
import { TILE } from './blocks';
import { makeRng } from './noise';

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 2;
export const TILE_PX = 16;

function tileCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = TILE_PX;
  c.height = TILE_PX;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

type Painter = (ctx: CanvasRenderingContext2D, rng: () => number) => void;

function shade(hex: string, amt: number): string {
  const r = Math.max(0, Math.min(255, parseInt(hex.slice(1, 3), 16) + amt));
  const g = Math.max(0, Math.min(255, parseInt(hex.slice(3, 5), 16) + amt));
  const b = Math.max(0, Math.min(255, parseInt(hex.slice(5, 7), 16) + amt));
  return `rgb(${r},${g},${b})`;
}

function speckle(ctx: CanvasRenderingContext2D, rng: () => number, base: string, variance: number, density = 1) {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      if (rng() < density) {
        const amt = Math.floor((rng() - 0.5) * 2 * variance);
        ctx.fillStyle = shade(base, amt);
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
}

const painters: Record<number, Painter> = {
  [TILE.grassTop]: (ctx, rng) => speckle(ctx, rng, '#5fae3f', 22),
  [TILE.dirt]: (ctx, rng) => speckle(ctx, rng, '#8a6041', 18),
  [TILE.grassSide]: (ctx, rng) => {
    speckle(ctx, rng, '#8a6041', 18);
    for (let x = 0; x < TILE_PX; x++) {
      const h = 3 + Math.floor(rng() * 3);
      for (let y = 0; y < h; y++) {
        ctx.fillStyle = shade('#5fae3f', Math.floor((rng() - 0.5) * 30));
        ctx.fillRect(x, y, 1, 1);
      }
    }
  },
  [TILE.stone]: (ctx, rng) => {
    speckle(ctx, rng, '#8d8d8d', 14);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rng() * 13),
        y = Math.floor(rng() * 13);
      ctx.fillStyle = '#777';
      ctx.fillRect(x, y, 2 + Math.floor(rng() * 3), 1);
    }
  },
  [TILE.sand]: (ctx, rng) => speckle(ctx, rng, '#ddd39b', 14),
  [TILE.woodTop]: (ctx, rng) => {
    speckle(ctx, rng, '#a9834f', 10);
    ctx.strokeStyle = '#77592f';
    for (let r = 2; r <= 7; r += 2) {
      ctx.strokeRect(8 - r, 8 - r, r * 2, r * 2);
    }
  },
  [TILE.woodSide]: (ctx, rng) => {
    for (let x = 0; x < TILE_PX; x++) {
      const base = x % 4 === 3 ? '#6e5228' : '#a9834f';
      for (let y = 0; y < TILE_PX; y++) {
        ctx.fillStyle = shade(base, Math.floor((rng() - 0.5) * 18));
        ctx.fillRect(x, y, 1, 1);
      }
    }
  },
  [TILE.leaves]: (ctx, rng) => {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const v = rng();
        ctx.fillStyle = v < 0.15 ? '#2c6b1d' : v < 0.7 ? '#3f8f2b' : '#4fa835';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  },
  [TILE.brick]: (ctx, rng) => {
    ctx.fillStyle = '#9c9c9c';
    ctx.fillRect(0, 0, 16, 16);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 === 0 ? 0 : 4;
      for (let col = 0; col < 2; col++) {
        const x = off + col * 8 + 1;
        const y = row * 4 + 1;
        ctx.fillStyle = shade('#a8433a', Math.floor((rng() - 0.5) * 16));
        ctx.fillRect(x, y, 7, 3);
      }
    }
  },
  [TILE.glass]: (ctx, rng) => {
    void rng;
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = 'rgba(200,230,255,0.25)';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(3, 3, 1, 4);
    ctx.fillRect(4, 2, 1, 2);
  },
  [TILE.coal]: (ctx, rng) => {
    speckle(ctx, rng, '#8d8d8d', 14);
    for (let i = 0; i < 6; i++) {
      const x = 1 + Math.floor(rng() * 12),
        y = 1 + Math.floor(rng() * 12);
      ctx.fillStyle = rng() < 0.5 ? '#2b2b2b' : '#1a1a1a';
      ctx.fillRect(x, y, 2 + Math.floor(rng() * 2), 2);
    }
  },
  [TILE.diamond]: (ctx, rng) => {
    speckle(ctx, rng, '#8d8d8d', 14);
    for (let i = 0; i < 5; i++) {
      const x = 1 + Math.floor(rng() * 12),
        y = 1 + Math.floor(rng() * 12);
      ctx.fillStyle = '#63e6e2';
      ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = '#bffcff';
      ctx.fillRect(x, y, 1, 1);
    }
  },
  [TILE.tntSide]: (ctx, rng) => {
    speckle(ctx, rng, '#c33', 14);
    ctx.fillStyle = '#f5f0e6';
    ctx.fillRect(0, 6, 16, 4);
    ctx.fillStyle = '#222';
    ctx.font = 'bold 5px monospace';
    ctx.fillText('TNT', 3, 10.5);
  },
  [TILE.tntTop]: (ctx, rng) => {
    speckle(ctx, rng, '#c33', 14);
    ctx.fillStyle = '#7a2a1d';
    ctx.fillRect(6, 0, 4, 16);
    ctx.fillRect(0, 6, 16, 4);
    ctx.fillStyle = '#f5f0e6';
    ctx.fillRect(7, 7, 2, 2);
  },
  [TILE.bedrock]: (ctx, rng) => {
    for (let y = 0; y < TILE_PX; y++)
      for (let x = 0; x < TILE_PX; x++) {
        const v = rng();
        ctx.fillStyle = v < 0.3 ? '#333' : v < 0.6 ? '#555' : '#444';
        ctx.fillRect(x, y, 1, 1);
      }
  },
};

export interface TextureSet {
  atlas: THREE.Texture;
  water: THREE.Texture;
  clouds: THREE.Texture;
  tileColors: string[]; // average color per tile index for particles
  tileCanvasImage: HTMLCanvasElement;
}

export function buildTextures(): TextureSet {
  const atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_COLS * TILE_PX;
  atlasCanvas.height = ATLAS_ROWS * TILE_PX;
  const actx = atlasCanvas.getContext('2d')!;
  actx.imageSmoothingEnabled = false;

  const tileColors: string[] = [];
  const numTiles = ATLAS_COLS * ATLAS_ROWS;
  for (let t = 0; t < numTiles; t++) {
    const [c, ctx] = tileCanvas();
    const painter = painters[t];
    const rng = makeRng(1234 + t * 777);
    if (painter) painter(ctx, rng);
    else speckle(ctx, rng, '#ff00ff', 0);
    const tx = (t % ATLAS_COLS) * TILE_PX;
    const ty = Math.floor(t / ATLAS_COLS) * TILE_PX;
    actx.drawImage(c, tx, ty);
    // average color
    const data = ctx.getImageData(0, 0, TILE_PX, TILE_PX).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 40) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
    }
    n = Math.max(1, n);
    tileColors.push(`rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`);
  }

  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  atlas.colorSpace = THREE.SRGBColorSpace;

  // Water texture (separate, animated).
  const wc = document.createElement('canvas');
  wc.width = 32; wc.height = 32;
  const wctx = wc.getContext('2d')!;
  const wrng = makeRng(99);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      wctx.fillStyle = `rgba(40,${100 + Math.floor(wrng() * 40)},${210 + Math.floor(wrng() * 40)},${0.75 + wrng() * 0.15})`;
      wctx.fillRect(x, y, 1, 1);
    }
  const water = new THREE.CanvasTexture(wc);
  water.magFilter = THREE.NearestFilter;
  water.minFilter = THREE.NearestFilter;
  water.generateMipmaps = false;
  water.wrapS = THREE.RepeatWrapping;
  water.wrapT = THREE.RepeatWrapping;
  water.colorSpace = THREE.SRGBColorSpace;

  // Cloud texture: blobs on transparent.
  const cc = document.createElement('canvas');
  cc.width = 64; cc.height = 64;
  const cctx = cc.getContext('2d')!;
  const crng = makeRng(7);
  cctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(crng() * 60),
      y = Math.floor(crng() * 60),
      w = 6 + Math.floor(crng() * 14),
      h = 4 + Math.floor(crng() * 8);
    cctx.fillRect(x, y, w, h);
  }
  const clouds = new THREE.CanvasTexture(cc);
  clouds.magFilter = THREE.NearestFilter;
  clouds.minFilter = THREE.NearestFilter;
  clouds.generateMipmaps = false;
  clouds.wrapS = THREE.RepeatWrapping;
  clouds.wrapT = THREE.RepeatWrapping;

  return { atlas, water, clouds, tileColors, tileCanvasImage: atlasCanvas };
}

/** Draw a pseudo-3D block icon for the hotbar. */
export function drawBlockIcon(canvas: HTMLCanvasElement, tiles: [number, number, number], atlasCanvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = 15; // side length in px
  const cx = canvas.width / 2, cy = canvas.height / 2 + 3;
  const tileX = (t: number) => (t % ATLAS_COLS) * TILE_PX;
  const tileY = (t: number) => Math.floor(t / ATLAS_COLS) * TILE_PX;

  // top face (parallelogram via transform)
  ctx.save();
  ctx.translate(cx, cy - s * 0.95);
  ctx.transform(1, 0.5, -1, 0.5, 0, 0);
  ctx.drawImage(atlasCanvas, tileX(tiles[0]), tileY(tiles[0]), TILE_PX, TILE_PX, 0, 0, s, s);
  ctx.restore();

  // left face
  ctx.save();
  ctx.translate(cx - s, cy - s * 0.45);
  ctx.transform(1, 0.5, 0, 1, 0, 0);
  ctx.drawImage(atlasCanvas, tileX(tiles[1]), tileY(tiles[1]), TILE_PX, TILE_PX, 0, 0, s, s);
  ctx.restore();

  // right face
  ctx.save();
  ctx.translate(cx, cy - s * 0.45 + s * 0.5);
  ctx.transform(1, -0.5, 0, 1, 0, 0);
  ctx.drawImage(atlasCanvas, tileX(tiles[1]), tileY(tiles[1]), TILE_PX, TILE_PX, 0, 0, s, s);
  ctx.restore();
}
