// Bouwt een GPX 1.1-bestand uit een lijst routepunten ({lat, lng}).
// Schrijft zowel een <rte> (route) als een <trk> (track):
//  - Garmin Connect importeert een <trk> betrouwbaar als koers/activiteit.
//  - De <rte> dient als fallback voor toestellen/apps die routes verwachten.

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildGpx(points, name = 'Route') {
  if (!points || !points.length) {
    throw new Error('Geen routepunten om te exporteren.');
  }

  const safeName = escapeXml(name);
  const time = new Date().toISOString();

  const trkpts = points
    .map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"></trkpt>`)
    .join('\n');

  const rtepts = points
    .map((p) => `    <rtept lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"></rtept>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Route Validator"
     xmlns="http://www.topografix.com/GPX/1/1"
     xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
     xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${safeName}</name>
    <time>${time}</time>
  </metadata>
  <rte>
    <name>${safeName}</name>
${rtepts}
  </rte>
  <trk>
    <name>${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>
`;
}

// Sanitize een naam tot een veilige bestandsnaam.
function safeFilename(name) {
  const base = (name || 'route')
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return (base || 'route') + '.gpx';
}

// Genereert het GPX-bestand en triggert een download in de browser.
export function downloadGpx(points, name = 'Route') {
  const gpx = buildGpx(points, name);
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename(name);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Geef de browser even tijd om de download te starten voor we de URL vrijgeven
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
