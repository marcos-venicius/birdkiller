import * as THREE from 'three';
import { CONFIG } from '../config';

/** Um marcador: um ponto do mundo com um número (1..max) para o jogador reconhecer. */
export interface Marker {
  n: number;
  pos: THREE.Vector3;
}

const _to = new THREE.Vector3();

/**
 * Marcadores de direção (tecla Q): o jogador marca o ponto para onde está olhando — o bicho
 * que viu, a borda de uma clareira — e vai conferir outra coisa sem perder o rumo. Guardam o
 * ponto, não só o rumo, então rumo e distância continuam certos enquanto ele anda. Só valem
 * para a sessão (são do lugar onde ele está agora). Sem DOM: quem desenha é o HUD.
 */
export class Markers {
  readonly list: Marker[] = [];

  /**
   * Olhando para um marcador (a até `removeAngle` graus da mira), apaga ele; senão cria um novo
   * em `target`. Passando do máximo, o mais antigo sai.
   */
  toggle(eye: THREE.Vector3, dir: THREE.Vector3, target: THREE.Vector3): { action: 'added' | 'removed'; n: number } {
    const C = CONFIG.markers;
    const cos = Math.cos(THREE.MathUtils.degToRad(C.removeAngle));
    let best = -1;
    let bestDot = cos;
    for (let i = 0; i < this.list.length; i++) {
      const d = _to.subVectors(this.list[i].pos, eye).normalize().dot(dir);
      if (d > bestDot) {
        bestDot = d;
        best = i;
      }
    }
    if (best >= 0) {
      const [m] = this.list.splice(best, 1);
      return { action: 'removed', n: m.n };
    }
    if (this.list.length >= C.max) this.list.shift();
    const n = this.freeNumber();
    this.list.push({ n, pos: target.clone() });
    return { action: 'added', n };
  }

  clear(): void {
    this.list.length = 0;
  }

  /** Menor número livre: os marcadores reaproveitam 1, 2, 3 em vez de crescer sem fim. */
  private freeNumber(): number {
    for (let n = 1; n <= CONFIG.markers.max; n++) if (!this.list.some((m) => m.n === n)) return n;
    return 1;
  }
}
