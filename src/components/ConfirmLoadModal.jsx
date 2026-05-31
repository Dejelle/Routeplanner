import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildCacheKey } from '../utils/streetViewUrl.js';
import { countUncached } from '../utils/imageCache.js';

function collectCacheKeys(segments, intersections, config) {
  const keys = [];
  for (const seg of segments) {
    for (const pos of config.positions) {
      const vp = seg.viewpoints[pos];
      if (vp) keys.push(buildCacheKey(vp.point, vp.heading));
    }
  }
  if (config.showIntersections) {
    for (const int of intersections) {
      keys.push(buildCacheKey(int.point, int.heading));
      keys.push(buildCacheKey(int.point, (int.heading + 90) % 360));
    }
  }
  return keys;
}

export default function ConfirmLoadModal({ segments, intersections, config, onConfirm, onCancel }) {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    const keys = collectCacheKeys(segments, intersections, config);
    countUncached(keys).then(setCounts);
  }, [segments, intersections, config]);

  const costCents = counts
    ? ((counts.uncached / 1000) * 7).toFixed(3)
    : '…';

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <div className="text-center mb-5">
          <div className="text-4xl mb-3">📸</div>
          <h2 className="text-lg font-semibold text-slate-800">Street View laden</h2>
          <p className="text-sm text-slate-500 mt-1">Overzicht van te versturen API calls</p>
        </div>

        {!counts ? (
          <div className="bg-slate-50 rounded-xl p-4 mb-4 flex items-center justify-center gap-2 text-sm text-slate-400">
            <span className="animate-spin">⏳</span>
            <span>Cache controleren…</span>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">
                🛣 {segments.length} straten × {config.positions.length} foto's
              </span>
              <span className="font-medium text-slate-800">
                {segments.length * config.positions.length} calls
              </span>
            </div>
            {config.showIntersections && (
              <div className="flex justify-between">
                <span className="text-slate-600">
                  ⚠ {intersections.length} kruispunten × 2 foto's
                </span>
                <span className="font-medium text-slate-800">{intersections.length * 2} calls</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2 space-y-1">
              {counts.cached > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>✅ Al gecached</span>
                  <span className="font-medium">{counts.cached} calls</span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span className="text-slate-700">🆕 Nieuwe calls</span>
                <span className="text-slate-900">{counts.uncached}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 rounded-lg px-3 py-2 mb-5">
          <span>💰</span>
          <span>
            Geschatte kost:{' '}
            <strong className="text-slate-600">${costCents}</strong>
            {' '}($7 per 1.000 calls · $200 gratis/maand)
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Annuleren
          </button>
          <button
            onClick={onConfirm}
            disabled={!counts}
            className="flex-1 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {counts?.uncached === 0 ? 'Laden uit cache ✓' : 'Laden ✓'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
