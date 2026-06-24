-- ============================================================================
--  AROCO · 0026 — Campos faltantes del Formato de Vinculación de Proveedores
--  (GPC-F-001) + número de contrato.
-- ============================================================================

alter table public.proveedores
  add column if not exists representante_legal       text,  -- nombre del rep. legal
  add column if not exists documento_representante   text,  -- cédula/doc del rep. legal o persona natural
  add column if not exists tipo_documento_titular    text,  -- tipo doc del titular de la cuenta
  add column if not exists capacidad_comercializacion text, -- comercializadores (Ton/Mes u Año)
  add column if not exists municipios_produccion      text, -- comercializadores
  add column if not exists declara_origen_licito      text, -- SARLAFT (Si/No)
  add column if not exists autoriza_verificacion      text; -- autorización de verificación (Si/No)

alter table public.contratos
  add column if not exists numero_contrato text;            -- código del contrato (CTO-AROCM-xxx)
