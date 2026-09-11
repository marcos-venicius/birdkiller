import * as THREE from 'three';
import { CONFIG } from '../config';

/** Grupos de volume (ajustados em CONFIG.audio.buses). */
export type Bus = 'sfx' | 'ambience' | 'birds' | 'steps' | 'music';

export interface FilterOptions {
  type: BiquadFilterType;
  freq: number;
  q?: number;
}

interface Routing {
  /** Quanto enviar direto para a reverberação (0..1) — só vale para sons sem `dest`. */
  reverb?: number;
  /** Grupo de volume (padrão: sfx). */
  bus?: Bus;
  /** Destino (ex.: um ponto espacial criado por spatial()); substitui o bus. */
  dest?: AudioNode | null;
}

/** Rajada de ruído filtrado. Tempos em segundos, relativos a "agora". */
export interface NoiseOptions extends Routing {
  at?: number;
  duration: number;
  type: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  gain: number;
  attack?: number;
}

/** Tom de oscilador com envelope percussivo (e filtro opcional). */
export interface ToneOptions extends Routing {
  at?: number;
  duration: number;
  freq: number;
  freqEnd?: number;
  type?: OscillatorType;
  gain: number;
  attack?: number;
  filter?: FilterOptions;
}

/** Nota musical com envelope ADSR, desafinação (dois osciladores), vibrato e filtro opcionais. */
export interface VoiceOptions extends Routing {
  at?: number;
  freq: number;
  /** Tempo até soltar a nota (s); depois vem o release. */
  duration: number;
  attack: number;
  release: number;
  gain: number;
  type?: OscillatorType;
  /** Nível mantido após o ataque (fração do gain) e constante de tempo do decaimento até ele. */
  sustain?: number;
  decay?: number;
  /** Desafinação ± em cents (usa dois osciladores — encorpa cordas/pads). */
  detune?: number;
  /** Vibrato: frequência (Hz) e profundidade (cents), entrando aos poucos. */
  vibrato?: { rate: number; depth: number };
  filter?: FilterOptions;
}

/** Ruído filtrado em loop contínuo; ajuste os parâmetros com setTargetAtTime. */
export interface NoiseLoop {
  gain: AudioParam;
  freq: AudioParam;
  pan: AudioParam;
}

/** Ruído branco (tocado a partir de offsets aleatórios). */
function makeNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Resposta ao impulso de uma floresta: reflexões iniciais esparsas + cauda que escurece com o tempo. */
function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const k = 0.9 - 0.8 * t; // passa-baixa cada vez mais forte: agudos morrem antes
      lp += k * (Math.random() * 2 - 1 - lp);
      data[i] = lp * Math.pow(1 - t, 2.5) * 0.6;
    }
    for (let r = 0; r < 6; r++) {
      const at = Math.floor(ctx.sampleRate * (0.03 + Math.random() * 0.12));
      data[at] += (Math.random() < 0.5 ? -1 : 1) * (0.5 - r * 0.06);
    }
  }
  return buf;
}

const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();

/**
 * Áudio 100% sintetizado (WebAudio). O navegador só permite tocar depois de um gesto do
 * usuário, então o AudioContext é criado/retomado em unlock() — chamado no primeiro clique/tecla.
 * Sem contexto, todas as funções de som simplesmente não fazem nada.
 */
export class AudioSystem {
  private ctx: BaseAudioContext | null = null;
  private live: AudioContext | null = null;
  private buses!: Record<Bus, GainNode>;
  private reverbSend!: GainNode;
  private analyser: AnalyserNode | null = null;
  private noise!: AudioBuffer;
  private loopNoise!: AudioBuffer;
  private readonly listener = new THREE.Vector3();
  /** Volumes atuais dos grupos (sobrevivem à troca de contexto nos testes offline). */
  private readonly volumes: Record<Bus, number> = { ...CONFIG.audio.buses };

  /** Contexto real ativo e tocando. */
  get ready(): boolean {
    return this.live !== null && this.ctx === this.live && this.live.state === 'running';
  }

