// First-person player: physics, AABB collision, walking/jumping/sprinting/swimming/flight.
import * as THREE from 'three';
import { World } from './world';
import { WATER } from './blocks';

export interface PlayerInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
  descend: boolean;
}

const WIDTH = 0.6;
const HEIGHT = 1.8;
const EYE = 1.62;

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  onGround = false;
  flying = false;
  inWater = false;
  bobPhase = 0;
  bobAmount = 0;
  lastJumpTap = -1;
  spawnPoint = new THREE.Vector3();

  world: World;

  constructor(world: World) {
    this.world = world;
  }

  setSpawn(x: number, y: number, z: number) {
    this.spawnPoint.set(x, y, z);
    this.pos.copy(this.spawnPoint);
    this.vel.set(0, 0, 0);
  }

  eyePosition(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + EYE, this.pos.z);
  }

  respawn() {
    this.pos.copy(this.spawnPoint);
    this.vel.set(0, 0, 0);
    this.flying = false;
  }

  /** Double-tap space toggles flight. */
  tryToggleFly(now: number) {
    if (this.lastJumpTap > 0 && now - this.lastJumpTap < 0.3) {
      this.flying = !this.flying;
      this.vel.y = 0;
      this.lastJumpTap = -1;
    } else {
      this.lastJumpTap = now;
    }
  }

  update(input: PlayerInput, dt: number, camera: THREE.Camera, now: number) {
    // movement basis from camera yaw
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    fwd.normalize();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);

    const move = new THREE.Vector3();
    if (input.forward) move.add(fwd);
    if (input.back) move.sub(fwd);
    if (input.right) move.sub(right);
    if (input.left) move.add(right);
    if (move.lengthSq() > 0) move.normalize();

    // in water?
    const headBlock = this.world.getBlock(
      Math.floor(this.pos.x), Math.floor(this.pos.y + 1.2), Math.floor(this.pos.z)
    );
    const feetBlock = this.world.getBlock(
      Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z)
    );
    this.inWater = feetBlock === WATER || headBlock === WATER;

    const sprinting = input.sprint && !this.flying && move.lengthSq() > 0;
    let speed = this.flying ? 14 : sprinting ? 8.2 : 4.6;
    if (this.inWater && !this.flying) speed *= 0.55;

    // horizontal velocity: smooth accel
    const target = move.multiplyScalar(speed);
    const accel = this.onGround || this.flying ? 22 : 8;
    this.vel.x += (target.x - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (target.z - this.vel.z) * Math.min(1, accel * dt);

    // vertical
    if (this.flying) {
      const vy = (input.jump ? 9 : 0) + (input.descend ? -9 : 0);
      this.vel.y += (vy - this.vel.y) * Math.min(1, 14 * dt);
    } else if (this.inWater) {
      this.vel.y += -14 * dt; // gentle sink
      if (input.jump) this.vel.y = 4.2;
      this.vel.y = Math.max(this.vel.y, -4);
      this.vel.y *= 1 - Math.min(1, 2.2 * dt);
    } else {
      this.vel.y -= 26 * dt; // gravity
      if (input.jump && this.onGround) {
        this.vel.y = 8.6;
        this.onGround = false;
      }
    }
    this.vel.y = Math.max(this.vel.y, -50);

    // integrate with per-axis collision
    this.onGround = false;
    this.moveAxis(this.vel.x * dt, 0, 0);
    this.moveAxis(0, 0, this.vel.z * dt);
    this.moveAxis(0, this.vel.y * dt, 0);

    // walk bob
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hSpeed > 0.5) {
      this.bobPhase += hSpeed * dt * 1.6;
      this.bobAmount = Math.min(1, this.bobAmount + dt * 6);
    } else {
      this.bobAmount = Math.max(0, this.bobAmount - dt * 6);
    }

    void now;
  }

  private collides(px: number, py: number, pz: number): boolean {
    const x0 = Math.floor(px - WIDTH / 2), x1 = Math.floor(px + WIDTH / 2);
    const y0 = Math.floor(py), y1 = Math.floor(py + HEIGHT - 0.001);
    const z0 = Math.floor(pz - WIDTH / 2), z1 = Math.floor(pz + WIDTH / 2);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const id = this.world.getBlock(x, y, z);
          if (id !== 0 && id !== WATER) return true;
        }
    return false;
  }

  private moveAxis(dx: number, dy: number, dz: number) {
    if (dx === 0 && dy === 0 && dz === 0) return;
    const nx = this.pos.x + dx, ny = this.pos.y + dy, nz = this.pos.z + dz;
    if (!this.collides(nx, ny, nz)) {
      this.pos.set(nx, ny, nz);
      return;
    }
    // binary search for closest non-colliding position.
    // NOTE: always settle on `lo` (known non-colliding). Using the midpoint
    // can leave the player micro-penetrating the block, which compounds each
    // frame until the player is embedded and can no longer walk.
    let lo = 0, hi = 1;
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      const tx = this.pos.x + dx * mid, ty = this.pos.y + dy * mid, tz = this.pos.z + dz * mid;
      if (this.collides(tx, ty, tz)) hi = mid;
      else lo = mid;
    }
    this.pos.x += dx * lo;
    this.pos.y += dy * lo;
    this.pos.z += dz * lo;
    if (dy < 0) {
      this.onGround = true;
      this.vel.y = 0;
    } else if (dy > 0) {
      this.vel.y = 0;
    } else {
      // wall: kill that velocity component
      if (dx !== 0) this.vel.x = 0;
      if (dz !== 0) this.vel.z = 0;
    }
  }
}
