import { haversine } from './geometry.js';

/**
 * Routing-modi voor de route-editor:
 *  - CUSTOM:  rechte lijn tussen waypoints (geen routing-API)
 *  - ROADS:   volgt wegen en fietsinfrastructuur (BRouter 'trekking')
 *  - POPULAR: bevoordeelt bewegwijzerde fietsnetwerken (lcn/rcn/ncn — o.a. het
 *             Belgische knooppuntennetwerk) sterk boven gewone wegen
 */
export const ROUTING_MODES = { CUSTOM: 'custom', ROADS: 'roads', POPULAR: 'popular' };

// 'trekking' geeft prioriteit aan fietspaden, fietssuggestiewegen en rustige
// wegen boven rijbanen voor auto's.
const TREKKING_PROFILE = 'trekking';

/**
 * Fietsinfrastructuur-types die de router kan onderscheiden binnen de POPULAR-modus.
 * De tag-tests zijn empirisch geverifieerd tegen de tags die brouter.de daadwerkelijk
 * indexeert. Per type kan de gebruiker kiezen het te volgen (standaard) of te vermijden.
 * (CyclOSM-legendeitems 'road shoulder' en 'steps met fietshelling' ontbreken bewust:
 *  BRouter heeft daar geen routbare tag voor.)
 */
export const CYCLE_INFRA_TYPES = [
  { key: 'separate',    icon: '🚲', label: 'Vrijliggend fietspad',    desc: 'Apart fietspad, los van de rijbaan' },
  { key: 'path',        icon: '🌳', label: 'Pad voor fietsers',       desc: 'Pad aangeduid voor fietsers (highway=path)' },
  { key: 'track',       icon: '↔️', label: 'Aanliggend fietspad',     desc: 'Fietspad naast de straat (cycleway=track)' },
  { key: 'lane',        icon: '🛣️', label: 'Fietsstrook',             desc: 'Gemarkeerde strook op de rijbaan (cycleway=lane)' },
  { key: 'shared',      icon: '🚌', label: 'Gedeelde rijstrook',      desc: 'Gedeeld met auto/bus (shared lane / busbaan)' },
  { key: 'cyclestreet', icon: '🏘️', label: 'Fietsstraat',             desc: 'Fietsstraat (auto te gast)' },
  { key: 'contra',      icon: '⬅️', label: 'Tegenrichting fietsers',  desc: 'Eenrichting voor auto, dubbelrichting fietsers' },
];

// BRouter-expressies (prefix-notatie) die elk type herkennen aan OSM-tags.
const INFRA_TESTS = {
  separate:    'highway=cycleway',
  path:        'and highway=path bicycle=designated',
  track:       'or cycleway=track or cycleway:both=track or cycleway:left=track cycleway:right=track',
  lane:        'or cycleway=lane or cycleway:both=lane or cycleway:left=lane cycleway:right=lane',
  shared:      'or cycleway=shared_lane or cycleway:both=shared_lane or cycleway:left=shared_lane or cycleway:right=shared_lane or cycleway:left=share_busway cycleway:right=share_busway',
  cyclestreet: 'cyclestreet=yes',
  contra:      'and oneway=yes oneway:bicycle=no',
};

// Kostenstraf voor een vermeden infrastructuurtype: de router zoekt dan een
// omweg, maar valt er als laatste redmiddel toch op terug (geen harde blokkade,
// zodat er altijd een route gevonden wordt).
const AVOID_PENALTY = 8;

// Vouwt een lijst termen samen tot een geneste BRouter-vermenigvuldiging:
// ['a','b','c'] → 'multiply a multiply b c' (arity-gebaseerd, geen haakjes nodig).
function chainMultiply(terms) {
  if (terms.length === 0) return '1';
  if (terms.length === 1) return terms[0];
  return terms.slice(0, -1).map((t) => `multiply ${t} `).join('') + terms[terms.length - 1];
}