  /** Relógio do áudio (s). */
  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  unlock(): void {
    if (!this.live) {
      this.live = new AudioContext();
      this.build(this.live);
      // Aba em segundo plano: pausa o áudio (economiza CPU e evita sons "presos").
      document.addEventListener('visibilitychange', () => {
        if (!this.live) return;
        if (document.hidden) void this.live.suspend();
        else void this.live.resume();
      });
    }
    if (this.live.state === 'suspended' && !document.hidden) void this.live.resume();
  }

  /** Muda o volume de um grupo com transição suave (s). */
  setBusGain(bus: Bus, value: number, fade = 0.5): void {
    this.volumes[bus] = value;
    if (!this.ctx) return;
    this.buses[bus].gain.setTargetAtTime(value, this.ctx.currentTime, Math.max(fade / 3, 0.001));
  }

  /** Coloca o ouvinte na câmera (posição e orientação). */
  updateListener(camera: THREE.Camera): void {
    const ctx = this.ctx;
    if (!ctx) return;
    camera.getWorldDirection(_fwd);
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const p = camera.position;
    this.listener.copy(p);
    const l = ctx.listener;
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = p.z;
      l.forwardX.value = _fwd.x;
      l.forwardY.value = _fwd.y;
      l.forwardZ.value = _fwd.z;
      l.upX.value = _up.x;
      l.upY.value = _up.y;
      l.upZ.value = _up.z;
    } else {
      // Navegadores sem AudioParams no listener.
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(_fwd.x, _fwd.y, _fwd.z, _up.x, _up.y, _up.z);
    }
  }

  /**
   * Ponto de som no mundo (HRTF + atenuação por distância). Quanto mais longe, maior a parte
   * do som que chega pela reverberação da mata. Conecte rajadas/tons nele via `dest`.
   */
  spatial(pos: THREE.Vector3, bus: Bus = 'sfx', ref = 5): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1;
    p.maxDistance = 10000;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(this.buses[bus]);
    const send = ctx.createGain();
    send.gain.value = Math.min(0.9, 0.1 + pos.distanceTo(this.listener) / 80);
    p.connect(send).connect(this.reverbSend);
    return p;
  }

  noiseBurst(o: NoiseOptions): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.Q.value = o.q ?? 0.7;
    filter.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) filter.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.duration);
    const env = this.envelope(t, o.gain, o.attack ?? 0.002, o.duration);
    src.connect(filter).connect(env);
    this.route(env, o);
    const offset = Math.random() * Math.max(0, this.noise.duration - o.duration - 0.1);
    src.start(t, offset, o.duration + 0.05);
  }

  tone(o: ToneOptions): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.duration);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = this.filter(o.filter);
      osc.connect(f);
      node = f;
    }
    const env = this.envelope(t, o.gain, o.attack ?? 0.002, o.duration);
    node.connect(env);
    this.route(env, o);
    osc.start(t);
    osc.stop(t + o.duration + 0.05);
  }

  voice(o: VoiceOptions): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const tRelease = t0 + Math.max(o.duration, o.attack);
    const end = tRelease + o.release * 1.3;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(o.gain, t0 + o.attack);
    if (o.sustain !== undefined && o.sustain < 1) env.gain.setTargetAtTime(o.gain * o.sustain, t0 + o.attack, o.decay ?? 0.3);
    env.gain.setTargetAtTime(0, tRelease, o.release / 4);

    let input: AudioNode = env;
    if (o.filter) {
      const f = this.filter(o.filter);
      f.connect(env);
      input = f;
    }
    let vibrato: GainNode | null = null;
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = o.vibrato.rate;
      vibrato = ctx.createGain();
      vibrato.gain.setValueAtTime(0, t0);
      vibrato.gain.linearRampToValueAtTime(o.vibrato.depth, t0 + 0.35);
      lfo.connect(vibrato);
      lfo.start(t0);
      lfo.stop(end);
    }
    for (const cents of o.detune ? [-o.detune, o.detune] : [0]) {
      const osc = ctx.createOscillator();
      osc.type = o.type ?? 'sine';
      osc.frequency.value = o.freq;
      osc.detune.value = cents;
      if (vibrato) vibrato.connect(osc.detune);
      osc.connect(input);
      osc.start(t0);
      osc.stop(end);
    }
    this.route(env, o);
  }

  /** Ruído filtrado em loop (vento, folhas). Começa mudo. */
  loop(type: BiquadFilterType, freq: number, q: number, bus: Bus, pan = 0): NoiseLoop | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const src = ctx.createBufferSource();
    src.buffer = this.loopNoise;
    src.loop = true;
    const filter = this.filter({ type, freq, q });
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    src.connect(filter).connect(gain).connect(panner).connect(this.buses[bus]);
    src.start(ctx.currentTime, Math.random() * this.loopNoise.duration);
    return { gain: gain.gain, freq: filter.frequency, pan: panner.pan };
  }

  /** Pico e RMS da saída neste instante (testes/depuração). */
  level(): { peak: number; rms: number } {
    if (!this.analyser) return { peak: 0, rms: 0 };
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    let sum = 0;
    for (const v of buf) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    return { peak, rms: Math.sqrt(sum / buf.length) };
  }

  /**
   * Testes: renderiza offline (sem alto-falante) o que `fn` agendar e devolve pico, RMS e se
   * apareceu algum valor inválido. O contexto real fica intacto.
   */
  async debugRender(seconds: number, fn: (a: AudioSystem) => void): Promise<{ peak: number; rms: number; invalid: boolean }> {
    const saved = {
      ctx: this.ctx,
      buses: this.buses,
      reverbSend: this.reverbSend,
      analyser: this.analyser,
      noise: this.noise,
      loopNoise: this.loopNoise,
    };
    const off = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
    this.build(off);
    try {
      fn(this);
      const buf = await off.startRendering();
      let peak = 0;
      let sum = 0;
      let n = 0;
      let invalid = false;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        for (const v of buf.getChannelData(ch)) {
          if (!Number.isFinite(v)) {
            invalid = true;
            continue;
          }
          peak = Math.max(peak, Math.abs(v));
          sum += v * v;
          n++;
        }
      }
      return { peak, rms: Math.sqrt(sum / Math.max(n, 1)), invalid };
    } finally {
      Object.assign(this, saved);
    }
  }

  private build(ctx: BaseAudioContext): void {
    this.ctx = ctx;

    // Compressor no fim da cadeia: segura o pico do disparo sem abafar o ambiente.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    const master = ctx.createGain();
    master.gain.value = CONFIG.audio.master;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    master.connect(comp).connect(this.analyser).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(reverb).connect(wet).connect(master);

    const bus = (name: Bus) => {
      const g = ctx.createGain();
      g.gain.value = this.volumes[name];
      g.connect(master);
      return g;
    };
    this.buses = { sfx: bus('sfx'), ambience: bus('ambience'), birds: bus('birds'), steps: bus('steps'), music: bus('music') };

    // Música: eco suave (delay com realimentação abafada) e um pouco do reverb da mata.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.42;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const damp = this.filter({ type: 'lowpass', freq: 2200 }, ctx);
    const echo = ctx.createGain();
    echo.gain.value = 0.3;
    this.buses.music.connect(delay);
    delay.connect(damp).connect(feedback).connect(delay);
    damp.connect(echo).connect(master);
    const musicSpace = ctx.createGain();
    musicSpace.gain.value = 0.5;
    this.buses.music.connect(musicSpace).connect(this.reverbSend);

    this.noise = makeNoise(ctx, 2);
    this.loopNoise = makeNoise(ctx, 6);
  }

  private filter(f: FilterOptions, ctx: BaseAudioContext = this.ctx!): BiquadFilterNode {
    const node = ctx.createBiquadFilter();
    node.type = f.type;
    node.frequency.value = f.freq;
    node.Q.value = f.q ?? 0.7;
    return node;
  }

  private envelope(t: number, peak: number, attack: number, duration: number): GainNode {
    const env = this.ctx!.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    return env;
  }

  private route(node: AudioNode, o: Routing): void {
    node.connect(o.dest ?? this.buses[o.bus ?? 'sfx']);
    const reverb = o.reverb ?? 0;
    if (reverb > 0 && !o.dest) {
      const send = this.ctx!.createGain();
      send.gain.value = reverb;
      node.connect(send).connect(this.reverbSend);
    }
  }
}
