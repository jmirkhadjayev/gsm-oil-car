import { useState } from 'react';
import { api, qs, type EquipGroup, type NormBasis, type Position } from '../api';
import { pick, useI18n, type Key } from '../i18n';
import { Deviation, Empty, Input, Loading, useAsync } from '../ui';
import { downloadCsv, dmy, monthRange, nf, ni } from '../lib/format';
import { GROUP_ICON, useAirportLabels } from '../lib/airport';

type Tab = 'vehicles' | 'categories' | 'zones' | 'flights' | 'drivers' | 'fuel-types' | 'monthly';

export default function Reports() {
  const { t, lang } = useI18n();
  const L = useAirportLabels();
  const [tab, setTab] = useState<Tab>('vehicles');
  const [range, setRange] = useState(monthRange());
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const url = tab === 'monthly' ? `/reports/monthly?year=${year}` : `/reports/${tab}${qs(range)}`;
  const rep = useAsync(() => api.get<any>(url), [tab, range.from, range.to, year]);

  const rows: any[] = rep.data?.rows ?? [];
  const totals = rep.data?.totals ?? {};

  // Har bir hisobot uchun ustunlar ta'rifi: [sarlavha, qiymat, raqammi]
  const columns: Record<Tab, { key: Key | string; label: string; get: (r: any) => any; num?: boolean; dev?: boolean }[]> = {
    vehicles: [
      { key: 'garage', label: t('garageNo'), get: (r) => r.garage_no },
      { key: 'model', label: t('model'), get: (r) => r.model },
      { key: 'cat', label: t('category'), get: (r) => `${GROUP_ICON[(r.group_code ?? 'road') as EquipGroup]} ${pick(lang, r, 'category_name') || '—'}` },
      { key: 'fuel', label: t('fuelType'), get: (r) => r.fuel_code },
      { key: 'wb', label: t('waybillsCount'), get: (r) => ni(r.waybills), num: true },
      { key: 'dist', label: t('distance'), get: (r) => ni(r.distance_km), num: true },
      { key: 'hours', label: t('workedHours'), get: (r) => nf(r.engine_hours, 1), num: true },
      { key: 'flights', label: t('flights'), get: (r) => ni(r.flights), num: true },
      { key: 'issued', label: t('fuelIssued'), get: (r) => nf(r.issued_liters), num: true },
      { key: 'norm', label: t('normLiters'), get: (r) => nf(r.norm_liters), num: true },
      { key: 'fact', label: t('factLiters'), get: (r) => nf(r.fact_liters), num: true },
      { key: 'per100', label: t('factPer100'), get: (r) => (r.fact_per_100km == null ? '—' : nf(r.fact_per_100km)), num: true },
      { key: 'perhour', label: t('factPerHour'), get: (r) => (r.fact_per_hour == null ? '—' : nf(r.fact_per_hour)), num: true },
      { key: 'dev', label: t('deviation'), get: (r) => r.deviation, num: true, dev: true },
      { key: 'bal', label: t('tankBalance'), get: (r) => nf(r.fuel_balance), num: true },
      // Gibrid texnikaning ikkinchi manbai — litr bilan qo'shilmaydi, alohida ustunlar
      { key: 'issued2', label: `⚡ ${t('chargeIssued')}`, num: true,
        get: (r) => (r.fuel_type2_id ? nf(r.issued_energy) : '—') },
      { key: 'norm2', label: `⚡ ${t('norm2Liters')}`, num: true,
        get: (r) => (r.fuel_type2_id ? nf(r.norm2_liters) : '—') },
      { key: 'fact2', label: `⚡ ${t('fact2Liters')}`, num: true,
        get: (r) => (r.fuel_type2_id ? nf(r.fact2_liters) : '—') },
      { key: 'dev2', label: `⚡ ${t('deviation2')}`, num: true, dev: true,
        get: (r) => (r.fuel_type2_id ? r.deviation2 : null) },
      { key: 'bal2', label: `⚡ ${t('chargeBalance')}`, num: true,
        get: (r) => (r.fuel_type2_id ? nf(r.fuel_balance2) : '—') },
    ],
    categories: [
      { key: 'cat', label: t('category'), get: (r) => `${GROUP_ICON[r.group_code as EquipGroup]} ${pick(lang, r, 'name')}` },
      { key: 'group', label: t('group'), get: (r) => L.group[r.group_code as EquipGroup] },
      { key: 'basis', label: t('normBasis'), get: (r) => L.basis[r.norm_basis as NormBasis] },
      { key: 'units', label: t('units_'), get: (r) => ni(r.units), num: true },
      { key: 'wb', label: t('waybillsCount'), get: (r) => ni(r.waybills), num: true },
      { key: 'dist', label: t('distance'), get: (r) => ni(r.distance_km), num: true },
      { key: 'hours', label: t('workedHours'), get: (r) => nf(r.engine_hours, 1), num: true },
      { key: 'flights', label: t('flights'), get: (r) => ni(r.flights), num: true },
      { key: 'cargo', label: t('cargoTonShort'), get: (r) => nf(r.cargo_ton, 1), num: true },
      { key: 'norm', label: t('normLiters'), get: (r) => nf(r.norm_liters), num: true },
      { key: 'fact', label: t('factLiters'), get: (r) => nf(r.fact_liters), num: true },
      { key: 'dev', label: t('deviation'), get: (r) => r.deviation, num: true, dev: true },
    ],
    zones: [
      { key: 'zone', label: t('zone'), get: (r) => pick(lang, r, 'name') || r.zone_code },
      { key: 'units', label: t('units_'), get: (r) => ni(r.units), num: true },
      { key: 'wb', label: t('waybillsCount'), get: (r) => ni(r.waybills), num: true },
      { key: 'dist', label: t('distance'), get: (r) => ni(r.distance_km), num: true },
      { key: 'hours', label: t('workedHours'), get: (r) => nf(r.engine_hours, 1), num: true },
      { key: 'flights', label: t('flights'), get: (r) => ni(r.flights), num: true },
      { key: 'cargo', label: t('cargoTonShort'), get: (r) => nf(r.cargo_ton, 1), num: true },
      { key: 'uld', label: t('uldCount'), get: (r) => ni(r.uld_count), num: true },
      { key: 'pax', label: t('paxCount'), get: (r) => ni(r.pax_count), num: true },
      { key: 'norm', label: t('normLiters'), get: (r) => nf(r.norm_liters), num: true },
      { key: 'fact', label: t('factLiters'), get: (r) => nf(r.fact_liters), num: true },
      { key: 'dev', label: t('deviation'), get: (r) => r.deviation, num: true, dev: true },
    ],
    flights: [
      { key: 'date', label: t('date'), get: (r) => dmy(r.date) },
      { key: 'flight', label: t('flightNo'), get: (r) => r.flight_no },
      { key: 'ac', label: t('aircraftType'), get: (r) => r.aircraft_type || '—' },
      { key: 'reg', label: t('aircraftReg'), get: (r) => r.aircraft_reg || '—' },
      { key: 'stand', label: t('stand'), get: (r) => r.stand || '—' },
      { key: 'svc', label: t('serviceType'), get: (r) => pick(lang, r, 'service_name') || '—' },
      { key: 'eq', label: t('equipment'), get: (r) => `${r.garage_no} · ${r.model}` },
      { key: 'drv', label: t('driver'), get: (r) => r.driver_name },
      { key: 'tout', label: t('timeOut'), get: (r) => r.time_out || '—' },
      { key: 'tin', label: t('timeIn'), get: (r) => r.time_in || '—' },
      { key: 'cargo', label: t('cargoTonShort'), get: (r) => nf(r.cargo_ton, 1), num: true },
      { key: 'uld', label: t('uldCount'), get: (r) => ni(r.uld_count), num: true },
      { key: 'pax', label: t('paxCount'), get: (r) => ni(r.pax_count), num: true },
      { key: 'wbno', label: t('waybillNo'), get: (r) => `№${r.waybill_number}` },
    ],
    drivers: [
      { key: 'name', label: t('fullName'), get: (r) => r.full_name },
      { key: 'tab', label: t('tabNo'), get: (r) => r.tab_no || '—' },
      { key: 'pos', label: t('position'), get: (r) => L.position[r.position as Position] ?? r.position },
      { key: 'wb', label: t('waybillsCount'), get: (r) => ni(r.waybills), num: true },
      { key: 'dist', label: t('distance'), get: (r) => ni(r.distance_km), num: true },
      { key: 'hours', label: t('workedHours'), get: (r) => nf(r.engine_hours, 1), num: true },
      { key: 'flights', label: t('flights'), get: (r) => ni(r.flights), num: true },
      { key: 'norm', label: t('normLiters'), get: (r) => nf(r.norm_liters), num: true },
      { key: 'fact', label: t('factLiters'), get: (r) => nf(r.fact_liters), num: true },
      { key: 'dev', label: t('deviation'), get: (r) => r.deviation, num: true, dev: true },
    ],
    'fuel-types': [
      { key: 'name', label: t('fuelType'), get: (r) => pick(lang, r, 'name') },
      { key: 'code', label: 'Kod', get: (r) => r.code },
      { key: 'rec', label: t('records'), get: (r) => ni(r.records), num: true },
      { key: 'liters', label: t('liters'), get: (r) => nf(r.issued_liters), num: true },
      { key: 'avg', label: t('avgPrice'), get: (r) => (r.avg_price == null ? '—' : ni(r.avg_price)), num: true },
      { key: 'amount', label: t('amount'), get: (r) => ni(r.issued_amount), num: true },
    ],
    monthly: [
      { key: 'month', label: t('month'), get: (r) => monthName(r.month, lang) },
      { key: 'wb', label: t('waybillsCount'), get: (r) => ni(r.waybills), num: true },
      { key: 'dist', label: t('distance'), get: (r) => ni(r.distance_km), num: true },
      { key: 'hours', label: t('workedHours'), get: (r) => nf(r.engine_hours, 1), num: true },
      { key: 'flights', label: t('flights'), get: (r) => ni(r.flights), num: true },
      { key: 'cargo', label: t('cargoTonShort'), get: (r) => nf(r.cargo_ton, 1), num: true },
      { key: 'issued', label: t('fuelIssued'), get: (r) => nf(r.issued_liters), num: true },
      { key: 'norm', label: t('normLiters'), get: (r) => nf(r.norm_liters), num: true },
      { key: 'fact', label: t('factLiters'), get: (r) => nf(r.fact_liters), num: true },
      { key: 'dev', label: t('deviation'), get: (r) => r.deviation, num: true, dev: true },
      { key: 'amount', label: t('amount'), get: (r) => ni(r.issued_amount), num: true },
    ],
  };

  const cols = columns[tab];

  const exportCsv = () => {
    const suffix = tab === 'monthly' ? year : `${range.from}_${range.to}`;
    downloadCsv(
      `hisobot-${tab}-${suffix}`,
      cols.map((c) => c.label),
      rows.map((r) => cols.map((c) => {
        const v = c.get(r);
        return typeof v === 'number' ? v : String(v ?? '');
      }))
    );
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'vehicles', label: t('repVehicles') },
    { id: 'categories', label: t('repCategories') },
    { id: 'zones', label: t('repZones') },
    { id: 'flights', label: t('repFlights') },
    { id: 'drivers', label: t('repDrivers') },
    { id: 'fuel-types', label: t('repFuelTypes') },
    { id: 'monthly', label: t('repMonthly') },
  ];

  return (
    <>
      <div className="tabs no-print">
        {tabs.map((tb) => (
          <button key={tb.id} className={tab === tb.id ? 'active' : ''} onClick={() => setTab(tb.id)}>{tb.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="filters no-print">
          {tab === 'monthly' ? (
            <Input label={t('year')} type="number" value={year} onChange={(e) => setYear(e.target.value)} style={{ width: 120 }} />
          ) : (
            <>
              <Input label={t('from')} type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
              <Input label={t('to')} type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
              <button className="btn btn-sm" onClick={() => setRange(monthRange())}>{t('month')}</button>
            </>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-sm" onClick={exportCsv} disabled={!rows.length}>⭳ {t('export')}</button>
          <button className="btn btn-sm" onClick={() => window.print()}>🖨 {t('print')}</button>
        </div>

        <div className="table-wrap">
          {rep.loading ? <Loading /> : rows.length === 0 ? <Empty /> : (
            <table className="tbl">
              <thead>
                <tr>{cols.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {cols.map((c) => (
                      <td key={c.key} className={c.num ? 'num' : ''}>
                        {c.dev ? <Deviation value={c.get(r)} /> : c.get(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  {cols.map((c, i) => {
                    if (i === 0) return <td key={c.key}>{t('total')}</td>;
                    const map: Record<string, string> = {
                      wb: 'waybills', dist: 'distance_km', issued: 'issued_liters',
                      norm: 'norm_liters', fact: 'fact_liters', dev: 'deviation',
                      amount: 'issued_amount', rec: 'records', liters: 'issued_liters',
                      hours: 'engine_hours', flights: 'flights', cargo: 'cargo_ton',
                      uld: 'uld_count', pax: 'pax_count', units: 'units',
                      issued2: 'issued_energy', norm2: 'norm2_liters',
                      fact2: 'fact2_liters', dev2: 'deviation2',
                    };
                    const key = map[c.key as string];
                    if (!key || totals[key] === undefined) return <td key={c.key} />;
                    return (
                      <td key={c.key} className="num">
                        {c.dev ? <Deviation value={totals[key]} /> : ni(totals[key])}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function monthName(m: string, lang: 'uz' | 'ru') {
  const uz = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
  const ru = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  return (lang === 'uz' ? uz : ru)[Number(m) - 1] ?? m;
}
