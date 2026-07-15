export interface AdsrParams {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

type EnvelopeStage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

// A per-sample ADSR envelope generator, level 0..1. Each stage starts from
// the envelope's current level rather than snapping to a fixed value — that
// way a note retriggered mid-release, or released mid-attack/decay, glides
// instead of clicking.
export class AdsrEnvelope {
  private stage: EnvelopeStage = 'idle';
  private level = 0;
  private stageStartLevel = 0;
  private stageElapsed = 0;

  noteOn(): void {
    this.stage = 'attack';
    this.stageStartLevel = this.level;
    this.stageElapsed = 0;
  }

  noteOff(): void {
    this.stage = 'release';
    this.stageStartLevel = this.level;
    this.stageElapsed = 0;
  }

  get isIdle(): boolean {
    return this.stage === 'idle';
  }

  advance(deltaSeconds: number, params: AdsrParams): number {
    this.stageElapsed += deltaSeconds;

    switch (this.stage) {
      case 'idle':
        this.level = 0;
        break;
      case 'attack': {
        const duration = Math.max(params.attack, 0.001);
        const t = Math.min(1, this.stageElapsed / duration);
        this.level = this.stageStartLevel + (1 - this.stageStartLevel) * t;
        if (t >= 1) {
          this.stage = 'decay';
          this.stageStartLevel = this.level;
          this.stageElapsed = 0;
        }
        break;
      }
      case 'decay': {
        const duration = Math.max(params.decay, 0.001);
        const t = Math.min(1, this.stageElapsed / duration);
        this.level = this.stageStartLevel + (params.sustain - this.stageStartLevel) * t;
        if (t >= 1) {
          this.stage = 'sustain';
          this.stageElapsed = 0;
        }
        break;
      }
      case 'sustain':
        this.level = params.sustain;
        break;
      case 'release': {
        const duration = Math.max(params.release, 0.001);
        const t = Math.min(1, this.stageElapsed / duration);
        this.level = this.stageStartLevel * (1 - t);
        if (t >= 1) {
          this.stage = 'idle';
          this.level = 0;
        }
        break;
      }
    }

    return this.level;
  }
}
