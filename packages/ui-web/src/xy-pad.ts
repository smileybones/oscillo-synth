// A 2D pointer-controlled pad wrapping two existing <input type="range">
// elements (one per axis), for controls like Smart Chords' pitch-range/
// density where the two axes are set together by eye rather than dragged
// independently. Same trick as knob.ts — the underlying inputs stay the
// real source of truth and every existing 'input' event listener keeps
// working unchanged, since this only ever sets .value and dispatches a
// real event. Unlike knob.ts's relative vertical drag, this maps the
// pointer's absolute position within the pad directly to each axis' value
// ("click to lock the position" rather than drag-a-delta), since that's
// the interaction the user described.

function valueFromFraction(input: HTMLInputElement, fraction: number): number {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const step = Number(input.step || 0);
  let value = min + fraction * (max - min);
  if (step > 0) value = min + Math.round((value - min) / step) * step;
  return Math.max(min, Math.min(max, value));
}

function fractionOf(input: HTMLInputElement): number {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  if (max === min) return 0;
  return (Number(input.value) - min) / (max - min);
}

export function xyPadify(pad: HTMLElement, xInput: HTMLInputElement, yInput: HTMLInputElement): void {
  if (pad.dataset.xyPadified) return;
  pad.dataset.xyPadified = 'true';
  xInput.dataset.noKnob = 'true';
  yInput.dataset.noKnob = 'true';

  const cursor = document.createElement('div');
  cursor.className = 'osci-xy-pad-cursor';
  pad.appendChild(cursor);

  const applyPosition = (): void => {
    cursor.style.left = `${fractionOf(xInput) * 100}%`;
    // Inverted so the top of the pad is the higher value, matching the
    // knob's up-is-more convention.
    cursor.style.top = `${(1 - fractionOf(yInput)) * 100}%`;
  };
  applyPosition();
  xInput.addEventListener('input', applyPosition);
  yInput.addEventListener('input', applyPosition);

  const setFromPointer = (event: PointerEvent): void => {
    const rect = pad.getBoundingClientRect();
    const xFraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const yFraction = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));

    const nextX = valueFromFraction(xInput, xFraction);
    if (Number(xInput.value) !== nextX) {
      xInput.value = String(nextX);
      xInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const nextY = valueFromFraction(yInput, 1 - yFraction);
    if (Number(yInput.value) !== nextY) {
      yInput.value = String(nextY);
      yInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  pad.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    pad.setPointerCapture(event.pointerId);
    setFromPointer(event);

    const onMove = (moveEvent: PointerEvent): void => setFromPointer(moveEvent);
    const onUp = (): void => {
      pad.removeEventListener('pointermove', onMove);
      pad.removeEventListener('pointerup', onUp);
    };
    pad.addEventListener('pointermove', onMove);
    pad.addEventListener('pointerup', onUp);
  });
}
