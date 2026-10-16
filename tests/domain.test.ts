import { describe, it, expect } from 'vitest';
import {
  amount,
  periodFor,
  mapRow,
  operatorHeaders,
  normalizeEquipment,
  meterDifference,
  dateFromSheet,
  contentHash,
} from '../shared/domain';
describe('Período contractual sin UTC', () => {
  it.each([
    ['2026-08-26', '2026-08-26', '2026-09-25'],
    ['2026-09-25', '2026-08-26', '2026-09-25'],
    ['2026-09-26', '2026-09-26', '2026-10-25'],
    ['2026-12-26', '2026-12-26', '2027-01-25'],
    ['2028-02-29', '2028-02-26', '2028-03-25'],
  ])('%s', (date, start, end) => expect(periodFor(date)).toMatchObject({ start, end }));
  it('rechaza fechas imposibles', () => expect(() => periodFor('2026-02-30')).toThrow());
  it('interpreta dd/mm/yyyy', () => expect(dateFromSheet('26/08/2026')).toBe('2026-08-26'));
});
describe('Importación trazable', () => {
  it('usa encabezados exactos sin depender del orden', () =>
    expect(mapRow(['ID', 'Fecha'], ['x', '26/08/2026'], ['Fecha', 'ID'])).toEqual({
      ID: 'x',
      Fecha: '26/08/2026',
    }));
  it('preserva espacios y rechaza deriva', () => {
    expect(Object.keys(operatorHeaders)).toContain('Proyecto ');
    expect(() => mapRow(['Proyecto'], ['x'], ['Proyecto '])).toThrow();
  });
  it('rechaza encabezados duplicados', () =>
    expect(() => mapRow(['ID', 'ID'], ['x', 'y'], ['ID'])).toThrow());
  it('no elimina sufijos sin alias validado', () => {
    expect(normalizeEquipment('CAR-0089-JM', ['CAR-0089'], {})).toBeNull();
    expect(normalizeEquipment('CAR-0089-JM', ['CAR-0089'], { 'CAR-0089-JM': 'CAR-0089' })).toBe(
      'CAR-0089',
    );
  });
  it('hash idempotente independiente del orden de claves', async () => {
    expect(await contentHash({ a: 1, b: 2 })).toBe(await contentHash({ b: 2, a: 1 }));
    expect(await contentHash({ a: 2 })).not.toBe(await contentHash({ a: 1 }));
  });
});
describe('Cálculo exacto y mediciones', () => {
  it('redondea una vez en decimal', () => expect(amount('1.005', '1')).toBe('1.01'));
  it('evita errores binarios', () => expect(amount('0.1', '0.2')).toBe('0.02'));
  it('rechaza negativos', () => expect(() => amount('-1', '20')).toThrow());
  it('kilómetros no son horas', () =>
    expect(meterDifference('116278', '116458', 'km')).toEqual({
      hourDifference: null,
      odometerDifference: '180.000',
      inconsistent: false,
    }));
  it('unidad desconocida queda pendiente', () =>
    expect(meterDifference('1', '9', 'unknown').hourDifference).toBeNull());
  it('detecta retroceso', () => expect(meterDifference('9', '1', 'hours').inconsistent).toBe(true));
});
