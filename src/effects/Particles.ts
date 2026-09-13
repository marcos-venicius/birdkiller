import * as THREE from 'three';
import type { BirdColors } from '../birds/species';
import type { Terrain } from '../world/Terrain';

const CAPACITY = 240;

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  spin: THREE.Vector3;
  color: THREE.Color;
  w: number;
  h: number;
  life: number;
  age: number;
  feather: boolean;
  phase: number;
  resting: boolean;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** Penas (caem devagar, balançando) e lascas de terra/casca/pedra — um único InstancedMesh com pool. */
export class Particles {
  private readonly mesh: THREE.InstancedMesh;
  private readonly live: Particle[] = [];
  private readonly free: Particle[] = [];

  constructor(
    scene: THREE.Scene,
    private readonly terrain: Terrain,
  ) {
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, dithering: true });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, CAPACITY);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < CAPACITY; i++) {
      this.free.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        color: new THREE.Color(),
        w: 0,
        h: 0,
        life: 0,
        age: 0,
        feather: false,
        phase: 0,
        resting: false,
      });
    }
  }

  get count(): number {
    return this.live.length;
  }

  /** Nuvem de penas nas cores do pássaro, lançadas na direção do tiro. */
  feathers(point: THREE.Vector3, colors: BirdColors, count: number, dir: THREE.Vector3): void {
    this.tufts(point, [colors.back, colors.belly, colors.wing, colors.breast, colors.back], count, dir);
  }

  /** Tufos leves (penas, pelos) nas cores dadas, lançados na direção do tiro e caindo devagar. */
  tufts(point: THREE.Vector3, palette: readonly number[], count: number, dir: THREE.Vector3): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn();
      if (!p) return;
      p.feather = true;
      p.pos.set(point.x + rnd(-0.08, 0.08), point.y + rnd(-0.08, 0.08), point.z + rnd(-0.08, 0.08));
      p.vel.copy(dir).multiplyScalar(rnd(0.6, 2.2));
      p.vel.x += rnd(-1.4, 1.4);
      p.vel.y += rnd(-0.6, 2);
      p.vel.z += rnd(-1.4, 1.4);
      p.w = rnd(0.03, 0.05);
      p.h = rnd(0.07, 0.12);
      p.life = rnd(3.5, 6);
      p.color.set(palette[Math.floor(Math.random() * palette.length)]).multiplyScalar(rnd(0.85, 1.15));
    }
  }

  /** Respingo de água: gotas claras subindo e caindo de volta. */
  splash(point: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn();
      if (!p) return;
      p.feather = false;
      p.pos.copy(point);
      p.vel.set(rnd(-1.8, 1.8), rnd(3, 6.5), rnd(-1.8, 1.8));
      p.w = p.h = rnd(0.025, 0.06);
      p.life = rnd(0.5, 0.9);
      p.color.setRGB(rnd(0.7, 0.9), rnd(0.85, 1), 1);
    }
  }

  /** Lascas pulando do ponto de impacto. */
  debris(point: THREE.Vector3, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.spawn();
      if (!p) return;
      p.feather = false;
      p.pos.copy(point);
      p.vel.set(rnd(-1.5, 1.5), rnd(1.5, 4), rnd(-1.5, 1.5));
      p.w = p.h = rnd(0.03, 0.07);
      p.life = rnd(0.6, 1.1);
      p.color.set(color).multiplyScalar(rnd(0.75, 1.2));
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.live[i] = this.live[this.live.length - 1];
        this.live.pop();
        this.free.push(p);
        continue;
      }
      if (!p.resting) {
        if (p.feather) {
          // Arrasto forte: a pena perde o impulso e desce devagar, balançando.
          const k = Math.exp(-2.5 * dt);
          p.vel.x *= k;
          p.vel.z *= k;
          p.vel.y = -0.55 + (p.vel.y + 0.55) * k;
          p.pos.x += Math.sin(p.age * 5 + p.phase) * 0.25 * dt;
        } else {
          p.vel.y -= 9.8 * dt;
        }
        p.pos.addScaledVector(p.vel, dt);
        p.rot.addScaledVector(p.spin, dt);
        const lake = this.terrain.lakes.at(p.pos.x, p.pos.z);
        const surface = this.terrain.heightAt(p.pos.x, p.pos.z);
        const ground = (lake ? Math.max(surface, lake.level) : surface) + 0.02;
        if (p.pos.y < ground) {
          p.pos.y = ground;
          p.resting = true;
          p.rot.x = -Math.PI / 2;
          p.rot.y = 0;
        }
      }
      const fade = Math.min(1, (p.life - p.age) / 0.6);
      _q.setFromEuler(_e.set(p.rot.x, p.rot.y, p.rot.z));
      _s.set(p.w * fade, p.h * fade, 1);
      this.mesh.setMatrixAt(n, _m.compose(p.pos, _q, _s));
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor!.needsUpdate = true;
    }
  }

  private spawn(): Particle | null {
    const p = this.free.pop();
    if (!p) return null;
    p.age = 0;
    p.resting = false;
    p.phase = Math.random() * Math.PI * 2;
    p.rot.set(rnd(0, 6.28), rnd(0, 6.28), rnd(0, 6.28));
    p.spin.set(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
    this.live.push(p);
    return p;
  }
}
