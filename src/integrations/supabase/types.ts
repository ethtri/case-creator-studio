export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      orders: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string | null
          coupon_id: string | null
          discount_total: number
          fulfillment_last_error: string | null
          fulfillment_order_id: string | null
          fulfillment_provider: string
          fulfillment_routed_at: string | null
          fulfillment_status: string | null
          id: string
          items: Json
          marketing_attribution: Json | null
          printful_attempts: number
          printful_last_attempt_at: string | null
          printful_last_error: string | null
          printful_next_attempt_at: string | null
          printful_order_id: string | null
          printful_refund_id: string | null
          printful_status: string | null
          promotion_code: string | null
          promotion_code_id: string | null
          shipped_at: string | null
          shipping_address: Json | null
          tracking_carrier: string | null
          tracking_number: string | null
          tracking_url: string | null
          shipping_cost: number
          shipping_method_currency: string | null
          shipping_method_id: string | null
          shipping_method_label: string | null
          shipping_method_max_days: number | null
          shipping_method_min_days: number | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          subtotal: number
          total: number
          delivered_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name?: string | null
          coupon_id?: string | null
          discount_total?: number
          fulfillment_last_error?: string | null
          fulfillment_order_id?: string | null
          fulfillment_provider?: string
          fulfillment_routed_at?: string | null
          fulfillment_status?: string | null
          id?: string
          items: Json
          marketing_attribution?: Json | null
          printful_attempts?: number
          printful_last_attempt_at?: string | null
          printful_last_error?: string | null
          printful_next_attempt_at?: string | null
          printful_order_id?: string | null
          printful_refund_id?: string | null
          printful_status?: string | null
          promotion_code?: string | null
          promotion_code_id?: string | null
          shipped_at?: string | null
          shipping_address?: Json | null
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          shipping_cost?: number
          shipping_method_currency?: string | null
          shipping_method_id?: string | null
          shipping_method_label?: string | null
          shipping_method_max_days?: number | null
          shipping_method_min_days?: number | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal: number
          total: number
          delivered_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string | null
          coupon_id?: string | null
          discount_total?: number
          fulfillment_last_error?: string | null
          fulfillment_order_id?: string | null
          fulfillment_provider?: string
          fulfillment_routed_at?: string | null
          fulfillment_status?: string | null
          id?: string
          items?: Json
          marketing_attribution?: Json | null
          printful_attempts?: number
          printful_last_attempt_at?: string | null
          printful_last_error?: string | null
          printful_next_attempt_at?: string | null
          printful_order_id?: string | null
          printful_refund_id?: string | null
          printful_status?: string | null
          promotion_code?: string | null
          promotion_code_id?: string | null
          shipped_at?: string | null
          shipping_address?: Json | null
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          shipping_cost?: number
          shipping_method_currency?: string | null
          shipping_method_id?: string | null
          shipping_method_label?: string | null
          shipping_method_max_days?: number | null
          shipping_method_min_days?: number | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          total?: number
          delivered_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      production_jobs: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string | null
          failed_at: string | null
          fulfillment_status: string | null
          id: string
          items: Json
          metadata: Json
          operator_email: string | null
          operator_notes: string | null
          order_id: string
          order_status: string
          provider: string
          shipped_at: string | null
          shipping_address: Json | null
          started_at: string | null
          status: string
          total: number
          tracking_carrier: string | null
          tracking_number: string | null
          tracking_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name?: string | null
          failed_at?: string | null
          fulfillment_status?: string | null
          id?: string
          items: Json
          metadata?: Json
          operator_email?: string | null
          operator_notes?: string | null
          order_id: string
          order_status: string
          provider?: string
          shipped_at?: string | null
          shipping_address?: Json | null
          started_at?: string | null
          status?: string
          total: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string | null
          failed_at?: string | null
          fulfillment_status?: string | null
          id?: string
          items?: Json
          metadata?: Json
          operator_email?: string | null
          operator_notes?: string | null
          order_id?: string
          order_status?: string
          provider?: string
          shipped_at?: string | null
          shipping_address?: Json | null
          started_at?: string | null
          status?: string
          total?: number
          tracking_carrier?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_jobs_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_notifications: {
        Row: {
          created_at: string
          delivery_status: string | null
          error_message: string | null
          event_type: string
          id: string
          last_provider_event_at: string | null
          last_provider_event_id: string | null
          order_id: string
          provider: string
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_status?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          last_provider_event_at?: string | null
          last_provider_event_id?: string | null
          order_id: string
          provider?: string
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_status?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          last_provider_event_at?: string | null
          last_provider_event_id?: string | null
          order_id?: string
          provider?: string
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_notifications_order_id_fkey"
            columns: ["order_id"]
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      resend_webhook_events: {
        Row: {
          delivery_status: string
          event_created_at: string
          event_type: string
          provider_message_id: string
          received_at: string
          svix_id: string
        }
        Insert: {
          delivery_status: string
          event_created_at: string
          event_type: string
          provider_message_id: string
          received_at?: string
          svix_id: string
        }
        Update: {
          delivery_status?: string
          event_created_at?: string
          event_type?: string
          provider_message_id?: string
          received_at?: string
          svix_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_resend_webhook_event: {
        Args: {
          p_delivery_status: string
          p_error_message?: string | null
          p_event_created_at: string
          p_event_type: string
          p_provider_message_id: string
          p_svix_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
