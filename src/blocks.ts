// Block ids and per-block texture/tile definitions.

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const SAND = 4;
export const WOOD = 5;
export const LEAVES = 6;
export const BRICK = 7;
export const GLASS = 8;
export const WATER = 9;
export const COAL = 10;
export const DIAMOND = 11;
export const TNT = 12;
export const BEDROCK = 13;

// Tile indices in the atlas (8 columns).
export const TILE = {
  grassTop: 0,
  grassSide: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  woodTop: 5,
  woodSide: 6,
  leaves: 7,
  brick: 8,
  glass: 9,
  coal: 10,
  diamond: 11,
  tntSide: 12,
  tntTop: 13,
  bedrock: 14,
};

export interface BlockDef {
  id: number;
  name: string;
  tiles: [number, number, number]; // top, side, bottom
  solid: boolean;
  opaque: boolean;
  isWater?: boolean;
}

export const BLOCKS: Record<number, BlockDef> = {
  [GRASS]: { id: GRASS, name: 'Grass', tiles: [TILE.grassTop, TILE.grassSide, TILE.dirt], solid: true, opaque: true },
  [DIRT]: { id: DIRT, name: 'Dirt', tiles: [TILE.dirt, TILE.dirt, TILE.dirt], solid: true, opaque: true },
  [STONE]: { id: STONE, name: 'Stone', tiles: [TILE.stone, TILE.stone, TILE.stone], solid: true, opaque: true },
  [SAND]: { id: SAND, name: 'Sand', tiles: [TILE.sand, TILE.sand, TILE.sand], solid: true, opaque: true },
  [WOOD]: { id: WOOD, name: 'Wood', tiles: [TILE.woodTop, TILE.woodSide, TILE.woodTop], solid: true, opaque: true },
  [LEAVES]: { id: LEAVES, name: 'Leaves', tiles: [TILE.leaves, TILE.leaves, TILE.leaves], solid: true, opaque: true },
  [BRICK]: { id: BRICK, name: 'Brick', tiles: [TILE.brick, TILE.brick, TILE.brick], solid: true, opaque: true },
  [GLASS]: { id: GLASS, name: 'Glass', tiles: [TILE.glass, TILE.glass, TILE.glass], solid: true, opaque: false },
  [WATER]: { id: WATER, name: 'Water', tiles: [0, 0, 0], solid: false, opaque: false, isWater: true },
  [COAL]: { id: COAL, name: 'Coal Ore', tiles: [TILE.coal, TILE.coal, TILE.coal], solid: true, opaque: true },
  [DIAMOND]: { id: DIAMOND, name: 'Diamond Ore', tiles: [TILE.diamond, TILE.diamond, TILE.diamond], solid: true, opaque: true },
  [TNT]: { id: TNT, name: 'TNT', tiles: [TILE.tntTop, TILE.tntSide, TILE.tntTop], solid: true, opaque: true },
  [BEDROCK]: { id: BEDROCK, name: 'Bedrock', tiles: [TILE.bedrock, TILE.bedrock, TILE.bedrock], solid: true, opaque: true },
};

// Hotbar order (block ids). Water excluded from placement.
export const HOTBAR: number[] = [GRASS, DIRT, STONE, SAND, WOOD, LEAVES, BRICK, GLASS, TNT];

export function isSolid(id: number): boolean {
  return id !== AIR && id !== WATER;
}

export function isOpaque(id: number): boolean {
  const b = BLOCKS[id];
  return !!b && b.opaque;
}
