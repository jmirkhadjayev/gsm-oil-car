import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs, type Driver, type Vehicle, type Waybill } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Deviation, Empty, Input, Loading, Modal, Select, StatusBadge, useAsync, useConfirm, useToast } from '../ui';
import { dmy, downloadCsv, monthRange, nf, ni } from '../lib/format';

export default function Waybills() {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const [f, setF] = useState({ ...monthRange(), vehicle_id: '', driver_id: '', status: '', q: '' });
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
      ['№', t('date'), t('garageNo'), t('plate'), t('driver'), t('odoStart'), t('odoEnd'),
       t('distance'), t('fuelStart'), t('fuelIssued'), t('fuelEnd'), t('normLiters'), t('factLiters'), t('deviation'), t('status')],
      rows.map((w) => [
        w.number, dmy(w.date_from), w.garage_no, w.plate, w.driver_name,
        w.odo_start, w.odo_end ?? '', w.distance_km ?? '',
        w.fuel_start, w.fuel_issued, w.fuel_end ?? '',
        w.norm_liters, w.fact_liters ?? '', w.deviation ?? '', w.status,
      ])
    );
  };

  const rows = list.data?.rows ?? [];
  const totals = rows.reduce(
    (a, w) => ({
      distance: a.distance + (w.distance_km ?? 0),
      norm: a.norm + (w.norm_liters ?? 0),
      fact: a.fact + (w.fact_liters ?? 0),
      issued: a.issued + (w.fuel_issued ?? 0),
    }),
    { distance: 0, norm: 0, fact: 0, issued: 0 }
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
                    <td><b>№{w.number}</b></td>
                    <td>{dmy(w.date_from)}{w.date_to !== w.date_from && ` — ${dmy(w.date_to)}`}</td>
                    <td>{w.garage_no} · {w.plate}<div className="text-muted" style={{ fontSize: 12 }}>{w.model}</div></td>
                    <td>{w.driver_name}</td>
                    <td className="num">{w.distance_km == null ? '—' : ni(w.distance_km)}</td>
                    <td className="num">{nf(w.fuel_issued)}</td>
                    <td className="num">{nf(w.norm_liters)}</td>
                    <td className="num">{w.fact_liters == null ? '—' : nf(w.fact_liters)}</td>
                    <td className="num"><Deviation value={w.deviation} /></td>
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
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({
    odo_end: String(waybill.odo_end ?? waybill.odo_start),
    fuel_end: String(waybill.fuel_end ?? ''),
    engine_hours: String(waybill.engine_hours ?? 0),
    cargo_ton_km: String(waybill.cargo_ton_km ?? 0),
  });
  const [busy, setBusy] = useState(false);

  const distance = Math.max(0, Number(form.odo_end) - waybill.odo_start);
  const winterK = waybill.winter ? 1 + waybill.winter_pct / 100 : 1;
  const norm = (distance / 100) * waybill.norm_per_100km * winterK
    + Number(form.engine_hours || 0) * waybill.norm_engine_hour
    + (Number(form.cargo_ton_km || 0) / 100) * waybill.norm_per_ton_km;
  const available = waybill.fuel_start + waybill.fuel_issued;
  const fact = form.fuel_end === '' ? null : available - Number(form.fuel_end);
  const deviation = fact === null ? null : fact - norm;

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/waybills/${waybill.id}/close`, {
        odo_end: Number(form.odo_end),
        fuel_end: Number(form.fuel_end),
        engine_hours: Number(form.engine_hours || 0),
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
          <button className="btn btn-success" onClick={submit} disabled={busy || form.fuel_end === ''}>
            ✓ {t('closeWaybill')}
          </button>
        </>
      }
    >
      <div className="text-muted" style={{ marginBottom: 14 }}>{t('closeHint')}</div>

      <div className="form-row">
        <Input label={`${t('odoEnd')} (${t('odoStart')}: ${ni(waybill.odo_start)})`} type="number" step="1"
               value={form.odo_end} onChange={set('odo_end')} />
        <Input label={`${t('fuelEnd')} (max ${nf(available)})`} type="number" step="0.01"
               value={form.fuel_end} onChange={set('fuel_end')} autoFocus />
      </div>
      <div className="form-row">
        <Input label={t('engineHours')} type="number" step="0.1" value={form.engine_hours} onChange={set('engine_hours')} />
        <Input label={t('cargoTonKm')} type="number" step="0.1" value={form.cargo_ton_km} onChange={set('cargo_ton_km')} />
      </div>

      <div className="divider" />

      <div className="grid cols-4">
        <MiniStat label={t('distance')} value={`${ni(distance)}`} />
        <MiniStat label={t('normLiters')} value={nf(norm)} />
        <MiniStat label={t('factLiters')} value={fact === null ? '—' : nf(fact)} />
        <MiniStat label={t('deviation')} value={deviation === null ? '—' : `${deviation > 0 ? '+' : ''}${nf(deviation)}`}
                  tone={deviation === null ? undefined : deviation > 0.01 ? 'pos' : deviation < -0.01 ? 'neg' : undefined} />
      </div>
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
