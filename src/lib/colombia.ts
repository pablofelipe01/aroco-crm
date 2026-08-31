/**
 * Datos de referencia de Colombia para el portal de proveedores.
 *
 * Los municipios NO están: son más de mil y una lista corta obliga a que quien
 * vive en un pueblo pequeño escoja el municipio equivocado, que es peor que
 * dejarlo escribir el suyo. El departamento sí es una lista cerrada porque son
 * treinta y tres y no cambian.
 *
 * Ya existen tablas `departamentos` y `municipios` en la base, pero son OTRA
 * cosa: 16 departamentos y 76 municipios de las zonas cacaoteras, con los
 * códigos internos que AROCO usa en los códigos de lote. Un proveedor de
 * papelería en Bogotá no cabe ahí. Son dos listas con propósitos distintos y
 * unificarlas rompería una de las dos.
 */

export const BANCOS = [
  "Bancolombia",
  "Banco de Bogotá",
  "Davivienda",
  "BBVA",
  "Banco de Occidente",
  "Banco Popular",
  "Banco Caja Social",
  "Banco Agrario",
  "Banco AV Villas",
  "Banco GNB Sudameris",
  "Banco Falabella",
  "Bancoomeva",
  "Banco Pichincha",
  "Banco Serfinanza",
  "Banco W",
  "Banco Finandina",
  "Citibank",
  "Banco Santander",
  "Banco Itaú",
  "Banco Colpatria",
  "Nequi",
  "Daviplata",
  "RappiPay",
  "Movii",
  "Nu Colombia (Nubank)",
  "Coopcentral",
  "Cotrafa",
  "Fondo Nacional del Ahorro (FNA)",
] as const;

export const DEPARTAMENTOS = [
  "Amazonas",
  "Antioquia",
  "Arauca",
  "Atlántico",
  "Bogotá D.C.",
  "Bolívar",
  "Boyacá",
  "Caldas",
  "Caquetá",
  "Casanare",
  "Cauca",
  "Cesar",
  "Chocó",
  "Córdoba",
  "Cundinamarca",
  "Guainía",
  "Guaviare",
  "Huila",
  "La Guajira",
  "Magdalena",
  "Meta",
  "Nariño",
  "Norte de Santander",
  "Putumayo",
  "Quindío",
  "Risaralda",
  "San Andrés y Providencia",
  "Santander",
  "Sucre",
  "Tolima",
  "Valle del Cauca",
  "Vaupés",
  "Vichada",
] as const;

export const TIPOS_CUENTA = ["Ahorros", "Corriente"] as const;

export type Banco = (typeof BANCOS)[number];
export type Departamento = (typeof DEPARTAMENTOS)[number];
