import * as THREE from 'three';

/**
 * Rifle procedural inspirado na Kar98k com luneta. As medidas do perfil usam `s` = distância ao
 * longo da arma a partir da soleira (0) até a boca do cano (1,10 m) e `py` = altura no perfil.
 * No espaço do modelo: -Z aponta para a boca do cano, o ocular da luneta fica em z = 0 e o eixo
 * óptico em y = 0 — assim a pose de mira é só centralizar o modelo diante da câmera.
 */

const S0 = 0.25;
const AXIS = 0.065;
const BARREL_Y = 0.018;
const z = (s: number) => S0 - s;
const y = (py: number) => py - AXIS;

export interface Kar98kModel {
  group: THREE.Group;
  /** Ferrolho: gira em Z (levanta a alavanca) e desliza em +Z (puxa). */
  bolt: THREE.Group;
  boltRestZ: number;
  flash: THREE.Sprite;
}

function woodTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5a3a22';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 70; i++) {
    const base = Math.random() * c.height;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,20,8' : '150,90,50'},${0.1 + Math.random() * 0.25})`;
    g.lineWidth = 0.5 + Math.random() * 1.5;
    g.beginPath();
    for (let x = 0; x <= c.width; x += 16) {
      const w = base + Math.sin(x * 0.02 + i) * 2 + Math.sin(x * 0.07 + i * 3) * 0.8;
      if (x === 0) g.moveTo(x, w);
      else g.lineTo(x, w);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 7);
  tex.anisotropy = 4;
  return tex;
}

function flashTexture(): THREE.CanvasTexture {
  const size = 128;
  const h = size / 2;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, 'rgba(255,255,230,1)');
  grd.addColorStop(0.25, 'rgba(255,200,110,0.9)');
  grd.addColorStop(0.6, 'rgba(255,120,40,0.25)');
  grd.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,190,100,0.6)';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
    const len = h * (0.6 + Math.random() * 0.4);
    g.beginPath();
    g.moveTo(h + Math.cos(a + 1.4) * 4, h + Math.sin(a + 1.4) * 4);
    g.lineTo(h + Math.cos(a) * len, h + Math.sin(a) * len);
    g.lineTo(h + Math.cos(a - 1.4) * 4, h + Math.sin(a - 1.4) * 4);
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Coronha inteira (soleira, delgado, caixa do carregador e telha) como perfil extrudado. */
function stockGeometry(): THREE.BufferGeometry {
  const profile: [number, number][] = [
    [0, -0.128], [0.12, -0.1], [0.27, -0.066], [0.31, -0.07], [0.335, -0.082], [0.36, -0.072],
    [0.385, -0.056], [0.56, -0.055], [0.62, -0.04], [0.92, -0.028], [0.935, -0.012],
    [0.935, 0.004], [0.56, 0.008], [0.4, 0.003], [0.37, -0.012], [0.3, -0.013], [0.2, -0.006],
    [0.02, -0.003], [0, -0.01],
  ];
  const shape = new THREE.Shape(profile.map(([s, py]) => new THREE.Vector2(s, py)));
  const depth = 0.04;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  // Perfil no plano XY → rifle ao longo de -Z, espessura em X.
  g.translate(0, -AXIS, -depth / 2);
  g.rotateY(Math.PI / 2);
  g.translate(0, 0, S0);
  return g;
}

/** Cilindro ao longo do eixo da arma, de s0 (raio r0) a s1 (raio r1). */
function tubeZ(r0: number, r1: number, s0: number, s1: number, py: number, mat: THREE.Material, segs = 14): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r0, r1, s1 - s0, segs);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(0, y(py), z((s0 + s1) / 2));
  return m;
}

function box(w: number, h: number, d: number, s: number, py: number, mat: THREE.Material, px = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(px, y(py), z(s));
  return m;
}

/** Cilindro centrado na origem ao longo de Z (para peças dentro de grupos). */
function cylZ(r0: number, r1: number, len: number, mat: THREE.Material, segs = 12): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r0, r1, len, segs);
  g.rotateX(Math.PI / 2);
  return new THREE.Mesh(g, mat);
}

