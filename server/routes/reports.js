// Hisobotlar: avtomobil / haydovchi / yoqilg'i turi kesimida va oylar bo'yicha.
import express from 'express';
import { all, get } from '../db.js';
import { requireAuth } from '../auth.js';
import { h, str, monthRange } from '../util.js';

export const router = express.Router();

function period(req) {
  const def = monthRange();
  return {
    from: str(req.query.from, 'from') || def.from,
    to: str(req.query.to, 'to') || def.to,
  };
}

// Yopilgan varaqalar bo'yicha yig'indi (period ichida)
const WB_AGG = `
  SELECT vehicle_id, driver_id,
         COUNT(*)                    AS waybills,
         COALESCE(SUM(distance_km),0) AS distance_km,
         COALESCE(SUM(engine_hours),0) AS engine_hours,
         COALESCE(SUM(cargo_ton_km),0) AS cargo_ton_km,
         COALESCE(SUM(norm_liters),0)  AS norm_liters,
         COALESCE(SUM(fact_liters),0)  AS fact_liters
    FROM v_waybill_calc
   WHERE status = 'closed' AND date_from BETWEEN ? AND ?
   GROUP BY %GROUP%`;

const FUEL_AGG = `
  SELECT vehicle_id,
         COALESCE(SUM(liters),0) AS issued_liters,
         COALESCE(SUM(amount),0) AS issued_amount
    FROM fuel_issues WHERE date BETWEEN ? AND ? GROUP BY vehicle_id`;

// --------------------------- Avtomobillar kesimi ---------------------------
router.get('/vehicles', requireAuth(), h((req, res) => {
  const { from, to } = period(req);
  const rows = all(
    `SELECT v.id, v.garage_no, v.plate, v.model, v.fuel_balance, v.odometer,
            ft.code AS fuel_code, ft.name_uz AS fuel_name_uz, ft.name_ru AS fuel_name_ru,
            COALESCE(w.waybills,0)     AS waybills,
            COALESCE(w.distance_km,0)  AS distance_km,
            COALESCE(w.engine_hours,0) AS engine_hours,
            COALESCE(w.norm_liters,0)  AS norm_liters,
            COALESCE(w.fact_liters,0)  AS fact_liters,
            ROUND(COALESCE(w.fact_liters,0) - COALESCE(w.norm_liters,0), 2) AS deviation,
            COALESCE(f.issued_liters,0) AS issued_liters,
            COALESCE(f.issued_amount,0) AS issued_amount,
            CASE WHEN COALESCE(w.distance_km,0) > 0
                 THEN ROUND(COALESCE(w.fact_liters,0) / w.distance_km * 100, 2) END AS fact_per_100km
       FROM vehicles v
       JOIN fuel_types ft ON ft.id = v.fuel_type_id
       LEFT JOIN (${WB_AGG.replace('%GROUP%', 'vehicle_id')}) w ON w.vehicle_id = v.id
       LEFT JOIN (${FUEL_AGG}) f ON f.vehicle_id = v.id
      WHERE COALESCE(w.waybills,0) > 0 OR COALESCE(f.issued_liters,0) > 0 OR v.active = 1
      ORDER BY CAST(v.garage_no AS INTEGER), v.garage_no`,
    [from, to, from, to]
  );
  res.json({ from, to, rows, totals: sumRows(rows) });
}));

// --------------------------- Haydovchilar kesimi ---------------------------
router.get('/drivers', requireAuth(), h((req, res) => {
  const { from, to } = period(req);
  const rows = all(
    `SELECT d.id, d.full_name, d.tab_no,
            COALESCE(w.waybills,0)    AS waybills,
            COALESCE(w.distance_km,0) AS distance_km,
            COALESCE(w.norm_liters,0) AS norm_liters,
            COALESCE(w.fact_liters,0) AS fact_liters,
            ROUND(COALESCE(w.fact_liters,0) - COALESCE(w.norm_liters,0), 2) AS deviation
       FROM drivers d
       LEFT JOIN (${WB_AGG.replace('%GROUP%', 'driver_id')}) w ON w.driver_id = d.id
      WHERE COALESCE(w.waybills,0) > 0 OR d.active = 1
      ORDER BY d.full_name`,
    [from, to]
  );
  res.json({ from, to, rows, totals: sumRows(rows) });
}));

// ------------------------- Yoqilg'i turlari kesimi -------------------------
router.get('/fuel-types', requireAuth(), h((req, res) => {
  const { from, to } = period(req);
  const rows = all(
    `SELECT ft.id, ft.code, ft.name_uz, ft.name_ru, ft.unit_uz, ft.unit_ru,
            COUNT(fi.id)                  AS records,
            COALESCE(SUM(fi.liters),0)    AS issued_liters,
            COALESCE(SUM(fi.amount),0)    AS issued_amount,
            CASE WHEN SUM(fi.liters) > 0
                 THEN ROUND(SUM(fi.amount) / SUM(fi.liters), 2) END AS avg_price
       FROM fuel_types ft
       LEFT JOIN fuel_issues fi ON fi.fuel_type_id = ft.id AND fi.date BETWEEN ? AND ?
      GROUP BY ft.id HAVING records > 0 OR ft.active = 1
      ORDER BY issued_liters DESC, ft.id`,
    [from, to]
  );
  res.json({ from, to, rows, totals: sumRows(rows) });
}));

