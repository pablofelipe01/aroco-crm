-- ============================================================================
--  0113 · Inventario: la carga pasa del Excel al CRM (fase 2)
--
--  Acordado en la reunión de 2026-11: «la carga del inventario se hará desde
--  el CRM (no desde Excel)». La fase 1 (0112) dejó el sync del archivo nuevo y
--  la vista por bodega; esta migración pone el libro del CRM:
--
--  · `inventario_config.fuente` dice quién manda: 'hoja' (el sync diario del
--    Excel, como hasta hoy) o 'crm'. El paso es de una sola vía y lo da un
--    admin con `inventario_pasar_a_crm()`. Mientras manda la hoja, el CRM no
--    acepta ingresos ni salidas: registrar en los dos lados contaría doble.
--  · Un lote del CRM (source='crm') NO guarda su disponible a mano: lo
--    calcula `inventario_recalcular_lote` a partir de lo que entró por clase,
--    sus salidas (dispatches.lote_origen_id) y sus ajustes:
--        disponible(c) = entró(c) − salió(c) − ajustes que salen de c
--                        + reclasificaciones que llegan a c
--        merma         = Σ ajustes de merma y de apertura
--    Si una salida o un ajuste deja una clase en negativo, se rechaza.
--  · Al pasar al CRM, cada lote del archivo recibe un ajuste de «apertura» por
--    clase que explica la diferencia entre lo que el archivo dice que queda y
--    lo que dan sus entradas y salidas (la merma y la selección que el archivo
--    no detalla). Así el disponible de cada lote queda exactamente igual.
--  · Baba (cacao fresco) es una clase más: el archivo nunca la trajo.
-- ============================================================================

-- ── Configuración ──────────────────────────────────────────────────────────
create table if not exists public.inventario_config (
  id boolean primary key default true check (id),
  fuente text not null default 'hoja' check (fuente in ('hoja', 'crm')),
  cambiado_en timestamptz,
  cambiado_por uuid references public.profiles(id) on delete set null
);
insert into public.inventario_config (id) values (true) on conflict do nothing;

alter table public.inventario_config enable row level security;
drop policy if exists inventario_config_select on public.inventario_config;
create policy inventario_config_select on public.inventario_config
  for select using (public.is_active_member());
-- Nadie la escribe directo: solo inventario_pasar_a_crm().

-- ── Columnas nuevas ────────────────────────────────────────────────────────
create sequence if not exists public.inventario_ingreso_seq;

alter table public.inventory_lots
  add column if not exists qty_in_baba_kg numeric(14,3) not null default 0,
  add column if not exists qty_avail_baba_kg numeric(14,3) not null default 0,
  add column if not exists proveedor_id uuid references public.proveedores(id) on delete set null,
  add column if not exists responsable text,
  add column if not exists bonificacion_cop_kg numeric(14,4),
  add column if not exists created_by uuid default auth.uid() references public.profiles(id) on delete set null;

alter table public.dispatches
  add column if not exists qty_baba_kg numeric(14,3) not null default 0;

-- ── Ajustes (merma, reclasificación, apertura) ─────────────────────────────
create table if not exists public.inventario_ajustes (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.inventory_lots(id) on delete cascade,
  fecha date not null default (now() at time zone 'America/Bogota')::date,
  tipo text not null check (tipo in ('merma', 'reclasificacion', 'apertura')),
  clase_origen text not null check (clase_origen in
    ('premium','estandar','corriente','corriente_c','fairtrade','rainforest','organico','pasilla','baba')),
  clase_destino text check (clase_destino in
    ('premium','estandar','corriente','corriente_c','fairtrade','rainforest','organico','pasilla','baba')),
  kg numeric(14,3) not null,
  nota text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- La apertura puede ser negativa (la selección genera pasilla que el
  -- archivo no registró como entrada); merma y reclasificación, no.
  check (tipo = 'apertura' or kg > 0),
  check ((tipo = 'reclasificacion') = (clase_destino is not null)),
  check (clase_destino is null or clase_destino <> clase_origen)
);
create index if not exists inventario_ajustes_lot_idx on public.inventario_ajustes (lot_id);

