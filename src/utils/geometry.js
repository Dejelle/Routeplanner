const R = 6371000; // Earth radius in meters

export function haversine(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function bearing(a, b) {
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function subsampleRoute(points, intervalMeters = 100) {
  if (points.length === 0) return [];
  const result = [points[0]];
  let accum = 0;
  for (let i = 1; i < points.length; i++) {
    accum += haversine(points[i - 1], points[i]);
    if (accum >= intervalMeters) {
      result.push(points[i]);
      accum = 0;
    }
  }
  const last = points[points.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

// Project a point 'distanceM' meters from 'point' in direction 'bearingDeg'
export function destination(point, bearingDeg, distanceM) {
  const R = 6371000;
  const d = distanceM / R;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (point.lat * Math.PI) / 180;
  const lng1 = (point.lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}

export function midpoint(a, b) {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/**
 * Berekent km-markeringspunten langs een route.
 * Elke markering wordt exact geïnterpoleerd tussen twee trackpunten.
 *
 * @param {Array<{lat,lng}>} points     - Route-coördinaten
 * @param {number}           intervalKm - Interval in kilometer
 * @returns {Array<{lat,lng,km}>}
 */
export function getKmMarkers(points, intervalKm) {
  if (points.length < 2 || intervalKm <= 0) return [];
  const step = intervalKm * 1000; // naar meters
  const markers = [];
  let accum = 0;
  let nextMark = step;

  for (let i = 1; i < points.length; i++) {
    const segDist = haversine(points[i - 1], points[i]);
    accum += segDist;

    while (accum >= nextMark) {
      // Interpoleer de exacte positie op dit km-punt
      const overshoot = accum - nextMark;
      const t = segDist > 0 ? 1 - overshoot / segDist : 1;
      const lat = points[i - 1].lat + t * (points[i].lat - points[i - 1].lat);
      const lng = points[i - 1].lng + t * (points[i].lng - points[i - 1].lng);
      markers.push({ lat, lng, km: Math.round(nextMark / 1000) });
      nextMark += step;
    }
  }
  return markers;
}

export function getBbox(points) {
  const pad = 0.003;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    minLat: Math.min(...lats) - pad,
    minLng: Math.min(...lngs) - pad,
    maxLat: Math.max(...lats) + pad,
    maxLng: Math.max(...lngs) + pad,
  };
}
