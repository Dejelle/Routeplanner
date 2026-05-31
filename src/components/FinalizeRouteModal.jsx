import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal die verschijnt bij het voltooien van een getekende/bewerkte route.
 * Vraagt een naam en biedt twee acties:
 *  - Opslaan & analyseren: bewaart en start de Street View-analyse
 *  - Enkel opslaan: bewaart de route zonder analyse (snel, geen API-calls)
 */
export default function FinalizeRouteModal({ defaultName, isEdit, onAnalyze, onSaveOnly, onCancel }) {
  const [name, setName] = useState(defaultName || '');
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus + selecteer de naam zodat de gebruiker meteen kan typen
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const trimmed = name.trim();
  const valid = trimmed.length > 0;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && valid) {
      e.preventDefault();
      onAnalyze(trimmed);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">🏁</div>
          <h2 className="text-lg font-semibold text-slate-800">Route voltooien</h2>
          <p className="text-sm text-slate-500 mt-1">
            Geef je {isEdit ? 'bewerkte ' : ''}route een naam
          </p>
        </div>

        <label className="block mb-5">
          <span className="text-xs font-medium text-slate-600">Routenaam</span>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="bijv. Vlaamse Ardennen rondje"
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
          />
        </label>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onAnalyze(trimmed)}
            disabled={!valid}
            className="w-full px-4 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ✓ Opslaan & analyseren
          </button>
          <button
            onClick={() => onSaveOnly(trimmed)}
            disabled={!valid}
            className="w-full px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            💾 Enkel opslaan (zonder analyse)
          </button>
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Annuleren
          </button>
        </div>

        <p className="text-xs text-slate-400 leading-tight mt-4 text-center">
          Bij analyse worden Street View-foto's voorbereid. Enkel opslaan bewaart de
          route in "Recente routes" zodat je ze later kunt openen of exporteren.
        </p>
      </div>
    </div>,
    document.body
  );
}
