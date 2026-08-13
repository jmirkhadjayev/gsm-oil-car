import { Link } from 'react-router-dom';
import { api, type EquipGroup } from '../api';
import { useI18n } from '../i18n';
import { Empty, Loading, StatusBadge, useAsync } from '../ui';
import { dmy, nf, ni } from '../lib/format';
import { GROUP_ICON, useAirportLabels } from '../lib/airport';

type Data = {
  period: { from: string; to: string };
  stats: Record<string, number>;
  openWaybills: any[];
  lowFuel: any[];
  daily: { date: string; liters: number }[];
  topDeviation: any[];
  byGroup: any[];
};

export default function Dashboard() {
  const { t } = useI18n();
  const L = useAirportLabels();
  const { data, loading } = useAsync(() => api.get<Data>('/reports/dashboard'), []);

  if (loading) return <Loading />;
  if (!data) return <Empty />;

  const s = data.stats;
  const maxLiters = Math.max(1, ...data.daily.map((d) => d.liters));

  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Stat label={t('statMonthFlights')} value={ni(s.month_flights)} />
        <Stat label={t('statMonthHours')} value={nf(s.month_hours, 1)} unit="m/s" />
        <Stat label={t('statMonthLiters')} value={nf(s.month_liters)} unit="l" />
        <Stat
          label={t('statDeviation')}
          value={`${s.month_deviation > 0 ? '+' : ''}${nf(s.month_deviation)}`}
          unit="l"
          tone={s.month_deviation > 0.01 ? 'pos' : s.month_deviation < -0.01 ? 'neg' : undefined}
        />
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Stat label={t('statMonthWaybills')} value={ni(s.month_waybills)} />
        <Stat label={t('statMonthDistance')} value={ni(s.month_distance)} unit="km" />
        <Stat label={t('statMonthCargo')} value={nf(s.month_cargo, 1)} unit="t" />
        <Stat label={t('statMonthAmount')} value={ni(s.month_amount)} unit="so'm" />
      </div>

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Stat label={t('statVehicles')} value={ni(s.vehicles)} />
        <Stat label={t('statDrivers')} value={ni(s.drivers)} />
        <Stat label={t('statOpen')} value={ni(s.open_waybills)} tone={s.open_waybills > 0 ? 'pos' : undefined} />
        <Stat label={t('uldCount')} value={ni(s.month_uld)} />
      </div>

      <div className="grid cols-2">
        <div className="card">
          <div className="card-head">
            <h2>{t('fuelByDay')}</h2>
            <div className="spacer" />
            <span className="text-muted" style={{ fontSize: 12 }}>
              {dmy(data.period.from)} — {dmy(data.period.to)}
            </span>
          </div>
          <div className="card-body">
            {data.daily.length === 0 ? <Empty /> : (
              <div className="bars">
                {data.daily.map((d) => (
                  <div className="bar-col" key={d.date} title={`${dmy(d.date)}: ${nf(d.liters)} l`}>
                    <div className="bar-slot">
                      <div className="bar" style={{ height: `${(d.liters / maxLiters) * 100}%` }} />
                    </div>
                    <div className="bar-label">{d.date.slice(8)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>{t('openWaybills')}</h2>
            <div className="spacer" />
            <Link to="/waybills" className="btn btn-sm">{t('all')}</Link>
          </div>
          <div className="card-body tight">
            {data.openWaybills.length === 0 ? <Empty /> : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>№</th><th>{t('date')}</th><th>{t('vehicle')}</th>
                      <th>{t('driver')}</th><th>{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.openWaybills.map((w) => (
                      <tr key={w.id}>
                        <td><Link to={`/waybills/${w.id}`}>№{w.number}</Link></td>
                        <td>{dmy(w.date_from)}</td>
                        <td>{w.garage_no} · {w.plate}</td>
                        <td>{w.driver_name}</td>
                        <td><StatusBadge status={w.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>{t('fleetByGroup')}</h2></div>
          <div className="card-body tight">
            {!data.byGroup?.length ? <Empty /> : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{t('group')}</th>
                      <th className="num">{t('units_')}</th>
                      <th className="num">{t('workedHours')}</th>
                      <th className="num">{t('flights')}</th>
                      <th className="num">{t('factLiters')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byGroup.map((g: any) => (
                      <tr key={g.group_code}>
                        <td>{GROUP_ICON[g.group_code as EquipGroup] ?? ''} {L.group[g.group_code as EquipGroup] ?? g.group_code}</td>
                        <td className="num">{ni(g.units)}</td>
                        <td className="num">{nf(g.engine_hours, 1)}</td>
                        <td className="num">{ni(g.flights)}</td>
                        <td className="num"><b>{nf(g.fact_liters)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>{t('lowFuel')}</h2></div>
          <div className="card-body tight">
            {data.lowFuel.length === 0 ? <Empty /> : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>{t('vehicle')}</th><th className="num">{t('tankBalance')}</th><th className="num">%</th></tr>
                  </thead>
                  <tbody>
                    {data.lowFuel.map((v) => (
                      <tr key={v.id}>
                        <td>{v.garage_no} · {v.model}</td>
                        <td className="num">{nf(v.fuel_balance)} / {ni(v.tank_capacity)} l</td>
                        <td className="num"><span className="badge amber">{ni(v.pct)}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>{t('topDeviation')}</h2></div>
          <div className="card-body tight">
            {data.topDeviation.length === 0 ? <Empty /> : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr><th>№</th><th>{t('date')}</th><th>{t('vehicle')}</th><th className="num">{t('deviation')}</th></tr>
                  </thead>
                  <tbody>
                    {data.topDeviation.map((w, i) => (
                      <tr key={i}>
                        <td>№{w.number}</td>
                        <td>{dmy(w.date_from)}</td>
                        <td>{w.garage_no} · {w.plate}</td>
                        <td className="num">
                          <span className={w.deviation > 0 ? 'text-pos' : 'text-neg'}>
                            {w.deviation > 0 ? '+' : ''}{nf(w.deviation)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit?: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${tone ? ' ' + tone : ''}`}>
        {value}{unit && <span className="stat-unit">{unit}</span>}
      </div>
    </div>
  );
}
