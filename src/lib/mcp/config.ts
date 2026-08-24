import { serverEnv } from "@/lib/env";
import type { McpConfig } from "./client";

/**
 * Los tres MCP de AROCO, detrás del túnel de Cloudflare.
 *
 * `inventory` se declara pero el CRM no lo usa: lee esa misma hoja con su
 * propio parser, que resuelve las columnas por encabezado y falla de frente
 * cuando algo no cuadra. Queda aquí solo para diagnóstico.
 */
export const MCPS = {
  get stonex(): McpConfig {
    return {
      url: serverEnv.STONEX_MCP_URL,
      clientId: serverEnv.STONEX_MCP_CF_CLIENT_ID,
      clientSecret: serverEnv.STONEX_MCP_CF_CLIENT_SECRET,
    };
  },
  get barchart(): McpConfig {
    return {
      url: serverEnv.BARCHART_MCP_URL,
      clientId: serverEnv.BARCHART_MCP_CF_CLIENT_ID,
      clientSecret: serverEnv.BARCHART_MCP_CF_CLIENT_SECRET,
    };
  },
  get inventory(): McpConfig {
    return {
      url: serverEnv.INVENTORY_MCP_URL,
      clientId: serverEnv.INVENTORY_MCP_CF_CLIENT_ID,
      clientSecret: serverEnv.INVENTORY_MCP_CF_CLIENT_SECRET,
    };
  },
};

export function mcpConfigurado(cfg: McpConfig): boolean {
  return Boolean(cfg.url);
}
