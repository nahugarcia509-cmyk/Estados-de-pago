import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { operatorHeaders } from '../shared/domain';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upsert: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc: mocks.rpc, from: () => ({ upsert: mocks.upsert }) }),
}));
let handler: (req: Request) => Promise<Response>;
let signature: (secret: string, message: string) => Promise<string>;
const source = '10000000-0000-0000-0000-000000000001',
  batch = '20000000-0000-0000-0000-000000000001',
  secret = 'synthetic-hmac-secret-not-used-remotely';
beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) =>
        ({
          SUPABASE_URL: 'https://lygeqrjozogbjibgimym.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key',
          EXPECTED_SUPABASE_REF: 'lygeqrjozogbjibgimym',
        })[name],
    },
    serve: (fn: typeof handler) => {
      handler = fn;
    },
  });
  signature = (await import('../supabase/functions/sheets-ingest/index')).signature;
});
beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.upsert.mockReset();
  mocks.rpc.mockImplementation(async (name: string) =>
    name === 'edp_source_backend'
      ? {
          data: { secret, spreadsheet_id: 'test-sheet', tenant_id: 'synthetic-tenant' },
          error: null,
        }
      : { data: { processed: 1 }, error: null },
  );
  mocks.upsert.mockResolvedValue({ error: null });
});
async function request(payload: unknown, overrides: Record<string, string> = {}) {
  const body = JSON.stringify(payload),
    timestamp = String(Date.now());
  return new Request('https://example.test', {
    method: 'POST',
    body,
    headers: {
      'x-edp-source': source,
      'x-edp-timestamp': timestamp,
      'x-edp-signature': await signature(secret, `${timestamp}.${body}`),
      ...overrides,
    },
  });
}
const headers = Object.keys(operatorHeaders);
const row = headers.map((h) => (h === 'Fecha' ? '26/08/2026' : h === 'ID' ? 'synthetic-id' : ''));
const payload = {
  batch,
  spreadsheet_id: 'test-sheet',
  entries: [{ kind: 'report', headers, row, version: 1 }],
};
describe('Backend HTTP de sincronización (Supabase simulado)', () => {
  it('firma válida permite lote normalizado', async () => {
    const response = await handler(await request(payload));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      'edp_ingest_batch',
      expect.objectContaining({
        source,
        batch,
        entries: expect.arrayContaining([
          expect.objectContaining({
            external_id: 'synthetic-id',
            raw: expect.objectContaining({ 'Proyecto ': '' }),
          }),
        ]),
      }),
    );
  });
  it('firma falsa no ejecuta importación', async () => {
    expect((await handler(await request(payload, { 'x-edp-signature': 'invalid' }))).status).toBe(
      401,
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('rechaza timestamp vencido antes de leer fuente', async () => {
    expect(
      (await handler(await request(payload, { 'x-edp-timestamp': '1000000000000' }))).status,
    ).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('una fuente no puede enviar otra planilla', async () => {
    expect(
      (await handler(await request({ ...payload, spreadsheet_id: 'another-sheet' }))).status,
    ).toBe(422);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it('rechaza deriva de encabezados sin perder espacios', async () => {
    expect(
      (
        await handler(
          await request({
            ...payload,
            entries: [{ ...payload.entries[0], headers: headers.map((h) => h.trim()) }],
          }),
        )
      ).status,
    ).toBe(422);
  });
  it('rechaza IDs repetidos en el mismo lote', async () => {
    expect(
      (
        await handler(
          await request({ ...payload, entries: [payload.entries[0], payload.entries[0]] }),
        )
      ).status,
    ).toBe(422);
  });
  it('rechaza método GET', async () =>
    expect((await handler(new Request('https://example.test'))).status).toBe(405));
});
