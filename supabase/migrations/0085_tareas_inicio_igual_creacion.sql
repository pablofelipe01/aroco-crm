-- ============================================================================
--  AROCO · 0085 — La fecha de inicio es la de creación
--
--  En la revisión del 9-sep-2026 Álvaro lo dejó dicho: «la fecha de inicio
--  debe ser igual a la fecha de creación».
--
--  En 0079 las 539 tareas anteriores se dejaron SIN fecha de inicio, con el
--  argumento de que ponerles una que nadie decidió sería inventar el dato. El
--  argumento era bueno y la decisión era de negocio, no mía: ya está tomada.
--  Para AROCO una tarea empieza el día que se registra, así que la fecha de
--  creación ES la de inicio y rellenarla no inventa nada — solo escribe lo que
--  la regla dice.
--
--  El día se toma en hora de BOGOTÁ. Una tarea creada a las siete de la noche
--  es de ese día, aunque `created_at` en UTC ya diga el siguiente; sin la
--  conversión, unas cuantas tareas arrancarían un día después de existir.
-- ============================================================================

update public.tasks
set start_date = (created_at at time zone 'America/Bogota')::date
where start_date is null;

-- Las nuevas ya nacen así: `start_date` tiene `default current_date` desde
-- 0079 y `createTask` omite la clave cuando viene vacía. Esto solo pone al día
-- lo que quedó atrás.

comment on column public.tasks.start_date is
  'Cuándo arranca la tarea. Por regla de negocio (9-sep-2026) es el día en que se creó; se puede cambiar a mano si de verdad arranca otro día.';
