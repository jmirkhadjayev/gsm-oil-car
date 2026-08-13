import { useState } from 'react';
import { api, qs, type EquipmentCategory, type FuelType, type Vehicle, type Zone } from '../api';
import { useAuth } from '../auth';
import { pick, useI18n } from '../i18n';
import { Checkbox, Empty, Input, Loading, Modal, Select, useAsync, useConfirm, useToast } from '../ui';
import { downloadCsv, nf, ni } from '../lib/format';
import { BASES, GROUP_BADGE, GROUP_ICON, GROUPS, POWERS, useAirportLabels, usesHours, usesKm } from '../lib/airport';

export default function Vehicles() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const L = useAirportLabels();

  const [f, setF] = useState({ q: '', group: '', category_id: '', zone_id: '' });
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);

  const list = useAsync(() => api.get<Vehicle[]>(`/vehicles${qs(f)}`), [f.q, f.group, f.category_id, f.zone_id]);
  const categories = useAsync(() => api.get<EquipmentCategory[]>('/equipment-categories'), []);
  const zones = useAsync(() => api.get<Zone[]>('/zones'), []);
  const fuelTypes = useAsync(() => api.get<FuelType[]>('/fuel-types'), []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  const remove = async (v: Vehicle) => {
    if (!confirm(`${v.garage_no} · ${v.model} — ${t('confirmDelete')}`)) return;
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
          'texnika-parki',
          [t('garageNo'), t('plate'), t('model'), t('category'), t('group'), t('normBasis'), t('powerType'),
           t('fuelType'), t('tankCapacity'), t('norm100'), t('normHour'),
           t('currentOdometer'), t('currentHours'), t('tankBalance'), t('status')],
          rows.map((v) => [v.garage_no, v.plate, v.model, pick(lang, v, 'category_name'),
            L.group[v.group_code ?? 'road'], L.basis[v.norm_basis], L.power[v.power_type],
            v.fuel_code ?? '', v.tank_capacity, v.norm_per_100km, v.norm_engine_hour,
            v.odometer, v.hour_meter, v.fuel_balance, v.active ? t('active') : t('archived')])
        )}>⭳ {t('export')}</button>
        {can('refs') && <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>＋ {t('newVehicle')}</button>}
      </div>

      <div className="card">
        <div className="filters">
          <Select label={t('group')} value={f.group} onChange={set('group')}>
            <option value="">{t('all')}</option>
            {GROUPS.map((g) => <option key={g} value={g}>{GROUP_ICON[g]} {L.group[g]}</option>)}
          </Select>
          <Select label={t('category')} value={f.category_id} onChange={set('category_id')}>
            <option value="">{t('all')}</option>
            {(categories.data ?? [])
              .filter((c) => !f.group || c.group_code === f.group)
              .map((c) => <option key={c.id} value={c.id}>{pick(lang, c, 'name')}</option>)}
          </Select>
          <Select label={t('zone')} value={f.zone_id} onChange={set('zone_id')}>
            <option value="">{t('all')}</option>
            {(zones.data ?? []).map((z) => <option key={z.id} value={z.id}>{pick(lang, z, 'name')}</option>)}
          </Select>
          <Input className="grow" label={t('search')} value={f.q} onChange={set('q')}
                 placeholder={`${t('garageNo')}, ${t('plate')}, ${t('model')}`} />
          <button className="btn btn-sm" onClick={() => setF({ q: '', group: '', category_id: '', zone_id: '' })}>
            {t('reset')}
          </button>
        </div>

        <div className="table-wrap">
          {list.loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('garageNo')}</th>
                  <th>{t('model')}</th>
                  <th>{t('category')}</th>
                  <th>{t('zone')}</th>
                  <th>{t('fuelType')}</th>
                  <th className="num">{t('norm100')}</th>
                  <th className="num">{t('normHour')}</th>
                  <th className="num">{t('currentOdometer')}</th>
                  <th className="num">{t('currentHours')}</th>
                  <th className="num">{t('tankBalance')}</th>
                  <th>{t('status')}</th>
                  {can('refs') && <th className="num">{t('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const pct = v.tank_capacity > 0 ? (v.fuel_balance / v.tank_capacity) * 100 : null;
                  const g = v.group_code ?? 'road';
                  return (
                    <tr key={v.id}>
                      <td>
                        <b>{v.garage_no}</b>
                        {v.plate && v.plate !== '—' && <div className="text-muted" style={{ fontSize: 12 }}>{v.plate}</div>}
                      </td>
                      <td>
                        {v.model}
                        {v.made_year ? <div className="text-muted" style={{ fontSize: 12 }}>{v.made_year}</div> : null}
                      </td>
                      <td>
                        <span className={`badge ${GROUP_BADGE[g]}`}>{GROUP_ICON[g]} {pick(lang, v, 'category_name') || '—'}</span>
                      </td>
                      <td>{pick(lang, v, 'zone_name') || '—'}</td>
                      <td>
                        <span className="badge blue">{v.fuel_code}</span>
                        <div className="text-muted" style={{ fontSize: 12 }}>{L.power[v.power_type]}</div>
                      </td>
                      <td className="num">{usesKm(v.norm_basis) ? nf(v.norm_per_100km, 1) : '—'}</td>
                      <td className="num">{usesHours(v.norm_basis) ? nf(v.norm_engine_hour, 1) : '—'}</td>
                      <td className="num">{usesKm(v.norm_basis) ? ni(v.odometer) : '—'}</td>
                      <td className="num">{usesHours(v.norm_basis) ? ni(v.hour_meter) : '—'}</td>
                      <td className="num">
                        {nf(v.fuel_balance)}
                        {pct !== null && v.power_type !== 'electric' && (
                          <span className={`badge ${pct < 15 ? 'amber' : ''}`} style={{ marginLeft: 6 }}>{ni(pct)}%</span>
                        )}
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
          categories={categories.data ?? []}
          zones={zones.data ?? []}
          fuelTypes={fuelTypes.data ?? []}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); list.reload(); }}
        />
      )}
    </>
  );
}

