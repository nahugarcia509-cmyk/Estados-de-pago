import { useEffect, useState } from 'react';
import { catalog, rpc } from '../services/repository';
import type { Report } from '../lib/types';
type Row = Record<string, unknown>;
interface Props {
  report: Report;
  finance: boolean;
  admin: boolean;
  onClose: () => void;
  onChanged: () => void;
}
export function Detail({ report, finance, admin, onClose, onChanged }: Props) {
  const [billables, setBillables] = useState<Row[]>([]),
    [rates, setRates] = useState<Row[]>([]),
    [rules, setRules] = useState<Row[]>([]),
    [equipment, setEquipment] = useState<Row[]>([]),
    [centers, setCenters] = useState<Row[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    if (finance)
      Promise.all([
        catalog('billables', { report_id: report.id }),
        report.equipment_id
          ? catalog('rates', { equipment_id: report.equipment_id })
          : Promise.resolve([]),
        catalog('rules', { tenant_id: report.tenant_id }),
        admin ? catalog('equipment', { tenant_id: report.tenant_id }) : Promise.resolve([]),
        admin ? catalog('cost_centers', { tenant_id: report.tenant_id }) : Promise.resolve([]),
      ])
        .then(([b, t, r, e, c]) => {
          if (active) {
            setBillables(b);
            setRates(t);
            setRules(r);
            setEquipment(e);
            setCenters(c);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [report.id, report.equipment_id, report.tenant_id, finance, admin]);
  async function submit(name: string, args: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await rpc(name, args);
      onChanged();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog open className="modal" aria-labelledby="detail-title">
      <button className="close secondary" onClick={onClose} aria-label="Cerrar detalle">
        ×
      </button>
      <h2 id="detail-title">Parte {report.report_number}</h2>
      <p>
        {report.work_date} · {report.equipment_original} · {report.validation}
      </p>
      {report.issues.map((i) => (
        <p className="notice" key={i}>
          {i}
        </p>
      ))}
      <div className="components">
        <article>
          Horas informadas <b>{report.reported_hours ?? '—'}</b>
        </article>
        <article>
          Diferencia horas <b>{report.hour_difference ?? '—'}</b>
        </article>
        <article>
          Diferencia km <b>{report.odometer_difference ?? '—'}</b>
        </article>
      </div>
      {finance && (
        <>
          <h3>Cálculo aprobado</h3>
          <pre>{JSON.stringify(billables, null, 2)}</pre>
        </>
      )}
      {admin && (
        <>
          <details>
            <summary>Clasificar equipo, unidad y centro de costo</summary>
            <form
              className="form-grid"
              onSubmit={(e) => {
                e.preventDefault();
                void submit('edp_classify_report', {
                  ...Object.fromEntries(new FormData(e.currentTarget).entries()),
                  report: report.id,
                });
              }}
            >
              <label>
                Equipo maestro
                <select name="equipment" required defaultValue={report.equipment_id ?? ''}>
                  <option value="">Seleccionar</option>
                  {equipment.map((e) => (
                    <option key={String(e.id)} value={String(e.id)}>
                      {String(e.code)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Centro contractual
                <select name="center" required defaultValue={report.cost_center_id ?? ''}>
                  <option value="">Seleccionar</option>
                  {centers.map((c) => (
                    <option key={String(c.id)} value={String(c.id)}>
                      {String(c.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unidad confirmada
                <select name="meter_unit" required>
                  <option value="unknown">Pendiente</option>
                  <option value="hours">Horas</option>
                  <option value="km">Kilómetros</option>
                </select>
              </label>
              <label className="full">
                Justificación de correspondencia
                <input name="reason" minLength={6} required />
              </label>
              <button disabled={busy}>Guardar clasificación autorizada</button>
            </form>
          </details>
          <h3>Reconocer concepto contractual</h3>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void submit('edp_add_billable', {
                payload: {
                  ...Object.fromEntries(new FormData(e.currentTarget).entries()),
                  report_id: report.id,
                },
              });
            }}
          >
            <label>
              Concepto
              <select name="component">
                <option value="normal">Horas normales</option>
                <option value="extra">Horas extra</option>
                <option value="od">OD</option>
                <option value="fs">FS</option>
              </select>
            </label>
            <label>
              Cantidad reconocida
              <input name="quantity" required type="number" min="0" step="0.001" />
            </label>
            <label>
              Tarifa versionada
              <select name="rate_id" required>
                <option value="">Seleccionar</option>
                {rates.map((r) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {String(r.valid_from)} → {String(r.valid_to ?? 'abierta')} ·{' '}
                    {r.demonstration ? 'DEMO' : 'contractual'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Regla aprobada
              <select name="rule_id" required>
                <option value="">Seleccionar</option>
                {rules
                  .filter((r) => r.approved_by)
                  .map((r) => (
                    <option key={String(r.id)} value={String(r.id)}>
                      {String(r.component)} · {String(r.description)}
                    </option>
                  ))}
              </select>
            </label>
            <label className="full">
              Justificación
              <input name="reason" minLength={6} required />
            </label>
            <button disabled={busy}>{busy ? 'Validando…' : 'Reconocer y aprobar concepto'}</button>
          </form>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void submit('edp_reject_report', {
                report: report.id,
                reason: new FormData(e.currentTarget).get('reason'),
              });
            }}
          >
            <label className="full">
              Motivo del rechazo
              <input name="reason" minLength={6} required />
            </label>
            <button disabled={busy} className="secondary">
              Rechazar parte
            </button>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <details>
        <summary>Registro original y trazabilidad</summary>
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </dialog>
  );
}
