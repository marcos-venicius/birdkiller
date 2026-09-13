/** Graus visíveis para cada lado do centro da fita da bússola. */
const COMPASS_SPAN = 62;
/** Pixels por grau na fita. */
const COMPASS_PX = 2;
/** Quantos lagos a fita marca ao mesmo tempo. */
const COMPASS_MARKS = 3;
const CARDINALS: [string, number][] = [
  ['N', 0],
  ['NE', 45],
  ['L', 90],
  ['SE', 135],
  ['S', 180],
  ['SO', 225],
  ['O', 270],
  ['NO', 315],
];

/** Diferença angular em graus, normalizada para (-180, 180]. */
function wrapDeg(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}

/** HUD mínima em DOM: pontuação, munição, retículo, luneta, recarga, bússola e dica de controle. */
export class HUD {
  private readonly scoreEl: HTMLElement;
  private readonly killsEl: HTMLElement;
  private readonly killEl: HTMLElement;
  private readonly ammoEl: HTMLElement;
  private readonly reloadEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly debugEl: HTMLElement;
  private readonly crosshairEl: HTMLElement;
  private readonly scopeEl: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly compassEl: HTMLElement;
  private readonly dirEls: HTMLElement[] = [];
  private readonly markEls: HTMLElement[] = [];
  private compassOn = false;
  private scoped = false;

  constructor(root: HTMLElement) {
    // Retículo da luneta no estilo alemão: barras laterais grossas e poste inferior pontudo.
    // O centro fica aberto (o poste termina logo abaixo) para não cobrir pássaros pequenos;
    // o ponto minúsculo marca exatamente para onde vai o tiro.
    root.innerHTML = `
      <div class="hud-vignette"></div>
      <div class="hud-scope" hidden>
        <svg viewBox="-50 -50 100 100" aria-hidden="true">
          <g fill="#060606" stroke="rgba(255,240,220,0.25)" stroke-width="0.12">
            <rect x="-50" y="-0.45" width="44" height="0.9" />
            <rect x="6" y="-0.45" width="44" height="0.9" />
            <path d="M -1.3 50 L 1.3 50 L 1.3 5.5 L 0 2.5 L -1.3 5.5 Z" />
            <rect x="-0.08" y="-50" width="0.16" height="46" />
            <circle r="0.22" />
          </g>
        </svg>
      </div>
      <div class="hud-flash"></div>
      <div class="hud-score">
        <span class="label">Pontos</span><span data-score>0</span>
        <span class="label kills">Abates</span><span data-kills>0</span>
      </div>
      <div class="hud-crosshair"></div>
      <div class="hud-kill"></div>
      <div class="hud-reload" hidden>Recarregando...</div>
      <div class="hud-ammo"><span data-ammo>0</span><span class="reserve">/ ∞</span></div>
      <div class="hud-hint">
        Clique para controlar
        <small>WASD mover · Shift correr · C agachar · Espaço pular · Botão direito mira (liga/desliga) · Botão esquerdo atirar · R recarregar · M música · L bússola · Esc soltar o mouse</small>
      </div>
      <div class="hud-compass" hidden></div>
      <div class="hud-debug" hidden></div>
    `;
    this.scoreEl = root.querySelector('[data-score]')!;
    this.killsEl = root.querySelector('[data-kills]')!;
    this.killEl = root.querySelector('.hud-kill')!;
    this.ammoEl = root.querySelector('[data-ammo]')!;
    this.reloadEl = root.querySelector('.hud-reload')!;
    this.hintEl = root.querySelector('.hud-hint')!;
    this.debugEl = root.querySelector('.hud-debug')!;
    this.crosshairEl = root.querySelector('.hud-crosshair')!;
    this.scopeEl = root.querySelector('.hud-scope')!;
    this.flashEl = root.querySelector('.hud-flash')!;
    this.compassEl = root.querySelector('.hud-compass')!;
    for (const [name] of CARDINALS) {
      const el = document.createElement('span');
      el.className = 'dir';
      el.textContent = name;
      this.compassEl.append(el);
      this.dirEls.push(el);
    }
    for (let i = 0; i < COMPASS_MARKS; i++) {
      const el = document.createElement('span');
      el.className = 'mark';
      el.innerHTML = '<b>≈</b> <i></i>';
      this.compassEl.append(el);
      this.markEls.push(el);
    }
  }

  setScore(score: number, kills: number): void {
    this.scoreEl.textContent = String(score);
    this.killsEl.textContent = String(kills);
  }

  /** Aviso discreto acima do retículo (abate, música ligada/desligada...) que some sozinho. */
  toast(text: string): void {
    const el = this.killEl;
    el.textContent = text;
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity 0.8s ease-in 1.4s';
    el.style.opacity = '0';
  }

  setAmmo(inMagazine: number): void {
    this.ammoEl.textContent = String(inMagazine);
  }

  setReloading(reloading: boolean): void {
    this.reloadEl.hidden = !reloading;
  }

  setHintVisible(visible: boolean): void {
    this.hintEl.hidden = !visible;
  }

  setScoped(scoped: boolean): void {
    this.scopeEl.hidden = !scoped;
    this.scoped = scoped;
    this.showCompass();
  }

  /** Liga/desliga a fita da bússola (tecla L). */
  setCompassEnabled(on: boolean): void {
    this.compassOn = on;
    this.showCompass();
  }

  /**
   * Atualiza a fita: `heading` em graus (0 = norte, 90 = leste) e a água por perto,
   * cada marca com o rumo em graus e a distância em metros.
   */
  setCompass(heading: number, marks: readonly { bearing: number; distance: number }[]): void {
    if (this.compassEl.hidden) return;
    for (let i = 0; i < CARDINALS.length; i++) this.place(this.dirEls[i], wrapDeg(CARDINALS[i][1] - heading), 1);
    for (let i = 0; i < this.markEls.length; i++) {
      const el = this.markEls[i];
      const mark = marks[i];
      if (!mark) {
        el.style.opacity = '0';
        continue;
      }
      // Mais perto = mais sólido.
      this.place(el, wrapDeg(mark.bearing - heading), 0.45 + 0.55 * Math.max(0, 1 - mark.distance / 600));
      el.querySelector('i')!.textContent = `${Math.round(mark.distance)} m`;
    }
  }

  private place(el: HTMLElement, rel: number, strength: number): void {
    const t = Math.abs(rel) / COMPASS_SPAN;
    if (t >= 1) {
      el.style.opacity = '0';
      return;
    }
    el.style.transform = `translateX(${(rel * COMPASS_PX).toFixed(1)}px)`;
    // Some nas pontas da fita, sem borda dura.
    el.style.opacity = String(strength * (1 - t * t * t));
  }

  private showCompass(): void {
    this.compassEl.hidden = !this.compassOn || this.scoped;
  }

  setCrosshairVisible(visible: boolean): void {
    if (this.crosshairEl.hidden === visible) this.crosshairEl.hidden = !visible;
  }

  /** Clarão rápido na tela — o disparo visto pela luneta, onde o cano não aparece. */
  flash(): void {
    const el = this.flashEl;
    el.style.transition = 'none';
    el.style.opacity = '0.28';
    void el.offsetWidth;
    el.style.transition = 'opacity 0.18s ease-out';
    el.style.opacity = '0';
  }

  setDebug(text: string | null): void {
    this.debugEl.hidden = text === null;
    if (text !== null) this.debugEl.textContent = text;
  }
}
