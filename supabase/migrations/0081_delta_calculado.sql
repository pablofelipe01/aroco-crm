-- ============================================================================
--  AROCO · 0081 — El delta, calculado
--
--  En la revisión del 1-sep-2026 quedó anotado que «las deltas no cargan
--  porque el tablero del bróker no está cargado». Es cierto y era de diseño:
--  Barchart entrega strikes y primas, nunca las griegas, y el delta solo
--  llegaba cuando alguien capturaba la pantalla de StoneX y la subía.
--
--  El tablero real que mandó Vladimir el 3-sep-2026 confirmó que no hace falta
--  esperarlo: con la prima, el strike, el subyacente y el plazo se despeja la
--  volatilidad implícita y de ahí sale el delta. Reproduce los números del
--  bróker con menos de una décima de punto de diferencia cerca del dinero
--  (ver `src/lib/mercado/black76.ts` y sus pruebas).
--
--  POR QUÉ EN COLUMNAS APARTE. Un delta calculado y uno del bróker no son la
--  misma afirmación. El del bróker es lo que dice la contraparte con la que se
--  liquida; el nuestro es una deducción a partir de una prima que puede estar
--  vieja. Mezclarlos en la misma columna haría imposible responder «¿de dónde
--  salió este número?» justo cuando alguien discuta una cobertura. Se guardan
--  al lado, y quien lee elige: manda el del bróker, y si no hay, el calculado
--  con su etiqueta.
-- ============================================================================

alter table public.options_chain
  add column if not exists call_delta_calc numeric(8,4),
  add column if not exists put_delta_calc  numeric(8,4);

comment on column public.options_chain.call_delta is
  'Delta de la call SEGÚN EL BRÓKER (tablero subido como imagen). En por ciento.';
comment on column public.options_chain.call_delta_calc is
  'Delta de la call CALCULADO por AROCO con Black-76 desde la prima. En por ciento.';
comment on column public.options_chain.put_delta is
  'Delta de la put SEGÚN EL BRÓKER (tablero subido como imagen). En por ciento.';
comment on column public.options_chain.put_delta_calc is
  'Delta de la put CALCULADO por AROCO con Black-76 desde la prima. En por ciento.';

-- ── La tasa que entra en el cálculo ─────────────────────────────────────────
--
--  El tablero del 3-sep traía 3,64 % a ocho días y 3,79 % a setenta y uno. A
--  estos plazos la tasa mueve el delta en la tercera cifra —el factor es
--  e^(−rT), que con T = 0,19 y r = 3,8 % vale 0,993— así que una sola cifra
--  configurable alcanza y sobra. Se deja editable porque una tasa fija dentro
--  del código es una tasa que nadie actualiza cuando el mercado se mueve.
insert into public.ajustes_mercado (clave, valor, descripcion)
values (
  'tasa_libre_riesgo',
  0.038,
  'Tasa anual (tanto por uno) para calcular el delta de las opciones cuando el tablero del bróker no la trae. Del tablero de StoneX del 3-sep-2026.'
)
on conflict (clave) do nothing;