/**
 * Bouwt het BRouter-profiel voor de POPULAR-modus: fietsnetwerken (lcn/rcn/ncn)
 * worden sterk bevoordeeld (× 0.15), en elk vermeden infrastructuurtype krijgt
 * een kostenstraf (× AVOID_PENALTY).
 * @param {string[]} avoidKeys - keys uit CYCLE_INFRA_TYPES die vermeden moeten worden
 */
function buildCycleNetworkProfile(avoidKeys = []) {
  const avoid = new Set(avoidKeys);
  const isAssigns = CYCLE_INFRA_TYPES
    .map((t) => `assign is_${t.key} = ${INFRA_TESTS[t.key]}`)
    .join('\n');
  const penTerms = CYCLE_INFRA_TYPES
    .filter((t) => avoid.has(t.key))
    .map((t) => `switch is_${t.key} ${AVOID_PENALTY} 1`);
  const penaltyExpr = chainMultiply(penTerms);

  return `---context:global
assign validForBikes = true
assign processUnusedTags = false
assign turnInstructionMode = 0
assign downhillcost = 0
assign uphillcost = 0

---context:way

assign any_cycleroute =
  or route_bicycle_icn=yes
  or route_bicycle_ncn=yes
  or route_bicycle_rcn=yes
       route_bicycle_lcn=yes

assign noaccess =
  or access=no
  or access=private
       bicycle=no

${isAssigns}

assign avoidpenalty = ${penaltyExpr}

assign basecost =
  switch or highway=motorway highway=motorway_link 10000
  switch or highway=trunk highway=trunk_link     10000
  switch highway=cycleway                         1.0
  switch and highway=path bicycle=designated      1.0
  switch highway=path                             1.8
  switch or highway=footway highway=pedestrian    3.0
  switch or highway=residential highway=living_street 1.3
  switch or highway=tertiary highway=tertiary_link    1.4
  switch or highway=unclassified highway=service      1.4
  switch or highway=secondary highway=secondary_link  1.7
  switch or highway=primary highway=primary_link      2.2
  switch highway=track                            1.5
  switch highway=                                 10000
  1.5

assign costfactor =
  switch noaccess 10000
  multiply avoidpenalty
  switch any_cycleroute multiply basecost 0.15
  basecost

---context:node

assign initialcost =
  switch or barrier=gate barrier=bollard 0
  0
`;
}

// brouter.de vereist dat custom-profielen eerst geüpload worden; je krijgt een
// tijdelijk profileid terug. We cachen per unieke vermijd-configuratie en
// uploaden opnieuw als het profiel verlopen blijkt.
const profileIdCache = new Map(); // key → Promise<profileid>

function avoidKey(avoidKeys = []) {
  return [...new Set(avoidKeys)].sort().join(',') || 'none';
}

