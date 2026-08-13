// Hisob-kitob mantig'i: normativ sarf va texnika holatini qayta hisoblash.
import { get, run, all } from './db.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Smenada ishlangan motosoat: hisoblagich ko'rsatilgan bo'lsa u ustun turadi. */
export function workedHours(w) {
  if (w.hours_end !== null && w.hours_end !== undefined) {
    return r2(Math.max(0, Number(w.hours_end) - Number(w.hours_start || 0)));
  }
  return r2(w.engine_hours);
}

/**
 * Normativ sarf (litr yoki kVt·soat):
 *   ( masofa/100 × l/100km + motosoat × l/soat + t·km/100 × l/100t·km ) × (1 + qish%)
 */
export function normLiters(w) {
  const distance = w.odo_end == null ? 0 : Math.max(0, w.odo_end - w.odo_start);
  const winterK = w.winter ? 1 + (Number(w.winter_pct) || 0) / 100 : 1;
  return r2(
    (
      (distance / 100) * (Number(w.norm_per_100km) || 0) +
      workedHours(w) * (Number(w.norm_engine_hour) || 0) +
      ((Number(w.cargo_ton_km) || 0) / 100) * (Number(w.norm_per_ton_km) || 0)
    ) * winterK
  );
}

/** Varaqaga bog'langan quyilgan yoqilg'i (litr). */
export function issuedFor(waybillId) {
  const row = get('SELECT COALESCE(SUM(liters),0) AS s FROM fuel_issues WHERE waybill_id = ?', [waybillId]);
  return r2(row.s);
}

/** Haqiqiy sarf: boshlang'ich qoldiq + quyilgan − oxirgi qoldiq. */
export function factLiters(w, issued = issuedFor(w.id)) {
  if (w.fuel_end == null) return null;
  return r2((Number(w.fuel_start) || 0) + issued - Number(w.fuel_end));
}

/**
 * Texnikaning joriy spidometri, motosoati va bak qoldig'ini butun tarixdan
 * qayta hisoblaydi. Tartibga bog'liq emas — istalgan o'zgarishdan keyin
 * chaqirish xavfsiz.
 *
 *   spidometr = init_odometer + Σ(yopilgan varaqalar masofasi)
 *   motosoat  = init_hours    + Σ(yopilgan varaqalar motosoati)
 *   qoldiq    = init_fuel     + Σ(quyilgan) − Σ(yopilgan varaqalar fakt sarfi)
 */
export function recalcVehicle(vehicleId) {
  const v = get('SELECT id, init_odometer, init_hours, init_fuel FROM vehicles WHERE id = ?', [vehicleId]);
  if (!v) return null;

  const closed = all(
    `SELECT id, odo_start, odo_end, hours_start, hours_end, engine_hours, fuel_start, fuel_end
       FROM waybills WHERE vehicle_id = ? AND status = 'closed'`,
    [vehicleId]
  );

  const distance = closed.reduce(
    (s, w) => s + (w.odo_end == null ? 0 : Math.max(0, w.odo_end - w.odo_start)), 0);
  const hours = closed.reduce((s, w) => s + workedHours(w), 0);

  const totalIssued = get(
    'SELECT COALESCE(SUM(liters),0) AS s FROM fuel_issues WHERE vehicle_id = ?', [vehicleId]
  ).s;
  const totalFact = closed.reduce((s, w) => {
    if (w.fuel_end == null) return s;
    return s + ((Number(w.fuel_start) || 0) + issuedFor(w.id) - Number(w.fuel_end));
  }, 0);

  const odometer = r2(Number(v.init_odometer) + distance);
  const hour_meter = r2(Number(v.init_hours) + hours);
  const fuel_balance = r2(Number(v.init_fuel) + Number(totalIssued) - totalFact);

  run('UPDATE vehicles SET odometer = ?, hour_meter = ?, fuel_balance = ? WHERE id = ?',
      [odometer, hour_meter, fuel_balance, vehicleId]);
  return { odometer, hour_meter, fuel_balance };
}

/** Sana qaysi oyga tushishiga qarab qishki ustama kerakmi. */
export function isWinterDate(dateStr, winterMonths = '11,12,1,2,3') {
  const month = Number(String(dateStr).slice(5, 7));
  return winterMonths.split(',').map((s) => Number(s.trim())).includes(month) ? 1 : 0;
}

export { r2 };
