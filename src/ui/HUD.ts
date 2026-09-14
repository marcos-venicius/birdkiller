import { CONFIG } from '../config';
import { guideHtml } from './Guide';
import type { JournalView } from './Journal';

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
/** Tracinhos da luneta: distância (m), meia-largura (unidades da SVG), rótulo e de que lado ele fica. */
const BDC_MARKS = [
  { d: 200, w: 2.2, label: '2', side: 1 },
  { d: 300, w: 3.2, label: '3', side: -1 },
  { d: 400, w: 4.2, label: '4', side: 1 },
];

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
  private readonly noteEl: HTMLElement;
  private readonly journalEl: HTMLElement;
  private readonly guideEl: HTMLElement;
  private readonly bdcEl: SVGGElement;
  private readonly dogEl: HTMLElement;
  private readonly kindEl: HTMLElement;
  private readonly tagEls: HTMLElement[] = [];
  private readonly reserveEl: HTMLElement;
  private readonly toolEl: HTMLElement;
  private readonly woodBoxEl: HTMLElement;
  private readonly woodEl: HTMLElement;
  private readonly actionEl: HTMLElement;
  private wood = -1;
  private action: string | null = null;
  private readonly tipEl: HTMLElement;
  private readonly rangeEl: HTMLElement;
  private readonly irEl: HTMLElement;
  private readonly compassEl: HTMLElement;
  private readonly dirEls: HTMLElement[] = [];
  private readonly markEls: HTMLElement[] = [];
  /** Marcadores de direção: um na fita da bússola e um no mundo (quando o ponto está na tela). */
  private readonly pinEls: HTMLElement[] = [];
  private readonly worldPinEls: HTMLElement[] = [];
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
            <path d="M -1.3 50 L 1.3 50 L 1.3 9.5 L 0 6.5 L -1.3 9.5 Z" />
            <rect x="-0.08" y="-50" width="0.16" height="46" />
            <circle r="0.22" />
            <g data-bdc></g>
          </g>
        </svg>
      </div>
      <div class="hud-flash"></div>
      <div class="hud-score">
        <span class="label">Pontos</span><span data-score>0</span>
        <span class="label kills">Abates</span><span data-kills>0</span>
        <span class="wood" hidden><span class="label">Madeira</span><span data-wood>0</span></span>
      </div>
      <div class="hud-crosshair"></div>
      <div class="hud-action" hidden></div>
      <div class="hud-kill"></div>
      <div class="hud-note"></div>
      <div class="hud-journal" hidden></div>
      <div class="hud-guide" hidden></div>
      <div class="hud-tip"></div>
      <div class="hud-reload" hidden>Recarregando...</div>
      <div class="hud-ammo"><span class="kind" hidden></span><span data-ammo>0</span><span class="reserve">/ ∞</span><span class="tool" hidden></span></div>
      <div class="hud-hint">
        Clique para controlar
        <small>WASD anda · botão direito liga a luneta · botão esquerdo atira · <kbd>−</kbd> <kbd>=</kbd> sensibilidade do mouse · <kbd>H</kbd> guia de campo com todos os controles e o que procurar</small>
      </div>
      <div class="hud-range" hidden></div>
      <div class="hud-ir" hidden>IV</div>
      <div class="hud-compass" hidden></div>
      <div class="hud-debug" hidden></div>
    `;
    this.scoreEl = root.querySelector('[data-score]')!;
    this.killsEl = root.querySelector('[data-kills]')!;
    this.killEl = root.querySelector('.hud-kill')!;
    this.ammoEl = root.querySelector('[data-ammo]')!;
    this.kindEl = root.querySelector('.hud-ammo .kind')!;
    this.reserveEl = root.querySelector('.hud-ammo .reserve')!;
    this.toolEl = root.querySelector('.hud-ammo .tool')!;
    this.woodBoxEl = root.querySelector('.hud-score .wood')!;
    this.woodEl = root.querySelector('[data-wood]')!;
    this.actionEl = root.querySelector('.hud-action')!;
    this.reloadEl = root.querySelector('.hud-reload')!;
    this.hintEl = root.querySelector('.hud-hint')!;
    this.debugEl = root.querySelector('.hud-debug')!;
    this.crosshairEl = root.querySelector('.hud-crosshair')!;
    this.scopeEl = root.querySelector('.hud-scope')!;
    this.bdcEl = root.querySelector('.hud-scope [data-bdc]')!;
    this.layoutReticle();
    window.addEventListener('resize', () => this.layoutReticle());
    this.flashEl = root.querySelector('.hud-flash')!;
    this.noteEl = root.querySelector('.hud-note')!;
    this.journalEl = root.querySelector('.hud-journal')!;
    this.guideEl = root.querySelector('.hud-guide')!;
    this.tipEl = root.querySelector('.hud-tip')!;
    this.rangeEl = root.querySelector('.hud-range')!;
    this.irEl = root.querySelector('.hud-ir')!;
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
    for (let i = 0; i < CONFIG.markers.max; i++) {
      const el = document.createElement('span');
      el.className = 'pin';
      el.innerHTML = '<b></b> <i></i>';
      this.compassEl.append(el);
      this.pinEls.push(el);

      const world = document.createElement('div');
      world.className = 'hud-pin';
      world.hidden = true;
      world.innerHTML = '<b>◆</b><span></span><i></i>';
      root.append(world);
      this.worldPinEls.push(world);
    }
    this.dogEl = document.createElement('span');
    this.dogEl.className = 'pin dog';
    this.dogEl.innerHTML = '<b>cão</b> <i></i>';
    this.compassEl.append(this.dogEl);
    for (let i = 0; i < CONFIG.tracker.maxTagged; i++) {
      const el = document.createElement('span');
      el.className = 'pin tag';
      el.innerHTML = '<b></b> <i></i>';
      this.compassEl.append(el);
      this.tagEls.push(el);
    }
  }

  /**
   * Tracinhos de compensação da queda da bala abaixo do centro da luneta. Zerada em 100 m, a bala passa
   * g·(d − zero)/(2v²) radianos abaixo da linha da mira a d metros; a posição na tela depende do campo de
   * visão da luneta e de quanto a SVG ocupa (93vmin de 100 unidades), então é refeita ao redimensionar.
   */
  private layoutReticle(): void {
    const C = CONFIG.combat;
    const k = C.gravity / (2 * C.muzzleVelocity * C.muzzleVelocity);
    const tanHalf = Math.tan((CONFIG.weapon.scopeFov * Math.PI) / 360);
    const unitPx = (0.93 * Math.min(window.innerWidth, window.innerHeight)) / 100;
    const scale = window.innerHeight / 2 / tanHalf / unitPx;
    this.bdcEl.innerHTML = BDC_MARKS.map(({ d, w, label, side }) => {
      const y = Math.tan(k * (d - C.zeroDistance)) * scale;
      const tx = side > 0 ? w + 0.7 : -w - 0.7;
      return (
        `<rect x="${-w}" y="${(y - 0.13).toFixed(3)}" width="${2 * w}" height="0.26" />` +
        `<text x="${tx}" y="${(y + 0.5).toFixed(3)}" font-size="1.45" text-anchor="${side > 0 ? 'start' : 'end'}">${label}</text>`
      );
    }).join('');
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

  /** Segunda linha, logo abaixo do aviso de abate: novidades do caderno de campo. */
  note(text: string): void {
    const el = this.noteEl;
    el.textContent = text;
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity 1s ease-in 2.6s';
    el.style.opacity = '0';
  }

  /** Dica na hora certa: embaixo, no centro, some sozinha depois de alguns segundos. */
  tip(text: string): void {
    const el = this.tipEl;
    el.textContent = text;
    el.style.transition = 'none';
    el.style.opacity = '1';
    void el.offsetWidth;
    el.style.transition = 'opacity 1.2s ease-in 7s';
    el.style.opacity = '0';
  }

  /** Guia de campo (tecla H). */
  setGuideVisible(visible: boolean): void {
    if (visible && !this.guideEl.innerHTML) this.guideEl.innerHTML = guideHtml();
    this.guideEl.hidden = !visible;
  }

  /** Painel do caderno de campo (Tab segurado). */
  showJournal(v: JournalView, world = ''): void {
    const rows = v.rows
      .map((r) => `<tr class="${r.seen ? '' : 'unseen'}"><td>${r.name}</td><td>${r.seen ? r.kills : ''}</td><td>${r.seen ? r.longest : ''}</td></tr>`)
      .join('');
    const pairs = (list: [string, string][]) => list.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('');
    this.journalEl.innerHTML = `
      <h2>Caderno de campo</h2>
      <div class="cols">
        <section>
          <h3>Espécies</h3>
          <table><thead><tr><th></th><th>abates</th><th>mais longe</th></tr></thead><tbody>${rows}</tbody></table>
        </section>
        <section>
          <h3>Recordes</h3><dl>${pairs(v.records)}</dl>
          <h3>Lugares</h3><dl>${pairs(v.places)}</dl>
          <h3>Totais</h3><dl>${pairs(v.totals)}</dl>
        </section>
      </div>
      <footer>${v.seen} de ${v.total} espécies avistadas${world ? ` · ${world}` : ''}</footer>`;
    this.journalEl.hidden = false;
  }

  hideJournal(): void {
    this.journalEl.hidden = true;
  }

  /** Madeira juntada (aparece quando há alguma, ou com o machado na mão). */
  setWood(wood: number, visible: boolean): void {
    if (wood !== this.wood) {
      this.wood = wood;
      this.woodEl.textContent = String(wood);
    }
    if (visible === this.woodBoxEl.hidden) this.woodBoxEl.hidden = !visible;
  }

  /** Ação possível logo abaixo do retículo ("E recolher madeira (+9)"); null esconde. */
  setAction(text: string | null): void {
    if (text === this.action) return;
    this.action = text;
    this.actionEl.textContent = text ?? '';
    this.actionEl.hidden = text === null;
  }

  /** Ferramenta na mão no lugar da munição (null = rifle, volta a mostrar a munição). */
  setTool(name: string | null): void {
    this.toolEl.textContent = name ?? '';
    this.toolEl.hidden = name === null;
    this.ammoEl.hidden = name !== null;
    this.reserveEl.hidden = name !== null;
  }

  /** Rótulo da arma junto da munição ("Rastreio"); null esconde (rifle comum). */
  setWeaponLabel(text: string | null): void {
    this.kindEl.textContent = text ?? '';
    this.kindEl.hidden = text === null;
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
    // O telêmetro é da luneta: sai junto com ela, sem esperar a próxima medida.
    if (!scoped) this.setRange(null);
    this.showCompass();
  }

  /** Telêmetro da luneta: distância até o que está na mira (null esconde). */
  setRange(meters: number | null): void {
    if (meters === null) {
      this.rangeEl.hidden = true;
      return;
    }
    this.rangeEl.hidden = false;
    this.rangeEl.textContent = `${Math.round(meters)} m`;
  }

  /** Marca "IV" enquanto a luneta está no modo infravermelho. */
  setInfrared(on: boolean): void {
    if (this.irEl.hidden === on) this.irEl.hidden = !on;
  }

  /**
   * Marcadores no mundo: `x`, `y` em pixels da tela (o losango fica centrado no ponto marcado).
   * Os que não vierem na lista ficam escondidos (fora da tela ou atrás da câmera).
   */
  setWorldPins(pins: readonly { n: number; x: number; y: number; distance: number }[]): void {
    for (let i = 0; i < this.worldPinEls.length; i++) {
      const el = this.worldPinEls[i];
      const pin = pins[i];
      if (!pin) {
        if (!el.hidden) el.hidden = true;
        continue;
      }
      el.hidden = false;
      el.style.transform = `translate(${(pin.x - 6).toFixed(1)}px, ${pin.y.toFixed(1)}px) translateY(-50%)`;
      el.querySelector('span')!.textContent = String(pin.n);
      el.querySelector('i')!.textContent = `${Math.round(pin.distance)} m`;
    }
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
  setCompass(
    heading: number,
    marks: readonly { bearing: number; distance: number }[],
    pins: readonly { n: number; bearing: number; distance: number }[] = [],
    dog: { bearing: number; distance: number } | null = null,
    tags: readonly { bearing: number; distance: number; label: string }[] = [],
  ): void {
    if (this.compassEl.hidden) return;
    for (let i = 0; i < this.pinEls.length; i++) {
      const el = this.pinEls[i];
      const pin = pins[i];
      if (!pin) {
        el.style.opacity = '0';
        continue;
      }
      this.place(el, wrapDeg(pin.bearing - heading), 1);
      el.querySelector('b')!.textContent = `◆${pin.n}`;
      el.querySelector('i')!.textContent = `${Math.round(pin.distance)} m`;
    }
    // O cão, quando está longe o bastante para sumir no mato.
    if (dog) {
      this.place(this.dogEl, wrapDeg(dog.bearing - heading), 1);
      this.dogEl.querySelector('i')!.textContent = `${Math.round(dog.distance)} m`;
    } else {
      this.dogEl.style.opacity = '0';
    }
    // Bichos marcados pelo rastreio.
    for (let i = 0; i < this.tagEls.length; i++) {
      const el = this.tagEls[i];
      const tag = tags[i];
      if (!tag) {
        el.style.opacity = '0';
        continue;
      }
      this.place(el, wrapDeg(tag.bearing - heading), 1);
      el.querySelector('b')!.textContent = `⌖ ${tag.label}`;
      el.querySelector('i')!.textContent = `${Math.round(tag.distance)} m`;
    }
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
