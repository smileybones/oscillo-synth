export type ModSource = 'envelope' | 'lfo';
export type ModDestination = 'pitch' | 'cutoff' | 'amp';

export interface ModConnection {
  source: ModSource;
  destination: ModDestination;
  amount: number;
}

const MOD_SOURCES: ModSource[] = ['envelope', 'lfo'];
const MOD_DESTINATIONS: ModDestination[] = ['pitch', 'cutoff', 'amp'];

// A fixed 2x3 grid (every source/destination pair always exists, amount 0 =
// inert) rather than an arbitrary add/remove-connection list — small enough
// to render as plain sliders without needing a real graph-editing UI.
export function defaultModMatrix(): ModConnection[] {
  const connections: ModConnection[] = [];
  for (const source of MOD_SOURCES) {
    for (const destination of MOD_DESTINATIONS) {
      connections.push({ source, destination, amount: 0 });
    }
  }
  return connections;
}

// Sums every connection routed to `destination`, using each connection's
// source's current value (already computed by the caller for this sample —
// e.g. the envelope's own level, or the shared LFO's current value).
export function sumModulation(
  connections: ModConnection[],
  sourceValues: Record<ModSource, number>,
  destination: ModDestination,
): number {
  let total = 0;
  for (const connection of connections) {
    if (connection.destination !== destination) continue;
    total += sourceValues[connection.source] * connection.amount;
  }
  return total;
}
