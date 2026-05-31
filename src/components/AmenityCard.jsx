import { useRef, useEffect } from 'react';

export default function AmenityCard({ amenity, selected, onSelect }) {
  const ref = useRef(null);

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selected]);

  return (
    <button
      ref={ref}
      onClick={() => onSelect(amenity)}
      className={`w-full text-left px-3 py-3 rounded-lg border transition-all ${
        selected
          ? 'border-blue-400 bg-blue-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none flex-shrink-0">{amenity.emoji}</span>
          <div className="min-w-0">
            <p className="font-medium text-slate-800 text-sm truncate">
              {amenity.name || <span className="text-slate-400 italic">Naamloos</span>}
            </p>
            <p className="text-xs text-slate-500">{amenity.typeLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-slate-400 mt-0.5">
            ± {amenity.distanceFromRoute < 1000
              ? `${amenity.distanceFromRoute}m`
              : `${(amenity.distanceFromRoute / 1000).toFixed(1)}km`}
          </span>
          <a
            href={(() => {
              const query = [amenity.name, amenity.address].filter(Boolean).join(', ');
              if (query) {
                // Named venue: search by name+address, anchored to exact OSM coordinates at zoom 19
                return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${amenity.lat},${amenity.lng},19z`;
              }
              // Nameless: drop a pin at exact coordinates
              return `https://www.google.com/maps?q=${amenity.lat},${amenity.lng}`;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Open in Google Maps"
            className="flex items-center justify-center w-6 h-6 rounded bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </a>
        </div>
      </div>

      {(amenity.address || amenity.openingHours || amenity.website) && (
        <div className="mt-2 space-y-0.5 pl-7">
          {amenity.address && (
            <p className="text-xs text-slate-500 truncate">{amenity.address}</p>
          )}
          {amenity.openingHours && (
            <p className="text-xs text-slate-500 truncate">🕐 {amenity.openingHours}</p>
          )}
          {amenity.website && (
            <a
              href={amenity.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-blue-600 hover:underline truncate block"
            >
              🔗 {amenity.website.replace(/^https?:\/\/(www\.)?/, '')}
            </a>
          )}
        </div>
      )}
    </button>
  );
}
