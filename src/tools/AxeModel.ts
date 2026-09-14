import * as THREE from 'three';
import { woodTexture } from '../weapon/Kar98kModel';

/**
 * Machado procedural: cabo de madeira (a mesma textura da coronha do rifle) e cabeça de aço em cunha,
 * com o fio mais claro. Origem onde a mão segura; o cabo sobe em +Y e o fio aponta para -Z.
 */
export function buildAxe(): THREE.Group {
  const wood = new THREE.MeshPhongMaterial({ map: woodTexture(), shininess: 18, specular: 0x2a2018 });
  const steel = new THREE.MeshPhongMaterial({ color: 0x4a4d52, shininess: 70, specular: 0x70747c });
  const edge = new THREE.MeshPhongMaterial({ color: 0xb4b8be, shininess: 130, specular: 0xffffff });
  const group = new THREE.Group();

  // Cabo de -0,12 a 0,68 m, mais grosso embaixo, com o castão na ponta.
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.8, 10), wood);
  handle.position.y = 0.28;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), wood);
  knob.scale.set(1, 0.7, 1.2);
  knob.position.y = -0.12;
  group.add(handle, knob);

  // Cabeça: perfil no plano XY (x = para a frente, y = para cima), extrudado na espessura e girado para -Z.
  const shape = new THREE.Shape([
    new THREE.Vector2(-0.06, -0.028),
    new THREE.Vector2(0.03, -0.03),
    new THREE.Vector2(0.15, -0.075),
    new THREE.Vector2(0.165, -0.07),
    new THREE.Vector2(0.165, 0.07),
    new THREE.Vector2(0.15, 0.075),
    new THREE.Vector2(0.03, 0.03),
    new THREE.Vector2(-0.06, 0.028),
  ]);
  const head = new THREE.ExtrudeGeometry(shape, { depth: 0.024, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
  head.translate(0, 0, -0.012);
  head.rotateY(Math.PI / 2);
  const headMesh = new THREE.Mesh(head, steel);
  headMesh.position.y = 0.62;
  // Fio afiado, mais claro.
  const bevel = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.15, 0.018), edge);
  bevel.position.set(0, 0.62, -0.158);
  group.add(headMesh, bevel);
  return group;
}