async function uploadProfile(text) {
  const resp = await fetch('https://brouter.de/brouter/profile/', {
    method: 'POST',
    body: text,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await resp.json();
  if (!data.profileid || data.error) {
    throw new Error(data.error || 'Profiel-upload mislukt');
  }
  return data.profileid;
}

function getCycleProfileId(avoidKeys = []) {
  const key = avoidKey(avoidKeys);
  if (!profileIdCache.has(key)) {
    const promise = uploadProfile(buildCycleNetworkProfile(avoidKeys)).catch((e) => {
      profileIdCache.delete(key); // sta een nieuwe poging toe
      throw e;
    });
    profileIdCache.set(key, promise);
  }
  return profileIdCache.get(key);
}

/** Pre-warm: upload alvast het fietsnetwerk-profiel zodra die modus/config gekozen wordt. */
export function prewarmRoutingMode(mode, avoidKeys = []) {
  if (mode === ROUTING_MODES.POPULAR) getCycleProfileId(avoidKeys).catch(() => {});
}

/**
 * Voert één BRouter-aanroep uit en geeft de GeoJSON-features terug (of null bij fout).
 *  - POPULAR: gebruikt het fietsnetwerk-profiel; bij fout opnieuw uploaden, en
 *    als laatste redmiddel terugvallen op 'trekking' (i.p.v. een rechte lijn).
 *  - ROADS:   gebruikt 'trekking'.
 */
async function fetchBrouterFeatures(lonlats, mode, opts = {}) {
  const avoidKeys = opts.avoid || [];
  const attempt = async (profile) => {
    const url = `https://brouter.de/brouter?lonlats=${lonlats}&profile=${profile}&alternativeidx=0&format=geojson`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!resp.ok) throw new Error(`BRouter fout: ${resp.status}`);
    const data = await resp.json();
    if (!data.features?.length) throw new Error('Geen route gevonden');
    return data.features;
  };

  if (mode === ROUTING_MODES.POPULAR) {
    try {
      return await attempt(await getCycleProfileId(avoidKeys));
    } catch {
      profileIdCache.delete(avoidKey(avoidKeys)); // mogelijk verlopen → forceer her-upload
      try {
        return await attempt(await getCycleProfileId(avoidKeys));
      } catch {
        try { return await attempt(TREKKING_PROFILE); } catch { return null; }
      }
    }
  }

  try { return await attempt(TREKKING_PROFILE); } catch { return null; }
}

/**
 * Berekent een fietsroute van `from` naar `to`.
 * Bij CUSTOM: directe rechte lijn. Bij een routing-fout: fallback naar rechte lijn.
 *
 * @param {{lat:number, lng:number}} from
 * @param {{lat:number, lng:number}} to
 * @param {string} [mode='roads']  - een van ROUTING_MODES
 * @param {{avoid?: string[]}} [opts] - te vermijden infrastructuurtypes (POPULAR)
 * @returns {Promise<{lat:number, lng:number}[]>}
 */
export async function calculateSegment(from, to, mode = ROUTING_MODES.ROADS, opts = {}) {
  if (mode === ROUTING_MODES.CUSTOM) return [from, to];
  const lonlats = `${from.lng},${from.lat}|${to.lng},${to.lat}`;
  const features = await fetchBrouterFeatures(lonlats, mode, opts);
  if (!features) return [from, to]; // graceful fallback: rechte lijn
  // BRouter GeoJSON-coördinaten zijn [lng, lat, ele] → converteren naar {lat, lng}
  return features[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
}

/**
 * Berekent een route van `from` DOOR `through` NAAR `to` in één BRouter-aanroep.
 * BRouter geeft bij meerdere waypoints één feature per segment terug, waardoor
 * de splitsing exact en zonder zoeklogica verloopt.
 *
 * Geeft twee segmenten terug: { seg1: from→through, seg2: through→to }.
 *
 * @param {{lat:number,lng:number}} from
 * @param {{lat:number,lng:number}} through
 * @param {{lat:number,lng:number}} to
 * @param {string} [mode='roads']  - een van ROUTING_MODES
 * @param {{avoid?: string[]}} [opts] - te vermijden infrastructuurtypes (POPULAR)
 * @returns {Promise<{ seg1: {lat,lng}[], seg2: {lat,lng}[] }>}
 */
export async function calculateSegmentsThroughWaypoint(from, through, to, mode = ROUTING_MODES.ROADS, opts = {}) {
  if (mode === ROUTING_MODES.CUSTOM) {
    return { seg1: [from, through], seg2: [through, to] };
  }

  const lonlats = `${from.lng},${from.lat}|${through.lng},${through.lat}|${to.lng},${to.lat}`;
  const features = await fetchBrouterFeatures(lonlats, mode, opts);

  if (features && features.length >= 2) {
    // BRouter geeft één feature per segment-paar — directe splitsing, geen zoeklogica nodig
    const seg1 = features[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const seg2 = features[1].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    return {
      seg1: seg1.length >= 2 ? seg1 : [from, through],
      seg2: seg2.length >= 2 ? seg2 : [through, to],
    };
  }

  if (features && features.length === 1) {
    // Eén aaneengesloten feature → splits op het dichtstbijzijnde punt bij `through`
    const allPoints = features[0].geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    let splitIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < allPoints.length; i++) {
      const d = Math.hypot(allPoints[i].lat - through.lat, allPoints[i].lng - through.lng);
      if (d < minDist) { minDist = d; splitIdx = i; }
    }
    const seg1 = allPoints.slice(0, splitIdx + 1);
    const seg2 = allPoints.slice(splitIdx);
    return {
      seg1: seg1.length >= 2 ? seg1 : [from, through],
      seg2: seg2.length >= 2 ? seg2 : [through, to],
    };
  }

  // Fallback: twee aparte aanroepen
  const [seg1, seg2] = await Promise.all([
    calculateSegment(from, through, mode, opts),
    calculateSegment(through, to, mode, opts),
  ]);
  return { seg1, seg2 };
}

/**
 * Berekent routes tussen alle opeenvolgende waypoints tegelijk (parallel).
 * Geeft een { points, segments } object terug.
 * Wordt uitsluitend gebruikt in teken-modus (draw) voor nieuwe routes.
 *
 * @param {{lat:number, lng:number}[]} waypoints
 * @param {string} [mode='roads']  - een van ROUTING_MODES
 * @param {{avoid?: string[]}} [opts] - te vermijden infrastructuurtypes (POPULAR)
 * @returns {Promise<{ points: {lat,lng}[], segments: {lat,lng}[][] }>}
 */
export async function calculateFullRoute(waypoints, mode = ROUTING_MODES.ROADS, opts = {}) {
  if (waypoints.length < 2) return { points: [...waypoints], segments: [] };

  const segmentPromises = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    segmentPromises.push(calculateSegment(waypoints[i], waypoints[i + 1], mode, opts));
  }

  const segments = await Promise.all(segmentPromises);

  // Samenvoegen: sla het eerste punt van elk segment (behalve het eerste) over
  const points = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (i === 0) {
      points.push(...seg);
    } else {
      points.push(...seg.slice(1));
    }
  }

  return { points, segments };
}

