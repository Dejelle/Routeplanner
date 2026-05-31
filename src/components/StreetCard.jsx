import StreetViewImage from './StreetViewImage.jsx';
import { POSITION_OPTIONS } from '../utils/config.js';

const LABELS = Object.fromEntries(POSITION_OPTIONS.map(({ id, label }) => [id, label]));

export default function StreetCard({ segment, apiKey, config, onSelect, isActive, isBad, onToggleBad }) {
  const canMark = segment.roadId != null;

  return (
    <div
      className={`rounded-xl border transition-all cursor-pointer ${
        isBad
          ? 'border-red-400 bg-red-50 shadow-sm'
          : isActive
          ? 'border-blue-400 bg-blue-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
      onClick={() => onSelect(segment.viewpoints.mid?.point ?? segment.viewpoints.start.point, segment.id)}
    >
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        {isBad ? (
          <span className="text-red-500 text-sm">⚠</span>
        ) : (
          <span className="text-blue-500 text-sm">🛣</span>
        )}
        <h3 className={`font-semibold text-sm truncate ${isBad ? 'text-red-800' : 'text-slate-800'}`}>
          {segment.roadName}
        </h3>
        <button
          title={isBad ? 'Markering verwijderen' : 'Markeer als slechte straat'}
          disabled={!canMark}
          onClick={(e) => {
            e.stopPropagation();
            if (canMark) onToggleBad();
          }}
          className={`ml-auto flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md border text-sm transition-colors ${
            isBad
              ? 'border-red-300 bg-red-100 text-red-600 hover:bg-red-200'
              : 'border-slate-200 bg-white text-slate-400 hover:border-red-300 hover:bg-red-50 hover:text-red-500'
          } disabled:opacity-30 disabled:cursor-not-allowed`}
        >
          ⚠
        </button>
      </div>
      <div className="px-4 pb-4 flex gap-2">
        {config.positions.map((pos) => {
          const vp = segment.viewpoints[pos];
          if (!vp) return null;
          return (
            <StreetViewImage
              key={pos}
              point={vp.point}
              heading={vp.heading}
              apiKey={apiKey}
              label={LABELS[pos]}
            />
          );
        })}
      </div>
    </div>
  );
}
