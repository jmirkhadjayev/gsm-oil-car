import { useEffect, useState } from 'react';
import { api, type FuelType, type Org, type Role, type User } from '../api';
import { useAuth } from '../auth';
import { pick, useI18n } from '../i18n';
import { Checkbox, Empty, Input, Loading, Modal, Select, useAsync, useToast } from '../ui';
import { ni } from '../lib/format';

export default function Settings() {
  const { t } = useI18n();
  const [tab, setTab] = useState<'org' | 'users' | 'fuel' | 'password'>('org');

  const tabs = [
    { id: 'org' as const, label: t('orgSettings') },
    { id: 'users' as const, label: t('users') },
    { id: 'fuel' as const, label: t('fuelPrices') },
    { id: 'password' as const, label: t('changePassword') },
  ];

  return (
    <>
      <div className="tabs">
        {tabs.map((tb) => (
          <button key={tb.id} className={tab === tb.id ? 'active' : ''} onClick={() => setTab(tb.id)}>{tb.label}</button>
        ))}
      </div>
      {tab === 'org' && <OrgSettings />}
      {tab === 'users' && <Users />}
      {tab === 'fuel' && <FuelPrices />}
      {tab === 'password' && <ChangePassword />}
    </>
  );
}

// ------------------------------- Tashkilot -------------------------------
function OrgSettings() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, loading } = useAsync(() => api.get<Org>('/org'), []);
  const [form, setForm] = useState<Org | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  if (loading || !form) return <Loading />;

  const set = (k: keyof Org) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...(f as Org), [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/org', form);
      toast(t('saved'), 'ok');
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div className="card-head"><h2>{t('orgSettings')}</h2></div>
      <div className="card-body">
        <Input label={t('orgName')} value={form.name} onChange={set('name')} />
        <div className="form-row">
          <Input label={t('inn')} value={form.inn} onChange={set('inn')} />
          <Input label={t('phone')} value={form.phone} onChange={set('phone')} />
        </div>
        <Input label={t('address')} value={form.address} onChange={set('address')} />
        <div className="form-row">
          <Input label={t('director')} value={form.director} onChange={set('director')} />
          <Input label={t('mechanic')} value={form.mechanic} onChange={set('mechanic')} />
        </div>
        <Input label={t('winterMonths')} value={form.winter_months} onChange={set('winter_months')}
               hint="11,12,1,2,3" />
        <button className="btn btn-primary" onClick={save} disabled={busy}>{t('save')}</button>
      </div>
    </div>
  );
}

// ---------------------------- Foydalanuvchilar ----------------------------
function Users() {
  const { t } = useI18n();
  const { user } = useAuth();
  const list = useAsync(() => api.get<User[]>('/users'), []);
  const [editing, setEditing] = useState<User | 'new' | null>(null);

  const roleLabel: Record<Role, string> = {
    admin: t('roleAdmin'), dispatcher: t('roleDispatcher'),
    operator: t('roleOperator'), viewer: t('roleViewer'),
  };

  return (
    <>
      <div className="page-head">
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>＋ {t('newUser')}</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          {list.loading ? <Loading /> : !list.data?.length ? <Empty /> : (
            <table className="tbl">
              <thead>
                <tr><th>{t('username')}</th><th>{t('fullName')}</th><th>{t('role')}</th><th>{t('status')}</th><th className="num">{t('actions')}</th></tr>
              </thead>
              <tbody>
                {list.data.map((u) => (
                  <tr key={u.id}>
                    <td><b>{u.username}</b>{u.id === user?.id && <span className="badge blue" style={{ marginLeft: 6 }}>Siz</span>}</td>
                    <td>{u.full_name}</td>
                    <td>{roleLabel[u.role]}</td>
                    <td>{u.active ? <span className="badge green">{t('active')}</span> : <span className="badge">{t('archived')}</span>}</td>
                    <td className="num">
                      <button className="btn btn-icon btn-sm" onClick={() => setEditing(u)}>✎</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <UserModal
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); list.reload(); }}
        />
      )}
    </>
  );
}

