-- ============================================================================
--  AROCO · 0109 — Leads en pausa
--
--  Revisión del CRM del 2026-10-09: una columna «Leads en pausa» para los
--  prospectos que no están activos pero tampoco descartados. No suman al % de
--  cierre (pesan 0, como Descartado), pero se pueden retomar sin perder la
--  historia. No es «En espera»: esa es la etapa del 80 %, después de Enviado.
--
--  Un lead en pausa tampoco debe disparar «Seguimiento vencido» en la campana.
--  La función de recordatorios se edita sobre su definición viva (0103) en vez
--  de copiarla entera: así no se pisa lo que tenga y solo cambia ese filtro.
-- ============================================================================

alter type public.lead_status add value if not exists 'En pausa' before 'Descartado';

do $$
declare
  d     text := pg_get_functiondef('public.generate_daily_reminders'::regproc);
  viejo text := $q$l.status not in ('Cerrado', 'Descartado')$q$;
  nuevo text := $q$l.status not in ('Cerrado', 'Descartado', 'En pausa')$q$;
  veces int;
begin
  veces := (length(d) - length(replace(d, viejo, ''))) / length(viejo);
  -- Dos filtros: el que limpia avisos resueltos y el que crea los nuevos.
  if veces <> 2 then
    raise exception 'generate_daily_reminders cambió: se esperaban 2 filtros de lead, hay %', veces;
  end if;
  execute replace(d, viejo, nuevo);
end $$;
