import { createClient } from '@supabase/supabase-js';
import {
  operatorHeaders,
  wbsHeaders,
  mapRow,
  contentHash,
  dateFromSheet,
} from '../../../shared/domain.ts';
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