/**
 * Berekent een gesloten lus door alle `anchors` en terug naar het eerste punt,
 * in één BRouter-aanroep. Geeft per-segment-geometrie terug (één segment per edge
 * van de gesloten lus, inclusief de terugweg naar de start) plus de samengevoegde
 * puntenlijst en de totale lengte.
 *
 * Geeft `null` terug als de routing faalt — zo kan de aanroeper een mislukte lus
 * detecteren i.p.v. (zoals `calculateSegment`) stilletjes op een rechte lijn terug
 * te vallen en een onjuiste afstand te meten.
 *
 * @param {{lat:number,lng:number}[]} anchors - open ankerlijst (niet gesloten)
 * @param {string} [mode='roads']
 * @param {{avoid?: string[]}} [opts]
 * @returns {Promise<{ points: {lat,lng}[], segments: {lat,lng}[][], distanceM: number }|null>}
 */
export async function calculateLoopRoute(anchors, mode = ROUTING_MODES.ROADS, opts = {}) {
  if (anchors.length < 2) return null;
  const closed = [...anchors, anchors[0]]; // sluit de lus

  if (mode === ROUTING_MODES.CUSTOM) {
    const segments = [];
    for (let i = 0; i < closed.length - 1; i++) segments.push([closed[i], closed[i + 1]]);
    const points = [closed[0], ...segments.map((s) => s[1])];
    return { points, segments, distanceM: routeLength(points) };
  }

  const lonlats = closed.map((p) => `${p.lng},${p.lat}`).join('|');
  const features = await fetchBrouterFeatures(lonlats, mode, opts);
  if (!features) return null; // routing mislukt — geen rechte-lijn-fallback

  // Voeg alle features samen tot één puntenlijst …
  const merged = [];
  features.forEach((f, i) => {
    const pts = f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    if (i === 0) merged.push(...pts);
    else merged.push(...pts.slice(1));
  });
  // … deel die opnieuw in per anker-edge (robuust of BRouter nu één feature per
  // segment of één samengevoegde feature teruggeeft) …
  const rawSegments = splitRouteIntoSegments(merged, closed);
  // … en knip de "staartjes" weg: rond een anker delen de route ernaartoe en ervan-
  //   daan soms hetzelfde wegstuk (heen-en-weer), wat een doodlopende stub tekent.
  const segments = removeAnchorOverlaps(rawSegments);

  // Puntenlijst herbouwen uit de getrimde segmenten (dubbel koppelpunt overslaan).
  const points = [];
  segments.forEach((seg, i) => {
    if (i === 0) points.push(...seg);
    else points.push(...seg.slice(1));
  });
  return { points, segments, distanceM: routeLength(points) };
}

