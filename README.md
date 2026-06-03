# AROCO — Plataforma comercial (CRM + ERP)

Plataforma interna de **AROCO S.A.S** (exportadora/comercializadora de cacao colombiano): CRM de leads, inventario de bodega, cotizaciones de exportación, despachos, comisiones, histórico de precios, tareas y un asistente de IA — todo en una sola app, multi-usuario y por departamentos.

## Stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS v4** (tokens cacao en `src/app/globals.css`, claro/oscuro)
- **Supabase** — Postgres + Auth + RLS + Edge Functions + pg_cron (clientes SSR con `@supabase/ssr`)
- Framer Motion · Recharts · @dnd-kit · @tanstack/react-table · Zod · react-hook-form · lucide-react
- **Anthropic** (`@anthropic-ai/sdk`) — asistente con *tool use*, solo en el servidor
- Deploy: **Vercel** (app) + **Supabase** (datos)

## Módulos

Dashboard · Comercial (CRM de leads, Kanban) · Cotizaciones (cotizador NACIONAL/FOB/CIF + PDF) · Inventario · Despachos · Comisiones · Histórico de precios · Tareas · Equipo/Ajustes · Asistente IA (⌘K + panel).

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local   # y completa las claves
pnpm dev
```

Variables de entorno: ver [`.env.example`](.env.example). Necesitas un proyecto Supabase (URL + anon + service_role) y, para el asistente, una `ANTHROPIC_API_KEY`.

### Base de datos

Las migraciones SQL versionadas están en [`supabase/migrations`](supabase/migrations). Aplícalas con la CLI de Supabase (o el panel) en orden. Genera los tipos con:

```bash
pnpm db:types       # supabase gen types typescript --linked
```

Siembra de datos iniciales desde el libro maestro (archivo local, no versionado):

```bash
pnpm seed           # scripts/seed-from-xlsx.ts
```

Primer admin (invite-only):

```bash
pnpm tsx scripts/bootstrap-admin.ts <email> <password> "Nombre"
```

## Scripts

| Comando | Descripción |
|---|---|
| `pnpm dev` / `build` / `start` | Desarrollo / build / producción |
| `pnpm typecheck` · `lint` · `format` | Calidad de código |
| `pnpm test` | Tests de la lógica financiera (`src/lib/calc`) |
| `pnpm seed` | Carga inicial desde `AROCO_Libro_Maestro.xlsx` |

## Seguridad

- **RLS activo en todas las tablas**; el acceso se aplica en Postgres, no solo en el cliente.
- La `service_role key` y la `ANTHROPIC_API_KEY` viven **solo en el servidor** (`.env.local`, fuera de git).
- Registro de usuarios **solo por invitación de admin**.

## Documentación

La especificación maestra del producto está en [`docs/SPEC.md`](docs/SPEC.md); las convenciones para desarrollo en [`CLAUDE.md`](CLAUDE.md).
