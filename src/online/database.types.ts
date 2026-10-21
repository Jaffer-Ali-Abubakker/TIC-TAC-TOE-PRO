
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "online_moves": {
                  Row: {
                    "board_after": (string)[],"cell_index": number,"created_at": string,"id": number,"move_id": string,"move_number": number,"player_symbol": string,"room_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "board_after": (string)[],"cell_index": number,"created_at"?: string,"id"?: never,"move_id": string,"move_number": number,"player_symbol": string,"room_id": string,"user_id": string
                  }
                  Update: {
                    "board_after"?: (string)[],"cell_index"?: number,"created_at"?: string,"id"?: never,"move_id"?: string,"move_number"?: number,"player_symbol"?: string,"room_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "online_moves_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "online_rooms"
      referencedColumns: ["id"]
    }
                  ]
                },"online_room_players": {
                  Row: {
                    "display_name": string | null,"is_owner": boolean,"joined_at": string,"last_seen_at": string,"player_symbol": string,"rematch_requested": boolean,"room_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "display_name"?: string | null,"is_owner"?: boolean,"joined_at"?: string,"last_seen_at"?: string,"player_symbol": string,"rematch_requested"?: boolean,"room_id": string,"user_id": string
                  }
                  Update: {
                    "display_name"?: string | null,"is_owner"?: boolean,"joined_at"?: string,"last_seen_at"?: string,"player_symbol"?: string,"rematch_requested"?: boolean,"room_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "online_room_players_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "online_rooms"
      referencedColumns: ["id"]
    }
                  ]
                },"online_rooms": {
                  Row: {
                    "board": (string)[],"created_at": string,"current_turn": string,"expires_at": string,"id": string,"join_code": string,"last_move_index": number | null,"moves_played": number,"result": string | null,"round_number": number,"status": string,"updated_at": string,"version": number,"winner_symbol": string | null,"winning_combination": (number)[] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "board": (string)[],"created_at"?: string,"current_turn"?: string,"expires_at"?: string,"id"?: string,"join_code": string,"last_move_index"?: number | null,"moves_played"?: number,"result"?: string | null,"round_number"?: number,"status"?: string,"updated_at"?: string,"version"?: number,"winner_symbol"?: string | null,"winning_combination"?: (number)[] | null
                  }
                  Update: {
                    "board"?: (string)[],"created_at"?: string,"current_turn"?: string,"expires_at"?: string,"id"?: string,"join_code"?: string,"last_move_index"?: number | null,"moves_played"?: number,"result"?: string | null,"round_number"?: number,"status"?: string,"updated_at"?: string,"version"?: number,"winner_symbol"?: string | null,"winning_combination"?: (number)[] | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_online_room":
{ Args: { "p_display_name"?: string }; Returns: Json
                           },
"get_online_room_state":
{ Args: { "p_join_code": string }; Returns: Json
                           },
"join_online_room":
{ Args: { "p_display_name"?: string,"p_join_code": string }; Returns: Json
                           },
"leave_online_room":
{ Args: { "p_join_code": string }; Returns: Json
                           },
"online_board_is_full":
{ Args: { "p_board": (string)[] }; Returns: boolean
                           },
"online_board_is_valid":
{ Args: { "p_board": (string)[] }; Returns: boolean
                           },
"online_code_is_valid":
{ Args: { "p_code": string }; Returns: boolean
                           },
"online_expire_rooms":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"online_generate_join_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"online_is_room_member":
{ Args: { "p_room_id": string,"p_user_id": string }; Returns: boolean
                           },
"online_normalize_code":
{ Args: { "p_code": string }; Returns: string
                           },
"online_purge_expired_rooms":
{ Args: { "p_older_than"?: string }; Returns: number
                           },
"online_room_id_from_topic":
{ Args: { "p_topic": string }; Returns: string
                           },
"online_room_payload":
{ Args: { "p_room_id": string,"p_user_id": string }; Returns: Json
                           },
"online_sanitize_name":
{ Args: { "p_name": string }; Returns: string
                           },
"online_winning_combination":
{ Args: { "p_board": (string)[] }; Returns: (number)[]
                           },
"request_online_rematch":
{ Args: { "p_join_code": string }; Returns: Json
                           },
"submit_online_move":
{ Args: { "p_cell_index": number,"p_expected_version": number,"p_join_code": string,"p_move_id": string }; Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const

