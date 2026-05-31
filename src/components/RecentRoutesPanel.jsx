import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { listRoutes, deleteRoute } from '../utils/routeCache.js';
import { deleteImages } from '../utils/imageCache.js';
import { buildCacheKey } from '../utils/streetViewUrl.js';

function routeImageKeys(record) {
  const keys = [];
  for (const seg of record.segments ?? []) {
    for (const vp of Object.values(seg.viewpoints ?? {})) {
      if (vp?.point) keys.push(buildCacheKey(vp.point, vp.heading));
    }
  }
  for (const int of record.intersections ?? []) {
    if (int?.point) keys.push(buildCacheKey(int.point, int.heading));
  }
  return keys;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString('nl-BE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function RecentRoutesPanel({ onLoad, onAnalyze, onClose }) {
  const [routes, setRoutes] = useState(null);

  useEffect(() => {
    listRoutes().then(setRoutes).catch(() => setRoutes([]));
  }, []);

  const handleDelete = async (e, route) => {
    e.stopPropagation();
    const keys = routeImageKeys(route);
    await Promise.all([deleteRoute(route.id), deleteImages(keys)]);
    setRoutes((prev) => prev.filter((r) => r.id !== route.id));
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Drawer */}
      <div
        className="relative z-10 bg-white w-full max-w-sm h-full shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">📂 Recente routes</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
          >
            ×
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {routes === null && (
            <div className="flex items-center justify-center gap-2 text-slate-400 py-12 text-sm">
              <span className="animate-spin">⏳</span>
              <span>Laden…</span>
            </div>
          )}

          {routes?.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 text-slate-400 py-16">
              <span className="text-4xl">🗺</span>
              <p className="text-sm text-center">
                Nog geen routes opgeslagen.<br />
                Upload een GPX-bestand om te starten.
              </p>
            </div>
          )}

          {routes?.length > 0 && (
            <div className="flex flex-col gap-2">
              {routes.map((route) => {
                const analyzed = (route.segments?.length ?? 0) > 0;
                return (
                <div
                  key={route.id}
                  className="group flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50 transition-all cursor-pointer"
                  onClick={() => { onLoad(route); onClose(); }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{route.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(route.loadedAt)}</p>
                    {analyzed ? (
                      <p className="text-xs text-slate-400">
                        {route.segments.length} straten · {route.intersections?.length ?? 0} kruispunten
                      </p>
                    ) : (
                      <p className="text-xs text-amber-500">Nog niet geanalyseerd</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!analyzed && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAnalyze?.(route); onClose(); }}
                        title="Analyseer deze route (Street View)"
                        className="px-2 py-1 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        🔍 Analyseren
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, route)}
                      title="Verwijder route"
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all text-sm"
                    >
                      🗑
                    </button>
                    <span className="text-blue-400 text-sm">→</span>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
