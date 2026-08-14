// server/calc.js ning brauzer uchun ko'chirmasi — bir xil formulalar.
import { all, get, run } from './db';

export const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Varaqaga bog'langan quyilgan yoqilg'i, manbalar bo'yicha ajratilgan:
 * ikkinchi turga teng yozuvlar batareyaga, qolgani bakka.
 */
export function issuedSplit(waybillId: number, fuelType2Id: number | null = null) {
  const row = get<{ a: number; b: number }>(
    `SELECT COALESCE(SUM(CASE WHEN ?2 IS NOT NULL AND fuel_type_id = ?2 THEN 0 ELSE liters END),0) AS a,
            COALESCE(SUM(CASE WHEN ?2 IS NOT NULL AND fuel_type_id = ?2 THEN liters ELSE 0 END),0) AS b
       FROM fuel_issues WHERE waybill_id = ?1`, [waybillId, fuelType2Id]);
  return { first: r2(row?.a), second: r2(row?.b) };
}

/** Varaqaga bog'langan quyilgan yoqilg'i (asosiy manba, litr). */
export function issuedFor(waybillId: number, fuelType2Id: number | null = null) {
  return issuedSplit(waybillId, fuelType2Id).first;
}

/** Smenada ishlangan motosoat: hisoblagich ko'rsatilgan bo'lsa u ustun turadi. */
export function workedHours(w: { hours_end?: number | null; hours_start?: number | null; engine_hours?: number }) {
  if (w.hours_end !== null && w.hours_end !== undefined) {
    return r2(Math.max(0, Number(w.hours_end) - Number(w.hours_start || 0)));
  }
  return r2(w.engine_hours);
}

/**
 * Texnikaning joriy spidometri, motosoati va bak qoldig'ini butun tarixdan qayta hisoblaydi.
 *   spidometr = init_odometer + Σ(yopilgan varaqalar masofasi)
 *   motosoat  = init_hours    + Σ(yopilgan varaqalar motosoati)
 *   qoldiq    = init_fuel     + Σ(quyilgan) − Σ(yopilgan varaqalar fakt sarfi)
 */
export function recalcVehicle(vehicleId: number) {
  const v = get<{ init_odometer: number; init_hours: number; init_fuel: number;
                  init_fuel2: number; fuel_type2_id: number | null }>(
    `SELECT init_odometer, init_hours, init_fuel, init_fuel2, fuel_type2_id
       FROM vehicles WHERE id = ?`, [vehicleId]);
  if (!v) return null;
  const ft2 = v.fuel_type2_id ?? null;

  const closed = all<any>(
    `SELECT id, odo_start, odo_end, hours_start, hours_end, engine_hours,
            fuel_start, fuel_end, fuel2_start, fuel2_end
       FROM waybills WHERE vehicle_id = ? AND status = 'closed'`, [vehicleId]);

  const distance = closed.reduce(
    (s, w) => s + (w.odo_end == null ? 0 : Math.max(0, w.odo_end - w.odo_start)), 0);
  const hours = closed.reduce((s, w) => s + workedHours(w), 0);

  const iss = get<{ a: number; b: number }>(
    `SELECT COALESCE(SUM(CASE WHEN ?2 IS NOT NULL AND fuel_type_id = ?2 THEN 0 ELSE liters END),0) AS a,
            COALESCE(SUM(CASE WHEN ?2 IS NOT NULL AND fuel_type_id = ?2 THEN liters ELSE 0 END),0) AS b
       FROM fuel_issues WHERE vehicle_id = ?1`, [vehicleId, ft2])!;

  let totalFact = 0;
  let totalFact2 = 0;
  for (const w of closed) {
    const split = issuedSplit(w.id, ft2);
    if (w.fuel_end != null) totalFact += Number(w.fuel_start) + split.first - Number(w.fuel_end);
    if (ft2 && w.fuel2_end != null) {
      totalFact2 += Number(w.fuel2_start || 0) + split.second - Number(w.fuel2_end);
    }
  }

  const odometer = r2(Number(v.init_odometer) + distance);
  const hour_meter = r2(Number(v.init_hours) + hours);
  const fuel_balance = r2(Number(v.init_fuel) + Number(iss.a) - totalFact);
  const fuel_balance2 = ft2 ? r2(Number(v.init_fuel2) + Number(iss.b) - totalFact2) : 0;
  run(`UPDATE vehicles SET odometer = ?, hour_meter = ?, fuel_balance = ?, fuel_balance2 = ?
        WHERE id = ?`, [odometer, hour_meter, fuel_balance, fuel_balance2, vehicleId]);
  return { odometer, hour_meter, fuel_balance, fuel_balance2 };
}

/** Sana qishki ustama qo'llanadigan oyga tushadimi. */
export function isWinterDate(dateStr: string, winterMonths = '11,12,1,2,3') {
  const month = Number(String(dateStr).slice(5, 7));
  return winterMonths.split(',').map((s) => Number(s.trim())).includes(month) ? 1 : 0;
}

export const today = () => new Date().toISOString().slice(0, 10);

export function monthRange(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = d.getMonth();
  return {
    from: `${y}-${pad(m + 1)}-01`,
    to: `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`,
  };
}
