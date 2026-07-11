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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ad_images: {
        Row: {
          ad_id: string
          created_at: string
          height: number | null
          id: string
          public_url: string
          sort_order: number
          storage_path: string
          width: number | null
        }
        Insert: {
          ad_id: string
          created_at?: string
          height?: number | null
          id?: string
          public_url: string
          sort_order?: number
          storage_path: string
          width?: number | null
        }
        Update: {
          ad_id?: string
          created_at?: string
          height?: number | null
          id?: string
          public_url?: string
          sort_order?: number
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_images_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          allow_messages: boolean
          body: string
          bumped_at: string | null
          canonical_url: string | null
          category_id: string
          city_id: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          expires_at: string | null
          focus_keywords: string[] | null
          id: string
          meta_description: string | null
          og_image: string | null
          posted_at: string | null
          price_cents: number | null
          rejection_reason: string | null
          report_count: number
          search_vector: unknown
          seo_title: string | null
          short_id: string
          slug: string
          status: Database["public"]["Enums"]["ad_status"]
          subcategory_id: string | null
          tier: Database["public"]["Enums"]["ad_tier"]
          tier_expires_at: string | null
          title: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          allow_messages?: boolean
          body: string
          bumped_at?: string | null
          canonical_url?: string | null
          category_id: string
          city_id: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          focus_keywords?: string[] | null
          id?: string
          meta_description?: string | null
          og_image?: string | null
          posted_at?: string | null
          price_cents?: number | null
          rejection_reason?: string | null
          report_count?: number
          search_vector?: unknown
          seo_title?: string | null
          short_id?: string
          slug: string
          status?: Database["public"]["Enums"]["ad_status"]
          subcategory_id?: string | null
          tier?: Database["public"]["Enums"]["ad_tier"]
          tier_expires_at?: string | null
          title: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          allow_messages?: boolean
          body?: string
          bumped_at?: string | null
          canonical_url?: string | null
          category_id?: string
          city_id?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          expires_at?: string | null
          focus_keywords?: string[] | null
          id?: string
          meta_description?: string | null
          og_image?: string | null
          posted_at?: string | null
          price_cents?: number | null
          rejection_reason?: string | null
          report_count?: number
          search_vector?: unknown
          seo_title?: string | null
          short_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["ad_status"]
          subcategory_id?: string | null
          tier?: Database["public"]["Enums"]["ad_tier"]
          tier_expires_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          id: string
          target_id: string | null
          target_table: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          id?: string
          target_id?: string | null
          target_table?: string | null
        }
        Relationships: []
      }
      banned_keywords: {
        Row: {
          created_at: string
          id: string
          keyword: string
          severity: string
        }
        Insert: {
          created_at?: string
          id?: string
          keyword: string
          severity?: string
        }
        Update: {
          created_at?: string
          id?: string
          keyword?: string
          severity?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string
          body_markdown: string
          canonical_url: string | null
          cover_image: string | null
          created_at: string
          excerpt: string | null
          focus_keywords: string[] | null
          id: string
          meta_description: string | null
          og_image: string | null
          published_at: string | null
          seo_title: string | null
          slug: string
          status: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body_markdown?: string
          canonical_url?: string | null
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          focus_keywords?: string[] | null
          id?: string
          meta_description?: string | null
          og_image?: string | null
          published_at?: string | null
          seo_title?: string | null
          slug: string
          status?: Database["public"]["Enums"]["post_status"]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body_markdown?: string
          canonical_url?: string | null
          cover_image?: string | null
          created_at?: string
          excerpt?: string | null
          focus_keywords?: string[] | null
          id?: string
          meta_description?: string | null
          og_image?: string | null
          published_at?: string | null
          seo_title?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["post_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          base_price_cents: number
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_paid_only: boolean
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          base_price_cents?: number
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_paid_only?: boolean
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          base_price_cents?: number
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_paid_only?: boolean
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      cities: {
        Row: {
          created_at: string
          id: string
          is_featured: boolean
          lat: number | null
          lng: number | null
          name: string
          population: number | null
          slug: string
          state_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_featured?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          population?: number | null
          slug: string
          state_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_featured?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          population?: number | null
          slug?: string
          state_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          ad_id: string | null
          created_at: string
          delta_cents: number
          id: string
          invoice_id: string | null
          reason: string
          user_id: string
        }
        Insert: {
          ad_id?: string | null
          created_at?: string
          delta_cents: number
          id?: string
          invoice_id?: string | null
          reason: string
          user_id: string
        }
        Update: {
          ad_id?: string | null
          created_at?: string
          delta_cents?: number
          id?: string
          invoice_id?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          created_at: string
          credit_cents: number | null
          id: string
          invoice_url: string | null
          kind: string
          listing_id: string | null
          nowpayments_order_id: string | null
          nowpayments_payment_id: string | null
          pay_amount: number | null
          pay_currency: string | null
          price_amount: number | null
          price_currency: string | null
          raw_payload: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credit_cents?: number | null
          id?: string
          invoice_url?: string | null
          kind?: string
          listing_id?: string | null
          nowpayments_order_id?: string | null
          nowpayments_payment_id?: string | null
          pay_amount?: number | null
          pay_currency?: string | null
          price_amount?: number | null
          price_currency?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credit_cents?: number | null
          id?: string
          invoice_url?: string | null
          kind?: string
          listing_id?: string | null
          nowpayments_order_id?: string | null
          nowpayments_payment_id?: string | null
          pay_amount?: number | null
          pay_currency?: string | null
          price_amount?: number | null
          price_currency?: string | null
          raw_payload?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_images: {
        Row: {
          id: string
          image_url: string
          listing_id: string
        }
        Insert: {
          id?: string
          image_url: string
          listing_id: string
        }
        Update: {
          id?: string
          image_url?: string
          listing_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_images_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          created_at: string
          description: string
          id: string
          location_id: string
          price: number
          status: string
          sticky_until: string | null
          subcategory_id: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          location_id: string
          price: number
          status: string
          sticky_until?: string | null
          subcategory_id: string
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          location_id?: string
          price?: number
          status?: string
          sticky_until?: string | null
          subcategory_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "subcategories"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          city_name: string
          id: string
          slug: string
          state_region: string
        }
        Insert: {
          city_name: string
          id?: string
          slug: string
          state_region: string
        }
        Update: {
          city_name?: string
          id?: string
          slug?: string
          state_region?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          ad_id: string
          body: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          ad_id: string
          body: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          ad_id?: string
          body?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      page_layouts: {
        Row: {
          created_at: string
          created_by: string | null
          css_override: string | null
          description: string | null
          document: Json
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          css_override?: string | null
          description?: string | null
          document: Json
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          css_override?: string | null
          description?: string | null
          document?: Json
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      page_templates: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          layout_id: string
          post_type: string
          scope_key: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          layout_id: string
          post_type: string
          scope_key?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          layout_id?: string
          post_type?: string
          scope_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_templates_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "page_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          ad_id: string | null
          amount_cents: number
          created_at: string
          currency: string
          id: string
          metadata: Json
          product_kind: string
          provider: string
          provider_payment_id: string | null
          provider_session_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ad_id?: string | null
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          product_kind: string
          provider?: string
          provider_payment_id?: string | null
          provider_session_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          ad_id?: string | null
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json
          product_kind?: string
          provider?: string
          provider_payment_id?: string | null
          provider_session_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          default_city_id: string | null
          display_name: string | null
          email_verified: boolean
          id: string
          is_banned: boolean
          reputation: number
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_city_id?: string | null
          display_name?: string | null
          email_verified?: boolean
          id: string
          is_banned?: boolean
          reputation?: number
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_city_id?: string | null
          display_name?: string | null
          email_verified?: boolean
          id?: string
          is_banned?: boolean
          reputation?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_city_fk"
            columns: ["default_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          action: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          action: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          action?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          ad_id: string
          created_at: string
          detail: string | null
          id: string
          reason: string
          reporter_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          ad_id: string
          created_at?: string
          detail?: string | null
          id?: string
          reason: string
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          ad_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          reason?: string
          reporter_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          created_at: string
          description: string | null
          is_public: boolean
          key: string
          section: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_public?: boolean
          key: string
          section: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          is_public?: boolean
          key?: string
          section?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      states: {
        Row: {
          code: string
          country_code: string
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          code: string
          country_code?: string
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          code?: string
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credits: {
        Row: {
          balance_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ad_rank_score: {
        Args: {
          _bumped_at: string
          _posted_at: string
          _reports: number
          _tier: Database["public"]["Enums"]["ad_tier"]
          _views: number
        }
        Returns: number
      }
      add_credits_from_invoice: {
        Args: { _amount_cents: number; _invoice_id: string; _user_id: string }
        Returns: boolean
      }
      admin_adjust_credits: {
        Args: { _delta_cents: number; _reason: string; _target_user: string }
        Returns: number
      }
      admin_analytics_series: {
        Args: { _bucket?: string; _from: string; _to: string }
        Returns: {
          bucket_start: string
          new_ads: number
          orders: number
          paid_ads: number
          revenue_cents: number
        }[]
      }
      admin_analytics_summary: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      admin_export_snapshot: { Args: never; Returns: Json }
      admin_site_health: { Args: never; Returns: Json }
      consume_rate_limit: {
        Args: { _action: string; _max: number; _window_seconds: number }
        Returns: boolean
      }
      expire_stale_ads: { Args: never; Returns: number }
      get_public_settings: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_abandoned_drafts: { Args: never; Returns: undefined }
      spend_credits: {
        Args: { _ad_id?: string; _amount_cents: number; _reason: string }
        Returns: boolean
      }
    }
    Enums: {
      ad_status:
        | "draft"
        | "pending"
        | "live"
        | "expired"
        | "removed"
        | "rejected"
      ad_tier: "free" | "bumped" | "featured" | "sticky"
      app_role: "admin" | "moderator" | "user" | "superadmin"
      payment_status: "pending" | "paid" | "failed" | "refunded"
      post_status: "draft" | "published" | "archived"
      report_status: "open" | "reviewing" | "resolved" | "dismissed"
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
    Enums: {
      ad_status: ["draft", "pending", "live", "expired", "removed", "rejected"],
      ad_tier: ["free", "bumped", "featured", "sticky"],
      app_role: ["admin", "moderator", "user", "superadmin"],
      payment_status: ["pending", "paid", "failed", "refunded"],
      post_status: ["draft", "published", "archived"],
      report_status: ["open", "reviewing", "resolved", "dismissed"],
    },
  },
} as const
