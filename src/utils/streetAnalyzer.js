import { bearing, midpoint } from './geometry.js';

function pickBearing(points, index) {
  if (points.length === 1) return 0;
  if (index === 0) return bearing(points[0], points[1]);
  if (index === points.length - 1) return bearing(points[index - 1], points[index]);
  return bearing(points[index - 1], points[index + 1]);
}

function atFraction(pts, frac) {
  if (pts.length === 1) return { idx: 0, point: pts[0] };
  const idx = Math.round(frac * (pts.length - 1));
  return { idx, point: pts[idx] };
}

function buildAllViewpoints(pts) {
  const fractions = { start: 0, quarter: 0.25, mid: 0.5, threequarter: 0.75, end: 1 };
  const result = {};
  for (const [key, frac] of Object.entries(fractions)) {
    const { idx, point } = atFraction(pts, frac);
    result[key] = { point, heading: pickBearing(pts, idx) };
  }
  return result;
}

export function buildSegments(sampledPoints, matches) {
  // First pass: group consecutive points by OSM way ID
  const rawSegments = [];
  let current = null;

  for (let i = 0; i < sampledPoints.length; i++) {
    const match = matches[i];
    const roadId = match ? match.id : null;
    const roadName = match ? match.name : 'Unnamed road';

    if (!current || current.roadId !== roadId) {
      if (current) rawSegments.push(current);
      current = { roadId, roadName, points: [] };
    }
    current.points.push(sampledPoints[i]);
  }
  if (current) rawSegments.push(current);

  // Second pass: merge consecutive segments that share the same road name
  // (one OSM street is often split into multiple way IDs)
  const merged = [];
  for (const seg of rawSegments) {
    const prev = merged[merged.length - 1];
    if (prev && prev.roadName === seg.roadName) {
      prev.points.push(...seg.points);
    } else {
      merged.push({ roadId: seg.roadId, roadName: seg.roadName, points: [...seg.points] });
    }
  }

  return merged.map((seg) => ({
    id: `seg-${Math.random().toString(36).slice(2)}`,
    roadId: seg.roadId,
    roadName: seg.roadName,
    viewpoints: buildAllViewpoints(seg.points),
    allPoints: seg.points,
  }));
}

export function buildIntersections(segments) {
  const intersections = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    const lastA = a.allPoints[a.allPoints.length - 1];
    const firstB = b.allPoints[0];
    const point = midpoint(lastA, firstB);
    const h = bearing(lastA, firstB);
    intersections.push({
      id: `int-${i}`,
      afterSegmentIndex: i,
      street1: a.roadName,
      street2: b.roadName,
      point,
      heading: h,
    });
  }
  return intersections;
}
