// Generated from shared/domain.ts + sheets-ingest/index.ts. No secrets.
import Decimal from 'npm:decimal.js@10.6.0';
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

import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const encoder = new TextEncoder();
function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
export async function signature(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message))),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
}
function constantTime(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
Deno.serve(async (req) => {
  if (req.method !== 'POST') return response(405, { error: 'POST required' });
  const url = Deno.env.get('SUPABASE_URL') ?? '',
    key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    expected = Deno.env.get('EXPECTED_SUPABASE_REF');
  if (
    !expected ||
    (!url.includes(`://${expected}.supabase.co`) && !url.includes(`://${expected}.supabase.com`))
  )
    return response(503, { error: 'Destination not verified' });
  const source = req.headers.get('x-edp-source') ?? '',
    timestamp = req.headers.get('x-edp-timestamp') ?? '',
    sig = req.headers.get('x-edp-signature') ?? '';
  if (
    !/^[0-9a-f-]{36}$/i.test(source) ||
    !/^\d{13}$/.test(timestamp) ||
    Math.abs(Date.now() - Number(timestamp)) > 300000
  )
    return response(401, { error: 'Invalid source or timestamp' });
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > 1000000) return response(413, { error: 'Batch too large' });
  const text = await req.text();
  if (encoder.encode(text).length > 1000000) return response(413, { error: 'Batch too large' });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: s, error: lookupError } = await db.rpc('edp_source_backend', { source });
  if (lookupError || !s || !constantTime(await signature(s.secret, `${timestamp}.${text}`), sig))
    return response(401, { error: 'Source authentication failed' });
  let batch: string | undefined;
  try {
    const payload = JSON.parse(text);
    batch = payload.batch;
    if (
      !/^[0-9a-f-]{36}$/i.test(batch ?? '') ||
      payload.spreadsheet_id !== s.spreadsheet_id ||
      !Array.isArray(payload.entries) ||
      payload.entries.length > 100
    )
      throw new Error('Invalid batch');
    const seen = new Set<string>();
    const entries = [];
    for (const item of payload.entries) {
      const required =
        item.kind === 'report'
          ? Object.keys(operatorHeaders)
          : item.kind === 'wbs'
            ? [...wbsHeaders]
            : null;
      if (
        !required ||
        !Array.isArray(item.headers) ||
        !Array.isArray(item.row) ||
        !Number.isSafeInteger(item.version) ||
        item.version < 1
      )
        throw new Error('Invalid journal entry');
      const raw = mapRow(item.headers, item.row, required);
      const external_id = String(raw[item.kind === 'report' ? 'ID' : 'Equipo'] ?? '');
      if (!external_id || seen.has(`${item.kind}:${external_id}`))
        throw new Error('Missing/duplicate external ID inside batch');
      seen.add(`${item.kind}:${external_id}`);
      if (item.kind === 'report') dateFromSheet(raw.Fecha);
      entries.push({
        kind: item.kind,
        external_id,
        raw,
        version: item.version,
        hash: await contentHash(raw),
      });
    }
    const { data, error } = await db.rpc('edp_ingest_batch', { source, batch, entries });
    if (error) throw error;
    return response(200, { ok: true, ...data });
  } catch (e) {
    // Keep error detail server-side; never return credentials or raw operational rows.
    const message = (e as Error).message?.slice(0, 400) ?? 'Invalid batch';
    if (batch && /^[0-9a-f-]{36}$/i.test(batch))
      await db
        .from('edp_sync_runs')
        .upsert(
          {
            tenant_id: s.tenant_id,
            source_id: source,
            batch_id: batch,
            status: 'error',
            error: message,
          },
          { onConflict: 'source_id,batch_id', ignoreDuplicates: true },
        );
    return response(422, {
      error: 'Batch rejected; inspect synchronization log. No partial commit.',
    });
  }
});
