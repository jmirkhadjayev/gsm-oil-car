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

/**
 * Ikkinchi manba (gibrid) normasi: kVt·soat.
 * Yuk normasi (t·km) faqat asosiy manbaga tegishli, shuning uchun bu yerda yo'q.
 */
export function norm2Liters(w) {
  const distance = w.odo_end == null ? 0 : Math.max(0, w.odo_end - w.odo_start);
  const winterK = w.winter ? 1 + (Number(w.winter_pct) || 0) / 100 : 1;
  return r2(
    (
      (distance / 100) * (Number(w.norm2_per_100km) || 0) +
      workedHours(w) * (Number(w.norm2_engine_hour) || 0)
    ) * winterK
  );
}

/**
 * Varaqaga bog'langan quyilgan yoqilg'i, manbalar bo'yicha ajratilgan.
 * Ikkinchi turga teng yozuvlar batareyaga, qolgani bakka tushadi.
 */
export function issuedSplit(waybillId, fuelType2Id = null) {
  const row = get(
    `SELECT COALESCE(SUM(CASE WHEN ?2 IS NOT NULL AND fuel_type_id = ?2 THEN 0 ELSE liters END),0) AS a,
            COALESCE(SUM(CASE WHEN ?2 IS NOT NULL AND fuel_type_id = ?2 THEN liters ELSE 0 END),0) AS b
       FROM fuel_issues WHERE waybill_id = ?1`,
    [waybillId, fuelType2Id]
  );
  return { first: r2(row.a), second: r2(row.b) };
}

/** Varaqaga bog'langan quyilgan yoqilg'i (asosiy manba, litr). */
export function issuedFor(waybillId, fuelType2Id = null) {
  return issuedSplit(waybillId, fuelType2Id).first;
}

/** Haqiqiy sarf: boshlang'ich qoldiq + quyilgan − oxirgi qoldiq. */
export function factLiters(w, issued = issuedFor(w.id, w.fuel_type2_id ?? null)) {
  if (w.fuel_end == null) return null;
  return r2((Number(w.fuel_start) || 0) + issued - Number(w.fuel_end));
}

/** Ikkinchi manba bo'yicha haqiqiy sarf (kVt·soat). */
export function fact2Liters(w, issued2) {
  if (w.fuel2_end == null) return null;
  const i2 = issued2 ?? issuedSplit(w.id, w.fuel_type2_id ?? null).second;
  return r2((Number(w.fuel2_start) || 0) + i2 - Number(w.fuel2_end));
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
  const v = get(
    `SELECT id, init_odometer, init_hours, init_fuel, init_fuel2, fuel_type2_id
       FROM vehicles WHERE id = ?`, [vehicleId]);
  if (!v) return null;
  const ft2 = v.fuel_type2_id ?? null;

  const closed = all(
    `SELECT id, odo_start, odo_end, hours_start, hours_end, engine_hours,
            fuel_start, fuel_end, fuel2_start, fuel2_end
       FROM waybills WHERE vehicle_id = ? AND status = 'closed'`,
    [vehicleId]
  );

  const distance = closed.reduce(
    (s, w) => s + (w.odo_end == null ? 0 : Math.max(0, w.odo_end - w.odo_start)), 0);
  const hours = closed.reduce((s, w) => s + workedHours(w), 0);

  // Quyilganlar ham manbalar bo'yicha ajratiladi.
  const iss = get(
    `SELECT COALESCE(SUM(CASE WHEN ?2 IS NOT NULL AND fuel_type_id = ?2 THEN 0 ELSE liters END),0) AS a,
            COALESCE(SUM(CASE WHEN ?2 IS NOT NULL AND fuel_type_id = ?2 THEN liters ELSE 0 END),0) AS b
       FROM fuel_issues WHERE vehicle_id = ?1`, [vehicleId, ft2]
  );

  let totalFact = 0, totalFact2 = 0;
  for (const w of closed) {
    const split = issuedSplit(w.id, ft2);
    if (w.fuel_end != null) {
      totalFact += (Number(w.fuel_start) || 0) + split.first - Number(w.fuel_end);
    }
    if (ft2 && w.fuel2_end != null) {
      totalFact2 += (Number(w.fuel2_start) || 0) + split.second - Number(w.fuel2_end);
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

/** Sana qaysi oyga tushishiga qarab qishki ustama kerakmi. */
export function isWinterDate(dateStr, winterMonths = '11,12,1,2,3') {
  const month = Number(String(dateStr).slice(5, 7));
  return winterMonths.split(',').map((s) => Number(s.trim())).includes(month) ? 1 : 0;
}

export { r2 };
