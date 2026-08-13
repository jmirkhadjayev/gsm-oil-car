import { useState } from 'react';
import { api, type EquipmentCategory } from '../api';
import { useAuth } from '../auth';
import { pick, useI18n } from '../i18n';
import { Checkbox, Empty, Input, Loading, Modal, Select, useAsync, useConfirm, useToast } from '../ui';
import { downloadCsv, nf } from '../lib/format';
import { BASES, GROUP_BADGE, GROUP_ICON, GROUPS, useAirportLabels, usesHours, usesKm } from '../lib/airport';

/**
 * Texnika turkumlari — aeroport yer usti xizmati texnikasi (GSE) klassifikatori
 * va har bir turkum uchun tipik yoqilg'i normalari.
 */
export default function Categories() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const L = useAirportLabels();

  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<EquipmentCategory | 'new' | null>(null);
  const list = useAsync(() => api.get<EquipmentCategory[]>('/equipment-categories'), []);

  const remove = async (c: EquipmentCategory) => {
    if (!confirm(`${pick(lang, c, 'name')} — ${t('confirmDelete')}`)) return;
    try {
      const r = await api.del<{ archived: boolean }>(`/equipment-categories/${c.id}`);
      toast(r.archived ? t('archived') : t('deleted'), 'ok');
      list.reload();
    } catch (e: any) { toast(e.message, 'err'); }
  };

  const all = list.data ?? [];
  const rows = group ? all.filter((c) => c.group_code === group) : all;

  return (
    <>
      <div className="page-head">
        <span className="text-muted">{t('total')}: {rows.length}</span>
        <div className="spacer" />
        <button className="btn btn-sm" disabled={!rows.length} onClick={() => downloadCsv(
          'texnika-turkumlari',
          [t('categoryCode'), t('category'), t('group'), t('normBasis'), t('norm100'), t('normHour'), t('units_')],
          rows.map((c) => [c.code, pick(lang, c, 'name'), L.group[c.group_code], L.basis[c.norm_basis],
            c.default_norm_km, c.default_norm_hour, c.vehicle_count ?? 0])
        )}>⭳ {t('export')}</button>
        {can('refs') && <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>＋ {t('newCategory')}</button>}
      </div>

      <div className="tabs">
        <button className={group === '' ? 'active' : ''} onClick={() => setGroup('')}>
          {t('all')} ({all.length})
        </button>
        {GROUPS.map((g) => {
          const n = all.filter((c) => c.group_code === g).length;
          if (!n) return null;
          return (
            <button key={g} className={group === g ? 'active' : ''} onClick={() => setGroup(g)}>
              {GROUP_ICON[g]} {L.group[g]} ({n})
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="table-wrap">
          {list.loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('categoryCode')}</th>
                  <th>{t('category')}</th>
                  <th>{t('group')}</th>
                  <th>{t('normBasis')}</th>
                  <th className="num">{t('norm100')}</th>
                  <th className="num">{t('normHour')}</th>
                  <th className="num">{t('units_')}</th>
                  <th>{t('status')}</th>
                  {can('refs') && <th className="num">{t('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.code}</td>
                    <td><b>{pick(lang, c, 'name')}</b></td>
                    <td><span className={`badge ${GROUP_BADGE[c.group_code]}`}>{GROUP_ICON[c.group_code]} {L.group[c.group_code]}</span></td>
                    <td>{L.basis[c.norm_basis]}</td>
                    <td className="num">{usesKm(c.norm_basis) ? nf(c.default_norm_km, 1) : '—'}</td>
                    <td className="num">{usesHours(c.norm_basis) ? nf(c.default_norm_hour, 1) : '—'}</td>
                    <td className="num">{c.vehicle_count ? <span className="badge blue">{c.vehicle_count}</span> : '—'}</td>
                    <td>{c.active ? <span className="badge green">{t('active')}</span> : <span className="badge">{t('archived')}</span>}</td>
                    {can('refs') && (
                      <td className="num">
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-icon btn-sm" onClick={() => setEditing(c)}>✎</button>
                          <button className="btn btn-icon btn-sm btn-danger" onClick={() => remove(c)}>🗑</button>
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
        <CategoryModal
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); list.reload(); }}
        />
      )}
    </>
  );
}

function CategoryModal({ row, onClose, onDone }: {
  row: EquipmentCategory | null; onClose: () => void; onDone: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const L = useAirportLabels();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    code: row?.code ?? '',
    name_uz: row?.name_uz ?? '',
    name_ru: row?.name_ru ?? '',
    group_code: row?.group_code ?? 'cargo',
    norm_basis: row?.norm_basis ?? 'hour',
    default_norm_km: String(row?.default_norm_km ?? 0),
    default_norm_hour: String(row?.default_norm_hour ?? 0),
    active: row ? !!row.active : true,
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setForm((f) => ({ ...f, [k]: value as never }));
  };

  const submit = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        default_norm_km: Number(form.default_norm_km || 0),
        default_norm_hour: Number(form.default_norm_hour || 0),
        active: form.active ? 1 : 0,
      };
      if (row) await api.put(`/equipment-categories/${row.id}`, payload);
      else await api.post('/equipment-categories', payload);
      toast(t('saved'), 'ok');
      onDone();
    } catch (e: any) {
      toast(e.message, 'err');
      setBusy(false);
    }
  };

  const basis = form.norm_basis as EquipmentCategory['norm_basis'];
  const valid = form.code && form.name_uz && form.name_ru;

  return (
    <Modal
      title={row ? `${t('category')} — ${row.code}` : t('newCategory')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('cancel')}</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !valid}>{t('save')}</button>
        </>
      }
    >
      <div className="form-row">
        <Input label={t('categoryCode')} value={form.code} onChange={set('code')} placeholder="FORKLIFT_D" disabled={!!row} />
        <Select label={t('group')} value={form.group_code} onChange={set('group_code')}>
          {GROUPS.map((g) => <option key={g} value={g}>{GROUP_ICON[g]} {L.group[g]}</option>)}
        </Select>
      </div>
      <Input label="Nomi (o'zbekcha)" value={form.name_uz} onChange={set('name_uz')} />
      <Input label="Название (по-русски)" value={form.name_ru} onChange={set('name_ru')} />

      <Select label={t('normBasis')} value={form.norm_basis} onChange={set('norm_basis')}>
        {BASES.map((b) => <option key={b} value={b}>{L.basis[b]}</option>)}
      </Select>

      <div className="section-title">{t('defaultNorms')}</div>
      <div className="form-row">
        {usesKm(basis) && (
          <Input label={t('norm100')} type="number" step="0.1" value={form.default_norm_km} onChange={set('default_norm_km')} />
        )}
        {usesHours(basis) && (
          <Input label={t('normHour')} type="number" step="0.1" value={form.default_norm_hour} onChange={set('default_norm_hour')} />
        )}
      </div>
      <div className="hint" style={{ marginBottom: 12 }}>
        {t('defaultNorms')} — {t('newVehicle').toLowerCase()} qo'shilganda avtomatik qo'yiladi.
      </div>

      <Checkbox label={t('active')} checked={form.active} onChange={set('active')} />
    </Modal>
  );
}
