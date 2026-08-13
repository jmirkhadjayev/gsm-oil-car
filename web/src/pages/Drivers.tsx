import { useState } from 'react';
import { api, type Driver } from '../api';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { Checkbox, Empty, Input, Loading, Modal, Select, useAsync, useConfirm, useToast } from '../ui';
import { downloadCsv, dmy } from '../lib/format';
import { POSITIONS, useAirportLabels } from '../lib/airport';

export default function Drivers() {
  const { t } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const L = useAirportLabels();

  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Driver | 'new' | null>(null);
  const list = useAsync(() => api.get<Driver[]>(`/drivers${q ? `?q=${encodeURIComponent(q)}` : ''}`), [q]);

  const remove = async (d: Driver) => {
    if (!confirm(`${d.full_name} — ${t('confirmDelete')}`)) return;
    try {
      const r = await api.del<{ archived: boolean }>(`/drivers/${d.id}`);
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
          'xodimlar',
          [t('fullName'), t('tabNo'), t('position'), t('licenseNo'), t('apronPermit'), t('permitUntil'),
           t('phone'), t('driverClass'), t('status')],
          rows.map((d) => [d.full_name, d.tab_no, L.position[d.position] ?? d.position, d.license_no,
            d.apron_permit, d.permit_until ?? '', d.phone, d.class, d.active ? t('active') : t('archived')])
        )}>⭳ {t('export')}</button>
        {can('refs') && <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>＋ {t('newDriver')}</button>}
      </div>

      <div className="card">
        <div className="filters">
          <Input className="grow" label={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="table-wrap">
          {list.loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('fullName')}</th><th>{t('tabNo')}</th><th>{t('position')}</th>
                  <th>{t('licenseNo')}</th><th>{t('apronPermit')}</th>
                  <th>{t('phone')}</th><th>{t('driverClass')}</th><th>{t('status')}</th>
                  {can('refs') && <th className="num">{t('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id}>
                    <td><b>{d.full_name}</b></td>
                    <td>{d.tab_no || '—'}</td>
                    <td><span className="badge">{L.position[d.position] ?? d.position}</span></td>
                    <td className="mono">{d.license_no || '—'}</td>
                    <td className="mono">
                      {d.apron_permit || '—'}
                      {d.permit_until && <div className="text-muted" style={{ fontSize: 11 }}>{dmy(d.permit_until)}</div>}
                    </td>
                    <td>{d.phone || '—'}</td>
                    <td>{d.class || '—'}</td>
                    <td>{d.active ? <span className="badge green">{t('active')}</span> : <span className="badge">{t('archived')}</span>}</td>
                    {can('refs') && (
                      <td className="num">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-icon btn-sm" onClick={() => setEditing(d)}>✎</button>
                          <button className="btn btn-icon btn-sm btn-danger" onClick={() => remove(d)}>🗑</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <DriverModal
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); list.reload(); }}
        />
      )}
    </>
  );
}

function DriverModal({ row, onClose, onDone }: { row: Driver | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const L = useAirportLabels();
  const [form, setForm] = useState({
    full_name: row?.full_name ?? '',
    tab_no: row?.tab_no ?? '',
    license_no: row?.license_no ?? '',
    phone: row?.phone ?? '',
    class: row?.class ?? '',
    position: row?.position ?? 'driver',
    apron_permit: row?.apron_permit ?? '',
    permit_until: row?.permit_until ?? '',
    active: row ? !!row.active : true,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value as never }));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const payload = { ...form, active: form.active ? 1 : 0 };
      if (row) await api.put(`/drivers/${row.id}`, payload);
      else await api.post('/drivers', payload);
      toast(t('saved'), 'ok');
      onDone();
    } catch (e: any) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={row ? t('driver') : t('newDriver')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !form.full_name}>{t('save')}</button>
        </>
      }
    >
      <Input label={t('fullName')} value={form.full_name} onChange={set('full_name')} autoFocus />
      <div className="form-row">
        <Input label={t('tabNo')} value={form.tab_no} onChange={set('tab_no')} />
        <Select label={t('position')} value={form.position} onChange={set('position')}>
          {POSITIONS.map((p) => <option key={p} value={p}>{L.position[p]}</option>)}
        </Select>
        <Input label={t('licenseNo')} value={form.license_no} onChange={set('license_no')} />
      </div>
      <div className="form-row">
        <Input label={t('apronPermit')} value={form.apron_permit} onChange={set('apron_permit')} placeholder="AP-1042" />
        <Input label={t('permitUntil')} type="date" value={form.permit_until ?? ''} onChange={set('permit_until')} />
      </div>
      <div className="form-row">
        <Input label={t('phone')} value={form.phone} onChange={set('phone')} placeholder="+998 90 123-45-67" />
        <Input label={t('driverClass')} value={form.class} onChange={set('class')} placeholder="B, C, E" />
      </div>
      <Checkbox label={t('active')} checked={form.active} onChange={set('active')} />
    </Modal>
  );
}
