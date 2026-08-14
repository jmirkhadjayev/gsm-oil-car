import { useEffect, useState } from 'react';
import { api, qs, type Driver, type FuelIssue, type FuelType, type Vehicle } from '../api';
import { useAuth } from '../auth';
import { pick, useI18n } from '../i18n';
import { Empty, Input, Loading, Modal, Select, useAsync, useConfirm, useToast } from '../ui';
import { dmy, downloadCsv, monthRange, nf, ni, todayStr } from '../lib/format';

const SOURCES = ['azs', 'ombor', 'talon', 'karta'] as const;

export default function Fuel() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [f, setF] = useState({ ...monthRange(), vehicle_id: '', fuel_type_id: '', source: '', q: '' });
  const [editing, setEditing] = useState<FuelIssue | 'new' | null>(null);

  const vehicles = useAsync(() => api.get<Vehicle[]>('/vehicles'), []);
  const fuelTypes = useAsync(() => api.get<FuelType[]>('/fuel-types'), []);
  const list = useAsync(
    () => api.get<{ rows: FuelIssue[]; totals: any }>(`/fuel${qs(f)}`),
    [f.from, f.to, f.vehicle_id, f.fuel_type_id, f.source, f.q]
  );

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const srcLabel: Record<string, string> = {
    azs: t('srcAzs'), ombor: t('srcOmbor'), talon: t('srcTalon'), karta: t('srcKarta'),
  };

  const remove = async (row: FuelIssue) => {
    if (!confirm()) return;
    try {
      await api.del(`/fuel/${row.id}`);
      toast(t('deleted'), 'ok');
      list.reload();
      vehicles.reload();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const exportCsv = () => {
    const rows = list.data?.rows ?? [];
    downloadCsv(
      `yoqilgi-${f.from}_${f.to}`,
      [t('date'), t('garageNo'), t('plate'), t('driver'), t('waybillNo'), t('fuelType'),
       t('liters'), t('price'), t('amount'), t('source'), t('station'), t('docNo')],
      rows.map((r) => [
        dmy(r.date), r.garage_no ?? '', r.plate ?? '', r.driver_name ?? '', r.waybill_number ?? '',
        r.fuel_code ?? '', r.liters, r.price, r.amount, srcLabel[r.source] ?? r.source, r.station, r.doc_no,
      ])
    );
  };

  const rows = list.data?.rows ?? [];
  const totals = list.data?.totals ?? { liters: 0, amount: 0, count: 0 };

  return (
    <>
      <div className="page-head">
        <span className="text-muted">
          {t('total')}: {ni(totals.count)} · {nf(totals.liters)} l · {ni(totals.amount)} so'm
        </span>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={exportCsv} disabled={!rows.length}>⭳ {t('export')}</button>
        {can('fuel') && (
          <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>＋ {t('newFuelIssue')}</button>
        )}
      </div>

      <div className="card">
        <div className="filters">
          <Input label={t('from')} type="date" value={f.from} onChange={set('from')} />
          <Input label={t('to')} type="date" value={f.to} onChange={set('to')} />
          <Select label={t('vehicle')} value={f.vehicle_id} onChange={set('vehicle_id')}>
            <option value="">{t('all')}</option>
            {(vehicles.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.garage_no} · {v.plate}</option>
            ))}
          </Select>
          <Select label={t('fuelType')} value={f.fuel_type_id} onChange={set('fuel_type_id')}>
            <option value="">{t('all')}</option>
            {(fuelTypes.data ?? []).map((ft) => (
              <option key={ft.id} value={ft.id}>{pick(lang, ft, 'name')}</option>
            ))}
          </Select>
          <Select label={t('source')} value={f.source} onChange={set('source')}>
            <option value="">{t('all')}</option>
            {SOURCES.map((s) => <option key={s} value={s}>{srcLabel[s]}</option>)}
          </Select>
          <Input className="grow" label={t('search')} value={f.q} onChange={set('q')} />
          <button className="btn btn-sm" onClick={() => setF({ ...monthRange(), vehicle_id: '', fuel_type_id: '', source: '', q: '' })}>
            {t('reset')}
          </button>
        </div>

        <div className="table-wrap">
          {list.loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('vehicle')}</th>
                  <th>{t('driver')}</th>
                  <th>{t('waybillNo')}</th>
                  <th>{t('fuelType')}</th>
                  <th className="num">{t('liters')}</th>
                  <th className="num">{t('price')}</th>
                  <th className="num">{t('amount')}</th>
                  <th>{t('source')}</th>
                  <th>{t('station')}</th>
                  {can('fuel') && <th className="num">{t('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{dmy(r.date)}</td>
                    <td>{r.garage_no} · {r.plate}</td>
                    <td>{r.driver_name || '—'}</td>
                    <td>{r.waybill_number ? `№${r.waybill_number}` : <span className="text-muted">{t('noWaybill')}</span>}</td>
                    <td>
                      <span className={`badge ${r.is_second ? 'volt' : 'blue'}`}>
                        {r.is_second ? '⚡ ' : ''}{r.fuel_code}
                      </span>
                    </td>
                    <td className="num">{nf(r.liters)}</td>
                    <td className="num">{ni(r.price)}</td>
                    <td className="num">{ni(r.amount)}</td>
                    <td>{srcLabel[r.source] ?? r.source}</td>
                    <td>{r.station || '—'}</td>
                    {can('fuel') && (
                      <td className="num">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-icon btn-sm" onClick={() => setEditing(r)}>✎</button>
                          <button className="btn btn-icon btn-sm btn-danger" onClick={() => remove(r)}>🗑</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>{t('total')}</td>
                  <td className="num">{nf(totals.liters)}</td>
                  <td />
                  <td className="num">{ni(totals.amount)}</td>
                  <td colSpan={can('fuel') ? 3 : 2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <FuelModal
          row={editing === 'new' ? null : editing}
          vehicles={vehicles.data ?? []}
          fuelTypes={fuelTypes.data ?? []}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); list.reload(); vehicles.reload(); }}
        />
      )}
    </>
  );
}

