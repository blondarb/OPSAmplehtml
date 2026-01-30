/**
 * TypeScript interfaces for saved recommendation plans.
 */

export interface SavedPlan {
  id: string
  tenant_id: string
  user_id: string
  name: string
  description?: string
  source_plan_key?: string
  selected_items: Record<string, string[]>
  custom_items: Record<string, string[]>
  plan_overrides: Record<string, unknown>
  is_default: boolean
  use_count: number
  last_used?: string
  created_at: string
  updated_at: string
}

export interface SavedPlanCreateInput {
  name: string
  description?: string
  source_plan_key?: string
  selected_items: Record<string, string[]>
  custom_items: Record<string, string[]>
}

export interface SavedPlanUpdateInput {
  name?: string
  description?: string
  selected_items?: Record<string, string[]>
  custom_items?: Record<string, string[]>
  is_default?: boolean
}
