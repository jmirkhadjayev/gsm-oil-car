import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api, emptyRoute,
  type Driver, type RouteRow, type ServiceType, type Vehicle, type Waybill, type Zone,
} from '../api';
import { useAuth } from '../auth';
import { pick, useI18n } from '../i18n';
import { Checkbox, Empty, Input, Loading, Select, StatusBadge, useAsync, useToast } from '../ui';
import { dmy, nf, ni, todayStr } from '../lib/format';
import { GROUP_ICON, SHIFTS, isGse, useAirportLabels, usesHours, usesKm } from '../lib/airport';
import { CloseModal } from './Waybills';

type FormState = {
  number: string; date_from: string; date_to: string;
  vehicle_id: string; driver_id: string; zone_id: string; shift: string;
  odo_start: string; hours_start: string; fuel_start: string;
  engine_hours: string; cargo_ton_km: string; winter: boolean;
  norm_per_100km: string; norm_engine_hour: string; norm_per_ton_km: string; winter_pct: string;
  // gibrid texnikaning ikkinchi manbai
  fuel2_start: string; norm2_per_100km: string; norm2_engine_hour: string;
  task: string; notes: string;
};

const emptyForm: FormState = {
  number: '', date_from: todayStr(), date_to: todayStr(),
  vehicle_id: '', driver_id: '', zone_id: '', shift: 'day',
  odo_start: '0', hours_start: '0', fuel_start: '0',
  engine_hours: '0', cargo_ton_km: '0', winter: false,
  norm_per_100km: '0', norm_engine_hour: '0', norm_per_ton_km: '0', winter_pct: '0',
  fuel2_start: '0', norm2_per_100km: '0', norm2_engine_hour: '0',
  task: '', notes: '',
};

