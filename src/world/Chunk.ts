import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Terrain } from './Terrain';
import type { LayerDef } from './vegetation/Vegetation';

/** Envia ao GPU só a parte usada dos buffers de instância e atualiza o volume de culling. */
export function commitInstances(mesh: THREE.InstancedMesh): void {
  const n = mesh.count;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, n * 16);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, n * 3);
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingSphere();
}

function createInstanced(geo: THREE.BufferGeometry, mat: THREE.Material, capacity: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  mesh.count = 0;
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

/**
 * Um pedaço quadrado do mundo: malha de terreno + uma camada instanciada por tipo de vegetação.
 * Objetos Chunk são reaproveitados (pool): place() + preenchimento reescrevem os buffers existentes.
 */
export class Chunk {
  cx = 0;
  cz = 0;
  /** 0 = detalhado, 1 = simplificado. */
  lod = 0;
  readonly group = new THREE.Group();
  readonly ground: THREE.Mesh;
  readonly layers: THREE.InstancedMesh[];
  /** Obstáculos para colisão: tripletos (x, z, raio). */
  readonly colliders: number[] = [];
  /** Pontos de pouso para pássaros (Etapa 4): tripletos (x, y, z). */
  readonly perches: number[] = [];
  grass: THREE.InstancedMesh | null = null;

  constructor(
    terrain: Terrain,
    private readonly defs: readonly LayerDef[],
  ) {
    this.ground = new THREE.Mesh(terrain.createChunkGeometry(), terrain.material);
    this.ground.receiveShadow = true;
    this.ground.matrixAutoUpdate = false;
    this.group.add(this.ground);
    this.layers = defs.map((def) => {
      const mesh = createInstanced(def.lod0, def.material, def.capacity);
      if (def.depthMaterial) mesh.customDepthMaterial = def.depthMaterial;
      this.group.add(mesh);
      return mesh;
    });
  }

  static createGrassMesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.InstancedMesh {
    return createInstanced(geo, mat, CONFIG.vegetation.grassPerChunk);
  }

  place(cx: number, cz: number): void {
    this.cx = cx;
    this.cz = cz;
    const s = CONFIG.world.chunkSize;
    this.ground.position.set(cx * s, 0, cz * s);
    this.ground.updateMatrix();
  }

  clearContent(): void {
    for (const mesh of this.layers) mesh.count = 0;
    this.colliders.length = 0;
    this.perches.length = 0;
  }

  finishContent(): void {
    for (const mesh of this.layers) commitInstances(mesh);
    this.applyLod();
  }

  setLod(lod: number): void {
    if (lod === this.lod) return;
    this.lod = lod;
    this.applyLod();
  }

  private applyLod(): void {
    for (let i = 0; i < this.layers.length; i++) {
      const def = this.defs[i];
      const mesh = this.layers[i];
      const geo = this.lod === 0 ? def.lod0 : def.lod1;
      if (!geo || mesh.count === 0) {
        mesh.visible = false;
        continue;
      }
      if (mesh.geometry !== geo) {
        mesh.geometry = geo;
        mesh.computeBoundingSphere();
      }
      mesh.visible = true;
      mesh.castShadow = def.castShadow && this.lod === 0;
    }
  }
}
