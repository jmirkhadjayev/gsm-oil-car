// Hisob-kitob mantig'i: normativ sarf va avtomobil holatini qayta hisoblash.
import { get, run, all } from './db.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Varaqa bo'yicha normativ sarf (litr):
 *   masofa/100 × norma × (1 + qish%)  +  ish_soati × norma  +  t·km/100 × norma
 */
export function normLiters(w) {
  const distance = w.odo_end == null ? 0 : Math.max(0, w.odo_end - w.odo_start);
  const winterK = w.winter ? 1 + (Number(w.winter_pct) || 0) / 100 : 1;
  return r2(
    (distance / 100) * (Number(w.norm_per_100km) || 0) * winterK +
    (Number(w.engine_hours) || 0) * (Number(w.norm_engine_hour) || 0) +
    ((Number(w.cargo_ton_km) || 0) / 100) * (Number(w.norm_per_ton_km) || 0)
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
 * Avtomobilning joriy spidometri va bak qoldig'ini butun tarixdan qayta hisoblaydi.
 * Tartibga bog'liq emas — istalgan o'zgarishdan keyin chaqirish xavfsiz.
 */
export function recalcVehicle(vehicleId) {
  const v = get('SELECT id, init_odometer, init_fuel FROM vehicles WHERE id = ?', [vehicleId]);
  if (!v) return null;

  const closed = all(
    `SELECT id, odo_start, odo_end, fuel_start, fuel_end FROM waybills
      WHERE vehicle_id = ? AND status = 'closed' AND odo_end IS NOT NULL`,
    [vehicleId]
  );
  const distance = closed.reduce((s, w) => s + Math.max(0, w.odo_end - w.odo_start), 0);

  const totalIssued = get(
    'SELECT COALESCE(SUM(liters),0) AS s FROM fuel_issues WHERE vehicle_id = ?', [vehicleId]
  ).s;
  const totalFact = closed.reduce((s, w) => {
    if (w.fuel_end == null) return s;
    return s + ((Number(w.fuel_start) || 0) + issuedFor(w.id) - Number(w.fuel_end));
  }, 0);

  const odometer = r2(Number(v.init_odometer) + distance);
  const fuel_balance = r2(Number(v.init_fuel) + Number(totalIssued) - totalFact);

  run('UPDATE vehicles SET odometer = ?, fuel_balance = ? WHERE id = ?', [odometer, fuel_balance, vehicleId]);
  return { odometer, fuel_balance };
}

/** Sana qaysi oyga tushishiga qarab qishki ustama kerakmi. */
export function isWinterDate(dateStr, winterMonths = '11,12,1,2,3') {
  const month = Number(String(dateStr).slice(5, 7));
  return winterMonths.split(',').map((s) => Number(s.trim())).includes(month) ? 1 : 0;
}

export { r2 };
