"use client";

import { useEffect, useRef, useState } from "react";
import type { Incident } from "@/lib/types";
import { timeAgo } from "@/lib/data";

const CAT_COLOR: Record<string, string> = {
  violent: "#c0392b",
  property: "#d98a00",
  nuisance: "#3b82f6",
  hazard: "#a855f7",
  unverified: "#64748b",
};

interface Props {
  lat: number;
  lon: number;
  radiusMiles: number;
  incidents: Incident[];
  heat: boolean;
  onSelect?: (i: Incident) => void;
}

const isLight = () => typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
const tileUrl = () => `https://{s}.basemaps.cartocdn.com/${isLight() ? "light_all" : "dark_all"}/{z}/{x}/{y}{r}.png`;
// "You are here" uses brand blue — red is reserved for incidents.
const homeColor = () => (isLight() ? "#0059A9" : "#5b9bff");

export default function Map({ lat, lon, radiusMiles, incidents, heat, onSelect }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const homeRef = useRef<any>(null);
  const tileRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [themeVer, setThemeVer] = useState(0);

  // init once
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    const onResize = () => mapRef.current?.invalidateSize();
    const onTheme = () => {
      if (mapRef.current && tileRef.current) tileRef.current.setUrl(tileUrl());
      setThemeVer((v) => v + 1); // redraw theme-tinted overlays
    };
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true, attributionControl: false, zoomAnimation: true }).setView([lat, lon], 14);
      tileRef.current = L.tileLayer(tileUrl(), {
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      setReady(true); // signal effects below that the map exists
      // Leaflet must recompute its size once the tab/container is laid out,
      // otherwise tiles render gray or only fill part of the view.
      setTimeout(() => map.invalidateSize(), 80);
      setTimeout(() => map.invalidateSize(), 350);
      window.addEventListener("resize", onResize);
      window.addEventListener("pscc:theme", onTheme);
      if (typeof ResizeObserver !== "undefined" && elRef.current) {
        ro = new ResizeObserver(onResize);
        ro.observe(elRef.current);
      }
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pscc:theme", onTheme);
      ro?.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // recenter when location changes
  useEffect(() => {
    (async () => {
      const map = mapRef.current;
      if (!map) return;
      const L = (await import("leaflet")).default;
      map.invalidateSize();
      map.flyTo([lat, lon], 14, { duration: 0.6 });
      if (homeRef.current) homeRef.current.remove();
      homeRef.current = L.layerGroup().addTo(map);
      // radius ring
      const c = homeColor();
      L.circle([lat, lon], {
        radius: radiusMiles * 1609.34,
        color: c,
        weight: 1.5,
        fillColor: c,
        fillOpacity: 0.05,
        dashArray: "5,6",
      }).addTo(homeRef.current);
      // home marker
      L.marker([lat, lon], {
        icon: L.divIcon({
          className: "",
          html: `<div style="width:16px;height:16px;border-radius:50%;background:${c};border:3px solid #ffffff;box-shadow:0 0 0 4px rgb(0 89 169 / 0.25)"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(homeRef.current);
    })();
  }, [lat, lon, radiusMiles, ready, themeVer]);

  // render incidents
  useEffect(() => {
    (async () => {
      const map = mapRef.current;
      const group = layerRef.current;
      if (!map || !group) return;
      const L = (await import("leaflet")).default;
      group.clearLayers();
      for (const i of incidents) {
        const color = CAT_COLOR[i.category] || "#64748b";
        const baseR = heat ? 9 + i.severity * 5 : 4 + i.severity * 1.6;
        const circle = L.circleMarker([i.lat, i.lon], {
          radius: baseR,
          color: heat ? color : color,
          weight: heat ? 0 : 1,
          fillColor: color,
          fillOpacity: heat ? 0.22 : i.verified ? 0.85 : 0.5,
        });
        circle.bindPopup(
          `<b>${i.type}</b> <span style="color:#94a3b8">· sev ${i.severity}/5</span><br/>` +
            `${i.block}, ${i.neighborhood}<br/>` +
            `<span style="color:#94a3b8">${timeAgo(i.occurred_at)} · ${i.source_label}${i.verified ? "" : " (unverified)"}</span>`
        );
        if (onSelect) circle.on("click", () => onSelect(i));
        circle.addTo(group);
      }
    })();
  }, [incidents, heat, onSelect, ready]);

  return <div ref={elRef} className="h-full w-full" />;
}
