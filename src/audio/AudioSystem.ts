import { CONFIG } from '../config';

/** Rajada de ruído filtrado. Tempos em segundos, relativos a "agora". */
export interface NoiseOptions {
  at?: number;
  duration: number;
  type: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  gain: number;
  attack?: number;
  /** Quanto enviar para a reverberação (0..1). */
  reverb?: number;
}

/** Tom de oscilador com envelope. */
export interface ToneOptions {
  at?: number;
  duration: number;
  freq: number;
  freqEnd?: number;
  type?: OscillatorType;
  gain: number;
  attack?: number;
  reverb?: number;
}

/** Ruído branco reutilizado por todas as rajadas (tocado a partir de offsets aleatórios). */
function makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Resposta ao impulso de uma floresta: reflexões iniciais esparsas + cauda que escurece com o tempo. */
function makeImpulse(ctx: AudioContext, seconds: number): AudioBuffer {
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

/**
 * Áudio 100% sintetizado (WebAudio). O navegador só permite tocar depois de um gesto do
 * usuário, então o AudioContext é criado/retomado em unlock() — chamado no primeiro clique/tecla.
 * Sem contexto, todas as funções de som simplesmente não fazem nada.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private reverbSend!: GainNode;
  private noise!: AudioBuffer;

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  unlock(): void {
    if (!this.ctx) this.init();
    else if (this.ctx.state === 'suspended') void this.ctx.resume();
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
    this.route(env, o.reverb ?? 0);
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
    const env = this.envelope(t, o.gain, o.attack ?? 0.002, o.duration);
    osc.connect(env);
    this.route(env, o.reverb ?? 0);
    osc.start(t);
    osc.stop(t + o.duration + 0.05);
  }

  private init(): void {
    const ctx = new AudioContext();
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
    master.connect(comp).connect(ctx.destination);

    this.out = ctx.createGain();
    this.out.connect(master);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 2.8);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverbSend = ctx.createGain();
    this.reverbSend.connect(reverb).connect(wet).connect(master);

    this.noise = makeNoise(ctx, 2);
    if (ctx.state === 'suspended') void ctx.resume();
  }

  private envelope(t: number, peak: number, attack: number, duration: number): GainNode {
    const env = this.ctx!.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    return env;
  }

  private route(node: AudioNode, reverb: number): void {
    node.connect(this.out);
    if (reverb > 0) {
      const send = this.ctx!.createGain();
      send.gain.value = reverb;
      node.connect(send).connect(this.reverbSend);
    }
  }
}
