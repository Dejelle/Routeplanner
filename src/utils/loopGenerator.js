import { destination, haversine } from './geometry.js';
import { fetchBikeableWays } from './overpass.js';
import { buildWayIndex, nearestWayPoint } from './spatialMatch.js';
import { calculateLoopRoute, ROUTING_MODES } from './routeCalc.js';
import { fetchAmenities } from './overpassAmenities.js';

/**
 * Automatische lus-generator.
 *
 * Aanpak (zoals GraphHopper/ORS `round_trip` intern): plaats enkele waypoints op
 * een cirkel rond het startpunt, route een gesloten lus met BRouter, meet de
 * werkelijke afstand en pas de straal iteratief aan tot binnen tolerantie.
 *
 * Richtingsbias: de waypoints worden over een hoek-sector rond `bearingDeg`
 * gespreid (geklemd binnen ±90°), zodat de lus aan de gekozen kant blijft.
 *
 * Essentieel: kandidaatpunten worden VÓÓR het routen naar de dichtstbijzijnde
 * bruikbare (fietsbare) weg gesnapt — anders kan een punt in water of een
 * onbereikbare zone vallen.
 */

const SPREAD_DEG = 65;       // hoek-spreiding van de zij-ankers t.o.v. de richting
const FAR_FACTOR = 1.15;     // het verste anker iets verder uitrekken in de richting
const MAX_ITER = 6;
const TOLERANCE = 0.08;      // 8% afwijking van de doelafstand is aanvaardbaar
const SNAP_MAX_M = 700;      // maximale snap-afstand voor een anker
const SECTOR_CLAMP = 90;     // ankers blijven binnen ±90° van de richting

// Deterministische PRNG (mulberry32) zodat eenzelfde seed dezelfde lus geeft.
function mulberry32(seed) {
  let a = seed >>> 0 || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function routeLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

// Bbox van een cirkel rond `center` met straal `radiusM` (lng gecorrigeerd voor breedtegraad).
function circleBbox(center, radiusM) {
  const dLat = radiusM / 111000;
  const dLng = radiusM / (111000 * Math.cos((center.lat * Math.PI) / 180));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

// Houd een hoek binnen [center-clamp, center+clamp].
function clampAngle(angle, center, clamp) {
  let diff = ((angle - center + 540) % 360) - 180; // genormaliseerd naar [-180,180]
  if (diff > clamp) diff = clamp;
  if (diff < -clamp) diff = -clamp;
  return center + diff;
}

// Plaats een anker op (angle, radius) vanaf start en snap het naar bruikbare weg.
// Faalt het snappen, dan worden enkele naburige hoeken binnen de sector geprobeerd.
function placeAndSnap(start, angle, radius, bearingDeg, index) {
  for (const dAng of [0, 12, -12, 24, -24]) {
    const a = clampAngle(angle + dAng, bearingDeg, SECTOR_CLAMP);
    const candidate = destination(start, a, radius);
    const snapped = nearestWayPoint(candidate, index, SNAP_MAX_M);
    if (snapped) return { lat: snapped.lat, lng: snapped.lng };
  }
  return null;
}

function pointAtFraction(points, frac) {
  const total = routeLength(points);
  const target = total * Math.max(0, Math.min(1, frac));
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    if (acc + d >= target) {
      const t = d > 0 ? (target - acc) / d : 0;
      return {
        lat: points[i - 1].lat + t * (points[i].lat - points[i - 1].lat),
        lng: points[i - 1].lng + t * (points[i].lng - points[i - 1].lng),
      };
    }
    acc += d;
  }
  return points[points.length - 1];
}

// Geeft het deel van de route tussen de fracties [fMin, fMax] terug (als puntenlijst).
function sliceRouteByFraction(points, fMin, fMax) {
  const total = routeLength(points);
  const dMin = total * Math.max(0, Math.min(1, fMin));
  const dMax = total * Math.max(0, Math.min(1, fMax));
  const res = [];
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) acc += haversine(points[i - 1], points[i]);
    if (acc >= dMin && acc <= dMax) res.push(points[i]);
  }
  if (res.length === 0) res.push(pointAtFraction(points, (fMin + fMax) / 2));
  return res;
}