// Maximale loodrechte afstand (m) waarbinnen de uitgaande tak nog als "teruggelegd
// over de inkomende tak" geldt. Ruim genoeg voor een net andere parallelle weg of een
// afwijkende puntdichtheid op heen- en terugweg, maar klein genoeg om geen echte bocht
// weg te knippen.
const SPUR_EPS_M = 15;
// Hoeveel inkomende edges we per stap achterwaarts doorzoeken (vangt verschil in
// puntdichtheid tussen heen- en terugweg op).
const SPUR_LOOKBACK = 6;

// Loodrechte afstand (m) van punt p tot het lijnstuk a–b, plus de projectieparameter
// t ∈ [0,1] langs a→b. Lokale equirectangulaire projectie met p als oorsprong.
function pointSegInfo(p, a, b) {
  const R = 6371000;
  const cos = Math.cos((p.lat * Math.PI) / 180);
  const toXY = (q) => ({
    x: ((q.lng - p.lng) * Math.PI) / 180 * R * cos,
    y: ((q.lat - p.lat) * Math.PI) / 180 * R,
  });
  const A = toXY(a);
  const B = toXY(b);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? (-A.x * dx - A.y * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = A.x + t * dx;
  const cy = A.y + t * dy;
  return { dist: Math.hypot(cx, cy), t };
}

/**
 * Verwijdert "staartjes" (heen-en-weer stubs) rond de ankers van een gesloten lus.
 *
 * Bij een via-anker kan de goedkoopste route ernaartoe en de goedkoopste route ervandaan
 * deels hetzelfde wegstuk delen. Dat tekent als een doodlopend uitstapje. Per anker-
 * overgang volgen we hoe ver de uitgaande tak de inkomende tak achterstevoren terugvolgt
 * — gemeten als loodrechte afstand tot de inkomende polylijn, zodat ongelijke
 * puntdichtheid of een licht andere parallelle weg het niet breekt — en knippen dat stuk
 * weg, zodat de route gewoon door het divergentiepunt loopt.
 *
 * Bewust NIET cyclisch: de sluit-overgang (laatste ↔ eerste segment) deelt het
 * startpunt, en een korte heen-en-weer aan de start is gewenst (je vertrekt en keert
 * terug op hetzelfde punt). Die overgang laten we dus met rust. Een segment houdt altijd
 * ≥ 2 punten over.
 *
 * @param {{lat:number,lng:number}[][]} segments - segmenten van de gesloten lus
 * @returns {{lat:number,lng:number}[][]}
 */
export function removeAnchorOverlaps(segments) {
  if (segments.length < 2) return segments;
  const segs = segments.map((s) => [...s]); // niet muteren

  // Alleen interne anker-overgangen: einde van segs[s] sluit aan op begin van segs[s+1].
  // De sluit-overgang (s = n-1 → segs[0]) bij het startpunt slaan we over.
  for (let s = 0; s < segs.length - 1; s++) {
    const segIn = segs[s];
    const segOut = segs[s + 1];
    if (segIn.length < 2 || segOut.length < 2) continue;

    // `frontier` = inkomende edge-index (onderste vertex) waar we momenteel zitten;
    // loopt vanaf de laatste edge enkel achterwaarts terwijl de terugweg overlapt.
    let frontier = segIn.length - 2;
    let cut = 0;        // tot welke segOut-index de overlap reikt
    let cutEdge = -1;   // inkomende edge waar segOut[cut] op projecteert (divergentie)
    let cutT = 0;       // projectieparameter op die edge
    for (let j = 1; j < segOut.length; j++) {
      const lo = Math.max(0, frontier - SPUR_LOOKBACK);
      let bestD = Infinity;
      let bestEdge = -1;
      let bestT = 0;
      for (let e = frontier; e >= lo; e--) {
        const { dist, t } = pointSegInfo(segOut[j], segIn[e], segIn[e + 1]);
        if (dist < bestD) { bestD = dist; bestEdge = e; bestT = t; }
      }
      if (bestD <= SPUR_EPS_M && bestEdge >= 0) {
        frontier = bestEdge; // alleen achterwaarts (search ≤ frontier)
        cut = j;
        cutEdge = bestEdge;
        cutT = bestT;
      } else {
        break;
      }
    }

    // Geen overlap, of de overlap beslaat (bijna) heel segOut → laat ongemoeid.
    if (cut < 1 || cut > segOut.length - 2) continue;

    // Inkomende tak inkorten tot het divergentiepunt; uitgaande tak vanaf cut.
    // Belangrijk: beide takken moeten exact hetzelfde knooppunt delen (laatste punt van
    // segIn === eerste punt van segOut), anders ontstaat een gat — de rest van de code
    // (samenvoegen, GPX-export, per-segment rendering) rekent op die invariant.
    const a = segIn[cutEdge];
    const b = segIn[cutEdge + 1];
    const newIn = segIn.slice(0, cutEdge + 1);
    if (cutT > 1e-9) {
      newIn.push({
        lat: a.lat + cutT * (b.lat - a.lat),
        lng: a.lng + cutT * (b.lng - a.lng),
      });
    }
    const junction = newIn[newIn.length - 1];
    const newOut = [junction, ...segOut.slice(cut + 1)];
    if (newIn.length >= 2 && newOut.length >= 2) {
      segs[s] = newIn;
      segs[s + 1] = newOut;
    }
  }

  return segs;
}

function routeLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1], points[i]);
  return total;
}

