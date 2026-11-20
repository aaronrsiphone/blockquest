# BLOCKQUEST

A Minecraft-inspired voxel sandbox built with Three.js + TypeScript + Vite.
All textures, sounds, and terrain are generated procedurally — zero external assets.

## Play

**Easiest (any machine):** after cloning the repo, run once:

```bash
./install.sh
```

That installs a **BLOCKQUEST** icon in your applications menu. Clicking it
starts a local server and opens the game in the browser. The repo ships a
pre-built `dist/`, so no Node.js is required to play — python3 is enough.

**Developers:**

```bash
npm install
npm run dev     # → http://localhost:5173
```

Production build: `npm run build` · Type check: `npx tsc --noEmit`

### Packaging (how the desktop icon works)

```bash
./install.sh                        # one-time setup on a new machine
./launch-blockquest.sh              # serves dist/ on :8044, opens browser
./launch-blockquest.sh --no-browser # just start the server
```

- `install.sh` — builds if needed, installs the applications-menu entry
- `serve.mjs` — zero-dependency Node static server for `dist/`
  (falls back to `python3 -m http.server` if Node is absent)
- `icons/blockquest-icon.png` — generated from the game's own hotbar art
  (regenerate with `node test/icon.mjs` while the game is served)

Note: saved worlds live in the browser's localStorage per address, so worlds
saved while playing on :8044 (the icon) are separate from :5173 (dev).

## Controls

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| Space / F | Jump (double-tap either: toggle flight) |
| Shift | Sprint (in flight: descend) |
| Left click | Break block (click TNT to ignite it!) |
| Right click | Place selected block |
| 1–9 / mouse wheel | Select hotbar block |
| Esc | Pause menu (Resume / Save World / Reset World) |

## Features

- 128×128×64 seeded voxel world: hills, mountains, beaches, lakes, caves,
  coal & diamond ore, bedrock floor, and procedurally placed trees
- Chunked world storage (16×16 columns) with exposed-face-only BufferGeometry
  meshing, per-vertex ambient occlusion, and incremental chunk rebuilds
- First-person controller: AABB collision, gravity, sprinting, swimming,
  creative flight, camera bob, safe spawn, void respawn
- Block interaction via voxel DDA raycast (6-block range), wireframe target
  outline, break particles, placement blocked inside the player
- Explosive TNT: flashing fuse, ragged crater, chain reactions, camera shake
- Day/night cycle with sun, moon, stars, sunset tinting, and drifting
  pixel-art clouds
- Animated translucent water with lowered surface
- All 16×16 textures painted on Canvas into a nearest-filtered atlas
- Web Audio synthesized SFX: break, place, step, jump, fuse, explosion
- World persistence: seed + block edits + player position in localStorage
- Custom seeds from the start screen; Reset World for a fresh start
- "Update Game" button on the start screen runs `git pull` on the local
  repo (via the :8044 server) and reloads — pull new versions with one click

## Structure

```
src/
  main.ts      — game orchestration, sky/day-night, TNT, interaction, loop
  world.ts     — chunk storage, meshing + AO, DDA raycast
  worldgen.ts  — seeded terrain, caves, ores, trees, spawn finder
  player.ts    — physics, AABB collision, movement states
  textures.ts  — canvas texture atlas, water/cloud textures, hotbar icons
  blocks.ts    — block definitions
  noise.ts     — seeded value noise / fbm
  particles.ts — break & explosion particles
  audio.ts     — synthesized sound effects
  ui.ts        — hotbar, screens, HUD
test/          — Playwright smoke tests + PNG pixel analysis
```

## Known limitations

- Finite 128×128 world (edges are walled; falling out respawns you)
- No block-drop/inventory economy — creative mode only
- No mobs, crafting, or survival mechanics
- Escape-to-pause relies on the browser's pointer-lock exit (standard behavior;
  headless test harnesss simulate it via `document.exitPointerLock()`)
