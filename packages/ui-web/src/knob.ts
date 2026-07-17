// Replaces a native range slider's default appearance with a draggable
// rotary knob, without touching how its value is read or reacted to — the
// underlying <input type="range"> stays in the DOM (just visually hidden),
// and every existing 'input' event listener keeps firing exactly as before
// since the knob just sets .value and dispatches a real 'input' event.
// Drag direction is vertical (drag up/down), not circular — the standard
// convention in most audio software (Ableton, Serum, etc.), and far more
// precise with a mouse/trackpad than tracking an angle around the knob.

const KNOB_MIN_ANGLE = -135;
const KNOB_MAX_ANGLE = 135;
const DRAG_PIXELS_FOR_FULL_RANGE = 150;

function valueFraction(input: HTMLInputElement): number {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  if (max === min) return 0;
  return (Number(input.value) - min) / (max - min);
}

function roundToStep(value: number, step: number, min: number): number {
  if (!step || step <= 0) return value;
  return min + Math.round((value - min) / step) * step;
}

function knobify(input: HTMLInputElement): void {
  if (input.dataset.knobified || input.dataset.noKnob) return;
  input.dataset.knobified = 'true';
  input.classList.add('osci-knob-source');
  // Whatever value the slider started at — restored on double-click.
  const defaultValue = input.value;

  const knob = document.createElement('div');
  knob.className = 'osci-knob';
  const indicator = document.createElement('div');
  indicator.className = 'osci-knob-indicator';
  knob.appendChild(indicator);
  input.insertAdjacentElement('afterend', knob);

  const applyAngle = (): void => {
    const fraction = valueFraction(input);
    const angle = KNOB_MIN_ANGLE + fraction * (KNOB_MAX_ANGLE - KNOB_MIN_ANGLE);
    indicator.style.transform = `rotate(${angle}deg)`;
    // Drives the conic-gradient value arc in CSS (see .osci-knob) — a
    // graduated scale printed on the knob face, like a real potentiometer's
    // arc, rather than just a bare pointer with nothing to compare it to.
    knob.style.setProperty('--value-fraction', String(fraction));
  };
  applyAngle();
  // Keeps the knob visually in sync with value changes that didn't come from
  // dragging it — e.g. a MIDI-mapped slider, or a preset applying a new
  // value programmatically, both already dispatch a real 'input' event.
  input.addEventListener('input', applyAngle);

  knob.addEventListener('pointerdown', (event) => {
    // Without this, the browser treats the drag as a text-selection
    // gesture and highlights whatever's nearby (labels, other knobs' value
    // text) as the pointer moves.
    event.preventDefault();
    knob.setPointerCapture(event.pointerId);
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const step = Number(input.step || 0);
    const startY = event.clientY;
    const startValue = Number(input.value);

    const onMove = (moveEvent: PointerEvent): void => {
      const deltaY = startY - moveEvent.clientY;
      const range = max - min;
      let next = startValue + (deltaY / DRAG_PIXELS_FOR_FULL_RANGE) * range;
      next = Math.max(min, Math.min(max, next));
      next = roundToStep(next, step, min);
      if (Number(input.value) === next) return;
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const onUp = (): void => {
      knob.removeEventListener('pointermove', onMove);
      knob.removeEventListener('pointerup', onUp);
      knob.removeEventListener('pointercancel', onUp);
    };
    knob.addEventListener('pointermove', onMove);
    knob.addEventListener('pointerup', onUp);
    // Without this, a drag interrupted by the browser/OS (e.g. dragging
    // fast enough to trigger gesture arbitration) fires 'pointercancel'
    // instead of 'pointerup' — onUp never runs, onMove stays attached
    // forever, and the knob keeps turning from any later pointer movement
    // even with the button released.
    knob.addEventListener('pointercancel', onUp);
  });

  knob.addEventListener('dblclick', () => {
    if (input.value === defaultValue) return;
    input.value = defaultValue;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export function enhanceRangeInputsAsKnobs(container: ParentNode): void {
  container.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(knobify);
}
