-- ============================================================================
--  AROCO · 0091 — Qué más sabe el extracto de cada contrato abierto
--
--  Hasta ahora `broker_positions` guardaba cantidad, contrato y valor de
--  mercado. Con eso la pantalla solo podía decir «futuros comprados: 1», que
--  no responde ninguna de las preguntas que uno se hace mirando una posición:
--  a cómo entré, cuánto llevo perdiendo o ganando, cuándo vence, a partir de
--  qué precio vuelvo a cero.
--
--  El extracto SÍ trae esas cifras y se estaban tirando. Se guardan tres:
--
--    open_price       a cómo se abrió. Sin esto no hay punto de equilibrio.
--    avg_price        el promedio, cuando la posición se armó en varias veces.
--    last_trade_date  último día de negociación. Es la fecha que nadie miró en
--                     el primer collar y por eso las opciones se convirtieron
--                     en futuros.
--
--  Los precios se guardan YA ESCALADOS. El extracto los trae como «60,3»
--  cuando el contrato cotiza a 6.030, y la escala se comprueba contra el
--  flotante antes de aplicarla (ver `posicion-extracto.ts`). Guardar el número
--  crudo obligaría a repetir esa comprobación en cada consulta y en cada
--  pantalla, y bastaría con que una se olvidara para publicar un precio de
--  cacao con dos ceros de menos.
-- ============================================================================

alter table public.broker_positions
  add column if not exists open_price      numeric(14,4),
  add column if not exists avg_price       numeric(14,4),
  add column if not exists last_trade_date date;

comment on column public.broker_positions.open_price is
  'Precio al que se abrió la posición, en USD/t y ya escalado.';
comment on column public.broker_positions.avg_price is
  'Precio promedio de la posición, cuando se armó en varias operaciones.';
comment on column public.broker_positions.last_trade_date is
  'Último día de negociación del contrato. Lo que no se miró en el primer collar.';
