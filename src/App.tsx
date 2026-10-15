import { lazy, Suspense, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  LayoutDashboard,
  FileText,
  Truck,
  Layers,
  History,
  ClipboardList,
  Shield,
  Building2,
  Users,
  RefreshCw,
  ScrollText,
  LogOut,
  Menu,
  Download,
  Plus,
} from 'lucide-react';
import { supabase, db } from './lib/client';
import { Login } from './components/Login';
import { ReportForm } from './components/ReportForm';
import { Detail } from './components/Detail';
import { reports, summary, catalog, rpc } from './services/repository';
import { exportReports } from './services/export';
import type { Filters, Membership, Report, Equipment, Summary } from './lib/types';
import { periodFor, OPERATIONAL_TIMEZONE } from '../shared/domain';
const Dashboard = lazy(() =>
  import('./components/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const nav = [
  ['Dashboard general', LayoutDashboard, 'finance'],
  ['Estado de pago', FileText, 'finance'],
  ['Detalle diario', Layers, 'operation'],
  ['Equipos y tarifas', Truck, 'finance'],
  ['Centros de costo', Layers, 'finance'],
  ['Historial de períodos', History, 'finance'],
  ['Partes diarios', ClipboardList, 'operation'],
  ['Control de registros', ClipboardList, 'operation'],
  ['Seguridad', Shield, 'all'],
  ['Empresas', Building2, 'finance'],
  ['Usuarios y roles', Users, 'admin'],
  ['Sincronización', RefreshCw, 'admin'],
  ['Auditoría', ScrollText, 'admin'],
] as const;
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: OPERATIONAL_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const current = periodFor(today);
const initialFilters: Filters = {
  tenant: '',
  from: current.start,
  to: current.end,
  equipment: '',
  cost_center: '',
  project: '',
  equipment_type: '',
  shift: '',
  operational_status: '',
  validation: '',
  search: '',
};
type Catalog = Record<string, unknown>[];
const fmt = (value: unknown) =>
  typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—');
function CatalogTable({ rows, columns }: { rows: Catalog; columns: string[] }) {
  return (
    <div className="table-scroll panel">
      <table>
        <thead>
          <tr>
            {columns.map((k) => (
              <th key={k}>{k.replaceAll('_', ' ')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={String(r.id ?? i)}>
              {columns.map((k) => (
                <td key={k}>{fmt(r[k])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="empty">No hay registros disponibles.</p>}
      <small>Vista de catálogo limitada a 500 registros.</small>
    </div>
  );
}
export function App() {
  const [session, setSession] = useState<Session | null>(null),
    [ready, setReady] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
        setReady(true);
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  if (!ready) return <div className="skeleton" aria-label="Cargando sesión" />;
  return session ? <Workspace key={session.user.id} email={session.user.email ?? ''} /> : <Login />;
}
function Workspace({ email }: { email: string }) {
  const [memberships, setMemberships] = useState<Membership[]>([]),
    [page, setPage] = useState('Dashboard general'),
    [collapsed, setCollapsed] = useState(false),
    [filters, setFilters] = useState(initialFilters),
    [draft, setDraft] = useState(initialFilters),
    [rows, setRows] = useState<Report[]>([]),
    [total, setTotal] = useState(0),
    [data, setData] = useState<Summary | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [number, setNumber] = useState(0),
    [sort, setSort] = useState('work_date'),
    [ascending, setAscending] = useState(false),
    [detail, setDetail] = useState<Report | null>(null),
    [form, setForm] = useState(false),
    [equipment, setEquipment] = useState<Equipment[]>([]),
    [centers, setCenters] = useState<{ id: string; name: string; tenant_id: string }[]>([]),
    [tenants, setTenants] = useState<{ id: string; name: string }[]>([]),
    [aux, setAux] = useState<Catalog>([]);
  const finance = memberships.some((m) => ['vicuna', 'admin'].includes(m.role)),
    admin = memberships.some((m) => m.role === 'admin'),
    writer = memberships.some((m) => ['operator', 'admin'].includes(m.role));
  useEffect(() => {
    let active = true;
    Promise.all([
      rpc('edp_my_memberships', {}),
      catalog('equipment'),
      catalog('cost_centers'),
      catalog('tenants'),
    ])
      .then(([m, e, c, t]) => {
        if (active) {
          setMemberships(m);
          setEquipment(e as Equipment[]);
          setCenters(c);
          setTenants(t);
          if (!m.some((x: Membership) => ['vicuna', 'admin'].includes(x.role)))
            setPage('Partes diarios');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!memberships.length) {
      setBusy(false);
      return;
    }
    let active = true;
    setBusy(true);
    setError('');
    setData(null);
    setRows([]);
    const table =
      page === 'Equipos y tarifas'
        ? 'rates'
        : page === 'Historial de períodos' || page === 'Estado de pago'
          ? 'periods'
          : page === 'Sincronización'
            ? 'sync_runs'
            : page === 'Auditoría'
              ? 'audit'
              : null;
    Promise.all([
      reports(filters, number, sort, ascending),
      finance ? summary(filters) : Promise.resolve(null),
      table ? catalog(table) : Promise.resolve([]),
    ])
      .then(([r, s, a]) => {
        if (active) {
          setRows(r.rows);
          setTotal(r.total);
          setData(s);
          setAux(a);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [memberships, filters, number, sort, ascending, finance, page, revision]);
  const refresh = () => setRevision((r) => r + 1);
  async function action(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      setNotice('Acción completada.');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const filteredAux = aux.filter((r) => !filters.tenant || r.tenant_id === filters.tenant);
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
        <p className="nav-label">PLATAFORMA CONTRACTUAL</p>
        <nav>
          {nav
            .filter(
              ([, , permission]) =>
                permission === 'all' ||
                permission === 'operation' ||
                (permission === 'finance' && finance) ||
                (permission === 'admin' && admin),
            )
            .map(([name, Icon]) => (
              <button
                className={page === name ? 'active' : ''}
                key={name}
                title={name}
                onClick={() => {
                  setPage(name);
                  setNumber(0);
                  setForm(false);
                }}
              >
                <Icon size={18} />
                {!collapsed && name}
              </button>
            ))}
        </nav>
        <div className="sidebar-foot">
          {!collapsed && (
            <small>
              Desarrollo · v0.1
              <br />
              San Juan, Argentina
            </small>
          )}
        </div>
      </aside>
      <main>
        <header>
          <button
            className="icon-button"
            aria-label="Plegar menú"
            onClick={() => setCollapsed((x) => !x)}
          >
            <Menu size={20} />
          </button>
          <span>
            Control de contratos <b>/ {page}</b>
          </span>
          <div className="account">
            <small>{email}</small>
            <button
              className="icon-button"
              title="Cerrar sesión"
              onClick={() => action(() => db().auth.signOut())}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">ESTADOS DE PAGO | VICUÑA</p>
              <h1>{page}</h1>
              <p>Control operativo y financiero · Período contractual 26–25</p>
            </div>
            <div className="actions">
              {writer && (
                <button
                  onClick={() => {
                    setPage('Partes diarios');
                    setForm(true);
                  }}
                >
                  <Plus size={16} />
                  Nuevo parte
                </button>
              )}
              <button className="secondary" onClick={refresh}>
                <RefreshCw size={16} />
                Actualizar
              </button>
            </div>
          </div>
          <form
            className="filters"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.from > draft.to) {
                setError('La fecha inicial debe ser anterior a la final.');
                return;
              }
              setFilters(draft);
              setNumber(0);
            }}
          >
            <label>
              Período contractual
              <input
                type="month"
              value={draft.to ? periodFor(draft.to).label : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    const p = periodFor(`${e.target.value}-25`);
                    setDraft((d) => ({ ...d, from: p.start, to: p.end }));
                  }
                }}
              />
            </label>
            <label>
              Empresa
              <select
                value={draft.tenant}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    tenant: e.target.value,
                    equipment: '',
                    cost_center: '',
                  }))
                }
              >
                <option value="">Todas las autorizadas</option>
                {tenants.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Desde
              <input
                type="date"
                required
                value={draft.from}
                onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                required
                value={draft.to}
                onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              />
            </label>
            <label>
              Equipo
              <select
                value={draft.equipment}
                onChange={(e) => setDraft((d) => ({ ...d, equipment: e.target.value }))}
              >
                <option value="">Todos</option>
                {equipment
                  .filter((x) => !draft.tenant || x.tenant_id === draft.tenant)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.code}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Centro de costo
              <select
                value={draft.cost_center}
                onChange={(e) => setDraft((d) => ({ ...d, cost_center: e.target.value }))}
              >
                <option value="">Todos</option>
                {centers
                  .filter((x) => !draft.tenant || x.tenant_id === draft.tenant)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </label>
            <details className="full">
              <summary>Más filtros</summary>
              <div className="filter-extra">
                {[
                  ['project', 'Proyecto'],
                  ['equipment_type', 'Tipo de equipo'],
                  ['shift', 'Turno'],
                  ['operational_status', 'Estado OD/FS'],
                  ['validation', 'Validación'],
                  ['search', 'Buscar código'],
                ].map(([name, label]) => (
                  <label key={name}>
                    {label}
                    <input
                      value={draft[name as keyof Filters]}
                      placeholder={name === 'validation' ? 'pending / approved / rejected' : ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [name]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </details>
            <button type="submit">Aplicar filtros</button>
          </form>
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              <button
                className="close icon-button"
                aria-label="Cerrar notificación"
                onClick={() => setNotice('')}
              >
                ×
              </button>
              {notice}
            </div>
          )}
          {!memberships.length && !busy && (
            <div className="notice">
              Tu cuenta no tiene membresías asignadas. El administrador debe autorizar el acceso.
            </div>
          )}
          {busy ? (
            <div className="skeleton" aria-label="Cargando datos" />
          ) : (
            <>
              {page === 'Dashboard general' && data && (
                <Suspense fallback={<div className="skeleton" />}>
                  <Dashboard data={data} />
                </Suspense>
              )}
              {['Detalle diario', 'Control de registros', 'Partes diarios'].includes(page) && (
                <>
                  {form ? (
                    <ReportForm
                      equipment={equipment.filter((e) =>
                        memberships.some(
                          (m) =>
                            m.tenant_id === e.tenant_id && ['admin', 'operator'].includes(m.role),
                        ),
                      )}
                      centers={centers}
                      onSaved={() => {
                        setForm(false);
                        setNotice('Parte guardado.');
                        refresh();
                      }}
                    />
                  ) : (
                    <>
                      <div className="table-actions">
                        <span>
                          {total} registros · página {number + 1}
                        </span>
                        <div className="actions">
                          <button
                            className="secondary"
                            onClick={() => action(() => exportReports(filters, 'csv'))}
                          >
                            <Download size={16} />
                            CSV
                          </button>
                          <button
                            className="secondary"
                            onClick={() => action(() => exportReports(filters, 'xlsx'))}
                          >
                            Excel
                          </button>
                        </div>
                      </div>
                      <div className="table-scroll panel">
                        <table>
                          <thead>
                            <tr>
                              {[
                                ['work_date', 'Fecha'],
                                ['tenant_name', 'Empresa'],
                                ['equipment_original', 'Equipo'],
                                ['project', 'Proyecto'],
                                ['shift', 'Turno'],
                                ['operator', 'Operador'],
                                ['report_number', 'Parte'],
                                ['validation', 'Validación'],
                              ].map(([key, label]) => (
                                <th key={key}>
                                  <button
                                    onClick={() => {
                                      if (sort === key) setAscending((a) => !a);
                                      else {
                                        setSort(key);
                                        setAscending(true);
                                      }
                                      setNumber(0);
                                    }}
                                  >
                                    {label} {sort === key ? (ascending ? '↑' : '↓') : ''}
                                  </button>
                                </th>
                              ))}
                              <th>Centro de costo</th>
                              <th>Horas informadas</th>
                              <th>Diferencia h / km</th>
                              <th>OD / FS</th>
                              <th>Detalle</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => (
                              <tr key={r.id}>
                                <td>{r.work_date}</td>
                                <td>{r.tenant_name}</td>
                                <td>
                                  <b>{r.equipment_original}</b>
                                  <small>{r.equipment_type}</small>
                                </td>
                                <td>{r.project}</td>
                                <td>{r.shift}</td>
                                <td>{r.operator}</td>
                                <td>{r.report_number}</td>
                                <td>
                                  <span className={`badge ${r.validation}`}>{r.validation}</span>
                                </td>
                                <td>{r.cost_center_name ?? 'Pendiente'}</td>
                                <td>{r.reported_hours}</td>
                                <td>
                                  {r.hour_difference ?? '—'} / {r.odometer_difference ?? '—'}
                                </td>
                                <td>{r.operational_status || '—'}</td>
                                <td>
                                  <button className="link" onClick={() => setDetail(r)}>
                                    Inspeccionar {r.issues.length ? '⚑' : ''}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {!rows.length && (
                          <div className="empty">
                            No hay partes para estos filtros. Importá la fuente o cargá un parte
                            diario.
                          </div>
                        )}
                      </div>
                      <div className="pagination">
                        <button
                          className="secondary"
                          disabled={!number}
                          onClick={() => setNumber((n) => n - 1)}
                        >
                          Anterior
                        </button>
                        <span>
                          {number * 50 + 1}–{Math.min((number + 1) * 50, total)} de {total}
                        </span>
                        <button
                          className="secondary"
                          disabled={(number + 1) * 50 >= total}
                          onClick={() => setNumber((n) => n + 1)}
                        >
                          Siguiente
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              {page === 'Equipos y tarifas' && (
                <>
                  <div className="notice">
                    Tarifas versionadas. Los valores importados de WBS son demostrativos; se
                    requiere validar contrato, vigencia, unidades y reglas antes de facturar.
                  </div>
                  <CatalogTable
                    rows={filteredAux}
                    columns={[
                      'equipment_id',
                      'valid_from',
                      'valid_to',
                      'normal',
                      'extra',
                      'od',
                      'fs',
                      'mobilization',
                      'demobilization',
                      'demonstration',
                    ]}
                  />
                  {admin && (
                    <form
                      className="panel form-grid"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const p = Object.fromEntries(new FormData(e.currentTarget).entries());
                        void action(() => rpc('edp_add_rate', { payload: p }));
                      }}
                    >
                      <h3 className="full">Nueva versión de tarifa de prueba</h3>
                      <label>
                        Equipo
                        <select name="equipment_id" required>
                          {equipment.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.code}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Vigencia desde
                        <input name="valid_from" type="date" required />
                      </label>
                      <label>
                        Vigencia hasta
                        <input name="valid_to" type="date" required />
                      </label>
                      {['normal', 'extra', 'od', 'fs', 'mobilization', 'demobilization'].map(
                        (n) => (
                          <label key={n}>
                            {n}
                            <input name={n} type="number" min="0" step="0.0001" required />
                          </label>
                        ),
                      )}
                      <button>Guardar versión</button>
                    </form>
                  )}
                </>
              )}
              {page === 'Centros de costo' && (
                <CatalogTable rows={centers} columns={['name', 'tenant_id']} />
              )}
              {page === 'Empresas' && <CatalogTable rows={tenants} columns={['name', 'id']} />}
              {['Estado de pago', 'Historial de períodos'].includes(page) && (
                <>
                  <CatalogTable
                    rows={filteredAux}
                    columns={['start_date', 'end_date', 'status', 'notes', 'closed_at']}
                  />
                  {admin && (
                    <form
                      className="panel form-grid"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void action(() =>
                          rpc('edp_transition_period', Object.fromEntries(f.entries())),
                        );
                      }}
                    >
                      <h3 className="full">Revisión y cierre</h3>
                      <label>
                        Período
                        <select name="period" required>
                          {filteredAux.map((r) => (
                            <option value={String(r.id)} key={String(r.id)}>
                              {String(r.start_date)} / {String(r.end_date)} · {String(r.status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Nuevo estado
                        <select name="new_status">
                          <option value="review">En revisión</option>
                          <option value="approved">Aprobado</option>
                          <option value="closed">Cerrado</option>
                          <option value="draft">Borrador (desde revisión)</option>
                        </select>
                      </label>
                      <label>
                        Observación
                        <input name="observation" required />
                      </label>
                      <button>Aplicar transición</button>
                    </form>
                  )}
                  {admin && (
                    <form
                      className="panel form-grid"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        void action(() =>
                          rpc('edp_add_adjustment', Object.fromEntries(f.entries())),
                        );
                      }}
                    >
                      <h3 className="full">Ajuste autorizado</h3>
                      <label>
                        Período
                        <select name="period" required>
                          {filteredAux.map((r) => (
                            <option value={String(r.id)} key={String(r.id)}>
                              {String(r.start_date)} · {String(r.status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Importe ARS (admite negativo)
                        <input name="value" type="number" step="0.01" required />
                      </label>
                      <label>
                        Justificación
                        <input name="reason" minLength={6} required />
                      </label>
                      <button>Registrar ajuste trazable</button>
                    </form>
                  )}
                </>
              )}
              {page === 'Sincronización' && (
                <>
                  <div className="notice">
                    Google Sheets → backend → Supabase. Instalá Apps Script siguiendo
                    docs/APPS_SCRIPT.md. La carga automática y manual se ejecuta desde la planilla;
                    esta pantalla muestra los lotes recibidos.
                  </div>
                  <CatalogTable
                    rows={filteredAux}
                    columns={['created_at', 'source_id', 'status', 'processed', 'error']}
                  />
                </>
              )}
              {page === 'Auditoría' && (
                <CatalogTable
                  rows={filteredAux}
                  columns={[
                    'created_at',
                    'actor',
                    'action',
                    'entity',
                    'record_id',
                    'old_data',
                    'new_data',
                  ]}
                />
              )}
              {page === 'Usuarios y roles' && (
                <>
                  <CatalogTable
                    rows={memberships as unknown as Catalog}
                    columns={['tenant_name', 'role']}
                  />
                  <div className="notice">
                    Administración de usuarios mediante invitación Auth y asignación autorizada por
                    backend. No se crean contraseñas predeterminadas. Ver docs/SETUP.md.
                  </div>
                </>
              )}
              {page === 'Seguridad' && (
                <div className="panel empty">
                  <Shield size={32} />
                  <h2>Seguridad</h2>
                  <p>Próximamente. El aislamiento multiempresa ya se aplica en la base de datos.</p>
                </div>
              )}
            </>
          )}
          {detail && (
            <Detail
              report={detail}
              finance={finance}
              admin={memberships.some(
                (m) => m.role === 'admin' && m.tenant_id === detail.tenant_id,
              )}
              onClose={() => setDetail(null)}
              onChanged={refresh}
            />
          )}
          <footer>Estados de Pago | Vicuña · {OPERATIONAL_TIMEZONE} · Entorno de desarrollo</footer>
        </div>
      </main>
    </div>
  );
}
