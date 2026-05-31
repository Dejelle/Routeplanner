import StreetViewImage from './StreetViewImage.jsx';

export default function IntersectionCard({ intersection, apiKey, config, onSelect, isActive }) {
  if (!config.showIntersections) return null;
  const { street1, street2, point, heading } = intersection;

  return (
    <div
      className={`rounded-xl border transition-all cursor-pointer ${
        isActive
          ? 'border-orange-400 bg-orange-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
      onClick={() => onSelect(point, intersection.id)}
    >
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-orange-500 text-sm">⚠</span>
          <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full truncate max-w-[140px]">
            {street1}
          </span>
          <span className="text-slate-400 text-xs">×</span>
          <span className="text-xs font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full truncate max-w-[140px]">
            {street2}
          </span>
        </div>
      </div>
      <div className="px-4 pb-3 flex gap-2">
        <StreetViewImage
          point={point}
          heading={heading}
          apiKey={apiKey}
          label="Naderend"
        />
        <StreetViewImage
          point={point}
          heading={(heading + 90) % 360}
          apiKey={apiKey}
          label="Dwars"
        />
      </div>
    </div>
  );
}
