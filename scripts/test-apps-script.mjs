import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const properties = {
  EDP_ENDPOINT: 'https://example.supabase.co/functions/v1/sheets-ingest',
  EDP_SOURCE_ID: randomUUID(),
  EDP_SOURCE_SECRET: 'synthetic-secret-for-local-tests-123456',
};
const headers = ['ID', 'Fecha'];
const journal = [
  ['version', 'kind', 'headers_json', 'row_json', 'sent_at'],
  [2, 'report', JSON.stringify(headers), JSON.stringify(['r1', '26/08/2026']), ''],
];
const sheet = {
  getLastRow: () => journal.length,
  getRange: (row, col, count, width) => ({
    getValues: () =>
      journal.slice(row - 1, row - 1 + count).map((r) => r.slice(col - 1, col - 1 + width)),
    setValues: (values) => {
      for (let i = 0; i < count; i++)
        for (let j = 0; j < width; j++) journal[row - 1 + i][col - 1 + j] = values[i][j];
    },
  }),
};
const store = {
  getProperties: () => ({ ...properties }),
  getProperty: (k) => properties[k] ?? null,
  setProperty: (k, v) => {
    properties[k] = v;
  },
  deleteProperty: (k) => {
    delete properties[k];
  },
};
const calls = [];
let status = 422;
const context = vm.createContext({
  PropertiesService: { getScriptProperties: () => store },
  SpreadsheetApp: {
    getActive: () => ({ getId: () => 'synthetic-sheet', getSheetByName: () => sheet }),
  },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  Utilities: {
    getUuid: randomUUID,
    Charset: { UTF_8: 'utf8' },
    computeHmacSha256Signature: (message, secret) =>
      [...createHmac('sha256', secret).update(message).digest()].map((b) =>
        b > 127 ? b - 256 : b,
      ),
  },
  UrlFetchApp: {
    fetch: (url, options) => {
      calls.push({ url, ...options });
      return { getResponseCode: () => status };
    },
  },
  console,
});
vm.runInContext(await readFile('integrations/apps-script/Code.gs', 'utf8'), context);
assert.throws(() => vm.runInContext('edpFlush()', context));
assert.equal(properties.EDP_NEXT_ROW, undefined);
console.log('PASS error HTTP conserva cursor y cola');
journal.push([3, 'report', JSON.stringify(headers), JSON.stringify(['r2', '27/08/2026']), '']);
status = 200;
vm.runInContext('edpFlush()', context);
const original = JSON.parse(calls[0].payload),
  retried = JSON.parse(calls[1].payload);
assert.deepEqual(original, retried);
assert.equal(properties.EDP_NEXT_ROW, '3');
console.log('PASS reintento conserva UUID y contenido aun con filas nuevas');
const expected = createHmac('sha256', properties.EDP_SOURCE_SECRET)
  .update(calls[1].headers['x-edp-timestamp'] + '.' + calls[1].payload)
  .digest('hex');
assert.equal(calls[1].headers['x-edp-signature'], expected);
console.log('PASS firma HMAC verificada independientemente');
vm.runInContext('edpFlush()', context);
assert.equal(JSON.parse(calls[2].payload).entries[0].row[0], 'r2');
assert.equal(properties.EDP_NEXT_ROW, '4');
console.log('PASS fila agregada se procesa en lote siguiente');
const before = calls.length;
vm.runInContext('edpFlush()', context);
assert.equal(calls.length, before);
console.log('PASS sin cambios no hay descarga/envío de historial');
console.log(
  'Apps Script: 5 assertions passed in mocked Apps Script runtime; Google triggers not exercised.',
);
