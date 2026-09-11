/** HUD mínima em DOM: pontuação, munição, retículo, recarga e dica de controle. */
export class HUD {
  private readonly scoreEl: HTMLElement;
  private readonly ammoEl: HTMLElement;
  private readonly reloadEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly debugEl: HTMLElement;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-score"><span class="label">Pontos</span><span data-score>0</span></div>
      <div class="hud-crosshair"></div>
      <div class="hud-reload" hidden>Recarregando...</div>
      <div class="hud-ammo"><span data-ammo>0</span><span class="reserve">/ ∞</span></div>
      <div class="hud-hint">
        Clique para controlar
        <small>WASD mover · Shift correr · C agachar · Espaço pular · Esc soltar o mouse</small>
      </div>
      <div class="hud-debug" hidden></div>
    `;
    this.scoreEl = root.querySelector('[data-score]')!;
    this.ammoEl = root.querySelector('[data-ammo]')!;
    this.reloadEl = root.querySelector('.hud-reload')!;
    this.hintEl = root.querySelector('.hud-hint')!;
    this.debugEl = root.querySelector('.hud-debug')!;
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

  setDebug(text: string | null): void {
    this.debugEl.hidden = text === null;
    if (text !== null) this.debugEl.textContent = text;
  }
}
