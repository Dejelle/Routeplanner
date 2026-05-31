/**
 * OSRM Map Matching — snapt een GPS-trace aan het werkelijke wegennetwerk.
 * Gebruikt de publieke OSRM-server (geen API-sleutel vereist).
 */

const OSRM_BASE = 'https://router.project-osrm.org/match/v1/bike';
const BATCH_SIZE = 100;   // publieke OSRM limiet
const OVERLAP = 1;        // overlappende punten tussen batches voor naadloze verbinding
const SNAP_RADIUS = 35;   // meters — zelfde tolerantie als spatialMatch.js

/**
 * Snapt een array van GPS-punten aan het wegennetwerk via OSRM Map Matching.
 * Bij een fout wordt de originele trace teruggegeven (graceful fallback).
 *
 * @param {Array<{lat: number, lng: number}>} points  - Ruwe GPS-coördinaten
 * @param {function} [onProgress]                     - Optionele voortgangscallback (string)
 * @returns {Promise<Array<{lat: number, lng: number}>>}
 */
export async function matchRouteToRoads(points, onProgress) {
  if (!points || points.length < 2) return points;

  try {
    const allMatchedPoints = [];
    const step = BATCH_SIZE - OVERLAP;
    const totalBatches = Math.ceil((points.length - OVERLAP) / step);
    let batchNum = 0;

    for (let i = 0; i < points.length; i += step) {
      const batch = points.slice(i, i + BATCH_SIZE);
      if (batch.length < 2) break;

      batchNum++;
      if (onProgress) {
        onProgress(
          totalBatches > 1
            ? `Route snappen aan wegen… (${batchNum}/${totalBatches})`
            : 'Route snappen aan wegen…'
        );
      }

      const coordStr = batch
        .map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`)
        .join(';');
      const radiusStr = batch.map(() => SNAP_RADIUS).join(';');

      const url =
        `${OSRM_BASE}/${coordStr}` +
        `?overview=full&geometries=geojson&radiuses=${radiusStr}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

      const data = await res.json();
      if (data.code !== 'Ok' || !data.matchings?.length) {
        throw new Error(`OSRM: ${data.code ?? 'geen match'}`);
      }

      // Verzamel coördinaten uit alle deeltrajecten van deze batch
      for (const matching of data.matchings) {
        const pts = matching.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

        if (allMatchedPoints.length === 0) {
          allMatchedPoints.push(...pts);
        } else {
          // Sla het eerste punt over (overlapt met het einde van de vorige batch)
          allMatchedPoints.push(...pts.slice(1));
        }
      }
    }

    if (allMatchedPoints.length < 2) throw new Error('Te weinig punten na matching');
    return allMatchedPoints;
  } catch (err) {
    console.warn(
      '[mapMatching] Map matching mislukt, originele GPS-punten worden gebruikt:',
      err.message
    );
    return points; // fallback naar origineel
  }
}
