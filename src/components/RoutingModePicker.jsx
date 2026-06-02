import { useState } from 'react';

export const ROUTING_OPTIONS = [
  { value: 'custom', icon: '📏', label: 'Eigen lijn', title: 'Rechte lijn tussen waypoints (geldt vanaf nu; bestaande stukken blijven behouden)' },
  { value: 'roads', icon: '🛣️', label: 'Volg wegen', title: 'Volgt wegen en fietsinfrastructuur' },
  { value: 'popular', icon: '🚴', label: 'Fietsnetwerk', title: 'Bevoordeelt bewegwijzerde fietsnetwerken (knooppunten, lcn/rcn/ncn)' },
];

/**
 * Gedeelde keuze van routing-modus + (voor de fietsnetwerk-modus) welke
 * fietsinfrastructuur gevolgd/vermeden wordt. Gebruikt door zowel de route-editor
 * als de lus-generator.
 */
export default function RoutingModePicker({
  routingMode = 'roads',
  onChangeRoutingMode,
  cycleInfraTypes = [],
  cycleAvoid = [],
  onToggleCycleAvoid,
  avoidHint = 'Vermeden types worden zoveel mogelijk omzeild.',
}) {
  const [infraOpen, setInfraOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
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

      {/* Verfijn-paneel: alleen bij Fietsnetwerk */}
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
              <p className="text-[10px] text-slate-400 leading-tight px-1 pt-1">{avoidHint}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
