-- ============================================================================
--  AROCO · 0001 — Extensions & enums
-- ============================================================================

create extension if not exists pgcrypto with schema public;       -- gen_random_uuid()
create extension if not exists pg_trgm with schema public;        -- fuzzy search (command palette / filtros)

-- ── Domain enums ───────────────────────────────────────────────────────────
create type public.department as enum (
  'Dirección', 'Comercial', 'Financiero', 'Administrativo', 'Bodega Central', 'Finca'
);

create type public.user_role as enum ('admin', 'member');

create type public.market as enum ('Nacional', 'Internacional');

create type public.lead_type as enum (
  'Comprador', 'Proveedor potencial', 'Comprador/Broker'
);

create type public.lead_status as enum (
  'Nuevo', 'Cotización', 'Negociación', 'Enviado', 'En espera', 'Cerrado', 'Descartado'
);

create type public.activity_type as enum (
  'Nota', 'Llamada', 'Correo', 'WhatsApp', 'Reunión', 'Cambio de estado'
);

create type public.incoterm as enum ('NACIONAL', 'FOB', 'CIF');

create type public.quote_status as enum ('borrador', 'enviada', 'aceptada', 'rechazada');

create type public.movement_kind as enum ('entrada', 'salida');

create type public.task_status as enum ('pending', 'progress', 'done', 'blocked');

create type public.commission_level as enum ('Senior', 'Junior');

create type public.commission_role as enum ('Compra+Venta', 'Solo Venta', 'Solo Compra');
