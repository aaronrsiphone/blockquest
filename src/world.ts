// Chunked world storage, greedy-ish face meshing with vertex AO, DDA raycasting.
import * as THREE from 'three';
import { AIR, WATER, GLASS, BLOCKS, isOpaque } from './blocks';
import { WORLD_SIZE, WORLD_HEIGHT, WorldGenerator, WATER_LEVEL } from './worldgen';
import type { TextureSet } from './textures';

const CHUNK = 16;
const CHUNKS_X = WORLD_SIZE / CHUNK;
const CHUNKS_Z = WORLD_SIZE / CHUNK;

export interface RayHit {
  x: number; y: number; z: number;       // block coords
  nx: number; ny: number; nz: number;    // face normal
}

interface GeomData {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function newGeom(): GeomData {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

export class World {
  data: Uint8Array;
  seed: number;
  chunkMeshes: THREE.Mesh[][][] = []; // per chunk: [solid, glass, water]
  group = new THREE.Group();
  edits = new Map<number, number>();
  textures: TextureSet;
  materials: { solid: THREE.Material; glass: THREE.Material; water: THREE.Material };
  private queue: number[] = [];

  constructor(seed: number, textures: TextureSet, savedEdits?: [number, number][]) {
    this.seed = seed;
    this.textures = textures;
    this.data = new Uint8Array(WORLD_SIZE * WORLD_HEIGHT * WORLD_SIZE);

    const solid = new THREE.MeshLambertMaterial({
      map: textures.atlas,
      vertexColors: true,
    });
    const glass = new THREE.MeshLambertMaterial({
      map: textures.atlas,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    });
    const water = new THREE.MeshLambertMaterial({
      map: textures.water,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials = { solid, glass, water };

    if (savedEdits) for (const [k, v] of savedEdits) this.edits.set(k, v);

    const gen = new WorldGenerator(seed);
    gen.generate(this);
    // apply saved edits
    for (const [k, v] of this.edits) this.data[k] = v;

    // build all chunk meshes
    for (let cx = 0; cx < CHUNKS_X; cx++) {
      this.chunkMeshes[cx] = [];
      for (let cz = 0; cz < CHUNKS_Z; cz++) {
        this.buildChunk(cx, cz);
      }
    }
  }

  idx(x: number, y: number, z: number): number {
    return (x * WORLD_SIZE + z) * WORLD_HEIGHT + y;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_HEIGHT && z >= 0 && z < WORLD_SIZE;
  }

  getBlock(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return AIR;
    return this.data[this.idx(x, y, z)];
  }

  /** Out of bounds horizontally counts as solid stone to wall the world. */
  getBlockForMesh(x: number, y: number, z: number): number {
    if (y < 0) return 1; // solid
    if (y >= WORLD_HEIGHT) return AIR;
    if (x < 0 || x >= WORLD_SIZE || z < 0 || z >= WORLD_SIZE) return 1; // solid walls
    return this.data[this.idx(x, y, z)];
  }

  setBlockRaw(x: number, y: number, z: number, id: number) {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.idx(x, y, z)] = id;
  }

  getBlockRaw(x: number, y: number, z: number): number {
    return this.getBlock(x, y, z);
  }

  setBlock(x: number, y: number, z: number, id: number, record = true) {
    if (!this.inBounds(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (this.data[i] === id) return;
    this.data[i] = id;
    if (record) this.edits.set(i, id);
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    this.queueChunk(cx, cz);
    if (x % CHUNK === 0) this.queueChunk(cx - 1, cz);
    if (x % CHUNK === CHUNK - 1) this.queueChunk(cx + 1, cz);
    if (z % CHUNK === 0) this.queueChunk(cx, cz - 1);
    if (z % CHUNK === CHUNK - 1) this.queueChunk(cx, cz + 1);
  }

  private queueChunk(cx: number, cz: number) {
    if (cx < 0 || cx >= CHUNKS_X || cz < 0 || cz >= CHUNKS_Z) return;
    const key = cx * CHUNKS_Z + cz;
    if (!this.queue.includes(key)) this.queue.push(key);
  }

  /** Process queued chunk rebuilds (call each frame). */
  update() {
    let n = 0;
    while (this.queue.length && n < 4) {
      const key = this.queue.shift()!;
      this.buildChunk(Math.floor(key / CHUNKS_Z), key % CHUNKS_Z);
      n++;
    }
  }

  private buildChunk(cx: number, cz: number) {
    // dispose old
    const old = this.chunkMeshes[cx][cz];
    if (old) {
      for (const m of old) {
        this.group.remove(m);
        m.geometry.dispose();
      }
    }

    const geoms = { solid: newGeom(), glass: newGeom(), water: newGeom() };
    const x0 = cx * CHUNK, z0 = cz * CHUNK;

    for (let x = x0; x < x0 + CHUNK; x++) {
      for (let z = z0; z < z0 + CHUNK; z++) {
        for (let y = 0; y < WORLD_HEIGHT; y++) {
          const id = this.data[this.idx(x, y, z)];
          if (id === AIR) continue;
          const def = BLOCKS[id];
          if (!def) continue;
          const isWater = !!def.isWater;
          const isGlass = id === GLASS;
          const g = isWater ? geoms.water : isGlass ? geoms.glass : geoms.solid;
          this.addBlockFaces(g, x, y, z, id, def.tiles, isWater);
        }
      }
    }

    const meshes: THREE.Mesh[] = [];
    const mats: [THREE.Material, GeomData][] = [
      [this.materials.solid, geoms.solid],
      [this.materials.glass, geoms.glass],
      [this.materials.water, geoms.water],
    ];
    for (const [mat, g] of mats) {
      if (g.indices.length === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uvs, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(g.colors, 3));
      geo.setIndex(g.indices);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = true;
      geo.computeBoundingSphere();
      this.group.add(mesh);
      meshes.push(mesh);
    }
    this.chunkMeshes[cx][cz] = meshes;
  }

  // Face definitions: [normal, 4 corner offsets, uv tile selector (0=top,1=side,2=bottom), shade]
  private static FACES = [
    { n: [0, 1, 0], verts: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], sel: 0, shade: 1.0 },   // top
    { n: [0, -1, 0], verts: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], sel: 2, shade: 0.55 },  // bottom
    { n: [1, 0, 0], verts: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], sel: 1, shade: 0.8 },    // +x
    { n: [-1, 0, 0], verts: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], sel: 1, shade: 0.8 },   // -x
    { n: [0, 0, 1], verts: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], sel: 1, shade: 0.7 },     // +z
    { n: [0, 0, -1], verts: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], sel: 1, shade: 0.7 },    // -z
  ];

  private addBlockFaces(g: GeomData, x: number, y: number, z: number, id: number, tiles: [number, number, number], isWater: boolean) {
    const topOffset = isWater && this.getBlockForMesh(x, y + 1, z) !== WATER ? -0.12 : 0;

    for (const f of World.FACES) {
      const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
      const nId = this.getBlockForMesh(nx, ny, nz);
      if (nId === id) continue; // same type: skip (water-water, glass-glass)
      if (isOpaque(nId)) continue; // hidden face

      const tile = tiles[f.sel];
      const uv = tileUV(tile);
      const base = g.positions.length / 3;

      // AO per vertex
      const shades: number[] = [];
      for (let vi = 0; vi < 4; vi++) {
        const ao = isWater ? 1 : this.vertexAO(x, y, z, f, vi);
        shades.push(f.shade * ao);
      }

      for (let vi = 0; vi < 4; vi++) {
        const v = f.verts[vi];
        let vy = y + v[1];
        if (v[1] === 1 && topOffset) vy += topOffset;
        g.positions.push(x + v[0], vy, z + v[2]);
        g.normals.push(f.n[0], f.n[1], f.n[2]);
        // UVs: map quad corners to tile
        const uvIdx = UV_MAP[vi];
        g.uvs.push(uv[uvIdx * 2], uv[uvIdx * 2 + 1]);
        const s = shades[vi];
        g.colors.push(s, s, s);
      }
      g.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /** Classic voxel AO: check two sides + corner adjacent to each face vertex. */
  private vertexAO(x: number, y: number, z: number, f: (typeof World.FACES)[number], vi: number): number {
    const n = f.n;
    const v = f.verts[vi];
    // direction from block center to vertex corner (in -1..1)
    const dx = v[0] * 2 - 1;
    const dy = v[1] * 2 - 1;
    const dz = v[2] * 2 - 1;

    let side1 = false, side2 = false, corner = false;
    if (n[1] !== 0) { // top/bottom face: neighbors in xz plane
      const oy = y + n[1];
      side1 = isOpaque(this.getBlockForMesh(x + dx, oy, z));
      side2 = isOpaque(this.getBlockForMesh(x, oy, z + dz));
      corner = isOpaque(this.getBlockForMesh(x + dx, oy, z + dz));
    } else if (n[0] !== 0) {
      const ox = x + n[0];
      side1 = isOpaque(this.getBlockForMesh(ox, y, z + dz));
      side2 = isOpaque(this.getBlockForMesh(ox, y + dy, z));
      corner = isOpaque(this.getBlockForMesh(ox, y + dy, z + dz));
    } else {
      const oz = z + n[2];
      side1 = isOpaque(this.getBlockForMesh(x, y + dy, oz));
      side2 = isOpaque(this.getBlockForMesh(x + dx, y, oz));
      corner = isOpaque(this.getBlockForMesh(x + dx, y + dy, oz));
    }

    if (side1 && side2) return 0.55;
    const occ = (side1 ? 1 : 0) + (side2 ? 1 : 0) + (corner ? 1 : 0);
    return [1.0, 0.82, 0.68, 0.55][occ];
  }

  /** Voxel DDA raycast. Returns hit block + face normal. */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(dir.x), stepY = Math.sign(dir.y), stepZ = Math.sign(dir.z);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : stepX < 0 ? (origin.x - x) * tDeltaX : Infinity;
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : stepY < 0 ? (origin.y - y) * tDeltaY : Infinity;
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : stepZ < 0 ? (origin.z - z) * tDeltaZ : Infinity;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;

    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (id !== AIR && id !== WATER) {
        return { x, y, z, nx, ny, nz };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ;
      }
      if (y < -1 || y > WORLD_HEIGHT + 2) return null;
    }
    return null;
  }

  serializeEdits(): [number, number][] {
    return Array.from(this.edits.entries());
  }

  waterLevel(): number {
    return WATER_LEVEL;
  }
}

// UV corner order matching face vertex order: [v0,v1,v2,v3] -> uv corners
// Face verts are wound CCW seen from outside; map to (u,v) tile corners.
const UV_MAP = [0, 1, 2, 3];

function tileUV(tile: number): number[] {
  const cols = 8, rows = 2;
  const eps = 0.02 / 16; // small inset to avoid bleeding
  const u0 = (tile % cols) / cols + eps;
  const v1 = 1 - Math.floor(tile / cols) / rows - eps;
  const v0 = v1 - 1 / rows + 2 * eps;
  const u1 = u0 + 1 / cols - 2 * eps;
  // corners: [u0,v0, u0,v1, u1,v1, u1,v0]
  return [u0, v0, u0, v1, u1, v1, u1, v0];
}
