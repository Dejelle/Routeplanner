const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

async function tryFetch(endpoint, body, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs); // per endpoint
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function fetchWayAtPoint(lat, lng) {
  const query = `[out:json][timeout:10];way["highway"]["name"](around:50,${lat},${lng});out geom;`;
  const body = 'data=' + encodeURIComponent(query);

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await tryFetch(endpoint, body);
      const data = await res.json();
      const ways = data.elements.filter((el) => el.type === 'way' && el.geometry);
      if (!ways.length) return null;
      const way = ways[0];
      return {
        id: way.id,
        name: way.tags?.name ?? null,
        geometry: way.geometry.map(({ lat: la, lon }) => ({ lat: la, lng: lon })),
      };
    } catch (err) {
      console.warn(`[Overpass] ${endpoint} failed:`, err.message);
    }
  }
  return null;
}

/**
 * Haalt bruikbare (fietsbare) ways op binnen een bbox, voor het snappen van
 * kandidaat-waypoints bij de lus-generator. Anders dan `fetchRoads` wordt hier
 * GEEN naam-tag vereist: veel fietspaden (highway=cycleway/path) hebben geen
 * naam en moeten juist als snap-doel meetellen. Autosnelwegen/trunk en
 * expliciet verboden toegang worden uitgesloten.
 *
 * @param {{minLat,minLng,maxLat,maxLng}} bbox
 * @returns {Promise<Array>} OSM way-objecten met .geometry ([{lat,lon}]) en .tags
 */
export async function fetchBikeableWays(bbox) {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const query = `[out:json][timeout:60];way["highway"]["highway"!~"^(motorway|motorway_link|trunk|trunk_link|construction|proposed|raceway)$"]["bicycle"!~"^(no|private|dismount)$"]["access"!~"^(no|private)$"](${minLat},${minLng},${maxLat},${maxLng});out geom;`;
  const body = 'data=' + encodeURIComponent(query);

  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      // Zwaardere query (groot gebied, geen naam-filter) → ruimere client-timeout
      // zodat de 60s server-budget niet voortijdig wordt afgebroken.
      const res = await tryFetch(endpoint, body, 50000);
      const data = await res.json();
      return data.elements.filter((el) => el.type === 'way' && el.geometry && el.geometry.length >= 2);
    } catch (err) {
      console.warn(`[Overpass bikeable] ${endpoint} failed:`, err.message);
      lastError = err;
    }
  }
  throw new Error(`All Overpass mirrors failed. Last error: ${lastError?.message}`);
}

export async function fetchRoads(bbox) {
  const { minLat, minLng, maxLat, maxLng } = bbox;
  const query = `[out:json][timeout:60];way["highway"]["name"](${minLat},${minLng},${maxLat},${maxLng});out geom;`;
  const body = 'data=' + encodeURIComponent(query);

  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`[Overpass] trying ${endpoint}…`);
      const res = await tryFetch(endpoint, body);
      const data = await res.json();
      return data.elements.filter((el) => el.type === 'way' && el.geometry);
    } catch (err) {
      console.warn(`[Overpass] ${endpoint} failed:`, err.message);
      lastError = err;
    }
  }
  throw new Error(`All Overpass mirrors failed. Last error: ${lastError?.message}`);
}
