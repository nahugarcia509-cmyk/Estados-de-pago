/** EDP: install on a COPY for testing. No Supabase service/anon keys in this script. */
const EDP_JOURNAL = '_EDP_CHANGELOG';
const EDP_SHEETS = { 'Registro de operadores': 'report', WBS: 'wbs' };
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Estados de Pago')
    .addItem('1. Instalar cola y disparadores', 'edpInstall')
    .addItem('2. Preparar carga inicial (una vez)', 'edpInitialLoad')
    .addItem('Enviar pendientes ahora', 'edpFlush')
    .addItem('Ver estado', 'edpStatus')
    .addToUi();
}
function edpConfig() {
  const p = PropertiesService.getScriptProperties().getProperties();
  for (const k of ['EDP_ENDPOINT', 'EDP_SOURCE_ID', 'EDP_SOURCE_SECRET'])
    if (!p[k]) throw new Error('Configurar propiedad de script ' + k);
  if (
    !/^https:\/\/[^/]+\/functions\/v1\/sheets-ingest$/.test(p.EDP_ENDPOINT) ||
    p.EDP_SOURCE_SECRET.length < 32
  )
    throw new Error('Endpoint HTTPS o secreto inválido');
  return p;
}
function edpJournal() {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(EDP_JOURNAL);
  if (!s) {
    s = ss.insertSheet(EDP_JOURNAL);
    s.appendRow(['version', 'kind', 'headers_json', 'row_json', 'sent_at']);
    s.hideSheet();
  }
  return s;
}
function edpInstall() {
  edpConfig();
  edpJournal();
  const handlers = ['edpOnEdit', 'edpFlush'];
  ScriptApp.getProjectTriggers()
    .filter((t) => handlers.includes(t.getHandlerFunction()))
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('edpOnEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
  ScriptApp.newTrigger('edpFlush').timeBased().everyMinutes(5).create();
  PropertiesService.getScriptProperties().setProperty(
    'EDP_SPREADSHEET_ID',
    SpreadsheetApp.getActive().getId(),
  );
}
function edpAppend(sheet, start, count) {
  const kind = EDP_SHEETS[sheet.getName()];
  if (!kind) return;
  const width = kind === 'report' ? 24 : 9;
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  const values = sheet.getRange(start, 1, count, width).getDisplayValues();
  const journal = edpJournal();
  const output = [];
  values.forEach((row) => {
    if (row.every((x) => x === '')) return;
    output.push([
      journal.getLastRow() + output.length + 1,
      kind,
      JSON.stringify(headers),
      JSON.stringify(row),
      '',
    ]);
  });
  if (output.length)
    journal.getRange(journal.getLastRow() + 1, 1, output.length, 5).setValues(output);
}
function edpOnEdit(event) {
  if (!event || !event.range) return;
  const sheet = event.range.getSheet();
  if (!EDP_SHEETS[sheet.getName()] || event.range.getLastRow() < 2) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (event.range.getRow() === 1) throw new Error('No modificar encabezados: revisar mapeo');
    const first = Math.max(2, event.range.getRow());
    edpAppend(sheet, first, event.range.getLastRow() - first + 1);
  } finally {
    lock.releaseLock();
  }
}
function edpInitialLoad() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('EDP_INITIAL_DONE'))
    throw new Error(
      'Carga inicial ya preparada. No repetir; usar ediciones o reconciliación controlada.',
    );
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    for (const name of ['WBS', 'Registro de operadores']) {
      const s = SpreadsheetApp.getActive().getSheetByName(name);
      if (!s) throw new Error('Falta hoja ' + name);
      if (s.getLastRow() > 1) edpAppend(s, 2, s.getLastRow() - 1);
    }
    p.setProperty('EDP_INITIAL_DONE', 'true');
  } finally {
    lock.releaseLock();
  }
}
function edpFlush() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const c = edpConfig(),
      p = PropertiesService.getScriptProperties(),
      sheet = edpJournal(),
      start = Number(p.getProperty('EDP_NEXT_ROW') || '2'),
      last = sheet.getLastRow();
    if (start > last) return;
    const countKey = 'EDP_COUNT_' + start;
    let count = Number(p.getProperty(countKey) || '0');
    if (!count) {
      count = Math.min(50, last - start + 1);
      p.setProperty(countKey, String(count));
    }
    const values = sheet.getRange(start, 1, count, 5).getValues();
    // Coalesce repeated edits within this batch by stable external ID; preserve the latest snapshot.
    const latest = {};
    values.forEach((v) => {
      const headers = JSON.parse(v[2]),
        row = JSON.parse(v[3]),
        key = v[1] + ':' + row[headers.indexOf(v[1] === 'report' ? 'ID' : 'Equipo')];
      latest[key] = { kind: v[1], headers: headers, row: row, version: Number(v[0]) };
    });
    const batchKey = 'EDP_BATCH_' + start;
    let batch = p.getProperty(batchKey);
    if (!batch) {
      batch = Utilities.getUuid();
      p.setProperty(batchKey, batch);
    }
    const payload = JSON.stringify({
      batch: batch,
      spreadsheet_id: SpreadsheetApp.getActive().getId(),
      entries: Object.values(latest),
    });
    const timestamp = String(Date.now());
    const bytes = Utilities.computeHmacSha256Signature(
      timestamp + '.' + payload,
      c.EDP_SOURCE_SECRET,
      Utilities.Charset.UTF_8,
    );
    const signature = bytes.map((b) => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
    const result = UrlFetchApp.fetch(c.EDP_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      payload: payload,
      headers: {
        'x-edp-source': c.EDP_SOURCE_ID,
        'x-edp-timestamp': timestamp,
        'x-edp-signature': signature,
      },
      muteHttpExceptions: true,
    });
    if (result.getResponseCode() !== 200) {
      p.setProperty(
        'EDP_LAST_ERROR',
        new Date().toISOString() + ' HTTP ' + result.getResponseCode(),
      );
      throw new Error('Lote rechazado. Revisar sincronización; cola y cursor conservados.');
    }
    sheet.getRange(start, 5, count, 1).setValues(values.map(() => [new Date().toISOString()]));
    p.setProperty('EDP_NEXT_ROW', String(start + count));
    p.setProperty('EDP_LAST_OK', new Date().toISOString());
    p.deleteProperty('EDP_LAST_ERROR');
    p.deleteProperty(batchKey);
    p.deleteProperty(countKey);
  } finally {
    lock.releaseLock();
  }
}
function edpStatus() {
  const p = PropertiesService.getScriptProperties();
  SpreadsheetApp.getUi().alert(
    'Último envío: ' +
      (p.getProperty('EDP_LAST_OK') || 'Nunca') +
      '\nError: ' +
      (p.getProperty('EDP_LAST_ERROR') || 'Sin errores') +
      '\nPróxima fila de cola: ' +
      (p.getProperty('EDP_NEXT_ROW') || '2'),
  );
}
