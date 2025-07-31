export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      barangays: {
        Row: {
          id: string
          name: string
          city: string
          province: string
          region: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          city: string
          province: string
          region?: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          city?: string
          province?: string
          region?: string
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          id: string
          name: string
          region: string
          province: string
          city: string
          barangay: string[]
        }
        Insert: {
          id?: string
          name: string
          region: string
          province: string
          city: string
          barangay: string[]
        }
        Update: {
          id?: string
          name?: string
          region?: string
          province?: string
          city?: string
          barangay?: string[]
        }
        Relationships: []
      }
      order_batches: {
        Row: {
          id: string
          created_at: string
          status: 'pending' | 'assigned' | 'delivering' | 'delivered'
          driver_id: string | null
          total_weight: number
          max_weight: number
          barangay: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          status?: 'pending' | 'assigned' | 'delivering' | 'delivered'
          driver_id?: string | null
          total_weight?: number
          max_weight?: number
          barangay?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          status?: 'pending' | 'assigned' | 'delivering' | 'delivered'
          driver_id?: string | null
          total_weight?: number
          max_weight?: number
          barangay?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_batches_driver_id_fkey"
            columns: ["driver_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      addresses: {
        Row: {
          id: string
          customer_id: string
          full_name: string
          phone: string
          street_address: string
          barangay: string | null
          latitude: number | null
          longitude: number | null
          created_at: string
        }
        Insert: {
          id?: string
          customer_id: string
          full_name: string
          phone: string
          street_address: string
          barangay?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          customer_id?: string
          full_name?: string
          phone?: string
          street_address?: string
          barangay?: string | null
          latitude?: number | null
          longitude?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_customer_id_fkey"
            columns: ["customer_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      carts: {
        Row: {
          created_at: string
          customer_id: string
          id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      categories: {
        Row: {
          id: string
          name: string
          image_url: string | null
        }
        Insert: {
          id?: string
          name: string
          image_url?: string | null
        }
        Update: {
          id?: string
          name?: string
          image_url?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          price: number
          product_id: string
          quantity: number
        }
        Insert: {
          id?: string
          order_id: string
          price: number
          product_id: string
          quantity: number
        }
        Update: {
          id?: string
          order_id?: string
          price?: number
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      orders: {
        Row: {
          id: string
          created_at: string
          customer_id: string
          driver_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          total: number
          approval_status: 'pending' | 'approved' | 'rejected'
          delivery_status: Database["public"]["Enums"]["order_status"]
          batch_id: string | null
          total_weight: number
          delivery_address: {
            full_name: string
            phone: string
            street_address: string
            barangay: string
          } | null
          
        }
        Insert: {
          id?: string
          created_at?: string
          customer_id: string
          driver_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total: number
          approval_status?: 'pending' | 'approved' | 'rejected'
          delivery_status?: Database["public"]["Enums"]["order_status"]
          batch_id?: string | null
          total_weight?: number
          delivery_address?: {
            full_name: string
            phone: string
            street_address: string
          } | null
          notification_read?: boolean
          notification_dismissed?: boolean
        }
        Update: {
          id?: string
          created_at?: string
          customer_id?: string
          driver_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total?: number
          approval_status?: 'pending' | 'approved' | 'rejected'
          delivery_status?: Database["public"]["Enums"]["order_status"]
          batch_id?: string | null
          total_weight?: number
          delivery_address?: {
            full_name: string
            phone: string
            street_address: string
            barangay: string
          } | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_batch_id_fkey"
            columns: ["batch_id"]
            referencedRelation: "order_batches"
            referencedColumns: ["id"]
          }
        ]
      }
      payment_proofs: {
        Row: {
          file_url: string
          id: string
          order_id: string
          uploaded_at: string
        }
        Insert: {
          file_url: string
          id?: string
          order_id: string
          uploaded_at?: string
        }
        Update: {
          file_url?: string
          id?: string
          order_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          }
        ]
      }
      products: {
        Row: {
          category_id: string
          created_at: string
          description: string
          id: string
          image_url: string
          name: string
          price: number
          quantity: number
          featured: boolean
          weight: number
          unit: string | null
          unit_quantity: number | null
        }
        Insert: {
          category_id: string
          created_at?: string
          description: string
          id?: string
          image_url: string
          name: string
          price: number
          quantity: number
          featured?: boolean
          weight: number
          unit?: string | null
          unit_quantity?: number | null
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string
          name?: string
          price?: number
          quantity?: number
          featured?: boolean
          weight?: number
          unit?: string | null
          unit_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          id: string
          name: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          avatar_url?: string | null
          id: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          avatar_url?: string | null
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      order_batches_with_drivers: {
        Row: {
          id: string
          created_at: string
          status: string
          driver_id: string | null
          driver_name: string | null
          total_weight: number
          max_weight: number
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "order_batches_orders_fkey"
            columns: ["id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["batch_id"]
          }
        ]
      }

    }
    Functions: {
      get_all_batch_summaries: {
        Args: {
          p_barangay: string | null
        }
        Returns: {
          id: string
          created_at: string
          status: string
          delivery_status: string
          driver_id: string | null
          total_weight: number
          barangay: string
          estimated_delivery_time: string | null
          actual_delivery_time: string | null
          notes: string | null
          driver_name: string | null
          order_count: number
        }[]
      }
      consolidate_batches_for_barangay: {
        Args: { target_barangay: string }
        Returns: undefined
      }
      consolidate_underweight_batches: {
        Args: Record<string, never>
        Returns: string
      }
      fix_overweight_batches: {
        Args: Record<string, never>
        Returns: string
      }
      cleanup_empty_batches: {
        Args: Record<string, never>
        Returns: number
      }
    }
    Enums: {
      order_status: "pending" | "assigned" | "delivering" | "delivered"
      user_role: "admin" | "customer" | "driver"
    }
  }
}