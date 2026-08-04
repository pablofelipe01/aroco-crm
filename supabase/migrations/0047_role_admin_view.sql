-- ============================================================================
--  AROCO · 0047 — Tercer nivel de acceso: admin_view
--
--  La reunión definió tres niveles y el sistema solo tenía dos:
--    · admin       → SuperAdmin: acceso total (Álvaro, Ángela, Nicolás, Pablo,
--                    Alejo). Se conserva el nombre para no tocar los ~15 sitios
--                    del código que ya comprueban role = 'admin'.
--    · admin_view  → ve las tareas de todas las áreas pero no administra
--                    usuarios ni configuración (Luis Ernesto).
--    · member      → lo suyo y su rama del organigrama.
--
--  Va SOLO en esta migración: PostgreSQL rechaza usar un valor de enum recién
--  creado dentro de la misma transacción, así que el resto (funciones, RLS y
--  datos) vive en 0048 y en scripts/setup-jerarquia.ts.
-- ============================================================================

alter type public.user_role add value if not exists 'admin_view';
