import Decimal from 'decimal.js';
export const OPERATIONAL_TIMEZONE = 'America/Argentina/San_Juan';
export function isoDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Fecha ISO inválida');
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value)
    throw new Error('Fecha inexistente');
  return value;
}
export function periodFor(value: string) {
  isoDate(value);
  const [y, m, d] = value.split('-').map(Number);
  const end = new Date(Date.UTC(y, m - 1 + (d >= 26 ? 1 : 0), 25, 12));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 26, 12));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: end.toISOString().slice(0, 7),
  };
}
export function dateFromSheet(value: unknown) {
  const s = String(value ?? '');
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  return isoDate(match ? `${match[3]}-${match[2]}-${match[1]}` : s);
}
export const operatorHeaders = {
  Fecha: 'work_date',
  ID: 'external_id',
  Interno: 'equipment_original',
  Equipo: 'equipment_description',
  Operador: 'operator',
  'Supervisor Delta': 'supervisor',
  'Supervisor Vial Cliente': 'client_supervisor',
  'Turno de trabajo': 'shift',
  'N° Parte': 'report_number',
  'Proyecto ': 'project',
  'Area de trabajo': 'work_area',
  'Horómetro inicial': 'meter_start',
  'Horómetro final': 'meter_end',
  'Cant. Hs.': 'reported_hours',
  'OD o FS': 'operational_status',
  Combustible: 'fuel',
  Aceite: 'oil',
  'Tarea 1': 'task_1',
  'Tarea 2': 'task_2',
  'Información sobre Desgaste': 'wear',
  'Observaciones 1': 'notes_1',
  'Observaciones 2': 'notes_2',
  'Cambio de tareas planificadas': 'task_changes',
  'Firma ': 'signature',
} as const;
export const wbsHeaders = [
  'Equipo',
  'tipo equipo',
  'Centro de costo',
  'Costo de hora',
  'Costo de hora extra',
  'Costo de movilizacion',
  'Costo de desmovilizacion',
  'Costo de OD',
  'Costo FS',
] as const;
export function mapRow(headers: string[], row: unknown[], required: readonly string[]) {
  if (new Set(headers).size !== headers.length) throw new Error('Encabezados duplicados');
  for (const h of required)
    if (!headers.includes(h)) throw new Error(`Falta encabezado exacto: ${JSON.stringify(h)}`);
  return Object.fromEntries(headers.map((h, i) => [h, row[i] ?? null]));
}
export function normalizeEquipment(
  code: string,
  master: readonly string[],
  aliases: Record<string, string>,
) {
  if (master.includes(code)) return code;
  const mapped = aliases[code];
  return mapped && master.includes(mapped) ? mapped : null;
}
export function meterDifference(start: string, end: string, unit: 'hours' | 'km' | 'unknown') {
  const diff = new Decimal(end).minus(start);
  return {
    hourDifference: unit === 'hours' ? diff.toFixed(3) : null,
    odometerDifference: unit === 'km' ? diff.toFixed(3) : null,
    inconsistent: diff.isNegative(),
  };
}
export type Component =
  | 'normal'
  | 'extra'
  | 'od'
  | 'fs'
  | 'mobilization'
  | 'demobilization'
  | 'adjustment';
export function amount(quantity: string, rate: string) {
  const q = new Decimal(quantity),
    r = new Decimal(rate);
  if (!q.isFinite() || !r.isFinite() || q.isNegative() || r.isNegative())
    throw new Error('Cantidad/tarifa inválida');
  return q.mul(r).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export async function contentHash(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}
