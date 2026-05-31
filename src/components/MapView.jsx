import { useEffect, useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useHeadingOffset } from '../contexts/HeadingOffsetContext.jsx';
import { buildCacheKey } from '../utils/streetViewUrl.js';
import { getCached } from '../utils/imageCache.js';
import { getKmMarkers } from '../utils/geometry.js';

const TILE_LAYERS = {
  osm: {
    label: 'Standaard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  cyclosm: {
    label: 'Fiets',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.cyclosm.org">CyclOSM</a> | &copy; OpenStreetMap',
    maxZoom: 20,
  },
  topo: {
    label: 'Topografisch',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Kaart: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxZoom: 17,
  },
  satellite: {
    label: 'Satelliet',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  hybrid: {
    label: 'Hybride',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri | Labels &copy; OpenStreetMap',
    maxZoom: 19,
    overlayUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    overlayOpacity: 0.35,
  },
};

function LayerSwitcher({ current, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 12,
        zIndex: 1000,
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {open && (
        <div
          style={{
            marginBottom: 8,
            background: 'white',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            overflow: 'hidden',
            minWidth: 140,
          }}
        >
          {Object.entries(TILE_LAYERS).map(([key, layer]) => (
            <button
              key={key}
              onClick={() => { onChange(key); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                fontSize: 13,
                textAlign: 'left',
                background: current === key ? '#dbeafe' : 'white',
                color: current === key ? '#1d4ed8' : '#1f2937',
                fontWeight: current === key ? 600 : 400,
                border: 'none',
                borderBottom: '1px solid #f1f5f9',
                cursor: 'pointer',
              }}
            >
              {layer.label}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Wijzig kaartweergave"
        style={{
          width: 40,
          height: 40,
          background: 'white',
          border: '2px solid rgba(0,0,0,0.2)',
          borderRadius: 8,
          boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
      </button>
    </div>
  );
}

function createDirectionIcon(heading) {
  return L.divIcon({
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<svg width="36" height="36" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${heading},18,18)">
        <polygon points="18,2 12,18 24,18" fill="rgba(59,130,246,0.75)" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </g>
      <circle cx="18" cy="18" r="6" fill="#3b82f6" stroke="white" stroke-width="1.5"/>
    </svg>`,
  });
}

function createNoImageIcon() {
  return L.divIcon({
    className: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    html: `<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="5" fill="#94a3b8" stroke="white" stroke-width="1.5"/>
    </svg>`,
  });
}

function createExploreIcon(heading) {
  return L.divIcon({
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<svg width="36" height="36" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(${heading},18,18)">
        <polygon points="18,2 12,18 24,18" fill="rgba(249,115,22,0.75)" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </g>
      <circle cx="18" cy="18" r="6" fill="#f97316" stroke="white" stroke-width="1.5"/>
    </svg>`,
  });
}

function FlyToController({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 17, { duration: 1 });
  }, [target, map]);
  return null;
}

function MapClickHandler({ onClick }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function MapCursorController({ mode }) {
  const map = useMap();
  useEffect(() => {
    map.getContainer().style.cursor = mode ? 'crosshair' : '';
    return () => { map.getContainer().style.cursor = ''; };
  }, [mode, map]);
  return null;
}

function createWaypointIcon(index, isFirst, isLast) {
  const color = isFirst ? '#10b981' : isLast ? '#ef4444' : '#3b82f6';
  return L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<svg width="28" height="28" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="11" fill="${color}" stroke="white" stroke-width="2"/>
      <text x="14" y="19" text-anchor="middle" font-size="11" fill="white" font-weight="bold">${index + 1}</text>
    </svg>`,
  });
}

function createKmIcon(km) {
  return L.divIcon({
    className: '',
    iconSize: null,
    iconAnchor: [17, 10],
    html: `<div style="
      background: white;
      border: 2px solid #3b82f6;
      border-radius: 10px;
      padding: 1px 6px;
      font-size: 10px;
      font-weight: 700;
      color: #1d4ed8;
      white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0,0,0,0.22);
      pointer-events: none;
      line-height: 1.4;
    ">${km} km</div>`,
  });
}

/**
 * Toont km-markeringen langs de route.
 * Het interval past zich automatisch aan op basis van de zoomstand:
 *   zoom ≥ 13 → elke 1 km
 *   zoom 11–12 → elke 5 km
 *   zoom ≤ 10 → elke 10 km
 */
function KmMarkerLayer({ points }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const intervalKm = zoom >= 13 ? 1 : zoom >= 11 ? 5 : 10;
  const markers = useMemo(() => getKmMarkers(points, intervalKm), [points, intervalKm]);

  return markers.map((m) => (
    <Marker
      key={`km-${m.km}`}
      position={[m.lat, m.lng]}
      icon={createKmIcon(m.km)}
      interactive={false}
    />
  ));
}

function FitBoundsOnLoad({ points }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (points.length && !fitted.current) {
      map.fitBounds(points.map((p) => [p.lat, p.lng]), { padding: [40, 40] });
      fitted.current = true;
    }
  }, [points, map]);
  return null;
}

const MapView = forwardRef(function MapView(
  { gpxPoints, segments, config, onSelectPoint, flyTarget, onMapClick, explorePoint, badStreets, onToggleBadStreet, amenities, selectedAmenity, onAmenityClick, routeEditMode, editWaypoints, editSegments, onInsertWaypoint, onMoveWaypoint, onRemoveWaypoint, overlayPoints },
  ref
) {
  const mapRef = useRef(null);
  useImperativeHandle(ref, () => ({ flyTo: (pt) => mapRef.current?.flyTo([pt.lat, pt.lng], 17) }));
  const { getOffset } = useHeadingOffset();
  const [noImageKeys, setNoImageKeys] = useState(new Set());
  const [layerKey, setLayerKey] = useState(() => localStorage.getItem('mapLayer') || 'osm');
  const activeLayer = TILE_LAYERS[layerKey] || TILE_LAYERS.osm;
  const handleLayerChange = (key) => {
    setLayerKey(key);
    try { localStorage.setItem('mapLayer', key); } catch {}
  };

  useEffect(() => {
    const keys = [];
    for (const seg of segments) {
      for (const pos of config.positions) {
        const vp = seg.viewpoints[pos];
        if (!vp) continue;
        const offset = getOffset(buildCacheKey(vp.point, vp.heading));
        const effectiveHeading = ((vp.heading + offset) % 360 + 360) % 360;
        keys.push(buildCacheKey(vp.point, effectiveHeading));
      }
    }
    if (!keys.length) return;
    Promise.all(keys.map(async (key) => ({ key, noImage: (await getCached(key)) === 'NO_IMAGE' })))
      .then((results) => {
        const next = new Set(results.filter((r) => r.noImage).map((r) => r.key));
        setNoImageKeys(next);
      })
      .catch(() => {});
  }, [segments, config.positions, getOffset]);

  const positions = gpxPoints.map((p) => [p.lat, p.lng]);

  return (
    <div className="relative h-full w-full">
    <MapContainer
      center={[50.85, 4.35]}
      zoom={13}
      className="h-full w-full"
      ref={mapRef}
    >
      <TileLayer
        key={layerKey}
        attribution={activeLayer.attribution}
        url={activeLayer.url}
        maxZoom={activeLayer.maxZoom}
      />
      {activeLayer.overlayUrl && (
        <TileLayer
          key={`${layerKey}-overlay`}
          url={activeLayer.overlayUrl}
          opacity={activeLayer.overlayOpacity ?? 0.4}
          maxZoom={activeLayer.maxZoom}
        />
      )}

      {/* Overlay-GPX: tweede route als semitransparante referentie. Niet-interactief
          en onder de andere lagen, zodat hij nooit het bewerken of klikken hindert. */}
      {overlayPoints && overlayPoints.length > 0 && (
        <Polyline
          positions={overlayPoints.map((p) => [p.lat, p.lng])}
          pathOptions={{
            color: '#a855f7',
            weight: 5,
            opacity: 0.45,
            dashArray: '6 6',
            interactive: false,
          }}
        />
      )}

      {/* Doorlopende blauwe GPX-lijn (verborgen tijdens bewerken om visuele ruis te beperken) */}
      {positions.length > 0 && !routeEditMode && (
        <>
          <Polyline positions={positions} color="#3b82f6" weight={4} opacity={0.8} />
          <KmMarkerLayer points={gpxPoints} />
          <FitBoundsOnLoad points={gpxPoints} />
        </>
      )}

      {/* Rode overlays voor opgeslagen slechte straten (historisch, ook zonder route) */}
      {[...badStreets.values()].map((bs) => (
        <Polyline
          key={`bad-${bs.id}`}
          positions={bs.geometry.map((p) => [p.lat, p.lng])}
          color="#ef4444"
          weight={5}
          opacity={0.9}
          pathOptions={{ interactive: false }}
        />
      ))}

      {/* Rode overlays voor slechte segmenten in huidige route */}
      {segments.map((seg) => {
        if (seg.roadId == null || !badStreets.has(seg.roadId)) return null;
        return (
          <Polyline
            key={`bad-seg-${seg.id}`}
            positions={seg.allPoints.map((p) => [p.lat, p.lng])}
            color="#ef4444"
            weight={5}
            opacity={0.9}
            pathOptions={{ interactive: false }}
          />
        );
      })}

      {/* Onzichtbare klikbare Polylijnen per segment (voor markeren) */}
      {segments.map((seg) => (
        <Polyline
          key={`click-${seg.id}`}
          positions={seg.allPoints.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: '#000', opacity: 0, weight: 12, fillOpacity: 0 }}
          eventHandlers={{
            click: (e) => {
              if (routeEditMode) return; // uitgeschakeld tijdens route bewerken
              L.DomEvent.stopPropagation(e);
              if (seg.roadId != null) {
                onToggleBadStreet(seg.roadId, seg.roadName, seg.allPoints);
              }
            },
          }}
        />
      ))}

      {segments.map((seg) =>
        config.positions.flatMap((pos) => {
          const vp = seg.viewpoints[pos];
          if (!vp) return [];
          const offset = getOffset(buildCacheKey(vp.point, vp.heading));
          const effectiveHeading = ((vp.heading + offset) % 360 + 360) % 360;
          const cacheKey = buildCacheKey(vp.point, effectiveHeading);
          const isNoImage = noImageKeys.has(cacheKey);
          return (
            <Marker
              key={`${seg.id}-${pos}`}
              position={[vp.point.lat, vp.point.lng]}
              icon={isNoImage ? createNoImageIcon() : createDirectionIcon(effectiveHeading)}
              eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); onSelectPoint(vp.point, seg.id); } }}
            />
          );
        })
      )}

      {/* Amenity markers */}
      {amenities && amenities.map((a) => {
        const isSelected = selectedAmenity?.id === a.id;
        return (
          <CircleMarker
            key={`amenity-${a.id}`}
            center={[a.lat, a.lng]}
            radius={isSelected ? 10 : 7}
            pathOptions={{
              fillColor: a.color,
              color: isSelected ? '#1e40af' : 'white',
              weight: isSelected ? 2.5 : 1.5,
              fillOpacity: 0.9,
            }}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onAmenityClick?.(a);
              },
            }}
          >
          </CircleMarker>
        );
      })}

      {/* ── Route editor: berekende segmenten ─────────────────────────────── */}
      {routeEditMode && editSegments && editSegments.map((seg, i) =>
        seg ? (
          <Polyline
            key={`edit-seg-${i}`}
            positions={seg.map((p) => [p.lat, p.lng])}
            color={routeEditMode === 'draw' ? '#10b981' : '#f59e0b'}
            weight={4}
            opacity={0.85}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onInsertWaypoint?.({ lat: e.latlng.lat, lng: e.latlng.lng }, i);
              },
            }}
          />
        ) : null
      )}

      {/* ── Route editor: sleepbare waypoint-markers ───────────────────────── */}
      {routeEditMode && editWaypoints && editWaypoints.map((wp, i) => (
        <Marker
          key={wp.id}
          position={[wp.lat, wp.lng]}
          draggable={true}
          icon={createWaypointIcon(i, i === 0, i === editWaypoints.length - 1)}
          eventHandlers={{
            dragend: (e) => onMoveWaypoint?.(wp.id, e.target.getLatLng()),
          }}
        >
          <Popup minWidth={120} closeButton={false}>
            <div style={{ textAlign: 'center', padding: '2px 0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>
                Waypoint {i + 1}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveWaypoint?.(wp.id); }}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                🗑 Verwijder
              </button>
            </div>
          </Popup>
        </Marker>
      ))}

      {flyTarget && <FlyToController target={flyTarget} />}
      {/* In normale modus én draw-modus klikken afhandelen; in edit-modus NIET (klikken op segment = waypoint invoegen) */}
      {onMapClick && routeEditMode !== 'edit' && <MapClickHandler onClick={onMapClick} />}
      {routeEditMode && <MapCursorController mode={routeEditMode} />}

      {explorePoint && (() => {
        const exploreOffset = getOffset(buildCacheKey(explorePoint, 0));
        const exploreHeading = (exploreOffset % 360 + 360) % 360;
        return (
          <Marker
            position={[explorePoint.lat, explorePoint.lng]}
            icon={createExploreIcon(exploreHeading)}
          />
        );
      })()}
    </MapContainer>
    <LayerSwitcher current={layerKey} onChange={handleLayerChange} />
    </div>
  );
});

export default MapView;