/**
 * Splitst een bestaand segment geometrisch op bij een nieuw ingevoegd waypoint.
 * Er wordt geen routing-API aangeroepen: de bestaande puntarray wordt opgedeeld
 * op de edge die het dichtst bij `newPoint` ligt.
 *
 * @param {{lat:number, lng:number}[]|null} segmentPoints - huidig segment (kan null zijn als nog niet geladen)
 * @param {{lat:number, lng:number}} newPoint             - nieuw ingevoegd waypoint
 * @returns {{ seg1: {lat,lng}[], seg2: {lat,lng}[] }}
 */
export function splitSegmentAtPoint(segmentPoints, newPoint) {
  if (!segmentPoints || segmentPoints.length < 2) {
    return { seg1: [newPoint, newPoint], seg2: [newPoint, newPoint] };
  }

  // Zoek de edge (i → i+1) waarvan het midden het dichtst bij newPoint ligt
  let bestEdge = 0;
  let minDist = Infinity;
  for (let i = 0; i < segmentPoints.length - 1; i++) {
    const midLat = (segmentPoints[i].lat + segmentPoints[i + 1].lat) / 2;
    const midLng = (segmentPoints[i].lng + segmentPoints[i + 1].lng) / 2;
    const d = Math.hypot(newPoint.lat - midLat, newPoint.lng - midLng);
    if (d < minDist) { minDist = d; bestEdge = i; }
  }

  const insertAt = bestEdge + 1;
  const seg1 = [...segmentPoints.slice(0, insertAt), newPoint];
  const seg2 = [newPoint, ...segmentPoints.slice(insertAt)];

  return {
    seg1: seg1.length >= 2 ? seg1 : [segmentPoints[0], newPoint],
    seg2: seg2.length >= 2 ? seg2 : [newPoint, segmentPoints[segmentPoints.length - 1]],
  };
}

