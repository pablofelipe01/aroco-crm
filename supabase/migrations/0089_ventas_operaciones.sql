-- ============================================================================
--  AROCO · 0089 — El margen de cada operación
--
--  Cierra lo que 0088 dejó a medias. Ahí se metió el precio de compra en el
--  despacho y al validarlo apareció que ESE PRECIO NO ES EL COSTO: al
--  proveedor se le paga además la bonificación de calidad, se le descuenta la
--  humedad y se le retiene el 1,5 %. En la ODC-52 de agosto el precio base son
--  12.012 COP/kg y la operación costó 12.519.
--
--  La cadena vive en la pestaña «VENTAS 2026» y se comprobó al peso contra los
--  datos reales — en 52 de 53 operaciones:
--
--      pago base − descuento humedad + bonificación − retenciones
--        = VALOR A PAGAR AL PROVEEDOR
--
--  Con esto el CRM ya tiene, por operación, lo que se vendió, lo que costó de
--  verdad y el margen que la hoja calcula. Es lo que le faltaba para liquidar
--  comisiones por su cuenta (0087) y, de paso, el margen por operación deja de
--  no existir en ninguna pantalla.
--
--  LA HOJA SIGUE CALCULANDO. Esto es un reflejo, igual que 0087: el CRM guarda
--  lo que la hoja obtiene, no lo recalcula. Modelar esas fórmulas aquí es el
--  paso siguiente y necesita decidir qué parte es regla estable y qué parte es
--  criterio caso a caso.
-- ============================================================================

create table if not exists public.ventas_operaciones (
  id            uuid primary key default gen_random_uuid(),

  -- Fila de la hoja. Es la clave porque el ODC NO es único: ODC-26 aparece
  -- tres veces y ODC-29, ODC-31 y ODC-36 dos. Una misma orden puede
  -- despacharse en varias entregas y cada una tiene su propio margen.
  fila          integer not null unique,

  fecha         date,
  cliente       text,
  odc           text not null,
  remision_aroco text,
  recepcion     text,
  origen        text,

  peso_remision_kg numeric(14,3) not null default 0,
  aroco_kg         numeric(14,3) not null default 0,
  recepcion_kg     numeric(14,3) not null default 0,

  -- Lado de la venta.
  valor_kilo_negociado numeric(14,2) not null default 0,
  valor_total          numeric(16,2) not null default 0,
  valor_bonificacion   numeric(16,2) not null default 0,
  valor_a_pagar        numeric(16,2) not null default 0,

  -- Lado del proveedor: de aquí sale el costo real.
  precio_base_proveedor   numeric(14,2) not null default 0,
  pago_base               numeric(16,2) not null default 0,
  descuento_humedad       numeric(16,2) not null default 0,
  bonificacion_proveedor  numeric(16,2) not null default 0,
  retenciones             numeric(16,2) not null default 0,
  pago_proveedor          numeric(16,2) not null default 0,

  -- Margen, tal como lo calcula la hoja.
  a_favor_aroco               numeric(16,2) not null default 0,
  comision_flete              numeric(16,2) not null default 0,
  comision_sostenible         numeric(16,2) not null default 0,
  disponible_aroco            numeric(16,2) not null default 0,
  costo_transporte_seleccion  numeric(16,2) not null default 0,
  utilidad                    numeric(16,2) not null default 0,
  venta_60                    numeric(16,2) not null default 0,
  compra_40                   numeric(16,2) not null default 0,

  /**
   * Costo real por kilo, calculado al guardar. Es LA cifra que el CRM no
   * tenía, y se guarda en vez de derivarse en cada consulta para que
   * cualquiera pueda ordenar y filtrar por ella sin repetir la división.
   */
  costo_real_kg numeric(14,2)
    generated always as (
      case when recepcion_kg > 0 then round(pago_proveedor / recepcion_kg, 2) end
    ) stored,

  /** Si la cadena del proveedor no cuadró, queda dicho en la propia fila. */
  descuadre numeric(16,2),

  synced_at  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ventas_operaciones is
  'Margen por operación, leído de la pestaña VENTAS 2026. El costo real incluye bonificación al proveedor, descuento de humedad y retenciones.';

create index if not exists ventas_operaciones_odc_idx on public.ventas_operaciones (odc);
create index if not exists ventas_operaciones_fecha_idx on public.ventas_operaciones (fecha desc);

drop trigger if exists ventas_operaciones_set_updated_at on public.ventas_operaciones;
create trigger ventas_operaciones_set_updated_at
  before update on public.ventas_operaciones
  for each row execute function public.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
--  Mismo criterio que `ventas`: Dirección, Comercial y Financiero. Es el
--  margen del negocio, no algo que deba ver toda la empresa. Nadie escribe
--  desde el cliente — el sync corre con service_role.
alter table public.ventas_operaciones enable row level security;

drop policy if exists "ventas_operaciones_select" on public.ventas_operaciones;
create policy "ventas_operaciones_select" on public.ventas_operaciones
  for select to authenticated
  using (
    public.is_active_member()
    and (
      public.is_admin()
      or (select department from public.profiles where id = auth.uid())
          = any (array['Dirección','Comercial','Financiero']::public.department[])
    )
  );
