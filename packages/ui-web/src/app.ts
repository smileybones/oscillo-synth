import './theme.css';
import { enhanceRangeInputsAsKnobs } from './knob';
import { xyPadify } from './xy-pad';
import defaultFontUrl from './assets/fonts/Arimo-Regular.woff?url';
import {
  ParametricSource,
  SvgSource,
  TextSource,
  parseFont,
  LSystemSource,
  MeshSource,
  parseObj,
  parseGltf,
  normalizeMeshModel,
  VideoTraceSource,
  LuaSource,
  renderPathsToSamples,
  EffectChain,
  createTransformEffect,
  createBitcrushEffect,
  createRippleEffect,
  createSwirlEffect,
  createSmoothingEffect,
  createKaleidoscopeEffect,
  type ParametricShape,
  type TransformParams,
  type BitcrushParams,
  type RippleParams,
  type SwirlParams,
  type SmoothingParams,
  type KaleidoscopeParams,
  type Effect,
  type Source,
  type Font,
  type MeshModel,
  type SampleBuffer,
  type Path,
  defaultSynthParams,
  type SynthParams,
  type OscillatorWaveform,
  type ModSource,
  type ModDestination,
  type ArpPattern,
  generateChordNotes,
  type ScaleType,
} from '@oscillo-synth/engine';
import {
  createAudioGraph,
  sendSamples,
  seekAudioTo,
  XyPreview,
  WaveformPreview,
  extractPathData,
  decodeAudioFile,
  VideoFrameGrabber,
  MidiManager,
  createSynthGraph,
  sendNoteOn,
  sendNoteOff,
  sendSynthParams,
  type AudioGraph,
  type SynthGraph,
} from '@oscillo-synth/platform-web';
import type { PlaybackState } from '@oscillo-synth/shared-types';

const TRAVEL_SAMPLES = 8;
const SAMPLE_RATES = [44100, 48000, 96000] as const;
const SHAPE_KINDS = ['lissajous', 'circle', 'square'] as const;

// The trace-frequency slider covers 1-1000Hz, but the visually interesting
// range for watching the beam sweep (see xy-preview.ts) is mostly under
// 100Hz — on a linear scale that's only the first 10% of the track, so a
// tiny mouse movement swings the value wildly. Map the slider to a log
// scale instead, giving the low end proportionally more physical space.
const HZ_MIN = 1;
const HZ_MAX = 1000;
const HZ_SLIDER_MAX = 1000;

function sliderToHz(sliderValue: number): number {
  const t = sliderValue / HZ_SLIDER_MAX;
  return Math.round(HZ_MIN * Math.pow(HZ_MAX / HZ_MIN, t));
}

function hzToSlider(hz: number): number {
  const t = Math.log(hz / HZ_MIN) / Math.log(HZ_MAX / HZ_MIN);
  return Math.round(t * HZ_SLIDER_MAX);
}

type ShapeLayer =
  | { id: string; type: 'parametric'; shape: ParametricShape; effects: EffectInstance[] }
  | { id: string; type: 'svg'; label: string; paths: string[]; effects: EffectInstance[] }
  | { id: string; type: 'text'; label: string; font: Font; text: string; fontSize: number; effects: EffectInstance[] }
  | {
      id: string;
      type: 'lsystem';
      // Tracks which preset the dropdown should show as selected — separate
      // from axiom/rulesText/etc. since those are also independently
      // editable, so there's no way to derive "which preset is active" from
      // their current values alone.
      presetLabel: string;
      axiom: string;
      rulesText: string;
      angleDeg: number;
      iterations: number;
      drawSymbols: string;
      effects: EffectInstance[];
    }
  | {
      id: string;
      type: 'mesh';
      label: string;
      model: MeshModel;
      rotationSpeed: { x: number; y: number; z: number };
      effects: EffectInstance[];
    }
  | {
      id: string;
      type: 'video';
      label: string;
      grabber: VideoFrameGrabber;
      threshold: number;
      effects: EffectInstance[];
    }
  | {
      id: string;
      type: 'lua';
      // Same reasoning as L-system's presetLabel: tracks which preset the
      // dropdown should show as selected, since it can't be derived from
      // scriptText alone (the script is also freely editable afterward).
      presetLabel: string;
      scriptText: string;
      source: LuaSource | null;
      error: string | null;
      effects: EffectInstance[];
    };

interface LuaPreset {
  label: string;
  script: string;
}

// Every script here returns one CLOSED path (the engine connects the last
// point back to the first), so whatever varies with `t` must complete a
// whole number of cycles over a single a = 0..2π loop — otherwise the shape
// has a visible seam where it fails to meet itself. Verified with a
// throwaway script (checking closure + coordinate range) before adding here.
const LUA_PRESETS: LuaPreset[] = [
  {
    label: 'Rotating Lissajous',
    script: `-- generate(t) returns a table of {x, y} points forming one closed path.
-- t is elapsed time in seconds, so you can animate the shape over time.
function generate(t)
  local points = {}
  local n = 256
  for i = 0, n - 1 do
    local angle = (i / n) * math.pi * 2
    points[i + 1] = { x = math.sin(3 * angle + t), y = math.sin(2 * angle) }
  end
  return points
end
`,
  },
  {
    label: 'Beating Heart',
    script: `function generate(t)
  local points = {}
  local n = 512

  local scale = 0.045 * (1 + 0.1 * math.sin(t * 4))

  for i = 0, n - 1 do
    local a = (i / n) * math.pi * 2

    local x = 16 * math.sin(a)^3
    local y = 13 * math.cos(a)
            - 5 * math.cos(2 * a)
            - 2 * math.cos(3 * a)
            - math.cos(4 * a)

    points[i + 1] = {
      x = x * scale,
      y = y * scale
    }
  end

  return points
end
`,
  },
  {
    label: 'Blooming Flower',
    script: `function generate(t)
  local points = {}
  local n = 512

  local petals = 7
  local spin = t * 0.4
  local pulse = 0.25 * math.sin(t * 1.3)

  for i = 0, n - 1 do
    local a = (i / n) * math.pi * 2

    -- Flower radius with animated breathing
    local r = 0.5 + 0.35 * math.cos(petals * a + t) + pulse

    -- Apply rotation
    local angle = a + spin

    points[i + 1] = {
      x = r * math.cos(angle),
      y = r * math.sin(angle)
    }
  end

  return points
end
`,
  },
  {
    label: 'Spirograph',
    script: `function generate(t)
  local points = {}
  local n = 768
  local scale = 0.09

  local R, r = 8, 2
  local k = (R - r) / r  -- integer ratio keeps the curve closed after one loop
  local d = 5 + 2 * math.sin(t * 0.3)
  local spin = t * 0.2

  for i = 0, n - 1 do
    local a = (i / n) * math.pi * 2

    local x0 = (R - r) * math.cos(a) + d * math.cos(k * a)
    local y0 = (R - r) * math.sin(a) - d * math.sin(k * a)

    local cs, sn = math.cos(spin), math.sin(spin)
    points[i + 1] = {
      x = (x0 * cs - y0 * sn) * scale,
      y = (x0 * sn + y0 * cs) * scale
    }
  end

  return points
end
`,
  },
  {
    label: 'Star Burst',
    script: `function generate(t)
  local points = {}
  local n = 512
  local spikes = 6
  local outer = 0.9
  local inner = 0.35 + 0.15 * math.sin(t * 2)
  local spin = t * 0.5

  for i = 0, n - 1 do
    local a = (i / n) * math.pi * 2
    local wave = math.sin(spikes * a)
    -- Blend toward outer/inner using the wave, for gentle rounded spikes.
    local r = inner + (outer - inner) * (0.5 + 0.5 * wave)

    local angle = a + spin
    points[i + 1] = {
      x = r * math.cos(angle),
      y = r * math.sin(angle)
    }
  end

  return points
end
`,
  },
];

interface LSystemPreset {
  label: string;
  axiom: string;
  rulesText: string;
  angleDeg: number;
  iterations: number;
  drawSymbols: string;
}

const LSYSTEM_PRESETS: LSystemPreset[] = [
  { label: 'Koch snowflake', axiom: 'F++F++F', rulesText: 'F=F-F++F-F', angleDeg: 60, iterations: 3, drawSymbols: 'F' },
  {
    label: 'Sierpinski triangle',
    axiom: 'A',
    rulesText: 'A=B-A-B\nB=A+B+A',
    angleDeg: 60,
    iterations: 5,
    drawSymbols: 'AB',
  },
  {
    label: 'Dragon curve',
    axiom: 'FX',
    rulesText: 'X=X+YF+\nY=-FX-Y',
    angleDeg: 90,
    iterations: 10,
    drawSymbols: 'F',
  },
  {
    label: 'Hilbert curve',
    axiom: 'A',
    rulesText: 'A=-BF+AFA+FB-\nB=+AF-BFB-FA+',
    angleDeg: 90,
    iterations: 4,
    drawSymbols: 'F',
  },
  {
    label: 'Fractal plant',
    axiom: 'X',
    rulesText: 'X=F+[[X]-X]-F[-FX]+X\nF=FF',
    angleDeg: 25,
    iterations: 5,
    drawSymbols: 'F',
  },
];

function parseRulesText(text: string): Record<string, string> {
  const rules: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const symbol = trimmed.slice(0, eq).trim();
    const replacement = trimmed.slice(eq + 1).trim();
    if (symbol.length === 1) rules[symbol] = replacement;
  }
  return rules;
}

type EffectInstance =
  | { id: string; kind: 'transform'; params: TransformParams }
  | { id: string; kind: 'bitcrush'; params: BitcrushParams }
  | { id: string; kind: 'ripple'; params: RippleParams }
  | { id: string; kind: 'swirl'; params: SwirlParams }
  | { id: string; kind: 'smoothing'; params: SmoothingParams }
  | { id: string; kind: 'kaleidoscope'; params: KaleidoscopeParams };

let nextId = 0;
function genId(): string {
  return `id-${nextId++}`;
}

// Standard "typing piano" layout (same convention as Ableton/GarageBand's
// computer-keyboard input): the ZXCV row plays white notes C4-E5, with the
// ASDF row above filling in the black keys — then the same pattern repeats
// an octave-and-a-half higher, QWERTY row for whites (F5-A6) and the number
// row above it for blacks, so the two row-pairs stack the same way the keys
// themselves physically stack (higher row = higher pitch). Keyed by
// KeyboardEvent.code (physical position) rather than .key, so it stays
// correct regardless of layout/modifier state.
const COMPUTER_KEYBOARD_NOTE_MAP: Record<string, number> = {
  KeyZ: 60,
  KeyS: 61,
  KeyX: 62,
  KeyD: 63,
  KeyC: 64,
  KeyV: 65,
  KeyG: 66,
  KeyB: 67,
  KeyH: 68,
  KeyN: 69,
  KeyJ: 70,
  KeyM: 71,
  Comma: 72,
  KeyL: 73,
  Period: 74,
  Semicolon: 75,
  Slash: 76,
  KeyQ: 77,
  Digit2: 78,
  KeyW: 79,
  Digit3: 80,
  KeyE: 81,
  Digit4: 82,
  KeyR: 83,
  KeyT: 84,
  Digit6: 85,
  KeyY: 86,
  Digit7: 87,
  KeyU: 88,
  KeyI: 89,
  Digit9: 90,
  KeyO: 91,
  Digit0: 92,
  KeyP: 93,
};
const COMPUTER_KEYBOARD_VELOCITY = 100;