/**
 * Voegt twee aangrenzende segmenten samen tot één (bij verwijdering van een waypoint).
 * De aaneenschakeling verwijdert het dubbele koppelpunt.
 *
 * @param {{lat:number, lng:number}[]|null} segBefore
 * @param {{lat:number, lng:number}[]|null} segAfter
 * @param {{lat:number, lng:number}} fallbackFrom
 * @param {{lat:number, lng:number}} fallbackTo
 * @returns {{lat:number, lng:number}[]}
 */
export function mergeSegments(segBefore, segAfter, fallbackFrom, fallbackTo) {
  if (!segBefore || !segAfter) return [fallbackFrom, fallbackTo];
  // Sla het eerste punt van segAfter over (identiek aan laatste punt van segBefore)
  const merged = [...segBefore, ...segAfter.slice(1)];
  return merged.length >= 2 ? merged : [fallbackFrom, fallbackTo];
}

/**
 * Splitst een dichte puntarray op in segmenten op basis van waypoints.
 * Voor elk paar opeenvolgende waypoints wordt de overeenkomende slice uit
 * `allPoints` teruggegeven — zonder enige routing-API-aanroep.
 * Zo blijft de originele GPX-route bewaard bij het openen van de bewerkingsmodus.
 *
 * @param {{lat:number, lng:number}[]} allPoints  - volledige GPX-trackpunten
 * @param {{lat:number, lng:number}[]} waypoints  - geëxtraheerde waypoints
 * @returns {{lat:number, lng:number}[][]}         - één segment per waypoint-paar
 */
export function splitRouteIntoSegments(allPoints, waypoints) {
  // Zoek de index van een waypoint in allPoints: eerst exact, dan nearest-neighbor.
  // searchFrom garandeert dat indices monotoon oplopen.
  function findIndex(searchFrom, target) {
    for (let i = searchFrom; i < allPoints.length; i++) {
      if (allPoints[i].lat === target.lat && allPoints[i].lng === target.lng) return i;
    }
    let best = searchFrom;
    let minDist = Infinity;
    for (let i = searchFrom; i < allPoints.length; i++) {
      const d = Math.hypot(allPoints[i].lat - target.lat, allPoints[i].lng - target.lng);
      if (d < minDist) { minDist = d; best = i; }
    }
    return best;
  }

  // Verzamel indices (monotoon oplopend)
  const indices = [];
  let cursor = 0;
  for (const wp of waypoints) {
    const idx = findIndex(cursor, wp);
    indices.push(idx);
    cursor = idx + 1;
  }

  // Snij segmenten uit allPoints
  const segments = [];
  for (let i = 0; i < indices.length - 1; i++) {
    const slice = allPoints.slice(indices[i], indices[i + 1] + 1);
    segments.push(slice.length >= 2 ? slice : [waypoints[i], waypoints[i + 1]]);
  }
  return segments;
}

/**
 * Extraheert een gespreide steekproef van ~targetCount waypoints uit een dichte puntarray.
 * Altijd inclusief eerste en laatste punt.
 *
 * @param {{lat:number, lng:number}[]} points
 * @param {number} targetCount
 * @returns {{lat:number, lng:number}[]}
 */
export function extractWaypointsFromRoute(points, targetCount = 10) {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];

  const count = Math.max(2, Math.min(targetCount, points.length));
  if (count >= points.length) return [...points];

  // Bereken cumulatieve afstand
  const cumDist = [0];
  for (let i = 1; i < points.length; i++) {
    cumDist.push(cumDist[i - 1] + haversine(points[i - 1], points[i]));
  }
  const totalDist = cumDist[cumDist.length - 1];
  const step = totalDist / (count - 1);

  const result = [points[0]];
  for (let t = 1; t < count - 1; t++) {
    const target = t * step;
    // Vind het punt dat het dichtst bij `target` cumulatieve afstand zit
    let best = 1;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(cumDist[i] - target) < Math.abs(cumDist[best] - target)) {
        best = i;
      }
    }
    result.push(points[best]);
  }
  result.push(points[points.length - 1]);

  return result;
}
