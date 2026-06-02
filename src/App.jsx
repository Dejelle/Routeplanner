import { useState, useCallback, useRef, useEffect } from 'react';
import { HeadingOffsetProvider } from './contexts/HeadingOffsetContext.jsx';
import MapView from './components/MapView.jsx';
import StreetPanel from './components/StreetPanel.jsx';
import ExplorePanel from './components/ExplorePanel.jsx';
import AmenitiesPanel from './components/AmenitiesPanel.jsx';
import TabButton from './components/TabButton.jsx';
import GpxUploader from './components/GpxUploader.jsx';
import GpxOverlayUploader from './components/GpxOverlayUploader.jsx';
import ApiKeyModal from './components/ApiKeyModal.jsx';
import ConfirmLoadModal from './components/ConfirmLoadModal.jsx';
import ConfigModal from './components/ConfigModal.jsx';
import RecentRoutesPanel from './components/RecentRoutesPanel.jsx';
import { parseGpx } from './utils/gpxParser.js';
import { subsampleRoute, getBbox } from './utils/geometry.js';
import { fetchRoads } from './utils/overpass.js';
import { buildWayIndex, nearestRoad } from './utils/spatialMatch.js';
import { buildSegments, buildIntersections } from './utils/streetAnalyzer.js';
import { loadConfig, saveConfig } from './utils/config.js';
import { saveRoute, deleteRoute } from './utils/routeCache.js';
import { prefetchImages } from './utils/prefetch.js';
import { downloadGpx } from './utils/gpxExport.js';
import { listBadStreets, markBad, unmarkBad } from './utils/badStreets.js';
import { matchRouteToRoads } from './utils/mapMatching.js';
import { calculateSegment, calculateSegmentsThroughWaypoint, extractWaypointsFromRoute, splitRouteIntoSegments, splitSegmentAtPoint, mergeSegments, ROUTING_MODES, CYCLE_INFRA_TYPES, prewarmRoutingMode } from './utils/routeCalc.js';
import RouteEditorToolbar from './components/RouteEditorToolbar.jsx';
import FinalizeRouteModal from './components/FinalizeRouteModal.jsx';
import LoopGeneratorPanel from './components/LoopGeneratorPanel.jsx';
import { generateLoop } from './utils/loopGenerator.js';

