/**
 * Muestra los resúmenes de tareas que saldrían hoy, con los datos reales, sin
 * mandar nada ni tocar el registro (0096). Sirve para revisar el contenido
 * antes de encender los correos.
 *
 *   pnpm tsx --conditions=react-server scripts/vista-previa-resumenes.ts diario|semanal [--completo]
 *
 * Sin --completo imprime solo destinatario y asunto.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const tipo = process.argv[2];
if (tipo !== "diario" && tipo !== "semanal") {
  console.error("Uso: vista-previa-resumenes.ts diario|semanal [--completo]");
  process.exit(1);
}
const completo = process.argv.includes("--completo");

async function main() {
  // Después de cargar el .env: el cliente admin lee las claves al crearse.
  const { enviarResumenes } = await import("../src/lib/correo/enviar-resumenes");
  const r = await enviarResumenes(tipo as "diario" | "semanal", new Date(), { simular: true });
  console.log(`${tipo} · ${r.periodo} · ${r.vistas?.length ?? 0} correos · ${r.sinNada} sin nada que contar`);
  for (const v of r.vistas ?? []) {
    console.log(`\n→ ${v.para}\n  ${v.asunto}`);
    if (completo) console.log(v.texto.replace(/^/gm, "    "));
  }
  if (r.errores.length) console.error("\nErrores:", r.errores);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
