import { haversine } from './geometry.js';

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function pointToSegmentDist(p, a, b) {
  const dx = b.lat - a.lat;
  const dy = b.lng - a.lng;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversine(p, a);
  const t = clamp(((p.lat - a.lat) * dx + (p.lng - a.lng) * dy) / lenSq, 0, 1);
  return haversine(p, { lat: a.lat + t * dx, lng: a.lng + t * dy });
}

function wayBbox(way) {
  const lats = way.geometry.map((n) => n.lat);
  const lngs = way.geometry.map((n) => n.lon);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

export function buildWayIndex(ways) {
  return ways.map((way) => ({ way, bbox: wayBbox(way) }));
}

export function nearestRoad(point, wayIndex, maxDistanceM = 35) {
  const { lat, lng } = point;
  let best = null;
  let bestDist = maxDistanceM;

  for (const { way, bbox } of wayIndex) {
    // Quick bbox reject
    if (
      lat < bbox.minLat - 0.001 ||
      lat > bbox.maxLat + 0.001 ||
      lng < bbox.minLng - 0.001 ||
      lng > bbox.maxLng + 0.001
    )
      continue;

    const nodes = way.geometry;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = { lat: nodes[i].lat, lng: nodes[i].lon };
      const b = { lat: nodes[i + 1].lat, lng: nodes[i + 1].lon };
      const d = pointToSegmentDist(point, a, b);
      if (d < bestDist) {
        bestDist = d;
        best = { id: way.id, name: way.tags.name || 'Unnamed road' };
      }
    }
  }
  return best;
}
