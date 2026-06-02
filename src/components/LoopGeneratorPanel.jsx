import { useState } from 'react';
import RoutingModePicker from './RoutingModePicker.jsx';
import { FILTER_GROUPS } from '../utils/overpassAmenities.js';

// 8-weg kompas: bearing in graden (0 = noord, met de klok mee).
const DIRECTIONS = [
  { key: 'N',  label: 'N',  bearing: 0,   row: 0, col: 1 },
  { key: 'NO', label: 'NO', bearing: 45,  row: 0, col: 2 },
  { key: 'O',  label: 'O',  bearing: 90,  row: 1, col: 2 },
  { key: 'ZO', label: 'ZO', bearing: 135, row: 2, col: 2 },
  { key: 'Z',  label: 'Z',  bearing: 180, row: 2, col: 1 },
  { key: 'ZW', label: 'ZW', bearing: 225, row: 2, col: 0 },
  { key: 'W',  label: 'W',  bearing: 270, row: 1, col: 0 },
  { key: 'NW', label: 'NW', bearing: 315, row: 0, col: 0 },
];

export default function LoopGeneratorPanel({
  routingMode,
  onChangeRoutingMode,
  cycleInfraTypes,
  cycleAvoid,
  onToggleCycleAvoid,
  loopStart,
  pickingStart,
  onTogglePickStart,
  onGenerate,
  isGenerating,
  status,
  error,
}) {
  const [distanceKm, setDistanceKm] = useState(30);
  const [direction, setDirection] = useState('N');
  const [venueEnabled, setVenueEnabled] = useState(false);
  const [stops, setStops] = useState([
    { id: crypto.randomUUID(), rangeMin: 45, rangeMax: 65, typeKeys: ['cafe', 'bakery'] },
  ]);

  const addStop = () =>
    setStops((prev) => [
      ...prev,
      { id: crypto.randomUUID(), rangeMin: 40, rangeMax: 60, typeKeys: ['cafe'] },
    ]);
  const removeStop = (id) => setStops((prev) => prev.filter((s) => s.id !== id));
  const updateStop = (id, patch) =>
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const toggleStopType = (id, key) =>
    setStops((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, typeKeys: s.typeKeys.includes(key) ? s.typeKeys.filter((k) => k !== key) : [...s.typeKeys, key] }
          : s,
      ),
    );

  const canGenerate = loopStart && distanceKm >= 2 && !isGenerating;

  const handleGenerate = () => {
    const dir = DIRECTIONS.find((d) => d.key === direction);
    const validStops = stops.filter((s) => s.typeKeys.length > 0);
    onGenerate({
      targetDistanceM: distanceKm * 1000,
      bearingDeg: dir.bearing,
      venue: venueEnabled && validStops.length ? { enabled: true, stops: validStops } : null,
    });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-4 text-sm">
      <div>
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          <span>🔄</span> Genereer lus
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Automatisch een rondrit berekenen op basis van afstand, richting en wegtype.
        </p>
      </div>

      {/* Startpunt */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Startpunt</label>
        <button
          onClick={onTogglePickStart}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
            pickingStart
              ? 'border-blue-400 bg-blue-50 text-blue-700'
              : loopStart
              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
              : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span>📍</span>
          <span className="flex-1">
            {pickingStart
              ? 'Klik op de kaart om de start te plaatsen…'
              : loopStart
              ? `Start: ${loopStart.lat.toFixed(4)}, ${loopStart.lng.toFixed(4)}`
              : 'Kies startpunt op de kaart'}
          </span>
        </button>
      </div>

      {/* Afstand */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Afstand: <span className="text-slate-900">{distanceKm} km</span>
        </label>
        <input
          type="range"
          min={5}
          max={150}
          step={5}
          value={distanceKm}
          onChange={(e) => setDistanceKm(Number(e.target.value))}
          className="w-full accent-blue-600"
        />
      </div>

      {/* Richting */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Richting</label>
        <div className="grid grid-cols-3 grid-rows-3 gap-1 w-36 mx-auto">
          {[0, 1, 2].map((row) =>
            [0, 1, 2].map((col) => {
              if (row === 1 && col === 1) {
                return (
                  <div key="center" className="flex items-center justify-center text-slate-300 text-lg">
                    🧭
                  </div>
                );
              }
              const dir = DIRECTIONS.find((d) => d.row === row && d.col === col);
              if (!dir) return <div key={`${row}-${col}`} />;
              const active = direction === dir.key;
              return (
                <button
                  key={dir.key}
                  onClick={() => setDirection(dir.key)}
                  className={`h-11 rounded-lg border text-xs font-semibold transition-colors ${
                    active
                      ? 'border-blue-500 bg-blue-600 text-white'
                      : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {dir.label}
                </button>
              );
            })
          )}
        </div>
        <p className="text-[11px] text-slate-400 text-center">
          De lus ligt grotendeels in de gekozen richting van de start.
        </p>
      </div>

      {/* Wegtype / infrastructuur */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Wegtype</label>
        <RoutingModePicker
          routingMode={routingMode}
          onChangeRoutingMode={onChangeRoutingMode}
          cycleInfraTypes={cycleInfraTypes}
          cycleAvoid={cycleAvoid}
          onToggleCycleAvoid={onToggleCycleAvoid}
          avoidHint="Vermeden types worden zoveel mogelijk omzeild bij het berekenen van de lus."
        />
      </div>

      {/* Eetstops */}
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 bg-slate-50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={venueEnabled}
            onChange={(e) => setVenueEnabled(e.target.checked)}
            className="accent-blue-600"
          />
          <span className="text-sm font-semibold text-slate-700">🍽️ Eetstops onderweg</span>
        </label>

        {venueEnabled && (
          <div className="flex flex-col gap-3 pt-1">
            {stops.map((stop, idx) => (
              <div key={stop.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Stop {idx + 1}</span>
                  {stops.length > 1 && (
                    <button
                      onClick={() => removeStop(stop.id)}
                      className="text-slate-400 hover:text-red-500 text-sm leading-none"
                      title="Stop verwijderen"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span>Tussen</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={stop.rangeMin}
                    onChange={(e) =>
                      updateStop(stop.id, { rangeMin: Math.max(0, Math.min(100, Number(e.target.value))) })
                    }
                    className="w-14 px-1.5 py-1 rounded border border-slate-300 text-center"
                  />
                  <span>% en</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={stop.rangeMax}
                    onChange={(e) =>
                      updateStop(stop.id, { rangeMax: Math.max(0, Math.min(100, Number(e.target.value))) })
                    }
                    className="w-14 px-1.5 py-1 rounded border border-slate-300 text-center"
                  />
                  <span>% van de rit</span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {FILTER_GROUPS.map((t) => {
                    const on = stop.typeKeys.includes(t.key);
                    return (
                      <button
                        key={t.key}
                        onClick={() => toggleStopType(stop.id, t.key)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs transition-colors ${
                          on
                            ? 'border-blue-400 bg-blue-100 text-blue-700'
                            : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        <span>{t.emoji}</span>
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <button
              onClick={addStop}
              className="self-start px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
            >
              + Stop toevoegen
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        title={!loopStart ? 'Kies eerst een startpunt op de kaart' : undefined}
      >
        {isGenerating ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>{status || 'Bezig…'}</span>
          </>
        ) : (
          <span>✨ Genereer lus</span>
        )}
      </button>
    </div>
  );
}
