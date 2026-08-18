-- ============================================================================
--  AROCO · 0054 — Rastro de edición en las cotizaciones
--
--  Ahora una cotización se puede corregir sin borrarla y volverla a subir. Eso
--  abre un riesgo: quien aprueba lee un monto y decide sobre él, y si alguien
--  lo cambió después de que lo leyó, nada en pantalla se lo diría.
--
--  Con `updated_at` la ficha puede mostrar «editada» y cuándo. No impide el
--  cambio —corregir un dígito mal digitado es legítimo— pero deja de ser
--  invisible.
-- ============================================================================

alter table public.compra_cotizaciones
  add column if not exists updated_at timestamptz not null default now();

create trigger compra_cotizaciones_set_updated_at
  before update on public.compra_cotizaciones
  for each row execute function public.set_updated_at();
