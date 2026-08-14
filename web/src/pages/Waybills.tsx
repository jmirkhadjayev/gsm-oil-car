import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs, type Driver, type Vehicle, type Waybill } from '../api';
import { useAuth } from '../auth';
import { pick, useI18n } from '../i18n';
import { Deviation, Empty, Input, Loading, Modal, Select, StatusBadge, useAsync, useConfirm, useToast } from '../ui';
import { dmy, downloadCsv, monthRange, nf, ni } from '../lib/format';
import { GROUP_ICON, GROUPS, useAirportLabels, usesHours, usesKm } from '../lib/airport';

export default function Waybills() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const L = useAirportLabels();
  const [f, setF] = useState({ ...monthRange(), vehicle_id: '', driver_id: '', status: '', q: '' });
  const [group, setGroup] = useState('');
  const [closing, setClosing] = useState<Waybill | null>(null);

  const vehicles = useAsync(() => api.get<Vehicle[]>('/vehicles'), []);
  const drivers = useAsync(() => api.get<Driver[]>('/drivers'), []);
  const list = useAsync(
    () => api.get<{ rows: Waybill[]; total: number }>(`/waybills${qs(f)}`),
    [f.from, f.to, f.vehicle_id, f.driver_id, f.status, f.q]
  );

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const remove = async (w: Waybill) => {
    if (!confirm(`№${w.number} — ${t('confirmDelete')}`)) return;
    try {
      await api.del(`/waybills/${w.id}`);
      toast(t('deleted'), 'ok');
      list.reload();
      vehicles.reload();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const reopen = async (w: Waybill) => {
    try {
      await api.post(`/waybills/${w.id}/reopen`);
      toast(t('saved'), 'ok');
      list.reload();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const exportCsv = () => {
    const rows = list.data?.rows ?? [];
    downloadCsv(
      `yol-varaqalari-${f.from}_${f.to}`,
      ['№', t('date'), t('shift'), t('garageNo'), t('model'), t('category'), t('zone'), t('driver'),
       t('odoStart'), t('odoEnd'), t('distance'), t('hoursStart'), t('hoursEnd'), t('workedHours'),
       t('flights'), t('cargoTonShort'), t('uldCount'), t('paxCount'),
       t('fuelStart'), t('fuelIssued'), t('fuelEnd'), t('normLiters'), t('factLiters'), t('deviation'),
       t('chargeStart'), t('chargeIssued'), t('chargeEnd'),
       `⚡ ${t('norm2Liters')}`, `⚡ ${t('fact2Liters')}`, t('status')],
      rows.map((w) => [
        w.number, dmy(w.date_from), L.shift[w.shift], w.garage_no, w.model,
        pick(lang, w, 'category_name'), pick(lang, w, 'zone_name'), w.driver_name,
        w.odo_start, w.odo_end ?? '', w.distance_km ?? '',
        w.hours_start, w.hours_end ?? '', w.worked_hours ?? '',
        w.flights_served ?? 0, w.cargo_ton ?? 0, w.uld_count ?? 0, w.pax_count ?? 0,
        w.fuel_start, w.fuel_issued, w.fuel_end ?? '',
        w.norm_liters, w.fact_liters ?? '', w.deviation ?? '',
        w.fuel_type2_id ? w.fuel2_start : '', w.fuel_type2_id ? w.fuel2_issued : '',
        w.fuel_type2_id ? (w.fuel2_end ?? '') : '',
        w.fuel_type2_id ? (w.norm2_liters ?? '') : '', w.fuel_type2_id ? (w.fact2_liters ?? '') : '',
        w.status,
      ])
    );
  };

  const allRows = list.data?.rows ?? [];
  const rows = group ? allRows.filter((w) => (w.group_code ?? 'road') === group) : allRows;
  const totals = rows.reduce(
    (a, w) => ({
      distance: a.distance + (w.distance_km ?? 0),
      hours: a.hours + (w.worked_hours ?? 0),
      flights: a.flights + (w.flights_served ?? 0),
      norm: a.norm + (w.norm_liters ?? 0),
      fact: a.fact + (w.fact_liters ?? 0),
      issued: a.issued + (w.fuel_issued ?? 0),
    }),
    { distance: 0, hours: 0, flights: 0, norm: 0, fact: 0, issued: 0 }
  );

  return (
    <>
      <div className="page-head">
        <span className="text-muted">{t('total')}: {list.data?.total ?? 0}</span>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={exportCsv} disabled={!rows.length}>⭳ {t('export')}</button>
        {can('waybills') && (
          <Link to="/waybills/new" className="btn btn-primary btn-sm">＋ {t('newWaybill')}</Link>
        )}
      </div>

      <div className="tabs">
        <button className={group === '' ? 'active' : ''} onClick={() => setGroup('')}>{t('all')}</button>
        {GROUPS.map((g) => {
          const n = allRows.filter((w) => (w.group_code ?? 'road') === g).length;
          if (!n) return null;
          return (
            <button key={g} className={group === g ? 'active' : ''} onClick={() => setGroup(g)}>
              {GROUP_ICON[g]} {L.group[g]} ({n})
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="filters">
          <Input label={t('from')} type="date" value={f.from} onChange={set('from')} />
          <Input label={t('to')} type="date" value={f.to} onChange={set('to')} />
          <Select label={t('vehicle')} value={f.vehicle_id} onChange={set('vehicle_id')}>
            <option value="">{t('all')}</option>
            {(vehicles.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.garage_no} · {v.plate} · {v.model}</option>
            ))}
          </Select>
          <Select label={t('driver')} value={f.driver_id} onChange={set('driver_id')}>
            <option value="">{t('all')}</option>
            {(drivers.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
          </Select>
          <Select label={t('status')} value={f.status} onChange={set('status')}>
            <option value="">{t('all')}</option>
            <option value="draft">{t('statusDraft')}</option>
            <option value="issued">{t('statusIssued')}</option>
            <option value="closed">{t('statusClosed')}</option>
          </Select>
          <Input className="grow" label={t('search')} placeholder="№, raqam, F.I.Sh." value={f.q} onChange={set('q')} />
          <button className="btn btn-sm" style={{ marginBottom: 0 }}
                  onClick={() => setF({ ...monthRange(), vehicle_id: '', driver_id: '', status: '', q: '' })}>
            {t('reset')}
          </button>
        </div>

        <div className="table-wrap">
          {list.loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>№</th>
                  <th>{t('date')}</th>
                  <th>{t('vehicle')}</th>
                  <th>{t('driver')}</th>
                  <th className="num">{t('distance')}</th>
                  <th className="num">{t('workedHours')}</th>
                  <th className="num">{t('flights')}</th>
                  <th className="num">{t('fuelIssued')}</th>
                  <th className="num">{t('normLiters')}</th>
                  <th className="num">{t('factLiters')}</th>
                  <th className="num">{t('deviation')}</th>
                  <th>{t('status')}</th>
                  <th className="num">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => (
                  <tr key={w.id} className="row-click" onClick={() => navigate(`/waybills/${w.id}`)}>
                    <td><b>№{w.number}</b><div className="text-muted" style={{ fontSize: 11 }}>{L.shift[w.shift]}</div></td>
                    <td>{dmy(w.date_from)}{w.date_to !== w.date_from && ` — ${dmy(w.date_to)}`}</td>
                    <td>
                      {GROUP_ICON[w.group_code ?? 'road']} {w.garage_no}
                      {w.plate && w.plate !== '—' ? ` · ${w.plate}` : ''}
                      <div className="text-muted" style={{ fontSize: 12 }}>{w.model}</div>
                    </td>
                    <td>{w.driver_name}</td>
                    <td className="num">{usesKm(w.norm_basis) && w.distance_km != null ? ni(w.distance_km) : '—'}</td>
                    <td className="num">{usesHours(w.norm_basis) ? nf(w.worked_hours, 1) : '—'}</td>
                    <td className="num">{w.flights_served || '—'}</td>
                    <td className="num">
                      {nf(w.fuel_issued)}
                      {w.fuel_type2_id ? <div className="volt-sub">⚡ {nf(w.fuel2_issued)}</div> : null}
                    </td>
                    <td className="num">
                      {nf(w.norm_liters)}
                      {w.fuel_type2_id ? <div className="volt-sub">⚡ {nf(w.norm2_liters ?? 0)}</div> : null}
                    </td>
                    <td className="num">
                      {w.fact_liters == null ? '—' : nf(w.fact_liters)}
                      {w.fuel_type2_id ? <div className="volt-sub">⚡ {w.fact2_liters == null ? '—' : nf(w.fact2_liters)}</div> : null}
                    </td>
                    <td className="num">
                      <Deviation value={w.deviation} />
                      {w.fuel_type2_id ? <div className="volt-sub"><Deviation value={w.deviation2} /></div> : null}
                    </td>
                    <td><StatusBadge status={w.status} /></td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Link to={`/waybills/${w.id}/print`} className="btn btn-icon btn-sm" title={t('print')}>🖨</Link>
                        {can('waybills') && w.status !== 'closed' && (
                          <button className="btn btn-icon btn-sm btn-success" title={t('closeWaybill')}
                                  onClick={() => setClosing(w)}>✓</button>
                        )}
                        {can('waybills') && w.status === 'closed' && (
                          <button className="btn btn-icon btn-sm" title={t('reopenWaybill')}
                                  onClick={() => reopen(w)}>↺</button>
                        )}
                        {can('waybills') && (
                          <button className="btn btn-icon btn-sm btn-danger" title={t('delete')}
                                  onClick={() => remove(w)}>🗑</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>{t('total')}</td>
                  <td className="num">{ni(totals.distance)}</td>
                  <td className="num">{nf(totals.hours, 1)}</td>
                  <td className="num">{ni(totals.flights)}</td>
                  <td className="num">{nf(totals.issued)}</td>
                  <td className="num">{nf(totals.norm)}</td>
                  <td className="num">{nf(totals.fact)}</td>
                  <td className="num"><Deviation value={totals.fact - totals.norm} /></td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {closing && (
        <CloseModal
          waybill={closing}
          onClose={() => setClosing(null)}
          onDone={() => { setClosing(null); list.reload(); vehicles.reload(); }}
        />
      )}
    </>
  );
}

// --------------------------- Varaqani yopish modali ---------------------------
export function CloseModal({ waybill, onClose, onDone }: {
  waybill: Waybill; onClose: () => void; onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const withKm = usesKm(waybill.norm_basis);
  const withHours = usesHours(waybill.norm_basis);

  // Operatsiyalardan yig'ilgan motosoat — hisoblagich kiritilmasa shu ishlatiladi
  const opHours = (waybill.routes ?? []).reduce((s, r) => s + (Number(r.op_hours) || 0), 0);

  // Gibrid texnikada ikkinchi manba (batareya) qoldig'i ham yopilishda kiritiladi
  const hybrid = !!waybill.fuel_type2_id;
  const unit2 = (lang === 'uz' ? waybill.unit2_uz : waybill.unit2_ru) ?? '';

  const [form, setForm] = useState({
    odo_end: String(waybill.odo_end ?? waybill.odo_start),
    hours_end: String(waybill.hours_end ?? (withHours
      ? Math.round(((waybill.hours_start ?? 0) + (opHours || waybill.engine_hours || 0)) * 10) / 10
      : '')),
    fuel_end: String(waybill.fuel_end ?? ''),
    fuel2_end: String(waybill.fuel2_end ?? ''),
    cargo_ton_km: String(waybill.cargo_ton_km ?? 0),
  });
  const [busy, setBusy] = useState(false);

  const distance = withKm ? Math.max(0, Number(form.odo_end) - waybill.odo_start) : 0;
  const hours = withHours ? Math.max(0, Number(form.hours_end || 0) - (waybill.hours_start ?? 0)) : 0;
  const winterK = waybill.winter ? 1 + waybill.winter_pct / 100 : 1;
  const norm = (
    (distance / 100) * waybill.norm_per_100km
    + hours * waybill.norm_engine_hour
    + (Number(form.cargo_ton_km || 0) / 100) * waybill.norm_per_ton_km
  ) * winterK;
  const available = waybill.fuel_start + waybill.fuel_issued;
  const fact = form.fuel_end === '' ? null : available - Number(form.fuel_end);
  const deviation = fact === null ? null : fact - norm;

  const norm2 = hybrid
    ? ((distance / 100) * (waybill.norm2_per_100km ?? 0) + hours * (waybill.norm2_engine_hour ?? 0)) * winterK
    : 0;
  const available2 = (waybill.fuel2_start ?? 0) + (waybill.fuel2_issued ?? 0);
  const fact2 = !hybrid || form.fuel2_end === '' ? null : available2 - Number(form.fuel2_end);
  const deviation2 = fact2 === null ? null : fact2 - norm2;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/waybills/${waybill.id}/close`, {
        odo_end: Number(form.odo_end),
        hours_end: withHours && form.hours_end !== '' ? Number(form.hours_end) : null,
        fuel_end: Number(form.fuel_end),
        ...(hybrid ? { fuel2_end: Number(form.fuel2_end || 0) } : {}),
        engine_hours: hours,
        cargo_ton_km: Number(form.cargo_ton_km || 0),
      });
      toast(t('saved'), 'ok');
      onDone();
    } catch (e: any) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((v) => ({ ...v, [k]: e.target.value }));

  return (
    <Modal
      title={`${t('closeWaybill')} — №${waybill.number}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-success" onClick={submit}
                  disabled={busy || form.fuel_end === '' || (hybrid && form.fuel2_end === '')}>
            ✓ {t('closeWaybill')}
          </button>
        </>
      }
    >
      <div className="text-muted" style={{ marginBottom: 14 }}>{t('closeHint')}</div>

      <div className="form-row">
        {withKm && (
          <Input label={`${t('odoEnd')} (${t('odoStart')}: ${ni(waybill.odo_start)})`} type="number" step="1"
                 value={form.odo_end} onChange={set('odo_end')} />
        )}
        {withHours && (
          <Input label={`${t('hoursEnd')} (${t('hoursStart')}: ${nf(waybill.hours_start ?? 0, 1)})`} type="number" step="0.1"
                 value={form.hours_end} onChange={set('hours_end')} />
        )}
        <Input label={`${t('fuelEnd')} (max ${nf(available)})`} type="number" step="0.01"
               value={form.fuel_end} onChange={set('fuel_end')} autoFocus />
        {hybrid && (
          <Input label={`⚡ ${t('chargeEnd')} (max ${nf(available2)}${unit2 ? ` ${unit2}` : ''})`} type="number" step="0.01"
                 value={form.fuel2_end} onChange={set('fuel2_end')} />
        )}
      </div>
      <div className="form-row">
        <Input label={t('cargoTonKm')} type="number" step="0.1" value={form.cargo_ton_km} onChange={set('cargo_ton_km')} />
      </div>

      <div className="divider" />

      <div className="grid cols-4">
        {withKm && <MiniStat label={t('distance')} value={ni(distance)} />}
        {withHours && <MiniStat label={t('workedHours')} value={nf(hours, 1)} />}
        <MiniStat label={t('normLiters')} value={nf(norm)} />
        <MiniStat label={t('factLiters')} value={fact === null ? '—' : nf(fact)} />
        <MiniStat label={t('deviation')} value={deviation === null ? '—' : `${deviation > 0 ? '+' : ''}${nf(deviation)}`}
                  tone={deviation === null ? undefined : deviation > 0.01 ? 'pos' : deviation < -0.01 ? 'neg' : undefined} />
      </div>

      {hybrid && (
        <>
          <div className="section-title">⚡ {t('hybridSource')} {unit2 ? `(${unit2})` : ''}</div>
          <div className="grid cols-3">
            <MiniStat label={t('norm2Liters')} value={nf(norm2)} />
            <MiniStat label={t('fact2Liters')} value={fact2 === null ? '—' : nf(fact2)} />
            <MiniStat label={t('deviation2')} value={deviation2 === null ? '—' : `${deviation2 > 0 ? '+' : ''}${nf(deviation2)}`}
                      tone={deviation2 === null ? undefined : deviation2 > 0.01 ? 'pos' : deviation2 < -0.01 ? 'neg' : undefined} />
          </div>
        </>
      )}
    </Modal>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={`stat-value${tone ? ' ' + tone : ''}`} style={{ fontSize: 19 }}>{value}</div>
    </div>
  );
}
