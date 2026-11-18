// Terrain generation: heights, caves, ores, trees.
import { fbm2, noise3, rand3, noise2 } from './noise';
import { AIR, GRASS, DIRT, STONE, SAND, WOOD, LEAVES, WATER, COAL, DIAMOND, BEDROCK } from './blocks';

export const WORLD_SIZE = 128;
export const WORLD_HEIGHT = 64;
export const WATER_LEVEL = 24;

export class WorldGenerator {
  seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  heightAt(x: number, z: number): number {
    const s = this.seed;
    const base = fbm2(x / 60, z / 60, s, 4); // rolling hills
    const mountains = Math.pow(fbm2(x / 130 + 100, z / 130 + 100, s + 55, 4), 2.2); // big peaks
    const detail = fbm2(x / 18, z / 18, s + 99, 3);
    let h = 20 + base * 14 + mountains * 30 + detail * 4;
    // carve a lake basin somewhere
    const lakeN = noise2(x / 45 + 500, z / 45 + 500, s + 777);
    if (lakeN > 0.72) h -= (lakeN - 0.72) * 60;
    return Math.max(2, Math.min(WORLD_HEIGHT - 10, Math.floor(h)));
  }

  generate(world: { setBlockRaw: (x: number, y: number, z: number, id: number) => void; getBlockRaw: (x: number, y: number, z: number) => number }) {
    const s = this.seed;
    const heights = new Int16Array(WORLD_SIZE * WORLD_SIZE);

    for (let x = 0; x < WORLD_SIZE; x++) {
      for (let z = 0; z < WORLD_SIZE; z++) {
        const h = this.heightAt(x, z);
        heights[x * WORLD_SIZE + z] = h;
        const beach = h <= WATER_LEVEL + 1;
        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y === 0) id = BEDROCK;
          else if (y === h) id = beach ? SAND : GRASS;
          else if (y >= h - 3) id = beach ? SAND : DIRT;
          else id = STONE;

          // Caves (not near surface, not below y=1)
          if (y > 1 && y < h - 3) {
            const cave = noise3(x / 16, y / 12, z / 16, s + 31);
            const cave2 = noise3(x / 9, y / 8, z / 9, s + 87);
            if (cave > 0.62 && cave2 > 0.45) {
              world.setBlockRaw(x, y, z, AIR);
              continue;
            }
          }

          // Ores
          if (id === STONE) {
            const r = rand3(x, y, z, s + 4242);
            if (y < 12 && r > 0.994) id = DIAMOND;
            else if (y < 30 && r > 0.976) id = COAL;
          }
          world.setBlockRaw(x, y, z, id);
        }
        // Water fill
        for (let y = h + 1; y <= WATER_LEVEL; y++) {
          world.setBlockRaw(x, y, z, WATER);
        }
      }
    }

    // Trees
    for (let x = 3; x < WORLD_SIZE - 3; x++) {
      for (let z = 3; z < WORLD_SIZE - 3; z++) {
        const h = heights[x * WORLD_SIZE + z];
        if (h <= WATER_LEVEL + 1) continue;
        if (world.getBlockRaw(x, h, z) !== GRASS) continue;
        if (rand3(x, 0, z, s + 909) > 0.008) continue;
        // spacing: skip if another tree nearby recorded via hash dominance
        let dominant = true;
        for (let dx = -3; dx <= 3 && dominant; dx++)
          for (let dz = -3; dz <= 3; dz++) {
            if (dx === 0 && dz === 0) continue;
            if (rand3(x + dx, 0, z + dz, s + 909) <= 0.008) { dominant = false; break; }
          }
        if (!dominant) continue;
        this.placeTree(world, x, h + 1, z, rand3(x, 1, z, s + 11));
      }
    }
  }

  private placeTree(world: { setBlockRaw: (x: number, y: number, z: number, id: number) => void; getBlockRaw: (x: number, y: number, z: number) => number }, x: number, y: number, z: number, r: number) {
    const trunkH = 4 + Math.floor(r * 2);
    for (let i = 0; i < trunkH; i++) world.setBlockRaw(x, y + i, z, WOOD);
    const top = y + trunkH;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy <= -1 ? 2 : dy === 0 ? 2 : 1;
      for (let dx = -rad; dx <= rad; dx++)
        for (let dz = -rad; dz <= rad; dz++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy > -1 || r < 0.5)) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (world.getBlockRaw(x + dx, top + dy, z + dz) === AIR)
            world.setBlockRaw(x + dx, top + dy, z + dz, LEAVES);
        }
    }
  }

  /** Find a scenic spawn: a high grassy point in the middle region. */
  findSpawn(): { x: number; y: number; z: number } {
    let best = { x: 64, z: 64, h: -1 };
    for (let x = 32; x < 96; x += 2)
      for (let z = 32; z < 96; z += 2) {
        const h = this.heightAt(x, z);
        if (h > best.h && h > WATER_LEVEL + 3) best = { x, z, h };
      }
    return { x: best.x + 0.5, y: best.h + 3, z: best.z + 0.5 };
  }
}
