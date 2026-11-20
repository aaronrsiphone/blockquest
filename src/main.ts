// BLOCKQUEST — main game orchestration.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import './style.css';
import { buildTextures } from './textures';
import { World } from './world';
import { Player } from './player';
import type { PlayerInput } from './player';
import { Particles } from './particles';
import { SoundFX } from './audio';
import { UI } from './ui';
import { DebugMonitor } from './debug';
import { AIR, WATER, TNT, BEDROCK, BLOCKS, HOTBAR } from './blocks';
import { WorldGenerator, WORLD_SIZE, WORLD_HEIGHT } from './worldgen';

const SAVE_KEY = 'blockquest_save_v1';
const DAY_LENGTH = 180; // seconds per full day

interface SaveData {
  seed: number;
  edits: [number, number][];
  player: [number, number, number];
  time: number;
}

class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  controls: PointerLockControls;
  ui: UI;
  sfx = new SoundFX();
  particles!: Particles;

  world!: World;
  player!: Player;
  input: PlayerInput = { forward: false, back: false, left: false, right: false, jump: false, sprint: false, descend: false };
  running = false;
  paused = true;

  sun!: THREE.DirectionalLight;
  hemi!: THREE.HemisphereLight;
  sunMesh!: THREE.Mesh;
  moonMesh!: THREE.Mesh;
  stars!: THREE.Points;
  clouds: THREE.Mesh[] = [];
  outline!: THREE.LineSegments;

  dayTime = 0.32; // 0..1
  clock = new THREE.Clock();
  debug: DebugMonitor;
  stepDist = 0;
  shake = 0;
  tnts: { mesh: THREE.Mesh; x: number; y: number; z: number; t: number }[] = [];
  fovTarget = 75;

  constructor() {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('app')!.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.position.set(64, 40, 64);

    this.controls = new PointerLockControls(this.camera, renderer.domElement);
    this.scene.fog = new THREE.Fog(0x87c5eb, 60, 210);
    this.scene.background = new THREE.Color(0x87c5eb);

    this.setupLighting();
    this.setupSky();
    this.setupOutline();

    const tex = buildTextures();
    this.ui = new UI(tex.tileCanvasImage);
    this.particles = new Particles(this.scene);
    (window as unknown as { game: Game }).game = this;
    (window as unknown as { THREE: typeof THREE }).THREE = THREE;

    this.ui.setSlotChangeListener(() => this.sfx.click());

    this.wireInput();
    this.wireScreens();
    this.debug = new DebugMonitor(this);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // auto-load saved world
    const saved = this.loadSave();
    const seedInput = document.getElementById('seed-input') as HTMLInputElement;
    if (saved) seedInput.placeholder = `saved: ${saved.seed}`;

    this.animate();
  }

  private setupLighting() {
    this.sun = new THREE.DirectionalLight(0xfff2cc, 1.6);
    this.sun.position.set(80, 120, 40);
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.7);
    this.scene.add(this.hemi);
    const amb = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(amb);
  }

  private setupSky() {
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, fog: false });
    this.sunMesh = new THREE.Mesh(new THREE.PlaneGeometry(34, 34), sunMat);
    this.scene.add(this.sunMesh);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false });
    this.moonMesh = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), moonMat);
    this.scene.add(this.moonMesh);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 450; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(420);
      if (v.y < 10) v.y = Math.abs(v.y) + 10;
      pts.push(v.x, v.y, v.z);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })
    );
    this.scene.add(this.stars);
  }

  setupClouds(cloudTex: THREE.Texture) {
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: cloudTex.clone(),
        transparent: true,
        opacity: 0.5 + i * 0.15,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      (mat.map as THREE.Texture).wrapS = THREE.RepeatWrapping;
      (mat.map as THREE.Texture).wrapT = THREE.RepeatWrapping;
      (mat.map as THREE.Texture).repeat.set(3, 3);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(WORLD_SIZE / 2, 92 + i * 9, WORLD_SIZE / 2);
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.clouds.push(mesh);
    }
  }

  private setupOutline() {
    const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    const mat = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.65 });
    this.outline = new THREE.LineSegments(geo, mat);
    this.outline.visible = false;
    this.scene.add(this.outline);
  }

  // ---------------- world lifecycle ----------------

  newWorld(seed: number, saved?: SaveData) {
    // clear old
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.group.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose();
      });
    }
    for (const t of this.tnts) this.scene.remove(t.mesh);
    this.tnts = [];

    const tex = buildTextures();
    this.world = new World(seed, tex, saved?.edits);
    this.scene.add(this.world.group);
    this.setupClouds(tex.clouds);

    this.player = new Player(this.world);
    const gen = new WorldGenerator(seed);
    if (saved) {
      this.player.setSpawn(saved.player[0], saved.player[1], saved.player[2]);
      this.dayTime = saved.time ?? 0.32;
    } else {
      const sp = gen.findSpawn();
      // raise until free of tree collisions
      let y = sp.y;
      while (
        this.world.getBlock(Math.floor(sp.x), Math.floor(y), Math.floor(sp.z)) !== AIR ||
        this.world.getBlock(Math.floor(sp.x), Math.floor(y + 1), Math.floor(sp.z)) !== AIR
      ) y++;
      this.player.setSpawn(sp.x, y + 0.01, sp.z);
    }
    this.camera.position.copy(this.player.pos);
    this.running = true;
  }

  private loadSave(): SaveData | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SaveData;
    } catch {
      return null;
    }
  }

  save() {
    if (!this.world || !this.player) return;
    const data: SaveData = {
      seed: this.world.seed,
      edits: this.world.serializeEdits(),
      player: [this.player.pos.x, this.player.pos.y, this.player.pos.z],
      time: this.dayTime,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      const msg = document.getElementById('save-msg')!;
      msg.textContent = `Saved (${data.edits.length} changes)`;
      setTimeout(() => (msg.textContent = ''), 2500);
    } catch {
      /* storage full — ignore */
    }
  }

  // ---------------- input ----------------

  private wireInput() {
    document.addEventListener('keydown', (e) => {
      if (!this.running) return;
      switch (e.code) {
        case 'KeyW': this.input.forward = true; break;
        case 'KeyS': this.input.back = true; break;
        case 'KeyA': this.input.left = true; break;
        case 'KeyD': this.input.right = true; break;
        case 'Space':
        case 'KeyF':
          e.preventDefault();
          if (!this.input.jump) this.player.tryToggleFly(this.clock.elapsedTime);
          this.input.jump = true;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.input.sprint = true;
          this.input.descend = true;
          break;
      }
      if (e.code.startsWith('Digit')) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= 9) this.ui.selectSlot(n - 1);
      }
    });
    document.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.input.forward = false; break;
        case 'KeyS': this.input.back = false; break;
        case 'KeyA': this.input.left = false; break;
        case 'KeyD': this.input.right = false; break;
        case 'Space':
        case 'KeyF':
          this.input.jump = false;
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.input.sprint = false;
          this.input.descend = false;
          break;
      }
    });

    window.addEventListener('wheel', (e) => {
      if (!this.controls.isLocked) return;
      this.ui.selectSlot(this.ui.selected + (e.deltaY > 0 ? 1 : -1));
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousedown', (e) => {
      if (!this.controls.isLocked) return;
      if (e.button === 0) this.breakBlock();
      else if (e.button === 2) this.placeBlock();
    });
  }

  private wireScreens() {
    const playBtn = document.getElementById('play-btn')!;
    const resumeBtn = document.getElementById('resume-btn')!;
    const saveBtn = document.getElementById('save-btn')!;
    const resetBtn = document.getElementById('reset-btn')!;
    const updateBtn = document.getElementById('update-btn')!;
    const updateMsg = document.getElementById('update-msg')!;

    updateBtn.addEventListener('click', async () => {
      updateBtn.textContent = '⟳ Updating…';
      updateMsg.textContent = '';
      try {
        const r = await fetch('/__update', {
          method: 'POST',
          headers: { 'X-Requested-With': 'blockquest' },
        });
        const ct = r.headers.get('content-type') || '';
        if (!ct.includes('application/json')) throw new Error('no-endpoint');
        const data = (await r.json()) as { ok: boolean; output: string };
        if (data.ok) {
          updateBtn.textContent = '✓ Updated';
          updateMsg.textContent = data.output || 'Already up to date.';
          setTimeout(() => {
            // cache-busted reload to pick up the new build
            location.href = location.pathname + '?v=' + Date.now();
          }, 1200);
        } else {
          updateBtn.textContent = '⟳ Update Game (git pull)';
          updateMsg.textContent = 'Update failed: ' + (data.output || 'unknown error');
        }
      } catch {
        updateBtn.textContent = '⟳ Update Game (git pull)';
        updateMsg.textContent =
          'Updates are only available when playing via the desktop icon (localhost:8044).';
      }
    });

    playBtn.addEventListener('click', () => {
      this.sfx.click();
      const seedStr = (document.getElementById('seed-input') as HTMLInputElement).value.trim();
      this.ui.startScreen.classList.add('hidden');
      this.ui.loadingScreen.classList.remove('hidden');

      let seed: number;
      let saved: SaveData | null = null;
      if (seedStr) {
        seed = hashSeed(seedStr);
        localStorage.removeItem(SAVE_KEY);
      } else {
        saved = this.loadSave();
        seed = saved?.seed ?? Math.floor(Math.random() * 2 ** 31);
      }

      // let the loading screen paint before heavy generation
      setTimeout(() => {
        this.newWorld(seed, saved ?? undefined);
        this.ui.loadingScreen.classList.add('hidden');
        this.ui.showGameHud(true);
        this.showPause(true, 'Enter World');
      }, 50);
    });

    resumeBtn.addEventListener('click', () => {
      this.sfx.click();
      this.showPause(false);
      this.controls.lock();
    });
    saveBtn.addEventListener('click', () => {
      this.sfx.click();
      this.save();
    });
    resetBtn.addEventListener('click', () => {
      this.sfx.click();
      localStorage.removeItem(SAVE_KEY);
      this.showPause(false);
      this.ui.showGameHud(false);
      this.running = false;
      this.ui.startScreen.classList.remove('hidden');
      (document.getElementById('seed-input') as HTMLInputElement).value = '';
      (document.getElementById('seed-input') as HTMLInputElement).placeholder = 'random';
    });

    this.controls.addEventListener('unlock', () => {
      if (this.running) {
        this.paused = true;
        this.showPause(true);
      }
    });
    this.controls.addEventListener('lock', () => {
      this.paused = false;
    });
  }

  private showPause(show: boolean, resumeLabel?: string) {
    this.ui.pauseScreen.classList.toggle('hidden', !show);
    const btn = document.getElementById('resume-btn') as HTMLButtonElement;
    if (resumeLabel) btn.textContent = resumeLabel;
    else btn.textContent = 'Resume Game';
  }

  // ---------------- block interaction ----------------

  private targetHit() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return this.world.raycast(this.camera.position, dir, 6);
  }

  private breakBlock() {
    const hit = this.targetHit();
    if (!hit) return;
    const id = this.world.getBlock(hit.x, hit.y, hit.z);
    if (id === AIR || id === BEDROCK) return;
    if (id === TNT) {
      this.igniteTnt(hit.x, hit.y, hit.z);
      return;
    }
    this.world.setBlock(hit.x, hit.y, hit.z, AIR);
    const def = BLOCKS[id];
    const color = this.world.textures.tileColors[def.tiles[1]];
    this.particles.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, color, 16, 3.4);
    this.sfx.break_();
  }

  private placeBlock() {
    const hit = this.targetHit();
    if (!hit) return;
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (!this.world.inBounds(x, y, z)) return;
    const existing = this.world.getBlock(x, y, z);
    if (existing !== AIR && existing !== WATER) return;
    // don't place inside player
    const p = this.player.pos;
    const px0 = p.x - 0.31, px1 = p.x + 0.31;
    const py0 = p.y, py1 = p.y + 1.8;
    const pz0 = p.z - 0.31, pz1 = p.z + 0.31;
    if (x + 1 > px0 && x < px1 && y + 1 > py0 && y < py1 && z + 1 > pz0 && z < pz1) return;
    const id = this.ui.selectedBlock();
    this.world.setBlock(x, y, z, id);
    this.sfx.place();
  }

  // ---------------- TNT ----------------

  private igniteTnt(x: number, y: number, z: number) {
    this.world.setBlock(x, y, z, AIR);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xdd3322 })
    );
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.scene.add(mesh);
    this.tnts.push({ mesh, x, y, z, t: 0 });
    this.sfx.fuse();
  }

  private explode(x: number, y: number, z: number) {
    const R = 4.6;
    this.sfx.explode();
    this.shake = 1;
    for (let dx = -5; dx <= 5; dx++)
      for (let dy = -5; dy <= 5; dy++)
        for (let dz = -5; dz <= 5; dz++) {
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > R) continue;
          const bx = x + dx, by = y + dy, bz = z + dz;
          if (!this.world.inBounds(bx, by, bz)) continue;
          const id = this.world.getBlock(bx, by, bz);
          if (id === AIR || id === BEDROCK) continue;
          if (id === TNT) {
            this.world.setBlock(bx, by, bz, AIR);
            this.igniteTnt(bx, by, bz);
            continue;
          }
          if (d > R - 1.6 && Math.random() < 0.4) continue; // ragged edge
          this.world.setBlock(bx, by, bz, AIR);
        }
    for (let i = 0; i < 5; i++)
      this.particles.burst(x + 0.5, y + 0.5, z + 0.5, i % 2 ? '#555555' : '#dd8833', 16, 8);
  }

  private updateTnts(dt: number) {
    for (let i = this.tnts.length - 1; i >= 0; i--) {
      const t = this.tnts[i];
      t.t += dt;
      // flashing
      const flash = Math.sin(t.t * (8 + t.t * 14));
      const mat = t.mesh.material as THREE.MeshLambertMaterial;
      mat.color.setHex(flash > 0 ? 0xffffff : 0xdd3322);
      const s = 1 + Math.max(0, (t.t - 1)) * 0.8;
      t.mesh.scale.setScalar(s);
      if (t.t >= 1.4) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        mat.dispose();
        this.tnts.splice(i, 1);
        this.explode(t.x, t.y, t.z);
      }
    }
  }

  // ---------------- day/night ----------------

  private updateSky(dt: number) {
    this.dayTime = (this.dayTime + dt / DAY_LENGTH) % 1;
    const ang = this.dayTime * Math.PI * 2 - Math.PI / 2; // noon at dayTime 0.25... adjust
    // sun elevation: dayTime 0.25 = noon, 0.75 = midnight
    const sunH = Math.sin(this.dayTime * Math.PI * 2 - Math.PI / 2); // -1..1
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.6, sunH, Math.sin(ang) * 0.35).normalize();
    void sunDir;

    const center = this.camera.position;
    const sd = new THREE.Vector3(Math.cos(ang) * 0.8, sunH, 0.4).normalize();
    this.sun.position.copy(center).addScaledVector(sd, 120);
    this.sun.target.position.copy(center);
    this.sun.target.updateMatrixWorld();

    this.sunMesh.position.copy(center).addScaledVector(sd, 380);
    this.sunMesh.lookAt(center);
    this.moonMesh.position.copy(center).addScaledVector(sd, -380);
    this.moonMesh.lookAt(center);
    this.stars.position.copy(center);

    const day = THREE.MathUtils.clamp(sunH * 2.4 + 0.25, 0, 1);
    const sunset = THREE.MathUtils.clamp(1 - Math.abs(sunH) * 4.5, 0, 1) * (sunH > -0.35 ? 1 : 0);

    const sky = new THREE.Color(0x6db3f2).multiplyScalar(day); // day blue
    sky.lerp(new THREE.Color(0x070b1e), 1 - day);
    sky.lerp(new THREE.Color(0xff8c4a), sunset * 0.55);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);

    this.sun.intensity = 0.15 + day * 1.5;
    this.sun.color.setHex(sunset > 0.4 ? 0xffb070 : 0xfff2cc);
    this.hemi.intensity = 0.15 + day * 0.55;
    (this.stars.material as THREE.PointsMaterial).opacity = 1 - day;

    // clouds drift
    for (let i = 0; i < this.clouds.length; i++) {
      const mat = this.clouds[i].material as THREE.MeshBasicMaterial;
      if (mat.map) {
        mat.map.offset.x += dt * (0.004 + i * 0.003);
        mat.map.offset.y += dt * 0.0015;
      }
      mat.color.setScalar(0.35 + day * 0.65);
    }

    // water shimmer
    const wmap = (this.world.materials.water as THREE.MeshLambertMaterial).map;
    if (wmap) {
      wmap.offset.x += dt * 0.025;
      wmap.offset.y += dt * 0.017;
    }

    // HUD clock
    const hours = Math.floor(((this.dayTime + 0.25) % 1) * 24);
    const mins = Math.floor((((this.dayTime + 0.25) % 1) * 24 - hours) * 60);
    this.ui.setTimeText(`☀ ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`);
  }

  // ---------------- main loop ----------------

  private animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.running && this.player) this.debug.update(dt);
    if (!this.running) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (!this.paused) {
      this.player.update(this.input, dt, this.camera, this.clock.elapsedTime);

      // step sounds
      const hv = Math.hypot(this.player.vel.x, this.player.vel.z);
      if (this.player.onGround && hv > 1) {
        this.stepDist += hv * dt;
        if (this.stepDist > 2.1) {
          this.stepDist = 0;
          this.sfx.step();
        }
      }

      if (this.player.pos.y < -12) {
        this.player.respawn();
        this.sfx.jump();
      }
    }

    this.world.update();
    this.particles.update(dt);
    this.updateTnts(dt);
    this.updateSky(this.paused ? 0 : dt);

    // camera follows player + bob
    const eye = new THREE.Vector3();
    this.player.eyePosition(eye);
    const bob = Math.sin(this.player.bobPhase * 2 * Math.PI) * 0.06 * this.player.bobAmount;
    const bobX = Math.cos(this.player.bobPhase * Math.PI) * 0.04 * this.player.bobAmount;
    // apply bob in camera-right direction
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(right);
    right.cross(this.camera.up).normalize();
    eye.addScaledVector(right, bobX);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      eye.x += (Math.random() - 0.5) * this.shake * 0.5;
      eye.y += (Math.random() - 0.5) * this.shake * 0.5;
      eye.z += (Math.random() - 0.5) * this.shake * 0.5;
    }
    this.camera.position.set(eye.x, eye.y + bob, eye.z);

    // FOV: sprint / fly
    const wantFov = this.input.sprint && Math.hypot(this.player.vel.x, this.player.vel.z) > 5 ? 82 : 75;
    this.fovTarget += (wantFov - this.fovTarget) * Math.min(1, dt * 8);
    if (Math.abs(this.camera.fov - this.fovTarget) > 0.05) {
      this.camera.fov = this.fovTarget;
      this.camera.updateProjectionMatrix();
    }

    // targeting outline
    if (this.controls.isLocked) {
      const hit = this.targetHit();
      if (hit) {
        this.outline.visible = true;
        this.outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      } else {
        this.outline.visible = false;
      }
    } else {
      this.outline.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 1;
}

// silence unused-import lint noise for constants used only in types
void HOTBAR;
void WORLD_SIZE;
void WORLD_HEIGHT;

new Game();
