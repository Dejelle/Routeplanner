import { useState } from 'react';

const ROUTING_OPTIONS = [
  { value: 'custom', icon: '📏', label: 'Eigen lijn', title: 'Rechte lijn tussen waypoints (geldt vanaf nu; bestaande stukken blijven behouden)' },
  { value: 'roads', icon: '🛣️', label: 'Volg wegen', title: 'Volgt wegen en fietsinfrastructuur' },
  { value: 'popular', icon: '🚴', label: 'Fietsnetwerk', title: 'Bevoordeelt bewegwijzerde fietsnetwerken (knooppunten, lcn/rcn/ncn)' },
];

export default function RouteEditorToolbar({
  mode,
  routingMode = 'roads',
  onChangeRoutingMode,
  cycleInfraTypes = [],
  cycleAvoid = [],
  onToggleCycleAvoid,
  waypointCount,
  isLoading,
  canComplete,
  onUndo,
  onReset,
  onComplete,
  onCancel,
}) {
  const [infraOpen, setInfraOpen] = useState(false);
  const isDrawMode = mode === 'draw';
  const modeLabel = isDrawMode ? 'Route tekenen' : 'Route bewerken';
  const modeIcon = isDrawMode ? '🗺' : '✏️';
  const modeColor = isDrawMode ? 'text-emerald-700' : 'text-amber-700';

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
      <div className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-slate-200 px-4 py-3 flex flex-col gap-2 min-w-[340px]">
        {/* Status-rij */}
        <div className="flex items-center gap-2 text-sm">
          <span className={`font-semibold ${modeColor} flex items-center gap-1`}>
            <span>{modeIcon}</span>
            <span>{modeLabel}</span>
          </span>
          <span className="text-slate-400 ml-auto flex items-center gap-1.5">
            {isLoading && (
              <svg
                className="animate-spin h-3.5 w-3.5 text-slate-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            <span>
              {waypointCount === 0
                ? 'Klik op de kaart om te beginnen'
                : `${waypointCount} waypoint${waypointCount !== 1 ? 's' : ''}`}
            </span>
          </span>
        </div>

        {/* Routing-modus kiezer */}
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 gap-0.5">
          {ROUTING_OPTIONS.map((opt) => {
            const active = routingMode === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onChangeRoutingMode?.(opt.value)}
                title={opt.title}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded-md transition-colors ${
                  active
                    ? 'bg-white text-slate-800 font-semibold shadow-sm border border-slate-200'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Verfijn-paneel: alleen bij Fietsnetwerk — kies welke infrastructuur te volgen/vermijden */}
        {routingMode === 'popular' && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 overflow-hidden">
            <button
              onClick={() => setInfraOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <span className={`transition-transform ${infraOpen ? 'rotate-90' : ''}`}>▸</span>
              <span className="font-medium">Welke infrastructuur volgen?</span>
              {cycleAvoid.length > 0 && (
                <span className="ml-auto rounded-full bg-red-100 text-red-600 px-1.5 py-0.5 text-[10px] font-semibold">
                  {cycleAvoid.length} vermeden
                </span>
              )}
            </button>
            {infraOpen && (
              <div className="px-1.5 pb-1.5 flex flex-col gap-0.5 max-h-56 overflow-y-auto">
                {cycleInfraTypes.map((t) => {
                  const avoided = cycleAvoid.includes(t.key);
                  return (
                    <button
                      key={t.key}
                      onClick={() => onToggleCycleAvoid?.(t.key)}
                      title={t.desc}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                        avoided ? 'bg-red-50 hover:bg-red-100' : 'bg-white hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-sm">{t.icon}</span>
                      <span className={`text-xs flex-1 ${avoided ? 'text-red-400 line-through' : 'text-slate-700'}`}>
                        {t.label}
                      </span>
                      <span
                        className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                          avoided ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {avoided ? '✕ Vermijden' : '✓ Volgen'}
                      </span>
                    </button>
                  );
                })}
                <p className="text-[10px] text-slate-400 leading-tight px-1 pt-1">
                  Vermeden types worden zoveel mogelijk omzeild. Geldt voor nieuw getekende of versleepte stukken.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Knoppen-rij */}
        <div className="flex items-center gap-2">
          {/* Links: undo + reset */}
          <div className="flex items-center gap-1.5">
            {isDrawMode && (
              <button
                onClick={onUndo}
                disabled={waypointCount === 0}
                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Verwijder laatste waypoint"
              >
                ↩ Ongedaan
              </button>
            )}
            <button
              onClick={onReset}
              disabled={waypointCount === 0}
              className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Verwijder alle waypoints"
            >
              🗑 Reset
            </button>
          </div>

          <div className="flex-1" />

          {/* Rechts: annuleren + voltooien */}
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={onComplete}
            disabled={!canComplete}
            className="px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors
              bg-blue-600 border-blue-600 text-white hover:bg-blue-700
              disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              waypointCount < 2
                ? 'Voeg minimaal 2 waypoints toe'
                : isLoading
                ? 'Wacht tot alle segmenten berekend zijn'
                : 'Route een naam geven en opslaan of analyseren'
            }
          >
            {isLoading ? '⏳ Laden…' : '✓ Voltooien'}
          </button>
        </div>

        {/* Hint */}
        <p className="text-xs text-slate-400 leading-tight">
          {isDrawMode
            ? 'Klik op de kaart om waypoints te plaatsen. Klik op een segment om een tussenpunt in te voegen.'
            : 'Sleep een waypoint om de route aan te passen. Klik op een segment om een tussenpunt in te voegen.'}
        </p>
      </div>
    </div>
  );
}
