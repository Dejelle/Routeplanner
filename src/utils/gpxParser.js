export function parseGpx(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const trkpts = doc.querySelectorAll('trkpt');
  const points = [];
  for (const pt of trkpts) {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lng = parseFloat(pt.getAttribute('lon'));
    if (!isNaN(lat) && !isNaN(lng)) {
      points.push({ lat, lng });
    }
  }
  return points;
}
