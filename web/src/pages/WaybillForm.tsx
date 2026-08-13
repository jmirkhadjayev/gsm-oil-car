import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type Driver, type RouteRow, type Vehicle, type Waybill } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Checkbox, Empty, Input, Loading, Select, StatusBadge, useAsync, useToast } from '../ui';
import { dmy, nf, ni, todayStr } from '../lib/format';
import { CloseModal } from './Waybills';

type FormState = {
  number: string; date_from: string; date_to: string;
  vehicle_id: string; driver_id: string;
  odo_start: string; fuel_start: string;
  engine_hours: string; cargo_ton_km: string; winter: boolean;
  norm_per_100km: string; norm_engine_hour: string; norm_per_ton_km: string; winter_pct: string;
  task: string; notes: string;
};

const emptyForm: FormState = {
  number: '', date_from: todayStr(), date_to: todayStr(),
  vehicle_id: '', driver_id: '',
  odo_start: '0', fuel_start: '0',
  engine_hours: '0', cargo_ton_km: '0', winter: false,
  norm_per_100km: '0', norm_engine_hour: '0', norm_per_ton_km: '0', winter_pct: '0',
  task: '', notes: '',
};

export default function WaybillForm() {
  const { id } = useParams();
  const isNew = !id;
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const vehicles = useAsync(() => api.get<Vehicle[]>('/vehicles?active=1'), []);
  const drivers = useAsync(() => api.get<Driver[]>('/drivers?active=1'), []);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loaded, setLoaded] = useState<Waybill | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [closingModal, setClosingModal] = useState(false);

  const readOnly = !can('waybills') || (loaded?.status === 'closed' && !can('admin'));

  // --- Mavjud varaqani yuklash ---
  const load = () => {
    if (isNew) return;
    setLoading(true);
    api.get<Waybill>(`/waybills/${id}`)
      .then((w) => {
        setLoaded(w);
        setForm({
          number: w.number, date_from: w.date_from, date_to: w.date_to,
          vehicle_id: String(w.vehicle_id), driver_id: String(w.driver_id),
          odo_start: String(w.odo_start), fuel_start: String(w.fuel_start),
          engine_hours: String(w.engine_hours), cargo_ton_km: String(w.cargo_ton_km),
          winter: !!w.winter,
          norm_per_100km: String(w.norm_per_100km), norm_engine_hour: String(w.norm_engine_hour),
          norm_per_ton_km: String(w.norm_per_ton_km), winter_pct: String(w.winter_pct),
          task: w.task, notes: w.notes,
        });
        setRoutes(w.routes ?? []);
      })
      .catch((e) => toast(e.message, 'err'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  // --- Yangi varaqa: avtomobil tanlanganda boshlang'ich qiymatlarni olish ---
  const applyDefaults = async (vehicleId: string, date: string) => {
    if (!vehicleId) return;
    try {
      const d = await api.get<any>(`/waybills/defaults?vehicle_id=${vehicleId}&date=${date}`);
      setForm((f) => ({
        ...f,
        number: f.number || d.number,
        odo_start: String(d.odo_start),
        fuel_start: String(d.fuel_start),
        norm_per_100km: String(d.norm_per_100km),
        norm_engine_hour: String(d.norm_engine_hour),
        norm_per_ton_km: String(d.norm_per_ton_km),
        winter_pct: String(d.winter_pct),
        winter: !!d.winter,
      }));
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value as never }));
    if (isNew && k === 'vehicle_id') applyDefaults(String(value), form.date_from);
    if (isNew && k === 'date_from') {
      setForm((f) => ({ ...f, date_to: String(value) }));
      if (form.vehicle_id) applyDefaults(form.vehicle_id, String(value));
    }
  };

  // --- Marshrut qatorlari ---
  const addRoute = () =>
    setRoutes((r) => [...r, { point_from: '', point_to: '', time_out: '', time_in: '', distance_km: 0, cargo: '', cargo_ton: 0 }]);
  const setRoute = (i: number, patch: Partial<RouteRow>) =>
    setRoutes((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const delRoute = (i: number) => setRoutes((r) => r.filter((_, idx) => idx !== i));

  // --- Jonli hisob-kitob ---
  const routeDistance = routes.reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  const distance = loaded?.odo_end != null ? loaded.odo_end - Number(form.odo_start) : routeDistance;
  const winterK = form.winter ? 1 + Number(form.winter_pct || 0) / 100 : 1;
  const norm =
    (distance / 100) * Number(form.norm_per_100km || 0) * winterK +
    Number(form.engine_hours || 0) * Number(form.norm_engine_hour || 0) +
    (Number(form.cargo_ton_km || 0) / 100) * Number(form.norm_per_ton_km || 0);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        winter: form.winter ? 1 : 0,
        vehicle_id: Number(form.vehicle_id),
        driver_id: Number(form.driver_id),
        odo_start: Number(form.odo_start),
        fuel_start: Number(form.fuel_start),
        engine_hours: Number(form.engine_hours || 0),
        cargo_ton_km: Number(form.cargo_ton_km || 0),
        norm_per_100km: Number(form.norm_per_100km || 0),
        norm_engine_hour: Number(form.norm_engine_hour || 0),
        norm_per_ton_km: Number(form.norm_per_ton_km || 0),
        winter_pct: Number(form.winter_pct || 0),
        routes,
        ...(loaded ? { odo_end: loaded.odo_end, fuel_end: loaded.fuel_end } : {}),
      };
      const saved = isNew
        ? await api.post<Waybill>('/waybills', payload)
        : await api.put<Waybill>(`/waybills/${id}`, payload);
      toast(t('saved'), 'ok');
      if (isNew) navigate(`/waybills/${saved.id}`, { replace: true });
      else load();
    } catch (e: any) {
      toast(e.message, 'err');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading />;

  const vehicle = (vehicles.data ?? []).find((v) => String(v.id) === form.vehicle_id);
  const canSubmit = form.vehicle_id && form.driver_id && form.date_from && !readOnly;

  return (
    <>
      <div className="page-head">
        <Link to="/waybills" className="btn btn-sm">← {t('back')}</Link>
        <h2>{isNew ? t('newWaybill') : `${t('waybillNo')} ${form.number}`}</h2>
        {loaded && <StatusBadge status={loaded.status} />}
        <div className="spacer" />
        {loaded && <Link to={`/waybills/${loaded.id}/print`} className="btn btn-sm">🖨 {t('print')}</Link>}
        {loaded && loaded.status !== 'closed' && can('waybills') && (
          <button className="btn btn-success btn-sm" onClick={() => setClosingModal(true)}>✓ {t('closeWaybill')}</button>
        )}
        {!readOnly && (
          <button className="btn btn-primary btn-sm" onClick={save} disabled={busy || !canSubmit}>
            {busy ? '…' : `💾 ${t('save')}`}
          </button>
        )}
      </div>

      <div className="grid cols-2">
        {/* -------------------- Asosiy ma'lumotlar -------------------- */}
        <div className="card">
          <div className="card-head"><h2>{t('waybill')}</h2></div>
          <div className="card-body">
            <div className="form-row">
              <Input label={t('waybillNo')} value={form.number} onChange={set('number')} disabled={readOnly} />
              <Input label={t('dateFrom')} type="date" value={form.date_from} onChange={set('date_from')} disabled={readOnly} />
              <Input label={t('dateTo')} type="date" value={form.date_to} onChange={set('date_to')} disabled={readOnly} />
            </div>

            <Select label={t('vehicle')} value={form.vehicle_id} onChange={set('vehicle_id')} disabled={readOnly || !isNew}>
              <option value="">—</option>
              {(vehicles.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.garage_no} · {v.plate} · {v.model} ({v.fuel_code})</option>
              ))}
            </Select>

            <Select label={t('driver')} value={form.driver_id} onChange={set('driver_id')} disabled={readOnly}>
              <option value="">—</option>
              {(drivers.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}{d.tab_no ? ` (${d.tab_no})` : ''}</option>
              ))}
            </Select>

            {vehicle && (
              <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                {t('currentOdometer')}: <b>{ni(vehicle.odometer)}</b> km · {t('tankBalance')}:{' '}
                <b>{nf(vehicle.fuel_balance)}</b> / {ni(vehicle.tank_capacity)} l
              </div>
            )}

            <Input label={t('task')} value={form.task} onChange={set('task')} disabled={readOnly} />
            <div className="field">
              <label>{t('notes')}</label>
              <textarea value={form.notes} onChange={set('notes')} disabled={readOnly} />
            </div>
          </div>
        </div>

        {/* ------------------ Ko'rsatkichlar va normalar ------------------ */}
        <div className="card">
          <div className="card-head"><h2>{t('printFuelBlock')}</h2></div>
          <div className="card-body">
            <div className="form-row">
              <Input label={t('odoStart')} type="number" step="1" value={form.odo_start} onChange={set('odo_start')} disabled={readOnly} />
              <Input label={t('fuelStart')} type="number" step="0.01" value={form.fuel_start} onChange={set('fuel_start')} disabled={readOnly} />
            </div>

            {loaded?.status === 'closed' && (
              <div className="form-row">
                <Input label={t('odoEnd')} value={ni(loaded.odo_end)} disabled />
                <Input label={t('fuelEnd')} value={nf(loaded.fuel_end)} disabled />
              </div>
            )}

            <div className="form-row">
              <Input label={t('engineHours')} type="number" step="0.1" value={form.engine_hours} onChange={set('engine_hours')} disabled={readOnly} />
              <Input label={t('cargoTonKm')} type="number" step="0.1" value={form.cargo_ton_km} onChange={set('cargo_ton_km')} disabled={readOnly} />
            </div>

            <div className="section-title">{t('norm100')}</div>
            <div className="form-row">
              <Input label={t('norm100')} type="number" step="0.1" value={form.norm_per_100km} onChange={set('norm_per_100km')} disabled={readOnly} />
              <Input label={t('normHour')} type="number" step="0.1" value={form.norm_engine_hour} onChange={set('norm_engine_hour')} disabled={readOnly} />
              <Input label={t('normTonKm')} type="number" step="0.1" value={form.norm_per_ton_km} onChange={set('norm_per_ton_km')} disabled={readOnly} />
              <Input label={t('winterPct')} type="number" step="1" value={form.winter_pct} onChange={set('winter_pct')} disabled={readOnly} />
            </div>
            <Checkbox label={`${t('winter')} (+${form.winter_pct}%)`} checked={form.winter} onChange={set('winter')} disabled={readOnly} />

            <div className="divider" />

            <div className="grid cols-4">
              <div>
                <div className="stat-label">{t('distance')}</div>
                <div className="stat-value" style={{ fontSize: 19 }}>{ni(distance)}</div>
              </div>
              <div>
                <div className="stat-label">{t('normLiters')}</div>
                <div className="stat-value" style={{ fontSize: 19 }}>{nf(norm)}</div>
              </div>
              <div>
                <div className="stat-label">{t('fuelIssued')}</div>
                <div className="stat-value" style={{ fontSize: 19 }}>{nf(loaded?.fuel_issued ?? 0)}</div>
              </div>
              <div>
                <div className="stat-label">{t('factLiters')}</div>
                <div className="stat-value" style={{ fontSize: 19 }}>
                  {loaded?.fact_liters == null ? '—' : nf(loaded.fact_liters)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------- Marshrut ---------------------------- */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2>{t('route')}</h2>
          <div className="spacer" />
          <span className="text-muted" style={{ fontSize: 12.5 }}>{t('distance')}: <b>{ni(routeDistance)}</b></span>
          {!readOnly && <button className="btn btn-sm" onClick={addRoute}>＋ {t('addRoute')}</button>}
        </div>
        <div className="table-wrap">
          {routes.length === 0 ? <Empty /> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>№</th>
                  <th>{t('pointFrom')}</th><th>{t('pointTo')}</th>
                  <th style={{ width: 100 }}>{t('timeOut')}</th><th style={{ width: 100 }}>{t('timeIn')}</th>
                  <th style={{ width: 110 }} className="num">{t('distance')}</th>
                  <th>{t('cargo')}</th><th style={{ width: 90 }} className="num">{t('cargoTon')}</th>
                  {!readOnly && <th style={{ width: 50 }} />}
                </tr>
              </thead>
              <tbody>
                {routes.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><input value={r.point_from} onChange={(e) => setRoute(i, { point_from: e.target.value })} disabled={readOnly} /></td>
                    <td><input value={r.point_to} onChange={(e) => setRoute(i, { point_to: e.target.value })} disabled={readOnly} /></td>
                    <td><input type="time" value={r.time_out} onChange={(e) => setRoute(i, { time_out: e.target.value })} disabled={readOnly} /></td>
                    <td><input type="time" value={r.time_in} onChange={(e) => setRoute(i, { time_in: e.target.value })} disabled={readOnly} /></td>
                    <td><input type="number" step="0.1" className="num" value={r.distance_km}
                               onChange={(e) => setRoute(i, { distance_km: Number(e.target.value) })} disabled={readOnly} /></td>
                    <td><input value={r.cargo} onChange={(e) => setRoute(i, { cargo: e.target.value })} disabled={readOnly} /></td>
                    <td><input type="number" step="0.1" value={r.cargo_ton}
                               onChange={(e) => setRoute(i, { cargo_ton: Number(e.target.value) })} disabled={readOnly} /></td>
                    {!readOnly && (
                      <td className="num">
                        <button className="btn btn-icon btn-sm btn-danger" onClick={() => delRoute(i)}>✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ------------------- Ushbu varaqadagi yoqilg'i ------------------- */}
      {loaded && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="card-head">
            <h2>{t('fuelIssue')}</h2>
            <div className="spacer" />
            <Link to="/fuel" className="btn btn-sm">＋ {t('add')}</Link>
          </div>
          <div className="table-wrap">
            {!loaded.fuel?.length ? <Empty /> : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>{t('date')}</th><th>{t('fuelType')}</th><th>{t('station')}</th><th>{t('docNo')}</th>
                    <th className="num">{t('liters')}</th><th className="num">{t('price')}</th><th className="num">{t('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loaded.fuel.map((f) => (
                    <tr key={f.id}>
                      <td>{dmy(f.date)}</td>
                      <td>{f.fuel_code}</td>
                      <td>{f.station || '—'}</td>
                      <td>{f.doc_no || '—'}</td>
                      <td className="num">{nf(f.liters)}</td>
                      <td className="num">{ni(f.price)}</td>
                      <td className="num">{ni(f.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>{t('total')}</td>
                    <td className="num">{nf(loaded.fuel_issued)}</td>
                    <td />
                    <td className="num">{ni(loaded.fuel.reduce((s, f) => s + f.amount, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      )}

      {closingModal && loaded && (
        <CloseModal
          waybill={loaded}
          onClose={() => setClosingModal(false)}
          onDone={() => { setClosingModal(false); load(); }}
        />
      )}
    </>
  );
}