function UserModal({ row, onClose, onDone }: { row: User | null; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    username: row?.username ?? '',
    full_name: row?.full_name ?? '',
    role: (row?.role ?? 'operator') as Role,
    password: '',
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
      if (row) await api.put(`/users/${row.id}`, payload);
      else await api.post('/users', payload);
      toast(t('saved'), 'ok');
      onDone();
    } catch (e: any) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };

  const valid = form.full_name && (row || (form.username && form.password.length >= 4));

  return (
    <Modal
      title={row ? `${t('users')} — ${row.username}` : t('newUser')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !valid}>{t('save')}</button>
        </>
      }
    >
      {!row && <Input label={t('username')} value={form.username} onChange={set('username')} autoFocus />}
      <Input label={t('fullName')} value={form.full_name} onChange={set('full_name')} />
      <Select label={t('role')} value={form.role} onChange={set('role')}>
        <option value="admin">{t('roleAdmin')}</option>
        <option value="dispatcher">{t('roleDispatcher')}</option>
        <option value="operator">{t('roleOperator')}</option>
        <option value="viewer">{t('roleViewer')}</option>
      </Select>
      <Input label={t('password')} type="password" value={form.password} onChange={set('password')}
             hint={row ? t('passwordHint') : undefined} />
      <Checkbox label={t('active')} checked={form.active} onChange={set('active')} />
    </Modal>
  );
}

// --------------------------- Yoqilg'i narxlari ---------------------------
function FuelPrices() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const list = useAsync(() => api.get<FuelType[]>('/fuel-types'), []);
  const [prices, setPrices] = useState<Record<number, string>>({});

  useEffect(() => {
    if (list.data) setPrices(Object.fromEntries(list.data.map((f) => [f.id, String(f.price)])));
  }, [list.data]);

  const save = async (ft: FuelType) => {
    try {
      await api.put(`/fuel-types/${ft.id}`, { price: Number(prices[ft.id] || 0), active: ft.active });
      toast(t('saved'), 'ok');
      list.reload();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const toggle = async (ft: FuelType) => {
    try {
      await api.put(`/fuel-types/${ft.id}`, { price: Number(prices[ft.id] || 0), active: ft.active ? 0 : 1 });
      list.reload();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  if (list.loading) return <Loading />;

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div className="card-head"><h2>{t('fuelPrices')}</h2></div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>{t('fuelType')}</th><th style={{ width: 170 }} className="num">{t('price')}</th><th>{t('status')}</th><th className="num" /></tr>
          </thead>
          <tbody>
            {(list.data ?? []).map((ft) => (
              <tr key={ft.id}>
                <td><b>{pick(lang, ft, 'name')}</b> <span className="text-muted">({pick(lang, ft, 'unit')})</span></td>
                <td className="num">
                  <input type="number" step="1" className="num" value={prices[ft.id] ?? ''}
                         onChange={(e) => setPrices((p) => ({ ...p, [ft.id]: e.target.value }))} />
                </td>
                <td>
                  <button className={`badge ${ft.active ? 'green' : ''}`} style={{ cursor: 'pointer', border: 'none' }}
                          onClick={() => toggle(ft)}>
                    {ft.active ? t('active') : t('archived')}
                  </button>
                </td>
                <td className="num">
                  <button className="btn btn-sm" onClick={() => save(ft)}>{t('save')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------- Parolni almashtirish ----------------------------
function ChangePassword() {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ old_password: '', new_password: '', repeat: '' });
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/auth/password', { old_password: form.old_password, new_password: form.new_password });
      toast(t('saved'), 'ok');
      setForm({ old_password: '', new_password: '', repeat: '' });
    } catch (e: any) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  };

  const valid = form.old_password && form.new_password.length >= 4 && form.new_password === form.repeat;

  return (
    <div className="card" style={{ maxWidth: 460 }}>
      <div className="card-head"><h2>{t('changePassword')}</h2></div>
      <div className="card-body">
        <Input label={t('oldPassword')} type="password" value={form.old_password} onChange={set('old_password')} />
        <Input label={t('newPassword')} type="password" value={form.new_password} onChange={set('new_password')} />
        <Input label={`${t('newPassword')} (${t('yes')})`} type="password" value={form.repeat} onChange={set('repeat')} />
        {form.repeat && form.new_password !== form.repeat && (
          <div className="hint" style={{ color: 'var(--danger)', marginBottom: 10 }}>Parollar mos kelmadi</div>
        )}
        <button className="btn btn-primary" onClick={submit} disabled={busy || !valid}>{t('save')}</button>
      </div>
    </div>
  );
}
