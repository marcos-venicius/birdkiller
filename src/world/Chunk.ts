import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Terrain } from './Terrain';
import type { LayerDef } from './vegetation/Vegetation';

export type TreeKind = 'conifer' | 'broadleaf' | 'birch' | 'snag';

/** Árvore em pé que o machado derruba (alinhada a `trunks`; null = toco). */
export interface TreeRef {
  /** Id estável no mundo: o chunk e a célula da grade de árvores. */
  id: string;
  layer: number;
  /** Índice da instância na camada (muda a cada repovoamento). */
  index: number;
  kind: TreeKind;
  scale: number;
  /** Raio do tronco na base (m, já na escala). */
  radius: number;
  /** Altura do topo da copa em escala 1. */
  top: number;
}

/** Tronco caído que dá para recolher. */
export interface LogRef {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Direção do comprimento no plano e o desnível de uma ponta à outra. */
  dx: number;
  dz: number;
  rise: number;
  len: number;
  r: number;
  wood: number;
}

/**
 * Envia ao GPU só a parte usada dos buffers de instância e atualiza o volume de culling
 * (`computeBounds = false` quando quem chama já definiu mesh.boundingSphere).
 */
export function commitInstances(mesh: THREE.InstancedMesh, computeBounds = true): void {
  const n = mesh.count;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, n * 16);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, n * 3);
    mesh.instanceColor.needsUpdate = true;
  }
  if (computeBounds) mesh.computeBoundingSphere();
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
  /** Pontos de pouso para pássaros: tripletos (x, y, z). */
  readonly perches: number[] = [];
  /** Troncos e tocos para oclusão do tiro: (x, z, raio, yTopo). */
  readonly trunks: number[] = [];
  /** Pedras para oclusão do tiro: esferas (x, y, z, raio). */
  readonly rocks: number[] = [];
  /** Quem é cada tronco de `trunks`: árvore cortável, ou null (toco). */
  readonly treeRefs: (TreeRef | null)[] = [];
  /** Troncos caídos recolhíveis. */
  readonly logs: LogRef[] = [];
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
    this.trunks.length = 0;
    this.rocks.length = 0;
    this.treeRefs.length = 0;
    this.logs.length = 0;
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