// ------------------------------ Quyish modali ------------------------------
function FuelModal({ row, vehicles, fuelTypes, onClose, onDone }: {
  row: FuelIssue | null;
  vehicles: Vehicle[];
  fuelTypes: FuelType[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const drivers = useAsync(() => api.get<Driver[]>('/drivers?active=1'), []);

  const [form, setForm] = useState({
    date: row?.date ?? todayStr(),
    vehicle_id: String(row?.vehicle_id ?? ''),
    driver_id: row?.driver_id ? String(row.driver_id) : '',
    waybill_id: row?.waybill_id ? String(row.waybill_id) : '',
    fuel_type_id: String(row?.fuel_type_id ?? ''),
    liters: String(row?.liters ?? ''),
    price: String(row?.price ?? ''),
    source: row?.source ?? 'azs',
    station: row?.station ?? '',
    doc_no: row?.doc_no ?? '',
    notes: row?.notes ?? '',
  });
  const [openWaybills, setOpenWaybills] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const vehicle = vehicles.find((v) => String(v.id) === form.vehicle_id);

  // Avtomobil tanlanganda: uning yoqilg'i turi, narxi va ochiq varaqalari
  useEffect(() => {
    if (!form.vehicle_id) { setOpenWaybills([]); return; }
    api.get<any[]>(`/fuel/meta/open-waybills?vehicle_id=${form.vehicle_id}`)
      .then(setOpenWaybills)
      .catch(() => setOpenWaybills([]));

    if (!row && vehicle) {
      const ft = fuelTypes.find((x) => x.id === vehicle.fuel_type_id);
      setForm((f) => ({
        ...f,
        fuel_type_id: String(vehicle.fuel_type_id),
        price: f.price || (ft?.price ? String(ft.price) : ''),
      }));
    }
  }, [form.vehicle_id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  /** Manba almashtirilsa narx ham o'sha turnikidan olinadi (zaryad narxi boshqa). */
  const onFuelType = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const ft = fuelTypes.find((x) => String(x.id) === id);
    setForm((f) => ({ ...f, fuel_type_id: id, price: ft?.price ? String(ft.price) : f.price }));
  };

  const amount = Number(form.liters || 0) * Number(form.price || 0);
  // Gibrid texnikada yozuv tanlangan turga qarab bakka yoki batareyaga tushadi
  const second = !!vehicle?.fuel_type2_id && form.fuel_type_id === String(vehicle.fuel_type2_id);
  const balance = second ? (vehicle?.fuel_balance2 ?? 0) : (vehicle?.fuel_balance ?? 0);
  const capacity = second ? (vehicle?.tank_capacity2 ?? 0) : (vehicle?.tank_capacity ?? 0);
  const newBalance = vehicle ? balance + Number(form.liters || 0) - (row?.liters ?? 0) : 0;
  const overflow = !!vehicle && capacity > 0 && newBalance > capacity;
  // Gibridda faqat shu texnikaning ikki manbasidan biri tanlanadi
  const allowedFuels = vehicle?.fuel_type2_id
    ? fuelTypes.filter((ft) => ft.id === vehicle.fuel_type_id || ft.id === vehicle.fuel_type2_id)
    : fuelTypes;
  const unitLabel = second
    ? (pick(lang, vehicle as any, 'unit2') || '')
    : (pick(lang, (vehicle ?? {}) as any, 'unit') || (lang === 'uz' ? 'l' : 'л'));

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        vehicle_id: Number(form.vehicle_id),
        driver_id: form.driver_id ? Number(form.driver_id) : null,
        waybill_id: form.waybill_id ? Number(form.waybill_id) : null,
        fuel_type_id: Number(form.fuel_type_id),
        liters: Number(form.liters),
        price: Number(form.price || 0),
      };
      if (row) await api.put(`/fuel/${row.id}`, payload);
      else await api.post('/fuel', payload);
      toast(t('saved'), 'ok');
      onDone();
    } catch (e: any) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };

  const valid = form.vehicle_id && form.fuel_type_id && Number(form.liters) > 0 && form.date;

  return (
    <Modal
      title={row ? t('fuelIssue') : t('newFuelIssue')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !valid}>{t('save')}</button>
        </>
      }
    >
      <div className="form-row">
        <Input label={t('date')} type="date" value={form.date} onChange={set('date')} />
        <Select label={t('vehicle')} value={form.vehicle_id} onChange={set('vehicle_id')}>
          <option value="">—</option>
          {vehicles.filter((v) => v.active || String(v.id) === form.vehicle_id).map((v) => (
            <option key={v.id} value={v.id}>{v.garage_no} · {v.plate} · {v.model}</option>
          ))}
        </Select>
      </div>

      <div className="form-row">
        <Select label={t('linkWaybill')} value={form.waybill_id} onChange={set('waybill_id')}>
          <option value="">{t('noWaybill')}</option>
          {openWaybills.map((w) => (
            <option key={w.id} value={w.id}>№{w.number} · {dmy(w.date_from)}</option>
          ))}
          {row?.waybill_id && !openWaybills.some((w) => w.id === row.waybill_id) && (
            <option value={row.waybill_id}>№{row.waybill_number}</option>
          )}
        </Select>
        <Select label={t('driver')} value={form.driver_id} onChange={set('driver_id')}>
          <option value="">—</option>
          {(drivers.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </Select>
      </div>

      <div className="form-row">
        <Select label={t('fuelType')} value={form.fuel_type_id} onChange={onFuelType}
                hint={vehicle?.fuel_type2_id ? t('hybridHint') : undefined}>
          <option value="">—</option>
          {allowedFuels.map((ft) => <option key={ft.id} value={ft.id}>{pick(lang, ft, 'name')}</option>)}
        </Select>
        <Input label={`${t('liters')}${unitLabel ? `, ${unitLabel}` : ''}`} type="number" step="0.01"
               value={form.liters} onChange={set('liters')} />
        <Input label={t('price')} type="number" step="1" value={form.price} onChange={set('price')} />
      </div>

      <div className="form-row">
        <Select label={t('source')} value={form.source} onChange={set('source')}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {{ azs: t('srcAzs'), ombor: t('srcOmbor'), talon: t('srcTalon'), karta: t('srcKarta') }[s]}
            </option>
          ))}
        </Select>
        <Input label={t('station')} value={form.station} onChange={set('station')} />
        <Input label={t('docNo')} value={form.doc_no} onChange={set('doc_no')} />
      </div>

      <Input label={t('notes')} value={form.notes} onChange={set('notes')} />

      <div className="divider" />
      <div className="grid cols-2">
        <div>
          <div className="stat-label">{t('amount')}</div>
          <div className="stat-value" style={{ fontSize: 19 }}>{ni(amount)} so'm</div>
        </div>
        {vehicle && (
          <div>
            <div className="stat-label">{second ? `⚡ ${t('chargeBalance')}` : t('tankBalance')}</div>
            <div className="stat-value" style={{ fontSize: 19, color: overflow ? 'var(--danger)' : undefined }}>
              {nf(newBalance)} / {ni(capacity)} {unitLabel}
            </div>
            {overflow && <div className="hint" style={{ color: 'var(--danger)' }}>⚠ Bak sig'imidan oshib ketdi</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
