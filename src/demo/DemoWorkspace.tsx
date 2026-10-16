import { useState } from 'react';
import { LayoutDashboard, FileText, Truck, LogOut, Menu, Layers } from 'lucide-react';
import { Dashboard, ars } from '../components/Dashboard';
import { demoCompanies, demoEquipment, demoSelection, demoSummary } from './data';

const pages = [
  ['Dashboard general', LayoutDashboard],
  ['Estado de pago', FileText],
  ['Detalle diario', Layers],
  ['Equipos y tarifas', Truck],
] as const;

export default function DemoWorkspace({ onExit }: { onExit: () => void }) {
  const [page, setPage] = useState('Dashboard general');
  const [company, setCompany] = useState('');
  const [equipment, setEquipment] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const rows = demoSelection(company, equipment);
  const summary = demoSummary(company, equipment);
  const record = rows.find((r) => r.id === selected);

  return (
    <div className={`app ${collapsed ? 'collapsed' : ''}`}>
      <aside>
        <div className="logo">
          <span className="brand-mark">V</span>
          {!collapsed && (
            <b>
              VICUÑA<small>ESTADOS DE PAGO</small>
            </b>
          )}
        </div>
        <p className="nav-label">DEMOSTRACIÓN</p>
        <nav>
          {pages.map(([name, Icon]) => (
            <button
              key={name}
              title={name}
              className={page === name ? 'active' : ''}
              onClick={() => {
                setPage(name);
                setSelected(null);
              }}
            >
              <Icon size={18} />
              {!collapsed && name}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <small>Datos ficticios · Solo lectura</small>
        </div>
      </aside>
      <main>
        <header>
          <button
            className="icon-button"
            aria-label="Plegar menú"
            onClick={() => setCollapsed((v) => !v)}
          >
            <Menu size={20} />
          </button>
          <span>
            Vicuña <b>/ Demostración</b>
          </span>
          <div className="account">
            <button className="secondary" onClick={onExit}>
              <LogOut size={16} />
              Salir de la demostración
            </button>
          </div>
        </header>
        <div className="content">
          <div className="notice" role="status">
            <strong>DEMOSTRACIÓN · DATOS FICTICIOS · SOLO LECTURA</strong>
            <br />
            Podés recorrer las pantallas sin usuario ni contraseña. Estos ejemplos no consultan ni
            modifican información real. Las cantidades, tarifas y reglas son ilustrativas.
          </div>
          <div className="page-heading">
            <div>
              <p className="eyebrow">ESTADOS DE PAGO | VICUÑA</p>
              <h1>{page}</h1>
              <p>Período de ejemplo: 26/09/2026 al 25/10/2026 · ARS</p>
            </div>
          </div>
          <section className="filters" aria-label="Filtros de demostración">
            <label>
              Empresa contratista
              <select
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  setEquipment('');
                  setSelected(null);
                }}
              >
                <option value="">Todas las empresas de ejemplo</option>
                {demoCompanies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Equipo
              <select
                value={equipment}
                onChange={(e) => {
                  setEquipment(e.target.value);
                  setSelected(null);
                }}
              >
                <option value="">Todos los equipos de ejemplo</option>
                {demoEquipment
                  .filter((e) => !company || e.company === company)
                  .map((e) => (
                    <option key={e.code}>{e.code}</option>
                  ))}
              </select>
            </label>
          </section>
          {page === 'Dashboard general' && <Dashboard data={summary} />}
          {page === 'Estado de pago' && (
            <>
              <div className="kpis">
                <article className="kpi main">
                  <span>Total ilustrativo del período</span>
                  <strong>{ars(summary.total)}</strong>
                  <small>Ejemplo de horas normales reconocidas</small>
                </article>
                <article className="kpi">
                  <span>Horas reconocidas de ejemplo</span>
                  <strong>{summary.hours}</strong>
                </article>
                <article className="kpi">
                  <span>Pendientes de ejemplo</span>
                  <strong>{summary.pending}</strong>
                </article>
              </div>
              <section className="panel">
                <h3>Desglose por equipo · Ejemplo</h3>
                {summary.ranking.map((r) => (
                  <p key={r.name}>
                    <b>{r.name}</b> · {ars(r.amount)}
                  </p>
                ))}
                <p>
                  Estado: en revisión (demo). Aprobar, cerrar y registrar ajustes requiere ingresar
                  con una cuenta autorizada.
                </p>
              </section>
            </>
          )}
          {page === 'Detalle diario' && (
            <>
              <p>{rows.length} partes ficticios · Seleccioná un registro para inspeccionarlo.</p>
              <div className="table-scroll panel">
                <table>
                  <thead>
                    <tr>
                      {[
                        'Fecha',
                        'Empresa',
                        'Equipo',
                        'Centro de costo',
                        'Turno',
                        'Horas informadas',
                        'Horas reconocidas',
                        'Importe ARS',
                        'Validación',
                        'Detalle',
                      ].map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.date}</td>
                        <td>{r.company}</td>
                        <td>{r.code}</td>
                        <td>{r.center}</td>
                        <td>{r.shift}</td>
                        <td>{r.reportedHours}</td>
                        <td>{r.approvedHours}</td>
                        <td>{ars(r.amount)}</td>
                        <td>
                          <span className={`badge ${r.pending ? 'pending' : 'approved'}`}>
                            {r.validation}
                          </span>
                        </td>
                        <td>
                          <button className="link" onClick={() => setSelected(r.id)}>
                            Inspeccionar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {record && (
                <section className="panel" aria-label="Detalle de ejemplo">
                  <button className="close secondary" onClick={() => setSelected(null)}>
                    Cerrar detalle
                  </button>
                  <h3>{record.id} · Registro ficticio</h3>
                  <p>
                    {record.operator} · {record.type} · {record.date}
                  </p>
                  <p>
                    Cálculo ilustrativo: {record.approvedHours} horas × {ars(record.rate)} ={' '}
                    {ars(record.amount)}.
                  </p>
                  <p>
                    Origen: datos sintéticos de demostración. No corresponde a un parte real ni a
                    una tarifa contractual.
                  </p>
                </section>
              )}
            </>
          )}
          {page === 'Equipos y tarifas' && (
            <div className="table-scroll panel">
              <table>
                <thead>
                  <tr>
                    {[
                      'Equipo',
                      'Empresa',
                      'Tipo',
                      'Centro de costo',
                      'Tarifa de ejemplo / hora',
                    ].map((c) => (
                      <th key={c}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {demoEquipment
                    .filter(
                      (e) =>
                        (!company || e.company === company) && (!equipment || e.code === equipment),
                    )
                    .map((e) => (
                      <tr key={e.code}>
                        <td>{e.code}</td>
                        <td>{e.company}</td>
                        <td>{e.type}</td>
                        <td>{e.center}</td>
                        <td>{ars(e.rate)} · DEMO</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <footer>
            Modo demostración · Datos ficticios incluidos en la aplicación · Sin conexión a datos de
            clientes
          </footer>
        </div>
      </main>
    </div>
  );
}
