import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Terrain } from '../world/Terrain';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _spin = new THREE.Quaternion();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Sangue dos bichos feridos: gotas escuras deitadas no relevo, que dá para seguir. Um InstancedMesh só
 * (uma draw call), em anel — passando do máximo, a gota mais antiga dá lugar à nova.
 */
export class BloodTrail {
  private readonly mesh: THREE.InstancedMesh;
  private readonly max: number = CONFIG.wounded.bloodMax;
  private next = 0;
  private count = 0;

  constructor(
    scene: THREE.Scene,
    private readonly terrain: Terrain,
  ) {
    // Disco de raio ~1 com a borda irregular, deitado no plano do chão.
    const geo = new THREE.CircleGeometry(1, 7);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 1; i < pos.count; i++) {
      const k = 0.65 + 0.35 * Math.abs(Math.sin(i * 12.9898));
      pos.setXYZ(i, pos.getX(i) * k, 0, pos.getZ(i) * k);
    }
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  /** Gotas no mundo agora. */
  get drops(): number {
    return this.count;
  }

  /** Posição da gota `i` (testes). */
  position(i: number, out: THREE.Vector3): THREE.Vector3 {
    this.mesh.getMatrixAt(i, _m);
    return out.setFromMatrixPosition(_m);
  }

  /** Uma gota de ~`size` m de raio em (x, z), deitada conforme o relevo. */
  drop(x: number, z: number, size = 0.09): void {
    const y = this.terrain.heightAt(x, z) + 0.015;
    this.terrain.normalAt(x, z, _n);
    _q.setFromUnitVectors(UP, _n).multiply(_spin.setFromAxisAngle(UP, Math.random() * Math.PI * 2));
    const s = size * rand(0.7, 1.3);
    _m.compose(_p.set(x, y, z), _q, _s.set(s * rand(0.8, 1.4), 1, s));
    const i = this.next;
    this.mesh.setMatrixAt(i, _m);
    this.mesh.setColorAt(i, _c.setRGB(rand(0.32, 0.45), 0.035, 0.03));
    this.next = (i + 1) % this.max;
    this.count = Math.min(this.count + 1, this.max);
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  /** Respingo: algumas gotas espalhadas em volta de (x, z) — onde a bala pegou. */
  splatter(x: number, z: number, n: number, spread: number): void {
    for (let i = 0; i < n; i++) this.drop(x + rand(-spread, spread), z + rand(-spread, spread), rand(0.05, 0.1));
  }

  /** Poça onde o bicho ferido deitou. */
  pool(x: number, z: number): void {
    this.drop(x, z, 0.35);
    this.splatter(x, z, 4, 0.5);
  }

  /** Apaga tudo (testes). */
  clear(): void {
    this.next = 0;
    this.count = 0;
    this.mesh.count = 0;
  }
}
