-- 0035 — Volumen en toneladas por lead
-- Permite calcular el valor total del lead: toneladas × 1000 × precio (COP/kg),
-- usando el precio Luker (Nacional) o ICE (Internacional). El valor calculado se
-- guarda en potential_value_cop, que ya alimenta el pipeline ponderado.

alter table public.leads
  add column if not exists toneladas numeric(12, 2);
