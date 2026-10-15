import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
let passed = 0;
await db.exec(
  `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`,
);
for (const f of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql')).sort())
  await db.exec(await readFile(`supabase/migrations/${f}`, 'utf8'));
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const q = async (s, p = []) => (await db.query(s, p)).rows;
const eq = async (name, sql, expected) => {
  assert.equal(Object.values((await q(sql))[0])[0], expected, name);
  passed++;
  console.log(`PASS ${name}`);
};
async function deny(name, sql) {
  await db.exec('savepoint denied');
  let rejected = false;
  try {
    await db.exec(sql);
  } catch {
    rejected = true;
  }
  await db.exec('rollback to savepoint denied');
  assert.ok(rejected, name);
  passed++;
  console.log(`PASS ${name}`);
}
await db.exec(
  `insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');insert into public.edp_organizations values('${id(10)}','Org A'),('${id(11)}','Org B');insert into public.edp_tenants values('${id(20)}','${id(10)}','Principal'),('${id(21)}','${id(10)}','Contratista A'),('${id(22)}','${id(10)}','Contratista B'),('${id(23)}','${id(11)}','Externa');insert into edp_private.memberships values('${id(1)}','${id(21)}','admin'),('${id(2)}','${id(22)}','admin'),('${id(3)}','${id(20)}','vicuna'),('${id(4)}','${id(21)}','operator');insert into edp_private.platform_admins values('${id(5)}');insert into public.edp_equipment(id,tenant_id,code,equipment_type,meter_unit) values('${id(30)}','${id(21)}','TEST-A','Máquina','hours'),('${id(31)}','${id(22)}','TEST-B','Máquina','hours'),('${id(32)}','${id(23)}','TEST-C','Máquina','hours'),('${id(33)}','${id(21)}','TEST-KM','Camioneta','km');insert into public.edp_cost_centers(id,tenant_id,name) values('${id(40)}','${id(21)}','Centro A'),('${id(41)}','${id(22)}','Centro B');insert into public.edp_rates(id,tenant_id,equipment_id,valid_from,valid_to,normal,extra,od,fs,mobilization,demobilization) values('${id(50)}','${id(21)}','${id(30)}','2026-08-26','2026-09-25',100.1,200,10,20,500,300);insert into public.edp_rules(id,tenant_id,component,unit,description,approved_by) values('${id(60)}','${id(21)}','normal','hours','REGLA SINTÉTICA DE PRUEBA','${id(1)}');`,
);
await db.exec('begin');
async function as(user) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(user)]);
  await db.exec('set local role authenticated');
}
await as(1);
await eq('A solo ve sus equipos', 'select count(*)::int from public.edp_equipment', 2);
await eq(
  'A no ve B',
  `select count(*)::int from public.edp_equipment where tenant_id='${id(22)}'`,
  0,
);
await deny(
  'no inserta directo otra empresa',
  `insert into public.edp_equipment(tenant_id,code,equipment_type) values('${id(22)}','X','X')`,
);
await deny(
  'no modifica directamente otra empresa',
  `update public.edp_equipment set code='X' where tenant_id='${id(22)}'`,
);
await deny(
  'no elimina registros de otra empresa',
  `delete from public.edp_equipment where tenant_id='${id(22)}'`,
);
await deny(
  'no eleva membresías',
  `insert into edp_private.memberships values('${id(1)}','${id(20)}','vicuna')`,
);
const payload = {
  equipment_id: id(30),
  work_date: '2026-08-26',
  operator: 'Prueba',
  shift: 'TURNO DIA',
  report_number: 'T1',
  cost_center_id: id(40),
  meter_start: '1',
  meter_end: '3',
  reported_hours: '2',
};
const [{ rid }] = await q('select public.edp_create_report($1::jsonb) rid', [
  JSON.stringify(payload),
]);
await deny(
  'duplicado operativo rechazado',
  `select public.edp_create_report('${JSON.stringify(payload)}')`,
);
await deny(
  'equipo de otra empresa rechazado',
  `select public.edp_create_report('${JSON.stringify({ ...payload, equipment_id: id(31) })}')`,
);
await deny(
  'FK compuesta impide centro ajeno',
  `select public.edp_create_report('${JSON.stringify({ ...payload, report_number: 'T2', cost_center_id: id(41) })}')`,
);
await deny(
  'sin regla contractual no factura',
  `select public.edp_add_billable('${JSON.stringify({ report_id: rid, rate_id: id(50), component: 'od', rule_id: id(60), quantity: '1', reason: 'Prueba regla' })}')`,
);
const billable = {
  report_id: rid,
  rate_id: id(50),
  rule_id: id(60),
  component: 'normal',
  quantity: '2',
  reason: 'Validación sintética',
};
await q('select public.edp_add_billable($1::jsonb)', [JSON.stringify(billable)]);
await eq('importe decimal exacto', 'select amount::text from public.edp_billables', '200.20');
await eq(
  'detalle paginado conserva importes exactos',
  `select public.edp_reports('{"from":"2026-08-26","to":"2026-09-25"}')->'rows'->0->>'amount'`,
  '200.20',
);
await deny(
  'orden arbitrario rechazado',
  `select public.edp_reports('{"from":"2026-08-26","to":"2026-09-25"}',0,'tenant_id;drop table test',true)`,
);
await deny(
  'no factura concepto duplicado',
  `select public.edp_add_billable('${JSON.stringify(billable)}')`,
);
await as(4);
await eq('operador no lee tarifas', 'select count(*)::int from public.edp_rates', 0);
await eq('operador no lee importes', 'select count(*)::int from public.edp_billables', 0);
await eq('operador no lee auditoría financiera', 'select count(*)::int from public.edp_audit', 0);
await eq(
  'operador no recibe importe en detalle',
  `select (public.edp_reports('{"from":"2026-08-26","to":"2026-09-25"}')->'rows'->0 ? 'amount')`,
  false,
);
await deny('operador no aprueba', `select public.edp_add_billable('${JSON.stringify(billable)}')`);
await deny(
  'operador no consulta dashboard financiero',
  `select public.edp_summary('{"from":"2026-08-26","to":"2026-09-25"}')`,
);
await as(3);
await eq(
  'Vicuña ve contratistas de su organización',
  'select count(*)::int from public.edp_equipment',
  3,
);
await eq(
  'Vicuña no ve otra organización',
  `select count(*)::int from public.edp_equipment where tenant_id='${id(23)}'`,
  0,
);
await eq(
  'agregación financiera real',
  `select public.edp_summary('{"from":"2026-08-26","to":"2026-09-25"}')->>'total'`,
  '200.20',
);
await eq(
  'filtro de equipo aplica al total',
  `select public.edp_summary('{"from":"2026-08-26","to":"2026-09-25","equipment":"${id(31)}"}')->>'total'`,
  '0',
);
await as(5);
await eq(
  'superadmin no tiene lectura implícita',
  'select count(*)::int from public.edp_equipment',
  0,
);
await as(1);
const [{ id: period }] = await q('select id from public.edp_periods');
await deny(
  'cierre sin aprobar rechazado',
  `select public.edp_transition_period('${period}','closed','prueba')`,
);
await db.exec(
  `select public.edp_transition_period('${period}','review','prueba');select public.edp_transition_period('${period}','approved','prueba');select public.edp_transition_period('${period}','closed','prueba')`,
);
await deny(
  'parte nuevo en período cerrado',
  `select public.edp_create_report('${JSON.stringify({ ...payload, report_number: 'T3' })}')`,
);
await deny('no reabre cierre', `select public.edp_transition_period('${period}','draft','prueba')`);
await db.exec(
  `select public.edp_add_adjustment('${period}',-0.20,'Corrección sintética autorizada')`,
);
await eq(
  'ajuste post cierre trazable',
  `select public.edp_summary('{"from":"2026-08-26","to":"2026-09-25"}')->>'total'`,
  '200.00',
);
await eq(
  'auditoría conserva operación financiera',
  `select count(*)::int from public.edp_audit where entity='edp_billables'`,
  1,
);
await db.exec('reset role');
await deny(
  'tarifa histórica inmutable',
  `update public.edp_rates set normal=999 where id='${id(50)}'`,
);
await deny(
  'versiones de tarifa no se superponen',
  `insert into public.edp_rates(tenant_id,equipment_id,valid_from,normal,extra,od,fs,mobilization,demobilization) values('${id(21)}','${id(30)}','2026-09-01',1,1,1,1,1,1)`,
);
await db.exec(
  `insert into public.edp_rates(tenant_id,equipment_id,valid_from,normal,extra,od,fs,mobilization,demobilization) values('${id(21)}','${id(30)}','2026-09-26',999,1,1,1,1,1)`,
);
await eq(
  'nueva tarifa no reescribe importe cerrado',
  'select amount::text from public.edp_billables',
  '200.20',
);
await db.exec(
  `insert into public.edp_sync_sources(id,tenant_id,spreadsheet_id,enabled,wbs_valid_from,wbs_valid_to) values('${id(70)}','${id(21)}','synthetic',true,'2026-10-26','2026-11-25')`,
);
await as(1);
await deny(
  'cliente no puede llamar import privilegiado',
  `select public.edp_ingest_batch('${id(70)}','${id(80)}','[]')`,
);
await db.exec('reset role');
await db.exec('set local role service_role');
const raw = {
  Fecha: '26/10/2026',
  ID: 'test-source-1',
  Interno: 'UNKNOWN-JM',
  Equipo: 'Prueba',
  Operador: 'Sintético',
  'Supervisor Delta': 'X',
  'Supervisor Vial Cliente': 'Y',
  'Turno de trabajo': 'TURNO DIA',
  'N° Parte': 'SYNC-1',
  'Proyecto ': 'P',
  'Area de trabajo': 'A',
  'Horómetro inicial': '1',
  'Horómetro final': '3',
  'Cant. Hs.': '2',
  'OD o FS': '',
  Combustible: 'Sin carga',
  Aceite: 'Sin carga',
  'Tarea 1': 'Prueba',
  'Tarea 2': '',
  'Información sobre Desgaste': '',
  'Observaciones 1': 'original',
  'Observaciones 2': '',
  'Cambio de tareas planificadas': '',
  'Firma ': '',
};
const entry = { kind: 'report', external_id: 'test-source-1', version: 1, hash: 'hash-1', raw };
const ingest = async (batch, entries) =>
  q('select public.edp_ingest_batch($1,$2,$3::jsonb) result', [
    id(70),
    id(batch),
    JSON.stringify(entries),
  ]);
