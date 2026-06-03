# AROCO Platform — guía para Claude

Plataforma interna de **AROCO S.A.S** (exportadora de cacao colombiano): CRM + ERP comercial.
La especificación maestra completa está en `docs/SPEC.md`. Constrúyela por **fases verificables (0→7)**, deteniéndote al final de cada una para pedir visto bueno.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript `strict`
- Tailwind CSS v4 (config en CSS con `@theme`; tokens en `src/app/globals.css`)
- Supabase (Postgres + Auth + RLS + Storage + Edge Functions + pg_cron) — **proyecto del usuario**, migraciones SQL versionadas en `supabase/migrations`
- Framer Motion · Recharts · lucide-react · @dnd-kit · @tanstack/react-table · Zod · react-hook-form · next-themes
- Anthropic SDK (agentes) — **solo servidor**
- Gestor: **pnpm**. Deploy: Vercel + Supabase.

## Convenciones

- Componentes en `src/components/ui` (design system) y `src/components/layout` (shell).
- Helpers en `src/lib` (`utils.ts`, `motion.ts`, `status.ts`, `nav.ts`).
- Colores y radios **siempre** vía tokens semánticos (`bg-surface`, `text-fg-muted`, `border-border`, `rounded-[var(--radius-md)]`), nunca hex crudos.
- Números/códigos/fechas con fuente mono y clase `.tnum`.
- Animaciones suaves (<200ms); respetar `prefers-reduced-motion` (ya global en CSS).
- Lógica financiera (§8 de la spec) → funciones puras testeadas en `src/lib/calc`.

## Comandos

- `pnpm dev` · `pnpm build` · `pnpm typecheck` · `pnpm lint` · `pnpm format`
- `pnpm test` — tests de `src/lib/calc/*.test.ts` (node:test)
- `pnpm seed` — carga `AROCO_Libro_Maestro.xlsx` (Fase 2)

## Definition of Done por fase

Compila sin errores TS (`strict`) ni warnings ESLint · RLS activo en todas las tablas ·
service_role nunca en el cliente · funciones de cálculo pasan sus tests · responsive + accesible (AA, teclado) ·
estados de carga/error/vacío en cada vista.

## Decisiones del negocio (confirmadas)

- Supabase: el usuario crea el proyecto y entrega las claves.
- Registro: **solo por invitación de admin**.
- Email/WhatsApp: automatizaciones construidas pero **desactivadas** tras env vars.
- Pendiente: confirmar fórmula real de **Bonificación Calidad** del cotizador nacional (Fase 4).

@AGENTS.md
