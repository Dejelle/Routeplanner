import { useState } from 'react';
import { createPortal } from 'react-dom';
import { POSITION_OPTIONS, saveConfig } from '../utils/config.js';
import { clearAllImages } from '../utils/imageCache.js';

export default function ConfigModal({ config, onSave, onClose }) {
  const [positions, setPositions] = useState([...config.positions]);
  const [showIntersections, setShowIntersections] = useState(config.showIntersections);
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);

  const handleClearCache = async () => {
    setClearing(true);
    await clearAllImages();
    setClearing(false);
    setCleared(true);
  };

  const togglePosition = (id) => {
    setPositions((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // always keep at least one
        return prev.filter((p) => p !== id);
      }
      // Keep order consistent with POSITION_OPTIONS
      const order = POSITION_OPTIONS.map((o) => o.id);
      return [...prev, id].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    });
  };

  const handleSave = () => {
    const cfg = { positions, showIntersections };
    saveConfig(cfg);
    onSave(cfg);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-800">⚙ Instellingen</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Photo positions */}
        <div className="mb-5">
          <p className="text-sm font-medium text-slate-700 mb-3">
            Foto-posities per straat
          </p>
          <div className="space-y-2">
            {POSITION_OPTIONS.map(({ id, label }) => {
              const active = positions.includes(id);
              const isLast = active && positions.length === 1;
              return (
                <label
                  key={id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    active
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  } ${isLast ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => !isLast && togglePosition(id)}
                    className="accent-blue-600 w-4 h-4"
                  />
                  <span className={`text-sm ${active ? 'text-blue-700 font-medium' : 'text-slate-600'}`}>
                    {label}
                  </span>
                  {active && (
                    <span className="ml-auto text-xs text-blue-400">✓</span>
                  )}
                </label>
              );
            })}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            {positions.length} positie{positions.length !== 1 ? 's' : ''} geselecteerd · {positions.length} foto's per straat
          </p>
        </div>

        {/* Intersections toggle */}
        <div className="mb-6">
          <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
            <div>
              <p className="text-sm font-medium text-slate-700">Kruispunten tonen</p>
              <p className="text-xs text-slate-400 mt-0.5">2 Street View foto's per kruispunt</p>
            </div>
            <div
              onClick={() => setShowIntersections((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                showIntersections ? 'bg-blue-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  showIntersections ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </label>
        </div>

        {/* Cache */}
        <div className="mb-5">
          <p className="text-sm font-medium text-slate-700 mb-2">Foto-cache</p>
          <button
            onClick={handleClearCache}
            disabled={clearing || cleared}
            className={`w-full px-4 py-2 text-sm rounded-lg border transition-colors ${
              cleared
                ? 'border-green-300 bg-green-50 text-green-700 cursor-default'
                : 'border-slate-300 text-slate-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600'
            }`}
          >
            {cleared ? '✓ Cache gewist' : clearing ? 'Wissen…' : 'Wis alle gecachte foto\'s'}
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Opslaan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
