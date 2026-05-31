export function buildCacheKey(point, heading) {
  return `${point.lat.toFixed(6)},${point.lng.toFixed(6)},${Math.round(heading)}`;
}

export function buildUrl(point, heading, apiKey, size = '400x260') {
  const params = new URLSearchParams({
    size,
    location: `${point.lat},${point.lng}`,
    heading: Math.round(heading),
    fov: 90,
    pitch: 5,
    source: 'outdoor',
    radius: 25,
    key: apiKey,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params}`;
}

export function buildUrlFromPano(panoId, heading, apiKey, size = '400x260', scale = 1) {
  const params = new URLSearchParams({
    size,
    pano: panoId,
    heading: Math.round(heading),
    fov: 90,
    pitch: 5,
    key: apiKey,
  });
  if (scale > 1) params.set('scale', scale);
  return `https://maps.googleapis.com/maps/api/streetview?${params}`;
}

// Returns { panoId, location: { lat, lng } } or null if not found
export async function fetchPanoMetadata(point, apiKey) {
  const params = new URLSearchParams({
    location: `${point.lat},${point.lng}`,
    source: 'outdoor',
    radius: 25,
    key: apiKey,
  });
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/streetview/metadata?${params}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK') return null;
    return { panoId: data.pano_id, location: data.location };
  } catch {
    return null;
  }
}
