import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { demoCompanies, demoReports, demoSelection, demoSummary } from '../src/demo/data';

describe('Datos de demostración independientes', () => {
  it('usa únicamente identificadores y empresas marcados como ficticios', () => {
    expect(demoReports).toHaveLength(45);
    expect(demoReports.every((r) => r.id.startsWith('DEMO-') && r.company.includes('(demo)'))).toBe(
      true,
    );
  });
  it('los filtros de empresa y equipo conservan el mismo conjunto para tabla y totales', () => {
    const rows = demoSelection(demoCompanies[0], 'DEMO-CAR-02');
    expect(rows).toHaveLength(15);
    expect(demoSummary(demoCompanies[0], 'DEMO-CAR-02').total).toBe(
      rows.reduce((s, r) => s.plus(r.amount), new Decimal(0)).toFixed(2),
    );
  });
  it('los importes pendientes no se suman como aprobados', () => {
    expect(demoSummary().pending).toBe(1);
    expect(
      demoReports
        .filter((r) => r.pending)
        .every((r) => r.amount === '0.00' && r.approvedHours === '0'),
    ).toBe(true);
  });
  it('la suma de empresas coincide con el consolidado', () => {
    expect(
      demoCompanies.reduce((s, c) => s.plus(demoSummary(c).total), new Decimal(0)).toFixed(2),
    ).toBe(demoSummary().total);
  });
});
