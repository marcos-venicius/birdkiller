import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Input } from '../core/Input';
import { smoothstep, TAU } from '../core/math';
import { holdOnLadder } from '../world/Places';
import type { Terrain } from '../world/Terrain';

const MAX_PITCH = THREE.MathUtils.degToRad(CONFIG.player.maxPitch);

/** Mundo com obstáculos: empurra um círculo horizontal para fora deles. */
export interface CollisionWorld {
  resolveCollision(pos: THREE.Vector3, radius: number): void;
}

/** Movimento em primeira pessoa: andar, correr (sem stamina), agachar, pular, olhar — e entrar na água e nadar. */
export class PlayerController {
  /** Posição dos pés. */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  crouched = false;
  running = false;
  onGround = true;
  /** Multiplicador de sensibilidade (a luneta reduz). */
  lookScale = 1;
  /** Sensibilidade escolhida pelo jogador (teclas − e =). */
  sensitivity = 1;
  /** Mirando: anda mais devagar e não corre (definido pela arma). */
  aiming = false;
  /** Deslocamento extra do olhar (x = pitch, y = yaw): coice e respiração, definido pela arma. */
  readonly viewOffset = new THREE.Vector2();
  /** Movimento do mouse no último quadro (px) — usado pelo balanço da arma. */
  readonly lookDelta = new THREE.Vector2();
  /** Intensidade atual do balanço dos passos (0..1). */
  bobAmount = 0;
  /** Fase dos passos: avança π a cada passo (ou braçada, nadando) — base para o áudio de passos. */
  stepPhase = 0;
  /** Numa escada (torre de caça): sem gravidade, sobe e desce. */
  climbing = false;
  /** Água sobre o pé (m): 0 em terra firme. */
  waterDepth = 0;
  /** Nadando onde não dá pé: boia (nunca afunda), sem agachar, pular nem atirar. */
  swimming = false;

