/** HUD mínima em DOM: pontuação, munição, retículo, luneta, recarga e dica de controle. */
export class HUD {
  private readonly scoreEl: HTMLElement;
  private readonly ammoEl: HTMLElement;
  private readonly reloadEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly debugEl: HTMLElement;
  private readonly crosshairEl: HTMLElement;
  private readonly scopeEl: HTMLElement;
  private readonly flashEl: HTMLElement;

  constructor(root: HTMLElement) {
    // Retículo da luneta no estilo alemão: barras laterais grossas e poste inferior pontudo.
    root.innerHTML = `
      <div class="hud-scope" hidden>
        <svg viewBox="-50 -50 100 100" aria-hidden="true">
          <g fill="#060606" stroke="rgba(255,240,220,0.25)" stroke-width="0.12">
            <rect x="-50" y="-0.45" width="44" height="0.9" />
            <rect x="6" y="-0.45" width="44" height="0.9" />
            <path d="M -1.3 50 L 1.3 50 L 1.3 3.5 L 0 0 L -1.3 3.5 Z" />
            <rect x="-0.08" y="-50" width="0.16" height="46" />
          </g>
        </svg>
      </div>
      <div class="hud-flash"></div>
      <div class="hud-score"><span class="label">Pontos</span><span data-score>0</span></div>
      <div class="hud-crosshair"></div>
      <div class="hud-reload" hidden>Recarregando...</div>
      <div class="hud-ammo"><span data-ammo>0</span><span class="reserve">/ ∞</span></div>
      <div class="hud-hint">
        Clique para controlar
        <small>WASD mover · Shift correr · C agachar · Espaço pular · Botão direito mirar · Botão esquerdo atirar · Esc soltar o mouse</small>
      </div>
      <div class="hud-debug" hidden></div>
    `;
    this.scoreEl = root.querySelector('[data-score]')!;
    this.ammoEl = root.querySelector('[data-ammo]')!;
    this.reloadEl = root.querySelector('.hud-reload')!;
    this.hintEl = root.querySelector('.hud-hint')!;
    this.debugEl = root.querySelector('.hud-debug')!;
    this.crosshairEl = root.querySelector('.hud-crosshair')!;
    this.scopeEl = root.querySelector('.hud-scope')!;
    this.flashEl = root.querySelector('.hud-flash')!;
  }

  setScore(score: number): void {
    this.scoreEl.textContent = String(score);
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
