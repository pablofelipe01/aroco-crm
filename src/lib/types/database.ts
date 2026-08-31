/**
 * Database types for the AROCO Supabase schema.
 *
 * Generated from the live schema (project cmr-a) via
 * `supabase gen types typescript`. Regenerate with `pnpm db:types` after any
 * migration. Convenience aliases (Profile, Lead, Department, …) are appended
 * at the bottom of this file.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      commission_calcs: {
        Row: {
          agent: string | null;
          applied_pct: number | null;
          commission_cop: number | null;
          cost_total_cop: number;
          created_at: string;
          created_by: string | null;
          dispatch_id: string | null;
          gross_utility: number | null;
          id: string;
          level: Database["public"]["Enums"]["commission_level"];
          market: Database["public"]["Enums"]["market"];
          quote_id: string | null;
          role: Database["public"]["Enums"]["commission_role"];
          sale_total_cop: number;
        };
        Insert: {
          agent?: string | null;
          applied_pct?: number | null;
          commission_cop?: number | null;
          cost_total_cop: number;
          created_at?: string;
          created_by?: string | null;
          dispatch_id?: string | null;
          gross_utility?: number | null;
          id?: string;
          level: Database["public"]["Enums"]["commission_level"];
          market: Database["public"]["Enums"]["market"];
          quote_id?: string | null;
          role: Database["public"]["Enums"]["commission_role"];
          sale_total_cop: number;
        };
        Update: {
          agent?: string | null;
          applied_pct?: number | null;
          commission_cop?: number | null;
          cost_total_cop?: number;
          created_at?: string;
          created_by?: string | null;
          dispatch_id?: string | null;
          gross_utility?: number | null;
          id?: string;
          level?: Database["public"]["Enums"]["commission_level"];
          market?: Database["public"]["Enums"]["market"];
          quote_id?: string | null;
          role?: Database["public"]["Enums"]["commission_role"];
          sale_total_cop?: number;
        };
        Relationships: [];
      };
      commission_rules: {
        Row: {
          created_at: string;
          id: string;
          level: Database["public"]["Enums"]["commission_level"];
          market: Database["public"]["Enums"]["market"];
          pct_full: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          level: Database["public"]["Enums"]["commission_level"];
          market: Database["public"]["Enums"]["market"];
          pct_full: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          level?: Database["public"]["Enums"]["commission_level"];
          market?: Database["public"]["Enums"]["market"];
          pct_full?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      compra_cotizaciones: {
        Row: {
          archivo_nombre: string | null;
          archivo_path: string | null;
          created_at: string;
          created_by: string | null;
          descripcion: string | null;
          id: string;
          incluye_iva: boolean;
          moneda: string;
          monto: number;
          nit: string | null;
          notas: string | null;
          proveedor: string;
          solicitud_id: string;
          proveedor_id: string | null;
          updated_at: string;
          tiempo_entrega: string | null;
          valida_hasta: string | null;
        };
        Insert: {
          archivo_nombre?: string | null;
          archivo_path?: string | null;
          created_at?: string;
          created_by?: string | null;
          descripcion?: string | null;
          id?: string;
          incluye_iva?: boolean;
          moneda?: string;
          monto: number;
          nit?: string | null;
          notas?: string | null;
          proveedor: string;
          proveedor_id?: string | null;
          solicitud_id: string;
          updated_at?: string;
          tiempo_entrega?: string | null;
          valida_hasta?: string | null;
        };
        Update: {
          archivo_nombre?: string | null;
          archivo_path?: string | null;
          created_at?: string;
          created_by?: string | null;
          descripcion?: string | null;
          id?: string;
          incluye_iva?: boolean;
          moneda?: string;
          monto?: number;
          nit?: string | null;
          notas?: string | null;
          proveedor?: string;
          solicitud_id?: string;
          proveedor_id?: string | null;
          updated_at?: string;
          tiempo_entrega?: string | null;
          valida_hasta?: string | null;
        };
        Relationships: [];
      };
      ventas: {
        Row: {
          bonificacion: number;
          bultos: number | null;
          cliente: string;
          fecha: string;
          fila: number;
          id: string;
          kg: number;
          mercado: string | null;
          odc: string | null;
          origen: string | null;
          synced_at: string;
          valor_pagar: number;
          valor_total: number;
        };
        Insert: {
          bonificacion?: number;
          bultos?: number | null;
          cliente: string;
          fecha: string;
          fila: number;
          id?: string;
          kg?: number;
          mercado?: string | null;
          odc?: string | null;
          origen?: string | null;
          synced_at?: string;
          valor_pagar?: number;
          valor_total?: number;
        };
        Update: {
          bonificacion?: number;
          bultos?: number | null;
          cliente?: string;
          fecha?: string;
          fila?: number;
          id?: string;
          kg?: number;
          mercado?: string | null;
          odc?: string | null;
          origen?: string | null;
          synced_at?: string;
          valor_pagar?: number;
          valor_total?: number;
        };
        Relationships: [];
      };
      broker_statements: {
        Row: {
          id: string;
          filename: string;
          statement_date: string;
          account: string;
          file_hash: string;
          num_positions: number | null;
          processed_at: string;
        };
        Insert: {
          id?: string;
          filename?: string;
          statement_date?: string;
          account?: string;
          file_hash?: string;
          num_positions?: number | null;
          processed_at?: string;
        };
        Update: {
          id?: string;
          filename?: string;
          statement_date?: string;
          account?: string;
          file_hash?: string;
          num_positions?: number | null;
          processed_at?: string;
        };
        Relationships: [];
      };
      broker_positions: {
        Row: {
          id: string;
          statement_date: string;
          account: string;
          trade_date: string | null;
          card: string | null;
          long_qty: number;
          short_qty: number;
          option_type: string | null;
          contract_month: string | null;
          exchange: string | null;
          strike: number | null;
          settle_price: number | null;
          market_value: number | null;
          dr_cr: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          statement_date?: string;
          account?: string;
          trade_date?: string | null;
          card?: string | null;
          long_qty?: number;
          short_qty?: number;
          option_type?: string | null;
          contract_month?: string | null;
          exchange?: string | null;
          strike?: number | null;
          settle_price?: number | null;
          market_value?: number | null;
          dr_cr?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          statement_date?: string;
          account?: string;
          trade_date?: string | null;
          card?: string | null;
          long_qty?: number;
          short_qty?: number;
          option_type?: string | null;
          contract_month?: string | null;
          exchange?: string | null;
          strike?: number | null;
          settle_price?: number | null;
          market_value?: number | null;
          dr_cr?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      account_balance: {
        Row: {
          id: string;
          statement_date: string;
          account: string;
          beginning_balance: number | null;
          ending_balance: number | null;
          total_equity: number | null;
          long_option_value: number | null;
          short_option_value: number | null;
          net_option_value: number | null;
          net_liquidating_value: number | null;
          prior_net_liquidating_value: number | null;
          market_variance: number | null;
          initial_margin: number | null;
          maintenance_margin: number | null;
          excess_equity: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          statement_date?: string;
          account?: string;
          beginning_balance?: number | null;
          ending_balance?: number | null;
          total_equity?: number | null;
          long_option_value?: number | null;
          short_option_value?: number | null;
          net_option_value?: number | null;
          net_liquidating_value?: number | null;
          prior_net_liquidating_value?: number | null;
          market_variance?: number | null;
          initial_margin?: number | null;
          maintenance_margin?: number | null;
          excess_equity?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          statement_date?: string;
          account?: string;
          beginning_balance?: number | null;
          ending_balance?: number | null;
          total_equity?: number | null;
          long_option_value?: number | null;
          short_option_value?: number | null;
          net_option_value?: number | null;
          net_liquidating_value?: number | null;
          prior_net_liquidating_value?: number | null;
          market_variance?: number | null;
          initial_margin?: number | null;
          maintenance_margin?: number | null;
          excess_equity?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      broker_pnl: {
        Row: {
          id: string;
          statement_date: string;
          account: string;
          realized_pnl_mtd: number | null;
          realized_pnl_ytd: number | null;
          currency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          statement_date?: string;
          account?: string;
          realized_pnl_mtd?: number | null;
          realized_pnl_ytd?: number | null;
          currency?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          statement_date?: string;
          account?: string;
          realized_pnl_mtd?: number | null;
          realized_pnl_ytd?: number | null;
          currency?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      cocoa_report_tables: {
        Row: {
          id: string;
          reporte: string;
          report_date: string;
          pdf_url: string | null;
          matriz: Json;
          synced_at: string;
        };
        Insert: {
          id?: string;
          reporte?: string;
          report_date?: string;
          pdf_url?: string | null;
          matriz?: Json;
          synced_at?: string;
        };
        Update: {
          id?: string;
          reporte?: string;
          report_date?: string;
          pdf_url?: string | null;
          matriz?: Json;
          synced_at?: string;
        };
        Relationships: [];
      };
      cocoa_differentials: {
        Row: {
          id: string;
          report_date: string;
          origen: string;
          grado: string | null;
          valor: number;
          unidad: string;
          fuente: string;
          metodo: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          report_date?: string;
          origen?: string;
          grado?: string | null;
          valor?: number;
          unidad?: string;
          fuente?: string;
          metodo?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          report_date?: string;
          origen?: string;
          grado?: string | null;
          valor?: number;
          unidad?: string;
          fuente?: string;
          metodo?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ajustes_mercado: {
        Row: {
          clave: string;
          valor: number | null;
          texto: string | null;
          descripcion: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          clave?: string;
          valor?: number | null;
          texto?: string | null;
          descripcion?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          clave?: string;
          valor?: number | null;
          texto?: string | null;
          descripcion?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      proveedores_insumos: {
        Row: {
          id: string;
          codigo: string;
          auth_user_id: string | null;
          tipo_persona: Database["public"]["Enums"]["persona_tipo"];
          tipo_documento: Database["public"]["Enums"]["documento_tipo"];
          numero_documento: string;
          nombres: string | null;
          apellidos: string | null;
          razon_social: string | null;
          email: string;
          telefono: string;
          direccion: string | null;
          departamento: string | null;
          municipio: string | null;
          categorias: Database["public"]["Enums"]["compra_categoria"][];
          descripcion: string | null;
          banco: string | null;
          tipo_cuenta: string | null;
          numero_cuenta: string | null;
          titular_cuenta: string | null;
          documento_titular: string | null;
          estado: Database["public"]["Enums"]["proveedor_insumo_estado"];
          motivo_rechazo: string | null;
          verificado_por: string | null;
          verificado_en: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          codigo?: string;
          auth_user_id?: string | null;
          tipo_persona?: Database["public"]["Enums"]["persona_tipo"];
          tipo_documento?: Database["public"]["Enums"]["documento_tipo"];
          numero_documento?: string;
          nombres?: string | null;
          apellidos?: string | null;
          razon_social?: string | null;
          email?: string;
          telefono?: string;
          direccion?: string | null;
          departamento?: string | null;
          municipio?: string | null;
          categorias?: Database["public"]["Enums"]["compra_categoria"][];
          descripcion?: string | null;
          banco?: string | null;
          tipo_cuenta?: string | null;
          numero_cuenta?: string | null;
          titular_cuenta?: string | null;
          documento_titular?: string | null;
          estado?: Database["public"]["Enums"]["proveedor_insumo_estado"];
          motivo_rechazo?: string | null;
          verificado_por?: string | null;
          verificado_en?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          codigo?: string;
          auth_user_id?: string | null;
          tipo_persona?: Database["public"]["Enums"]["persona_tipo"];
          tipo_documento?: Database["public"]["Enums"]["documento_tipo"];
          numero_documento?: string;
          nombres?: string | null;
          apellidos?: string | null;
          razon_social?: string | null;
          email?: string;
          telefono?: string;
          direccion?: string | null;
          departamento?: string | null;
          municipio?: string | null;
          categorias?: Database["public"]["Enums"]["compra_categoria"][];
          descripcion?: string | null;
          banco?: string | null;
          tipo_cuenta?: string | null;
          numero_cuenta?: string | null;
          titular_cuenta?: string | null;
          documento_titular?: string | null;
          estado?: Database["public"]["Enums"]["proveedor_insumo_estado"];
          motivo_rechazo?: string | null;
          verificado_por?: string | null;
          verificado_en?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      proveedor_insumo_documentos: {
        Row: {
          id: string;
          proveedor_id: string;
          tipo: Database["public"]["Enums"]["documento_proveedor_tipo"];
          archivo_path: string;
          archivo_nombre: string | null;
          vence_el: string | null;
          subido_en: string;
        };
        Insert: {
          id?: string;
          proveedor_id?: string;
          tipo?: Database["public"]["Enums"]["documento_proveedor_tipo"];
          archivo_path?: string;
          archivo_nombre?: string | null;
          vence_el?: string | null;
          subido_en?: string;
        };
        Update: {
          id?: string;
          proveedor_id?: string;
          tipo?: Database["public"]["Enums"]["documento_proveedor_tipo"];
          archivo_path?: string;
          archivo_nombre?: string | null;
          vence_el?: string | null;
          subido_en?: string;
        };
        Relationships: [];
      };
      cuentas_cobro: {
        Row: {
          id: string;
          consecutivo: string;
          proveedor_id: string;
          solicitud_id: string | null;
          fecha: string;
          concepto: string | null;
          estado: Database["public"]["Enums"]["cuenta_cobro_estado"];
          motivo_rechazo: string | null;
          decidida_por: string | null;
          decidida_en: string | null;
          pagada_en: string | null;
          pago_referencia: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          consecutivo?: string;
          proveedor_id?: string;
          solicitud_id?: string | null;
          fecha?: string;
          concepto?: string | null;
          estado?: Database["public"]["Enums"]["cuenta_cobro_estado"];
          motivo_rechazo?: string | null;
          decidida_por?: string | null;
          decidida_en?: string | null;
          pagada_en?: string | null;
          pago_referencia?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          consecutivo?: string;
          proveedor_id?: string;
          solicitud_id?: string | null;
          fecha?: string;
          concepto?: string | null;
          estado?: Database["public"]["Enums"]["cuenta_cobro_estado"];
          motivo_rechazo?: string | null;
          decidida_por?: string | null;
          decidida_en?: string | null;
          pagada_en?: string | null;
          pago_referencia?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cuenta_cobro_items: {
        Row: {
          id: string;
          cuenta_id: string;
          orden: number;
          descripcion: string;
          cantidad: number;
          valor_unitario: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          cuenta_id?: string;
          orden?: number;
          descripcion?: string;
          cantidad?: number;
          valor_unitario?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          cuenta_id?: string;
          orden?: number;
          descripcion?: string;
          cantidad?: number;
          valor_unitario?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      market_intel: {
        Row: {
          id: string;
          article_id: string;
          title: string;
          abstract: string | null;
          resumen: string | null;
          author: string | null;
          market_name: string | null;
          url: string | null;
          texto: string | null;
          published_at: string;
          synced_at: string;
        };
        Insert: {
          id?: string;
          article_id?: string;
          title?: string;
          abstract?: string | null;
          resumen?: string | null;
          author?: string | null;
          market_name?: string | null;
          url?: string | null;
          texto?: string | null;
          published_at?: string;
          synced_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string;
          title?: string;
          abstract?: string | null;
          resumen?: string | null;
          author?: string | null;
          market_name?: string | null;
          url?: string | null;
          texto?: string | null;
          published_at?: string;
          synced_at?: string;
        };
        Relationships: [];
      };
      market_data: {
        Row: {
          id: string;
          date: string;
          ticker: string;
          close_price: number | null;
          open_price: number | null;
          high: number | null;
          low: number | null;
          volume: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date?: string;
          ticker?: string;
          close_price?: number | null;
          open_price?: number | null;
          high?: number | null;
          low?: number | null;
          volume?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          ticker?: string;
          close_price?: number | null;
          open_price?: number | null;
          high?: number | null;
          low?: number | null;
          volume?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      trm_data: {
        Row: {
          id: string;
          date: string;
          trm: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          date?: string;
          trm?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          trm?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      options_board: {
        Row: {
          id: string;
          date: string;
          contract_month: string;
          underlying_price: number | null;
          dte: number | null;
          expiration: string | null;
          volatility_calls: number | null;
          volatility_puts: number | null;
          interest_rate: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date?: string;
          contract_month?: string;
          underlying_price?: number | null;
          dte?: number | null;
          expiration?: string | null;
          volatility_calls?: number | null;
          volatility_puts?: number | null;
          interest_rate?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          contract_month?: string;
          underlying_price?: number | null;
          dte?: number | null;
          expiration?: string | null;
          volatility_calls?: number | null;
          volatility_puts?: number | null;
          interest_rate?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      options_chain: {
        Row: {
          id: string;
          board_id: string;
          strike: number;
          call_premium: number | null;
          call_delta: number | null;
          put_premium: number | null;
          put_delta: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          board_id?: string;
          strike?: number;
          call_premium?: number | null;
          call_delta?: number | null;
          put_premium?: number | null;
          put_delta?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          board_id?: string;
          strike?: number;
          call_premium?: number | null;
          call_delta?: number | null;
          put_premium?: number | null;
          put_delta?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      risk_snapshots: {
        Row: {
          id: string;
          date: string;
          total_physical_tonnes: number | null;
          covered_tonnes: number | null;
          coverage_pct: number | null;
          cacao_price_usd: number | null;
          trm: number | null;
          net_liquidating_value: number | null;
          unrealized_pnl_physical: number | null;
          unrealized_pnl_hedge: number | null;
          collar_floor: number | null;
          collar_cap: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          date?: string;
          total_physical_tonnes?: number | null;
          covered_tonnes?: number | null;
          coverage_pct?: number | null;
          cacao_price_usd?: number | null;
          trm?: number | null;
          net_liquidating_value?: number | null;
          unrealized_pnl_physical?: number | null;
          unrealized_pnl_hedge?: number | null;
          collar_floor?: number | null;
          collar_cap?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          total_physical_tonnes?: number | null;
          covered_tonnes?: number | null;
          coverage_pct?: number | null;
          cacao_price_usd?: number | null;
          trm?: number | null;
          net_liquidating_value?: number | null;
          unrealized_pnl_physical?: number | null;
          unrealized_pnl_hedge?: number | null;
          collar_floor?: number | null;
          collar_cap?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      preguntas: {
        Row: {
          area: Database["public"]["Enums"]["department"] | null;
          bloquea: string | null;
          contexto: string | null;
          created_at: string;
          created_by: string | null;
          estado: Database["public"]["Enums"]["pregunta_estado"];
          id: string;
          meeting_id: string | null;
          para_quien: string | null;
          pregunta: string;
          prioridad: Database["public"]["Enums"]["pregunta_prioridad"];
          respondida_en: string | null;
          respondida_por: string | null;
          respuesta: string | null;
          updated_at: string;
        };
        Insert: {
          area?: Database["public"]["Enums"]["department"] | null;
          bloquea?: string | null;
          contexto?: string | null;
          created_at?: string;
          created_by?: string | null;
          estado?: Database["public"]["Enums"]["pregunta_estado"];
          id?: string;
          meeting_id?: string | null;
          para_quien?: string | null;
          pregunta: string;
          prioridad?: Database["public"]["Enums"]["pregunta_prioridad"];
          respondida_en?: string | null;
          respondida_por?: string | null;
          respuesta?: string | null;
          updated_at?: string;
        };
        Update: {
          area?: Database["public"]["Enums"]["department"] | null;
          bloquea?: string | null;
          contexto?: string | null;
          created_at?: string;
          created_by?: string | null;
          estado?: Database["public"]["Enums"]["pregunta_estado"];
          id?: string;
          meeting_id?: string | null;
          para_quien?: string | null;
          pregunta?: string;
          prioridad?: Database["public"]["Enums"]["pregunta_prioridad"];
          respondida_en?: string | null;
          respondida_por?: string | null;
          respuesta?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      compra_solicitudes: {
        Row: {
          aprobada_en: string | null;
          aprobada_por: string | null;
          area: Database["public"]["Enums"]["department"] | null;
          categoria: Database["public"]["Enums"]["compra_categoria"];
          consecutivo: string;
          cotizacion_elegida_id: string | null;
          created_at: string;
          created_by: string | null;
          descripcion: string | null;
          entrega_notas: string | null;
          estado: Database["public"]["Enums"]["compra_estado"];
          id: string;
          justificacion: string | null;
          motivo_rechazo: string | null;
          pagada_en: string | null;
          pagada_por: string | null;
          pago_medio: string | null;
          pago_referencia: string | null;
          recibida_en: string | null;
          recibida_por: string | null;
          titulo: string;
          updated_at: string;
        };
        Insert: {
          aprobada_en?: string | null;
          aprobada_por?: string | null;
          area?: Database["public"]["Enums"]["department"] | null;
          categoria?: Database["public"]["Enums"]["compra_categoria"];
          consecutivo?: string;
          cotizacion_elegida_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          descripcion?: string | null;
          entrega_notas?: string | null;
          estado?: Database["public"]["Enums"]["compra_estado"];
          id?: string;
          justificacion?: string | null;
          motivo_rechazo?: string | null;
          pagada_en?: string | null;
          pagada_por?: string | null;
          pago_medio?: string | null;
          pago_referencia?: string | null;
          recibida_en?: string | null;
          recibida_por?: string | null;
          titulo: string;
          updated_at?: string;
        };
        Update: {
          aprobada_en?: string | null;
          aprobada_por?: string | null;
          area?: Database["public"]["Enums"]["department"] | null;
          categoria?: Database["public"]["Enums"]["compra_categoria"];
          consecutivo?: string;
          cotizacion_elegida_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          descripcion?: string | null;
          entrega_notas?: string | null;
          estado?: Database["public"]["Enums"]["compra_estado"];
          id?: string;
          justificacion?: string | null;
          motivo_rechazo?: string | null;
          pagada_en?: string | null;
          pagada_por?: string | null;
          pago_medio?: string | null;
          pago_referencia?: string | null;
          recibida_en?: string | null;
          recibida_por?: string | null;
          titulo?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      dispatches: {
        Row: {
          bultos: number | null;
          created_at: string;
          created_by: string | null;
          destination: string | null;
          dispatch_date: string | null;
          id: string;
          lead_id: string | null;
          lot_id: string | null;
          needs_review: boolean;
          oc: string | null;
          origin: string | null;
          purchase_price_cop_kg: number | null;
          qty_corriente_c_kg: number;
          qty_corriente_kg: number;
          qty_kg: number;
          qty_organico_kg: number;
          qty_premium_kg: number;
          remision_entrada: string | null;
          remision_salida: string | null;
          source: string | null;
          source_key: string | null;
          total_salida_kg: number | null;
          updated_at: string;
        };
        Insert: {
          bultos?: number | null;
          created_at?: string;
          created_by?: string | null;
          destination?: string | null;
          dispatch_date?: string | null;
          id?: string;
          lead_id?: string | null;
          lot_id?: string | null;
          needs_review?: boolean;
          oc?: string | null;
          origin?: string | null;
          purchase_price_cop_kg?: number | null;
          qty_corriente_c_kg?: number;
          qty_corriente_kg?: number;
          qty_kg: number;
          qty_organico_kg?: number;
          qty_premium_kg?: number;
          remision_entrada?: string | null;
          remision_salida?: string | null;
          source?: string | null;
          source_key?: string | null;
          total_salida_kg?: number | null;
          updated_at?: string;
        };
        Update: {
          bultos?: number | null;
          created_at?: string;
          created_by?: string | null;
          destination?: string | null;
          dispatch_date?: string | null;
          id?: string;
          lead_id?: string | null;
          lot_id?: string | null;
          needs_review?: boolean;
          oc?: string | null;
          origin?: string | null;
          purchase_price_cop_kg?: number | null;
          qty_corriente_c_kg?: number;
          qty_corriente_kg?: number;
          qty_kg?: number;
          qty_organico_kg?: number;
          qty_premium_kg?: number;
          remision_entrada?: string | null;
          remision_salida?: string | null;
          source?: string | null;
          source_key?: string | null;
          total_salida_kg?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_lots: {
        Row: {
          bultos_in: number;
          bultos_out: number;
          bultos_total: number;
          cadmio: string | null;
          code: string;
          created_at: string;
          entry_date: string | null;
          id: string;
          indice_grano_100g: number | null;
          merma_kg: number;
          merma_pct: number | null;
          needs_review: boolean;
          notes: string | null;
          odc: string | null;
          origin: string | null;
          pasilla_kg: number;
          pasilla_pct: number | null;
          pct_bien_fermentado: number | null;
          pct_fermentacion_total: number | null;
          pct_hongos: number | null;
          pct_humedad: number | null;
          pct_parcialmente_fermentado: number | null;
          pct_pizarroso: number | null;
          pct_purpura: number | null;
          pct_sobre_fermentado: number | null;
          purchase_price_cop_kg: number | null;
          qty_avail_corriente_c_kg: number;
          qty_avail_corriente_kg: number;
          qty_avail_organico_kg: number;
          qty_avail_premium_kg: number;
          qty_available_kg: number;
          qty_in_corriente_c_kg: number;
          qty_in_corriente_kg: number;
          qty_in_kg: number;
          qty_in_organico_kg: number;
          qty_in_premium_kg: number;
          qty_out_kg: number;
          qty_requested_kg: number | null;
          quality: string | null;
          recepcion: string | null;
          remision: string | null;
          samples_pasilla_merma_kg: number;
          source: string;
          updated_at: string;
        };
        Insert: {
          bultos_in?: number;
          bultos_out?: number;
          bultos_total?: number;
          cadmio?: string | null;
          code: string;
          created_at?: string;
          entry_date?: string | null;
          id?: string;
          indice_grano_100g?: number | null;
          merma_kg?: number;
          merma_pct?: number | null;
          needs_review?: boolean;
          notes?: string | null;
          odc?: string | null;
          origin?: string | null;
          pasilla_kg?: number;
          pasilla_pct?: number | null;
          pct_bien_fermentado?: number | null;
          pct_fermentacion_total?: number | null;
          pct_hongos?: number | null;
          pct_humedad?: number | null;
          pct_parcialmente_fermentado?: number | null;
          pct_pizarroso?: number | null;
          pct_purpura?: number | null;
          pct_sobre_fermentado?: number | null;
          purchase_price_cop_kg?: number | null;
          qty_avail_corriente_c_kg?: number;
          qty_avail_corriente_kg?: number;
          qty_avail_organico_kg?: number;
          qty_avail_premium_kg?: number;
          qty_available_kg?: number;
          qty_in_corriente_c_kg?: number;
          qty_in_corriente_kg?: number;
          qty_in_kg?: number;
          qty_in_organico_kg?: number;
          qty_in_premium_kg?: number;
          qty_out_kg?: number;
          qty_requested_kg?: number | null;
          quality?: string | null;
          recepcion?: string | null;
          remision?: string | null;
          samples_pasilla_merma_kg?: number;
          source?: string;
          updated_at?: string;
        };
        Update: {
          bultos_in?: number;
          bultos_out?: number;
          bultos_total?: number;
          cadmio?: string | null;
          code?: string;
          created_at?: string;
          entry_date?: string | null;
          id?: string;
          indice_grano_100g?: number | null;
          merma_kg?: number;
          merma_pct?: number | null;
          needs_review?: boolean;
          notes?: string | null;
          odc?: string | null;
          origin?: string | null;
          pasilla_kg?: number;
          pasilla_pct?: number | null;
          pct_bien_fermentado?: number | null;
          pct_fermentacion_total?: number | null;
          pct_hongos?: number | null;
          pct_humedad?: number | null;
          pct_parcialmente_fermentado?: number | null;
          pct_pizarroso?: number | null;
          pct_purpura?: number | null;
          pct_sobre_fermentado?: number | null;
          purchase_price_cop_kg?: number | null;
          qty_avail_corriente_c_kg?: number;
          qty_avail_corriente_kg?: number;
          qty_avail_organico_kg?: number;
          qty_avail_premium_kg?: number;
          qty_available_kg?: number;
          qty_in_corriente_c_kg?: number;
          qty_in_corriente_kg?: number;
          qty_in_kg?: number;
          qty_in_organico_kg?: number;
          qty_in_premium_kg?: number;
          qty_out_kg?: number;
          qty_requested_kg?: number | null;
          quality?: string | null;
          recepcion?: string | null;
          remision?: string | null;
          samples_pasilla_merma_kg?: number;
          source?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_movements: {
        Row: {
          company: string | null;
          created_at: string;
          created_by: string | null;
          date: string;
          id: string;
          kind: Database["public"]["Enums"]["movement_kind"];
          lot_id: string;
          notes: string | null;
          qty_kg: number;
          remision: string | null;
        };
        Insert: {
          company?: string | null;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          kind: Database["public"]["Enums"]["movement_kind"];
          lot_id: string;
          notes?: string | null;
          qty_kg: number;
          remision?: string | null;
        };
        Update: {
          company?: string | null;
          created_at?: string;
          created_by?: string | null;
          date?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["movement_kind"];
          lot_id?: string;
          notes?: string | null;
          qty_kg?: number;
          remision?: string | null;
        };
        Relationships: [];
      };
      inventory_sync_runs: {
        Row: {
          dispatches_upserted: number;
          duration_ms: number | null;
          error: string | null;
          id: string;
          lots_upserted: number;
          ran_at: string;
          rows_read: number;
          source: string;
          status: string;
        };
        Insert: {
          dispatches_upserted?: number;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          lots_upserted?: number;
          ran_at?: string;
          rows_read?: number;
          source?: string;
          status: string;
        };
        Update: {
          dispatches_upserted?: number;
          duration_ms?: number | null;
          error?: string | null;
          id?: string;
          lots_upserted?: number;
          ran_at?: string;
          rows_read?: number;
          source?: string;
          status?: string;
        };
        Relationships: [];
      };
      inventory_quality: {
        Row: {
          cadmio: string | null;
          en_bodega_kg: number;
          entry_date: string | null;
          id: string;
          licor_kg: number;
          oc: string | null;
          por_llegar_kg: number;
          position: number;
          procedencia: string;
          purchase_price_cop_kg: number | null;
          qty_b_kg: number;
          qty_c_kg: number;
          qty_organico_kg: number;
          qty_premium_kg: number;
          source: string;
          synced_at: string;
          tolimax_kg: number;
        };
        Insert: {
          cadmio?: string | null;
          en_bodega_kg?: number;
          entry_date?: string | null;
          id?: string;
          licor_kg?: number;
          oc?: string | null;
          por_llegar_kg?: number;
          position?: number;
          procedencia: string;
          purchase_price_cop_kg?: number | null;
          qty_b_kg?: number;
          qty_c_kg?: number;
          qty_organico_kg?: number;
          qty_premium_kg?: number;
          source?: string;
          synced_at?: string;
          tolimax_kg?: number;
        };
        Update: {
          cadmio?: string | null;
          en_bodega_kg?: number;
          entry_date?: string | null;
          id?: string;
          licor_kg?: number;
          oc?: string | null;
          por_llegar_kg?: number;
          position?: number;
          procedencia?: string;
          purchase_price_cop_kg?: number | null;
          qty_b_kg?: number;
          qty_c_kg?: number;
          qty_organico_kg?: number;
          qty_premium_kg?: number;
          source?: string;
          synced_at?: string;
          tolimax_kg?: number;
        };
        Relationships: [];
      };
      lead_activities: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string;
          id: string;
          lead_id: string;
          type: Database["public"]["Enums"]["activity_type"];
          user_name: string | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description: string;
          id?: string;
          lead_id: string;
          type?: Database["public"]["Enums"]["activity_type"];
          user_name?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string;
          id?: string;
          lead_id?: string;
          type?: Database["public"]["Enums"]["activity_type"];
          user_name?: string | null;
        };
        Relationships: [];
      };
      leads: {
        Row: {
          city: string | null;
          commercial_owner: string | null;
          company: string;
          contact_email: string | null;
          contact_name: string | null;
          contact_phone: string | null;
          country: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          market: Database["public"]["Enums"]["market"] | null;
          next_action: string | null;
          next_action_date: string | null;
          notes: string | null;
          potential_value_cop: number | null;
          product_interest: string | null;
          source: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          toneladas: number | null;
          type: Database["public"]["Enums"]["lead_type"] | null;
          updated_at: string;
          volume: string | null;
        };
        Insert: {
          city?: string | null;
          commercial_owner?: string | null;
          company: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          market?: Database["public"]["Enums"]["market"] | null;
          next_action?: string | null;
          next_action_date?: string | null;
          notes?: string | null;
          potential_value_cop?: number | null;
          product_interest?: string | null;
          source?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          toneladas?: number | null;
          type?: Database["public"]["Enums"]["lead_type"] | null;
          updated_at?: string;
          volume?: string | null;
        };
        Update: {
          city?: string | null;
          commercial_owner?: string | null;
          company?: string;
          contact_email?: string | null;
          contact_name?: string | null;
          contact_phone?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          market?: Database["public"]["Enums"]["market"] | null;
          next_action?: string | null;
          next_action_date?: string | null;
          notes?: string | null;
          potential_value_cop?: number | null;
          product_interest?: string | null;
          source?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          toneladas?: number | null;
          type?: Database["public"]["Enums"]["lead_type"] | null;
          updated_at?: string;
          volume?: string | null;
        };
        Relationships: [];
      };
      monthly_tonnage: {
        Row: {
          agent: string;
          created_at: string;
          created_by: string | null;
          id: string;
          market: Database["public"]["Enums"]["market"];
          note: string | null;
          period: string;
          role: Database["public"]["Enums"]["commission_role"];
          tons: number;
          updated_at: string;
        };
        Insert: {
          agent: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          market: Database["public"]["Enums"]["market"];
          note?: string | null;
          period: string;
          role?: Database["public"]["Enums"]["commission_role"];
          tons?: number;
          updated_at?: string;
        };
        Update: {
          agent?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          market?: Database["public"]["Enums"]["market"];
          note?: string | null;
          period?: string;
          role?: Database["public"]["Enums"]["commission_role"];
          tons?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      proceso_casos: {
        Row: {
          created_at: string;
          created_by: string | null;
          estado: Database["public"]["Enums"]["proceso_estado"];
          fase_actual: number;
          id: string;
          origen: string | null;
          proceso_key: string;
          proveedor_ref: string | null;
          tipo: Database["public"]["Enums"]["proceso_tipo"];
          titulo: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          estado?: Database["public"]["Enums"]["proceso_estado"];
          fase_actual?: number;
          id?: string;
          origen?: string | null;
          proceso_key?: string;
          proveedor_ref?: string | null;
          tipo: Database["public"]["Enums"]["proceso_tipo"];
          titulo: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          estado?: Database["public"]["Enums"]["proceso_estado"];
          fase_actual?: number;
          id?: string;
          origen?: string | null;
          proceso_key?: string;
          proveedor_ref?: string | null;
          tipo?: Database["public"]["Enums"]["proceso_tipo"];
          titulo?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      proceso_pasos: {
        Row: {
          asignado_a: string | null;
          caso_id: string;
          completado_el: string | null;
          completado_por: string | null;
          created_at: string;
          es_automatico: boolean;
          es_rama: boolean;
          estado: Database["public"]["Enums"]["paso_estado"];
          fase_nombre: string;
          fase_numero: number;
          fecha_limite: string | null;
          id: string;
          notas: string | null;
          numero: string;
          orden: number;
          rol: string;
          titulo: string;
          updated_at: string;
        };
        Insert: {
          asignado_a?: string | null;
          caso_id: string;
          completado_el?: string | null;
          completado_por?: string | null;
          created_at?: string;
          es_automatico?: boolean;
          es_rama?: boolean;
          estado?: Database["public"]["Enums"]["paso_estado"];
          fase_nombre: string;
          fase_numero: number;
          fecha_limite?: string | null;
          id?: string;
          notas?: string | null;
          numero: string;
          orden?: number;
          rol: string;
          titulo: string;
          updated_at?: string;
        };
        Update: {
          asignado_a?: string | null;
          caso_id?: string;
          completado_el?: string | null;
          completado_por?: string | null;
          created_at?: string;
          es_automatico?: boolean;
          es_rama?: boolean;
          estado?: Database["public"]["Enums"]["paso_estado"];
          fase_nombre?: string;
          fase_numero?: number;
          fecha_limite?: string | null;
          id?: string;
          notas?: string | null;
          numero?: string;
          orden?: number;
          rol?: string;
          titulo?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      proceso_decisiones: {
        Row: {
          caso_id: string;
          clave: string;
          created_at: string;
          elegida: string | null;
          fase_numero: number;
          id: string;
          opciones: Json;
          orden: number;
          pregunta: string;
          rol: string;
          updated_at: string;
        };
        Insert: {
          caso_id: string;
          clave: string;
          created_at?: string;
          elegida?: string | null;
          fase_numero: number;
          id?: string;
          opciones: Json;
          orden?: number;
          pregunta: string;
          rol: string;
          updated_at?: string;
        };
        Update: {
          caso_id?: string;
          clave?: string;
          created_at?: string;
          elegida?: string | null;
          fase_numero?: number;
          id?: string;
          opciones?: Json;
          orden?: number;
          pregunta?: string;
          rol?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      proceso_eventos: {
        Row: {
          actor: string | null;
          caso_id: string;
          created_at: string;
          descripcion: string;
          id: string;
          paso_numero: string | null;
        };
        Insert: {
          actor?: string | null;
          caso_id: string;
          created_at?: string;
          descripcion: string;
          id?: string;
          paso_numero?: string | null;
        };
        Update: {
          actor?: string | null;
          caso_id?: string;
          created_at?: string;
          descripcion?: string;
          id?: string;
          paso_numero?: string | null;
        };
        Relationships: [];
      };
      proceso_revisiones: {
        Row: {
          caso_id: string;
          created_at: string;
          fecha: string;
          id: string;
          metas: string | null;
          notas: string | null;
        };
        Insert: {
          caso_id: string;
          created_at?: string;
          fecha: string;
          id?: string;
          metas?: string | null;
          notas?: string | null;
        };
        Update: {
          caso_id?: string;
          created_at?: string;
          fecha?: string;
          id?: string;
          metas?: string | null;
          notas?: string | null;
        };
        Relationships: [];
      };
      contratos: {
        Row: {
          bonificaciones_calidad: string | null;
          created_at: string;
          created_by: string | null;
          estado: string;
          fermentacion_minima: number | null;
          forma_pago: string | null;
          garantia: string | null;
          granos_enteros_minimo: number | null;
          humedad_maxima: number | null;
          id: string;
          libre_olores: string | null;
          lugar_entrega: string | null;
          numero_contrato: string | null;
          novedades_aroco: string | null;
          novedades_proveedor: string | null;
          proveedor_id: string;
          sanciones_calidad: string | null;
          updated_at: string;
        };
        Insert: {
          bonificaciones_calidad?: string | null;
          created_at?: string;
          created_by?: string | null;
          estado?: string;
          fermentacion_minima?: number | null;
          forma_pago?: string | null;
          garantia?: string | null;
          granos_enteros_minimo?: number | null;
          humedad_maxima?: number | null;
          id?: string;
          libre_olores?: string | null;
          lugar_entrega?: string | null;
          numero_contrato?: string | null;
          novedades_aroco?: string | null;
          novedades_proveedor?: string | null;
          proveedor_id: string;
          sanciones_calidad?: string | null;
          updated_at?: string;
        };
        Update: {
          bonificaciones_calidad?: string | null;
          created_at?: string;
          created_by?: string | null;
          estado?: string;
          fermentacion_minima?: number | null;
          forma_pago?: string | null;
          garantia?: string | null;
          granos_enteros_minimo?: number | null;
          humedad_maxima?: number | null;
          id?: string;
          libre_olores?: string | null;
          lugar_entrega?: string | null;
          numero_contrato?: string | null;
          novedades_aroco?: string | null;
          novedades_proveedor?: string | null;
          proveedor_id?: string;
          sanciones_calidad?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      liquidaciones: {
        Row: {
          id: string;
          recepcion_id: string;
          orden_id: string;
          estado: Database["public"]["Enums"]["liquidacion_estado"];
          tipo_pago: Database["public"]["Enums"]["liquidacion_pago"];
          peso_recibido_kg: number | null;
          precio_kg: number | null;
          humedad_pct: number | null;
          fermentacion_pct: number | null;
          impurezas_pct: number | null;
          params: Json;
          valor_base: number;
          total_sanciones: number;
          total_bonificaciones: number;
          valor_total: number;
          desglose: Json | null;
          observaciones: string | null;
          aprobada_por: string | null;
          aprobada_en: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          recepcion_id: string;
          orden_id: string;
          estado?: Database["public"]["Enums"]["liquidacion_estado"];
          tipo_pago?: Database["public"]["Enums"]["liquidacion_pago"];
          peso_recibido_kg?: number | null;
          precio_kg?: number | null;
          humedad_pct?: number | null;
          fermentacion_pct?: number | null;
          impurezas_pct?: number | null;
          params?: Json;
          valor_base?: number;
          total_sanciones?: number;
          total_bonificaciones?: number;
          valor_total?: number;
          desglose?: Json | null;
          observaciones?: string | null;
          aprobada_por?: string | null;
          aprobada_en?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          recepcion_id?: string;
          orden_id?: string;
          estado?: Database["public"]["Enums"]["liquidacion_estado"];
          tipo_pago?: Database["public"]["Enums"]["liquidacion_pago"];
          peso_recibido_kg?: number | null;
          precio_kg?: number | null;
          humedad_pct?: number | null;
          fermentacion_pct?: number | null;
          impurezas_pct?: number | null;
          params?: Json;
          valor_base?: number;
          total_sanciones?: number;
          total_bonificaciones?: number;
          valor_total?: number;
          desglose?: Json | null;
          observaciones?: string | null;
          aprobada_por?: string | null;
          aprobada_en?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recepciones: {
        Row: {
          id: string;
          orden_id: string;
          estado: Database["public"]["Enums"]["recepcion_estado"];
          tipo_envio: Database["public"]["Enums"]["recepcion_envio"] | null;
          peso_solicitado_kg: number | null;
          peso_recibido_kg: number | null;
          humedad_pct: number | null;
          fermentacion_pct: number | null;
          impurezas_pct: number | null;
          analisis_sensorial: string | null;
          remisiones: string | null;
          observaciones: string | null;
          recibido_por: string | null;
          cerrada_en: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          orden_id: string;
          estado?: Database["public"]["Enums"]["recepcion_estado"];
          tipo_envio?: Database["public"]["Enums"]["recepcion_envio"] | null;
          peso_solicitado_kg?: number | null;
          peso_recibido_kg?: number | null;
          humedad_pct?: number | null;
          fermentacion_pct?: number | null;
          impurezas_pct?: number | null;
          analisis_sensorial?: string | null;
          remisiones?: string | null;
          observaciones?: string | null;
          recibido_por?: string | null;
          cerrada_en?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          orden_id?: string;
          estado?: Database["public"]["Enums"]["recepcion_estado"];
          tipo_envio?: Database["public"]["Enums"]["recepcion_envio"] | null;
          peso_solicitado_kg?: number | null;
          peso_recibido_kg?: number | null;
          humedad_pct?: number | null;
          fermentacion_pct?: number | null;
          impurezas_pct?: number | null;
          analisis_sensorial?: string | null;
          remisiones?: string | null;
          observaciones?: string | null;
          recibido_por?: string | null;
          cerrada_en?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recepcion_fotos: {
        Row: {
          id: string;
          recepcion_id: string;
          categoria: string;
          nombre: string;
          file_path: string;
          size_bytes: number | null;
          content_type: string | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recepcion_id: string;
          categoria: string;
          nombre: string;
          file_path: string;
          size_bytes?: number | null;
          content_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          recepcion_id?: string;
          categoria?: string;
          nombre?: string;
          file_path?: string;
          size_bytes?: number | null;
          content_type?: string | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ordenes_compra: {
        Row: {
          id: string;
          consecutivo: string | null;
          proveedor_id: string;
          tipo_caso: Database["public"]["Enums"]["oc_caso"];
          estado: Database["public"]["Enums"]["oc_estado"];
          volumen_kg: number | null;
          precio_kg: number | null;
          valor_total: number | null;
          fecha_entrega: string | null;
          lugar_entrega: string | null;
          observaciones: string | null;
          motivo_rechazo: string | null;
          created_by: string | null;
          aprobada_por: string | null;
          aprobada_en: string | null;
          emitida_en: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          consecutivo?: string | null;
          proveedor_id: string;
          tipo_caso?: Database["public"]["Enums"]["oc_caso"];
          estado?: Database["public"]["Enums"]["oc_estado"];
          volumen_kg?: number | null;
          precio_kg?: number | null;
          fecha_entrega?: string | null;
          lugar_entrega?: string | null;
          observaciones?: string | null;
          motivo_rechazo?: string | null;
          created_by?: string | null;
          aprobada_por?: string | null;
          aprobada_en?: string | null;
          emitida_en?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          consecutivo?: string | null;
          proveedor_id?: string;
          tipo_caso?: Database["public"]["Enums"]["oc_caso"];
          estado?: Database["public"]["Enums"]["oc_estado"];
          volumen_kg?: number | null;
          precio_kg?: number | null;
          fecha_entrega?: string | null;
          lugar_entrega?: string | null;
          observaciones?: string | null;
          motivo_rechazo?: string | null;
          created_by?: string | null;
          aprobada_por?: string | null;
          aprobada_en?: string | null;
          emitida_en?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      oc_comerciales: {
        Row: {
          id: string;
          orden_id: string;
          comercial_id: string;
          rol: Database["public"]["Enums"]["commission_role"];
          nota: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          orden_id: string;
          comercial_id: string;
          rol?: Database["public"]["Enums"]["commission_role"];
          nota?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          orden_id?: string;
          comercial_id?: string;
          rol?: Database["public"]["Enums"]["commission_role"];
          nota?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notificaciones: {
        Row: {
          id: string;
          usuario_id: string;
          tipo: string;
          titulo: string;
          cuerpo: string | null;
          enlace: string | null;
          entidad: string | null;
          entidad_id: string | null;
          leida: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          usuario_id: string;
          tipo: string;
          titulo: string;
          cuerpo?: string | null;
          enlace?: string | null;
          entidad?: string | null;
          entidad_id?: string | null;
          leida?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          usuario_id?: string;
          tipo?: string;
          titulo?: string;
          cuerpo?: string | null;
          enlace?: string | null;
          entidad?: string | null;
          entidad_id?: string | null;
          leida?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          entidad: string;
          entidad_id: string | null;
          accion: string;
          descripcion: string;
          meta: Json | null;
          usuario_id: string | null;
          usuario_nombre: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entidad: string;
          entidad_id?: string | null;
          accion: string;
          descripcion: string;
          meta?: Json | null;
          usuario_id?: string | null;
          usuario_nombre?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entidad?: string;
          entidad_id?: string | null;
          accion?: string;
          descripcion?: string;
          meta?: Json | null;
          usuario_id?: string | null;
          usuario_nombre?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      catalogos: {
        Row: {
          id: string;
          tipo: string;
          valor: string;
          descripcion: string | null;
          orden: number;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tipo: string;
          valor: string;
          descripcion?: string | null;
          orden?: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tipo?: string;
          valor?: string;
          descripcion?: string | null;
          orden?: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      departamentos: {
        Row: { id: string; nombre: string };
        Insert: { id: string; nombre: string };
        Update: { id?: string; nombre?: string };
        Relationships: [];
      };
      municipios: {
        Row: { codigo: string | null; departamento: string; id: string; nombre: string };
        Insert: { codigo?: string | null; departamento: string; id?: string; nombre: string };
        Update: { codigo?: string | null; departamento?: string; id?: string; nombre?: string };
        Relationships: [];
      };
      proveedores: {
        Row: {
          acepta_compromisos_eticos: string | null;
          acepta_politica_datos: string | null;
          autoriza_verificacion: string | null;
          capacidad_comercializacion: string | null;
          declara_origen_licito: string | null;
          documento_representante: string | null;
          municipios_produccion: string | null;
          representante_legal: string | null;
          tipo_documento_titular: string | null;
          asociacion: string | null;
          banco: string | null;
          cap_baba_anual: number | null;
          cap_baba_mensual: number | null;
          cap_seco_anual: number | null;
          cap_seco_mensual: number | null;
          cedula_titular: string | null;
          celular: string | null;
          certificaciones: string[];
          codigo: string | null;
          comentarios_estado: string | null;
          contacto: string | null;
          coordenadas: string | null;
          created_at: string;
          created_by: string | null;
          departamento: string | null;
          direccion: string | null;
          email: string | null;
          estado: Database["public"]["Enums"]["proveedor_estado"];
          humedad: number | null;
          id: string;
          libre_deforestacion: string | null;
          libre_trabajo_infantil: string | null;
          municipio: string | null;
          nit_asociacion: string | null;
          nombre: string;
          nombre_titular: string | null;
          num_productores_compra: number | null;
          numero_cuenta: string | null;
          numero_documento: string | null;
          pertenece_asociacion: string | null;
          pertenece_programa: string | null;
          programa: string | null;
          referencia_comercial_1: string | null;
          referencia_comercial_2: string | null;
          regimen_tributario: string | null;
          sellos: string[];
          tipo_cuenta: string | null;
          tipo_documento: string | null;
          tipo_producto: string | null;
          tipo_proveedor: string | null;
          tipo_secado: string | null;
          updated_at: string;
          usuario_asignado: string | null;
          variedad_cacao: string | null;
          whatsapp: string | null;
        };
        Insert: {
          acepta_compromisos_eticos?: string | null;
          acepta_politica_datos?: string | null;
          autoriza_verificacion?: string | null;
          capacidad_comercializacion?: string | null;
          declara_origen_licito?: string | null;
          documento_representante?: string | null;
          municipios_produccion?: string | null;
          representante_legal?: string | null;
          tipo_documento_titular?: string | null;
          asociacion?: string | null;
          banco?: string | null;
          cap_baba_anual?: number | null;
          cap_baba_mensual?: number | null;
          cap_seco_anual?: number | null;
          cap_seco_mensual?: number | null;
          cedula_titular?: string | null;
          celular?: string | null;
          certificaciones?: string[];
          codigo?: string | null;
          comentarios_estado?: string | null;
          contacto?: string | null;
          coordenadas?: string | null;
          created_at?: string;
          created_by?: string | null;
          departamento?: string | null;
          direccion?: string | null;
          email?: string | null;
          estado?: Database["public"]["Enums"]["proveedor_estado"];
          humedad?: number | null;
          id?: string;
          libre_deforestacion?: string | null;
          libre_trabajo_infantil?: string | null;
          municipio?: string | null;
          nit_asociacion?: string | null;
          nombre: string;
          nombre_titular?: string | null;
          num_productores_compra?: number | null;
          numero_cuenta?: string | null;
          numero_documento?: string | null;
          pertenece_asociacion?: string | null;
          pertenece_programa?: string | null;
          programa?: string | null;
          referencia_comercial_1?: string | null;
          referencia_comercial_2?: string | null;
          regimen_tributario?: string | null;
          sellos?: string[];
          tipo_cuenta?: string | null;
          tipo_documento?: string | null;
          tipo_producto?: string | null;
          tipo_proveedor?: string | null;
          tipo_secado?: string | null;
          updated_at?: string;
          usuario_asignado?: string | null;
          variedad_cacao?: string | null;
          whatsapp?: string | null;
        };
        Update: {
          acepta_compromisos_eticos?: string | null;
          acepta_politica_datos?: string | null;
          autoriza_verificacion?: string | null;
          capacidad_comercializacion?: string | null;
          declara_origen_licito?: string | null;
          documento_representante?: string | null;
          municipios_produccion?: string | null;
          representante_legal?: string | null;
          tipo_documento_titular?: string | null;
          asociacion?: string | null;
          banco?: string | null;
          cap_baba_anual?: number | null;
          cap_baba_mensual?: number | null;
          cap_seco_anual?: number | null;
          cap_seco_mensual?: number | null;
          cedula_titular?: string | null;
          celular?: string | null;
          certificaciones?: string[];
          codigo?: string | null;
          comentarios_estado?: string | null;
          contacto?: string | null;
          coordenadas?: string | null;
          created_at?: string;
          created_by?: string | null;
          departamento?: string | null;
          direccion?: string | null;
          email?: string | null;
          estado?: Database["public"]["Enums"]["proveedor_estado"];
          humedad?: number | null;
          id?: string;
          libre_deforestacion?: string | null;
          libre_trabajo_infantil?: string | null;
          municipio?: string | null;
          nit_asociacion?: string | null;
          nombre?: string;
          nombre_titular?: string | null;
          num_productores_compra?: number | null;
          numero_cuenta?: string | null;
          numero_documento?: string | null;
          pertenece_asociacion?: string | null;
          pertenece_programa?: string | null;
          programa?: string | null;
          referencia_comercial_1?: string | null;
          referencia_comercial_2?: string | null;
          regimen_tributario?: string | null;
          sellos?: string[];
          tipo_cuenta?: string | null;
          tipo_documento?: string | null;
          tipo_producto?: string | null;
          tipo_proveedor?: string | null;
          tipo_secado?: string | null;
          updated_at?: string;
          usuario_asignado?: string | null;
          variedad_cacao?: string | null;
          whatsapp?: string | null;
        };
        Relationships: [];
      };
      proveedor_estado_log: {
        Row: {
          created_at: string;
          estado_anterior: string | null;
          estado_nuevo: string;
          id: string;
          motivo: string | null;
          proveedor_id: string;
          usuario_id: string | null;
          usuario_nombre: string | null;
        };
        Insert: {
          created_at?: string;
          estado_anterior?: string | null;
          estado_nuevo: string;
          id?: string;
          motivo?: string | null;
          proveedor_id: string;
          usuario_id?: string | null;
          usuario_nombre?: string | null;
        };
        Update: {
          created_at?: string;
          estado_anterior?: string | null;
          estado_nuevo?: string;
          id?: string;
          motivo?: string | null;
          proveedor_id?: string;
          usuario_id?: string | null;
          usuario_nombre?: string | null;
        };
        Relationships: [];
      };
      proveedor_documentos: {
        Row: {
          categoria: string;
          content_type: string | null;
          created_at: string;
          file_path: string;
          id: string;
          nombre: string;
          proveedor_id: string;
          size_bytes: number | null;
          uploaded_by: string | null;
        };
        Insert: {
          categoria: string;
          content_type?: string | null;
          created_at?: string;
          file_path: string;
          id?: string;
          nombre: string;
          proveedor_id: string;
          size_bytes?: number | null;
          uploaded_by?: string | null;
        };
        Update: {
          categoria?: string;
          content_type?: string | null;
          created_at?: string;
          file_path?: string;
          id?: string;
          nombre?: string;
          proveedor_id?: string;
          size_bytes?: number | null;
          uploaded_by?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          type: string;
          severity: string;
          title: string;
          body: string | null;
          related_table: string | null;
          related_id: string | null;
          for_department: Database["public"]["Enums"]["department"] | null;
          for_user: string | null;
          dedupe_key: string | null;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          severity?: string;
          title: string;
          body?: string | null;
          related_table?: string | null;
          related_id?: string | null;
          for_department?: Database["public"]["Enums"]["department"] | null;
          for_user?: string | null;
          dedupe_key?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          type?: string;
          severity?: string;
          title?: string;
          body?: string | null;
          related_table?: string | null;
          related_id?: string | null;
          for_department?: Database["public"]["Enums"]["department"] | null;
          for_user?: string | null;
          dedupe_key?: string | null;
          read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      price_history: {
        Row: {
          company: string;
          created_at: string;
          date: string;
          id: string;
          price_cop_kg: number;
        };
        Insert: {
          company: string;
          created_at?: string;
          date: string;
          id?: string;
          price_cop_kg: number;
        };
        Update: {
          company?: string;
          created_at?: string;
          date?: string;
          id?: string;
          price_cop_kg?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          active: boolean;
          aprueba_compras: boolean;
          ve_mercado: boolean;
          verifica_proveedores: boolean;
          created_at: string;
          department: Database["public"]["Enums"]["department"] | null;
          email: string;
          full_name: string;
          id: string;
          onboarded: boolean;
          role: Database["public"]["Enums"]["user_role"];
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          aprueba_compras?: boolean;
          ve_mercado?: boolean;
          verifica_proveedores?: boolean;
          created_at?: string;
          department?: Database["public"]["Enums"]["department"] | null;
          email: string;
          full_name: string;
          id: string;
          onboarded?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          aprueba_compras?: boolean;
          ve_mercado?: boolean;
          verifica_proveedores?: boolean;
          created_at?: string;
          department?: Database["public"]["Enums"]["department"] | null;
          email?: string;
          full_name?: string;
          id?: string;
          onboarded?: boolean;
          role?: Database["public"]["Enums"]["user_role"];
          updated_at?: string;
        };
        Relationships: [];
      };
      quotes: {
        Row: {
          bonif_cadmio: number;
          bonif_calidad: number;
          bonif_transporte: number;
          bonif_trazabilidad: number;
          client_name: string | null;
          coberturas: number;
          cocoa_usd_t: number;
          commission_pct: number;
          costales: number;
          costo_total_usd_tm: number | null;
          costos_exportacion: number;
          created_at: string;
          created_by: string | null;
          differential: number;
          estibas: number;
          fumigacion: number;
          id: string;
          incoterm: Database["public"]["Enums"]["incoterm"];
          lead_id: string | null;
          market: Database["public"]["Enums"]["market"] | null;
          port_destination: string | null;
          port_origin: string | null;
          precio_final_cop_tm: number | null;
          precio_final_usd_tm: number | null;
          purchase_price_cop_kg: number;
          quote_number: string | null;
          seleccion: number;
          status: Database["public"]["Enums"]["quote_status"];
          target_utility_pct: number;
          total_operacion_cop: number | null;
          total_operacion_usd: number | null;
          transporte_bodega: number;
          trm: number;
          updated_at: string;
          utilidad_pct: number | null;
          validity_days: number | null;
          volume_tm: number;
        };
        Insert: {
          bonif_cadmio?: number;
          bonif_calidad?: number;
          bonif_transporte?: number;
          bonif_trazabilidad?: number;
          client_name?: string | null;
          coberturas?: number;
          cocoa_usd_t: number;
          commission_pct?: number;
          costales?: number;
          costo_total_usd_tm?: number | null;
          costos_exportacion?: number;
          created_at?: string;
          created_by?: string | null;
          differential?: number;
          estibas?: number;
          fumigacion?: number;
          id?: string;
          incoterm: Database["public"]["Enums"]["incoterm"];
          lead_id?: string | null;
          market?: Database["public"]["Enums"]["market"] | null;
          port_destination?: string | null;
          port_origin?: string | null;
          precio_final_cop_tm?: number | null;
          precio_final_usd_tm?: number | null;
          purchase_price_cop_kg: number;
          quote_number?: string | null;
          seleccion?: number;
          status?: Database["public"]["Enums"]["quote_status"];
          target_utility_pct?: number;
          total_operacion_cop?: number | null;
          total_operacion_usd?: number | null;
          transporte_bodega?: number;
          trm: number;
          updated_at?: string;
          utilidad_pct?: number | null;
          validity_days?: number | null;
          volume_tm?: number;
        };
        Update: {
          bonif_cadmio?: number;
          bonif_calidad?: number;
          bonif_transporte?: number;
          bonif_trazabilidad?: number;
          client_name?: string | null;
          coberturas?: number;
          cocoa_usd_t?: number;
          commission_pct?: number;
          costales?: number;
          costo_total_usd_tm?: number | null;
          costos_exportacion?: number;
          created_at?: string;
          created_by?: string | null;
          differential?: number;
          estibas?: number;
          fumigacion?: number;
          id?: string;
          incoterm?: Database["public"]["Enums"]["incoterm"];
          lead_id?: string | null;
          market?: Database["public"]["Enums"]["market"] | null;
          port_destination?: string | null;
          port_origin?: string | null;
          precio_final_cop_tm?: number | null;
          precio_final_usd_tm?: number | null;
          purchase_price_cop_kg?: number;
          quote_number?: string | null;
          seleccion?: number;
          status?: Database["public"]["Enums"]["quote_status"];
          target_utility_pct?: number;
          total_operacion_cop?: number | null;
          total_operacion_usd?: number | null;
          transporte_bodega?: number;
          trm?: number;
          updated_at?: string;
          utilidad_pct?: number | null;
          validity_days?: number | null;
          volume_tm?: number;
        };
        Relationships: [];
      };
      meeting_attendees: {
        Row: {
          id: string;
          meeting_id: string;
          profile_id: string | null;
          email: string | null;
          name: string | null;
          created_at: string;
          can_view: boolean;
          attended: boolean;
          can_manage: boolean;
        };
        Insert: {
          id?: string;
          meeting_id: string;
          profile_id?: string | null;
          email?: string | null;
          name?: string | null;
          created_at?: string;
          can_view?: boolean;
          attended?: boolean;
          can_manage?: boolean;
        };
        Update: {
          id?: string;
          meeting_id?: string;
          profile_id?: string | null;
          email?: string | null;
          name?: string | null;
          created_at?: string;
          can_view?: boolean;
          attended?: boolean;
          can_manage?: boolean;
        };
        Relationships: [];
      };
      meetings: {
        Row: {
          id: string;
          title: string;
          meeting_date: string | null;
          file_path: string | null;
          file_name: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          source_email_id: string | null;
          restricted: boolean;
        };
        Insert: {
          id?: string;
          title: string;
          meeting_date?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          source_email_id?: string | null;
          restricted?: boolean;
        };
        Update: {
          id?: string;
          title?: string;
          meeting_date?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          source_email_id?: string | null;
          restricted?: boolean;
        };
        Relationships: [];
      };
      task_assignees: {
        Row: {
          created_at: string;
          task_id: string;
          team_member_id: string;
        };
        Insert: {
          created_at?: string;
          task_id: string;
          team_member_id: string;
        };
        Update: {
          created_at?: string;
          task_id?: string;
          team_member_id?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          due_date: string | null;
          id: string;
          meeting_id: string | null;
          name: string;
          notes: string | null;
          person_id: string | null;
          person_name: string | null;
          source: string | null;
          start_date: string | null;
          status: Database["public"]["Enums"]["task_status"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          meeting_id?: string | null;
          name: string;
          notes?: string | null;
          person_id?: string | null;
          person_name?: string | null;
          source?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          meeting_id?: string | null;
          name?: string;
          notes?: string | null;
          person_id?: string | null;
          person_name?: string | null;
          source?: string | null;
          start_date?: string | null;
          status?: Database["public"]["Enums"]["task_status"];
          updated_at?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          active: boolean;
          color: string | null;
          created_at: string;
          department: Database["public"]["Enums"]["department"] | null;
          id: string;
          manager_id: string | null;
          name: string;
          profile_id: string | null;
          role_title: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          color?: string | null;
          created_at?: string;
          department?: Database["public"]["Enums"]["department"] | null;
          id?: string;
          manager_id?: string | null;
          name: string;
          profile_id?: string | null;
          role_title?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          color?: string | null;
          created_at?: string;
          department?: Database["public"]["Enums"]["department"] | null;
          id?: string;
          manager_id?: string | null;
          name?: string;
          profile_id?: string | null;
          role_title?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_write: {
        Args: { depts: Database["public"]["Enums"]["department"][] };
        Returns: boolean;
      };
      import_inventory_sheet: {
        Args: { p_lots: Json; p_dispatches: Json };
        Returns: Json;
      };
      import_ventas_sheet: {
        Args: { filas: Json };
        Returns: number;
      };
      replace_inventory_quality: {
        Args: { p_rows: Json };
        Returns: number;
      };
      is_active_member: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      compra_categoria:
        | "Oficina"
        | "Finca"
        | "Cultivo"
        | "Bodega"
        | "Transporte"
        | "Mantenimiento"
        | "Tecnología"
        | "Otro";
      compra_estado: "Borrador" | "Pendiente" | "Aprobada" | "Rechazada";
      proveedor_insumo_estado: "Pendiente" | "Activo" | "Rechazado" | "Inactivo";
      persona_tipo: "Natural" | "Jurídica";
      documento_tipo: "CC" | "CE" | "NIT" | "PA";
      cuenta_cobro_estado: "Radicada" | "Aprobada" | "Rechazada" | "Pagada";
      documento_proveedor_tipo:
        | "RUT"
        | "Documento de identidad"
        | "Certificado bancario"
        | "Cámara de comercio"
        | "Otro";
      pregunta_estado: "Pendiente" | "Respondida" | "Descartada";
      pregunta_prioridad: "Alta" | "Media" | "Baja";
      activity_type:
        | "Nota"
        | "Llamada"
        | "Correo"
        | "WhatsApp"
        | "Reunión"
        | "Cambio de estado";
      commission_level: "Senior" | "Junior";
      commission_role: "Compra+Venta" | "Solo Venta" | "Solo Compra";
      paso_estado:
        | "pendiente"
        | "en_curso"
        | "completado"
        | "bloqueado"
        | "no_aplica";
      proceso_estado: "en_curso" | "bloqueado" | "completado";
      proceso_tipo: "proveedor" | "orden_compra";
      proveedor_estado:
        | "En estudio"
        | "Habilitado"
        | "Deshabilitado"
        | "Rechazado";
      department:
        | "Dirección"
        | "Comercial"
        | "Financiero"
        | "Administrativo"
        | "Bodega Central"
        | "Finca"
        | "Operaciones";
      incoterm: "NACIONAL" | "FOB" | "CIF";
      lead_status:
        | "Nuevo"
        | "Cotización"
        | "Negociación"
        | "Enviado"
        | "En espera"
        | "Cerrado"
        | "Descartado";
      lead_type: "Comprador" | "Proveedor potencial" | "Comprador/Broker";
      market: "Nacional" | "Internacional";
      movement_kind: "entrada" | "salida";
      quote_status: "borrador" | "enviada" | "aceptada" | "rechazada";
      task_status: "pending" | "progress" | "done" | "blocked";
      oc_caso: "roc" | "otros_sin" | "otros_con";
      oc_estado: "Borrador" | "En revisión" | "Aprobada" | "Rechazada" | "Emitida";
      recepcion_estado: "En proceso" | "Cerrada";
      recepcion_envio: "Cauca" | "Finca" | "Otros";
      liquidacion_estado: "Por revisión" | "Aprobada";
      liquidacion_pago: "general" | "roc";
      user_role: "admin" | "admin_view" | "member";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];

// ── Convenience aliases ──────────────────────────────────────────────────────
export type Profile = Tables<"profiles">;
export type TeamMember = Tables<"team_members">;
export type Lead = Tables<"leads">;
export type LeadActivity = Tables<"lead_activities">;
export type Quote = Tables<"quotes">;
export type InventoryLot = Tables<"inventory_lots">;
export type InventoryMovement = Tables<"inventory_movements">;
export type InventoryQuality = Tables<"inventory_quality">;
export type Dispatch = Tables<"dispatches">;
export type CompraSolicitud = Tables<"compra_solicitudes">;
export type Pregunta = Tables<"preguntas">;
export type Venta = Tables<"ventas">;
export type ProveedorInsumo = Tables<"proveedores_insumos">;
export type CuentaCobro = Tables<"cuentas_cobro">;
export type CuentaCobroItem = Tables<"cuenta_cobro_items">;
export type ProveedorInsumoDocumento = Tables<"proveedor_insumo_documentos">;
export type CompraCotizacion = Tables<"compra_cotizaciones">;
export type PriceHistory = Tables<"price_history">;
export type Notification = Tables<"notifications">;
export type CommissionRule = Tables<"commission_rules">;
export type CommissionCalc = Tables<"commission_calcs">;
export type MonthlyTonnage = Tables<"monthly_tonnage">;
export type Proveedor = Tables<"proveedores">;
export type Departamento = Tables<"departamentos">;
export type Municipio = Tables<"municipios">;
export type ProveedorDocumento = Tables<"proveedor_documentos">;
export type ProveedorEstadoLog = Tables<"proveedor_estado_log">;
export type Catalogo = Tables<"catalogos">;
export type AuditLog = Tables<"audit_log">;
export type Notificacion = Tables<"notificaciones">;
export type OrdenCompra = Tables<"ordenes_compra">;
export type OcComercial = Tables<"oc_comerciales">;
export type Recepcion = Tables<"recepciones">;
export type RecepcionFoto = Tables<"recepcion_fotos">;
export type Liquidacion = Tables<"liquidaciones">;
export type Contrato = Tables<"contratos">;
export type Task = Tables<"tasks">;
export type Meeting = Tables<"meetings">;

export type Department = Enums<"department">;
export type UserRole = Enums<"user_role">;
export type Market = Enums<"market">;
export type LeadType = Enums<"lead_type">;
export type LeadStatusEnum = Enums<"lead_status">;
export type ActivityType = Enums<"activity_type">;
export type Incoterm = Enums<"incoterm">;
export type QuoteStatus = Enums<"quote_status">;
export type MovementKind = Enums<"movement_kind">;
export type TaskStatusEnum = Enums<"task_status">;
export type CommissionLevel = Enums<"commission_level">;
export type CommissionRole = Enums<"commission_role">;
