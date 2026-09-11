-- ============================================================================
--  AROCO · 0086 — Registrar a mano lo que se abre y se cierra en el día
--
--  Las posiciones del CRM salen del extracto diario de StoneX, que es de
--  cierre. Álvaro abre dos contratos a media mañana, entra al CRM y no los ve.
--  Quedó anotado el 1-sep —«necesito poder registrar abrí / cerré durante el
--  día»— y otra vez el 9-sep, cuando abrió dos contratos que sí estaban en el
--  tablero del bróker y no en el CRM.
--
--  Al mirarlo con calma apareció que el MCP de StoneX SÍ expone `get_positions`
--  en vivo y el CRM nunca lo llamó. Pero hoy esa herramienta falla en el
--  servidor —login caído en una, y un `/v1/v2/` duplicado en la URL de la
--  otra—, así que el registro a mano no es un parche mientras se arregla: es
--  la vía que sigue funcionando cuando el scraper no.
--
--  ESTO NO PISA EL EXTRACTO. Lo que dice la contraparte con la que se liquida
--  manda siempre. Un movimiento anotado vale mientras el extracto no haya
--  llegado hasta su fecha; en cuanto entra el extracto de ese día, el
--  movimiento deja de aplicarse SOLO. Ver `src/lib/mercado/posiciones.ts`.
--
--  Se elige la fecha por encima de un «marcar como conciliado» a mano porque
--  una marca hay que acordarse de ponerla, y el día que se olvide el
--  movimiento se suma dos veces —una por el registro y otra por el extracto— y
--  la pantalla afirma el doble de cobertura de la que hay.
-- ============================================================================

create table if not exists public.posiciones_manuales (
  id         uuid primary key default gen_random_uuid(),

  -- El día en que se hizo la operación, no el día en que se anotó: alguien
  -- puede registrar por la tarde algo de la mañana, y lo que decide si el
  -- extracto ya lo recogió es cuándo ocurrió.
  fecha      date not null default current_date,

  accion     text not null check (accion in ('abre', 'cierra')),
  tipo       text not null check (tipo in ('FUT', 'CALL', 'PUT')),

  -- El LADO DE LA POSICIÓN, no la dirección de la orden. «Cerré el futuro
  -- vendido» baja el corto; decirlo como compra/venta obligaría a traducir
  -- mentalmente en el peor momento.
  lado       text not null check (lado in ('largo', 'corto')),

  contrato   text not null,
  strike     numeric(12,2),
  contratos  integer not null check (contratos > 0),
  precio     numeric(14,4),
  nota       text,

  registrado_por uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un futuro no tiene strike y una opción no puede quedarse sin él: sin esto
  -- el movimiento caería sobre la posición equivocada y nadie lo notaría
  -- mirando.
  constraint posiciones_manuales_strike check (
    (tipo = 'FUT' and strike is null) or (tipo in ('CALL','PUT') and strike is not null)
  )
);

comment on table public.posiciones_manuales is
  'Aperturas y cierres anotados durante el día. Valen hasta que el extracto del bróker llegue a su fecha.';

create index if not exists posiciones_manuales_fecha_idx
  on public.posiciones_manuales (fecha desc);

create trigger posiciones_manuales_set_updated_at
  before update on public.posiciones_manuales
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
--  Mismo permiso que el resto de Mercado: `ve_mercado()`, por persona y no por
--  rol. Un SuperAdmin sin ese permiso no entra por la puerta de atrás, que es
--  justo lo que 0062 evita en el menú.
--
--  A diferencia de las otras tablas de Mercado, esta SÍ admite escritura desde
--  el cliente: son datos que pone una persona, no un sync.
alter table public.posiciones_manuales enable row level security;

create policy "posiciones_manuales_select" on public.posiciones_manuales
  for select to authenticated using (public.ve_mercado());

create policy "posiciones_manuales_insert" on public.posiciones_manuales
  for insert to authenticated
  with check (public.ve_mercado() and registrado_por = auth.uid());

create policy "posiciones_manuales_update" on public.posiciones_manuales
  for update to authenticated
  using (public.ve_mercado()) with check (public.ve_mercado());

-- Borrar sí queda restringido al autor o a un admin: un registro de lo que se
-- operó es una afirmación firmada, y que cualquiera pueda quitar la de otro le
-- resta todo el valor como constancia.
create policy "posiciones_manuales_delete" on public.posiciones_manuales
  for delete to authenticated
  using (public.ve_mercado() and (registrado_por = auth.uid() or public.is_admin()));