// ---------------------------- Oylar bo'yicha -------------------------------
router.get('/monthly', requireAuth(), h((req, res) => {
  const year = String(Number(req.query.year) || new Date().getFullYear());
  const rows = all(
    `WITH m(month) AS (VALUES ('01'),('02'),('03'),('04'),('05'),('06'),
                              ('07'),('08'),('09'),('10'),('11'),('12'))
     SELECT m.month,
            (SELECT COUNT(*) FROM waybills w
              WHERE w.status='closed' AND substr(w.date_from,1,7) = ? || '-' || m.month) AS waybills,
            (SELECT COALESCE(SUM(distance_km),0) FROM v_waybill_calc c
              WHERE c.status='closed' AND substr(c.date_from,1,7) = ? || '-' || m.month) AS distance_km,
            (SELECT COALESCE(SUM(norm_liters),0) FROM v_waybill_calc c
              WHERE c.status='closed' AND substr(c.date_from,1,7) = ? || '-' || m.month) AS norm_liters,
            (SELECT COALESCE(SUM(fact_liters),0) FROM v_waybill_calc c
              WHERE c.status='closed' AND substr(c.date_from,1,7) = ? || '-' || m.month) AS fact_liters,
            (SELECT COALESCE(SUM(liters),0) FROM fuel_issues f
              WHERE substr(f.date,1,7) = ? || '-' || m.month) AS issued_liters,
            (SELECT COALESCE(SUM(amount),0) FROM fuel_issues f
              WHERE substr(f.date,1,7) = ? || '-' || m.month) AS issued_amount
       FROM m ORDER BY m.month`,
    [year, year, year, year, year, year]
  ).map((r) => ({ ...r, deviation: Math.round((r.fact_liters - r.norm_liters) * 100) / 100 }));
  res.json({ year, rows, totals: sumRows(rows) });
}));

// ------------------------------ Bosh sahifa --------------------------------
router.get('/dashboard', requireAuth(), h((_req, res) => {
  const { from, to } = monthRange();
  const stats = get(
    `SELECT
       (SELECT COUNT(*) FROM vehicles WHERE active = 1) AS vehicles,
       (SELECT COUNT(*) FROM drivers  WHERE active = 1) AS drivers,
       (SELECT COUNT(*) FROM waybills WHERE status <> 'closed') AS open_waybills,
       (SELECT COUNT(*) FROM waybills WHERE date_from BETWEEN ? AND ?) AS month_waybills,
       (SELECT COALESCE(SUM(liters),0) FROM fuel_issues WHERE date BETWEEN ? AND ?) AS month_liters,
       (SELECT COALESCE(SUM(amount),0) FROM fuel_issues WHERE date BETWEEN ? AND ?) AS month_amount,
       (SELECT COALESCE(SUM(distance_km),0) FROM v_waybill_calc
         WHERE status='closed' AND date_from BETWEEN ? AND ?) AS month_distance,
       (SELECT COALESCE(SUM(fact_liters),0) - COALESCE(SUM(norm_liters),0) FROM v_waybill_calc
         WHERE status='closed' AND date_from BETWEEN ? AND ?) AS month_deviation`,
    [from, to, from, to, from, to, from, to, from, to]
  );

  const openWaybills = all(
    `SELECT id, number, date_from, garage_no, plate, driver_name, status
       FROM v_waybill_calc WHERE status <> 'closed'
      ORDER BY date_from DESC LIMIT 10`);

  // Bak qoldig'i past avtomobillar (sig'imning 15% dan kam)
  const lowFuel = all(
    `SELECT id, garage_no, plate, model, fuel_balance, tank_capacity,
            ROUND(fuel_balance / NULLIF(tank_capacity,0) * 100, 0) AS pct
       FROM vehicles WHERE active = 1 AND tank_capacity > 0
        AND fuel_balance < tank_capacity * 0.15
      ORDER BY pct LIMIT 10`);

  const daily = all(
    `SELECT date, COALESCE(SUM(liters),0) AS liters FROM fuel_issues
      WHERE date BETWEEN ? AND ? GROUP BY date ORDER BY date`, [from, to]);

  const topDeviation = all(
    `SELECT garage_no, plate, number, date_from,
            ROUND(fact_liters - norm_liters, 2) AS deviation
       FROM v_waybill_calc
      WHERE status='closed' AND fact_liters IS NOT NULL AND date_from BETWEEN ? AND ?
      ORDER BY ABS(fact_liters - norm_liters) DESC LIMIT 5`, [from, to]);

  res.json({ period: { from, to }, stats, openWaybills, lowFuel, daily, topDeviation });
}));

function sumRows(rows) {
  const keys = ['waybills', 'distance_km', 'engine_hours', 'norm_liters', 'fact_liters',
                'deviation', 'issued_liters', 'issued_amount', 'records'];
  const out = {};
  for (const k of keys) {
    if (rows.some((r) => r[k] !== undefined)) {
      out[k] = Math.round(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0) * 100) / 100;
    }
  }
  return out;
}
