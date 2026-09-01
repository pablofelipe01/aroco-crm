import type { DatosMercado } from "@/app/(app)/mercado/riesgo-data";

/**
 * Lo que la persona está viendo, en texto, para dárselo al analista.
 *
 * El asistente ya tiene herramientas para consultar Mercado, pero pedirle que
 * las use para hablar de la pantalla que está abierta es caro y —peor— puede
 * devolver un número distinto al que se ve: `cargarMercado` pide el precio en
 * vivo cada vez, así que dos llamadas separadas por un minuto no coinciden.
 * Discutir sobre una cifra que no está en pantalla es exactamente lo que hace
 * que alguien deje de confiar en la respuesta.
 *
 * Por eso la foto se arma del mismo objeto que se acaba de renderizar. Las
 * herramientas siguen ahí para lo que la foto NO trae: otro vencimiento, el
 * texto completo de un reporte, el histórico de precios.
 *
 * Función pura: entra `DatosMercado`, sale texto. Sin fechas de "ahora" ni
 * lecturas de base, para poder fijarla en un test.
 */
export function fotoMercado(d: DatosMercado): string {
  const L: string[] = [];
  const r = d.riesgo;

  // Números con punto decimal y sin separador de miles. El formato colombiano
  // («12.480,5») es ambiguo para quien lee el texto plano: el punto de los
  // miles se confunde con el decimal. La respuesta al usuario SÍ va en formato
  // colombiano — eso lo pide el prompt, no la foto.
  const n = (v: number | null | undefined, dec = 2) =>
    v === null || v === undefined || Number.isNaN(v) ? "—" : v.toFixed(dec);
  const fecha = (v: string | null | undefined) => v ?? "sin fecha";

  L.push("## Inventario y exposición");
  L.push(
    `En bodega: ${n(r.toneladasFisicas)} t en ${d.totales.lotes_con_saldo} lotes · costo promedio ${n(r.costoPromedioCopKg)} COP/kg`,
  );
  L.push(
    `Cubierto: ${n(r.toneladasCubiertas)} t nominales (${n(r.coberturaPct, 1)} %) · descubierto: ${n(r.toneladasDescubiertas)} t`,
  );
  L.push(
    d.cobertura
      ? `Cobertura efectiva ponderada por delta: ${n(d.cobertura.efectivaT)} t (de ${n(d.cobertura.sinDeltaT)} t nominales)`
      : "Cobertura efectiva ponderada por delta: NO SE PUEDE CALCULAR, no hay delta cargado. Sin delta no se puede afirmar cuánto protege de verdad una cobertura.",
  );
  L.push(
    `Contratos: puts comprados ${r.contratos.putsLargos} · calls vendidos ${r.contratos.callsCortos} · futuros vendidos ${r.contratos.futurosCortos} · futuros comprados ${r.contratos.futurosLargos}`,
  );
  L.push(
    r.collar && (r.collar.piso !== null || r.collar.techo !== null)
      ? `Collar armado: piso ${n(r.collar.piso)} · techo ${n(r.collar.techo)}`
      : "Collar: no hay collar armado.",
  );

  const variacion =
    d.mercado.precioUsdT !== null && d.mercado.cierrePrevio
      ? ((d.mercado.precioUsdT - d.mercado.cierrePrevio) /
          d.mercado.cierrePrevio) *
        100
      : null;
  L.push(
    `Precio del cacao: ${n(d.mercado.precioUsdT)} USD/t · contrato ${d.mercado.contrato ?? "—"} · fuente "${d.mercado.fuente ?? "—"}"${
      d.mercado.momento ? ` · momento ${d.mercado.momento}` : ""
    }${variacion === null ? "" : ` · variación del día ${n(variacion, 2)} %`} · fecha ${fecha(d.mercado.fecha)}`,
  );
  if (d.mercado.fuente !== "vivo") {
    L.push(
      'El precio NO es en vivo: "guardado" es el último cierre almacenado y "paridad" está deducido del tablero. Adviértelo al responder.',
    );
  }
  L.push(
    `Precio llevado a pesos: ${n(r.precioMercadoCopKg)} COP/kg · TRM ${n(d.trm.valor)} del ${fecha(d.trm.fecha)}`,
  );
  L.push(
    `Valorización del inventario contra su costo: ${n(r.pnlFisicoCop, 0)} COP`,
  );
  L.push(
    r.faltantes.length > 0
      ? `FALTANTES DEL CÁLCULO: ${r.faltantes.join(", ")}. Las cifras que dependen de eso no son fiables y hay que decirlo.`
      : "Faltantes del cálculo: ninguno.",
  );

  if (d.escenarios.length > 0) {
    L.push("");
    L.push(
      "## Escenarios en pantalla (solo física, sin efecto de la cobertura)",
    );
    for (const e of d.escenarios) {
      L.push(
        `${e.variacion === 0 ? "precio de hoy" : `${(e.variacion * 100).toFixed(0)} %`}: ${n(e.precioCopKg)} COP/kg → ${n(e.pnlCop, 0)} COP`,
      );
    }
  }

  L.push("");
  if (d.broker) {
    L.push(
      `## Cuenta en StoneX (estado del ${fecha(d.broker.fecha)}, cuenta ${d.broker.cuenta ?? "—"}, ${d.broker.moneda})`,
    );
    L.push(
      `Equity ${n(d.broker.equity)} · caja disponible ${n(d.broker.disponible)} · variación de mercado ${n(d.broker.variacionMercado)}`,
    );
    L.push(
      `P&L realizado del mes ${n(d.broker.pnlMtd)} · del año ${n(d.broker.pnlYtd)}`,
    );
    L.push(
      d.broker.margenInicial === null
        ? "El extracto NO reporta el margen. La caja disponible es el `excess_equity` que declara el bróker: nunca la calcules como equity − margen, sería una cifra inventada."
        : `Margen inicial ${n(d.broker.margenInicial)}.`,
    );
  } else {
    L.push("## Cuenta en StoneX");
    L.push("No hay ningún estado de cuenta procesado.");
  }

  L.push("");
  L.push(
    `## Cadena de opciones ${d.cadena.elegido ?? "—"} (tablero del ${fecha(d.cadena.fecha)}, subyacente ${n(d.cadena.subyacente)})`,
  );
  L.push(
    `Vencimientos disponibles: ${
      d.cadena.vencimientos
        .map((v) => `${v.contract_month} (tablero del ${v.date})`)
        .join(", ") || "ninguno"
    }`,
  );
  if (d.cadena.filas.length === 0) {
    L.push(
      "La cadena está vacía: no hay tablero bajado para este vencimiento.",
    );
  } else {
    // Solo la ventana alrededor del dinero. La cadena entera son decenas de
    // strikes y los extremos no se usan para cubrir; mandarlos completos gasta
    // contexto en filas que nadie va a mirar.
    const ancla =
      d.cadena.subyacente ??
      d.cadena.filas[Math.floor(d.cadena.filas.length / 2)].strike;
    const cerca = [...d.cadena.filas]
      .sort((a, b) => Math.abs(a.strike - ancla) - Math.abs(b.strike - ancla))
      .slice(0, 14)
      .sort((a, b) => a.strike - b.strike);
    L.push(
      `Primas en PUNTOS, la misma unidad que el strike (no son dólares). ${cerca.length} strikes alrededor del dinero, de ${d.cadena.filas.length} en la cadena completa; para los demás usa get_tablero_opciones.`,
    );
    L.push(
      "strike | prima_call | prima_put | delta_call | delta_put | contratos_propios_call | contratos_propios_put",
    );
    for (const f of cerca) {
      L.push(
        [
          n(f.strike, 0),
          n(f.call_premium),
          n(f.put_premium),
          n(f.call_delta),
          n(f.put_delta),
          f.propioCall,
          f.propioPut,
        ].join(" | "),
      );
    }
  }

  L.push("");
  L.push(
    `## Ratios de producto y futuros (reporte del ${fecha(d.ratios.fecha)})`,
  );
  if (d.ratios.futuros.length > 0) {
    L.push(
      `Futuros: ${d.ratios.futuros
        .map(
          (f) =>
            `${f.contrato} ${n(f.valor)} ${f.moneda}${f.valor_anterior === null ? "" : ` (semana anterior ${n(f.valor_anterior)})`}`,
        )
        .join(" · ")}`,
    );
  }
  if (d.ratios.filas.length === 0) {
    L.push("Sin ratios en el último reporte.");
  } else {
    L.push("Un ratio multiplica el precio del futuro; no es un precio suelto.");
    for (const f of d.ratios.filas.slice(0, 24)) {
      L.push(
        `${f.categoria} · ${f.producto}${f.incoterm ? ` · ${f.incoterm}` : ""}${f.mercado ? ` · ${f.mercado}` : ""}: ratio ${n(f.ratio, 3)}${
          f.ratio_anterior === null
            ? ""
            : ` (anterior ${n(f.ratio_anterior, 3)})`
        }${f.precio_usd === null ? "" : ` · precio ${n(f.precio_usd)} USD`}`,
      );
    }
  }

  L.push("");
  L.push(
    `## Diferenciales por origen (reporte del ${fecha(d.diferenciales.fecha)})`,
  );
  if (d.diferenciales.filas.length === 0) {
    L.push("Sin diferenciales en el último reporte.");
  } else {
    for (const f of d.diferenciales.filas) {
      L.push(
        `${f.origen}${f.grado ? ` (${f.grado})` : ""}: ${n(f.valor)} ${f.unidad} · fuente ${f.fuente}${f.metodo ? ` · método: ${f.metodo}` : ""}`,
      );
    }
    L.push(
      "El de Colombia es una ESTIMACIÓN de AROCO, no una cotización de mercado: al darlo, dilo y explica el método.",
    );
  }

  if (d.intel.length > 0) {
    L.push("");
    L.push("## Titulares de StoneX en pantalla");
    for (const a of d.intel) {
      L.push(`- ${a.published_at.slice(0, 10)} · ${a.title}`);
    }
    L.push(
      "Para el resumen o el texto completo de un artículo, usa get_intel_mercado.",
    );
  }

  return L.join("\n");
}
