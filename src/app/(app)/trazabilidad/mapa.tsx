"use client";

import * as React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LugarPunto, VeredaEnAcopio } from "./page";

/**
 * El mapa de la cadena: de la bodega de Bogotá a las veredas del Cauca.
 *
 * Leaflet a pelo, sin envoltorio de React: el mapa es un objeto imperativo con
 * su propio ciclo de vida y meterlo dentro del de React solo añade una capa
 * que traducir. Se crea una vez y se le repintan las capas cuando cambian los
 * puntos.
 *
 * Los marcadores son círculos dibujados y no los iconos por defecto de
 * Leaflet: esos se cargan como PNG desde una ruta relativa que en Next hay que
 * reconfigurar, y un mapa con los iconos rotos es peor que uno con círculos.
 *
 * LO QUE EL MAPA NO DICE. Una vereda sin coordenada no se pinta. No se coloca
 * «cerca del municipio» para que se vea llena: un punto inventado en un mapa
 * de trazabilidad es exactamente la clase de dato que alguien termina citando
 * como si fuera cierto. Las que faltan se cuentan al lado, en la lista.
 */

const COLORES = {
  bodega: "#7c3aed",
  municipio: "#0ea5e9",
  vereda: "#16a34a",
} as const;

type Punto = {
  lat: number;
  lng: number;
  nombre: string;
  tipo: keyof typeof COLORES;
  detalle?: string;
};

export function MapaTrazabilidad({
  bodega,
  municipios,
  veredas,
  className,
}: {
  bodega: LugarPunto | null;
  municipios: LugarPunto[];
  veredas: VeredaEnAcopio[];
  className?: string;
}) {
  const contenedor = React.useRef<HTMLDivElement | null>(null);
  const mapa = React.useRef<L.Map | null>(null);
  const capa = React.useRef<L.LayerGroup | null>(null);

  const puntos = React.useMemo<Punto[]>(() => {
    const xs: Punto[] = [];
    if (bodega?.lat != null && bodega.lng != null) {
      xs.push({
        lat: bodega.lat,
        lng: bodega.lng,
        nombre: bodega.nombre,
        tipo: "bodega",
        detalle: bodega.fuente ?? undefined,
      });
    }
    for (const m of municipios) {
      if (m.lat == null || m.lng == null) continue;
      xs.push({ lat: m.lat, lng: m.lng, nombre: m.nombre, tipo: "municipio" });
    }
    for (const v of veredas) {
      if (v.lat == null || v.lng == null) continue;
      xs.push({
        lat: v.lat,
        lng: v.lng,
        nombre: v.nombre,
        tipo: "vereda",
        detalle: `${v.productores} productor${v.productores === 1 ? "" : "es"} · ${v.kg.toLocaleString("es-CO")} kg`,
      });
    }
    return xs;
  }, [bodega, municipios, veredas]);

  React.useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    mapa.current = L.map(contenedor.current, {
      // La rueda del ratón hace zoom en el mapa y no desplaza la página, que
      // dentro de una pantalla larga es lo que menos se espera. Se activa al
      // hacer clic.
      scrollWheelZoom: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 18,
    }).addTo(mapa.current);
    capa.current = L.layerGroup().addTo(mapa.current);

    return () => {
      mapa.current?.remove();
      mapa.current = null;
      capa.current = null;
    };
  }, []);

  React.useEffect(() => {
    const m = mapa.current;
    const g = capa.current;
    if (!m || !g) return;
    g.clearLayers();

    if (puntos.length === 0) {
      // Colombia entera: sin puntos, un mapa centrado en 0,0 sale en el
      // Atlántico y parece roto.
      m.setView([4.6, -74.1], 5);
      return;
    }

    const bodegaP = puntos.find((p) => p.tipo === "bodega");
    const destinos = puntos.filter((p) => p.tipo !== "bodega");

    for (const p of puntos) {
      L.circleMarker([p.lat, p.lng], {
        radius: p.tipo === "vereda" ? 6 : 8,
        color: COLORES[p.tipo],
        fillColor: COLORES[p.tipo],
        fillOpacity: p.tipo === "vereda" ? 0.85 : 0.6,
        weight: 2,
      })
        .bindPopup(
          `<strong>${p.nombre}</strong>${p.detalle ? `<br>${p.detalle}` : ""}`,
        )
        .addTo(g);
    }

    // La línea de la bodega a cada municipio es el «desde dónde vino»: sin
    // ella el mapa son puntos sueltos a 400 km unos de otros.
    if (bodegaP) {
      for (const d of destinos.filter((p) => p.tipo === "municipio")) {
        L.polyline(
          [
            [bodegaP.lat, bodegaP.lng],
            [d.lat, d.lng],
          ],
          { color: COLORES.municipio, weight: 1.5, opacity: 0.5, dashArray: "5 6" },
        ).addTo(g);
      }
    }

    m.fitBounds(L.latLngBounds(puntos.map((p) => [p.lat, p.lng])), {
      padding: [40, 40],
      maxZoom: 12,
    });
  }, [puntos]);

  return (
    <div
      ref={contenedor}
      className={className}
      // El contenedor necesita altura explícita: Leaflet mide el div al
      // montarse y con altura cero no dibuja nada, sin dar ningún error.
      style={{ minHeight: "22rem" }}
      role="img"
      aria-label={`Mapa con ${puntos.length} puntos de la cadena, de la bodega a las veredas`}
    />
  );
}
