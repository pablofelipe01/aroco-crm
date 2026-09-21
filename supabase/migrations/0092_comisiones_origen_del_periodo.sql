-- ============================================================================
--  AROCO · 0092 — De dónde sale cada liquidación
--
--  La hoja liquida un mes a la vez, así que solo quedaron en el CRM los meses
--  que alguien capturó a tiempo: agosto y septiembre. Abril a julio existen en
--  las operaciones pero nunca se liquidaron aquí.
--
--  Ahora el CRM puede REHACER un mes desde las operaciones, con las reglas que
--  la propia hoja tiene escritas. Pero un número calculado y uno que Nicolás
--  cerró no valen lo mismo cuando se trata de pagarle a alguien, así que cada
--  periodo dice de dónde viene y la pantalla lo marca.
--
--  Precedencia: la hoja manda. Un mes calculado se reemplaza en cuanto llega
--  el de la hoja; al revés, nunca.
-- ============================================================================

alter table public.comision_periodos
  add column if not exists origen text not null default 'hoja';

do $$ begin
  alter table public.comision_periodos
    add constraint comision_periodos_origen_check check (origen in ('hoja', 'crm'));
exception when duplicate_object then null; end $$;

comment on column public.comision_periodos.origen is
  'hoja = lo cerró Nicolás y el CRM lo copió · crm = lo calculó el CRM desde las operaciones.';

alter table public.comision_lineas
  add column if not exists origen text not null default 'hoja';

comment on column public.comision_lineas.origen is
  'De dónde sale la línea. Se copia del periodo al guardar.';