await ingest(80, [entry]);
await eq(
  'sin alias ni centro queda pendiente',
  `select cardinality(issues)::int from public.edp_reports_data where external_id='test-source-1'`,
  2,
);
await ingest(80, [entry]);
await eq(
  'reintento no duplica',
  `select count(*)::int from public.edp_reports_data where source_id='${id(70)}'`,
  1,
);
await ingest(81, [
  { ...entry, version: 2, hash: 'hash-2', raw: { ...raw, 'Observaciones 1': 'modificado' } },
]);
await eq(
  'cambio incremental actualiza original',
  `select raw->>'Observaciones 1' from public.edp_reports_data where external_id='test-source-1'`,
  'modificado',
);
await ingest(82, [entry]);
await eq(
  'evento viejo no sobrescribe nuevo',
  `select source_version::int from public.edp_reports_data where external_id='test-source-1'`,
  2,
);
await ingest(83, [{ ...entry, version: 3, hash: 'hash-2' }]);
await eq(
  'contenido igual no reescribe parte',
  `select source_version::int from public.edp_reports_data where external_id='test-source-1'`,
  2,
);
await eq(
  'cursor incremental confirmado',
  `select cursor::int from public.edp_sync_sources where id='${id(70)}'`,
  3,
);
const wbs = {
  Equipo: 'WBS-SYNTHETIC',
  'tipo equipo': 'Prueba',
  'Centro de costo': 'Centro sintético',
  'Costo de hora': '10',
  'Costo de hora extra': '15',
  'Costo de movilizacion': '20',
  'Costo de desmovilizacion': '25',
  'Costo de OD': '5',
  'Costo FS': '2',
};
const wbsEntry = { kind: 'wbs', external_id: 'WBS-SYNTHETIC', version: 5, hash: 'wbs-1', raw: wbs };
await ingest(85, [wbsEntry]);
await eq(
  'WBS crea tarifa demostrativa con vigencia explícita',
  `select normal::text from public.edp_rates r join public.edp_equipment e on e.id=r.equipment_id where e.code='WBS-SYNTHETIC'`,
  '10.0000',
);
await ingest(86, [{ ...wbsEntry, version: 6 }]);
await eq(
  'WBS repetida no duplica tarifas',
  `select count(*)::int from public.edp_rates r join public.edp_equipment e on e.id=r.equipment_id where e.code='WBS-SYNTHETIC'`,
  1,
);
await ingest(87, [
  { ...wbsEntry, version: 7, hash: 'wbs-2', raw: { ...wbs, 'Costo de hora': '999' } },
]);
await eq(
  'cambio WBS no reescribe tarifa inicial',
  `select normal::text from public.edp_rates r join public.edp_equipment e on e.id=r.equipment_id where e.code='WBS-SYNTHETIC'`,
  '10.0000',
);
await eq(
  'cambio WBS queda para revisión',
  `select status from public.edp_import_staging where external_id='WBS-SYNTHETIC'`,
  'review',
);
await db.exec('reset role');
const [{ id: imported }] = await q(
  `select id from public.edp_reports_data where external_id='test-source-1'`,
);
await as(1);
await db.exec(
  `select public.edp_classify_report('${imported}','${id(30)}','${id(40)}','hours','Correspondencia sintética validada')`,
);
await eq(
  'clasificación explícita elimina pendientes',
  `select cardinality(issues)::int from public.edp_reports_data where id='${imported}'`,
  0,
);
await db.exec('reset role');
await db.exec('set local role service_role');
await ingest(84, [
  {
    ...entry,
    version: 4,
    hash: 'hash-4',
    raw: { ...raw, 'Observaciones 1': 'tercera modificación' },
  },
]);
await eq(
  'sync conserva clasificación autorizada',
  `select cost_center_id::text from public.edp_reports_data where id='${imported}'`,
  id(40),
);
await db.exec('reset role');
await as(1);
await deny('rechazo requiere motivo', `select public.edp_reject_report('${imported}','no')`);
await db.exec(`select public.edp_reject_report('${imported}','Rechazo sintético')`);
await eq(
  'rechazo autorizado auditado',
  `select validation from public.edp_reports_data where id='${imported}'`,
  'rejected',
);
const kmPayload = {
  ...payload,
  equipment_id: id(33),
  work_date: '2026-10-26',
  report_number: 'KM1',
};
const [{ rid: kmId }] = await q('select public.edp_create_report($1::jsonb) rid', [
  JSON.stringify(kmPayload),
]);
await db.exec('reset role');
await db.exec(
  `insert into public.edp_rates(id,tenant_id,equipment_id,valid_from,normal,extra,od,fs,mobilization,demobilization) values('${id(51)}','${id(21)}','${id(33)}','2026-10-26',1,1,1,1,1,1)`,
);
await as(1);
await deny(
  'kilómetros no se facturan como horas',
  `select public.edp_add_billable('${JSON.stringify({ ...billable, report_id: kmId, rate_id: id(51) })}')`,
);
await db.exec('reset role');
await eq(
  'RLS en todas las tablas públicas EDP',
  `select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'edp_%' and c.relkind='r' and not c.relrowsecurity`,
  0,
);
await db.exec('set local role anon');
await deny('anónimo no lee datos privados', `select * from public.edp_reports_data`);
await deny('anónimo no obtiene secreto de fuente', `select public.edp_source_backend('${id(70)}')`);
await db.exec('reset role');
await db.exec('rollback');
await db.close();
console.log(
  `Database: ${passed} assertions passed (PostgreSQL via PGlite; not remote Supabase Auth).`,
);
