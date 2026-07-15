export interface FilterParams {
  cutoff: number;
  resonance: number;
}

// A "TPT" (topology-preserving transform) state-variable filter (the design
// popularized by Andrew Simper/Cytomic) — unlike the simpler Chamberlin SVF,
// its tan()-prewarped coefficients keep it stable all the way up to Nyquist
// rather than blowing up once cutoff gets within ~1/4 of the sample rate
// (confirmed via a throwaway verification script before wiring this in).
// Each voice owns its own instance so filter state doesn't leak between notes.
export class StateVariableFilter {
  private ic1eq = 0;
  private ic2eq = 0;

  process(input: number, sampleRate: number, params: FilterParams): number {
    const cutoff = Math.max(20, Math.min(params.cutoff, sampleRate * 0.49));
    const resonance = Math.max(0, Math.min(1, params.resonance));
    const q = 0.5 + resonance * 9.5; // 0.5 (gentle) .. 10 (near self-oscillation)
    const k = 1 / q;

    const g = Math.tan((Math.PI * cutoff) / sampleRate);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;

    const v3 = input - this.ic2eq;
    const v1 = a1 * this.ic1eq + a2 * v3;
    const v2 = this.ic2eq + a2 * this.ic1eq + a3 * v3;
    this.ic1eq = 2 * v1 - this.ic1eq;
    this.ic2eq = 2 * v2 - this.ic2eq;

    return v2; // lowpass output
  }
}