// Cumulatieve fractie (0–1) van het route-punt dat het dichtst bij `pt` ligt.
function fractionOfNearestPoint(points, pt) {
  const total = routeLength(points) || 1;
  let acc = 0;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) acc += haversine(points[i - 1], points[i]);
    const d = haversine(points[i], pt);
    if (d < bestD) { bestD = d; best = acc; }
  }
  return best / total;
}

// Voegt meerdere venue-ankers op de juiste plek in de ankerlijst in, op volgorde
// van hun fractie langs de route. `chosen` = [{ v:{lat,lng}, frac }].
function insertVenueAnchors(anchors, segments, chosen) {
  const lens = segments.map(routeLength);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const ends = []; // cumulatieve eind-fractie per anker-edge
  let acc = 0;
  for (const l of lens) { acc += l; ends.push(acc / total); }

  const perEdge = anchors.map(() => []);
  for (const c of chosen) {
    let edge = ends.findIndex((e) => c.frac <= e);
    if (edge === -1) edge = ends.length - 1;
    perEdge[edge].push(c);
  }

  const res = [];
  for (let i = 0; i < anchors.length; i++) {
    res.push(anchors[i]);
    perEdge[i].sort((a, b) => a.frac - b.frac);
    // Venue-ankers krijgen hun POI-metadata mee, zodat ze op de kaart herkenbaar zijn.
    for (const c of perEdge[i]) res.push({ lat: c.v.lat, lng: c.v.lng, venue: c.v });
  }
  return res;
}

/**
 * @param {object} opts
 * @param {{lat:number,lng:number}} opts.start
 * @param {number} opts.targetDistanceM
 * @param {number} opts.bearingDeg            - 0=N, 90=O, 180=Z, 270=W
 * @param {string} opts.mode                  - ROUTING_MODES
 * @param {string[]} [opts.avoid]             - te vermijden infrastructuur (POPULAR)
 * @param {number} [opts.seed]
 * @param {{enabled:boolean, stops:{rangeMin:number,rangeMax:number,typeKeys:string[]}[]}} [opts.venue]
 *        Eén of meer eetstops; per stop een percentage-range en gewenste types.
 * @param {(msg:string)=>void} [opts.onProgress]
 * @returns {Promise<{anchors, points, segments, distanceM, venues, warning}>}
 */
