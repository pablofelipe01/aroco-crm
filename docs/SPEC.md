# AROCO Platform — Especificación maestra (CRM + ERP comercial)

> Documento de referencia para la construcción de la plataforma interna de AROCO S.A.S.
> Construir por fases verificables (0→7). Detenerse al final de cada fase, resumir y pedir visto bueno.
> **Regla de oro:** ante credenciales, datos sensibles o preferencias del negocio no documentadas, **preguntar**, no asumir.

Fuente de datos y de lógica: `AROCO_Libro_Maestro.xlsx` (raíz del repo), 13 pestañas.

## 1. Misión
Reemplazar hojas de cálculo dispersas por **una sola plataforma web interna** multi-usuario, por departamentos, en tiempo real, con automatizaciones y asistentes de IA. Existe un MVP HTML/JS sobre Supabase (módulos Leads y Tareas) que sirve **solo de referencia** de idea, módulos y paleta — no se reutiliza ni el proyecto ni el código.

## 2. Stack (no negociable)
Next.js (App Router) + React (Server Components donde aplique) · TypeScript `strict` · Tailwind v4 (tokens en `tailwind`/CSS) · Supabase (Postgres + Auth + RLS + Storage + Edge Functions/Deno + pg_cron), **proyecto nuevo** · `@supabase/ssr` (clientes browser/server/route handler separados) · Framer Motion · Recharts (o visx) · lucide-react · @dnd-kit · @tanstack/react-table · Zod · react-hook-form · Anthropic SDK con tool use **solo servidor** (modelo leído de https://docs.claude.com/en/api/overview y parametrizado por entorno) · Deploy Vercel + Supabase · pnpm.

## 3. Fuente de datos (`AROCO_Libro_Maestro.xlsx`)
**Calculadores (lógica):** `Cot · NACIONAL`, `Cot · FOB`, `Cot · CIF`, `Cot · Instrucciones`, `Com · Supuestos`, `Com · Simulador`, `Com · Tabla Ref`.
**Datos:**
- `Leads` — 28 prospectos. Cols: #, Empresa, Contacto, País/Ciudad, Mercado (Nacional/Internacional), Tipo (Comprador / Proveedor potencial / Comprador/Broker), Estado (Nuevo, Cotización, Negociación, Enviado, En espera, Cerrado, Descartado), Producto/Interés, Próxima Acción, Comercial, Notas.
- `Inv · Disponible Bodega` — inventario por procedencia. Cols: Fecha, # Remisión, Código procedencia/destino (ej. `COL-MET-GRA-150526(DELEITE)`), Cantidad Ingresada (kg), Salida (kg), Disponible (kg), Muestras/Pasilla/merma. ~72 lotes; total ≈ 14.952 kg.
- `Inv · Despachos` — Cols: Remisión salida, Fecha salida, Destino (CASA LUKER, NAL. CHOCOLATES, TOLIMAX, Rusia…), Remisión entrada, Procedencia, Cantidad (kg), Total salida, Precio compra (COP/kg).
- `Histórico Precios` — precios semanales COP/kg. Cols: Fecha, CASA LUKER, NAC. CHOCOLATE BTA, NAC. CHOCOLATE IBAGUÉ.
- `Conectores (Datos en vivo)` (IMPORTRANGE — **ignorar**), `Portada` (índice — ignorar).

Inventario/Despachos/Histórico son **snapshots a verificar** contra archivos vivos; el sistema los gestionará a futuro.

**Equipo:** Nicolás Rodríguez (Dir. Internacional), Álvaro Acosta (Gerente General), Ángela María Acosta (Operaciones), Luis Ernesto Barrios (Finanzas), John Muñoz (Dir. Comercial), Milena Soto (RRHH/Operaciones), John Saenz (Calidad/Finca), Juan Carlos (Finca), Juan David Alarcón (Operaciones), Joscha Herold (Diseño/Web), Maximilian Werner (Socio Europa), Fernando Mejía Paz (Bodega).
**Departamentos:** Dirección, Comercial, Financiero, Administrativo, Bodega Central, Finca.

## 4. Diseño — identidad cacao + "Factor WOW"
Tokens base (ver `src/app/globals.css`): fondos `#F5F3EE / #EDEAE3 / #E4E0D7`; superficie `#FFFFFF`; texto `#1A1814 / #6B6760 / #9B9790`; acento `#1B4332 / #2D6A4F / #D8F3DC`; estados warn `#B45309` · danger `#991B1B` · info `#1E40AF`; radios 6/10/14; tipografía DM Sans + DM Mono.
WOW: modo oscuro (cacao nocturno) con toggle persistente; movimiento con intención (Framer Motion, <200ms); dashboard con KPIs animados + gráficas reales; command palette ⌘K; profundidad/glass/gradientes sutiles; skeletons + UI optimista + toasts + empty states con carácter; asistente IA en slide-over; responsive real; accesibilidad AA + teclado + `prefers-reduced-motion`.

## 5. Módulos
Dashboard · Comercial (CRM leads) · Cotizaciones · Inventario · Despachos · Comisiones · Histórico de Precios · Tareas · Equipo/Ajustes. Acceso por rol/departamento (§7).

## 6. Modelo de datos (Postgres)
PK `uuid`, `created_at`/`updated_at timestamptz default now()`, FKs reales. Migraciones en `supabase/migrations`.
Tablas: `profiles`, `team_members`, `leads`, `lead_activities`, `quotes`, `inventory_lots`, `inventory_movements`, `dispatches`, `price_history`, `commission_rules`, `commission_calcs`, `tasks`. (Campos detallados en el prompt original — respetar nombres y FKs: `lead → quotes → dispatches`; `inventory_lots → inventory_movements`; `inventory_lots → dispatches`.) Generar tipos TS con `supabase gen types typescript`.

## 7. Seguridad — RLS desde el día uno
RLS en **todas** las tablas; nada accesible sin política. Lectura/escritura según departamento/rol. `admin` (Dirección) todo; Comercial leads/quotes/tasks; Bodega inventario/movimientos/despachos; Financiero comisiones/precios. `anon key` en cliente OK; `service_role` **solo servidor**. **Registro: solo por invitación de admin** (confirmado).

## 8. Lógica financiera (portar con fidelidad → `src/lib/calc`, con tests)

### 8.1 Cotizador
Por línea: `COP/TM = valor*1000`; `USD/TM = COP/TM / TRM`; `USD/kg = USD/TM/1000`; `FINAL_USD = USD/TM * volumenTM`.
- Precio compra: `COP/TM = precioCompraKg*1000`. FNC = 3%×(compra USD/TM) solo export. Merma = 0,5%×(compra USD/TM) siempre.
- Ceros por incoterm: FOB → Estibas=0; CIF → Transporte a bodega=0; NACIONAL → FNC=0.

**Export (FOB/CIF):** `PRECIO_FINAL = cocoaUsdT*(1+dif)`; `base = Σ líneas 1..13`; `comision = comisionPct*(PRECIO_FINAL-(base+costosExport))`; `costoTotal = base+costosExport+comision`; `utilidad% = (PRECIO_FINAL-costoTotal)/costoTotal`.
- FOB ref (TRM 3557.81, compra 12100, cocoa 3901, dif 5%, com 8%, estibas=0): FINAL≈4096.05, com≈23.31, costo≈3828.03, util≈7.00%.
- CIF ref (dif 0%, com 10%, transp bodega=0, costosExport 720): FINAL=3901.00, com≈4.76, costo≈3858.12, util≈1.11%.

**NACIONAL** (bonificaciones reducen costo; comisión circular en forma cerrada):
`K = Σ líneas 1..13 − (bonifCalidad+bonifCadmio+bonifTrazab+bonifTransporte)`; `m=comisionPct`, `u=utilObjetivo`;
`PRECIO_FINAL = K*(1−m)*(1+u)/(1−m*(1+u))`; `comision = m*(PRECIO_FINAL−K)`; `costoTotal = K+comision`.
- NACIONAL ref (com 5%, util 8,84%, bonifCalidad=113.95, cadmio 280, trazab 120, transporte 180, transp bodega 150, selección 83): K≈3206.49, FINAL≈3506.3, com≈14.99.
- **PENDIENTE:** confirmar fórmula real de `bonifCalidad` (hoy input directo ≈113.95 USD/TM). Campo editable marcado.

### 8.2 Comisiones
Reglas (Mercado×Nivel) `pct_full` editable; `Solo Venta = pct_full*0.6`, `Solo Compra = pct_full*0.4`. Semilla: Nac/Senior 5%, Nac/Junior 3%, Intl/Senior 8%, Intl/Junior 6%.
Simulador: `utilBruta = venta−costo`; `margen = utilBruta/venta`; `pctAplicable` por (mercado,nivel,rol); `comision = utilBruta*pctAplicable`. Reparto dos agentes: Venta 60% / Compra 40%, total ≤ techo nivel.
- Ref: venta 65000, costo 36000, Internacional, Senior, Compra+Venta → util 29000, 8%, comisión **2320**.

## 9. Migración (`scripts/seed-from-xlsx.ts`)
Leer xlsx (SheetJS/exceljs), parsear pestañas de datos → tablas §6 (normalizar coma decimal y vacíos). Primero `team_members` y `commission_rules` (semillas), luego datos. **Idempotente** con upsert por claves naturales (remisión, código de lote, company+date). Reporte de filas cargadas/saltadas. Marcar Inventario/Histórico como snapshots a verificar.

## 10. Automatizaciones (triggers / Edge Functions / pg_cron)
Recalcular `qty_available_kg` en `inventory_movements`. Despacho ligado a lote → genera movimiento de salida. Quote "enviada" → lead a "Enviado" + activity. pg_cron diario: `next_action_date`/tareas vencidas → notificaciones. Alertas de precio por umbral. **Envío correo (Resend)/WhatsApp (Twilio): construido pero DESACTIVADO** tras env vars (confirmado).

## 11. Agentes IA (Anthropic, solo servidor)
Tool use sobre Supabase respetando RLS. Asistente conversacional (slide-over): `query_leads`, `get_inventory_summary`, `get_price_history`, `get_lead_activity`. Redacción asistida (correo/WhatsApp, borrador de cotización). Clasificación de leads. **Guardarraíl:** lecturas/sugerencias automáticas; toda **escritura** requiere confirmación humana explícita en UI; registrar cada acción.

## 12. Auth / onboarding
Supabase Auth email/password; registro pide nombre + departamento → `profiles` por trigger. `@supabase/ssr` + middleware Next. Onboarding: asociar perfil a `team_member`. **Alta solo por invitación de admin.**

## 13. Estructura
`app/(auth)`, `app/(app)/{dashboard,comercial,cotizaciones,inventario,despachos,comisiones,precios,tareas,equipo}`; `lib/supabase/{client,server,middleware}.ts`; `lib/calc/{cotizador,comisiones}.ts` (+tests); `lib/types/`; `components/ui`, `components/charts`; `app/api/agent/route.ts`; `supabase/migrations/*.sql`, `supabase/functions/*`; `scripts/seed-from-xlsx.ts`. `.env.local`/`.env.example`. TS estricto, ESLint+Prettier, estados de carga/error en cada fetch.

## 14. Fases
- **0 Andamiaje** — Next+TS+Tailwind tokens (claro/oscuro), shell (sidebar/topbar/command palette), design system (botones, inputs, cards, chips, modal, toast, skeletons). ✅
- **1 Supabase** — migraciones §6, RLS §7, tipos, clientes SSR, auth §12. ✅ (proyecto Supabase del usuario)
- **2 Migración** — `seed-from-xlsx` §9. ✅ (28 leads, 74 lotes, 47 despachos, 114 precios)
- **3 Core** — Dashboard, Comercial (Kanban/lista/ficha/actividad), Tareas. ✅
- **4 Calculadoras** — §8 con tests, Cotizaciones + Comisiones, quote ligada a lead + export PDF. ✅ (11 tests, valores de referencia exactos)
- **5 Inventario/Despachos/Precios** — con automatizaciones §10. ✅ (triggers de inventario, despacho→movimiento, recordatorios pg_cron, alertas de precio + campanita)
- **6 Factor WOW** — animaciones, gráficas, command palette completa, dark mode fino, empty states. ✅ (⌘K con búsqueda en vivo + deep-links, pie de ayuda, empty states con marca cacao)
- **7 Agentes IA** — §11, primero solo lectura, luego redacción con confirmación. ✅ (asistente conversacional solo-lectura: `/api/agent`, tool-use loop, 5 tools RLS-aware, slide-over ⌘). Pendiente: redacción asistida + escrituras con confirmación.

## 15. Definition of Done
Compila sin errores TS (`strict`) ni warnings ESLint · RLS activo en todas las tablas, sin `service_role` filtrado · funciones §8 pasan tests · responsive + accesible (AA, teclado, `prefers-reduced-motion`) · estados carga/error/vacío en cada vista · sin datos hardcodeados · env vars solo en entorno, `.env.example` documentado · diseño premium coherente claro/oscuro.

## 16. Env vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (servidor), `ANTHROPIC_API_KEY` (servidor), `ANTHROPIC_MODEL` (configurable), `RESEND_API_KEY` (opcional), WhatsApp/Twilio (opcional). Ver `.env.example`.

## 17. Decisiones confirmadas (2026-06-02)
1. Supabase: el usuario crea el proyecto y entrega URL + anon + service_role; trabajo con migraciones SQL versionadas.
2. Registro: **solo por invitación de admin**.
3. pnpm + deploy Vercel.
4. Email/WhatsApp: **listos pero desactivados** tras env vars.
5. **Pendiente:** confirmar fórmula real de Bonificación Calidad (nacional).
