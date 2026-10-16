import { db } from '../lib/client';
import type { Filters, Report, Summary } from '../lib/types';
export function filterArgs(f: Filters) {
  return {
    tenant: f.tenant || null,
    from: f.from,
    to: f.to,
    equipment: f.equipment || null,
    cost_center: f.cost_center || null,
    project: f.project || null,
    equipment_type: f.equipment_type || null,
    shift: f.shift || null,
    operational_status: f.operational_status || null,
    validation: f.validation || null,
    search: f.search || null,
  };
}
export async function reports(f: Filters, page = 0, sort = 'work_date', ascending = false) {
  const { data, error } = await db().rpc('edp_reports', {
    filters: filterArgs(f),
    page_number: page,
    sort_column: sort,
    sort_ascending: ascending,
  });
  if (error) throw error;
  return data as { rows: Report[]; total: number };
}
export async function summary(f: Filters) {
  const { data, error } = await db().rpc('edp_summary', { filters: filterArgs(f) });
  if (error) throw error;
  return data as Summary;
}
export async function catalog(table: string, equals: Record<string, string> = {}) {
  let query = db().from(`edp_${table}`).select('*');
  for (const [key, value] of Object.entries(equals)) query = query.eq(key, value);
  const { data, error } = await query.limit(500);
  if (error) throw error;
  return data ?? [];
}
export async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await db().rpc(name, args);
  if (error) throw error;
  return data;
}