export async function generateLoop({
  start,
  targetDistanceM,
  bearingDeg,
  mode = ROUTING_MODES.ROADS,
  avoid = [],
  seed = Date.now(),
  venue = null,
  onProgress,
}) {
  const rand = mulberry32(Math.floor(seed));
  const opts = { avoid };

  // 0. Geschikte wegen ophalen + indexeren (éénmalig). De lus reikt ~r·FAR_FACTOR
  //    ver; we nemen ruime marge voor straal-aanpassing tijdens de iteratie.
  onProgress?.('Geschikte wegen ophalen…');
  const baseRadius = targetDistanceM / (2 * Math.PI);
  const reach = baseRadius * FAR_FACTOR * 2; // ruimte voor groei
  const ways = await fetchBikeableWays(circleBbox(start, reach));
  if (!ways.length) throw new Error('Geen bruikbare fietswegen gevonden in dit gebied.');
  const index = buildWayIndex(ways);

  // 1. Startpunt snappen.
  const snappedStart = nearestWayPoint(start, index, SNAP_MAX_M);
  if (!snappedStart) throw new Error('Startpunt ligt te ver van bruikbare fietswegen. Kies een ander punt.');
  const startPt = { lat: snappedStart.lat, lng: snappedStart.lng };

  // 2–7. Iteratief de straal afstellen.
  let r = baseRadius;
  let best = null;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    onProgress?.(`Route berekenen (poging ${iter + 1}/${MAX_ITER})…`);

    // Lichte jitter voor variatie tussen seeds.
    const jL = (rand() - 0.5) * 24;
    const jM = (rand() - 0.5) * 12;
    const jR = (rand() - 0.5) * 24;
    const candidates = [
      { angle: bearingDeg - SPREAD_DEG + jL, radius: r },
      { angle: bearingDeg + jM, radius: r * FAR_FACTOR },
      { angle: bearingDeg + SPREAD_DEG + jR, radius: r },
    ];

    const anchors = [startPt];
    let feasible = true;
    for (const c of candidates) {
      const snapped = placeAndSnap(startPt, c.angle, c.radius, bearingDeg, index);
      if (!snapped) { feasible = false; break; }
      anchors.push(snapped);
    }
    if (!feasible) { r *= 1.12; continue; } // geen snap-doel → straal vergroten en opnieuw

    const result = await calculateLoopRoute(anchors, mode, opts);
    if (!result) throw new Error('Routeberekening mislukt — geen route gevonden tussen de punten.');

    const dist = result.distanceM;
    if (!best || Math.abs(dist - targetDistanceM) < Math.abs(best.distanceM - targetDistanceM)) {
      best = { anchors, ...result };
    }
    if (Math.abs(dist - targetDistanceM) / targetDistanceM < TOLERANCE) break;

    // Straal proportioneel bijstellen, maar per stap begrenzen tegen oversturen.
    const factor = Math.max(0.6, Math.min(1.6, targetDistanceM / dist));
    r *= factor;
  }

  if (!best) throw new Error('Kon geen lus genereren in deze richting — probeer een andere richting of afstand.');

  let warning =
    Math.abs(best.distanceM - targetDistanceM) / targetDistanceM >= TOLERANCE
      ? `Beste haalbare afstand: ${(best.distanceM / 1000).toFixed(1)} km (doel ${(targetDistanceM / 1000).toFixed(0)} km).`
      : null;

  let venues = [];

  // Eetstops: per stop een voorziening zoeken in het opgegeven percentage-bereik
  // (de dichtstbijzijnde op dat deel van de route), daarna alle stops in één keer
  // in de ankerlijst invoegen en de lus opnieuw routen.
  const stops = (venue?.enabled && Array.isArray(venue.stops))
    ? venue.stops.filter((s) => s.typeKeys?.length)
    : [];

  if (stops.length) {
    const chosen = [];
    const usedIds = new Set();
    for (const stop of stops) {
      onProgress?.('Eetstops zoeken…');
      const fMin = Math.min(stop.rangeMin, stop.rangeMax) / 100;
      const fMax = Math.max(stop.rangeMin, stop.rangeMax) / 100;
      const slice = sliceRouteByFraction(best.points, fMin, fMax);
      try {
        const found = await fetchAmenities(slice, 400, stop.typeKeys);
        const pick = found.find((f) => !usedIds.has(f.id));
        if (pick) {
          usedIds.add(pick.id);
          chosen.push({ v: pick, frac: fractionOfNearestPoint(best.points, pick) });
        } else {
          warning = [warning, `Geen eetstop gevonden tussen ${stop.rangeMin}–${stop.rangeMax}%.`].filter(Boolean).join(' ');
        }
      } catch {
        warning = [warning, 'Eetstop zoeken mislukt.'].filter(Boolean).join(' ');
      }
    }

    if (chosen.length) {
      onProgress?.('Route herberekenen via eetstops…');
      const newAnchors = insertVenueAnchors(best.anchors, best.segments, chosen);
      const rerouted = await calculateLoopRoute(newAnchors, mode, opts);
      if (rerouted) {
        best = { anchors: newAnchors, ...rerouted };
        venues = chosen.sort((a, b) => a.frac - b.frac).map((c) => c.v);
      }
    }
  }

  return {
    anchors: best.anchors,
    points: best.points,
    segments: best.segments,
    distanceM: best.distanceM,
    venues,
    warning,
  };
}
