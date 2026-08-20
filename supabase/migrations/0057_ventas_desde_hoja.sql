-- ============================================================================
--  AROCO · 0057 — Ventas desde la hoja de ventas
--
--  Hasta ahora /ventas se armaba con los despachos de la hoja de inventario,
--  que registran kilos y nada más: no hay precio de venta en ninguna parte, así
--  que el módulo solo podía hablar de toneladas.
--
--  La hoja de ventas sí trae la plata —valor negociado, bonificación y valor a
--  pagar por envío— y además distingue mercado nacional de exportación. Esta
--  tabla es su espejo.
--
--  La hoja manda: cada corrida reemplaza el contenido completo en vez de
--  intentar casar filas. La hoja no tiene identificador por venta —dos envíos
--  del mismo día, cliente y ODC son indistinguibles— así que cualquier
--  emparejamiento sería inventado, y a la primera fila insertada en el medio
--  empezaría a duplicar.
-- ============================================================================

create table if not exists public.ventas (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  cliente      text not null,
  odc          text,

  kg           numeric(14,2) not null default 0,
  -- valor_total + bonificacion = valor_pagar. Se guardan los tres porque la
  -- bonificación por calidad es plata que AROCO negocia aparte y saberla suelta
  -- es justamente lo que deja medir si negociar calidad rinde.
  valor_total  numeric(16,2) not null default 0,
  bonificacion numeric(16,2) not null default 0,
  valor_pagar  numeric(16,2) not null default 0,

  origen       text,
  bultos       integer,
  -- 'Nacional' | 'Internacional'. Texto y no enum: lo escribe la hoja, y un
  -- valor nuevo allá no puede tumbar el sync.
  mercado      text,

  fila         integer not null,   -- fila de la hoja, para poder rastrearla
  synced_at    timestamptz not null default now()
);

create index if not exists ventas_fecha_idx on public.ventas (fecha);
create index if not exists ventas_cliente_idx on public.ventas (cliente);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Facturación no es información de todo el equipo: se limita a las áreas que
-- ya ven el módulo (Dirección, Comercial, Financiero), igual que el menú.
alter table public.ventas enable row level security;

create policy "ventas_select" on public.ventas
  for select to authenticated
  using (
    public.is_active_member()
    and (
      public.is_admin()
      or (select department from public.profiles where id = auth.uid())
         in ('Dirección', 'Comercial', 'Financiero')
    )
  );

-- Nadie escribe desde el cliente: la única fuente es el sync con service_role.
-- Sin política de INSERT/UPDATE/DELETE, la RLS los bloquea a todos.

-- ── Reemplazo atómico ───────────────────────────────────────────────────────
-- En una sola transacción, para que una corrida a medias no deje el módulo
-- mostrando la mitad de las ventas del año.
create or replace function public.import_ventas_sheet(filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  insertadas integer;
begin
  if jsonb_array_length(filas) = 0 then
    raise exception 'La hoja no trajo filas; no se reemplaza nada.';
  end if;

  delete from public.ventas;

  insert into public.ventas
    (fecha, cliente, odc, kg, valor_total, bonificacion, valor_pagar,
     origen, bultos, mercado, fila)
  select
    (f->>'fecha')::date,
    f->>'cliente',
    nullif(f->>'odc', ''),
    coalesce((f->>'kg')::numeric, 0),
    coalesce((f->>'valor_total')::numeric, 0),
    coalesce((f->>'bonificacion')::numeric, 0),
    coalesce((f->>'valor_pagar')::numeric, 0),
    nullif(f->>'origen', ''),
    nullif(f->>'bultos', '')::integer,
    nullif(f->>'mercado', ''),
    (f->>'fila')::integer
  from jsonb_array_elements(filas) as f;

  get diagnostics insertadas = row_count;
  return insertadas;
end;
$$;

revoke execute on function public.import_ventas_sheet(jsonb) from anon, authenticated;
