import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Input } from '../core/Input';
import type { Terrain } from '../world/Terrain';

const MAX_PITCH = THREE.MathUtils.degToRad(CONFIG.player.maxPitch);

/** Mundo com obstáculos: empurra um círculo horizontal para fora deles. */
export interface CollisionWorld {
  resolveCollision(pos: THREE.Vector3, radius: number): void;
}

/** Movimento em primeira pessoa: andar, correr (sem stamina), agachar, pular e olhar. */
export class PlayerController {
  /** Posição dos pés. */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  crouched = false;
  running = false;
  onGround = true;
  /** Multiplicador de sensibilidade (a mira da Etapa 3 reduz). */
  lookScale = 1;
  /** Fase dos passos: avança π a cada passo — base para o áudio de passos (Etapa 6). */
  stepPhase = 0;

  private eyeHeight: number = CONFIG.player.eyeHeight;
  private bobAmount = 0;

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
  }

  update(dt: number): void {
    const P = CONFIG.player;
    const input = this.input;

    const { dx, dy } = input.consumeMouseDelta();
    const sens = P.mouseSensitivity * this.lookScale;
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -MAX_PITCH, MAX_PITCH);

    if (input.wasPressed('KeyC')) this.crouched = !this.crouched;

    const mx = (this.key('KeyD', 'ArrowRight') ? 1 : 0) - (this.key('KeyA', 'ArrowLeft') ? 1 : 0);
    const mz = (this.key('KeyW', 'ArrowUp') ? 1 : 0) - (this.key('KeyS', 'ArrowDown') ? 1 : 0);
    const moving = mx !== 0 || mz !== 0;
    this.running = moving && this.key('ShiftLeft', 'ShiftRight');
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
    const speed = this.crouched ? P.crouchSpeed : this.running ? P.runSpeed : P.walkSpeed;
    const accel = this.onGround ? (moving ? P.accel : P.friction) : P.airAccel;
    const k = 1 - Math.exp(-accel * dt);
    this.velocity.x += (wx * speed - this.velocity.x) * k;
    this.velocity.z += (wz * speed - this.velocity.z) * k;

    if (this.onGround && input.wasPressed('Space')) {
      this.velocity.y = P.jumpSpeed;
      this.onGround = false;
      this.crouched = false;
    }
    this.velocity.y -= P.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);
    this.world?.resolveCollision(this.position, P.radius);

    const ground = this.terrain.heightAt(this.position.x, this.position.z);
    if (this.position.y <= ground) {
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

    const targetEye = this.crouched ? P.crouchEyeHeight : P.eyeHeight;
    this.eyeHeight += (targetEye - this.eyeHeight) * (1 - Math.exp(-P.crouchLerp * dt));

    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.onGround) this.stepPhase += (hSpeed * dt * Math.PI) / (P.strideBase + P.strideFactor * hSpeed);
    const targetBob = this.onGround ? Math.min(hSpeed / P.runSpeed, 1) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * (1 - Math.exp(-8 * dt));
    const bobY = Math.sin(this.stepPhase * 2) * P.bobHeight * this.bobAmount;
    const bobX = Math.sin(this.stepPhase) * P.bobSway * this.bobAmount;

    this.camera.position.set(
      this.position.x + cosY * bobX,
      this.position.y + this.eyeHeight + bobY,
      this.position.z - sinY * bobX,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private key(a: string, b: string): boolean {
    return this.input.isDown(a) || this.input.isDown(b);
  }
}
