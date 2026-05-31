import { buildCacheKey, buildUrlFromPano, fetchPanoMetadata } from './streetViewUrl.js';
import { getCached, setCached } from './imageCache.js';

async function fetchAndCache(point, heading, apiKey) {
  const cacheKey = buildCacheKey(point, heading);
  const cached = await getCached(cacheKey);
  if (cached) return;

  const meta = await fetchPanoMetadata(point, apiKey);
  if (!meta) {
    await setCached(cacheKey, 'NO_IMAGE');
    return;
  }

  const url = buildUrlFromPano(meta.panoId, heading, apiKey);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      await setCached(cacheKey, 'NO_IMAGE');
      return;
    }
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    await setCached(cacheKey, dataUrl);
  } catch {
    // network error — skip, retry on next load
  }
}

export async function prefetchImages(segments, intersections, config, apiKey) {
  const jobs = [];

  for (const seg of segments) {
    for (const pos of config.positions) {
      const vp = seg.viewpoints[pos];
      if (vp) jobs.push({ point: vp.point, heading: vp.heading });
    }
  }

  if (config.showIntersections) {
    for (const int of intersections) {
      jobs.push({ point: int.point, heading: int.heading });
      jobs.push({ point: int.point, heading: (int.heading + 90) % 360 });
    }
  }

  // Run up to 3 concurrent fetches — avoids hammering the API
  const CONCURRENCY = 3;
  let idx = 0;

  async function worker() {
    while (idx < jobs.length) {
      const job = jobs[idx++];
      await fetchAndCache(job.point, job.heading, apiKey).catch(() => {});
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}
