'use client';

import type { BaseComponentProps } from '@json-render/react';
import {
  Map as LeafletMapUI,
  MapTileLayer,
  MapMarker,
  MapPopup,
  MapZoomControl,
} from '@/components/ui/map';
import type { LatLngExpression } from 'leaflet';

interface MarkerEntry {
  lat: number;
  lng: number;
  label: string | null;
  popup: string | null;
}

interface MapProps {
  title: string | null;
  centerLat: number;
  centerLng: number;
  zoom: number | null;
  markers: MarkerEntry[];
}

export function JsonRenderMap({ props }: BaseComponentProps<MapProps>) {
  const p = props as MapProps;
  const markers = Array.isArray(p.markers) ? p.markers : [];
  const zoom = typeof p.zoom === 'number' ? p.zoom : 5;
  const center: LatLngExpression = [
    p.centerLat ?? 39.8,
    p.centerLng ?? -98.5,
  ];

  if (!markers.length) {
    return (
      <div className="text-sm text-muted-foreground rounded-md border p-4">
        No map markers provided.
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-md border" style={{ height: 380 }}>
      <LeafletMapUI center={center} zoom={zoom} className="size-full min-h-0">
        <MapTileLayer />
        <MapZoomControl />
        {markers.map((m, i) => {
          const pos: LatLngExpression = [m.lat, m.lng];
          return (
            <MapMarker key={`${m.lat}-${m.lng}-${i}`} position={pos}>
              {(m.popup || m.label) && (
                <MapPopup>
                  {m.label && (
                    <p className="font-semibold text-sm">{m.label}</p>
                  )}
                  {m.popup && (
                    <p className="text-xs text-muted-foreground">{m.popup}</p>
                  )}
                </MapPopup>
              )}
            </MapMarker>
          );
        })}
      </LeafletMapUI>
    </div>
  );
}