export function buildKar98k(): Kar98kModel {
  const wood = new THREE.MeshPhongMaterial({ map: woodTexture(), shininess: 28, specular: 0x2a2018 });
  const metal = new THREE.MeshPhongMaterial({ color: 0x2a2c30, shininess: 70, specular: 0x5a5e66 });
  const dark = new THREE.MeshPhongMaterial({ color: 0x1b1c1f, shininess: 50, specular: 0x3a3d44 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x0a1622, shininess: 140, specular: 0xb0c4d8 });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(stockGeometry(), wood));

  // Cano e ação.
  group.add(tubeZ(0.0165, 0.0165, 0.36, 0.56, BARREL_Y, metal));
  group.add(tubeZ(0.0185, 0.0185, 0.53, 0.575, BARREL_Y, metal));
  group.add(tubeZ(0.0115, 0.0085, 0.575, 1.1, BARREL_Y, metal, 12));
  group.add(tubeZ(0.0145, 0.013, 0.62, 0.86, BARREL_Y - 0.003, wood, 12));
  const band1 = tubeZ(0.034, 0.034, 0.7, 0.716, -0.004, dark, 16);
  band1.scale.x = 0.72;
  const band2 = tubeZ(0.03, 0.03, 0.88, 0.894, -0.002, dark, 16);
  band2.scale.x = 0.8;
  group.add(band1, band2);
  group.add(box(0.014, 0.008, 0.03, 1.07, BARREL_Y + 0.008, metal));
  group.add(box(0.006, 0.014, 0.012, 1.075, BARREL_Y + 0.014, metal));
  group.add(box(0.03, 0.006, 0.1, 0.47, -0.057, metal));
  group.add(box(0.047, 0.125, 0.008, 0.004, -0.066, dark));

  // Guarda-mato e gatilho.
  const tg = new THREE.TorusGeometry(0.022, 0.0028, 6, 14, Math.PI);
  tg.rotateZ(Math.PI);
  tg.rotateY(Math.PI / 2);
  const guard = new THREE.Mesh(tg, metal);
  guard.position.set(0, y(-0.056), z(0.365));
  const trigger = box(0.004, 0.02, 0.006, 0.37, -0.066, metal);
  trigger.rotation.x = 0.3;
  group.add(guard, trigger);

  // Ferrolho (pivô no eixo do cano).
  const bolt = new THREE.Group();
  bolt.position.set(0, y(BARREL_Y), z(0.4));
  bolt.add(cylZ(0.0125, 0.0125, 0.085, metal));
  const shroud = cylZ(0.013, 0.011, 0.03, metal);
  shroud.position.z = 0.055;
  bolt.add(shroud);
  const down = 0.45;
  const handleGeo = new THREE.CylinderGeometry(0.0042, 0.0042, 0.055, 8);
  handleGeo.rotateZ(-(Math.PI / 2 + down));
  const handle = new THREE.Mesh(handleGeo, metal);
  handle.position.set(Math.cos(-down) * 0.0275, Math.sin(-down) * 0.0275, 0.035);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 12, 8), metal);
  knob.position.set(Math.cos(-down) * 0.057, Math.sin(-down) * 0.057, 0.035);
  bolt.add(handle, knob);
  group.add(bolt);

  // Luneta, anéis e montagens.
  group.add(tubeZ(0.0125, 0.0125, 0.29, 0.62, AXIS, dark, 16));
  group.add(tubeZ(0.0185, 0.0135, 0.25, 0.3, AXIS, dark, 16));
  group.add(tubeZ(0.0135, 0.0205, 0.6, 0.7, AXIS, dark, 16));
  group.add(tubeZ(0.0152, 0.0152, 0.345, 0.36, AXIS, metal));
  group.add(tubeZ(0.0152, 0.0152, 0.52, 0.535, AXIS, metal));
  group.add(box(0.012, 0.018, 0.018, 0.352, 0.043, metal));
  group.add(box(0.012, 0.018, 0.018, 0.528, 0.043, metal));
  const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.016, 12), metal);
  turretTop.position.set(0, 0.0125 + 0.008, z(0.45));
  const turretSide = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.016, 12), metal);
  turretSide.rotation.z = Math.PI / 2;
  turretSide.position.set(0.0125 + 0.008, 0, z(0.45));
  group.add(turretTop, turretSide);
  const ocular = new THREE.Mesh(new THREE.CircleGeometry(0.016, 20), glass);
  ocular.position.z = z(0.25) + 0.0005;
  const objGeo = new THREE.CircleGeometry(0.019, 20);
  objGeo.rotateY(Math.PI);
  const objective = new THREE.Mesh(objGeo, glass);
  objective.position.z = z(0.7) - 0.0005;
  group.add(ocular, objective);

  // Clarão na boca do cano.
  const flash = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: flashTexture(),
      color: 0xffd0a0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  flash.position.set(0, y(BARREL_Y), z(1.16));
  flash.visible = false;
  flash.renderOrder = 10;
  group.add(flash);

  return { group, bolt, boltRestZ: bolt.position.z, flash };
}