alter table public.inventario_ajustes enable row level security;
drop policy if exists inventario_ajustes_select on public.inventario_ajustes;
create policy inventario_ajustes_select on public.inventario_ajustes
  for select using (public.is_active_member());
drop policy if exists inventario_ajustes_write on public.inventario_ajustes;
create policy inventario_ajustes_write on public.inventario_ajustes
  for all
  using (tipo <> 'apertura'
         and public.can_write(array['Bodega Central','Administrativo','Operaciones']::department[]))
  with check (tipo <> 'apertura'
         and public.can_write(array['Bodega Central','Administrativo','Operaciones']::department[]));

-- ── Recalcular un lote del CRM ─────────────────────────────────────────────
create or replace function public.inventario_recalcular_lote(p_lot uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.inventory_lots%rowtype;
  s record;
  a record;
  v record;
  falta text;
begin
  select * into l from public.inventory_lots where id = p_lot for update;
  if not found or l.source <> 'crm' then return; end if;

  select coalesce(sum(qty_kg),0) kg,
    coalesce(sum(qty_premium_kg),0) premium, coalesce(sum(qty_estandar_kg),0) estandar,
    coalesce(sum(qty_corriente_kg),0) corriente, coalesce(sum(qty_corriente_c_kg),0) corriente_c,
    coalesce(sum(qty_fairtrade_kg),0) fairtrade, coalesce(sum(qty_rainforest_kg),0) rainforest,
    coalesce(sum(qty_organico_kg),0) organico, coalesce(sum(qty_pasilla_kg),0) pasilla,
    coalesce(sum(qty_baba_kg),0) baba
  into s from public.dispatches where lote_origen_id = p_lot;

  -- Neto por clase de los ajustes: lo que sale de la clase menos lo que llega.
  select
    coalesce(sum(kg) filter (where tipo in ('merma','apertura')),0) merma,
    coalesce(sum(case when clase_origen='premium' then kg else 0 end) - sum(case when clase_destino='premium' then kg else 0 end),0) premium,
    coalesce(sum(case when clase_origen='estandar' then kg else 0 end) - sum(case when clase_destino='estandar' then kg else 0 end),0) estandar,
    coalesce(sum(case when clase_origen='corriente' then kg else 0 end) - sum(case when clase_destino='corriente' then kg else 0 end),0) corriente,
    coalesce(sum(case when clase_origen='corriente_c' then kg else 0 end) - sum(case when clase_destino='corriente_c' then kg else 0 end),0) corriente_c,
    coalesce(sum(case when clase_origen='fairtrade' then kg else 0 end) - sum(case when clase_destino='fairtrade' then kg else 0 end),0) fairtrade,
    coalesce(sum(case when clase_origen='rainforest' then kg else 0 end) - sum(case when clase_destino='rainforest' then kg else 0 end),0) rainforest,
    coalesce(sum(case when clase_origen='organico' then kg else 0 end) - sum(case when clase_destino='organico' then kg else 0 end),0) organico,
    coalesce(sum(case when clase_origen='pasilla' then kg else 0 end) - sum(case when clase_destino='pasilla' then kg else 0 end),0) pasilla,
    coalesce(sum(case when clase_origen='baba' then kg else 0 end) - sum(case when clase_destino='baba' then kg else 0 end),0) baba
  into a from public.inventario_ajustes where lot_id = p_lot;

  select
    l.qty_in_premium_kg - s.premium - a.premium premium,
    l.qty_in_estandar_kg - s.estandar - a.estandar estandar,
    l.qty_in_corriente_kg - s.corriente - a.corriente corriente,
    l.qty_in_corriente_c_kg - s.corriente_c - a.corriente_c corriente_c,
    l.qty_in_fairtrade_kg - s.fairtrade - a.fairtrade fairtrade,
    l.qty_in_rainforest_kg - s.rainforest - a.rainforest rainforest,
    l.qty_in_organico_kg - s.organico - a.organico organico,
    l.qty_in_pasilla_kg - s.pasilla - a.pasilla pasilla,
    l.qty_in_baba_kg - s.baba - a.baba baba
  into v;

  falta := concat_ws(', ',
    case when v.premium < -0.001 then 'Premium' end,
    case when v.estandar < -0.001 then 'Estándar' end,
    case when v.corriente < -0.001 then 'Corriente' end,
    case when v.corriente_c < -0.001 then 'Corriente C' end,
    case when v.fairtrade < -0.001 then 'Fairtrade' end,
    case when v.rainforest < -0.001 then 'Rainforest' end,
    case when v.organico < -0.001 then 'Orgánico' end,
    case when v.pasilla < -0.001 then 'Pasilla' end,
    case when v.baba < -0.001 then 'Baba' end);
  if falta <> '' then
    raise exception 'El lote % no tiene suficiente %: quedaría en negativo.',
      coalesce(l.codigo_nuevo, l.code), falta
      using errcode = 'check_violation';
  end if;

  update public.inventory_lots set
    qty_in_kg = qty_in_premium_kg + qty_in_estandar_kg + qty_in_corriente_kg + qty_in_corriente_c_kg
              + qty_in_fairtrade_kg + qty_in_rainforest_kg + qty_in_organico_kg + qty_in_pasilla_kg
              + qty_in_baba_kg,
    qty_out_kg = s.kg,
    merma_kg = a.merma,
    qty_avail_premium_kg = v.premium, qty_avail_estandar_kg = v.estandar,
    qty_avail_corriente_kg = v.corriente, qty_avail_corriente_c_kg = v.corriente_c,
    qty_avail_fairtrade_kg = v.fairtrade, qty_avail_rainforest_kg = v.rainforest,
    qty_avail_organico_kg = v.organico, qty_avail_pasilla_kg = v.pasilla,
    qty_avail_baba_kg = v.baba
  where id = p_lot;
end;
$$;
revoke execute on function public.inventario_recalcular_lote(uuid) from public, anon, authenticated;

create or replace function public.inventario_tr_despacho()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.lote_origen_id is not null then
    perform public.inventario_recalcular_lote(old.lote_origen_id);
  end if;
  if tg_op in ('INSERT','UPDATE') and new.lote_origen_id is not null then
    perform public.inventario_recalcular_lote(new.lote_origen_id);
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists inventario_despacho_recalcula on public.dispatches;
create trigger inventario_despacho_recalcula
  after insert or update or delete on public.dispatches
  for each row execute function public.inventario_tr_despacho();

create or replace function public.inventario_tr_ajuste()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.inventario_recalcular_lote(old.lot_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform public.inventario_recalcular_lote(new.lot_id); end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists inventario_ajuste_recalcula on public.inventario_ajustes;
create trigger inventario_ajuste_recalcula
  after insert or update or delete on public.inventario_ajustes
  for each row execute function public.inventario_tr_ajuste();

-- Cambiar lo que entró en un lote del CRM (corregir un ingreso) recalcula.
create or replace function public.inventario_tr_lote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'crm' and pg_trigger_depth() = 1 then
    perform public.inventario_recalcular_lote(new.id);
  end if;
  return null;
end;
$$;
drop trigger if exists inventario_lote_recalcula on public.inventory_lots;
create trigger inventario_lote_recalcula
  after insert or update of qty_in_premium_kg, qty_in_estandar_kg, qty_in_corriente_kg,
    qty_in_corriente_c_kg, qty_in_fairtrade_kg, qty_in_rainforest_kg, qty_in_organico_kg,
    qty_in_pasilla_kg, qty_in_baba_kg, source
  on public.inventory_lots
  for each row execute function public.inventario_tr_lote();

revoke execute on function public.inventario_tr_despacho() from public, anon, authenticated;
revoke execute on function public.inventario_tr_ajuste() from public, anon, authenticated;
revoke execute on function public.inventario_tr_lote() from public, anon, authenticated;

-- ── El sync se niega cuando manda el CRM ───────────────────────────────────
-- (la ruta del cron también lo revisa; esto es la segunda llave)
create or replace function public.inventario_fuente_hoja()
returns trigger language plpgsql set search_path = public as $$
begin
  if (select fuente from public.inventario_config) = 'crm' and new.source = 'sheet' then
    raise exception 'La carga del inventario es desde el CRM: el archivo ya no escribe.';
  end if;
  return new;
end;
$$;
drop trigger if exists inventario_lotes_fuente on public.inventory_lots;
create trigger inventario_lotes_fuente
  before insert or update on public.inventory_lots
  for each row execute function public.inventario_fuente_hoja();
-- El upsert del sync actualiza despachos por source_key aunque el lote ya no
-- sea suyo: también se cierra ahí.
drop trigger if exists inventario_despachos_fuente on public.dispatches;
create trigger inventario_despachos_fuente
  before insert or update on public.dispatches
  for each row execute function public.inventario_fuente_hoja();

-- ── Paso de la hoja al CRM ─────────────────────────────────────────────────
create or replace function public.inventario_pasar_a_crm()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg public.inventario_config%rowtype;
  l public.inventory_lots%rowtype;
  s record;
  antes numeric;
  despues numeric;
  n_lotes int := 0;
  n_aperturas int := 0;
  c text;
  diff numeric;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede pasar la carga al CRM.';
  end if;
  select * into cfg from public.inventario_config for update;
  if cfg.fuente = 'crm' then
    return jsonb_build_object('ya_estaba', true);
  end if;

  select coalesce(sum(qty_available_kg),0) into antes from public.inventory_lots;

  for l in select * from public.inventory_lots where source = 'sheet' loop
    select
      coalesce(sum(qty_premium_kg),0) premium, coalesce(sum(qty_estandar_kg),0) estandar,
      coalesce(sum(qty_corriente_kg),0) corriente, coalesce(sum(qty_corriente_c_kg),0) corriente_c,
      coalesce(sum(qty_fairtrade_kg),0) fairtrade, coalesce(sum(qty_rainforest_kg),0) rainforest,
      coalesce(sum(qty_organico_kg),0) organico, coalesce(sum(qty_pasilla_kg),0) pasilla
    into s from public.dispatches where lote_origen_id = l.id;

    foreach c in array array['premium','estandar','corriente','corriente_c','fairtrade',
                             'rainforest','organico','pasilla'] loop
      diff := case c
        when 'premium' then l.qty_in_premium_kg - s.premium - greatest(l.qty_avail_premium_kg, 0)
        when 'estandar' then l.qty_in_estandar_kg - s.estandar - greatest(l.qty_avail_estandar_kg, 0)
        when 'corriente' then l.qty_in_corriente_kg - s.corriente - greatest(l.qty_avail_corriente_kg, 0)
        when 'corriente_c' then l.qty_in_corriente_c_kg - s.corriente_c - greatest(l.qty_avail_corriente_c_kg, 0)
        when 'fairtrade' then l.qty_in_fairtrade_kg - s.fairtrade - greatest(l.qty_avail_fairtrade_kg, 0)
        when 'rainforest' then l.qty_in_rainforest_kg - s.rainforest - greatest(l.qty_avail_rainforest_kg, 0)
        when 'organico' then l.qty_in_organico_kg - s.organico - greatest(l.qty_avail_organico_kg, 0)
        when 'pasilla' then l.qty_in_pasilla_kg - s.pasilla - greatest(l.qty_avail_pasilla_kg, 0)
      end;
      -- Un disponible negativo en el archivo (ej. merma anotada sobre un lote
      -- que ya salió completo) se abre en 0: el CRM no admite negativos.
      if abs(diff) > 0.0005 then
        insert into public.inventario_ajustes (lot_id, fecha, tipo, clase_origen, kg, nota, created_by)
        values (l.id, (now() at time zone 'America/Bogota')::date, 'apertura', c, diff,
          'Saldo de apertura al pasar la carga al CRM: merma y selección que el archivo no detallaba.',
          auth.uid());
        n_aperturas := n_aperturas + 1;
      end if;
    end loop;

    update public.inventory_lots set source = 'crm' where id = l.id;
    n_lotes := n_lotes + 1;
  end loop;

  update public.dispatches set source = 'hoja' where source = 'sheet';

  select coalesce(sum(qty_available_kg),0) into despues from public.inventory_lots;

  update public.inventario_config
    set fuente = 'crm', cambiado_en = now(), cambiado_por = auth.uid()
    where id;

  return jsonb_build_object('lotes', n_lotes, 'aperturas', n_aperturas,
    'disponible_antes', antes, 'disponible_despues', despues);
end;
$$;
revoke execute on function public.inventario_pasar_a_crm() from public, anon;
grant execute on function public.inventario_pasar_a_crm() to authenticated;
