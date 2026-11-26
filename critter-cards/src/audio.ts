import type {Critter} from "./critters";

// Every sound is made on the spot with Web Audio: a few oscillators and a
// burst of noise. There are no sound files.

export type SoundName =
  | "tap"
  | "pick"
  | "rise"
  | "pop"
  | "whoosh"
  | "hit"
  | "superHit"
  | "fire"
  | "bubble"
  | "leaf"
  | "zap"
  | "rock"
  | "charge"
  | "faint"
  | "win"
  | "lose";

export class Sounds {
  private ctx?: AudioContext;
  private master?: GainNode;
  private muted = false;

  /** iPad Safari only lets a page make noise from inside a tap. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx =
        window.AudioContext ??
        (window as unknown as {webkitAudioContext?: typeof AudioContext})
          .webkitAudioContext;
      if (!Ctx) {
        return;
      }
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) {
      this.master.gain.value = muted ? 0 : 0.5;
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) {
      return;
    }
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, filter: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) {
      return;
    }
    const t = ctx.currentTime + delay;
    const frames = Math.ceil(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = filter;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(gain).connect(this.master);
    src.start(t);
  }

  play(name: SoundName): void {
    switch (name) {
      case "tap":
        this.tone(660, 0.08, "triangle", 0.25);
        break;
      case "pick":
        this.tone(523, 0.12, "triangle", 0.3);
        this.tone(784, 0.18, "triangle", 0.3, undefined, 0.1);
        break;
      case "rise":
        this.tone(300, 0.7, "sine", 0.18, 900);
        break;
      case "pop":
        this.tone(900, 0.12, "square", 0.12, 300);
        this.noise(0.18, 0.25, 3000);
        break;
      case "whoosh":
        this.noise(0.3, 0.3, 1400);
        break;
      case "hit":
        this.tone(150, 0.2, "square", 0.25, 50);
        this.noise(0.18, 0.45, 2000);
        break;
      case "superHit":
        this.tone(120, 0.6, "sawtooth", 0.3, 30);
        this.tone(60, 0.7, "square", 0.2, 25);
        this.noise(0.6, 0.6, 1600);
        break;
      case "fire":
        this.noise(0.45, 0.35, 900);
        this.tone(220, 0.35, "sawtooth", 0.08, 110);
        break;
      case "bubble":
        for (let i = 0; i < 4; i++) {
          this.tone(500 + i * 140, 0.08, "sine", 0.22, 1100, i * 0.07);
        }
        break;
      case "leaf":
        this.noise(0.5, 0.2, 5000);
        this.tone(1200, 0.25, "sine", 0.08, 1800);
        break;
      case "zap":
        this.tone(1400, 0.25, "sawtooth", 0.15, 120);
        this.noise(0.25, 0.3, 6000);
        break;
      case "rock":
        this.tone(90, 0.3, "triangle", 0.35, 45);
        this.noise(0.3, 0.4, 600);
        break;
      case "charge":
        this.tone(220, 0.6, "triangle", 0.2, 880);
        this.tone(330, 0.6, "triangle", 0.12, 1320, 0.05);
        break;
      case "faint":
        this.tone(600, 0.8, "sine", 0.25, 150);
        break;
      case "win":
        [523, 659, 784, 1047].forEach((f, i) => {
          this.tone(f, 0.22, "triangle", 0.3, undefined, i * 0.13);
        });
        break;
      case "lose":
        [392, 330, 262].forEach((f, i) => {
          this.tone(f, 0.3, "sine", 0.25, undefined, i * 0.2);
        });
        break;
    }
  }

  /**
   * Each beast's roar: a growl that rises and falls, with a rasp of noise
   * under it. Its pitch and how far it drops come from the critter.
   */
  cry(critter: Critter): void {
    const {pitch, swoop} = critter.cry;
    this.tone(pitch, 0.12, "sawtooth", 0.22, pitch * 1.5);
    this.tone(pitch * 1.5, 0.55, "sawtooth", 0.25, pitch * swoop, 0.1);
    this.tone(pitch * 0.5, 0.6, "square", 0.12, pitch * swoop * 0.5, 0.05);
    this.noise(0.6, 0.3, 900, 0.05);
  }
}
