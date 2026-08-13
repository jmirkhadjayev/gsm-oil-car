import { Link, useParams } from 'react-router-dom';
import { api, type Org, type Waybill } from '../api';
import { pick, useI18n } from '../i18n';
import { Empty, Loading, useAsync } from '../ui';
import { dmy, nf, ni } from '../lib/format';

export default function WaybillPrint() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const wb = useAsync(() => api.get<Waybill>(`/waybills/${id}`), [id]);
  const org = useAsync(() => api.get<Org>('/org'), []);

  if (wb.loading) return <Loading />;
  const w = wb.data;
  if (!w) return <Empty />;

  const fuelName = pick(lang, w, 'fuel_name');
  const deviation = w.fact_liters == null ? null : w.fact_liters - w.norm_liters;

  return (
    <>
      <div className="page-head no-print">
        <Link to={`/waybills/${w.id}`} className="btn btn-sm">← {t('back')}</Link>
        <div className="spacer" />
        <button className="btn btn-primary btn-sm" onClick={() => window.print()}>🖨 {t('print')}</button>
      </div>

      <div className="sheet">
        <div style={{ fontSize: 11, marginBottom: 8 }}>
          <b>{org.data?.name || t('printOrg')}</b>
          {org.data?.inn ? ` · ${t('inn')}: ${org.data.inn}` : ''}
          {org.data?.address ? ` · ${org.data.address}` : ''}
        </div>

        <h2>{t('printTitle')} № {w.number}</h2>
        <div className="sheet-sub">
          {dmy(w.date_from)}{w.date_to !== w.date_from ? ` — ${dmy(w.date_to)}` : ''}
        </div>

        <div className="cols">
          <div>
            <div className="kv"><b>{t('vehicle')}:</b><span>{w.model}</span></div>
            <div className="kv"><b>{t('plate')}:</b><span>{w.plate}</span></div>
            <div className="kv"><b>{t('garageNo')}:</b><span>{w.garage_no}</span></div>
            <div className="kv"><b>{t('fuelType')}:</b><span>{fuelName}</span></div>
          </div>
          <div>
            <div className="kv"><b>{t('driver')}:</b><span>{w.driver_name}</span></div>
            <div className="kv"><b>{t('tabNo')}:</b><span>{w.tab_no || '—'}</span></div>
            <div className="kv"><b>{t('task')}:</b><span>{w.task || '—'}</span></div>
            <div className="kv"><b>{t('status')}:</b><span>{
              w.status === 'closed' ? t('statusClosed') : w.status === 'issued' ? t('statusIssued') : t('statusDraft')
            }</span></div>
          </div>
        </div>

        {/* ------------------------- Yoqilg'i harakati ------------------------- */}
        <div style={{ fontWeight: 600, margin: '10px 0 4px' }}>{t('printFuelBlock')}</div>
        <table>
          <thead>
            <tr>
              <th>{t('fuelStart')}</th>
              <th>{t('fuelIssued')}</th>
              <th>{t('fuelEnd')}</th>
              <th>{t('odoStart')}</th>
              <th>{t('odoEnd')}</th>
              <th>{t('distance')}</th>
              <th>{t('normLiters')}</th>
              <th>{t('factLiters')}</th>
              <th>{t('deviation')}</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ textAlign: 'center' }}>
              <td>{nf(w.fuel_start)}</td>
              <td>{nf(w.fuel_issued)}</td>
              <td>{w.fuel_end == null ? '' : nf(w.fuel_end)}</td>
              <td>{ni(w.odo_start)}</td>
              <td>{w.odo_end == null ? '' : ni(w.odo_end)}</td>
              <td>{w.distance_km == null ? '' : ni(w.distance_km)}</td>
              <td>{nf(w.norm_liters)}</td>
              <td>{w.fact_liters == null ? '' : nf(w.fact_liters)}</td>
              <td>
                {deviation == null ? '' : `${deviation > 0 ? '+' : ''}${nf(deviation)}`}
                {deviation != null && Math.abs(deviation) > 0.005 &&
                  ` (${deviation > 0 ? t('overrun') : t('economy')})`}
              </td>
            </tr>
          </tbody>
        </table>

        {w.winter === 1 && (
          <div style={{ fontSize: 10, marginBottom: 8 }}>
            * {t('winter')}: +{w.winter_pct}% · {t('norm100')}: {nf(w.norm_per_100km)}
          </div>
        )}

        {/* ---------------------------- Quyishlar ---------------------------- */}
        {!!w.fuel?.length && (
          <table>
            <thead>
              <tr>
                <th>{t('date')}</th><th>{t('station')}</th><th>{t('docNo')}</th>
                <th>{t('liters')}</th><th>{t('price')}</th><th>{t('amount')}</th>
              </tr>
            </thead>
            <tbody>
              {w.fuel.map((f) => (
                <tr key={f.id} style={{ textAlign: 'center' }}>
                  <td>{dmy(f.date)}</td>
                  <td>{f.station || '—'}</td>
                  <td>{f.doc_no || '—'}</td>
                  <td>{nf(f.liters)}</td>
                  <td>{ni(f.price)}</td>
                  <td>{ni(f.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ----------------------------- Marshrut ----------------------------- */}
        <div style={{ fontWeight: 600, margin: '10px 0 4px' }}>{t('printRouteBlock')}</div>
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>№</th>
              <th>{t('pointFrom')}</th><th>{t('pointTo')}</th>
              <th style={{ width: 60 }}>{t('timeOut')}</th><th style={{ width: 60 }}>{t('timeIn')}</th>
              <th style={{ width: 70 }}>{t('distance')}</th>
              <th>{t('cargo')}</th><th style={{ width: 60 }}>{t('cargoTon')}</th>
            </tr>
          </thead>
          <tbody>
            {(w.routes?.length ? w.routes : Array.from({ length: 5 }, () => null)).map((r, i) => (
              <tr key={i} style={{ height: 20, textAlign: 'center' }}>
                <td>{i + 1}</td>
                <td style={{ textAlign: 'left' }}>{r?.point_from ?? ''}</td>
                <td style={{ textAlign: 'left' }}>{r?.point_to ?? ''}</td>
                <td>{r?.time_out ?? ''}</td>
                <td>{r?.time_in ?? ''}</td>
                <td>{r ? ni(r.distance_km) : ''}</td>
                <td style={{ textAlign: 'left' }}>{r?.cargo ?? ''}</td>
                <td>{r ? nf(r.cargo_ton) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {w.notes && <div style={{ fontSize: 11, marginTop: 6 }}><b>{t('notes')}:</b> {w.notes}</div>}

        {/* ----------------------------- Imzolar ----------------------------- */}
        <div className="signs">
          <div className="sign">
            <div className="line" />
            {t('printDriverSign')} — {w.driver_name}
          </div>
          <div className="sign">
            <div className="line" />
            {t('printMechanicSign')}{org.data?.mechanic ? ` — ${org.data.mechanic}` : ''}
          </div>
          <div className="sign">
            <div className="line" />
            {t('printDirectorSign')}{org.data?.director ? ` — ${org.data.director}` : ''}
          </div>
        </div>
      </div>
    </>
  );
}
