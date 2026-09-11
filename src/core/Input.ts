/** Teclas que o jogo usa — evitamos o comportamento padrão do navegador para elas. */
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'Space',
  'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

/** Ignora picos espúrios de movementX/Y que alguns navegadores emitem com pointer lock. */
const MAX_MOUSE_DELTA = 400;

/** Teclado, mouse e pointer lock. Estado "pressionado neste quadro" é limpo em endFrame(). */
export class Input {
  locked = false;
  onLockChange?: (locked: boolean) => void;

  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private buttons = 0;
  private buttonsPressed = 0;
  private dx = 0;
  private dy = 0;

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code) && !e.ctrlKey && !e.metaKey) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.reset());

    el.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        this.requestLock();
        return;
      }
      this.buttons |= 1 << e.button;
      this.buttonsPressed |= 1 << e.button;
    });
    window.addEventListener('mouseup', (e) => {
      this.buttons &= ~(1 << e.button);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (Math.abs(e.movementX) > MAX_MOUSE_DELTA || Math.abs(e.movementY) > MAX_MOUSE_DELTA) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.reset();
      this.onLockChange?.(this.locked);
    });
  }

  requestLock(): void {
    try {
      // unadjustedMovement = movimento cru do mouse (sem aceleração do SO), quando suportado.
      const p = this.el.requestPointerLock({ unadjustedMovement: true }) as Promise<void> | undefined;
      p?.catch(() => this.el.requestPointerLock());
    } catch {
      this.el.requestPointerLock();
    }
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** button: 0 = esquerdo, 2 = direito. */
  isMouseDown(button: number): boolean {
    return (this.buttons & (1 << button)) !== 0;
  }

  wasMousePressed(button: number): boolean {
    return (this.buttonsPressed & (1 << button)) !== 0;
  }

  /** Retorna e zera o movimento acumulado do mouse desde a última chamada. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const d = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return d;
  }

  endFrame(): void {
    this.pressed.clear();
    this.buttonsPressed = 0;
  }

  private reset(): void {
    this.down.clear();
    this.pressed.clear();
    this.buttons = 0;
    this.buttonsPressed = 0;
    this.dx = 0;
    this.dy = 0;
  }
}
