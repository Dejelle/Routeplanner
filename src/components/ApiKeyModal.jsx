import { useState } from 'react';
import { createPortal } from 'react-dom';

export default function ApiKeyModal({ apiKey, onSave, onClose }) {
  const [value, setValue] = useState(apiKey || '');

  const handleSave = () => {
    onSave(value.trim());
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Google Street View API Key</h2>
            <p className="text-sm text-slate-500 mt-1">
              Required to load Street View images. Your key is stored locally and never sent to any
              server.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="AIza..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            autoFocus
          />
        </div>

        <div className="text-xs text-slate-400 mb-5">
          Enable the{' '}
          <strong className="text-slate-600">Street View Static API</strong> in Google Cloud Console
          and restrict to the{' '}
          <code className="bg-slate-100 px-1 rounded">maps.googleapis.com</code> domain.
        </div>

        <div className="flex gap-2 justify-end">
          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Annuleren
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Opslaan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
