/** Opciones de los campos de Proveedores (de la spec del cliente). */

export const PROVEEDOR_ESTADOS = [
  "En estudio",
  "Habilitado",
  "Deshabilitado",
  "Rechazado",
] as const;

export const TIPO_PROVEEDOR = [
  "Productor Individual",
  "Asociación",
  "Cooperativa",
  "Comercializador",
];

export const TIPO_DOCUMENTO = ["CC", "NIT", "CE", "Pasaporte"];

export const PERTENECE_ASOCIACION = [
  "Si, a una asociación",
  "Si, a una cooperativa",
  "No",
];

export const SI_NO = ["Si", "No"];

export const VARIEDAD_CACAO = [
  "Fino de Aroma",
  "CCN-51",
  "Común o Corriente",
  "Otro",
];

export const TIPO_SECADO = [
  "Solar (Marquesina/Gaveta)",
  "Mecánico",
  "En Suelo Directo",
];

export const TIPO_CUENTA = ["Ahorros", "Corriente", "Billetera virtual"];

export const REGIMEN_TRIBUTARIO = [
  "Responsable de IVA",
  "No Responsable de IVA",
];

export const CERTIFICACIONES = [
  "Orgánico (USDA)",
  "Orgánico (EU)",
  "Rainforest Alliance",
  "Fairtrade",
  "Ninguna",
];

export const SELLOS = [
  "Cacao desminado",
  "Frutos de paz",
  "Cacao por coca",
  "Mujer rural",
];

export const LIBRE_DEFORESTACION = [
  "Todo mi cacao proviene de finca(s) donde NO se ha deforestado ni realizado quemas",
  "Todo mi cacao proviene de finca(s) donde SI se ha deforestado y/o realizado quemas",
  "Parte de mi cacao proviene de finca(s) donde SI se ha deforestado y/o realizado quemas",
  "No tengo conocimiento al respecto",
];

export const LIBRE_TRABAJO_INFANTIL = [
  "Todo mi cacao proviene de finca(s) donde SI se respetan los derechos de los menores",
  "Todo mi cacao proviene de finca(s) donde NO se respetan los derechos de los menores",
  "Parte de mi cacao proviene de finca(s) donde NO se respetan los derechos de los menores",
  "No tengo conocimiento al respecto",
];

export const ESTADO_TONE: Record<string, "neutral" | "success" | "warn" | "danger"> = {
  "En estudio": "warn",
  Habilitado: "success",
  Deshabilitado: "neutral",
  Rechazado: "danger",
};
