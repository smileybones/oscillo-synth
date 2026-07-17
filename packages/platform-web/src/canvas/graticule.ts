// A real oscilloscope screen has a printed grid etched into the glass (the
// "graticule") that the trace draws over — it never fades, since it's not
// part of the phosphor image. Both preview canvases fill their whole area
// every frame (either an opaque clear or a translucent decay fill for the
// afterglow trail), which would erase a CSS background within a few frames,
// so the grid has to be redrawn here, every frame, after that fill and
// before the trace itself.
export function drawGraticule(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const divisions = 8;
  ctx.save();
  ctx.strokeStyle = 'rgba(124, 252, 156, 0.09)';
  ctx.lineWidth = 1;
  for (let i = 1; i < divisions; i++) {
    const x = Math.round((width / divisions) * i) + 0.5;
    const y = Math.round((height / divisions) * i) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Center crosshair, brighter than the grid — the zero axes.
  ctx.strokeStyle = 'rgba(124, 252, 156, 0.18)';
  const cx = Math.round(width / 2) + 0.5;
  const cy = Math.round(height / 2) + 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, height);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(width, cy);
  ctx.stroke();
  ctx.restore();
}
