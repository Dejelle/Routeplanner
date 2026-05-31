import { haversine, subsampleRoute } from './geometry.js';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

export const AMENITY_TYPES = [
  { key: 'cafe',                    label: 'Café',             emoji: '☕', color: '#f59e0b', tag: 'amenity' },
  { key: 'restaurant',              label: 'Restaurant',       emoji: '🍽️', color: '#ef4444', tag: 'amenity' },
  { key: 'ice_cream',               label: 'IJssalon',         emoji: '🍦', color: '#ec4899', tag: 'amenity' },
  { key: 'bar',                     label: 'Bar/Pub',          emoji: '🍺', color: '#8b5cf6', tag: 'amenity' },
  { key: 'pub',                     label: 'Bar/Pub',          emoji: '🍺', color: '#8b5cf6', tag: 'amenity' },
  { key: 'fast_food',               label: 'Snackbar',         emoji: '🍟', color: '#f97316', tag: 'amenity' },
  { key: 'bicycle_repair_station',  label: 'Fietsreparatie',   emoji: '🔧', color: '#0ea5e9', tag: 'amenity' },
  { key: 'bakery',                  label: 'Bakker',           emoji: '🥖', color: '#eab308', tag: 'shop'    },
  { key: 'supermarket',             label: 'Supermarkt',       emoji: '🛒', color: '#22c55e', tag: 'shop'    },
  { key: 'convenience',             label: 'Buurtwinkel',      emoji: '🏪', color: '#14b8a6', tag: 'shop'    },
  { key: 'farm',                    label: 'Boerderijwinkel',  emoji: '🌾', color: '#84cc16', tag: 'shop'    },
  { key: 'bicycle',                 label: 'Fietsenmaker',     emoji: '🚲', color: '#06b6d4', tag: 'shop'    },
  { key: 'deli',                    label: 'Traiteur',         emoji: '🥗', color: '#a3e635', tag: 'shop'    },
  { key: 'drinking_water',          label: 'Drinkwater',       emoji: '💧', color: '#3b82f6', tag: 'amenity' },
  { key: 'toilets',                 label: 'Toilet',           emoji: '🚻', color: '#6b7280', tag: 'amenity' },
  { key: 'picnic_site',             label: 'Picknickplaats',   emoji: '🧺', color: '#65a30d', tag: 'tourism' },
  { key: 'picnic_table',            label: 'Picknicktafel',    emoji: '🪑', color: '#a16207', tag: 'leisure' },
];

const TYPE_MAP = Object.fromEntries(AMENITY_TYPES.map((t) => [t.key, t]));

// Deduplicate pub/bar display: treat 'pub' the same as 'bar' in the UI
export const FILTER_GROUPS = AMENITY_TYPES.filter(
  (t, i, arr) => arr.findIndex((x) => x.label === t.label) === i
);

async function tryFetch(endpoint, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
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

function buildBbox(points, extraMeters) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const pad = extraMeters / 111000;
  return {
    minLat: Math.min(...lats) - pad,
    minLng: Math.min(...lngs) - pad,
    maxLat: Math.max(...lats) + pad,
    maxLng: Math.max(...lngs) + pad,
  };
}

function minDistanceToRoute(point, routePoints) {
  let min = Infinity;
  for (const rp of routePoints) {
    const d = haversine(point, rp);
    if (d < min) min = d;
  }
  return min;
}

export async function fetchAmenities(gpxPoints, maxDistance) {
  // Subsample route at 50m for accurate distance checks without excessive computation
  const sampled = subsampleRoute(gpxPoints, 50);

  const bbox = buildBbox(sampled, maxDistance);
  const { minLat, minLng, maxLat, maxLng } = bbox;

  const amenityValues = AMENITY_TYPES.filter((t) => t.tag === 'amenity').map((t) => t.key);
  const shopValues    = AMENITY_TYPES.filter((t) => t.tag === 'shop').map((t) => t.key);
  const tourismValues = AMENITY_TYPES.filter((t) => t.tag === 'tourism').map((t) => t.key);
  const leisureValues = AMENITY_TYPES.filter((t) => t.tag === 'leisure').map((t) => t.key);

  const bboxStr = `${minLat},${minLng},${maxLat},${maxLng}`;
  const query = `[out:json][timeout:30];
(
  node["amenity"~"${[...new Set(amenityValues)].join('|')}"](${bboxStr});
  node["shop"~"${shopValues.join('|')}"](${bboxStr});
  node["tourism"~"${tourismValues.join('|')}"](${bboxStr});
  node["leisure"~"${leisureValues.join('|')}"](${bboxStr});
);
out body;`;

  const body = 'data=' + encodeURIComponent(query);

  let lastError;
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await tryFetch(endpoint, body);
      const data = await res.json();

      const results = [];
      for (const el of data.elements) {
        if (el.type !== 'node') continue;
        const tags = el.tags || {};

        const typeKey = tags.amenity || tags.shop || tags.tourism || tags.leisure;
        const typeDef = TYPE_MAP[typeKey];
        if (!typeDef) continue;

        const point = { lat: el.lat, lng: el.lon };
        const dist = minDistanceToRoute(point, sampled);
        if (dist > maxDistance) continue;

        const address = [tags['addr:street'], tags['addr:housenumber']]
          .filter(Boolean)
          .join(' ');

        results.push({
          id: el.id,
          lat: el.lat,
          lng: el.lon,
          name: tags.name || null,
          typeKey,
          typeLabel: typeDef.label,
          emoji: typeDef.emoji,
          color: typeDef.color,
          tag: typeDef.tag,
          distanceFromRoute: Math.round(dist),
          openingHours: tags.opening_hours || null,
          website: tags.website || tags['contact:website'] || null,
          phone: tags.phone || tags['contact:phone'] || null,
          address: address || null,
        });
      }

      results.sort((a, b) => a.distanceFromRoute - b.distanceFromRoute);
      return results;
    } catch (err) {
      console.warn(`[Overpass amenities] ${endpoint} failed:`, err.message);
      lastError = err;
    }
  }
  throw new Error(`Alle Overpass-servers zijn niet bereikbaar. (${lastError?.message})`);
}
