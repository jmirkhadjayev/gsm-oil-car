// server/calc.js ning brauzer uchun ko'chirmasi — bir xil formulalar.
import { all, get, run } from './db';

export const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;

/** Varaqaga bog'langan quyilgan yoqilg'i (litr). */
export function issuedFor(waybillId: number) {
  return r2(get<{ s: number }>('SELECT COALESCE(SUM(liters),0) AS s FROM fuel_issues WHERE waybill_id = ?', [waybillId])?.s);
}

/**
 * Avtomobilning joriy spidometri va bak qoldig'ini butun tarixdan qayta hisoblaydi.
 *   spidometr = init_odometer + Σ(yopilgan varaqalar masofasi)
 *   qoldiq    = init_fuel     + Σ(quyilgan) − Σ(yopilgan varaqalar fakt sarfi)
 */
export function recalcVehicle(vehicleId: number) {
  const v = get<{ init_odometer: number; init_fuel: number }>(
    'SELECT init_odometer, init_fuel FROM vehicles WHERE id = ?', [vehicleId]);
  if (!v) return null;

  const closed = all<{ id: number; odo_start: number; odo_end: number; fuel_start: number; fuel_end: number | null }>(
    `SELECT id, odo_start, odo_end, fuel_start, fuel_end FROM waybills
      WHERE vehicle_id = ? AND status = 'closed' AND odo_end IS NOT NULL`, [vehicleId]);

  const distance = closed.reduce((s, w) => s + Math.max(0, w.odo_end - w.odo_start), 0);
  const totalIssued = get<{ s: number }>(
    'SELECT COALESCE(SUM(liters),0) AS s FROM fuel_issues WHERE vehicle_id = ?', [vehicleId])!.s;
  const totalFact = closed.reduce((s, w) => {
    if (w.fuel_end == null) return s;
    return s + (Number(w.fuel_start) + issuedFor(w.id) - Number(w.fuel_end));
  }, 0);

  const odometer = r2(Number(v.init_odometer) + distance);
  const fuel_balance = r2(Number(v.init_fuel) + Number(totalIssued) - totalFact);
  run('UPDATE vehicles SET odometer = ?, fuel_balance = ? WHERE id = ?', [odometer, fuel_balance, vehicleId]);
  return { odometer, fuel_balance };
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
