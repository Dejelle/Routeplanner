const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

async function tryFetch(endpoint, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000); // 20s per endpoint
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