  private eyeHeight: number = CONFIG.player.eyeHeight;
  private swimTime = 0;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly input: Input,
    private readonly terrain: Terrain,
    private readonly world?: CollisionWorld,
  ) {}

  spawn(x: number, z: number, yaw = 0): void {
    this.position.set(x, this.terrain.heightAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.swimming = false;
  }

  update(dt: number): void {
    const P = CONFIG.player;
    const S = CONFIG.swim;
    const input = this.input;

    const { dx, dy } = input.consumeMouseDelta();
    this.lookDelta.set(dx, dy);
    const sens = P.mouseSensitivity * this.sensitivity * this.lookScale;
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -MAX_PITCH, MAX_PITCH);

    if (input.wasPressed('KeyC')) this.crouched = !this.crouched;
    // Com água pela cintura não dá para agachar: o olho ficaria embaixo d'água.
    if (this.swimming || this.waterDepth > S.crouchMax) this.crouched = false;

    const mx = (this.key('KeyD', 'ArrowRight') ? 1 : 0) - (this.key('KeyA', 'ArrowLeft') ? 1 : 0);
    const mz = (this.key('KeyW', 'ArrowUp') ? 1 : 0) - (this.key('KeyS', 'ArrowDown') ? 1 : 0);
    const moving = mx !== 0 || mz !== 0;
    this.running = moving && !this.aiming && this.key('ShiftLeft', 'ShiftRight');
    if (this.running) this.crouched = false;

    // Direção desejada no plano: frente = (-sin yaw, -cos yaw), direita = (cos yaw, -sin yaw).
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    let wx = mx * cosY - mz * sinY;
    let wz = -mx * sinY - mz * cosY;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx /= len;
      wz /= len;
    }
    let speed: number;
    if (this.swimming) {
      speed = this.running ? S.swimFastSpeed : S.swimSpeed;
    } else {
      speed = (this.crouched ? P.crouchSpeed : this.running ? P.runSpeed : P.walkSpeed) * (this.aiming ? P.aimSpeedFactor : 1);
      // Vadeando: a água segura as pernas, mais quanto mais funda.
      speed *= 1 - (1 - S.wadeSlow) * smoothstep(0, S.swimDepth, this.waterDepth);
    }
    const accel = this.swimming ? S.swimAccel : this.onGround ? (moving ? P.accel : P.friction) : P.airAccel;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (wx * speed - this.velocity.x) * k;
    this.velocity.z += (wz * speed - this.velocity.z) * k;

    // Escada da torre de caça: dentro dela a gravidade some. W sobe olhando reto ou para cima e desce
    // olhando para baixo (S faz o contrário); perto do topo, o passo à frente leva à plataforma.
    const places = this.terrain.places;
    const ladder = places.ladderAt(this.position);
    this.climbing = ladder !== null;
    if (ladder) {
      const dir = this.pitch < -0.35 ? -1 : 1;
      this.velocity.y = mz * dir * CONFIG.places.climbSpeed;
      if (this.position.y < ladder.y1 - 0.5) {
        // Agarrado na escada: quase não sai do lugar na horizontal.
        this.velocity.x *= 0.15;
        this.velocity.z *= 0.15;
      }
      if (input.wasPressed('Space')) this.velocity.y = P.jumpSpeed * 0.6;
    } else if (this.swimming) {
      // Boiando: a água segura o corpo — sem gravidade e sem pulo.
      this.velocity.y = 0;
    } else {
      if (this.onGround && input.wasPressed('Space')) {
        this.velocity.y = P.jumpSpeed;
        this.onGround = false;
        this.crouched = false;
      }
      this.velocity.y -= P.gravity * dt;
    }
    this.position.addScaledVector(this.velocity, dt);
    this.world?.resolveCollision(this.position, P.radius);
    places.resolveCollision(this.position, P.radius, P.eyeHeight);
    if (ladder && this.position.y < ladder.y1 - 0.5) holdOnLadder(ladder, this.position);

    // Chão = relevo, ou um piso de lugar (plataforma, assoalho) que o pé alcança.
    const floor = places.floorAt(this.position.x, this.position.z, this.position.y, P.stepUp);
    const ground = Math.max(this.terrain.heightAt(this.position.x, this.position.z), floor);

    // Água: onde o fundo passa de swimDepth o pé sai do chão e o jogador nada; volta a andar quando o
    // fundo sobe de novo (um pouco antes, para não ficar trocando na divisa).
    const lake = this.terrain.lakes.at(this.position.x, this.position.z);
    const bottom = lake ? lake.level - ground : 0;
    if (this.swimming && (!lake || bottom < S.swimExit || ladder)) {
      this.swimming = false;
    } else if (!this.swimming && lake && !ladder && bottom > S.swimDepth && this.position.y <= lake.level - S.swimDepth) {
      this.swimming = true;
      this.crouched = false;
    }

    if (this.swimming && lake) {
      // Nunca afunda: o pé fica a swimDepth da lâmina (ou no fundo, onde já quase dá pé).
      this.position.y = Math.max(ground, lake.level - S.swimDepth);
      this.velocity.y = 0;
      this.onGround = false;
    } else if (this.position.y <= ground) {
      this.position.y = ground;
      this.velocity.y = 0;
      this.onGround = true;
    } else if (this.onGround && this.velocity.y <= 0 && this.position.y - ground < P.stepSnap) {
      // Mantém o jogador colado ao chão descendo ladeiras, em vez de "voar" a cada passo.
      this.position.y = ground;
      this.velocity.y = 0;
    } else {
      this.onGround = false;
    }
    this.waterDepth = lake ? Math.max(0, lake.level - this.position.y) : 0;

    // Nadando, o olho fica logo acima da lâmina; em pé, na altura de sempre.
    const targetEye = this.swimming && lake ? lake.level + S.swimEye - this.position.y : this.crouched ? P.crouchEyeHeight : P.eyeHeight;
    this.eyeHeight += (targetEye - this.eyeHeight) * (1 - Math.exp(-P.crouchLerp * dt));

    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.swimming) {
      // Braçadas pela distância nadada; parado, as pernas continuam batendo devagar.
      this.stepPhase += Math.max(hSpeed / S.strokeLength, S.treadRate) * dt * Math.PI;
    } else if (this.onGround) {
      this.stepPhase += (hSpeed * dt * Math.PI) / (P.strideBase + P.strideFactor * hSpeed);
    }
    const targetBob = this.onGround ? Math.min(hSpeed / P.runSpeed, 1) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * (1 - Math.exp(-8 * dt));
    let bobY = Math.sin(this.stepPhase * 2) * P.bobHeight * this.bobAmount;
    const bobX = Math.sin(this.stepPhase) * P.bobSway * this.bobAmount;
    let roll = 0;
    if (this.swimming) {
      // Boia com a marola e, a cada braçada, o corpo sobe um pouco e balança de leve.
      this.swimTime += dt;
      const effort = Math.min(hSpeed / S.swimSpeed, 1.5);
      bobY += Math.sin(this.swimTime * TAU * S.bobRate) * S.bobHeight + Math.sin(this.stepPhase * 2) * 0.025 * effort;
      roll = Math.sin(this.stepPhase) * 0.012 * effort;
    }

    this.camera.position.set(
      this.position.x + cosY * bobX,
      this.position.y + this.eyeHeight + bobY,
      this.position.z - sinY * bobX,
    );
    this.camera.rotation.set(this.pitch + this.viewOffset.x, this.yaw + this.viewOffset.y, roll, 'YXZ');
  }

  private key(a: string, b: string): boolean {
    return this.input.isDown(a) || this.input.isDown(b);
  }
}
