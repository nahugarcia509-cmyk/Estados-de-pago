import { reports } from './repository';
import type { Filters } from '../lib/types';
const safe = (v: unknown) => {
  const s = String(v ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};
export async function exportReports(f: Filters, format: 'csv' | 'xlsx') {
  const rows: Record<string, unknown>[] = [];
  let page = 0;
  while (true) {
    const result = await reports(f, page++);
    rows.push(
      ...result.rows.map((r) => ({
        Fecha: r.work_date,
        Empresa: r.tenant_name,
        Equipo: r.equipment_original,
        Centro: r.cost_center_name,
        Proyecto: r.project,
        Turno: r.shift,
        Operador: r.operator,
        Parte: r.report_number,
        'Horas informadas': r.reported_hours,
        'Diferencia horas': r.hour_difference,
        'Diferencia km': r.odometer_difference,
        Horas_reconocidas: r.approved_hours,
        Importe_ARS: r.amount,
        Tarifas_aplicadas: JSON.stringify(r.applied_rates ?? []),
        Estado: r.operational_status,
        Validacion: r.validation,
        Origen: r.origin,
        Observaciones: r.notes,
      })),
    );
    if (rows.length >= result.total) break;
    if (rows.length > 100000) throw new Error('Exportación demasiado grande: reducir filtros');
  }
  const keys = Object.keys(rows[0] ?? { Fecha: '' });
  let blob: Blob;
  if (format === 'csv')
    blob = new Blob(
      [
        '\uFEFF' +
          [keys, ...rows.map((r) => keys.map((k) => safe(r[k])))]
            .map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(';'))
            .join('\r\n'),
      ],
      { type: 'text/csv;charset=utf-8' },
    );
  else {
    const { default: ExcelJS } = await import('exceljs');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Detalle diario');
    sheet.addRow(keys);
    for (const r of rows) sheet.addRow(keys.map((k) => safe(r[k])));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    blob = new Blob([await book.xlsx.writeBuffer()], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `EDP-${f.from}-${f.to}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
