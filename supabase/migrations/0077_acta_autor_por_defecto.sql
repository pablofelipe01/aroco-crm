-- ============================================================================
--  AROCO · 0077 — El acta se queda a nombre de quien la crea
--
--  Desde 0076, «quien la subió» puede editar su acta. Eso depende de
--  `meetings.created_by`, que no tenía valor por defecto: lo rellenaba a mano
--  la ruta de subida y nadie más. Cualquier otro camino —un script, una
--  llamada directa a la API, una ruta nueva que se olvide del campo— creaba un
--  acta con autor nulo, y un acta sin autor no la puede editar ni quien
--  acababa de subirla. Sale sin error y sin aviso: el botón simplemente no
--  aparece.
--
--  Mismo arreglo que en `preguntas` (0053). Con `service_role` no hay sesión y
--  `auth.uid()` es NULL, así que las actas del cron de correo siguen sin autor
--  —correcto: nadie las «subió»— y las administra quien asistió.

alter table public.meetings
  alter column created_by set default auth.uid();

comment on column public.meetings.created_by is
  'Quién subió el acta. Junto con can_manage_meeting() decide quién puede editarla (0076).';