function VehicleModal({ row, categories, zones, fuelTypes, onClose, onDone }: {
  row: Vehicle | null;
  categories: EquipmentCategory[];
  zones: Zone[];
  fuelTypes: FuelType[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const L = useAirportLabels();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    garage_no: row?.garage_no ?? '',
    plate: row?.plate ?? '',
    model: row?.model ?? '',
    category_id: String(row?.category_id ?? ''),
    zone_id: String(row?.zone_id ?? ''),
    norm_basis: row?.norm_basis ?? 'km',
    power_type: row?.power_type ?? 'diesel',
    serial_no: row?.serial_no ?? '',
    made_year: String(row?.made_year ?? ''),
    fuel_type_id: String(row?.fuel_type_id ?? fuelTypes[0]?.id ?? ''),
    tank_capacity: String(row?.tank_capacity ?? 0),
    norm_per_100km: String(row?.norm_per_100km ?? 0),
    winter_pct: String(row?.winter_pct ?? 10),
    norm_engine_hour: String(row?.norm_engine_hour ?? 0),
    norm_per_ton_km: String(row?.norm_per_ton_km ?? 0),
    init_odometer: String(row?.init_odometer ?? 0),
    init_hours: String(row?.init_hours ?? 0),
    init_fuel: String(row?.init_fuel ?? 0),
    active: row ? !!row.active : true,
    notes: row?.notes ?? '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value as never }));
  };

  /** Turkum tanlanganda uning tipik normalari va norma asosi ko'chiriladi. */
  const onCategory = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    const c = categories.find((x) => String(x.id) === id);
    setForm((f) => ({
      ...f,
      category_id: id,
      ...(c ? {
        norm_basis: c.norm_basis,
        norm_per_100km: String(c.default_norm_km),
        norm_engine_hour: String(c.default_norm_hour),
        power_type: c.norm_basis === 'electric' ? 'electric' : f.power_type,
      } : {}),
    }));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : null,
        zone_id: form.zone_id ? Number(form.zone_id) : null,
        made_year: form.made_year ? Number(form.made_year) : null,
        fuel_type_id: Number(form.fuel_type_id),
        tank_capacity: Number(form.tank_capacity || 0),
        norm_per_100km: Number(form.norm_per_100km || 0),
        winter_pct: Number(form.winter_pct || 0),
        norm_engine_hour: Number(form.norm_engine_hour || 0),
        norm_per_ton_km: Number(form.norm_per_ton_km || 0),
        init_odometer: Number(form.init_odometer || 0),
        init_hours: Number(form.init_hours || 0),
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

  const basis = form.norm_basis as Vehicle['norm_basis'];
  const valid = form.garage_no && form.model && form.fuel_type_id;

  return (
    <Modal
      wide
      title={row ? `${t('equipment')} — ${row.garage_no}` : t('newVehicle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !valid}>{t('save')}</button>
        </>
      }
    >
      <div className="form-row">
        <Input label={t('garageNo')} value={form.garage_no} onChange={set('garage_no')} placeholder="GSE-01" />
        <Input label={t('plate')} value={form.plate} onChange={set('plate')} placeholder="10 A 001 AP"
               hint={lang === 'uz' ? "Perron texnikasida bo'lmasligi mumkin" : 'У перронной техники может отсутствовать'} />
        <Input label={t('model')} value={form.model} onChange={set('model')} placeholder="Goldhofer AST-1X" />
      </div>

      <div className="form-row">
        <Select label={t('category')} value={form.category_id} onChange={onCategory}>
          <option value="">—</option>
          {GROUPS.map((g) => {
            const items = categories.filter((c) => c.group_code === g && (c.active || String(c.id) === form.category_id));
            if (!items.length) return null;
            return (
              <optgroup key={g} label={`${GROUP_ICON[g]} ${L.group[g]}`}>
                {items.map((c) => <option key={c.id} value={c.id}>{pick(lang, c, 'name')}</option>)}
              </optgroup>
            );
          })}
        </Select>
        <Select label={t('zone')} value={form.zone_id} onChange={set('zone_id')}>
          <option value="">—</option>
          {zones.map((z) => <option key={z.id} value={z.id}>{pick(lang, z, 'name')}</option>)}
        </Select>
      </div>

      <div className="form-row">
        <Select label={t('normBasis')} value={form.norm_basis} onChange={set('norm_basis')}>
          {BASES.map((b) => <option key={b} value={b}>{L.basis[b]}</option>)}
        </Select>
        <Select label={t('powerType')} value={form.power_type} onChange={set('power_type')}>
          {POWERS.map((p) => <option key={p} value={p}>{L.power[p]}</option>)}
        </Select>
        <Select label={t('fuelType')} value={form.fuel_type_id} onChange={set('fuel_type_id')}>
          {fuelTypes.map((ft) => <option key={ft.id} value={ft.id}>{pick(lang, ft, 'name')}</option>)}
        </Select>
        <Input label={t('tankCapacity')} type="number" step="1" value={form.tank_capacity} onChange={set('tank_capacity')} />
      </div>

      <div className="form-row">
        <Input label={t('serialNo')} value={form.serial_no} onChange={set('serial_no')} />
        <Input label={t('madeYear')} type="number" step="1" value={form.made_year} onChange={set('made_year')} />
      </div>

      <div className="section-title">{t('norm100')}</div>
      <div className="form-row">
        {usesKm(basis) && (
          <Input label={t('norm100')} type="number" step="0.1" value={form.norm_per_100km} onChange={set('norm_per_100km')} />
        )}
        {usesHours(basis) && (
          <Input label={t('normHour')} type="number" step="0.1" value={form.norm_engine_hour} onChange={set('norm_engine_hour')} />
        )}
        <Input label={t('normTonKm')} type="number" step="0.1" value={form.norm_per_ton_km} onChange={set('norm_per_ton_km')} />
        <Input label={t('winterPct')} type="number" step="1" value={form.winter_pct} onChange={set('winter_pct')} />
      </div>

      <div className="section-title">{t('initOdometer')}</div>
      <div className="form-row">
        {usesKm(basis) && (
          <Input label={t('initOdometer')} type="number" step="1" value={form.init_odometer} onChange={set('init_odometer')} />
        )}
        {usesHours(basis) && (
          <Input label={t('initHours')} type="number" step="0.1" value={form.init_hours} onChange={set('init_hours')} />
        )}
        <Input label={t('initFuel')} type="number" step="0.01" value={form.init_fuel} onChange={set('init_fuel')} />
      </div>
      <div className="hint" style={{ marginBottom: 12 }}>{t('derivedHint')}</div>

      {row && (
        <div className="grid cols-3" style={{ marginBottom: 12 }}>
          {usesKm(basis) && (
            <div>
              <div className="stat-label">{t('currentOdometer')}</div>
              <div className="stat-value" style={{ fontSize: 18 }}>{ni(row.odometer)} km</div>
            </div>
          )}
          {usesHours(basis) && (
            <div>
              <div className="stat-label">{t('currentHours')}</div>
              <div className="stat-value" style={{ fontSize: 18 }}>{nf(row.hour_meter, 1)}</div>
            </div>
          )}
          <div>
            <div className="stat-label">{t('tankBalance')}</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{nf(row.fuel_balance)}</div>
          </div>
        </div>
      )}

      <Input label={t('notes')} value={form.notes} onChange={set('notes')} />
      <Checkbox label={t('active')} checked={form.active} onChange={set('active')} />
    </Modal>
  );
}
