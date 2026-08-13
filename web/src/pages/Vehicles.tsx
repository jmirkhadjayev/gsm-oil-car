import { useState } from 'react';
import { api, type FuelType, type Vehicle } from '../api';
import { useAuth } from '../auth';
import { pick, useI18n } from '../i18n';
import { Checkbox, Empty, Input, Loading, Modal, Select, useAsync, useConfirm, useToast } from '../ui';
import { downloadCsv, nf, ni } from '../lib/format';

export default function Vehicles() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);

  const list = useAsync(() => api.get<Vehicle[]>(`/vehicles${q ? `?q=${encodeURIComponent(q)}` : ''}`), [q]);
  const fuelTypes = useAsync(() => api.get<FuelType[]>('/fuel-types'), []);

  const remove = async (v: Vehicle) => {
    if (!confirm(`${v.garage_no} · ${v.plate} — ${t('confirmDelete')}`)) return;
    try {
      const r = await api.del<{ archived: boolean }>(`/vehicles/${v.id}`);
      toast(r.archived ? t('archived') : t('deleted'), 'ok');
      list.reload();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const rows = list.data ?? [];

  return (
    <>
      <div className="page-head">
        <span className="text-muted">{t('total')}: {rows.length}</span>
        <div className="spacer" />
        <button className="btn btn-sm" disabled={!rows.length} onClick={() => downloadCsv(
          'avtomobillar',
          [t('garageNo'), t('plate'), t('model'), t('fuelType'), t('tankCapacity'), t('norm100'),
           t('winterPct'), t('normHour'), t('currentOdometer'), t('tankBalance'), t('status')],
          rows.map((v) => [v.garage_no, v.plate, v.model, v.fuel_code ?? '', v.tank_capacity,
            v.norm_per_100km, v.winter_pct, v.norm_engine_hour, v.odometer, v.fuel_balance,
            v.active ? t('active') : t('archived')])
        )}>⭳ {t('export')}</button>
        {can('refs') && <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>＋ {t('newVehicle')}</button>}
      </div>

      <div className="card">
        <div className="filters">
          <Input className="grow" label={t('search')} value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder={`${t('garageNo')}, ${t('plate')}, ${t('model')}`} />
        </div>

        <div className="table-wrap">
          {list.loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('garageNo')}</th>
                  <th>{t('plate')}</th>
                  <th>{t('model')}</th>
                  <th>{t('fuelType')}</th>
                  <th className="num">{t('norm100')}</th>
                  <th className="num">{t('currentOdometer')}</th>
                  <th className="num">{t('tankBalance')}</th>
                  <th>{t('status')}</th>
                  {can('refs') && <th className="num">{t('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const pct = v.tank_capacity > 0 ? (v.fuel_balance / v.tank_capacity) * 100 : null;
                  return (
                    <tr key={v.id}>
                      <td><b>{v.garage_no}</b></td>
                      <td className="mono">{v.plate}</td>
                      <td>{v.model}</td>
                      <td><span className="badge blue">{v.fuel_code}</span></td>
                      <td className="num">{nf(v.norm_per_100km, 1)}{v.winter_pct > 0 && <span className="text-muted"> (+{ni(v.winter_pct)}%)</span>}</td>
                      <td className="num">{ni(v.odometer)}</td>
                      <td className="num">
                        {nf(v.fuel_balance)}
                        {pct !== null && <span className={`badge ${pct < 15 ? 'amber' : ''}`} style={{ marginLeft: 6 }}>{ni(pct)}%</span>}
                      </td>
                      <td>{v.active ? <span className="badge green">{t('active')}</span> : <span className="badge">{t('archived')}</span>}</td>
                      {can('refs') && (
                        <td className="num">
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn btn-icon btn-sm" onClick={() => setEditing(v)}>✎</button>
                            <button className="btn btn-icon btn-sm btn-danger" onClick={() => remove(v)}>🗑</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <VehicleModal
          row={editing === 'new' ? null : editing}
          fuelTypes={fuelTypes.data ?? []}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); list.reload(); }}
        />
      )}
    </>
  );
}

function VehicleModal({ row, fuelTypes, onClose, onDone }: {
  row: Vehicle | null; fuelTypes: FuelType[]; onClose: () => void; onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    garage_no: row?.garage_no ?? '',
    plate: row?.plate ?? '',
    model: row?.model ?? '',
    fuel_type_id: String(row?.fuel_type_id ?? fuelTypes[0]?.id ?? ''),
    tank_capacity: String(row?.tank_capacity ?? 0),
    norm_per_100km: String(row?.norm_per_100km ?? 0),
    winter_pct: String(row?.winter_pct ?? 10),
    norm_engine_hour: String(row?.norm_engine_hour ?? 0),
    norm_per_ton_km: String(row?.norm_per_ton_km ?? 0),
    init_odometer: String(row?.init_odometer ?? 0),
    init_fuel: String(row?.init_fuel ?? 0),
    active: row ? !!row.active : true,
    notes: row?.notes ?? '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value as never }));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        fuel_type_id: Number(form.fuel_type_id),
        tank_capacity: Number(form.tank_capacity || 0),
        norm_per_100km: Number(form.norm_per_100km || 0),
        winter_pct: Number(form.winter_pct || 0),
        norm_engine_hour: Number(form.norm_engine_hour || 0),
        norm_per_ton_km: Number(form.norm_per_ton_km || 0),
        init_odometer: Number(form.init_odometer || 0),
        init_fuel: Number(form.init_fuel || 0),
        active: form.active ? 1 : 0,
      };
      if (row) await api.put(`/vehicles/${row.id}`, payload);
      else await api.post('/vehicles', payload);
      toast(t('saved'), 'ok');
      onDone();
    } catch (e: any) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };

  const valid = form.garage_no && form.plate && form.model && form.fuel_type_id;

  return (
    <Modal
      title={row ? `${t('vehicle')} — ${row.garage_no}` : t('newVehicle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !valid}>{t('save')}</button>
        </>
      }
    >
      <div className="form-row">
        <Input label={t('garageNo')} value={form.garage_no} onChange={set('garage_no')} />
        <Input label={t('plate')} value={form.plate} onChange={set('plate')} placeholder="01 A 123 BC" />
        <Input label={t('model')} value={form.model} onChange={set('model')} />
      </div>

      <div className="form-row">
        <Select label={t('fuelType')} value={form.fuel_type_id} onChange={set('fuel_type_id')}>
          {fuelTypes.map((ft) => <option key={ft.id} value={ft.id}>{pick(lang, ft, 'name')}</option>)}
        </Select>
        <Input label={t('tankCapacity')} type="number" step="1" value={form.tank_capacity} onChange={set('tank_capacity')} />
      </div>

      <div className="section-title">{t('norm100')}</div>
      <div className="form-row">
        <Input label={t('norm100')} type="number" step="0.1" value={form.norm_per_100km} onChange={set('norm_per_100km')} />
        <Input label={t('winterPct')} type="number" step="1" value={form.winter_pct} onChange={set('winter_pct')} />
        <Input label={t('normHour')} type="number" step="0.1" value={form.norm_engine_hour} onChange={set('norm_engine_hour')} />
        <Input label={t('normTonKm')} type="number" step="0.1" value={form.norm_per_ton_km} onChange={set('norm_per_ton_km')} />
      </div>

      <div className="section-title">{t('initOdometer')}</div>
      <div className="form-row">
        <Input label={t('initOdometer')} type="number" step="1" value={form.init_odometer} onChange={set('init_odometer')} />
        <Input label={t('initFuel')} type="number" step="0.01" value={form.init_fuel} onChange={set('init_fuel')} />
      </div>
      <div className="hint" style={{ marginBottom: 12 }}>{t('derivedHint')}</div>

      {row && (
        <div className="grid cols-2" style={{ marginBottom: 12 }}>
          <div>
            <div className="stat-label">{t('currentOdometer')}</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{ni(row.odometer)} km</div>
          </div>
          <div>
            <div className="stat-label">{t('tankBalance')}</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{nf(row.fuel_balance)} l</div>
          </div>
        </div>
      )}

      <Input label={t('notes')} value={form.notes} onChange={set('notes')} />
      <Checkbox label={t('active')} checked={form.active} onChange={set('active')} />
    </Modal>
  );
}
