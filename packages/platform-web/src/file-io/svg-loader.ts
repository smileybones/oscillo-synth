// Extracts SVG path "d" attribute data so engine's SvgSource never has to
// touch the DOM. Accepts either full SVG markup or raw "d" strings (one per
// line) so the same textarea can be used for uploaded files or hand-pasted data.
export function extractPathData(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  if (!trimmed.includes('<')) {
    return trimmed
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  const doc = new DOMParser().parseFromString(input, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return [];

  return Array.from(doc.querySelectorAll('path'))
    .map((path) => path.getAttribute('d'))
    .filter((d): d is string => !!d && d.trim().length > 0);
}
