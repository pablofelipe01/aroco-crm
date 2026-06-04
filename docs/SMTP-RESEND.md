# Configurar correo de Auth con Resend (SMTP propio)

> **Por qué.** Supabase trae un servidor de correo **solo para desarrollo**, con un
> límite muy bajo (unos pocos correos por hora) y entrega poco confiable. Por eso
> las invitaciones a veces no llegan. Conectando **Resend** como SMTP propio, los
> correos de invitación, recuperación de contraseña y confirmación salen de forma
> confiable desde un dominio de AROCO (`@aroco.co`).
>
> Resend es gratis hasta **3.000 correos/mes** (suficiente de sobra para el equipo).
> Tiempo estimado: **~15 minutos** (+ esperar la propagación de DNS).

---

## Paso 1 — Crear cuenta en Resend

1. Entra a <https://resend.com> → **Sign up** (puedes usar `pablofelipe@me.com` o un correo de AROCO).
2. Confirma tu correo e inicia sesión.

## Paso 2 — Verificar el dominio `aroco.co`

1. En Resend: menú lateral **Domains** → **Add Domain**.
2. Escribe `aroco.co` y elige la región (cualquiera sirve, p. ej. `us-east-1`).
3. Resend mostrará **3 registros DNS** que hay que crear (uno **MX** y dos **TXT**:
   SPF y DKIM). Algo así:

   | Tipo | Nombre / Host            | Valor                                  |
   | ---- | ------------------------ | -------------------------------------- |
   | MX   | `send`                   | `feedback-smtp.us-east-1.amazonses.com` (prio 10) |
   | TXT  | `send`                   | `v=spf1 include:amazonses.com ~all`    |
   | TXT  | `resend._domainkey`      | `p=MIGfMA0...` (clave DKIM larga)      |

   > Los valores exactos los da **tu** panel de Resend — cópialos de ahí, no de
   > esta tabla (es solo ilustrativa).

4. Entra al panel donde administras el DNS de `aroco.co` (GoDaddy, Cloudflare,
   Namecheap, etc.) y **crea esos 3 registros** tal cual.
   - Si el panel pide el nombre sin el dominio, usa solo `send` y
     `resend._domainkey`. Si lo pide completo, usa `send.aroco.co`, etc.
5. Vuelve a Resend y pulsa **Verify**. Puede tardar de minutos a unas horas.
   Cuando los 3 queden en verde (**Verified**), el dominio está listo.

## Paso 3 — Crear la API Key en Resend

1. En Resend: **API Keys** → **Create API Key**.
2. Nombre: `aroco-supabase`. Permiso: **Sending access**. Dominio: `aroco.co`.
3. Copia la clave (`re_...`). **Solo se muestra una vez** — guárdala un momento;
   la pegarás en Supabase en el paso siguiente.

## Paso 4 — Conectar Resend como SMTP en Supabase

1. Entra al proyecto en <https://supabase.com/dashboard> →
   **Authentication** → **Emails** → pestaña **SMTP Settings**
   (en algunos paneles: **Project Settings → Authentication → SMTP**).
2. Activa **Enable Custom SMTP** y llena:

   | Campo             | Valor                                  |
   | ----------------- | -------------------------------------- |
   | Host              | `smtp.resend.com`                      |
   | Port              | `465`                                  |
   | Username          | `resend`                               |
   | Password          | tu API key de Resend (`re_...`)        |
   | Sender email      | `no-reply@aroco.co`                     |
   | Sender name       | `AROCO`                                |

   > El **Sender email** debe ser del dominio verificado (`@aroco.co`); si no,
   > Resend rechaza el envío.

3. **Save**.

## Paso 5 — Subir el límite de envío

Por defecto Supabase limita los correos a un número bajo por hora. Con SMTP propio
puedes subirlo:

1. **Authentication** → **Rate Limits** (o **Project Settings → Auth → Rate Limits**).
2. Sube **"Rate limit for sending emails"** a algo cómodo (p. ej. **30/hora** o más).
3. **Save**.

## Paso 6 — Probar

1. En la app (**Equipo → Invitar**) invita a un correo de prueba tuyo.
2. El correo debe llegar **desde `no-reply@aroco.co`** en segundos.
3. Si no llega: revisa **Resend → Logs** (muestra cada envío y si rebotó) y
   confirma que el dominio sigue **Verified**.

---

## Notas

- **No** hay que tocar código ni variables de entorno de la app: el envío de
  correos de Auth lo maneja Supabase con el SMTP que configures.
- Las **URLs de redirección** ya están bien (`https://aroco-crm.vercel.app/**`
  en Authentication → URL Configuration). No las cambies.
- Mientras el dominio termina de verificarse, para dar acceso inmediato a alguien
  se puede generar un enlace de acceso con la Admin API (`generateLink`) y
  enviárselo manualmente — no depende del correo.
- Personalizar el texto/diseño de los correos: **Authentication → Emails →
  Templates** (Invite, Confirm signup, Reset password).
