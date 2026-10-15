import { useState, type FormEvent } from 'react';
import type { Equipment } from '../lib/types';
import { rpc } from '../services/repository';
export function ReportForm({
  equipment,
  centers,
  onSaved,
}: {
  equipment: Equipment[];
  centers: { id: string; name: string; tenant_id: string }[];
  onSaved: () => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? '');
  const tenant = equipment.find((e) => e.id === equipmentId)?.tenant_id;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = new FormData(e.currentTarget),
      p = Object.fromEntries(f.entries());
    try {
      await rpc('edp_create_report', {
        payload: { ...p, tasks: String(p.tasks).split('\n').filter(Boolean) },
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="panel form-grid">
      <label>
        Fecha operativa
        <input name="work_date" type="date" required />
      </label>
      <label>
        Equipo
        <select
          name="equipment_id"
          required
          value={equipmentId}
          onChange={(e) => setEquipmentId(e.target.value)}
        >
          {equipment.map((e) => (
            <option value={e.id} key={e.id}>
              {e.code} · {e.meter_unit}
            </option>
          ))}
        </select>
      </label>
      <label>
        Centro de costo
        <select name="cost_center_id" key={tenant}>
          <option value="">Pendiente de clasificación</option>
          {centers
            .filter((c) => c.tenant_id === tenant)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Turno
        <select name="shift">
          <option>TURNO DIA</option>
          <option>TURNO NOCHE</option>
        </select>
      </label>
      {[
        ['operator', 'Operador'],
        ['supervisor', 'Supervisor'],
        ['client_supervisor', 'Supervisor del cliente'],
        ['report_number', 'N° de parte'],
        ['project', 'Proyecto'],
        ['work_area', 'Área de trabajo'],
        ['meter_start', 'Medidor inicial'],
        ['meter_end', 'Medidor final'],
        ['reported_hours', 'Cantidad informada'],
        ['fuel', 'Combustible'],
        ['oil', 'Aceite'],
        ['wear', 'Desgaste'],
      ].map(([name, label]) => (
        <label key={name}>
          {label}
          <input
            name={name}
            required={['operator', 'report_number'].includes(name)}
            type={['meter_start', 'meter_end', 'reported_hours'].includes(name) ? 'number' : 'text'}
            min="0"
            step="0.001"
          />
        </label>
      ))}
      <label>
        Estado operativo
        <select name="operational_status">
          <option value="">Sin OD/FS informado</option>
          <option>OD</option>
          <option>FS</option>
        </select>
      </label>
      <label className="full">
        Tareas (una por línea)
        <textarea name="tasks" rows={3} />
      </label>
      <label className="full">
        Observaciones
        <textarea name="notes" rows={2} />
      </label>
      {error && (
        <p role="alert" className="error full">
          {error}
        </p>
      )}
      <div className="full">
        <button disabled={busy || !equipmentId}>
          {busy ? 'Guardando…' : 'Guardar parte diario'}
        </button>
        <small>Origen: aplicación. La sincronización no sobrescribe este registro.</small>
      </div>
    </form>
  );
}
