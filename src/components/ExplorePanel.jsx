import { useState, useEffect } from 'react';
import StreetViewImage from './StreetViewImage.jsx';
import { fetchWayAtPoint } from '../utils/overpass.js';

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'Accept-Language': 'nl' } }
    );
    const data = await res.json();
    return data.address?.road ?? null;
  } catch {
    return null;
  }
}

export default function ExplorePanel({ point, apiKey, badStreets, onToggleBadStreet }) {
  const [streetName, setStreetName] = useState(null);
  const [wayInfo, setWayInfo] = useState(null);
  const [wayLoading, setWayLoading] = useState(false);

  useEffect(() => {
    if (!point) return;
    setStreetName(null);
    setWayInfo(null);
    setWayLoading(true);
    reverseGeocode(point.lat, point.lng).then(setStreetName);
    fetchWayAtPoint(point.lat, point.lng)
      .then(setWayInfo)
      .catch(() => setWayInfo(null))
      .finally(() => setWayLoading(false));
  }, [point]);

  if (!point) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 px-6 text-center">
        <span className="text-4xl">🗺</span>
        <p className="text-sm font-medium text-slate-500">Klik op de kaart om een punt te verkennen</p>
        <p className="text-xs text-slate-400">Street View wordt geladen voor de locatie die je aanklikt</p>
      </div>
    );
  }

  const displayName = streetName ?? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  const coords = `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  const isBad = wayInfo != null && badStreets?.has(wayInfo.id);
  const canMark = wayInfo != null;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-orange-500">📍</span>
          <div className="min-w-0 flex-1">
            {streetName ? (
              <>
                <p className="font-semibold text-slate-800 text-sm truncate">{streetName}</p>
                <p className="text-xs text-slate-400">{coords}</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-800 text-sm">{coords}</p>
                <p className="text-xs text-slate-400 animate-pulse">Straatnaam laden…</p>
              </>
            )}
          </div>
          <button
            title={
              wayLoading
                ? 'Straat ophalen…'
                : isBad
                ? 'Markering verwijderen'
                : canMark
                ? 'Markeer als slechte straat'
                : 'Geen straat gevonden'
            }
            onClick={() => canMark && onToggleBadStreet?.(wayInfo.id, wayInfo.name ?? streetName, wayInfo.geometry)}
            disabled={!canMark || wayLoading}
            className={`flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md border text-sm transition-colors ${
              isBad
                ? 'border-red-300 bg-red-100 text-red-600 hover:bg-red-200'
                : 'border-slate-200 bg-white text-slate-400 hover:border-red-300 hover:bg-red-50 hover:text-red-500'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          >
            ⚠
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <StreetViewImage
          point={point}
          heading={0}
          apiKey={apiKey}
          label={displayName}
        />
      </div>
    </div>
  );
}
