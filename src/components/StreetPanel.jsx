import { useRef, useEffect } from 'react';
import StreetCard from './StreetCard.jsx';
import IntersectionCard from './IntersectionCard.jsx';

function LoadingState({ status }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {status && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-sm">
          <svg className="animate-spin h-4 w-4 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <span>{status}</span>
        </div>
      )}
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" />
          <div className="flex gap-2">
            {[1, 2, 3].map((j) => (
              <div key={j} className="flex-1 aspect-[4/2.6] bg-slate-200 rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 p-8">
      <div className="text-5xl">🚴</div>
      <div className="text-center">
        <p className="font-medium text-slate-600">Geen route geladen</p>
        <p className="text-sm mt-1">Upload een GPX-bestand om je route te valideren</p>
      </div>
    </div>
  );
}

export default function StreetPanel({
  segments,
  intersections,
  apiKey,
  config,
  isAnalyzing,
  analysisStatus,
  activeId,
  onSelect,
  badStreets,
  onToggleBadStreet,
}) {
  const cardRefs = useRef({});

  useEffect(() => {
    if (activeId && cardRefs.current[activeId]) {
      cardRefs.current[activeId].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeId]);

  if (isAnalyzing) return <LoadingState status={analysisStatus} />;
  if (!segments.length) return <EmptyState />;

  const visibleIntersections = config.showIntersections ? intersections : [];

  const items = [];
  for (let i = 0; i < segments.length; i++) {
    items.push({ type: 'segment', data: segments[i] });
    const int = visibleIntersections.find((x) => x.afterSegmentIndex === i);
    if (int) items.push({ type: 'intersection', data: int });
  }

  const totalPhotos = segments.length * config.positions.length +
    (config.showIntersections ? intersections.length * 2 : 0);

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto h-full">
      <p className="text-xs text-slate-400 text-center pb-1">
        {segments.length} straten · {config.showIntersections ? intersections.length : 0} kruispunten · {totalPhotos} foto's
      </p>
      {items.map((item) =>
        item.type === 'segment' ? (
          <div key={item.data.id} ref={(el) => { cardRefs.current[item.data.id] = el; }}>
            <StreetCard
              segment={item.data}
              apiKey={apiKey}
              config={config}
              onSelect={onSelect}
              isActive={item.data.id === activeId}
              isBad={item.data.roadId != null && badStreets?.has(item.data.roadId)}
              onToggleBad={() => onToggleBadStreet?.(item.data.roadId, item.data.roadName, item.data.allPoints)}
            />
          </div>
        ) : (
          <div key={item.data.id} ref={(el) => { cardRefs.current[item.data.id] = el; }}>
            <IntersectionCard
              intersection={item.data}
              apiKey={apiKey}
              config={config}
              onSelect={onSelect}
              isActive={item.data.id === activeId}
            />
          </div>
        )
      )}
    </div>
  );
}
