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
      dispatches: {
        Row: {
          created_at: string;
          created_by: string | null;
          destination: string | null;
          dispatch_date: string;
          id: string;
          lead_id: string | null;
          lot_id: string | null;
          needs_review: boolean;
          oc: string | null;
          origin: string | null;
          purchase_price_cop_kg: number | null;
          qty_kg: number;
          remision_entrada: string | null;
          remision_salida: string | null;
          total_salida_kg: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          destination?: string | null;
          dispatch_date?: string;
          id?: string;
          lead_id?: string | null;
          lot_id?: string | null;
          needs_review?: boolean;
          oc?: string | null;
          origin?: string | null;
          purchase_price_cop_kg?: number | null;
          qty_kg: number;
          remision_entrada?: string | null;
          remision_salida?: string | null;
          total_salida_kg?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          destination?: string | null;
          dispatch_date?: string;
          id?: string;
          lead_id?: string | null;
          lot_id?: string | null;
          needs_review?: boolean;
          oc?: string | null;
          origin?: string | null;
          purchase_price_cop_kg?: number | null;
          qty_kg?: number;
          remision_entrada?: string | null;
          remision_salida?: string | null;
          total_salida_kg?: number | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      inventory_lots: {
        Row: {
          code: string;
          created_at: string;
          entry_date: string | null;
          id: string;
          needs_review: boolean;
          notes: string | null;
          origin: string | null;
          purchase_price_cop_kg: number | null;
          qty_available_kg: number;
          qty_in_kg: number;
          qty_out_kg: number;
          quality: string | null;
          remision: string | null;
          samples_pasilla_merma_kg: number;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          entry_date?: string | null;
          id?: string;
          needs_review?: boolean;
          notes?: string | null;
          origin?: string | null;
          purchase_price_cop_kg?: number | null;
          qty_available_kg?: number;
          qty_in_kg?: number;
          qty_out_kg?: number;
          quality?: string | null;
          remision?: string | null;
          samples_pasilla_merma_kg?: number;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          entry_date?: string | null;
          id?: string;
          needs_review?: boolean;
          notes?: string | null;
          origin?: string | null;
          purchase_price_cop_kg?: number | null;
          qty_available_kg?: number;
          qty_in_kg?: number;
          qty_out_kg?: number;
          quality?: string | null;
          remision?: string | null;
          samples_pasilla_merma_kg?: number;
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
          contact_name: string | null;
          country: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          market: Database["public"]["Enums"]["market"] | null;
          next_action: string | null;
          next_action_date: string | null;
          notes: string | null;
          product_interest: string | null;
          source: string | null;
          status: Database["public"]["Enums"]["lead_status"];
          type: Database["public"]["Enums"]["lead_type"] | null;
          updated_at: string;
          volume: string | null;
        };
        Insert: {
          city?: string | null;
          commercial_owner?: string | null;
          company: string;
          contact_name?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          market?: Database["public"]["Enums"]["market"] | null;
          next_action?: string | null;
          next_action_date?: string | null;
          notes?: string | null;
          product_interest?: string | null;
          source?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          type?: Database["public"]["Enums"]["lead_type"] | null;
          updated_at?: string;
          volume?: string | null;
        };
        Update: {
          city?: string | null;
          commercial_owner?: string | null;
          company?: string;
          contact_name?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          market?: Database["public"]["Enums"]["market"] | null;
          next_action?: string | null;
          next_action_date?: string | null;
          notes?: string | null;
          product_interest?: string | null;
          source?: string | null;
          status?: Database["public"]["Enums"]["lead_status"];
          type?: Database["public"]["Enums"]["lead_type"] | null;
          updated_at?: string;
          volume?: string | null;
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
      is_active_member: { Args: Record<string, never>; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      activity_type:
        | "Nota"
        | "Llamada"
        | "Correo"
        | "WhatsApp"
        | "Reunión"
        | "Cambio de estado";
      commission_level: "Senior" | "Junior";
      commission_role: "Compra+Venta" | "Solo Venta" | "Solo Compra";
      department:
        | "Dirección"
        | "Comercial"
        | "Financiero"
        | "Administrativo"
        | "Bodega Central"
        | "Finca";
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
      user_role: "admin" | "member";
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
export type Dispatch = Tables<"dispatches">;
export type PriceHistory = Tables<"price_history">;
export type Notification = Tables<"notifications">;
export type CommissionRule = Tables<"commission_rules">;
export type CommissionCalc = Tables<"commission_calcs">;
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