// Bundled Apache-2.0-licensed fallback so "+ Add text" works immediately
// without requiring the user to hunt down a font file first (see
// assets/fonts/). Arimo is a metric/visual match for Arial. Imported as a
// build-time-resolved URL (not a hardcoded absolute path) so it works both
// served from an HTTP origin root (apps/web) and loaded over file:// with a
// relative base (apps/desktop's Electron shell).
let defaultFontPromise: Promise<Font | null> | null = null;
function getDefaultFont(): Promise<Font | null> {
  if (!defaultFontPromise) {
    defaultFontPromise = fetch(defaultFontUrl)
      .then((res) => res.arrayBuffer())
      .then((buffer) => parseFont(buffer))
      .catch((err) => {
        console.error('Failed to load bundled default font', err);
        return null;
      });
  }
  return defaultFontPromise;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiNoteName(note: number): string {
  const octave = Math.floor(note / 12) - 1;
  return `${NOTE_NAMES[note % 12]}${octave}`;
}

// C2 through A6 — matches the computer-keyboard fallback's top end (A6, see
// COMPUTER_KEYBOARD_NOTE_MAP) so every key it can trigger has a visible key
// here too; extra headroom below C4 for MIDI-only lower notes.
const KEYBOARD_START_NOTE = 36;
const KEYBOARD_END_NOTE = 93;
const BLACK_KEY_SEMITONES = new Set([1, 3, 6, 8, 10]);

// Flat left-to-right strip rather than true overlapping piano geometry —
// black keys are just shorter/darker and flush to the top, which reads as a
// keyboard without needing absolute-position overlap math.
function renderKeyboardHtml(): string {
  const keys: string[] = [];
  for (let note = KEYBOARD_START_NOTE; note <= KEYBOARD_END_NOTE; note++) {
    const isBlack = BLACK_KEY_SEMITONES.has(note % 12);
    keys.push(
      `<div class="osci-key ${isBlack ? 'osci-key-black' : 'osci-key-white'}" data-note="${note}" title="${midiNoteName(note)}"></div>`,
    );
  }
  return `<div class="osci-keyboard">${keys.join('')}</div>`;
}

interface KnobGroupItem {
  label: string;
  control: string;
  /** Inner HTML for the value cell; omit for a control (e.g. a <select>) that
   * already displays its own value, so there's nothing separate to show. */
  value?: string;
}

// A compact 3-row table (labels / knobs / values) instead of each control
// getting its own repeated label+value text block stacked above it — see
// the .osci-knob-group CSS comment for how the column alignment works.
function renderKnobGroup(items: KnobGroupItem[]): string {
  const cells = items
    .map(
      (item) => `
        <span class="osci-knob-group-label">${item.label}</span>
        ${item.control}
        <span class="osci-knob-group-value">${item.value ?? ''}</span>
      `,
    )
    .join('');
  return `<div class="osci-knob-group">${cells}</div>`;
}

// Same idea, 2-row (label / control) — for plain number/select inputs that
// display their own value inline, so there's no separate value row needed.
function renderControlGroup(items: { label: string; control: string }[]): string {
  const cells = items
    .map((item) => `<span class="osci-control-group-label">${item.label}</span>${item.control}`)
    .join('');
  return `<div class="osci-control-group">${cells}</div>`;
}

const MOD_SOURCES: ModSource[] = ['envelope', 'lfo'];
const MOD_DESTINATIONS: ModDestination[] = ['pitch', 'cutoff', 'amp'];
const MOD_SOURCE_LABELS: Record<ModSource, string> = { envelope: 'Env', lfo: 'LFO' };
const MOD_DESTINATION_LABELS: Record<ModDestination, string> = { pitch: 'Pitch', cutoff: 'Cutoff', amp: 'Amp' };

// A fixed 2x3 grid — every source/destination pair always has a slider, so
// there's no add/remove-connection UI to build, just plain sliders reusing
// the same event-delegation pattern as every other list in this file.
// A proper grid (row-label column + one column per destination) instead of
// wrapped flex rows with 5rem-min-width labels — the flex version was far
// too wide to ever fit in the Synth panel's 2-up subcard packing.
function renderModMatrixHtml(synthParams: SynthParams): string {
  const destHeaders = MOD_DESTINATIONS.map((d) => `<span class="osci-modmatrix-label">${MOD_DESTINATION_LABELS[d]}</span>`).join('');
  const rows = MOD_SOURCES.map((source) => {
    const cells = MOD_DESTINATIONS.map((destination) => {
      const connection = synthParams.modMatrix.find((c) => c.source === source && c.destination === destination)!;
      return `<input type="range" min="-1" max="1" step="0.01" value="${connection.amount}" data-action="set-mod-amount" data-source="${source}" data-destination="${destination}" />`;
    }).join('');
    return `<span class="osci-modmatrix-label">${MOD_SOURCE_LABELS[source]}</span>${cells}`;
  }).join('');
  return `<div id="mod-matrix-grid" class="osci-modmatrix-grid"><span></span>${destHeaders}${rows}</div>`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function defaultShape(kind: ParametricShape['kind']): ParametricShape {
  switch (kind) {
    case 'lissajous':
      return { kind: 'lissajous', freqX: 3, freqY: 2, phase: Math.PI / 2 };
    case 'circle':
      return { kind: 'circle' };
    case 'square':
      return { kind: 'square' };
  }
}

function toEngineSource(layer: ShapeLayer): Source {
  switch (layer.type) {
    case 'parametric':
      return new ParametricSource(layer.shape);
    case 'svg':
      return new SvgSource(layer.paths);
    case 'text':
      return new TextSource(layer.font, layer.text, layer.fontSize);
    case 'lsystem':
      return new LSystemSource({
        axiom: layer.axiom,
        rules: parseRulesText(layer.rulesText),
        angleDeg: layer.angleDeg,
        iterations: layer.iterations,
        drawSymbols: layer.drawSymbols,
      });
    case 'mesh':
      return new MeshSource(layer.model, layer.rotationSpeed);
    case 'video':
      return new VideoTraceSource(() => layer.grabber.getFramePixels(), { threshold: layer.threshold });
    case 'lua':
      return layer.source ?? { render: () => [] };
  }
}

function isEffectAnimated(effect: EffectInstance): boolean {
  return (effect.kind === 'ripple' || effect.kind === 'swirl') && (effect.params.speed ?? 0) !== 0;
}

function needsContinuousRender(layers: ShapeLayer[], globalEffects: EffectInstance[]): boolean {
  const layerAnimated = layers.some(
    (l) =>
      (l.type === 'mesh' && (l.rotationSpeed.x !== 0 || l.rotationSpeed.y !== 0 || l.rotationSpeed.z !== 0)) ||
      l.type === 'video' ||
      l.type === 'lua' ||
      l.effects.some(isEffectAnimated),
  );
  return layerAnimated || globalEffects.some(isEffectAnimated);
}

function toEngineEffect(effect: EffectInstance): Effect {
  switch (effect.kind) {
    case 'transform':
      return createTransformEffect(effect.params);
    case 'bitcrush':
      return createBitcrushEffect(effect.params);
    case 'ripple':
      return createRippleEffect(effect.params);
    case 'swirl':
      return createSwirlEffect(effect.params);
    case 'smoothing':
      return createSmoothingEffect(effect.params);
    case 'kaleidoscope':
      return createKaleidoscopeEffect(effect.params);
  }
}

function createDefaultEffectInstance(kind: EffectInstance['kind']): EffectInstance {
  switch (kind) {
    case 'transform':
      return { id: genId(), kind: 'transform', params: {} };
    case 'bitcrush':
      return { id: genId(), kind: 'bitcrush', params: { levels: 16 } };
    case 'ripple':
      return { id: genId(), kind: 'ripple', params: {} };
    case 'swirl':
      return { id: genId(), kind: 'swirl', params: {} };
    case 'smoothing':
      return { id: genId(), kind: 'smoothing', params: {} };
    case 'kaleidoscope':
      return { id: genId(), kind: 'kaleidoscope', params: {} };
  }
}

export function createApp(root: HTMLElement): void {
  let state: PlaybackState = 'stopped';
  let audio: AudioGraph | null = null;

  let layers: ShapeLayer[] = [{ id: genId(), type: 'parametric', shape: defaultShape('lissajous'), effects: [] }];
  // Only the selected layer renders its full editor; every other layer
  // collapses to a one-line row (see renderLayerHtml). Starts on the default
  // layer above, which always exists at this point.
  let selectedLayerId: string | null = layers[0]?.id ?? null;
  let effects: EffectInstance[] = [];
  let pendingFontTargetLayerId: string | null = null;
  let animationTimerId: number | null = null;

  // Constructing a Source re-parses/re-flattens its geometry (SVG paths,
  // font glyph outlines, L-system grammar expansion) — expensive, but only
  // actually needed when the layer's own data changes. Caching the
  // constructed instances and reusing them on every animation tick (only
  // calling .render(t) again, which is cheap even for mesh rotation) avoids
  // redoing that work 12.5x/sec whenever a spinning mesh keeps the render
  // loop running.
  let cachedSources: Source[] = [];

  // Raw decoded audio is already sample data, not a shape to trace — it
  // can't share the Source -> Path[] -> renderPathsToSamples pipeline the
  // way every other layer does, so it lives outside `layers` as a single
  // exclusive override rather than another list entry.
  let audioFile: { label: string; left: Float32Array; right: Float32Array; sampleRate: number } | null = null;
  let audioFileSeekFraction = 0;

  let traceHz = 220;
  let outputLevel = 0.3;
  let requestedSampleRate = 96000;

  // Its own AudioContext/on-off toggle, independent of the shape-tracing
  // Start/Stop button above — you should be able to play the synth whether
  // or not shape-tracing playback is running, and vice versa.
  let synthGraph: SynthGraph | null = null;
  let synthParams: SynthParams = defaultSynthParams();

  // Delay/reverb are native Web Audio nodes living on synthGraph, not part of
  // synthParams/the worklet message protocol — this local state is what gets
  // (re)applied to those nodes' AudioParams whenever the graph is (re)created.
  let synthEffects = { delayTime: 0.25, delayFeedback: 0.3, delayWet: 0, reverbWet: 0 };

  function applySynthEffects(graph: SynthGraph): void {
    graph.delay.delayTime.value = synthEffects.delayTime;
    graph.delayFeedback.gain.value = synthEffects.delayFeedback;
    graph.delayWet.gain.value = synthEffects.delayWet;
    graph.reverbWet.gain.value = synthEffects.reverbWet;
  }

  // MIDI mapping is scoped to the global Trace frequency / Output level
  // sliders only — they're part of the static shell and never get rebuilt,
  // unlike per-layer/per-effect sliders which are destroyed and recreated
  // on every renderLists() call. Binding to those would silently break the
  // mapping on the next unrelated edit.
  const midiManager = new MidiManager();
  let midiEnabled = false;
  let midiMapModeActive = false;
  let pendingMidiLearnElement: HTMLInputElement | null = null;
  const midiBindings = new Map<string, HTMLInputElement>();

  let computerKeyboardEnabled = false;
  const heldComputerKeys = new Set<string>();

  // Tracks which generated chord tones (and any still-pending strum
  // setTimeouts) a physical note-on produced, keyed by that physical note,
  // so the matching note-off releases exactly that set — not whatever
  // Smart Chords' current settings would generate right now, which may
  // have changed while the note was held.
  const activeChordNotes = new Map<number, { notes: number[]; pendingTimeouts: ReturnType<typeof setTimeout>[] }>();

  root.innerHTML = `
    <div class="osci-app">
      <div class="osci-dashboard">

        <div class="osci-col-shapes">
          <section class="osci-section">
            <div class="osci-section-header">
              <h2 class="osci-section-title">Shapes</h2>
              <div class="osci-button-row">
                <button data-action="add-layer">+ Shape</button>
                <button data-action="add-svg">+ SVG</button>
                <button data-action="add-text">+ Text</button>
                <button data-action="add-lsystem">+ L-system</button>
                <button data-action="add-mesh">+ 3D object</button>
                <button data-action="add-video">+ Video</button>
                <button data-action="add-lua">+ Lua script</button>
              </div>
            </div>
            <input type="file" id="svg-file-input" accept=".svg,image/svg+xml" style="display:none" />
            <input type="file" id="font-file-input" accept=".ttf,.otf,.woff" style="display:none" />
            <input type="file" id="mesh-file-input" accept=".obj,.gltf,.glb" style="display:none" />
            <input type="file" id="video-file-input" accept="video/*" style="display:none" />
            <div id="layers-list" class="osci-list"></div>
          </section>

          <section class="osci-section">
            <div class="osci-section-header">
              <h2 class="osci-section-title">Audio File (overrides shapes above)</h2>
              <div class="osci-button-row">
                <button data-action="add-audiofile">+ Add audio file</button>
              </div>
            </div>
            <input type="file" id="audiofile-input" accept="audio/*,.wav,.aiff,.aif,.mp3,.ogg,.flac" style="display:none" />
            <div id="audiofile-slot"></div>
          </section>
        </div>

        <div class="osci-col-scope">
          <h1 class="osci-title">oscillo-synth</h1>
          <canvas id="preview" class="osci-canvas" width="380" height="380"></canvas>
          <p id="preview-mode-label" style="font-size:0.72rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.1em;text-align:center;margin:-0.6rem 0 0;">Shape / Audio Trace</p>

          <div id="layer-effects-panel"></div>

          <section class="osci-section">
            <div class="osci-section-header">
              <h2 class="osci-section-title">Global Effects</h2>
              <div class="osci-button-row">
                <button data-action="add-transform">+ Transform</button>
                <button data-action="add-bitcrush">+ Bitcrush</button>
                <button data-action="add-ripple">+ Ripple</button>
                <button data-action="add-swirl">+ Swirl</button>
                <button data-action="add-smoothing">+ Smoothing</button>
                <button data-action="add-kaleidoscope">+ Kaleidoscope</button>
              </div>
            </div>
            <div id="effects-list" class="osci-list"></div>
          </section>
        </div>

        <div class="osci-col-synth">
          <section class="osci-section">
            <div class="osci-section-header">
              <h2 class="osci-section-title">
                Synth
                <span class="osci-help-wrap">
                  <button type="button" class="osci-help" data-action="toggle-help">?</button>
                  <div class="osci-help-popover" data-help-popover hidden>
                    Plays notes from a MIDI keyboard through this device's speakers, independent of the shape-tracing Start button below. No MIDI keyboard? Enable Computer Keyboard and play with: Z S X D C V G B H N J M , L . ; / (Z = C4), continuing an octave-and-a-half higher with Q 2 W 3 E 4 R T 6 Y 7 U I 9 O 0 P (Q = F5) — disabled while typing in a text field. While enabled, the main oscilloscope screen shows this synth's live waveform instead of the shape/audio trace.
                  </div>
                </span>
              </h2>
              <div class="osci-button-row">
                <button id="synth-toggle">Enable Synth</button>
                <button id="synth-keyboard-toggle">Enable Computer Keyboard</button>
              </div>
            </div>
            <p id="synth-status" style="font-size:0.75rem;color:var(--warn);margin:0;display:none;"></p>
            <div class="osci-synth-grid">
              <div class="osci-subcard">
                <p class="osci-subhead">Waveform</p>
                <label>
                  <select id="synth-waveform">
                    <option value="sine">Sine</option>
                    <option value="saw">Saw</option>
                    <option value="square">Square</option>
                    <option value="triangle">Triangle</option>
                  </select>
                </label>
              </div>
              <div class="osci-subcard">
                <p class="osci-subhead">ADSR</p>
                ${renderKnobGroup([
                  {
                    label: 'Attack',
                    control: '<input id="synth-attack" type="range" min="0" max="2" step="0.01" />',
                    value: '<span id="synth-attack-label"></span>s',
                  },
                  {
                    label: 'Decay',
                    control: '<input id="synth-decay" type="range" min="0" max="2" step="0.01" />',
                    value: '<span id="synth-decay-label"></span>s',
                  },
                  {
                    label: 'Sustain',
                    control: '<input id="synth-sustain" type="range" min="0" max="1" step="0.01" />',
                    value: '<span id="synth-sustain-label"></span>',
                  },
                  {
                    label: 'Release',
                    control: '<input id="synth-release" type="range" min="0" max="3" step="0.01" />',
                    value: '<span id="synth-release-label"></span>s',
                  },
                ])}
              </div>
              <div class="osci-subcard">
                <p class="osci-subhead">Volume &amp; Filter</p>
                ${renderKnobGroup([
                  {
                    label: 'Volume',
                    control: '<input id="synth-volume" type="range" min="0" max="1" step="0.01" />',
                    value: '<span id="synth-volume-label"></span>',
                  },
                  {
                    label: 'Cutoff',
                    control: '<input id="synth-cutoff" type="range" min="100" max="12000" step="10" />',
                    value: '<span id="synth-cutoff-label"></span>Hz',
                  },
                  {
                    label: 'Resonance',
                    control: '<input id="synth-resonance" type="range" min="0" max="1" step="0.01" />',
                    value: '<span id="synth-resonance-label"></span>',
                  },
                ])}
              </div>
              <div class="osci-subcard">
                <p class="osci-subhead">LFO</p>
                ${renderKnobGroup([
                  {
                    label: 'Waveform',
                    control: `<select id="synth-lfo-waveform">
                      <option value="sine">Sine</option>
                      <option value="saw">Saw</option>
                      <option value="square">Square</option>
                      <option value="triangle">Triangle</option>
                    </select>`,
                  },
                  {
                    label: 'Rate',
                    control: '<input id="synth-lfo-rate" type="range" min="0.1" max="20" step="0.1" />',
                    value: '<span id="synth-lfo-rate-label"></span>Hz',
                  },
                ])}
              </div>
              <div class="osci-subcard">
                <p class="osci-subhead">Mod Matrix</p>
                ${renderModMatrixHtml(synthParams)}
              </div>
              <div class="osci-subcard">
                <div class="osci-card-header">
                  <p class="osci-subhead">Arpeggiator</p>
                  <button id="synth-arp-toggle">Enable</button>
                </div>
                ${renderKnobGroup([
                  {
                    label: 'Pattern',
                    control: `<select id="synth-arp-pattern">
                      <option value="up">Up</option>
                      <option value="down">Down</option>
                      <option value="up-down">Up/Down</option>
                      <option value="random">Random</option>
                    </select>`,
                  },
                  {
                    label: 'Rate',
                    control: '<input id="synth-arp-rate" type="range" min="1" max="20" step="0.5" />',
                    value: '<span id="synth-arp-rate-label"></span>/s',
                  },
                ])}
              </div>
              <div class="osci-subcard">
                <div class="osci-card-header">
                  <p class="osci-subhead">Smart Chords</p>
                  <button id="synth-smart-chords-toggle">Enable</button>
                </div>
                ${renderControlGroup([
                  {
                    label: 'Scale Root',
                    control: `<select id="synth-chords-root">
                      ${NOTE_NAMES.map((name, i) => `<option value="${i}">${name}</option>`).join('')}
                    </select>`,
                  },
                  {
                    label: 'Scale Type',
                    control: `<select id="synth-chords-scale-type">
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                    </select>`,
                  },
                ])}
                <div class="osci-xy-pad-wrap">
                  <div id="synth-chords-xy-pad" class="osci-xy-pad">
                    <input id="synth-chords-pitch-range" type="range" min="1" max="4" step="1" />
                    <input id="synth-chords-density" type="range" min="2" max="6" step="1" />
                  </div>
                  <div class="osci-xy-pad-labels">
                    <span>Range &#8596;</span>
                    <span>Density &#8597;</span>
                  </div>
                </div>
                ${renderKnobGroup([
                  {
                    label: 'Strum',
                    control: '<input id="synth-chords-strum" type="range" min="0" max="80" step="1" />',
                    value: '<span id="synth-chords-strum-label"></span>ms',
                  },
                ])}
              </div>
              <div class="osci-subcard osci-subcard--wide">
                <p class="osci-subhead">Synth Effects</p>
                ${renderKnobGroup([
                  {
                    label: 'Delay Time',
                    control: '<input id="synth-delay-time" type="range" min="0.01" max="1" step="0.01" />',
                    value: '<span id="synth-delay-time-label"></span>s',
                  },
                  {
                    label: 'Feedback',
                    control: '<input id="synth-delay-feedback" type="range" min="0" max="0.9" step="0.01" />',
                    value: '<span id="synth-delay-feedback-label"></span>',
                  },
                  {
                    label: 'Delay Amt',
                    control: '<input id="synth-delay-wet" type="range" min="0" max="1" step="0.01" />',
                    value: '<span id="synth-delay-wet-label"></span>',
                  },
                  {
                    label: 'Reverb Amt',
                    control: '<input id="synth-reverb-wet" type="range" min="0" max="1" step="0.01" />',
                    value: '<span id="synth-reverb-wet-label"></span>',
                  },
                ])}
              </div>
            </div>
          </section>
        </div>

      </div>

      <div class="osci-bottom-row">
        <section class="osci-section">
          <div class="osci-section-header">
            <h2 class="osci-section-title">Keyboard</h2>
          </div>
          ${renderKeyboardHtml()}
        </section>

        <section class="osci-section">
          <div class="osci-section-header">
            <h2 class="osci-section-title">MIDI Mapping</h2>
          </div>
          <button id="midi-map-toggle">Enable MIDI mapping</button>
          <p id="midi-status" style="font-size:0.75rem;color:var(--text-dim);margin:0.3rem 0 0;">
            Maps Trace frequency and Output level to a MIDI knob. Click the button, then move a knob for each slider you want to map.
          </p>
        </section>
      </div>

      <div class="osci-playback-bar">
        <section class="osci-section">
          <div class="osci-button-row" style="align-items:flex-end;">
            <label style="flex:1;min-width:12rem;">Trace frequency: <span id="traceHzLabel"></span> Hz
              <input id="traceHz" type="range" min="0" max="${HZ_SLIDER_MAX}" step="1" />
            </label>

            <label style="flex:1;min-width:12rem;">Output level: <span id="levelLabel"></span>
              <input id="level" type="range" min="0" max="1" step="0.01" />
            </label>

            <label>Sample rate
              <select id="sampleRate">
                ${SAMPLE_RATES.map((r) => `<option value="${r}">${r} Hz</option>`).join('')}
              </select>
            </label>

            <div class="osci-button-row">
              <button id="toggle-start" class="osci-transport-start">Start</button>
              <button id="toggle-stop" class="osci-transport-stop" disabled>Stop</button>
            </div>
          </div>

          <p class="osci-warning">
            Warning: this outputs a real line-level signal meant for an oscilloscope's X/Y inputs, not speakers.
            Keep the output level low and don't route it to headphones/speakers at volume.
          </p>
        </section>
      </div>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>('#preview')!;
  const preview = new XyPreview(canvas);
  preview.start();

  // Enabling the synth takes over the same physical scope screen (you're not
  // tracing shapes and playing the synth on the same display at once), so
  // both previews share one canvas and take turns owning its rAF loop.
  const synthWaveformPreview = new WaveformPreview(canvas);
  let previewMode: 'shapes' | 'synth' = 'shapes';
  // Tracks whether the shape preview's rAF loop *should* be running whenever
  // previewMode is 'shapes' — separate from `state` (which is about the real
  // audio output device, not the on-screen preview): the preview runs by
  // default from page load regardless of `state`, so `state` alone can't
  // tell us what to restore after synth mode hands the canvas back.
  let shapePreviewRunning = true;
  const previewModeLabel = root.querySelector<HTMLParagraphElement>('#preview-mode-label')!;

  const layersList = root.querySelector<HTMLDivElement>('#layers-list')!;
  const effectsList = root.querySelector<HTMLDivElement>('#effects-list')!;
  const layerEffectsPanel = root.querySelector<HTMLDivElement>('#layer-effects-panel')!;
  const svgFileInput = root.querySelector<HTMLInputElement>('#svg-file-input')!;
  const fontFileInput = root.querySelector<HTMLInputElement>('#font-file-input')!;
  const meshFileInput = root.querySelector<HTMLInputElement>('#mesh-file-input')!;
  const videoFileInput = root.querySelector<HTMLInputElement>('#video-file-input')!;
  const audiofileInput = root.querySelector<HTMLInputElement>('#audiofile-input')!;
  const audiofileSlot = root.querySelector<HTMLDivElement>('#audiofile-slot')!;
  const traceHzInput = root.querySelector<HTMLInputElement>('#traceHz')!;
  const traceHzLabel = root.querySelector<HTMLSpanElement>('#traceHzLabel')!;
  const levelInput = root.querySelector<HTMLInputElement>('#level')!;
  const levelLabel = root.querySelector<HTMLSpanElement>('#levelLabel')!;
  const sampleRateSelect = root.querySelector<HTMLSelectElement>('#sampleRate')!;
  const midiMapToggle = root.querySelector<HTMLButtonElement>('#midi-map-toggle')!;
  const midiStatus = root.querySelector<HTMLParagraphElement>('#midi-status')!;
  const keyboardEl = root.querySelector<HTMLDivElement>('.osci-keyboard')!;
  const toggleStartButton = root.querySelector<HTMLButtonElement>('#toggle-start')!;
  const toggleStopButton = root.querySelector<HTMLButtonElement>('#toggle-stop')!;
  const synthToggle = root.querySelector<HTMLButtonElement>('#synth-toggle')!;
  const synthKeyboardToggle = root.querySelector<HTMLButtonElement>('#synth-keyboard-toggle')!;
  const synthStatus = root.querySelector<HTMLParagraphElement>('#synth-status')!;
  const synthWaveformSelect = root.querySelector<HTMLSelectElement>('#synth-waveform')!;
  const synthAttackInput = root.querySelector<HTMLInputElement>('#synth-attack')!;
  const synthAttackLabel = root.querySelector<HTMLSpanElement>('#synth-attack-label')!;
  const synthDecayInput = root.querySelector<HTMLInputElement>('#synth-decay')!;
  const synthDecayLabel = root.querySelector<HTMLSpanElement>('#synth-decay-label')!;
  const synthSustainInput = root.querySelector<HTMLInputElement>('#synth-sustain')!;
  const synthSustainLabel = root.querySelector<HTMLSpanElement>('#synth-sustain-label')!;
  const synthReleaseInput = root.querySelector<HTMLInputElement>('#synth-release')!;
  const synthReleaseLabel = root.querySelector<HTMLSpanElement>('#synth-release-label')!;
  const synthVolumeInput = root.querySelector<HTMLInputElement>('#synth-volume')!;
  const synthVolumeLabel = root.querySelector<HTMLSpanElement>('#synth-volume-label')!;
  const synthCutoffInput = root.querySelector<HTMLInputElement>('#synth-cutoff')!;
  const synthCutoffLabel = root.querySelector<HTMLSpanElement>('#synth-cutoff-label')!;
  const synthResonanceInput = root.querySelector<HTMLInputElement>('#synth-resonance')!;
  const synthResonanceLabel = root.querySelector<HTMLSpanElement>('#synth-resonance-label')!;
  const synthLfoWaveformSelect = root.querySelector<HTMLSelectElement>('#synth-lfo-waveform')!;
  const synthLfoRateInput = root.querySelector<HTMLInputElement>('#synth-lfo-rate')!;
  const synthLfoRateLabel = root.querySelector<HTMLSpanElement>('#synth-lfo-rate-label')!;
  const modMatrixGrid = root.querySelector<HTMLDivElement>('#mod-matrix-grid')!;
  const synthArpToggle = root.querySelector<HTMLButtonElement>('#synth-arp-toggle')!;
  const synthArpPatternSelect = root.querySelector<HTMLSelectElement>('#synth-arp-pattern')!;
  const synthArpRateInput = root.querySelector<HTMLInputElement>('#synth-arp-rate')!;
  const synthArpRateLabel = root.querySelector<HTMLSpanElement>('#synth-arp-rate-label')!;
  const synthSmartChordsToggle = root.querySelector<HTMLButtonElement>('#synth-smart-chords-toggle')!;
  const synthChordsRootSelect = root.querySelector<HTMLSelectElement>('#synth-chords-root')!;
  const synthChordsScaleTypeSelect = root.querySelector<HTMLSelectElement>('#synth-chords-scale-type')!;
  const synthChordsXyPad = root.querySelector<HTMLDivElement>('#synth-chords-xy-pad')!;
  const synthChordsPitchRangeInput = root.querySelector<HTMLInputElement>('#synth-chords-pitch-range')!;
  const synthChordsDensityInput = root.querySelector<HTMLInputElement>('#synth-chords-density')!;
  const synthChordsStrumInput = root.querySelector<HTMLInputElement>('#synth-chords-strum')!;
  const synthChordsStrumLabel = root.querySelector<HTMLSpanElement>('#synth-chords-strum-label')!;
  const synthDelayTimeInput = root.querySelector<HTMLInputElement>('#synth-delay-time')!;
  const synthDelayTimeLabel = root.querySelector<HTMLSpanElement>('#synth-delay-time-label')!;
  const synthDelayFeedbackInput = root.querySelector<HTMLInputElement>('#synth-delay-feedback')!;
  const synthDelayFeedbackLabel = root.querySelector<HTMLSpanElement>('#synth-delay-feedback-label')!;
  const synthDelayWetInput = root.querySelector<HTMLInputElement>('#synth-delay-wet')!;
  const synthDelayWetLabel = root.querySelector<HTMLSpanElement>('#synth-delay-wet-label')!;
  const synthReverbWetInput = root.querySelector<HTMLInputElement>('#synth-reverb-wet')!;
  const synthReverbWetLabel = root.querySelector<HTMLSpanElement>('#synth-reverb-wet-label')!;

  traceHzInput.value = String(hzToSlider(traceHz));
  traceHzLabel.textContent = String(traceHz);
  levelInput.value = String(outputLevel);
  levelLabel.textContent = outputLevel.toFixed(2);
  sampleRateSelect.value = String(requestedSampleRate);

  synthWaveformSelect.value = synthParams.oscillator.waveform;
  synthAttackInput.value = String(synthParams.envelope.attack);
  synthAttackLabel.textContent = synthParams.envelope.attack.toFixed(2);
  synthDecayInput.value = String(synthParams.envelope.decay);
  synthDecayLabel.textContent = synthParams.envelope.decay.toFixed(2);
  synthSustainInput.value = String(synthParams.envelope.sustain);
  synthSustainLabel.textContent = synthParams.envelope.sustain.toFixed(2);
  synthReleaseInput.value = String(synthParams.envelope.release);
  synthReleaseLabel.textContent = synthParams.envelope.release.toFixed(2);
  synthVolumeInput.value = String(synthParams.volume);
  synthVolumeLabel.textContent = synthParams.volume.toFixed(2);
  synthCutoffInput.value = String(synthParams.filter.cutoff);
  synthCutoffLabel.textContent = String(synthParams.filter.cutoff);
  synthResonanceInput.value = String(synthParams.filter.resonance);
  synthResonanceLabel.textContent = synthParams.filter.resonance.toFixed(2);
  synthLfoWaveformSelect.value = synthParams.lfo.waveform;
  synthLfoRateInput.value = String(synthParams.lfo.rate);
  synthLfoRateLabel.textContent = synthParams.lfo.rate.toFixed(1);
  synthArpPatternSelect.value = synthParams.arp.pattern;
  synthArpRateInput.value = String(synthParams.arp.rate);
  synthArpRateLabel.textContent = synthParams.arp.rate.toFixed(1);
  synthSmartChordsToggle.textContent = synthParams.smartChordsEnabled ? 'Disable' : 'Enable';
  synthSmartChordsToggle.classList.toggle('osci-toggle-active', synthParams.smartChordsEnabled);
  synthChordsRootSelect.value = String(synthParams.smartChords.scaleRoot);
  synthChordsScaleTypeSelect.value = synthParams.smartChords.scaleType;
  synthChordsPitchRangeInput.value = String(synthParams.smartChords.pitchRange);
  synthChordsDensityInput.value = String(synthParams.smartChords.density);
  synthChordsStrumInput.value = String(synthParams.smartChords.strumMs);
  synthChordsStrumLabel.textContent = String(synthParams.smartChords.strumMs);
  synthDelayTimeInput.value = String(synthEffects.delayTime);
  synthDelayTimeLabel.textContent = synthEffects.delayTime.toFixed(2);
  synthDelayFeedbackInput.value = String(synthEffects.delayFeedback);
  synthDelayFeedbackLabel.textContent = synthEffects.delayFeedback.toFixed(2);
  synthDelayWetInput.value = String(synthEffects.delayWet);
  synthDelayWetLabel.textContent = synthEffects.delayWet.toFixed(2);
  synthReverbWetInput.value = String(synthEffects.reverbWet);
  synthReverbWetLabel.textContent = synthEffects.reverbWet.toFixed(2);

  // Every other source ignores render(t) and returns a fixed shape — an obj
  // layer with nonzero rotation speed is the first one that actually needs
  // real elapsed time, so this loop only runs while one exists. Re-rendering
  // resends a fresh buffer to the worklet (resetting its playback position),
  // so doing this unconditionally on a fast timer would introduce audible
  // clicks on otherwise-static scenes; gating it avoids that regression.
  function syncAnimationLoop(): void {
    const needsAnimation = needsContinuousRender(layers, effects);
    if (needsAnimation && animationTimerId === null) {
      animationTimerId = window.setInterval(renderFrame, 80);
    } else if (!needsAnimation && animationTimerId !== null) {
      window.clearInterval(animationTimerId);
      animationTimerId = null;
    }
  }

  // Reuses cachedSources rather than reconstructing them from `layers` —
  // safe to call on a fast timer (mesh rotation) since it skips
  // re-parsing/re-flattening geometry that hasn't actually changed.
  function renderFrame(): void {
    const t = performance.now() / 1000;
    const chain = new EffectChain(effects.map(toEngineEffect));
    const sampleRate = audio?.context.sampleRate ?? requestedSampleRate;

    let rendered: SampleBuffer;
    let effectiveHz: number;

    if (audioFile) {
      // Passthrough: apply only the per-sample effects (bitcrush) — there's
      // no geometry stage here, so path-level effects like Transform can't
      // apply to a raw audio file.
      const left = Float32Array.from(audioFile.left);
      const right = Float32Array.from(audioFile.right);
      for (let i = 0; i < left.length; i++) {
        const [x, y] = chain.applyToSample(left[i], right[i], { t });
        left[i] = x;
        right[i] = y;
      }
      rendered = { left, right, intensity: new Float32Array(left.length).fill(1) };
      // The buffer's own length/sample rate define its natural playback
      // rate — the trace-frequency slider doesn't apply to pre-recorded audio.
      effectiveHz = sampleRate / rendered.left.length;
    } else {
      // Each layer's own effects apply to just that layer's paths before
      // merging into the scene — otherwise there'd be no way to, say, scale
      // up one shape while scaling down text inside it. The global chain
      // (below) still applies to everything after merging, for effects
      // meant to act on the whole composed image, like Kaleidoscope.
      const allPaths: Path[] = [];
      for (let i = 0; i < layers.length; i++) {
        const layerChain = new EffectChain(layers[i].effects.map(toEngineEffect));
        allPaths.push(...layerChain.applyToPaths(cachedSources[i].render(t), { t }));
      }
      const paths = chain.applyToPaths(allPaths, { t });
      rendered = renderPathsToSamples(paths, {
        sampleRate,
        frameRate: traceHz,
        travelSamples: TRAVEL_SAMPLES,
      });
      for (let i = 0; i < rendered.left.length; i++) {
        const [x, y] = chain.applyToSample(rendered.left[i], rendered.right[i], { t });
        rendered.left[i] = x;
        rendered.right[i] = y;
      }
      effectiveHz = traceHz;
    }

    preview.setBuffer(rendered, effectiveHz);
    if (audioFile) preview.seekTo(audioFileSeekFraction);

    if (audio && state === 'playing') {
      const left = new Float32Array(rendered.left.length);
      const right = new Float32Array(rendered.right.length);
      for (let i = 0; i < rendered.left.length; i++) {
        left[i] = rendered.left[i] * outputLevel;
        right[i] = rendered.right[i] * outputLevel;
      }
      sendSamples(audio.node, left, right);
      if (audioFile) seekAudioTo(audio.node, audioFileSeekFraction);
    }

    // The position label / error text below only exist in the DOM for the
    // currently-selected layer (every other layer is collapsed to a row with
    // no such element) — collapsed video/lua layers keep running and still
    // feed the composed scene either way, their on-screen label just doesn't
    // live-update while collapsed, and self-heals the moment they're
    // re-selected (renderLists() re-renders them fresh at that point).
    for (const layer of layers) {
      if (layer.type !== 'video' || layer.id !== selectedLayerId) continue;
      const label = layersList.querySelector<HTMLSpanElement>(`#video-position-${layer.id}`);
      if (label) label.textContent = formatTime(layer.grabber.currentTime);
    }

    // Surfaces runtime errors (as opposed to compile errors, already handled
    // by compileLuaLayer) — a script can compile fine but still throw for
    // certain values of t. `layer.error` itself is tracked for every lua
    // layer regardless of selection; only the DOM update is skipped.
    for (const layer of layers) {
      if (layer.type !== 'lua') continue;
      const runtimeError = layer.source?.getLastError() ?? null;
      if (runtimeError === layer.error) continue;
      layer.error = runtimeError;
      if (layer.id !== selectedLayerId) continue;
      const errorEl = layersList.querySelector<HTMLParagraphElement>(`#lua-error-${layer.id}`);
      if (errorEl) {
        errorEl.textContent = runtimeError ?? '';
        errorEl.style.display = runtimeError ? '' : 'none';
        errorEl.classList.toggle('osci-warning', !!runtimeError);
      }
    }

    syncAnimationLoop();
  }

  // The expensive entry point: reconstructs Sources from the current layer
  // data (this is where SVG/font/L-system parsing actually happens), then
  // renders one frame. Call this after any edit that changes layer data;
  // renderFrame() alone is enough for anything that's purely time-driven.
  function renderAndUpdate(): void {
    cachedSources = layers.map(toEngineSource);
    renderFrame();
  }

  // Effect ids are unique across both the global list and every layer's own
  // list, so a single lookup can find whichever array actually holds a given
  // effect — the move/remove/param handlers below don't need to know in
  // advance whether they're touching a global or per-layer effect.
  function findEffectList(effectId: string): EffectInstance[] | null {
    if (effects.some((e) => e.id === effectId)) return effects;
    for (const layer of layers) {
      if (layer.effects.some((e) => e.id === effectId)) return layer.effects;
    }
    return null;
  }

  function moveEffect(effectId: string, direction: 'up' | 'down'): void {
    const list = findEffectList(effectId);
    if (!list) return;
    const index = list.findIndex((e) => e.id === effectId);
    if (index === -1) return;
    if (direction === 'up' && index > 0) {
      [list[index - 1], list[index]] = [list[index], list[index - 1]];
    } else if (direction === 'down' && index < list.length - 1) {
      [list[index], list[index + 1]] = [list[index + 1], list[index]];
    }
  }

  function removeEffectById(effectId: string): void {
    const list = findEffectList(effectId);
    if (!list) return;
    const index = list.findIndex((e) => e.id === effectId);
    if (index !== -1) list.splice(index, 1);
  }

  async function compileLuaLayer(layerId: string, scriptText: string): Promise<void> {
    const layer = layers.find((l) => l.id === layerId);
    if (layer?.type !== 'lua') return;
    layer.scriptText = scriptText;

    try {
      const newSource = await LuaSource.fromScript(scriptText);
      // Only swap in the new source (and drop the old one) on success, so a
      // syntax error while iterating doesn't blank out the last-working shape.
      const staleSource = layer.source;
      layer.source = newSource;
      layer.error = null;
      staleSource?.dispose();
    } catch (err) {
      layer.error = err instanceof Error ? err.message : String(err);
    }

    renderLists();
    renderAndUpdate();
  }

  // Every non-selected layer collapses to one of these rows instead of its
  // full editor — clicking anywhere on the row (except Remove) selects it.
  // The existing dispatch pattern keys off the exact clicked element's own
  // data-action, not a closest()-ancestor lookup, so the Remove button's
  // click won't also trigger select-layer.
  function renderCollapsedLayerRow(layer: ShapeLayer, typeTag: string, label: string): string {
    return `
      <div class="osci-card osci-layer-row" data-action="select-layer" data-layer-id="${layer.id}">
        <span class="osci-layer-row-type">${typeTag}</span>
        <span class="osci-layer-row-label">${label}</span>
        <button data-action="remove-layer" data-layer-id="${layer.id}">Remove</button>
      </div>
    `;
  }

  function renderParametricLayerHtml(layer: Extract<ShapeLayer, { type: 'parametric' }>, isSelected: boolean): string {
    const s = layer.shape;
    if (!isSelected) return renderCollapsedLayerRow(layer, 'Shape', s.kind);

    const kindOptions = SHAPE_KINDS.map(
      (k) => `<option value="${k}" ${s.kind === k ? 'selected' : ''}>${k}</option>`,
    ).join('');

    const params =
      s.kind === 'lissajous'
        ? `
        <label>Freq X <input type="number" step="1" value="${s.freqX}" data-action="set-shape-param" data-layer-id="${layer.id}" data-param="freqX" style="width:4rem" /></label>
        <label>Freq Y <input type="number" step="1" value="${s.freqY}" data-action="set-shape-param" data-layer-id="${layer.id}" data-param="freqY" style="width:4rem" /></label>
        <label>Phase <input type="number" step="0.1" value="${s.phase}" data-action="set-shape-param" data-layer-id="${layer.id}" data-param="phase" style="width:5rem" /></label>
      `
        : '';

    return `
      <div class="osci-card">
        <div class="osci-card-header">
          <select data-action="set-shape-kind" data-layer-id="${layer.id}">${kindOptions}</select>
          <button data-action="remove-layer" data-layer-id="${layer.id}">Remove</button>
        </div>
        ${params}
      </div>
    `;
  }

  function renderSvgLayerHtml(layer: Extract<ShapeLayer, { type: 'svg' }>, isSelected: boolean): string {
    if (!isSelected) return renderCollapsedLayerRow(layer, 'SVG', escapeHtml(layer.label));
    return `
      <div class="osci-card">
        <div class="osci-card-header">
          <strong>SVG: ${escapeHtml(layer.label)}</strong>
          <button data-action="remove-layer" data-layer-id="${layer.id}">Remove</button>
        </div>
        <label>
          Path data (one "d" per line, or paste full SVG markup)
          <textarea data-action="set-svg-paths" data-layer-id="${layer.id}" rows="3">${escapeHtml(layer.paths.join('\n'))}</textarea>
        </label>
      </div>
    `;
  }

  function renderTextLayerHtml(layer: Extract<ShapeLayer, { type: 'text' }>, isSelected: boolean): string {
    if (!isSelected) return renderCollapsedLayerRow(layer, 'Text', escapeHtml(layer.label));
    return `
      <div class="osci-card">
        <div class="osci-card-header">
          <strong>Text: ${escapeHtml(layer.label)}</strong>
          <div class="osci-card-actions">
            <button data-action="change-text-font" data-layer-id="${layer.id}">Custom font...</button>
            <button data-action="remove-layer" data-layer-id="${layer.id}">Remove</button>
          </div>
        </div>
        <label>Text
          <input type="text" value="${escapeHtml(layer.text)}" data-action="set-text-content" data-layer-id="${layer.id}" style="width:100%" />
        </label>
        <label>Size <input type="number" step="1" min="1" value="${layer.fontSize}" data-action="set-text-size" data-layer-id="${layer.id}" style="width:5rem" /></label>
      </div>
    `;
  }

  function renderLSystemLayerHtml(layer: Extract<ShapeLayer, { type: 'lsystem' }>, isSelected: boolean): string {
    if (!isSelected) return renderCollapsedLayerRow(layer, 'L-system', escapeHtml(layer.presetLabel));

    const presetOptions = LSYSTEM_PRESETS.map(
      (p) =>
        `<option value="${escapeHtml(p.label)}" ${p.label === layer.presetLabel ? 'selected' : ''}>${escapeHtml(p.label)}</option>`,
    ).join('');

    return `
      <div class="osci-card">
        <div class="osci-card-header">
          <strong>L-system</strong>
          <button data-action="remove-layer" data-layer-id="${layer.id}">Remove</button>
        </div>
        <label>Preset
          <select data-action="set-lsystem-preset" data-layer-id="${layer.id}">${presetOptions}</select>
        </label>
        <label>Axiom <input type="text" value="${escapeHtml(layer.axiom)}" data-action="set-lsystem-axiom" data-layer-id="${layer.id}" style="width:100%" /></label>
        <label>
          Rules (one per line, e.g. "F=F-F++F-F")
          <textarea data-action="set-lsystem-rules" data-layer-id="${layer.id}" rows="2">${escapeHtml(layer.rulesText)}</textarea>
        </label>
        <label>Angle (deg) <input type="number" step="1" value="${layer.angleDeg}" data-action="set-lsystem-angle" data-layer-id="${layer.id}" style="width:4rem" /></label>
        <label>Iterations <input type="number" step="1" min="0" max="7" value="${layer.iterations}" data-action="set-lsystem-iterations" data-layer-id="${layer.id}" style="width:4rem" /></label>
        <label>Draw symbols <input type="text" value="${escapeHtml(layer.drawSymbols)}" data-action="set-lsystem-draw-symbols" data-layer-id="${layer.id}" style="width:4rem" /></label>
      </div>
    `;
  }

  function renderMeshLayerHtml(layer: Extract<ShapeLayer, { type: 'mesh' }>, isSelected: boolean): string {
    if (!isSelected) return renderCollapsedLayerRow(layer, '3D', escapeHtml(layer.label));
    return `
      <div class="osci-card">
        <div class="osci-card-header">
          <strong>3D: ${escapeHtml(layer.label)}</strong>
          <button data-action="remove-layer" data-layer-id="${layer.id}">Remove</button>
        </div>
        <label>${layer.model.vertices.length} vertices, ${layer.model.faces.length} faces</label>
        <label>Rotate X (deg/s) <input type="number" step="5" value="${layer.rotationSpeed.x}" data-action="set-mesh-rotation" data-layer-id="${layer.id}" data-axis="x" style="width:4rem" /></label>
        <label>Rotate Y (deg/s) <input type="number" step="5" value="${layer.rotationSpeed.y}" data-action="set-mesh-rotation" data-layer-id="${layer.id}" data-axis="y" style="width:4rem" /></label>
        <label>Rotate Z (deg/s) <input type="number" step="5" value="${layer.rotationSpeed.z}" data-action="set-mesh-rotation" data-layer-id="${layer.id}" data-axis="z" style="width:4rem" /></label>
      </div>
    `;
  }

  function renderVideoLayerHtml(layer: Extract<ShapeLayer, { type: 'video' }>, isSelected: boolean): string {
    if (!isSelected) return renderCollapsedLayerRow(layer, 'Video', escapeHtml(layer.label));
    const duration = layer.grabber.duration;
    return `
      <div class="osci-card">
        <div class="osci-card-header">
          <strong>Video: ${escapeHtml(layer.label)}</strong>
          <div class="osci-card-actions">
            <button data-action="toggle-video-play" data-layer-id="${layer.id}">${layer.grabber.paused ? 'Play' : 'Pause'}</button>
            <button data-action="remove-layer" data-layer-id="${layer.id}">Remove</button>
          </div>
        </div>
        <label>Edge threshold <input type="range" min="0" max="100" step="1" value="${Math.round(layer.threshold * 100)}" data-action="set-video-threshold" data-layer-id="${layer.id}" /></label>
        <label>Position: <span id="video-position-${layer.id}">${formatTime(layer.grabber.currentTime)}</span> / ${formatTime(duration)}
          <input type="range" min="0" max="1000" step="1" value="${duration ? Math.round((layer.grabber.currentTime / duration) * 1000) : 0}" data-action="set-video-seek" data-layer-id="${layer.id}" data-no-knob="true" />
        </label>
      </div>
    `;
  }

  function renderLuaLayerHtml(layer: Extract<ShapeLayer, { type: 'lua' }>, isSelected: boolean): string {
    if (!isSelected) return renderCollapsedLayerRow(layer, 'Lua', escapeHtml(layer.presetLabel));

    const presetOptions = LUA_PRESETS.map(
      (p) =>
        `<option value="${escapeHtml(p.label)}" ${p.label === layer.presetLabel ? 'selected' : ''}>${escapeHtml(p.label)}</option>`,
    ).join('');

    const errorHtml = layer.error
      ? `<p class="osci-warning" id="lua-error-${layer.id}">${escapeHtml(layer.error)}</p>`
      : `<p id="lua-error-${layer.id}" style="display:none;"></p>`;

    return `
      <div class="osci-card">
        <div class="osci-card-header">
          <strong>Lua script</strong>
          <div class="osci-card-actions">
            <button data-action="run-lua" data-layer-id="${layer.id}">Run</button>
            <button data-action="remove-layer" data-layer-id="${layer.id}">Remove</button>
          </div>
        </div>
        <label>Preset
          <select data-action="set-lua-preset" data-layer-id="${layer.id}">${presetOptions}</select>
        </label>
        <label>
          generate(t) must return an array of {x, y} points — an infinite loop here will freeze the tab, so save your work before experimenting.
          <textarea data-action="lua-script-text" data-layer-id="${layer.id}" rows="10" style="font-size:0.75rem;">${escapeHtml(layer.scriptText)}</textarea>
        </label>
        ${errorHtml}
      </div>
    `;
  }

  function renderLayerHtml(layer: ShapeLayer): string {
    const isSelected = layer.id === selectedLayerId;
    switch (layer.type) {
      case 'parametric':
        return renderParametricLayerHtml(layer, isSelected);
      case 'svg':
        return renderSvgLayerHtml(layer, isSelected);
      case 'text':
        return renderTextLayerHtml(layer, isSelected);
      case 'lsystem':
        return renderLSystemLayerHtml(layer, isSelected);
      case 'mesh':
        return renderMeshLayerHtml(layer, isSelected);
      case 'video':
        return renderVideoLayerHtml(layer, isSelected);
      case 'lua':
        return renderLuaLayerHtml(layer, isSelected);
    }
  }

  function renderEffectHtml(effect: EffectInstance, index: number, total: number): string {
    let params: string;
    switch (effect.kind) {
      case 'transform':
        params = renderControlGroup([
          {
            label: 'Rotate (rad)',
            control: `<input type="number" step="0.1" value="${effect.params.rotate ?? 0}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="rotate" style="width:4.5rem" />`,
          },
          {
            label: 'Scale',
            control: `<input type="number" step="0.05" value="${effect.params.scale ?? 1}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="scale" style="width:4rem" />`,
          },
          {
            label: 'Translate X',
            control: `<input type="number" step="0.05" value="${effect.params.translateX ?? 0}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="translateX" style="width:4rem" />`,
          },
          {
            label: 'Translate Y',
            control: `<input type="number" step="0.05" value="${effect.params.translateY ?? 0}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="translateY" style="width:4rem" />`,
          },
        ]);
        break;
      case 'bitcrush':
        params = renderControlGroup([
          {
            label: 'Levels',
            control: `<input type="number" step="1" min="2" value="${effect.params.levels}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="levels" style="width:4rem" />`,
          },
        ]);
        break;
      case 'ripple':
        params = renderControlGroup([
          {
            label: 'Depth',
            control: `<input type="number" step="0.01" value="${effect.params.depth ?? 0.1}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="depth" style="width:4rem" />`,
          },
          {
            label: 'Frequency',
            control: `<input type="number" step="1" value="${effect.params.frequency ?? 10}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="frequency" style="width:4rem" />`,
          },
          {
            label: 'Speed (0=static)',
            control: `<input type="number" step="0.1" value="${effect.params.speed ?? 0}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="speed" style="width:4rem" />`,
          },
        ]);
        break;
      case 'swirl':
        params = renderControlGroup([
          {
            label: 'Amount',
            control: `<input type="number" step="0.1" value="${effect.params.amount ?? 1}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="amount" style="width:4rem" />`,
          },
          {
            label: 'Speed (0=static)',
            control: `<input type="number" step="0.1" value="${effect.params.speed ?? 0}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="speed" style="width:4rem" />`,
          },
        ]);
        break;
      case 'smoothing':
        params = renderControlGroup([
          {
            label: 'Amount',
            control: `<input type="number" step="0.05" min="0" max="1" value="${effect.params.amount ?? 0.5}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="amount" style="width:4rem" />`,
          },
          {
            label: 'Iterations',
            control: `<input type="number" step="1" min="0" value="${effect.params.iterations ?? 1}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="iterations" style="width:4rem" />`,
          },
        ]);
        break;
      case 'kaleidoscope':
        params = `
        ${renderControlGroup([
          {
            label: 'Segments',
            control: `<input type="number" step="1" min="1" value="${effect.params.segments ?? 6}" data-action="set-effect-param" data-effect-id="${effect.id}" data-param="segments" style="width:4rem" />`,
          },
        ])}
        <label class="osci-inline-label"><input type="checkbox" ${effect.params.mirror ?? true ? 'checked' : ''} data-action="set-effect-bool-param" data-effect-id="${effect.id}" data-param="mirror" /> Mirror</label>
      `;
        break;
    }

    return `
      <div class="osci-card" data-effect-kind="${effect.kind}">
        <div class="osci-card-header">
          <strong>${effect.kind}</strong>
          <div class="osci-card-actions">
            <button data-action="move-effect-up" data-effect-id="${effect.id}" ${index === 0 ? 'disabled' : ''}>Up</button>
            <button data-action="move-effect-down" data-effect-id="${effect.id}" ${index === total - 1 ? 'disabled' : ''}>Down</button>
            <button data-action="remove-effect" data-effect-id="${effect.id}">Remove</button>
          </div>
        </div>
        ${params}
      </div>
    `;
  }

  // Effects that target just one shape — e.g. scaling up a decorative shape
  // without also scaling the text inside it. The global Effects section
  // (separate list, same renderEffectHtml) still applies to the whole
  // composed scene afterward. Rendered into the dedicated #layer-effects-panel
  // in the center column (see renderSelectedLayerEffectsHtml), not nested
  // inside the layer's own card, so it stays visible regardless of whether
  // that layer is collapsed or expanded in the Shapes column.
  function renderLayerEffectsHtml(layer: ShapeLayer): string {
    const effectsHtml = layer.effects.map((e, i) => renderEffectHtml(e, i, layer.effects.length)).join('');
    return `
      <div class="osci-button-row">
        <button data-action="add-layer-effect" data-layer-id="${layer.id}" data-effect-kind="transform">+ Transform</button>
        <button data-action="add-layer-effect" data-layer-id="${layer.id}" data-effect-kind="bitcrush">+ Bitcrush</button>
        <button data-action="add-layer-effect" data-layer-id="${layer.id}" data-effect-kind="ripple">+ Ripple</button>
        <button data-action="add-layer-effect" data-layer-id="${layer.id}" data-effect-kind="swirl">+ Swirl</button>
        <button data-action="add-layer-effect" data-layer-id="${layer.id}" data-effect-kind="smoothing">+ Smoothing</button>
        <button data-action="add-layer-effect" data-layer-id="${layer.id}" data-effect-kind="kaleidoscope">+ Kaleidoscope</button>
      </div>
      <div class="osci-list">${effectsHtml}</div>
    `;
  }

  function renderSelectedLayerEffectsHtml(): string {
    const layer = layers.find((l) => l.id === selectedLayerId);
    return `
      <section class="osci-section">
        <div class="osci-section-header">
          <h2 class="osci-section-title">Layer Effects (applied to selected shape)</h2>
        </div>
        ${layer ? renderLayerEffectsHtml(layer) : '<p style="font-size:0.75rem;color:var(--text-dim);margin:0;">Select a shape to edit its effects.</p>'}
      </section>
    `;
  }

  function renderAudiofileSlot(): string {
    if (!audioFile) return '';
    const durationSeconds = audioFile.left.length / audioFile.sampleRate;
    return `
      <div class="osci-card">
        <div class="osci-card-header">
          <strong>${escapeHtml(audioFile.label)}</strong>
          <button data-action="remove-audiofile">Remove</button>
        </div>
        <label>Shape layers above are ignored while this is loaded</label>
        <label>Position: <span id="audiofile-position-label">${formatTime(audioFileSeekFraction * durationSeconds)}</span> / ${formatTime(durationSeconds)}
          <input id="audiofile-seek" type="range" min="0" max="1000" step="1" value="${Math.round(audioFileSeekFraction * 1000)}" data-no-knob="true" />
        </label>
      </div>
    `;
  }

  function renderLists(): void {
    layersList.innerHTML = layers.map(renderLayerHtml).join('');
    audiofileSlot.innerHTML = renderAudiofileSlot();
    effectsList.innerHTML = effects.map((e, i) => renderEffectHtml(e, i, effects.length)).join('');
    layerEffectsPanel.innerHTML = renderSelectedLayerEffectsHtml();
    // xyPadify() is idempotent (guarded by pad.dataset.xyPadified) and must
    // run before enhanceRangeInputsAsKnobs() below, since it's what marks
    // the pad's two backing range inputs data-no-knob so the knob pass
    // skips them instead of replacing them with rotary knobs.
    xyPadify(synthChordsXyPad, synthChordsPitchRangeInput, synthChordsDensityInput);
    // Scans the whole app, not just the containers above — this is also
    // what knobifies the static Synth/playback-bar sliders on renderLists()'s
    // first call at startup. Already-knobified inputs are skipped, so
    // re-scanning on every call is safe and only picks up newly rendered ones.
    enhanceRangeInputsAsKnobs(root);
  }

  layersList.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    const action = target.dataset.action;

    const layer = layers.find((l) => l.id === target.dataset.layerId);
    if (!layer) return;

    if (action === 'set-shape-param' && layer.type === 'parametric' && layer.shape.kind === 'lissajous') {
      const value = Number(target.value);
      if (Number.isNaN(value)) return;
      (layer.shape as unknown as Record<string, number>)[target.dataset.param!] = value;
      renderAndUpdate();
    } else if (action === 'set-text-content' && layer.type === 'text') {
      layer.text = target.value;
      renderAndUpdate();
    } else if (action === 'set-text-size' && layer.type === 'text') {
      const value = Number(target.value);
      if (Number.isNaN(value) || value <= 0) return;
      layer.fontSize = value;
      renderAndUpdate();
    } else if (action === 'set-lsystem-axiom' && layer.type === 'lsystem') {
      layer.axiom = target.value;
      renderAndUpdate();
    } else if (action === 'set-lsystem-angle' && layer.type === 'lsystem') {
      const value = Number(target.value);
      if (Number.isNaN(value)) return;
      layer.angleDeg = value;
      renderAndUpdate();
    } else if (action === 'set-lsystem-iterations' && layer.type === 'lsystem') {
      const value = Number(target.value);
      if (Number.isNaN(value) || value < 0) return;
      layer.iterations = value;
      renderAndUpdate();
    } else if (action === 'set-lsystem-draw-symbols' && layer.type === 'lsystem') {
      layer.drawSymbols = target.value;
      renderAndUpdate();
    } else if (action === 'set-mesh-rotation' && layer.type === 'mesh') {
      const value = Number(target.value);
      if (Number.isNaN(value)) return;
      const axis = target.dataset.axis as 'x' | 'y' | 'z';
      layer.rotationSpeed[axis] = value;
      renderAndUpdate();
    } else if (action === 'set-video-threshold' && layer.type === 'video') {
      layer.threshold = Number(target.value) / 100;
      renderAndUpdate();
    } else if (action === 'set-video-seek' && layer.type === 'video') {
      const fraction = Number(target.value) / 1000;
      layer.grabber.seekTo(fraction);
      const label = layersList.querySelector<HTMLSpanElement>(`#video-position-${layer.id}`);
      if (label) label.textContent = formatTime(fraction * layer.grabber.duration);
    } else if (action === 'lua-script-text' && layer.type === 'lua') {
      // Just keeps state in sync with what's typed — doesn't recompile.
      // Otherwise an unrelated renderLists() (e.g. adding a different layer)
      // would re-render this textarea from stale scriptText and silently
      // discard whatever the user was in the middle of typing.
      layer.scriptText = target.value;
    }
  });

  layersList.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement | HTMLTextAreaElement | HTMLInputElement;
    const action = target.dataset.action;

    const layer = layers.find((l) => l.id === target.dataset.layerId);
    if (!layer) return;

    if (action === 'set-shape-kind' && layer.type === 'parametric') {
      layer.shape = defaultShape((target as HTMLSelectElement).value as ParametricShape['kind']);
      renderLists();
      renderAndUpdate();
    } else if (action === 'set-svg-paths' && layer.type === 'svg') {
      layer.paths = extractPathData((target as HTMLTextAreaElement).value);
      renderAndUpdate();
    } else if (action === 'set-lsystem-rules' && layer.type === 'lsystem') {
      layer.rulesText = (target as HTMLTextAreaElement).value;
      renderAndUpdate();
    } else if (action === 'set-lsystem-preset' && layer.type === 'lsystem') {
      const preset = LSYSTEM_PRESETS.find((p) => p.label === (target as HTMLSelectElement).value);
      if (!preset) return;
      layer.presetLabel = preset.label;
      layer.axiom = preset.axiom;
      layer.rulesText = preset.rulesText;
      layer.angleDeg = preset.angleDeg;
      layer.iterations = preset.iterations;
      layer.drawSymbols = preset.drawSymbols;
      renderLists();
      renderAndUpdate();
    } else if (action === 'set-lua-preset' && layer.type === 'lua') {
      const preset = LUA_PRESETS.find((p) => p.label === (target as HTMLSelectElement).value);
      if (!preset) return;
      layer.presetLabel = preset.label;
      // compileLuaLayer sets scriptText itself and re-renders on completion.
      void compileLuaLayer(layer.id, preset.script);
    }
  });

  layersList.addEventListener('click', (event) => {
    const target = event.target as HTMLButtonElement;
    const action = target.dataset.action;
    if (action === 'remove-layer') {
      const removedIndex = layers.findIndex((l) => l.id === target.dataset.layerId);
      if (removedIndex === -1) return;
      const removed = layers[removedIndex];
      const wasSelected = removed.id === selectedLayerId;
      if (removed.type === 'video') removed.grabber.dispose();
      if (removed.type === 'lua') removed.source?.dispose();
      layers = layers.filter((l) => l.id !== target.dataset.layerId);
      // The removed layer's index no longer points anywhere valid post-filter
      // — fall back to whichever layer now sits at that position (or the new
      // last layer, or none), only when the removed layer was the selected one.
      if (wasSelected) selectedLayerId = layers[Math.min(removedIndex, layers.length - 1)]?.id ?? null;
      renderLists();
      renderAndUpdate();
    } else if (action === 'select-layer') {
      selectedLayerId = target.dataset.layerId ?? null;
      renderLists();
    } else if (action === 'change-text-font') {
      pendingFontTargetLayerId = target.dataset.layerId ?? null;
      fontFileInput.click();
    } else if (action === 'toggle-video-play') {
      const layer = layers.find((l) => l.id === target.dataset.layerId);
      if (layer?.type !== 'video') return;
      if (layer.grabber.paused) layer.grabber.play();
      else layer.grabber.pause();
      renderLists();
    } else if (action === 'run-lua') {
      const layer = layers.find((l) => l.id === target.dataset.layerId);
      if (layer?.type !== 'lua') return;
      const textarea = layersList.querySelector<HTMLTextAreaElement>(
        `textarea[data-action="lua-script-text"][data-layer-id="${layer.id}"]`,
      );
      void compileLuaLayer(layer.id, textarea?.value ?? layer.scriptText);
    }
  });

  // Layer-scoped effects now render into their own panel (see
  // renderSelectedLayerEffectsHtml), not nested inside the layer's own card
  // in #layers-list, so these listeners are attached to that panel instead.
  layerEffectsPanel.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.action !== 'set-effect-param') return;
    const effectId = target.dataset.effectId;
    const list = effectId ? findEffectList(effectId) : null;
    const effect = list?.find((e) => e.id === effectId);
    if (!effect) return;
    const value = Number(target.value);
    if (Number.isNaN(value)) return;
    (effect.params as unknown as Record<string, number>)[target.dataset.param!] = value;
    renderAndUpdate();
  });

  layerEffectsPanel.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.action !== 'set-effect-bool-param' || target.type !== 'checkbox') return;
    const effectId = target.dataset.effectId;
    const list = effectId ? findEffectList(effectId) : null;
    const effect = list?.find((e) => e.id === effectId);
    if (!effect) return;
    (effect.params as unknown as Record<string, boolean>)[target.dataset.param!] = target.checked;
    renderAndUpdate();
  });

  layerEffectsPanel.addEventListener('click', (event) => {
    const target = event.target as HTMLButtonElement;
    const action = target.dataset.action;
    if (action === 'add-layer-effect') {
      const layer = layers.find((l) => l.id === target.dataset.layerId);
      if (!layer) return;
      const kind = target.dataset.effectKind as EffectInstance['kind'];
      layer.effects.push(createDefaultEffectInstance(kind));
      renderLists();
      renderAndUpdate();
    } else if (action === 'move-effect-up' || action === 'move-effect-down') {
      const effectId = target.dataset.effectId;
      if (!effectId) return;
      moveEffect(effectId, action === 'move-effect-up' ? 'up' : 'down');
      renderLists();
      renderAndUpdate();
    } else if (action === 'remove-effect') {
      const effectId = target.dataset.effectId;
      if (!effectId) return;
      removeEffectById(effectId);
      renderLists();
      renderAndUpdate();
    }
  });

  audiofileSlot.addEventListener('click', (event) => {
    const target = event.target as HTMLButtonElement;
    if (target.dataset.action !== 'remove-audiofile') return;
    audioFile = null;
    renderLists();
    renderAndUpdate();
  });

  audiofileSlot.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.id !== 'audiofile-seek' || !audioFile) return;
    audioFileSeekFraction = Number(target.value) / 1000;

    const durationSeconds = audioFile.left.length / audioFile.sampleRate;
    const positionLabel = audiofileSlot.querySelector<HTMLSpanElement>('#audiofile-position-label');
    if (positionLabel) positionLabel.textContent = formatTime(audioFileSeekFraction * durationSeconds);

    preview.seekTo(audioFileSeekFraction);
    if (audio) seekAudioTo(audio.node, audioFileSeekFraction);
  });

  effectsList.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.action !== 'set-effect-param') return;
    const effect = effects.find((e) => e.id === target.dataset.effectId);
    if (!effect) return;
    const value = Number(target.value);
    if (Number.isNaN(value)) return;
    (effect.params as unknown as Record<string, number>)[target.dataset.param!] = value;
    renderAndUpdate();
  });

  effectsList.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.action !== 'set-effect-bool-param' || target.type !== 'checkbox') return;
    const effect = effects.find((e) => e.id === target.dataset.effectId);
    if (!effect) return;
    (effect.params as unknown as Record<string, boolean>)[target.dataset.param!] = target.checked;
    renderAndUpdate();
  });

  effectsList.addEventListener('click', (event) => {
    const target = event.target as HTMLButtonElement;
    const action = target.dataset.action;
    const effectId = target.dataset.effectId;
    if (!action || !effectId) return;
    const index = effects.findIndex((e) => e.id === effectId);
    if (index === -1) return;

    if (action === 'remove-effect') {
      effects.splice(index, 1);
    } else if (action === 'move-effect-up' && index > 0) {
      [effects[index - 1], effects[index]] = [effects[index], effects[index - 1]];
    } else if (action === 'move-effect-down' && index < effects.length - 1) {
      [effects[index], effects[index + 1]] = [effects[index + 1], effects[index]];
    } else {
      return;
    }
    renderLists();
    renderAndUpdate();
  });

  root.querySelector('[data-action="add-layer"]')!.addEventListener('click', () => {
    const id = genId();
    layers.push({ id, type: 'parametric', shape: defaultShape('lissajous'), effects: [] });
    selectedLayerId = id;
    renderLists();
    renderAndUpdate();
  });

  root.querySelector('[data-action="add-svg"]')!.addEventListener('click', () => {
    svgFileInput.click();
  });

  svgFileInput.addEventListener('change', async () => {
    const file = svgFileInput.files?.[0];
    svgFileInput.value = '';
    if (!file) return;
    const text = await file.text();
    const id = genId();
    layers.push({ id, type: 'svg', label: file.name, paths: extractPathData(text), effects: [] });
    selectedLayerId = id;
    renderLists();
    renderAndUpdate();
  });

  root.querySelector('[data-action="add-text"]')!.addEventListener('click', async () => {
    const font = await getDefaultFont();
    if (!font) return;
    const id = genId();
    layers.push({ id, type: 'text', label: 'Arimo (default)', font, text: 'Hello', fontSize: 72, effects: [] });
    selectedLayerId = id;
    renderLists();
    renderAndUpdate();
  });

  fontFileInput.addEventListener('change', async () => {
    const file = fontFileInput.files?.[0];
    const targetLayerId = pendingFontTargetLayerId;
    pendingFontTargetLayerId = null;
    fontFileInput.value = '';
    if (!file || !targetLayerId) return;
    try {
      const font = parseFont(await file.arrayBuffer());
      const layer = layers.find((l) => l.id === targetLayerId);
      if (layer && layer.type === 'text') {
        layer.font = font;
        layer.label = file.name;
      }
      renderLists();
      renderAndUpdate();
    } catch (err) {
      console.error('Could not parse font file', file.name, err);
    }
  });

  root.querySelector('[data-action="add-lsystem"]')!.addEventListener('click', () => {
    const preset = LSYSTEM_PRESETS[0];
    const id = genId();
    layers.push({
      id,
      type: 'lsystem',
      presetLabel: preset.label,
      axiom: preset.axiom,
      rulesText: preset.rulesText,
      angleDeg: preset.angleDeg,
      iterations: preset.iterations,
      drawSymbols: preset.drawSymbols,
      effects: [],
    });
    selectedLayerId = id;
    renderLists();
    renderAndUpdate();
  });

  root.querySelector('[data-action="add-mesh"]')!.addEventListener('click', () => {
    meshFileInput.click();
  });

  meshFileInput.addEventListener('change', async () => {
    const file = meshFileInput.files?.[0];
    meshFileInput.value = '';
    if (!file) return;
    try {
      const lowerName = file.name.toLowerCase();
      const model = normalizeMeshModel(
        lowerName.endsWith('.glb')
          ? parseGltf(await file.arrayBuffer())
          : lowerName.endsWith('.gltf')
            ? parseGltf(await file.text())
            : parseObj(await file.text()),
      );
      const id = genId();
      layers.push({
        id,
        type: 'mesh',
        label: file.name,
        model,
        rotationSpeed: { x: 0, y: 20, z: 0 },
        effects: [],
      });
      selectedLayerId = id;
      renderLists();
      renderAndUpdate();
    } catch (err) {
      console.error('Could not parse 3D model file', file.name, err);
    }
  });

  root.querySelector('[data-action="add-video"]')!.addEventListener('click', () => {
    videoFileInput.click();
  });

  videoFileInput.addEventListener('change', async () => {
    const file = videoFileInput.files?.[0];
    videoFileInput.value = '';
    if (!file) return;
    try {
      const grabber = new VideoFrameGrabber(64, 64);
      await grabber.loadFile(file);
      const id = genId();
      layers.push({ id, type: 'video', label: file.name, grabber, threshold: 0.25, effects: [] });
      selectedLayerId = id;
      renderLists();
      renderAndUpdate();
    } catch (err) {
      console.error('Could not load video file', file.name, err);
    }
  });

  root.querySelector('[data-action="add-lua"]')!.addEventListener('click', () => {
    const id = genId();
    const preset = LUA_PRESETS[0];
    layers.push({
      id,
      type: 'lua',
      presetLabel: preset.label,
      scriptText: preset.script,
      source: null,
      error: null,
      effects: [],
    });
    selectedLayerId = id;
    renderLists();
    renderAndUpdate();
    void compileLuaLayer(id, preset.script);
  });

  root.querySelector('[data-action="add-audiofile"]')!.addEventListener('click', () => {
    audiofileInput.click();
  });

  audiofileInput.addEventListener('change', async () => {
    const file = audiofileInput.files?.[0];
    audiofileInput.value = '';
    if (!file) return;
    try {
      const sampleRate = audio?.context.sampleRate ?? requestedSampleRate;
      const decoded = await decodeAudioFile(await file.arrayBuffer(), sampleRate);
      audioFile = { label: file.name, left: decoded.left, right: decoded.right, sampleRate };
      audioFileSeekFraction = 0;
      renderLists();
      renderAndUpdate();
    } catch (err) {
      console.error('Could not decode audio file', file.name, err);
    }
  });

  root.querySelector('[data-action="add-transform"]')!.addEventListener('click', () => {
    effects.push({ id: genId(), kind: 'transform', params: {} });
    renderLists();
    renderAndUpdate();
  });

  root.querySelector('[data-action="add-bitcrush"]')!.addEventListener('click', () => {
    effects.push({ id: genId(), kind: 'bitcrush', params: { levels: 16 } });
    renderLists();
    renderAndUpdate();
  });

  root.querySelector('[data-action="add-ripple"]')!.addEventListener('click', () => {
    effects.push({ id: genId(), kind: 'ripple', params: {} });
    renderLists();
    renderAndUpdate();
  });

  root.querySelector('[data-action="add-swirl"]')!.addEventListener('click', () => {
    effects.push({ id: genId(), kind: 'swirl', params: {} });
    renderLists();
    renderAndUpdate();
  });

  root.querySelector('[data-action="add-smoothing"]')!.addEventListener('click', () => {
    effects.push({ id: genId(), kind: 'smoothing', params: {} });
    renderLists();
    renderAndUpdate();
  });

  root.querySelector('[data-action="add-kaleidoscope"]')!.addEventListener('click', () => {
    effects.push({ id: genId(), kind: 'kaleidoscope', params: {} });
    renderLists();
    renderAndUpdate();
  });

  traceHzInput.addEventListener('input', () => {
    traceHz = sliderToHz(Number(traceHzInput.value));
    traceHzLabel.textContent = String(traceHz);
    renderAndUpdate();
  });
  levelInput.addEventListener('input', () => {
    outputLevel = Number(levelInput.value);
    levelLabel.textContent = outputLevel.toFixed(2);
    renderAndUpdate();
  });
  sampleRateSelect.addEventListener('change', () => {
    requestedSampleRate = Number(sampleRateSelect.value);
  });

  const setTransportState = (playing: boolean): void => {
    toggleStartButton.classList.toggle('osci-toggle-active', playing);
    toggleStartButton.disabled = playing;
    toggleStopButton.disabled = !playing;
  };
  setTransportState(false);

  toggleStartButton.addEventListener('click', async () => {
    if (state !== 'stopped') return;
    audio = await createAudioGraph({ sampleRate: requestedSampleRate });
    state = 'playing';
    setTransportState(true);
    shapePreviewRunning = true;
    if (previewMode === 'shapes') preview.start();
    renderAndUpdate();
  });

  toggleStopButton.addEventListener('click', async () => {
    if (state !== 'playing') return;
    audio?.node.disconnect();
    await audio?.context.close();
    audio = null;
    state = 'stopped';
    setTransportState(false);
    shapePreviewRunning = false;
    if (previewMode === 'shapes') preview.stop();
  });

  synthToggle.addEventListener('click', async () => {
    if (!synthGraph) {
      try {
        synthGraph = await createSynthGraph({ sampleRate: requestedSampleRate });
        sendSynthParams(synthGraph.node, synthParams);
        applySynthEffects(synthGraph);
        previewMode = 'synth';
        previewModeLabel.textContent = 'Synth Waveform (live)';
        preview.stop();
        synthWaveformPreview.setAnalyser(synthGraph.analyser);
        synthWaveformPreview.start();
        synthToggle.textContent = 'Disable Synth';
        synthToggle.classList.add('osci-toggle-active');
        synthStatus.style.display = 'none';
      } catch (err) {
        console.error('Could not start the synth', err);
        synthStatus.textContent = `Couldn't start the synth: ${err instanceof Error ? err.message : String(err)}`;
        synthStatus.style.display = '';
      }
    } else {
      synthGraph.node.disconnect();
      await synthGraph.context.close();
      synthGraph = null;
      synthWaveformPreview.stop();
      synthWaveformPreview.setAnalyser(null);
      previewMode = 'shapes';
      previewModeLabel.textContent = 'Shape / Audio Trace';
      if (shapePreviewRunning) preview.start();
      synthToggle.textContent = 'Enable Synth';
      synthToggle.classList.remove('osci-toggle-active');
    }
  });

  synthWaveformSelect.addEventListener('change', () => {
    synthParams.oscillator.waveform = synthWaveformSelect.value as OscillatorWaveform;
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });

  synthAttackInput.addEventListener('input', () => {
    synthParams.envelope.attack = Number(synthAttackInput.value);
    synthAttackLabel.textContent = synthParams.envelope.attack.toFixed(2);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthDecayInput.addEventListener('input', () => {
    synthParams.envelope.decay = Number(synthDecayInput.value);
    synthDecayLabel.textContent = synthParams.envelope.decay.toFixed(2);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthSustainInput.addEventListener('input', () => {
    synthParams.envelope.sustain = Number(synthSustainInput.value);
    synthSustainLabel.textContent = synthParams.envelope.sustain.toFixed(2);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthReleaseInput.addEventListener('input', () => {
    synthParams.envelope.release = Number(synthReleaseInput.value);
    synthReleaseLabel.textContent = synthParams.envelope.release.toFixed(2);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthVolumeInput.addEventListener('input', () => {
    synthParams.volume = Number(synthVolumeInput.value);
    synthVolumeLabel.textContent = synthParams.volume.toFixed(2);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthCutoffInput.addEventListener('input', () => {
    synthParams.filter.cutoff = Number(synthCutoffInput.value);
    synthCutoffLabel.textContent = String(synthParams.filter.cutoff);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthResonanceInput.addEventListener('input', () => {
    synthParams.filter.resonance = Number(synthResonanceInput.value);
    synthResonanceLabel.textContent = synthParams.filter.resonance.toFixed(2);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthLfoWaveformSelect.addEventListener('change', () => {
    synthParams.lfo.waveform = synthLfoWaveformSelect.value as OscillatorWaveform;
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthLfoRateInput.addEventListener('input', () => {
    synthParams.lfo.rate = Number(synthLfoRateInput.value);
    synthLfoRateLabel.textContent = synthParams.lfo.rate.toFixed(1);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  modMatrixGrid.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.action !== 'set-mod-amount') return;
    const source = target.dataset.source as ModSource;
    const destination = target.dataset.destination as ModDestination;
    const connection = synthParams.modMatrix.find((c) => c.source === source && c.destination === destination);
    if (!connection) return;
    connection.amount = Number(target.value);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });

  synthArpToggle.addEventListener('click', () => {
    synthParams.arpEnabled = !synthParams.arpEnabled;
    synthArpToggle.textContent = synthParams.arpEnabled ? 'Disable' : 'Enable';
    synthArpToggle.classList.toggle('osci-toggle-active', synthParams.arpEnabled);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthArpPatternSelect.addEventListener('change', () => {
    synthParams.arp.pattern = synthArpPatternSelect.value as ArpPattern;
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthArpRateInput.addEventListener('input', () => {
    synthParams.arp.rate = Number(synthArpRateInput.value);
    synthArpRateLabel.textContent = synthParams.arp.rate.toFixed(1);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });

  synthSmartChordsToggle.addEventListener('click', () => {
    synthParams.smartChordsEnabled = !synthParams.smartChordsEnabled;
    synthSmartChordsToggle.textContent = synthParams.smartChordsEnabled ? 'Disable' : 'Enable';
    synthSmartChordsToggle.classList.toggle('osci-toggle-active', synthParams.smartChordsEnabled);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthChordsRootSelect.addEventListener('change', () => {
    synthParams.smartChords.scaleRoot = Number(synthChordsRootSelect.value);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthChordsScaleTypeSelect.addEventListener('change', () => {
    synthParams.smartChords.scaleType = synthChordsScaleTypeSelect.value as ScaleType;
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthChordsPitchRangeInput.addEventListener('input', () => {
    synthParams.smartChords.pitchRange = Number(synthChordsPitchRangeInput.value);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthChordsDensityInput.addEventListener('input', () => {
    synthParams.smartChords.density = Number(synthChordsDensityInput.value);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });
  synthChordsStrumInput.addEventListener('input', () => {
    synthParams.smartChords.strumMs = Number(synthChordsStrumInput.value);
    synthChordsStrumLabel.textContent = String(synthParams.smartChords.strumMs);
    if (synthGraph) sendSynthParams(synthGraph.node, synthParams);
  });

  synthDelayTimeInput.addEventListener('input', () => {
    synthEffects.delayTime = Number(synthDelayTimeInput.value);
    synthDelayTimeLabel.textContent = synthEffects.delayTime.toFixed(2);
    if (synthGraph) applySynthEffects(synthGraph);
  });
  synthDelayFeedbackInput.addEventListener('input', () => {
    synthEffects.delayFeedback = Number(synthDelayFeedbackInput.value);
    synthDelayFeedbackLabel.textContent = synthEffects.delayFeedback.toFixed(2);
    if (synthGraph) applySynthEffects(synthGraph);
  });
  synthDelayWetInput.addEventListener('input', () => {
    synthEffects.delayWet = Number(synthDelayWetInput.value);
    synthDelayWetLabel.textContent = synthEffects.delayWet.toFixed(2);
    if (synthGraph) applySynthEffects(synthGraph);
  });
  synthReverbWetInput.addEventListener('input', () => {
    synthEffects.reverbWet = Number(synthReverbWetInput.value);
    synthReverbWetLabel.textContent = synthEffects.reverbWet.toFixed(2);
    if (synthGraph) applySynthEffects(synthGraph);
  });

  midiMapToggle.addEventListener('click', async () => {
    if (!midiEnabled) {
      midiEnabled = await midiManager.enable();
      if (!midiEnabled) {
        midiStatus.textContent = "Web MIDI isn't supported in this browser — try Chrome or Edge.";
        return;
      }
    }
    midiMapModeActive = !midiMapModeActive;
    midiMapToggle.textContent = midiMapModeActive ? 'Click a slider to map...' : 'Enable MIDI mapping';
    midiMapToggle.classList.toggle('osci-toggle-active', midiMapModeActive);
    midiStatus.textContent = midiMapModeActive
      ? 'Map mode on — click Trace frequency or Output level, then move a MIDI knob.'
      : 'Maps Trace frequency and Output level to a MIDI knob. Click the button, then move a knob for each slider you want to map.';
  });

  // Captures the click before the slider's own drag behavior runs, so
  // entering "learn" mode doesn't also change the slider's value.
  root.addEventListener(
    'mousedown',
    (event) => {
      if (!midiMapModeActive) return;
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || (target !== traceHzInput && target !== levelInput)) return;
      event.preventDefault();
      pendingMidiLearnElement = target;
      target.classList.add('osci-midi-learning');
      midiStatus.textContent = 'Move a MIDI knob now to map it to this slider...';
    },
    true,
  );

  // Click-to-toggle help popovers (not hover) — a native title attribute
  // only shows on hover/long-press, which doesn't work well for longer
  // help text or on touch devices. Clicking a toggle button shows its own
  // popover and hides any other open one; clicking anywhere else closes
  // whatever's open.
  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const toggleButton = target.closest<HTMLElement>('[data-action="toggle-help"]');
    const clickedPopover = toggleButton?.nextElementSibling as HTMLElement | null;

    root.querySelectorAll<HTMLElement>('[data-help-popover]').forEach((popover) => {
      if (popover !== clickedPopover) popover.hidden = true;
    });
    if (clickedPopover) clickedPopover.hidden = !clickedPopover.hidden;
  });

  // A <select> has no reason to stay focused once you've picked a value —
  // leaving it focused meant it could still intercept later keystrokes for
  // its own built-in type-ahead-to-option behavior (e.g. the computer
  // keyboard's "S" note jumping a focused waveform dropdown to "Square").
  // 'change' alone isn't enough: clicking the option that's already
  // selected closes the dropdown without firing 'change' (the value didn't
  // change), leaving the select focused and the bug back. 'click' fires on
  // the select after that interaction either way, so blur on both.
  const blurSelectOnPick = (event: Event): void => {
    if (event.target instanceof HTMLSelectElement) event.target.blur();
  };
  root.addEventListener('change', blurSelectOnPick);
  root.addEventListener('click', blurSelectOnPick);

  midiManager.onMessage((cc, value, channel) => {
    const key = `${channel}:${cc}`;

    if (pendingMidiLearnElement) {
      for (const [existingKey, element] of midiBindings) {
        if (element === pendingMidiLearnElement) midiBindings.delete(existingKey);
      }
      midiBindings.set(key, pendingMidiLearnElement);
      pendingMidiLearnElement.classList.remove('osci-midi-learning');
      pendingMidiLearnElement.classList.add('osci-midi-mapped');
      midiStatus.textContent = 'Mapped! Click another slider to map it, or toggle mapping off.';
      pendingMidiLearnElement = null;
      return;
    }

    const input = midiBindings.get(key);
    if (!input) return;
    const min = Number(input.min || 0);
    const max = Number(input.max || 127);
    const scaled = min + (value / 127) * (max - min);
    input.value = String(scaled);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Shared by both real MIDI input and the computer-keyboard fallback below,
  // so the note visualizer and the synth both react to any note source.
  // When Smart Chords is enabled, one physical note expands into several —
  // the worklet and Arpeggiator need no changes for this, since they just
  // see one noteOn/noteOff per chord tone, indistinguishable from several
  // keys pressed at once (see generateChordNotes()/SmartChords in the plan).
  function triggerNote(note: number, velocity: number, on: boolean): void {
    if (on) {
      const chordNotes = synthParams.smartChordsEnabled ? generateChordNotes(note, synthParams.smartChords) : [note];
      for (const chordNote of chordNotes) {
        const keyEl = keyboardEl.querySelector<HTMLDivElement>(`[data-note="${chordNote}"]`);
        keyEl?.classList.add('osci-key-active');
      }

      const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
      if (synthGraph) {
        sendNoteOn(synthGraph.node, chordNotes[0], velocity);
        for (let i = 1; i < chordNotes.length; i++) {
          const chordNote = chordNotes[i];
          const delayMs = i * synthParams.smartChords.strumMs;
          if (delayMs <= 0) {
            sendNoteOn(synthGraph.node, chordNote, velocity);
          } else {
            pendingTimeouts.push(
              setTimeout(() => {
                if (synthGraph) sendNoteOn(synthGraph.node, chordNote, velocity);
              }, delayMs),
            );
          }
        }
      }
      activeChordNotes.set(note, { notes: chordNotes, pendingTimeouts });
    } else {
      const active = activeChordNotes.get(note) ?? { notes: [note], pendingTimeouts: [] };
      activeChordNotes.delete(note);
      for (const timeoutId of active.pendingTimeouts) clearTimeout(timeoutId);

      for (const chordNote of active.notes) {
        const keyEl = keyboardEl.querySelector<HTMLDivElement>(`[data-note="${chordNote}"]`);
        keyEl?.classList.remove('osci-key-active');
        if (synthGraph) sendNoteOff(synthGraph.node, chordNote);
      }
    }
  }

  midiManager.onNote((note, velocity, on) => {
    triggerNote(note, velocity, on);
  });

  // Notes should work without the user first opening CC-mapping mode, so
  // request access proactively; if the browser blocks it (no user gesture
  // yet, or unsupported), the explicit "Enable MIDI mapping" button click
  // still works as a fallback trigger.
  void midiManager.enable().then((ok) => {
    midiEnabled = ok;
  });

  synthKeyboardToggle.addEventListener('click', () => {
    computerKeyboardEnabled = !computerKeyboardEnabled;
    synthKeyboardToggle.textContent = computerKeyboardEnabled ? 'Disable Computer Keyboard' : 'Enable Computer Keyboard';
    synthKeyboardToggle.classList.toggle('osci-toggle-active', computerKeyboardEnabled);
    if (!computerKeyboardEnabled) {
      for (const code of heldComputerKeys) triggerNote(COMPUTER_KEYBOARD_NOTE_MAP[code], 0, false);
      heldComputerKeys.clear();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!computerKeyboardEnabled || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    // Only genuine free-text fields (the Lua/SVG/L-system textareas, and
    // single-line text inputs like the text-layer content field) need
    // protecting from having keystrokes hijacked into notes. A <select>
    // used to be excluded here too, but that just meant clicking away after
    // every waveform pick before you could play again — instead, selects
    // now blur themselves right after a choice (see the 'change' listener
    // below), so they're never still focused while playing notes and can't
    // fight over the same keys via their own built-in type-ahead-to-select
    // behavior (e.g. pressing "S" jumping a focused select to "Square").
    const isTextEntry =
      target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type === 'text');
    if (isTextEntry) return;
    const note = COMPUTER_KEYBOARD_NOTE_MAP[event.code];
    if (note === undefined || heldComputerKeys.has(event.code)) return;
    event.preventDefault();
    heldComputerKeys.add(event.code);
    triggerNote(note, COMPUTER_KEYBOARD_VELOCITY, true);
  });

  window.addEventListener('keyup', (event) => {
    if (!heldComputerKeys.has(event.code)) return;
    heldComputerKeys.delete(event.code);
    triggerNote(COMPUTER_KEYBOARD_NOTE_MAP[event.code], 0, false);
  });

  // Releasing the physical key never fires if focus (and the keyup event
  // with it) leaves the browser entirely — e.g. alt-tabbing away mid-note —
  // which would otherwise leave that voice stuck sounding indefinitely.
  window.addEventListener('blur', () => {
    for (const code of heldComputerKeys) triggerNote(COMPUTER_KEYBOARD_NOTE_MAP[code], 0, false);
    heldComputerKeys.clear();
  });

  renderLists();
  renderAndUpdate();
}