export default function WaybillForm() {
  const { id } = useParams();
  const isNew = !id;
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const L = useAirportLabels();

  const vehicles = useAsync(() => api.get<Vehicle[]>('/vehicles?active=1'), []);
  const drivers = useAsync(() => api.get<Driver[]>('/drivers?active=1'), []);
  const zones = useAsync(() => api.get<Zone[]>('/zones?active=1'), []);
  const services = useAsync(() => api.get<ServiceType[]>('/service-types?active=1'), []);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [loaded, setLoaded] = useState<Waybill | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [closingModal, setClosingModal] = useState(false);

  const readOnly = !can('waybills') || (loaded?.status === 'closed' && !can('admin'));

  const load = () => {
    if (isNew) return;
    setLoading(true);
    api.get<Waybill>(`/waybills/${id}`)
      .then((w) => {
        setLoaded(w);
        setForm({
          number: w.number, date_from: w.date_from, date_to: w.date_to,
          vehicle_id: String(w.vehicle_id), driver_id: String(w.driver_id),
          zone_id: String(w.zone_id ?? ''), shift: w.shift ?? 'day',
          odo_start: String(w.odo_start), hours_start: String(w.hours_start ?? 0),
          fuel_start: String(w.fuel_start),
          engine_hours: String(w.engine_hours), cargo_ton_km: String(w.cargo_ton_km),
          winter: !!w.winter,
          norm_per_100km: String(w.norm_per_100km), norm_engine_hour: String(w.norm_engine_hour),
          norm_per_ton_km: String(w.norm_per_ton_km), winter_pct: String(w.winter_pct),
          fuel2_start: String(w.fuel2_start ?? 0),
          norm2_per_100km: String(w.norm2_per_100km ?? 0),
          norm2_engine_hour: String(w.norm2_engine_hour ?? 0),
          task: w.task, notes: w.notes,
        });
        setRoutes((w.routes ?? []).map((r) => ({ ...emptyRoute(), ...r })));
      })
      .catch((e) => toast(e.message, 'err'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const applyDefaults = async (vehicleId: string, date: string) => {
    if (!vehicleId) return;
    try {
      const d = await api.get<any>(`/waybills/defaults?vehicle_id=${vehicleId}&date=${date}`);
      setForm((f) => ({
        ...f,
        number: f.number || d.number,
        odo_start: String(d.odo_start),
        hours_start: String(d.hours_start),
        fuel_start: String(d.fuel_start),
        norm_per_100km: String(d.norm_per_100km),
        norm_engine_hour: String(d.norm_engine_hour),
        norm_per_ton_km: String(d.norm_per_ton_km),
        winter_pct: String(d.winter_pct),
        winter: !!d.winter,
        fuel2_start: String(d.fuel2_start ?? 0),
        norm2_per_100km: String(d.norm2_per_100km ?? 0),
        norm2_engine_hour: String(d.norm2_engine_hour ?? 0),
        zone_id: f.zone_id || String(d.zone_id ?? ''),
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

  // --------------------- Tanlangan texnika konteksti ---------------------
  const vehicle = (vehicles.data ?? []).find((v) => String(v.id) === form.vehicle_id);
  const basis = vehicle?.norm_basis ?? loaded?.norm_basis ?? 'km';
  const group = vehicle?.group_code ?? loaded?.group_code ?? 'road';
  const gse = isGse(group);
  const withKm = usesKm(basis);
  const withHours = usesHours(basis);

  // --------------------------- Operatsiyalar ---------------------------
  const addRoute = () => setRoutes((r) => [...r, { ...emptyRoute(), zone_id: form.zone_id ? Number(form.zone_id) : null }]);
  const setRoute = (i: number, patch: Partial<RouteRow>) =>
    setRoutes((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const delRoute = (i: number) => setRoutes((r) => r.filter((_, idx) => idx !== i));

  // ---------------------------- Jonli hisob ----------------------------
  const routeDistance = routes.reduce((s, r) => s + (Number(r.distance_km) || 0), 0);
  const routeHours = routes.reduce((s, r) => s + (Number(r.op_hours) || 0), 0);
  const distance = loaded?.odo_end != null ? loaded.odo_end - Number(form.odo_start) : routeDistance;
  const hours = loaded?.hours_end != null
    ? Math.max(0, loaded.hours_end - Number(form.hours_start))
    : (routeHours || Number(form.engine_hours || 0));

  const winterK = form.winter ? 1 + Number(form.winter_pct || 0) / 100 : 1;
  const norm = (
    (distance / 100) * Number(form.norm_per_100km || 0) +
    hours * Number(form.norm_engine_hour || 0) +
    (Number(form.cargo_ton_km || 0) / 100) * Number(form.norm_per_ton_km || 0)
  ) * winterK;

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        winter: form.winter ? 1 : 0,
        vehicle_id: Number(form.vehicle_id),
        driver_id: Number(form.driver_id),
        zone_id: form.zone_id ? Number(form.zone_id) : null,
        odo_start: Number(form.odo_start),
        hours_start: Number(form.hours_start || 0),
        fuel_start: Number(form.fuel_start),
        engine_hours: routeHours || Number(form.engine_hours || 0),
        cargo_ton_km: Number(form.cargo_ton_km || 0),
        norm_per_100km: Number(form.norm_per_100km || 0),
        norm_engine_hour: Number(form.norm_engine_hour || 0),
        norm_per_ton_km: Number(form.norm_per_ton_km || 0),
        winter_pct: Number(form.winter_pct || 0),
        fuel2_start: Number(form.fuel2_start || 0),
        norm2_per_100km: Number(form.norm2_per_100km || 0),
        norm2_engine_hour: Number(form.norm2_engine_hour || 0),
        routes,
        ...(loaded ? {
          odo_end: loaded.odo_end, hours_end: loaded.hours_end,
          fuel_end: loaded.fuel_end, fuel2_end: loaded.fuel2_end,
        } : {}),
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

  const canSubmit = form.vehicle_id && form.driver_id && form.date_from && !readOnly;
  const fuelUnitLabel = vehicle?.power_type === 'electric' ? (lang === 'uz' ? 'kVt·s' : 'кВт·ч') : (lang === 'uz' ? 'l' : 'л');
  // Gibrid: ikkinchi manba alohida ko'rsatiladi va alohida hisoblanadi
  const hybrid = !!(vehicle?.fuel_type2_id ?? loaded?.fuel_type2_id);
  const unit2 = (lang === 'uz' ? (vehicle?.unit2_uz ?? loaded?.unit2_uz) : (vehicle?.unit2_ru ?? loaded?.unit2_ru)) ?? '';
  const norm2 = hybrid
    ? ((distance / 100) * Number(form.norm2_per_100km || 0) +
       hours * Number(form.norm2_engine_hour || 0)) * winterK
    : 0;

  return (
    <>
      <div className="page-head">
        <Link to="/waybills" className="btn btn-sm">← {t('back')}</Link>
        <h2>{isNew ? t('newWaybill') : `${t('waybillNo')} ${form.number}`}</h2>
        {loaded && <StatusBadge status={loaded.status} />}
        {loaded && <span className="badge">{L.shift[loaded.shift]}</span>}
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
                <option key={v.id} value={v.id}>
                  {GROUP_ICON[v.group_code ?? 'road']} {v.garage_no} · {v.model}
                  {v.plate && v.plate !== '—' ? ` · ${v.plate}` : ''}
                </option>
              ))}
            </Select>

            <div className="form-row">
              <Select label={t('driver')} value={form.driver_id} onChange={set('driver_id')} disabled={readOnly}>
                <option value="">—</option>
                {(drivers.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.full_name}{d.tab_no ? ` (${d.tab_no})` : ''}</option>
                ))}
              </Select>
              <Select label={t('shift')} value={form.shift} onChange={set('shift')} disabled={readOnly}>
                {SHIFTS.map((s) => <option key={s} value={s}>{L.shift[s]}</option>)}
              </Select>
              <Select label={t('zone')} value={form.zone_id} onChange={set('zone_id')} disabled={readOnly}>
                <option value="">—</option>
                {(zones.data ?? []).map((z) => <option key={z.id} value={z.id}>{pick(lang, z, 'name')}</option>)}
              </Select>
            </div>

            {vehicle && (
              <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                <span className="badge blue">{pick(lang, vehicle, 'category_name')}</span>{' '}
                {L.basis[vehicle.norm_basis]}
                {withKm && <> · {t('currentOdometer')}: <b>{ni(vehicle.odometer)}</b> km</>}
                {withHours && <> · {t('currentHours')}: <b>{nf(vehicle.hour_meter, 1)}</b></>}
                {' '}· {t('tankBalance')}: <b>{nf(vehicle.fuel_balance)}</b> {fuelUnitLabel}
                {hybrid && <> · ⚡ {t('chargeBalance')}: <b>{nf(vehicle.fuel_balance2)}</b> {unit2}</>}
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
              {withKm && (
                <Input label={t('odoStart')} type="number" step="1" value={form.odo_start}
                       onChange={set('odo_start')} disabled={readOnly} />
              )}
              {withHours && (
                <Input label={t('hoursStart')} type="number" step="0.1" value={form.hours_start}
                       onChange={set('hours_start')} disabled={readOnly} />
              )}
              <Input label={fuelUnitLabel === 'l' || fuelUnitLabel === 'л'
                              ? t('fuelStart') : `${t('fuelStart')} (${fuelUnitLabel})`}
                     type="number" step="0.01"
                     value={form.fuel_start} onChange={set('fuel_start')} disabled={readOnly} />
              {hybrid && (
                <Input label={`⚡ ${t('chargeStart')}${unit2 ? ` (${unit2})` : ''}`} type="number" step="0.01"
                       value={form.fuel2_start} onChange={set('fuel2_start')} disabled={readOnly} />
              )}
            </div>

            {loaded?.status === 'closed' && (
              <div className="form-row">
                {withKm && <Input label={t('odoEnd')} value={ni(loaded.odo_end)} disabled />}
                {withHours && <Input label={t('hoursEnd')} value={nf(loaded.hours_end, 1)} disabled />}
                <Input label={t('fuelEnd')} value={nf(loaded.fuel_end)} disabled />
                {hybrid && <Input label={`⚡ ${t('chargeEnd')}`} value={nf(loaded.fuel2_end)} disabled />}
              </div>
            )}

            <div className="form-row">
              {withHours && !routeHours && (
                <Input label={t('workedHours')} type="number" step="0.1" value={form.engine_hours}
                       onChange={set('engine_hours')} disabled={readOnly}
                       hint={gse ? t('addOperation') : undefined} />
              )}
              <Input label={t('cargoTonKm')} type="number" step="0.1" value={form.cargo_ton_km}
                     onChange={set('cargo_ton_km')} disabled={readOnly} />
            </div>

            <div className="section-title">{t('normBasis')}: {L.basis[basis]}</div>
            <div className="form-row">
              {withKm && (
                <Input label={t('norm100')} type="number" step="0.1" value={form.norm_per_100km}
                       onChange={set('norm_per_100km')} disabled={readOnly} />
              )}
              {withHours && (
                <Input label={t('normHour')} type="number" step="0.1" value={form.norm_engine_hour}
                       onChange={set('norm_engine_hour')} disabled={readOnly} />
              )}
              <Input label={t('normTonKm')} type="number" step="0.1" value={form.norm_per_ton_km}
                     onChange={set('norm_per_ton_km')} disabled={readOnly} />
              <Input label={t('winterPct')} type="number" step="1" value={form.winter_pct}
                     onChange={set('winter_pct')} disabled={readOnly} />
            </div>
            {hybrid && (
              <div className="form-row">
                {withKm && (
                  <Input label={`⚡ ${t('norm2_100')}`} type="number" step="0.1" value={form.norm2_per_100km}
                         onChange={set('norm2_per_100km')} disabled={readOnly} />
                )}
                {withHours && (
                  <Input label={`⚡ ${t('norm2Hour')}`} type="number" step="0.1" value={form.norm2_engine_hour}
                         onChange={set('norm2_engine_hour')} disabled={readOnly} />
                )}
              </div>
            )}
            <Checkbox label={`${t('winter')} (+${form.winter_pct}%)`} checked={form.winter}
                      onChange={set('winter')} disabled={readOnly} />

            <div className="divider" />

            <div className="grid cols-4">
              {withKm && <Metric label={t('distance')} value={ni(distance)} />}
              {withHours && <Metric label={t('workedHours')} value={nf(hours, 1)} />}
              <Metric label={t('normLiters')} value={nf(norm)} />
              <Metric label={t('fuelIssued')} value={nf(loaded?.fuel_issued ?? 0)} />
              <Metric label={t('factLiters')} value={loaded?.fact_liters == null ? '—' : nf(loaded.fact_liters)} />
            </div>

            {hybrid && (
              <>
                <div className="section-title">⚡ {t('hybridSource')} {unit2 ? `(${unit2})` : ''}</div>
                <div className="grid cols-3">
                  <Metric label={t('norm2Liters')} value={nf(norm2)} />
                  <Metric label={t('chargeIssued')} value={nf(loaded?.fuel2_issued ?? 0)} />
                  <Metric label={t('fact2Liters')} value={loaded?.fact2_liters == null ? '—' : nf(loaded.fact2_liters)} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ------------------------- Bajarilgan ishlar ------------------------- */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-head">
          <h2>{gse ? t('operations') : t('route')}</h2>
          <div className="spacer" />
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {withKm && <>{t('distance')}: <b>{ni(routeDistance)}</b>{' '}</>}
            {withHours && <>{t('workedHours')}: <b>{nf(routeHours, 1)}</b></>}
          </span>
          {!readOnly && <button className="btn btn-sm" onClick={addRoute}>＋ {gse ? t('addOperation') : t('addRoute')}</button>}
        </div>
        <div className="table-wrap">
          {routes.length === 0 ? <Empty /> : gse ? (
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>№</th>
                  <th style={{ width: 110 }}>{t('flightNo')}</th>
                  <th style={{ width: 120 }}>{t('aircraftType')}</th>
                  <th style={{ width: 110 }}>{t('aircraftReg')}</th>
                  <th style={{ width: 80 }}>{t('stand')}</th>
                  <th style={{ width: 170 }}>{t('serviceType')}</th>
                  <th style={{ width: 90 }}>{t('timeOut')}</th>
                  <th style={{ width: 90 }}>{t('timeIn')}</th>
                  {withHours && <th style={{ width: 90 }} className="num">{t('opHours')}</th>}
                  {withKm && <th style={{ width: 90 }} className="num">{t('distance')}</th>}
                  <th style={{ width: 80 }} className="num">{t('cargoTonShort')}</th>
                  <th style={{ width: 70 }} className="num">{t('uldCount')}</th>
                  <th style={{ width: 80 }} className="num">{t('paxCount')}</th>
                  {!readOnly && <th style={{ width: 46 }} />}
                </tr>
              </thead>
              <tbody>
                {routes.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><input value={r.flight_no} onChange={(e) => setRoute(i, { flight_no: e.target.value })}
                               placeholder="HY-601" disabled={readOnly} /></td>
                    <td><input value={r.aircraft_type} onChange={(e) => setRoute(i, { aircraft_type: e.target.value })}
                               placeholder="B767-300" disabled={readOnly} /></td>
                    <td><input value={r.aircraft_reg} onChange={(e) => setRoute(i, { aircraft_reg: e.target.value })}
                               placeholder="UK-67003" disabled={readOnly} /></td>
                    <td><input value={r.stand} onChange={(e) => setRoute(i, { stand: e.target.value })}
                               placeholder="12" disabled={readOnly} /></td>
                    <td>
                      <select value={r.service_type_id ?? ''} disabled={readOnly}
                              onChange={(e) => setRoute(i, { service_type_id: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">—</option>
                        {(services.data ?? []).map((s) => (
                          <option key={s.id} value={s.id}>{pick(lang, s, 'name')}</option>
                        ))}
                      </select>
                    </td>
                    <td><input type="time" value={r.time_out} onChange={(e) => setRoute(i, { time_out: e.target.value })} disabled={readOnly} /></td>
                    <td><input type="time" value={r.time_in} onChange={(e) => setRoute(i, { time_in: e.target.value })} disabled={readOnly} /></td>
                    {withHours && (
                      <td><input type="number" step="0.1" className="num" value={r.op_hours}
                                 onChange={(e) => setRoute(i, { op_hours: Number(e.target.value) })} disabled={readOnly} /></td>
                    )}
                    {withKm && (
                      <td><input type="number" step="0.1" className="num" value={r.distance_km}
                                 onChange={(e) => setRoute(i, { distance_km: Number(e.target.value) })} disabled={readOnly} /></td>
                    )}
                    <td><input type="number" step="0.1" className="num" value={r.cargo_ton}
                               onChange={(e) => setRoute(i, { cargo_ton: Number(e.target.value) })} disabled={readOnly} /></td>
                    <td><input type="number" step="1" className="num" value={r.uld_count}
                               onChange={(e) => setRoute(i, { uld_count: Number(e.target.value) })} disabled={readOnly} /></td>
                    <td><input type="number" step="1" className="num" value={r.pax_count}
                               onChange={(e) => setRoute(i, { pax_count: Number(e.target.value) })} disabled={readOnly} /></td>
                    {!readOnly && (
                      <td className="num">
                        <button className="btn btn-icon btn-sm btn-danger" onClick={() => delRoute(i)}>✕</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
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
                      <td>
                        <span className={`badge ${f.is_second ? 'volt' : 'blue'}`}>
                          {f.is_second ? '⚡ ' : ''}{f.fuel_code}
                        </span>
                      </td>
                      <td>{f.station || '—'}</td>
                      <td>{f.doc_no || '—'}</td>
                      <td className="num">{nf(f.liters)} {pick(lang, f, 'unit')}</td>
                      <td className="num">{ni(f.price)}</td>
                      <td className="num">{ni(f.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>{t('total')}</td>
                    <td className="num">
                      {nf(loaded.fuel_issued)}
                      {hybrid && <div className="text-muted" style={{ fontSize: 12 }}>⚡ {nf(loaded.fuel2_issued)} {unit2}</div>}
                    </td>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontSize: 19 }}>{value}</div>
    </div>
  );
}
