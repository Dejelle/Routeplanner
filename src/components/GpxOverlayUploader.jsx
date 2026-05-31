import { useRef, useState } from 'react';

/**
 * Knop om een tweede GPX als semitransparante overlay op de kaart te tonen,
 * zodat de gebruiker routes kan vergelijken bij het ontwerpen van een nieuwe route.
 *
 * Toont — afhankelijk van of er al een overlay actief is — een import- of een
 * clear-knop. Sluit qua stijl aan bij de andere header-knoppen in App.jsx.
 */
export default function GpxOverlayUploader({ overlayName, onUpload, onClear }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onUpload(e.target.result, file.name);
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith('.gpx')) handleFile(file);
  };

  if (overlayName) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-purple-300 bg-purple-50 text-purple-700">
        <span>👻</span>
        <span className="hidden sm:inline max-w-[160px] truncate" title={overlayName}>
          Overlay: {overlayName}
        </span>
        <button
          onClick={onClear}
          className="ml-1 text-purple-500 hover:text-purple-800 font-bold leading-none"
          title="Overlay verwijderen"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
          dragging
            ? 'bg-purple-50 border-purple-400 text-purple-700'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
        }`}
        title="Importeer een tweede GPX als transparante overlay (om routes te vergelijken)"
      >
        <span>👻</span>
        <span className="hidden sm:inline">Importeer overlay</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        className="hidden"
        onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ''; }}
      />
    </>
  );
}
