import * as THREE from 'three';
import { CONFIG } from '../config';

/** Pontos guardados do caminho de cada bala (~8 m por ponto a 60 fps). */
const MAX_POINTS = 72;
const MAX_BULLETS = 6;

const TRACER_VERTEX = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Vértices por segmento do rastro: dois triângulos formando uma fita virada para a câmera. */
const VERTS_PER_SEG = 6;

const TRACER_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(uColor, vAlpha);
  }
`;

/** Clarão curto no ponto onde a bala bateu — é ele que mostra a distância, mesmo longe. */
interface Flash {
  pos: THREE.Vector3;
  age: number;
}

/** Uma bala no ar, com o caminho que ela já percorreu (para o rastro). */
interface Bullet {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Distância já percorrida (m). */
  dist: number;
  path: Float32Array;
  points: number;
  /** Tempo desde o impacto (s); negativo enquanto voa. */
  after: number;
  active: boolean;
}

/** O que aconteceu no trecho percorrido num quadro. */
export type Resolve = (from: THREE.Vector3, dir: THREE.Vector3, maxT: number, travelled: number) => boolean;

const _dir = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _side = new THREE.Vector3();
const _view = new THREE.Vector3();
const _down = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _up2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Balas com tempo de voo e queda, e o rastro luminoso que deixam — dá para ver a trajetória e
 * onde o tiro bateu. O acerto é resolvido por trecho a cada quadro (quem resolve é o Hunting),
 * então o alvo pode se mexer enquanto a bala viaja.
 */
export class Ballistics {
  private readonly bullets: Bullet[] = [];
  private readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly flashes: Flash[] = [];
  private readonly flashMesh: THREE.Mesh;
  private readonly flashPos: Float32Array;
  private readonly flashAlpha: Float32Array;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < MAX_BULLETS; i++) {
      this.bullets.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        dist: 0,
        path: new Float32Array(MAX_POINTS * 3),
        points: 0,
        after: -1,
        active: false,
      });
    }
    const segs = MAX_BULLETS * MAX_POINTS;
    this.positions = new Float32Array(segs * VERTS_PER_SEG * 3);
    this.alphas = new Float32Array(segs * VERTS_PER_SEG);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    geo.setDrawRange(0, 0);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: TRACER_VERTEX,
        fragmentShader: TRACER_FRAGMENT,
        uniforms: { uColor: { value: new THREE.Color(CONFIG.combat.tracerColor) } },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    // Clarões: um quadrado por impacto, virado para a câmera.
    this.flashPos = new Float32Array(MAX_BULLETS * 6 * 3);
    this.flashAlpha = new Float32Array(MAX_BULLETS * 6);
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(this.flashPos, 3));
    fgeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.flashAlpha, 1));
    fgeo.setDrawRange(0, 0);
    fgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.flashMesh = new THREE.Mesh(fgeo, (this.mesh as THREE.Mesh).material as THREE.Material);
    this.flashMesh.name = 'impacto';
    this.flashMesh.frustumCulled = false;
    this.flashMesh.renderOrder = 3;
    scene.add(this.flashMesh);

    this.mesh.name = 'rastro';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  /** Balas no ar (testes/depuração). */
  get flying(): number {
    let n = 0;
    for (const b of this.bullets) if (b.active && b.after < 0) n++;
    return n;
  }

  /**
   * Dispara. A bala voa exatamente na linha da mira (só levantada pela zeragem), mas o rastro
   * começa na boca do cano: é essa diferença que faz o risco aparecer saindo da arma até o alvo,
   * em vez de um ponto parado no meio da tela. A precisão não muda.
   */
  fire(origin: THREE.Vector3, dir: THREE.Vector3): void {
    const C = CONFIG.combat;
    const b = this.bullets.find((x) => !x.active) ?? this.bullets[0];
    _dir.copy(dir).normalize();
    b.pos.copy(origin);
    // Ângulo de zeragem: sobe o cano o bastante para a queda casar na distância de zeragem.
    const rise = (C.gravity * C.zeroDistance) / (2 * C.muzzleVelocity * C.muzzleVelocity);
    b.vel.copy(_dir);
    b.vel.y += rise;
    b.vel.normalize().multiplyScalar(C.muzzleVelocity);
    b.dist = 0;
    b.points = 0;
    b.after = -1;
    b.active = true;
    // Primeiro ponto do rastro: a boca do cano, à direita e abaixo do olho.
    _side.crossVectors(_dir, UP).normalize();
    _down.crossVectors(_dir, _side).normalize();
    _aim
      .copy(origin)
      .addScaledVector(_side, C.muzzleRight)
      .addScaledVector(_down, C.muzzleDown)
      .addScaledVector(_dir, C.muzzleForward);
    this.push(b, _aim);
  }

  /** Avança as balas; `resolve` devolve true quando o trecho bateu em algo. */
  update(dt: number, resolve: Resolve, eye?: THREE.Vector3): void {
    const C = CONFIG.combat;
    for (const b of this.bullets) {
      if (!b.active) continue;
      if (b.after >= 0) {
        // Já bateu: o rastro fica um instante no ar mostrando por onde passou.
        b.after += dt;
        if (b.after > C.tracerFade) b.active = false;
        continue;
      }
      const speed = b.vel.length();
      const step = Math.min(speed * dt, C.range - b.dist);
      _dir.copy(b.vel).divideScalar(speed);
      if (resolve(b.pos, _dir, step, b.dist)) {
        b.after = 0;
        continue;
      }
      b.pos.addScaledVector(_dir, step);
      b.vel.y -= C.gravity * dt;
      b.dist += step;
      this.push(b, b.pos);
      if (b.dist >= C.range) b.after = 0;
    }
    this.build(eye);
    this.buildFlashes(dt, eye);
  }

  /** Marca o ponto exato onde a bala parou: o rastro termina ali e o clarão acende. */
  markImpact(point: THREE.Vector3): void {
    for (const b of this.bullets) if (b.active && b.after === 0) this.push(b, point);
    if (this.flashes.length >= MAX_BULLETS) this.flashes.shift();
    this.flashes.push({ pos: point.clone(), age: 0 });
  }

  /** Quadrados virados para a câmera nos pontos de impacto, apagando rápido. */
  private buildFlashes(dt: number, eye?: THREE.Vector3): void {
    const C = CONFIG.combat;
    const pos = this.flashPos;
    const alpha = this.flashAlpha;
    let n = 0;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      if (f.age > C.flashTime) {
        this.flashes.splice(i, 1);
        continue;
      }
      const t = 1 - f.age / C.flashTime;
      if (eye) _view.subVectors(f.pos, eye);
      else _view.set(0, 0, 1);
      const dist = _view.length() || 1;
      _view.divideScalar(dist);
      _side.crossVectors(_view, UP).normalize();
      _up2.crossVectors(_side, _view).normalize();
      // Cresce com a distância para continuar visível de longe, e infla um pouco ao apagar.
      const r = (C.flashSize + dist * C.flashSizePerMeter) * (1.4 - 0.4 * t);
      const o = n * 6 * 3;
      const corners: [number, number][] = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
      ];
      for (let v = 0; v < 6; v++) {
        const [sx, sy] = corners[v];
        pos[o + v * 3] = f.pos.x + (_side.x * sx + _up2.x * sy) * r;
        pos[o + v * 3 + 1] = f.pos.y + (_side.y * sx + _up2.y * sy) * r;
        pos[o + v * 3 + 2] = f.pos.z + (_side.z * sx + _up2.z * sy) * r;
        alpha[n * 6 + v] = t * t * C.flashOpacity;
      }
      n++;
    }
    const geo = this.flashMesh.geometry;
    geo.setDrawRange(0, n * 6);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    this.flashMesh.visible = n > 0;
  }

  private push(b: Bullet, p: THREE.Vector3): void {
    if (b.points >= MAX_POINTS) {
      // Descarta o começo do caminho e continua.
      b.path.copyWithin(0, 3);
      b.points--;
    }
    const o = b.points * 3;
    b.path[o] = p.x;
    b.path[o + 1] = p.y;
    b.path[o + 2] = p.z;
    b.points++;
  }

  /**
   * Reescreve a fita do rastro: cada trecho vira um retângulo virado para a câmera (linha de 1 px
   * some na tela), mais forte na ponta e apagando na cauda e depois do impacto.
   */
  private build(eye?: THREE.Vector3): void {
    const C = CONFIG.combat;
    const pos = this.positions;
    const alpha = this.alphas;
    let n = 0;
    for (const b of this.bullets) {
      if (!b.active || b.points < 2) continue;
      const fade = b.after >= 0 ? 1 - b.after / C.tracerFade : 1;
      for (let i = 0; i < b.points - 1; i++) {
        const head = i / (b.points - 1);
        // Enquanto voa, só o pedaço final brilha; parada, a trajetória inteira aparece fraca.
        const tail = b.after >= 0 ? 0.35 + 0.65 * head : Math.max(0, 1 - (b.points - 2 - i) / C.tracerLength);
        if (tail <= 0.01) continue;
        _a.fromArray(b.path, i * 3);
        _b.fromArray(b.path, (i + 1) * 3);
        _seg.subVectors(_b, _a);
        // Perpendicular ao trecho e à direção da câmera: a fita fica sempre de frente.
        if (eye) _view.subVectors(_a, eye);
        else _view.set(0, 1, 0);
        _side.crossVectors(_seg, _view);
        const len = _side.length();
        if (len < 1e-6) continue;
        _side.divideScalar(len);
        // Largura de cada ponta pela distância dela até a câmera: assim o risco tem a mesma
        // espessura em pixels do começo ao fim (perto do cano ele seria enorme).
        const wa = C.tracerWidth + (eye ? _a.distanceTo(eye) * C.tracerWidthPerMeter : 0);
        const wb = C.tracerWidth + (eye ? _b.distanceTo(eye) * C.tracerWidthPerMeter : 0);
        const o = n * VERTS_PER_SEG * 3;
        const corners = [
          [_a, -1, wa],
          [_a, 1, wa],
          [_b, 1, wb],
          [_a, -1, wa],
          [_b, 1, wb],
          [_b, -1, wb],
        ] as const;
        const aStart = tail * fade * C.tracerOpacity * 0.65;
        const aEnd = tail * fade * C.tracerOpacity;
        for (let v = 0; v < VERTS_PER_SEG; v++) {
          const [p, sgn, w] = corners[v];
          pos[o + v * 3] = p.x + _side.x * sgn * w;
          pos[o + v * 3 + 1] = p.y + _side.y * sgn * w;
          pos[o + v * 3 + 2] = p.z + _side.z * sgn * w;
          alpha[n * VERTS_PER_SEG + v] = p === _a ? aStart : aEnd;
        }
        n++;
      }
    }
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, n * VERTS_PER_SEG);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    this.mesh.visible = n > 0;
  }
}
