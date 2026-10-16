export type Role = 'vicuna' | 'admin' | 'operator' | 'superadmin';
export interface Membership {
  tenant_id: string;
  role: Role;
  tenant_name: string;
  organization_id: string;
}
export interface Filters {
  tenant: string;
  from: string;
  to: string;
  equipment: string;
  cost_center: string;
  project: string;
  equipment_type: string;
  shift: string;
  operational_status: string;
  validation: string;
  search: string;
}
export interface Report extends FinancialDetail {
  id: string;
  tenant_id: string;
  work_date: string;
  equipment_id: string | null;
  equipment_original: string;
  equipment_type: string | null;
  operator: string;
  shift: string;
  report_number: string;
  project: string;
  cost_center_id: string | null;
  cost_center_name: string | null;
  meter_start: string | null;
  meter_end: string | null;
  reported_hours: string | null;
  hour_difference: string | null;
  odometer_difference: string | null;
  operational_status: string;
  validation: string;
  raw: Record<string, unknown>;
  issues: string[];
  notes: string;
  origin: string;
  updated_at: string;
  tenant_name: string;
}
export interface Equipment {
  id: string;
  tenant_id: string;
  code: string;
  equipment_type: string;
  meter_unit: string;
}
export interface FinancialDetail {
  approved_hours?: string;
  amount?: string;
  applied_rates?: {
    component: string;
    quantity: string;
    rate: string;
    amount: string;
    demonstration: boolean;
  }[];
}
export interface Summary {
  total: string;
  hours: string;
  equipment_count: number;
  pending: number;
  components: { component: string; amount: string }[];
  daily: { date: string; amount: string; hours: string }[];
  centers: { name: string; amount: string }[];
  ranking: { name: string; amount: string }[];
  types: { name: string; amount: string }[];
}