export default function App() {
  const [gpxPoints, setGpxPoints] = useState([]);
  const [segments, setSegments] = useState([]);
  const [intersections, setIntersections] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [error, setError] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [routeName, setRouteName] = useState('');
  const [apiKey, setApiKey] = useState(
    () => import.meta.env.VITE_STREETVIEW_API_KEY || localStorage.getItem('sv_api_key') || ''
  );
  const [config, setConfig] = useState(() => loadConfig());
  const [showApiModal, setShowApiModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [streetViewActive, setStreetViewActive] = useState(false);
  const [activeTab, setActiveTab] = useState('route');
  const [explorePoint, setExplorePoint] = useState(null);
  const [selectedAmenity, setSelectedAmenity] = useState(null);
  const [visibleAmenities, setVisibleAmenities] = useState([]);
  const [badStreets, setBadStreets] = useState(new Map());
  const [overlayPoints, setOverlayPoints] = useState([]);
  const [overlayName, setOverlayName] = useState('');

  const lastSampledRef = useRef(null);

  // ── Route editor state ──────────────────────────────────────────────────────
  const [routeEditMode, setRouteEditMode] = useState(null); // null | 'draw' | 'edit'
  const [editWaypoints, setEditWaypoints] = useState([]);   // {id, lat, lng}[]
  const [editSegments, setEditSegments] = useState([]);     // ({lat,lng}[] | null)[]
  const [routingMode, setRoutingMode] = useState(ROUTING_MODES.ROADS); // custom | roads | popular
  const [cycleAvoid, setCycleAvoid] = useState([]); // keys uit CYCLE_INFRA_TYPES die vermeden worden (POPULAR)
  const routingModeRef = useRef(routingMode); // stale-closure fix voor handlers
  const cycleAvoidRef = useRef(cycleAvoid);

  const toggleCycleAvoid = useCallback((key) => {
    setCycleAvoid((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  // ── Lus-generator state ───────────────────────────────────────────────────
  const [loopStart, setLoopStart] = useState(null);          // {lat,lng} | null
  const [pickingLoopStart, setPickingLoopStart] = useState(false);
  const [isGeneratingLoop, setIsGeneratingLoop] = useState(false);
  const [loopStatus, setLoopStatus] = useState('');
  const [loopError, setLoopError] = useState(null);

  const handleTogglePickLoopStart = useCallback(() => {
    setPickingLoopStart((p) => !p);
  }, []);

  const dragTimersRef = useRef({});       // debounce per waypoint-id
  const abortControllersRef = useRef({}); // AbortController per segment-index
  const latestWaypointsRef = useRef([]);  // altijd meest recente editWaypoints (stale-closure fix)
  const latestSegmentsRef = useRef([]);   // altijd meest recente editSegments (stale-closure fix)

  useEffect(() => {
    latestWaypointsRef.current = editWaypoints;
  }, [editWaypoints]);

  useEffect(() => {
    latestSegmentsRef.current = editSegments;
  }, [editSegments]);

  // Houd de refs synchroon en pre-warm het fietsnetwerk-profiel bij modus-/configkeuze
  useEffect(() => {
    routingModeRef.current = routingMode;
    cycleAvoidRef.current = cycleAvoid;
    prewarmRoutingMode(routingMode, cycleAvoid);
  }, [routingMode, cycleAvoid]);

  useEffect(() => {
    listBadStreets().then(setBadStreets).catch(() => {});
  }, []);

  const toggleBadStreet = useCallback(async (roadId, name, geometry) => {
    if (roadId == null) return;
    if (badStreets.has(roadId)) {
      await unmarkBad(roadId).catch(() => {});
      setBadStreets((prev) => {
        const next = new Map(prev);
        next.delete(roadId);
        return next;
      });
    } else {
      await markBad(roadId, name, geometry).catch(() => {});
      setBadStreets((prev) =>
        new Map(prev).set(roadId, { id: roadId, name, geometry, markedAt: Date.now() })
      );
    }
  }, [badStreets]);

  // ── Route editor handlers ───────────────────────────────────────────────────

  /** Herbereken de opgegeven segment-indices.
   *  Speciale behandeling: als het twee opeenvolgende indices zijn (één verplaatst waypoint),
   *  gebruik dan één 3-punts OSRM-aanroep om heen-en-terug-routing te voorkomen.
   */
  const recalcSegments = useCallback((waypoints, indices) => {
    const mode = routingModeRef.current;
    const opts = { avoid: cycleAvoidRef.current };
    // Twee opeenvolgende segmenten → één vloeiende route via het middenpunt
    if (indices.length === 2 && indices[1] === indices[0] + 1) {
      const [i1, i2] = indices;
      const midIdx = i1 + 1; // het versleepte waypoint ligt op positie i1+1

      abortControllersRef.current[i1]?.abort();
      abortControllersRef.current[i2]?.abort();
      const controller = new AbortController();
      abortControllersRef.current[i1] = controller;
      abortControllersRef.current[i2] = controller;

      setEditSegments((prev) => {
        const next = [...prev];
        next[i1] = null;
        next[i2] = null;
        return next;
      });

      calculateSegmentsThroughWaypoint(waypoints[i1], waypoints[midIdx], waypoints[i2 + 1], mode, opts)
        .then(({ seg1, seg2 }) => {
          if (controller.signal.aborted) return;
          setEditSegments((prev) => {
            const next = [...prev];
            next[i1] = seg1;
            next[i2] = seg2;
            return next;
          });
        });
      return;
    }

    // Standaard: elk segment apart berekenen (voor start/eindpunten of niet-opeenvolgende indices)
    indices.forEach((i) => {
      abortControllersRef.current[i]?.abort();
      const controller = new AbortController();
      abortControllersRef.current[i] = controller;

      setEditSegments((prev) => {
        const next = [...prev];
        next[i] = null; // loading
        return next;
      });

      calculateSegment(waypoints[i], waypoints[i + 1], mode, opts).then((pts) => {
        if (controller.signal.aborted) return;
        setEditSegments((prev) => {
          const next = [...prev];
          next[i] = pts;
          return next;
        });
      });
    });
  }, []);

  const [showNewRouteConfirm, setShowNewRouteConfirm] = useState(false);

  const handleStartDraw = useCallback(() => {
    if (gpxPoints.length > 0) {
      // Er is al een route geladen — vraag bevestiging
      setShowNewRouteConfirm(true);
      return;
    }
    setRoutingMode(ROUTING_MODES.ROADS);
    setRouteEditMode('draw');
    setEditWaypoints([]);
    setEditSegments([]);
  }, [gpxPoints.length]);

  const handleConfirmNewRoute = useCallback(() => {
    setShowNewRouteConfirm(false);
    // Huidige route wissen
    setGpxPoints([]);
    setSegments([]);
    setIntersections([]);
    setRouteName('');
    setStreetViewActive(false);
    setRoutingMode(ROUTING_MODES.ROADS);
    setRouteEditMode('draw');
    setEditWaypoints([]);
    setEditSegments([]);
  }, []);

  const handleStartEdit = useCallback(() => {
    if (!gpxPoints.length) return;
    setRoutingMode(ROUTING_MODES.ROADS);
    const sampled = extractWaypointsFromRoute(gpxPoints, 10);
    const wps = sampled.map((p) => ({ id: crypto.randomUUID(), ...p }));

    // Gebruik de originele GPX-trackpunten als initiële segmenten.
    // Zo blijft de route identiek aan de geïmporteerde GPX — OSRM wordt pas
    // aangeroepen als de gebruiker daadwerkelijk een waypoint wijzigt.
    const segs = splitRouteIntoSegments(gpxPoints, sampled);

    setEditWaypoints(wps);
    setEditSegments(segs);
    setRouteEditMode('edit');
  }, [gpxPoints]);

  const handleGenerateLoop = useCallback(async ({ targetDistanceM, bearingDeg, venue }) => {
    if (!loopStart) return;
    setIsGeneratingLoop(true);
    setLoopError(null);
    setLoopStatus('');
    try {
      const result = await generateLoop({
        start: loopStart,
        targetDistanceM,
        bearingDeg,
        mode: routingMode,
        avoid: cycleAvoid,
        venue,
        onProgress: setLoopStatus,
      });
      // Gesloten waypoint-lijst: ankers + kopie van de start als sluitpunt, zodat
      // het in het bestaande edit-model (n waypoints → n-1 segmenten) past.
      const wps = result.anchors.map((p) => ({ id: crypto.randomUUID(), lat: p.lat, lng: p.lng, venue: p.venue || null }));
      wps.push({ id: crypto.randomUUID(), lat: result.anchors[0].lat, lng: result.anchors[0].lng });
      setEditWaypoints(wps);
      setEditSegments(result.segments);
      setRouteName('Gegenereerde lus');
      setRouteEditMode('edit');
      setPickingLoopStart(false);
      if (result.warning) setLoopError(result.warning); // niet-blokkerende info
    } catch (e) {
      setLoopError(e.message || 'Genereren mislukt.');
    } finally {
      setIsGeneratingLoop(false);
      setLoopStatus('');
    }
  }, [loopStart, routingMode, cycleAvoid]);

  const handleAddWaypoint = useCallback((latlng) => {
    const wp = { id: crypto.randomUUID(), lat: latlng.lat, lng: latlng.lng };
    // Gebruik de ref om de meest recente waypoints te lezen zonder stale closure
    const prevWaypoints = latestWaypointsRef.current;
    setEditWaypoints([...prevWaypoints, wp]);

    if (prevWaypoints.length >= 1) {
      const fromWp = prevWaypoints[prevWaypoints.length - 1];
      const segIndex = prevWaypoints.length - 1; // = prevWaypoints.length - 1 = segmenten vóór nieuwe
      setEditSegments((prev) => [...prev, null]);
      calculateSegment(fromWp, wp, routingModeRef.current, { avoid: cycleAvoidRef.current }).then((pts) => {
        setEditSegments((s) => {
          const ns = [...s];
          ns[segIndex] = pts;
          return ns;
        });
      });
    }
  }, []);

  const handleInsertWaypoint = useCallback((latlng, segmentIndex) => {
    const wp = { id: crypto.randomUUID(), lat: latlng.lat, lng: latlng.lng };
    const prevWaypoints = latestWaypointsRef.current;
    const newWaypoints = [...prevWaypoints];
    newWaypoints.splice(segmentIndex + 1, 0, wp);

    setEditWaypoints(newWaypoints);

    // Splits het bestaande segment geometrisch op — geen routing-API nodig.
    // BRouter wordt pas aangeroepen als de gebruiker het waypoint daadwerkelijk verplaatst.
    const existingSegment = latestSegmentsRef.current[segmentIndex];
    const { seg1, seg2 } = splitSegmentAtPoint(existingSegment, wp);

    setEditSegments((prevSegs) => {
      const nextSegs = [...prevSegs];
      nextSegs.splice(segmentIndex, 1, seg1, seg2);
      return nextSegs;
    });
  }, []);

  const handleMoveWaypoint = useCallback((id, latlng) => {
    // Directe visuele update
    setEditWaypoints((prev) => prev.map((wp) => (wp.id === id ? { ...wp, lat: latlng.lat, lng: latlng.lng } : wp)));
    // Debounced herberekening
    clearTimeout(dragTimersRef.current[id]);
    dragTimersRef.current[id] = setTimeout(() => {
      const wps = latestWaypointsRef.current;
      const i = wps.findIndex((w) => w.id === id);
      if (i === -1) return;
      const affected = [i - 1, i].filter((x) => x >= 0 && x < wps.length - 1);
      recalcSegments(wps, affected);
    }, 300);
  }, [recalcSegments]);

  const handleRemoveWaypoint = useCallback((id) => {
    const wps = latestWaypointsRef.current;
    const idx = wps.findIndex((w) => w.id === id);
    if (idx === -1) return;

    const newWaypoints = wps.filter((_, i) => i !== idx);
    setEditWaypoints(newWaypoints);

    if (idx === 0) {
      // Eerste waypoint verwijderd → verwijder segment 0
      setEditSegments((prev) => prev.slice(1));
    } else if (idx === wps.length - 1) {
      // Laatste waypoint verwijderd → verwijder laatste segment
      setEditSegments((prev) => prev.slice(0, -1));
    } else {
      // Middelste waypoint verwijderd → voeg de twee aangrenzende segmenten samen
      // zonder routing-API aan te roepen: de bestaande geometrie blijft intact.
      const segIdx = idx - 1;
      const fromWp = newWaypoints[segIdx];
      const toWp   = newWaypoints[segIdx + 1];
      const merged = mergeSegments(
        latestSegmentsRef.current[segIdx],
        latestSegmentsRef.current[segIdx + 1],
        fromWp,
        toWp,
      );
      setEditSegments((prev) => {
        const next = [...prev];
        next.splice(segIdx, 2, merged);
        return next;
      });
    }
  }, []);

  const handleUndoWaypoint = useCallback(() => {
    setEditWaypoints((prev) => prev.slice(0, -1));
    setEditSegments((prev) => prev.slice(0, -1));
  }, []);

  const handleResetEdit = useCallback(() => {
    setEditWaypoints([]);
    setEditSegments([]);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setRouteEditMode(null);
    setEditWaypoints([]);
    setEditSegments([]);
  }, []);

  // Pending route bij het voltooien: { points, defaultName, isEdit } | null
  const [finalizePrompt, setFinalizePrompt] = useState(null);

  // Klik op "Voltooien" → valideer, vlak de segmenten af en open de naam-modal.
  const handleCompleteEdit = useCallback(() => {
    const segs = editSegments;
    if (segs.some((s) => s === null)) return;
    if (segs.length === 0) return;

    // Plat samenvoegen, duplicaten op naaden weglaten
    const flattened = [];
    for (let i = 0; i < segs.length; i++) {
      if (i === 0) {
        flattened.push(...segs[i]);
      } else {
        flattened.push(...segs[i].slice(1));
      }
    }

    const defaultName =
      routeEditMode === 'draw'
        ? `Getekende route ${new Date().toLocaleDateString('nl-BE')}`
        : routeName || 'Bewerkte route';

    setFinalizePrompt({ points: flattened, defaultName, isEdit: routeEditMode === 'edit' });
  }, [editSegments, routeEditMode, routeName]);

  // Sluit de editor en zet de definitieve route op de kaart.
  const finishEditing = useCallback((points, name) => {
    setGpxPoints(points);
    setRouteName(name);
    setRouteEditMode(null);
    setEditWaypoints([]);
    setEditSegments([]);
    setFinalizePrompt(null);
  }, []);

  // "Opslaan & analyseren"
  const handleFinalizeAnalyze = useCallback((name) => {
    if (!finalizePrompt) return;
    const { points } = finalizePrompt;
    finishEditing(points, name);
    const sampled = subsampleRoute(points, 100);
    lastSampledRef.current = { sampled, name, fullPoints: points };
    // runAnalysis wordt verderop gedefinieerd en is stabiel ([] deps); bewust niet in deps.
    runAnalysis(sampled, name, setAnalysisStatus, points);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalizePrompt, finishEditing]);

  // "Enkel opslaan" — bewaar de route in de cache zonder Street View-analyse.
  const handleFinalizeSaveOnly = useCallback((name) => {
    if (!finalizePrompt) return;
    const { points } = finalizePrompt;
    finishEditing(points, name);
    // Geen analyse: lege segmenten/kruispunten. De route blijft op de kaart staan
    // en is herlaadbaar/exporteerbaar via "Recente routes".
    setSegments([]);
    setIntersections([]);
    setStreetViewActive(false);
    const routeRecord = {
      id: `${name}-${Date.now()}`,
      name,
      loadedAt: Date.now(),
      gpxPoints: points,
      segments: [],
      intersections: [],
    };
    saveRoute(routeRecord).catch(() => {});
  }, [finalizePrompt, finishEditing]);

  const handleMapClick = useCallback((latlng) => {
    if (pickingLoopStart) {
      setLoopStart({ lat: latlng.lat, lng: latlng.lng });
      setPickingLoopStart(false);
      return;
    }
    if (routeEditMode === 'draw' || routeEditMode === 'edit') {
      // In edit-modus: klik op lege kaart verlengt de route vanaf het eindpunt
      handleAddWaypoint(latlng);
      return;
    }
    setExplorePoint(latlng);
    setActiveTab('explore');
  }, [pickingLoopStart, routeEditMode, handleAddWaypoint]);

  const handleAmenitySelect = useCallback((amenity) => {
    setSelectedAmenity(amenity);
    setFlyTarget({ lat: amenity.lat, lng: amenity.lng });
  }, []);

  const handleTabClick = useCallback((tab) => {
    setActiveTab(prev => prev === tab ? null : tab);
  }, []);

  const handleApiKeySave = (key) => {
    setApiKey(key);
    localStorage.setItem('sv_api_key', key);
  };

  const handleConfigSave = (cfg) => {
    setConfig(cfg);
    saveConfig(cfg);
  };

  const handleOverlayUpload = useCallback((text, filename) => {
    try {
      const pts = parseGpx(text);
      if (!pts.length) {
        setError('Overlay-GPX bevat geen trackpunten.');
        return;
      }
      setOverlayPoints(pts);
      setOverlayName(filename.replace(/\.gpx$/i, ''));
    } catch {
      setError('Kon het overlay-GPX-bestand niet lezen.');
    }
  }, []);

  const handleOverlayClear = useCallback(() => {
    setOverlayPoints([]);
    setOverlayName('');
  }, []);

  const handleExportGpx = useCallback(() => {
    if (!gpxPoints.length) return;
    try {
      downloadGpx(gpxPoints, routeName || 'route');
    } catch (err) {
      setError(err.message);
    }
  }, [gpxPoints, routeName]);

  const runAnalysis = useCallback(async (sampled, name, setStatus, fullPoints) => {
    setError(null);
    setSegments([]);
    setIntersections([]);
    setStreetViewActive(false);
    setIsAnalyzing(true);
    try {
      setStatus?.('Wegen ophalen via OpenStreetMap…');
      const bbox = getBbox(sampled);
      const ways = await fetchRoads(bbox);
      setStatus?.('Straten analyseren…');
      const wayIndex = buildWayIndex(ways);
      const matches = sampled.map((p) => nearestRoad(p, wayIndex));
      const segs = buildSegments(sampled, matches);
      const ints = buildIntersections(segs);
      setSegments(segs);
      setIntersections(ints);

      // Persist route for re-opening later.
      // fullPoints bevat de volledige road-snapped coördinaten zodat de lijn
      // bij heropenen de straten correct volgt (niet slechts de dunne steekproef).
      const routeRecord = {
        id: `${name}-${Date.now()}`,
        name,
        loadedAt: Date.now(),
        gpxPoints: fullPoints ?? sampled,
        segments: segs,
        intersections: ints,
      };
      saveRoute(routeRecord).catch(() => {}); // fire-and-forget

      setShowConfirm(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus('');
    }
  }, []);

  const handleGpxUpload = useCallback(async (text, filename) => {
    const name = filename.replace('.gpx', '');
    setRouteName(name);
    setError(null);
    let points;
    try {
      points = parseGpx(text);
    } catch {
      setError('Kon het GPX-bestand niet lezen.');
      return;
    }
    if (!points.length) {
      setError('GPX-bestand bevat geen trackpunten.');
      return;
    }

    // Toon de ruwe GPX alvast op de kaart zodat de gebruiker feedback heeft
    setGpxPoints(points);
    setIsAnalyzing(true);

    // Snap de route aan het wegennetwerk (OSRM map matching)
    setAnalysisStatus('Route snappen aan wegen…');
    const matchedPoints = await matchRouteToRoads(points, setAnalysisStatus);

    // Werk de kaartlijn bij met de gesnappte route
    setGpxPoints(matchedPoints);

    const sampled = subsampleRoute(matchedPoints, 100);
    lastSampledRef.current = { sampled, name, fullPoints: matchedPoints };
    await runAnalysis(sampled, name, setAnalysisStatus, matchedPoints);
  }, [runAnalysis]);

  const handleRetry = useCallback(() => {
    if (lastSampledRef.current) {
      const { sampled, name, fullPoints } = lastSampledRef.current;
      runAnalysis(sampled, name, setAnalysisStatus, fullPoints);
    }
  }, [runAnalysis]);

  // Re-open a saved route — skips Overpass, goes straight to confirm.
  // Map-matching wordt opnieuw uitgevoerd zodat de lijn altijd de straten volgt,
  // ook voor oudere opgeslagen routes die alleen de dunne steekproef bevatten.
  const handleLoadRecent = useCallback(async (record) => {
    setRouteName(record.name);
    setGpxPoints(record.gpxPoints); // toon opgeslagen punten direct op de kaart
    setSegments(record.segments);
    setIntersections(record.intersections);
    setStreetViewActive(false);
    setShowConfirm(true);

    // Pas map-matching toe op de opgeslagen punten zodat de lijn
    // de straten correct volgt (lost ook oudere records op).
    const matched = await matchRouteToRoads(record.gpxPoints);
    setGpxPoints(matched);
    lastSampledRef.current = { sampled: record.gpxPoints, name: record.name, fullPoints: matched };
  }, []);

  // Analyseer een eerder enkel-opgeslagen route (zonder Street View-analyse).
  // Het oude niet-geanalyseerde record wordt verwijderd; runAnalysis bewaart
  // een nieuw record mét segmenten/kruispunten.
  const handleAnalyzeRecent = useCallback(async (record) => {
    setRouteName(record.name);
    setGpxPoints(record.gpxPoints);
    setStreetViewActive(false);
    deleteRoute(record.id).catch(() => {});
    const sampled = subsampleRoute(record.gpxPoints, 100);
    lastSampledRef.current = { sampled, name: record.name, fullPoints: record.gpxPoints };
    // runAnalysis is stabiel ([] deps).
    runAnalysis(sampled, record.name, setAnalysisStatus, record.gpxPoints);
  }, [runAnalysis]);

  return (
    <HeadingOffsetProvider>
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <header className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200 shadow-sm z-10 flex-shrink-0">
        <div className="flex items-center gap-2 mr-auto">
          <span className="text-xl">🚴</span>
          <span className="font-bold text-slate-800 text-lg tracking-tight">Route Validator</span>
          {routeName && (
            <span className="text-sm text-slate-400 font-normal hidden sm:inline">· {routeName}</span>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5 text-sm">
            <span>⚠ {error}</span>
            {lastSampledRef.current && (
              <button onClick={handleRetry} className="underline font-medium hover:text-red-800 whitespace-nowrap">
                Opnieuw
              </button>
            )}
          </div>
        )}

        {/* Recente routes */}
        <button
          onClick={() => setShowRecent(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          title="Recente routes"
        >
          <span>📂</span>
          <span className="hidden sm:inline">Recente routes</span>
        </button>

        {/* Teken route */}
        <button
          onClick={handleStartDraw}
          disabled={routeEditMode !== null || isAnalyzing}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
          title="Teken een nieuwe route"
        >
          <span>🗺</span>
          <span className="hidden sm:inline">Teken route</span>
        </button>

        {/* Bewerk route — alleen zichtbaar als er een route geladen is */}
        {gpxPoints.length > 0 && (
          <button
            onClick={handleStartEdit}
            disabled={routeEditMode !== null || isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            title="Bewerk de huidige route"
          >
            <span>✏️</span>
            <span className="hidden sm:inline">Bewerk route</span>
          </button>
        )}

        {/* Exporteer GPX — alleen zichtbaar als er een route geladen is */}
        {gpxPoints.length > 0 && (
          <button
            onClick={handleExportGpx}
            disabled={routeEditMode !== null || isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            title="Exporteer als GPX voor Garmin Connect"
          >
            <span>⬇️</span>
            <span className="hidden sm:inline">Exporteer GPX</span>
          </button>
        )}

        <GpxUploader onUpload={handleGpxUpload} />

        {/* Overlay-import: alleen relevant als er al een route is om mee te vergelijken,
            of wanneer de gebruiker bezig is een nieuwe route te tekenen/bewerken. */}
        {(gpxPoints.length > 0 || routeEditMode) && (
          <GpxOverlayUploader
            overlayName={overlayName}
            onUpload={handleOverlayUpload}
            onClear={handleOverlayClear}
          />
        )}

        {/* Config */}
        <button
          onClick={() => setShowConfigModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          title="Instellingen"
        >
          <span>⚙</span>
          <span className="hidden sm:inline">
            {config.positions.length} foto{config.positions.length !== 1 ? "'s" : ''}
            {!config.showIntersections ? ' · geen kruispunten' : ''}
          </span>
        </button>

        {/* API key */}
        <button
          onClick={() => setShowApiModal(true)}
          title={apiKey ? 'API key geconfigureerd' : 'Geen API key ingesteld'}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
            apiKey
              ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
              : 'border-red-300 bg-red-50 text-red-600 hover:bg-red-100'
          }`}
        >
          <span>{apiKey ? '🔑' : '🔐'}</span>
          <span className="hidden sm:inline">{apiKey ? 'Key set' : 'Set API key'}</span>
        </button>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Kaart: neemt resterende breedte in */}
        <div className="flex-1 relative min-w-0">
          <MapView
            gpxPoints={gpxPoints}
            segments={segments}
            config={config}
            onSelectPoint={(point, id = null) => { setFlyTarget(point); setActiveId(id); setActiveTab('route'); }}
            flyTarget={flyTarget}
            onMapClick={handleMapClick}
            explorePoint={explorePoint}
            badStreets={badStreets}
            onToggleBadStreet={toggleBadStreet}
            amenities={activeTab === 'amenities' ? visibleAmenities : []}
            selectedAmenity={selectedAmenity}
            onAmenityClick={handleAmenitySelect}
            routeEditMode={routeEditMode}
            editWaypoints={editWaypoints}
            editSegments={editSegments}
            onInsertWaypoint={handleInsertWaypoint}
            onMoveWaypoint={handleMoveWaypoint}
            onRemoveWaypoint={handleRemoveWaypoint}
            overlayPoints={overlayPoints}
            loopStart={loopStart}
            pickingLoopStart={pickingLoopStart}
          />
          {routeEditMode && (
            <RouteEditorToolbar
              mode={routeEditMode}
              routingMode={routingMode}
              onChangeRoutingMode={setRoutingMode}
              cycleInfraTypes={CYCLE_INFRA_TYPES}
              cycleAvoid={cycleAvoid}
              onToggleCycleAvoid={toggleCycleAvoid}
              waypointCount={editWaypoints.length}
              isLoading={editSegments.some((s) => s === null)}
              canComplete={editWaypoints.length >= 2 && editSegments.every((s) => s !== null)}
              onUndo={handleUndoWaypoint}
              onReset={handleResetEdit}
              onComplete={handleCompleteEdit}
              onCancel={handleCancelEdit}
            />
          )}
        </div>

        {/* Rechts: panel-inhoud + tab-strip */}
        <div className="flex flex-shrink-0">
          {activeTab && (
            <div className="w-[420px] border-l border-slate-200 overflow-hidden bg-slate-50 flex flex-col">
              {activeTab === 'route' && (
                <StreetPanel
                  segments={segments}
                  intersections={intersections}
                  apiKey={streetViewActive ? apiKey : ''}
                  config={config}
                  isAnalyzing={isAnalyzing}
                  analysisStatus={analysisStatus}
                  activeId={activeId}
                  onSelect={(point, id = null) => { setFlyTarget(point); setActiveId(id); setActiveTab('route'); }}
                  badStreets={badStreets}
                  onToggleBadStreet={toggleBadStreet}
                />
              )}
              {activeTab === 'explore' && (
                <ExplorePanel
                  point={explorePoint}
                  apiKey={apiKey}
                  badStreets={badStreets}
                  onToggleBadStreet={toggleBadStreet}
                />
              )}
              {activeTab === 'amenities' && (
                <AmenitiesPanel
                  gpxPoints={gpxPoints}
                  selectedAmenity={selectedAmenity}
                  onSelectAmenity={handleAmenitySelect}
                  onVisibleChange={setVisibleAmenities}
                />
              )}
              {activeTab === 'loop' && (
                <LoopGeneratorPanel
                  routingMode={routingMode}
                  onChangeRoutingMode={setRoutingMode}
                  cycleInfraTypes={CYCLE_INFRA_TYPES}
                  cycleAvoid={cycleAvoid}
                  onToggleCycleAvoid={toggleCycleAvoid}
                  loopStart={loopStart}
                  pickingStart={pickingLoopStart}
                  onTogglePickStart={handleTogglePickLoopStart}
                  onGenerate={handleGenerateLoop}
                  isGenerating={isGeneratingLoop}
                  status={loopStatus}
                  error={loopError}
                />
              )}
            </div>
          )}

          {/* Verticale tab-strip */}
          <div className="flex flex-col border-l border-slate-200 bg-white w-10">
            <TabButton id="route" icon="🗺" label="Route" active={activeTab === 'route'} onClick={handleTabClick} />
            <TabButton id="explore" icon="🔍" label="Verkennen" active={activeTab === 'explore'} onClick={handleTabClick} />
            <TabButton id="loop" icon="🔄" label="Genereer lus" active={activeTab === 'loop'} onClick={handleTabClick} />
            {gpxPoints.length > 0 && (
              <TabButton id="amenities" icon="🍽️" label="Eetgelegenheden" active={activeTab === 'amenities'} onClick={handleTabClick} />
            )}
          </div>
        </div>
      </div>

      {/* Modals (all via createPortal, above Leaflet stacking context) */}
      {showApiModal && (
        <ApiKeyModal apiKey={apiKey} onSave={handleApiKeySave} onClose={() => setShowApiModal(false)} />
      )}

      {showConfigModal && (
        <ConfigModal config={config} onSave={handleConfigSave} onClose={() => setShowConfigModal(false)} />
      )}

      {showRecent && (
        <RecentRoutesPanel onLoad={handleLoadRecent} onAnalyze={handleAnalyzeRecent} onClose={() => setShowRecent(false)} />
      )}

      {/* Bevestiging: nieuwe route tekenen terwijl er al een route geladen is */}
      {showNewRouteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4">
            <h2 className="text-lg font-bold text-slate-800 mb-2">Nieuwe route tekenen</h2>
            <p className="text-slate-600 mb-5">
              Er is al een route geladen
              {routeName ? ` (${routeName})` : ''}. Wil je deze sluiten en een nieuwe route beginnen tekenen?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewRouteConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Annuleren
              </button>
              <button
                onClick={handleConfirmNewRoute}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                Ja, nieuwe route tekenen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalisatie: naam geven + kiezen tussen analyseren of enkel opslaan */}
      {finalizePrompt && (
        <FinalizeRouteModal
          defaultName={finalizePrompt.defaultName}
          isEdit={finalizePrompt.isEdit}
          onAnalyze={handleFinalizeAnalyze}
          onSaveOnly={handleFinalizeSaveOnly}
          onCancel={() => setFinalizePrompt(null)}
        />
      )}

      {showConfirm && segments.length > 0 && (
        <ConfirmLoadModal
          segments={segments}
          intersections={intersections}
          config={config}
          onConfirm={() => {
            setShowConfirm(false);
            setStreetViewActive(true);
            prefetchImages(segments, intersections, config, apiKey).catch(() => {});
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
    </HeadingOffsetProvider>
  );
}
