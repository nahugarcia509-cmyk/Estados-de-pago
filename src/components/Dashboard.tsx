import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { Summary } from '../lib/types';
import Decimal from 'decimal.js';
export const ars = (v: string | number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(v));
const labels: Record<string, string> = {
  normal: 'Horas normales',
  extra: 'Horas extra',
  od: 'OD',
  fs: 'FS',
  mobilization: 'Movilización',
  demobilization: 'Desmovilización',
};
function Chart({
  title,
  data,
  dataKey = 'amount',
}: {
  title: string;
  data: object[];
  dataKey?: string;
}) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <div className="chart" aria-label={title}>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip />
            <Bar dataKey={dataKey} fill="#169f9b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
export function Dashboard({ data }: { data: Summary }) {
  let accumulated = new Decimal(0);
  const daily = data.daily.map((d) => {
    accumulated = accumulated.plus(d.amount);
    return {
      ...d,
      day: d.date.slice(5),
      amount: Number(d.amount),
      hours: Number(d.hours),
      accumulated: accumulated.toNumber(),
    };
  });
  return (
    <>
      <div className="notice">
        Importes calculados sobre cantidades reconocidas y tarifas guardadas. Los conceptos sin
        regla aprobada permanecen pendientes. Las tarifas WBS iniciales son de prueba.
      </div>
      <div className="kpis">
        <article className="kpi main">
          <span>Estado de pago acumulado</span>
          <strong>{ars(data.total)}</strong>
          <small>Componentes aprobados + ajustes del período</small>
        </article>
        <article className="kpi">
          <span>Horas máquina reconocidas</span>
          <strong>{data.hours}</strong>
          <small>No incluye kilómetros</small>
        </article>
        <article className="kpi">
          <span>Equipos con actividad</span>
          <strong>{data.equipment_count}</strong>
          <small>Según filtros operativos</small>
        </article>
        <article className="kpi">
          <span>Pendientes de revisión</span>
          <strong>{data.pending}</strong>
          <small>Requieren validación</small>
        </article>
      </div>
      <div className="components">
        {Object.entries(labels).map(([key, label]) => (
          <article key={key}>
            <span>{label}</span>
            <b>{ars(data.components.find((c) => c.component === key)?.amount ?? '0')}</b>
          </article>
        ))}
      </div>
      <div className="chart-grid">
        <section className="panel wide">
          <h3>Importe acumulado por día</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#169f9b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#169f9b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Area
                dataKey="accumulated"
                name="ARS acumulados"
                stroke="#169f9b"
                fill="url(#area)"
              />
            </AreaChart>
          </ResponsiveContainer>
          <small>
            Los ajustes del período se muestran en el total, sin atribución diaria inventada.
          </small>
        </section>
        <Chart
          title="Horas reconocidas por día"
          data={daily.map((d) => ({ name: d.day, hours: d.hours }))}
          dataKey="hours"
        />
        <Chart
          title="Costos por centro de costo"
          data={data.centers.map((d) => ({ ...d, amount: Number(d.amount) }))}
        />
        <Chart
          title="Ranking de equipos"
          data={data.ranking.map((d) => ({ ...d, amount: Number(d.amount) }))}
        />
        <Chart
          title="Distribución por tipo de equipo"
          data={data.types.map((d) => ({ ...d, amount: Number(d.amount) }))}
        />
        <Chart
          title="Evolución de costos diarios"
          data={daily.map((d) => ({ name: d.day, amount: d.amount }))}
        />
      </div>
    </>
  );
}
