import Decimal from 'decimal.js';
import type { Summary } from '../lib/types';

// Entirely synthetic. Never derived from the connected Sheet or a customer database.
export const demoCompanies = ['Contratista Norte (demo)', 'Contratista Sur (demo)'];
export const demoEquipment = [
  {
    code: 'DEMO-EXC-01',
    company: demoCompanies[0],
    type: 'Excavadora',
    center: 'Centro Norte (demo)',
    rate: '45000.00',
  },
  {
    code: 'DEMO-CAR-02',
    company: demoCompanies[0],
    type: 'Cargadora',
    center: 'Centro Norte (demo)',
    rate: '38000.00',
  },
  {
    code: 'DEMO-MOT-03',
    company: demoCompanies[1],
    type: 'Motoniveladora',
    center: 'Centro Sur (demo)',
    rate: '52000.00',
  },
];
export const demoReports = Array.from({ length: 15 }, (_, day) =>
  demoEquipment.map((equipment, index) => {
    const date = new Date(Date.UTC(2026, 8, 26 + day)).toISOString().slice(0, 10);
    const pending = day === 14 && index === 1;
    const hours = String(6 + ((day + index) % 4));
    return {
      ...equipment,
      id: `DEMO-${day}-${index}`,
      date,
      shift: index === 1 ? 'TURNO NOCHE' : 'TURNO DIA',
      operator: `Operador de ejemplo ${index + 1}`,
      reportedHours: hours,
      approvedHours: pending ? '0' : hours,
      amount: pending ? '0.00' : new Decimal(hours).mul(equipment.rate).toFixed(2),
      validation: pending ? 'Pendiente (demo)' : 'Aprobado (demo)',
      pending,
    };
  }),
).flat();
export function demoSelection(company = '', equipment = '') {
  return demoReports.filter(
    (r) => (!company || r.company === company) && (!equipment || r.code === equipment),
  );
}
export function demoSummary(company = '', equipment = ''): Summary {
  const rows = demoSelection(company, equipment);
  const total = rows.reduce((sum, r) => sum.plus(r.amount), new Decimal(0)).toFixed(2);
  const group = (field: 'date' | 'center' | 'code' | 'type') =>
    [...new Set(rows.map((r) => r[field]))].map((name) => ({
      name,
      amount: rows
        .filter((r) => r[field] === name)
        .reduce((sum, r) => sum.plus(r.amount), new Decimal(0))
        .toFixed(2),
    }));
  return {
    total,
    hours: rows.reduce((sum, r) => sum.plus(r.approvedHours), new Decimal(0)).toFixed(3),
    equipment_count: new Set(rows.map((r) => r.code)).size,
    pending: rows.filter((r) => r.pending).length,
    components: [{ component: 'normal', amount: total }],
    daily: group('date').map((d) => ({
      date: d.name,
      amount: d.amount,
      hours: rows
        .filter((r) => r.date === d.name)
        .reduce((sum, r) => sum.plus(r.approvedHours), new Decimal(0))
        .toFixed(3),
    })),
    centers: group('center'),
    ranking: group('code').sort((a, b) => new Decimal(b.amount).comparedTo(a.amount)),
    types: group('type'),
  };
}
