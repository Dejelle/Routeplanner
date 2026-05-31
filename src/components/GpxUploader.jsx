import { useRef, useState } from 'react';

export default function GpxUploader({ onUpload }) {
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

  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
          dragging
            ? 'bg-blue-50 border-blue-400 text-blue-700'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
        }`}
      >
        <span>📂</span>
        <span>Upload GPX</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />
    </>
  );
}
