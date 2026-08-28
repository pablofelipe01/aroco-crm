# Contrato: `get_cocoa_tables`

Instrucciones para el agente que corre en el servidor (Renata) para que el CRM
de AROCO pueda cargar los diferenciales de cacao automáticamente.

El CRM **ya está construido y esperando**. Lo único que falta es que esta
herramienta exista en un MCP alcanzable por el túnel de Cloudflare.

---

## 1. Dónde publicarla

Preferiblemente **dentro del `stonex-mcp` de AROCO**, el que ya responde en
`https://stonex-mcp.inverseneurallab.org/mcp`. Ya está autenticado, ya está en
el túnel, y el CRM ya sabe hablarle: no habría que configurar nada nuevo.

Si prefieres exponer el servicio de Renata como un cuarto hostname, también
sirve — en ese caso necesito su URL y su Cloudflare Service Token.

## 2. Qué debe devolver

Nombre de la herramienta: **`get_cocoa_tables`**, sin argumentos obligatorios.

```jsonc
{
  "differentials": {
    "published_date": "2026-08-26",        // fecha del reporte, ISO
    "pdf_url": "https://intel-cdn.stonex.com/…/differentials.pdf?verify=…",
    "matrix": [                             // página 1, fila por fila
      ["Origin", "Differential", "Change"],
      ["Ivory Coast", "+325", "+10"],
      ["Guayaquil grade 2", "+150", "0"],
      ["Peru grade 1", "(75)", "-5"]
    ]
  },
  "ratios": { /* misma forma; opcional, el CRM aún no lo usa */ },
  "missing": []                             // títulos que no se alcanzaron
}
```

### Lo que importa de esa forma

- **`matrix` cruda, sin interpretar.** No hace falta que el agente identifique
  columnas ni limpie valores: el CRM guarda la matriz tal cual **además** de las
  filas ya leídas. Si el parseo resulta equivocado alguna semana, se puede
  volver a leer sin esperar al reporte siguiente. Mandar solo lo interpretado
  quitaría esa red.
- **Una celda por columna, en el orden en que aparecen.** Es lo que ya produce
  `_extract_report_matrix`; no hay que cambiarlo.
- **Los valores como texto, tal como están en el PDF.** El CRM entiende `+150`,
  `(75)` —paréntesis = negativo— y separadores de miles. Convertirlos allá
  arriesga perder el signo.
- **`published_date` en ISO.** Es la clave con la que el CRM guarda el reporte;
  sin ella no puede distinguir la semana.
- **`missing` cuando el scroll no alcanzó el reporte.** El CRM lo trata distinto
  de un error: avisa que hay que subir `max_scrolls` en vez de reintentar a
  ciegas.

## 3. Cuándo se llama

**Los lunes a las 14:00 UTC** (9:00 a. m. Bogotá), una vez por semana. El cron
ya está programado.

No se llama a diario a propósito: el reporte es semanal, y traerlo obliga al
agente a navegar el portal y parsear un PDF. Pedirlo cinco veces por un dato
que no cambió sería cargar ese trabajo de más.

Si algún lunes el reporte todavía no salió, devolver `missing` con el título; el
CRM lo registra y reintenta a la semana siguiente sin romper nada.

## 4. Qué hace el CRM con eso

1. Guarda la matriz cruda en `cocoa_report_tables`.
2. La interpreta a filas `origen · grado · valor` en `cocoa_differentials`.
   No asume índices de columna: toma la primera celda con texto como origen y
   el primer número de la fila como el diferencial.
3. Calcula **Colombia**, que no viene en el reporte: la ubica al **77,5 % del
   tramo** entre `Peru grade 1` y `Guayaquil grade 2`. El porcentaje es
   configurable desde la base (`ajustes_mercado.posicion_colombia`) porque es un
   juicio de Comercial, no una constante técnica.
4. La muestra en `/mercado` y se la da al asistente.

La fila de Colombia queda marcada como **estimación de AROCO**, resaltada y con
su método a la vista. No es una cotización y no puede citarse como si lo fuera.

## 5. Cómo probar que quedó bien

Desde el servidor, con el MCP corriendo:

```bash
# Debe listar get_cocoa_tables entre las herramientas
curl -sX POST https://stonex-mcp.inverseneurallab.org/mcp \
  -H "CF-Access-Client-Id: $CF_ID" -H "CF-Access-Client-Secret: $CF_SECRET" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Cuando aparezca, avísame: yo corro el sync desde el CRM y verifico que la matriz
llegue, que las filas se lean bien y que Colombia caiga donde debe.

## 6. Lo que NO necesito

- Que escriba en Supabase. El CRM va y busca; el agente solo entrega el dato.
  Así las credenciales de la base no salen de Vercel.
- Que interprete la tabla ni calcule nada de Colombia. Eso vive en el CRM,
  versionado y con pruebas.
- Que mande los PDF. Con `pdf_url` basta para verificar contra la fuente.
