-- ============================================================================
--  AROCO · 0108 — Leads de Compra y de Venta, separados
--
--  Revisión del CRM del 2026-10-09: el pipeline sumaba ~20.000 millones
--  mezclando proveedores (a quién le compramos cacao) con clientes (a quién se
--  lo vendemos), y eso distorsiona las métricas comerciales: 5.600 millones
--  eran de 28 «Proveedor potencial».
--
--  `negocio` dice de qué lado está el lead. Si no viene (asistente, seed), se
--  deduce del tipo: «Proveedor potencial» es Compra; lo demás, Venta. Y el
--  tipo tiene que cuadrar con el negocio, para que no vuelvan a mezclarse.
--
--  Los de compra llevan además región (departamento) y cadmio alto/bajo; las
--  toneladas ya existían.
-- ============================================================================

alter table public.leads
  add column if not exists negocio text,
  add column if not exists region  text,
  add column if not exists cadmio  text;

update public.leads
set negocio = case when type = 'Proveedor potencial' then 'Compra' else 'Venta' end
where negocio is null;

create or replace function public.lead_deduce_negocio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.negocio is null then
    new.negocio := case when new.type = 'Proveedor potencial' then 'Compra' else 'Venta' end;
  end if;
  -- Los campos de compra no tienen sentido en una venta: se limpian en vez de
  -- rechazar, para que cambiar un lead de lado no exija vaciarlos a mano.
  if new.negocio = 'Venta' then
    new.region := null;
    new.cadmio := null;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_deduce_negocio on public.leads;
create trigger leads_deduce_negocio
  before insert or update on public.leads
  for each row execute function public.lead_deduce_negocio();

alter table public.leads
  alter column negocio set not null,
  add constraint leads_negocio_check check (negocio in ('Compra', 'Venta')),
  add constraint leads_cadmio_check check (cadmio is null or cadmio in ('Alto', 'Bajo')),
  -- Un proveedor potencial es una compra, y un comprador es una venta.
  add constraint leads_tipo_cuadra check (
    type is null
    or (negocio = 'Compra' and type = 'Proveedor potencial')
    or (negocio = 'Venta'  and type <> 'Proveedor potencial')
  );

comment on column public.leads.negocio is 'Compra (proveedor de cacao) o Venta (cliente). Se deduce del tipo si no viene.';
comment on column public.leads.region  is 'Solo compras: departamento de origen del cacao.';
comment on column public.leads.cadmio  is 'Solo compras: cadmio Alto o Bajo.';

create index if not exists leads_negocio_idx on public.leads (negocio);
