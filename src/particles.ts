// Block break particles + TNT explosion effects.
import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
}

export class Particles {
  private pool: Particle[] = [];
  private group = new THREE.Group();
  private geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  private mat = new THREE.MeshLambertMaterial({ vertexColors: false });

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  burst(x: number, y: number, z: number, color: string, count = 14, power = 3) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat.clone());
      (mesh.material as THREE.MeshLambertMaterial).color.set(color);
      const s = 0.6 + Math.random() * 0.9;
      mesh.scale.setScalar(s);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.8,
        y + (Math.random() - 0.5) * 0.8,
        z + (Math.random() - 0.5) * 0.8
      );
      this.group.add(mesh);
      this.pool.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * power,
          Math.random() * power * 0.9 + 1,
          (Math.random() - 0.5) * power
        ),
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5,
        gravity: 18,
      });
    }
  }

  update(dt: number) {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const p = this.pool[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.pool.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 7;
      const k = 1 - p.life / p.maxLife;
      p.mesh.scale.setScalar(Math.max(0.05, k));
    }
  }
}
