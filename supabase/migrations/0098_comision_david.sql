-- David Bermúdez (Comercial, Zona Norte) entra a la liquidación de comisiones.
--
-- La hoja nombra al comercial por su nombre de pila. Se deja «David» asignado
-- antes de que aparezca: si no, el sync lo daría de alta sin dueño y su línea
-- quedaría en el total sin atribuírsele a nadie hasta corregirlo a mano.
--
-- Es David Bermúdez y no Juan David Alarcón (Bodega Central, no comercial).
-- Si la hoja lo escribe distinto («David B.», «Bermudez»…), el sync dará de
-- alta ese nombre sin asignar y basta con apuntarlo aquí al mismo perfil.
insert into public.comision_comerciales (nombre, profile_id, es_casa)
select 'David', id, false from public.profiles where email = 'david.bermudez@aroco.co'
on conflict (nombre) do update
  set profile_id = excluded.profile_id
  where public.comision_comerciales.profile_id is null;
