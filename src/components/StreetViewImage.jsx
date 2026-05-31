import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildCacheKey, buildUrl, buildUrlFromPano, fetchPanoMetadata } from '../utils/streetViewUrl.js';
import { getCached, setCached } from '../utils/imageCache.js';
import { useHeadingOffset } from '../contexts/HeadingOffsetContext.jsx';

export default function StreetViewImage({ point, heading, apiKey, label }) {
  const [src, setSrc] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [visible, setVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [panoId, setPanoId] = useState(null);
  const [hdSrc, setHdSrc] = useState(null);
  const [hdLoading, setHdLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  // Fetch HD version when fullscreen opens
  useEffect(() => {
    if (!fullscreen || !panoId || !apiKey || hdSrc) return;
    let cancelled = false;
    const hdKey = buildCacheKey(point, effectiveHeading) + ':hd';

    async function loadHd() {
      setHdLoading(true);
      const cached = await getCached(hdKey);
      if (cancelled) return;
      if (cached && cached !== 'NO_IMAGE') { setHdSrc(cached); setHdLoading(false); return; }

      const url = buildUrlFromPano(panoId, effectiveHeading, apiKey, '640x400', 2);
      try {
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) { setHdLoading(false); return; }
        const blob = await res.blob();
        if (cancelled) return;
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (cancelled) return;
        await setCached(hdKey, dataUrl);
        setHdSrc(dataUrl);
      } catch { /* show low-res as fallback */ }
      if (!cancelled) setHdLoading(false);
    }

    loadHd();
    return () => { cancelled = true; };
  }, [fullscreen, panoId, apiKey, hdSrc]);

  const { getOffset, setOffset } = useHeadingOffset();
  const offsetKey = buildCacheKey(point, heading);
  const headingOffset = getOffset(offsetKey);

  const effectiveHeading = ((heading + headingOffset) % 360 + 360) % 360;

  function rotate(delta) {
    setSrc(null);
    setLoaded(false);
    setError(false);
    setHdSrc(null);
    setOffset(offsetKey, headingOffset + delta);
  }

  // Lazy: only trigger when scrolled into view
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  // Cache-first load
  useEffect(() => {
    if (!apiKey || !visible) return;
    let cancelled = false;
    const cacheKey = buildCacheKey(point, effectiveHeading);

    async function load() {
      // 1. Check cache — 'NO_IMAGE' sentinel means we already know there's no coverage here
      const cached = await getCached(cacheKey);
      if (cancelled) return;
      if (cached === 'NO_IMAGE') { setError(true); return; }
      if (cached) { setSrc(cached); return; }

      // 2. Find nearest outdoor pano within 25m, use its pano_id with the route heading.
      //    This prevents Google from picking a panorama on a side street or driveway.
      const meta = await fetchPanoMetadata(point, apiKey);
      if (cancelled) return;

      // If no pano found and no fallback makes sense, cache the negative result immediately
      if (!meta) {
        await setCached(cacheKey, 'NO_IMAGE');
        if (!cancelled) setError(true);
        return;
      }

      if (!cancelled) setPanoId(meta.panoId);
      const url = buildUrlFromPano(meta.panoId, effectiveHeading, apiKey);
      try {
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) {
          await setCached(cacheKey, 'NO_IMAGE');
          setError(true);
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        // Convert to base64 data URL for storage
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        if (cancelled) return;
        await setCached(cacheKey, dataUrl);
        setSrc(dataUrl);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [apiKey, visible, point, effectiveHeading]);

  return (
    <div ref={ref} className="flex flex-col gap-1 flex-1 min-w-0">
      <div className="relative overflow-hidden rounded-lg bg-slate-100 aspect-[4/2.6]">
        {!apiKey && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs text-center px-2">
            Voeg API key toe
          </div>
        )}
        {apiKey && !visible && (
          <div className="absolute inset-0 animate-pulse bg-slate-200 rounded-lg" />
        )}
        {apiKey && visible && !src && !error && (
          <div className="absolute inset-0 animate-pulse bg-slate-200 rounded-lg" />
        )}
        {src && (
          <img
            src={src}
            alt={label}
            className={`w-full h-full object-cover rounded-lg transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setLoaded(true)}
            onError={() => { setError(true); setLoaded(true); }}
          />
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
            <span className="text-lg">📷</span>
            <span>Geen Street View</span>
          </div>
        )}
        {src && loaded && (
          <button
            onClick={(e) => { e.stopPropagation(); setFullscreen(true); }}
            className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded bg-black/50 text-white hover:bg-black/70 transition-colors"
            title="Foto vergroten"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="5" cy="5" r="3.5" stroke="white" strokeWidth="1.4"/>
              <line x1="7.9" y1="7.9" x2="11" y2="11" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </button>
        )}
        {apiKey && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); rotate(-45); }}
              className="absolute bottom-1.5 left-1.5 w-6 h-6 flex items-center justify-center rounded bg-black/50 text-white text-xs hover:bg-black/70 transition-colors"
              title="45° naar links draaien"
            >
              ‹
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); rotate(45); }}
              className="absolute bottom-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded bg-black/50 text-white text-xs hover:bg-black/70 transition-colors"
              title="45° naar rechts draaien"
            >
              ›
            </button>
          </>
        )}
      </div>
      {label && (
        <span className="text-xs text-slate-400 text-center truncate">{label}</span>
      )}

      {fullscreen && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
        >
          <div className="relative max-w-[92vw] max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
            <img
              src={hdSrc || src}
              alt={label}
              className="max-w-[92vw] max-h-[92vh] rounded-xl shadow-2xl object-contain"
            />
            {hdLoading && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/30">
                <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
          <button
            onClick={() => setFullscreen(false)}
            className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors text-lg"
            title="Sluiten (Esc)"
          >
            ✕
          </button>
          {label && (
            <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/70 text-sm bg-black/40 px-3 py-1 rounded-full">
              {label}
            </span>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
