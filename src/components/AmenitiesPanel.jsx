import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAmenities, AMENITY_TYPES, FILTER_GROUPS } from '../utils/overpassAmenities.js';
import AmenityCard from './AmenityCard.jsx';

const DISTANCE_OPTIONS = [
  { value: 250,  label: '250m' },
  { value: 500,  label: '500m' },
  { value: 1000, label: '1km' },
  { value: 2000, label: '2km' },
  { value: 5000, label: '5km' },
];

// All unique type keys that belong to each filter group label
const GROUP_KEYS = Object.fromEntries(
  FILTER_GROUPS.map((g) => [
    g.label,
    AMENITY_TYPES.filter((t) => t.label === g.label).map((t) => t.key),
  ])
);

// Module-level cache: overleeft het unmounten van de panel bij tab-wissels.
// Gekoppeld aan een route-signatuur + afstand, zodat de query enkel opnieuw
// draait als de route wijzigt (of een andere afstand wordt gekozen).
const amenitiesCache = new Map();

function routeSignature(pts) {
  if (!pts || !pts.length) return 'empty';
  const first = pts[0];
  const last = pts[pts.length - 1];
  return `${pts.length}:${first.lat.toFixed(5)},${first.lng.toFixed(5)}:${last.lat.toFixed(5)},${last.lng.toFixed(5)}`;
}

function cacheKey(pts, dist) {
  return `${dist}|${routeSignature(pts)}`;
}

export default function AmenitiesPanel({ gpxPoints, selectedAmenity, onSelectAmenity, onVisibleChange }) {
  // Initialiseer direct uit de cache (huidige afstand) zodat een tab-wissel
  // geen lege flits/loading toont als de resultaten er al zijn.
  const [amenities, setAmenities] = useState(() => amenitiesCache.get(cacheKey(gpxPoints, 500)) ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [distance, setDistance] = useState(500);
  const [activeFilters, setActiveFilters] = useState(
    () => new Set(['cafe'])
  );

  const debounceRef = useRef(null);
  const abortRef = useRef(false);

  const load = useCallback(async (pts, dist, { force = false } = {}) => {
    if (!pts.length) return;
    const key = cacheKey(pts, dist);

    // Gebruik cache indien beschikbaar — geen netwerkaanroep, geen loading-state
    if (!force && amenitiesCache.has(key)) {
      abortRef.current = true; // annuleer eventuele lopende fetch
      setAmenities(amenitiesCache.get(key));
      setLoading(false);
      setError(null);
      return;
    }

    abortRef.current = false;
    setLoading(true);
    setError(null);
    try {
      const results = await fetchAmenities(pts, dist);
      if (!abortRef.current) {
        amenitiesCache.set(key, results);
        setAmenities(results);
      }
    } catch (err) {
      if (!abortRef.current) setError(err.message);
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  }, []);

  // Load wanneer panel mount of gpxPoints wijzigen.
  // Bij een tab-wissel (zelfde route) komt het resultaat uit de cache → geen herlaad.
  // Bij een routewijziging is de cache-key anders → wel een verse query.
  useEffect(() => {
    load(gpxPoints, distance);
    return () => { abortRef.current = true; };
  }, [gpxPoints]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced re-query on distance change
  const handleDistanceChange = (val) => {
    setDistance(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(gpxPoints, val), 400);
  };

  const toggleFilter = (label) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      const keys = GROUP_KEYS[label];
      const allActive = keys.every((k) => next.has(k));
      if (allActive) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  const visible = amenities.filter((a) => activeFilters.has(a.typeKey));

  useEffect(() => {
    onVisibleChange?.(amenities.filter((a) => activeFilters.has(a.typeKey)));
  }, [amenities, activeFilters, onVisibleChange]);

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-slate-200 space-y-2">
        {/* Distance selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600 flex-shrink-0">Afstand:</span>
          <div className="flex gap-1 flex-wrap">
            {DISTANCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleDistanceChange(opt.value)}
                className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                  distance === opt.value
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-1">
          {FILTER_GROUPS.map((group) => {
            const keys = GROUP_KEYS[group.label];
            const active = keys.every((k) => activeFilters.has(k));
            return (
              <button
                key={group.label}
                onClick={() => toggleFilter(group.label)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full border transition-colors ${
                  active
                    ? 'text-white border-transparent'
                    : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                }`}
                style={active ? { backgroundColor: group.color, borderColor: group.color } : {}}
              >
                <span>{group.emoji}</span>
                <span>{group.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            <span className="text-sm">Laden…</span>
          </div>
        )}

        {!loading && error && (
          <div className="m-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <p className="font-medium">Kon gegevens niet laden</p>
            <p className="text-xs mt-1 text-red-500">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {visible.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm gap-1">
                <span className="text-2xl">🔍</span>
                <span>Geen locaties gevonden</span>
                <span className="text-xs text-slate-300">Probeer een grotere afstand</span>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                <p className="text-xs text-slate-400 mb-1">
                  {visible.length} locatie{visible.length !== 1 ? 's' : ''} gevonden
                </p>
                {visible.map((a) => (
                  <AmenityCard
                    key={a.id}
                    amenity={a}
                    selected={selectedAmenity?.id === a.id}
                    onSelect={onSelectAmenity}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
